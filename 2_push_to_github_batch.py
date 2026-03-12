#!/usr/bin/env python3
"""
Script 2 (batch version): Push ALL images to GitHub in a single commit
using the Git Tree API. Much faster and keeps repo history clean.

Usage:
    pip install requests
    python 2_push_to_github_batch.py \
        --images-dir ./images_tpl \
        --token ghp_yourTokenHere \
        --repo dataforlibs/old-toronto \
        --repo-path public/archives_images \
        --mapping url_mapping.json

How it works:
    1. Reads all image files from images_tpl/images/ and images_tpl/thumbnails/
    2. Uploads each file as a blob (parallel, with progress)
    3. Creates a single Git tree with all blobs
    4. Makes ONE commit: "Add all archive images"
    5. Updates the main branch to point to that commit
    6. Saves url_mapping.json for Script 3
"""

import json
import base64
import time
import argparse
import sys
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

try:
    import requests
except ImportError:
    raise SystemExit("Please run: pip install requests")

GITHUB_API = "https://api.github.com"
print_lock = threading.Lock()


def log(msg: str):
    with print_lock:
        print(msg, flush=True)


def make_session(token: str) -> requests.Session:
    s = requests.Session()
    s.headers.update({
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    })
    return s


def get_default_branch(session, repo) -> str:
    resp = session.get(f"{GITHUB_API}/repos/{repo}")
    resp.raise_for_status()
    return resp.json()["default_branch"]


def get_latest_commit_sha(session, repo, branch) -> str:
    resp = session.get(f"{GITHUB_API}/repos/{repo}/git/ref/heads/{branch}")
    resp.raise_for_status()
    return resp.json()["object"]["sha"]


def get_base_tree_sha(session, repo, commit_sha) -> str:
    resp = session.get(f"{GITHUB_API}/repos/{repo}/git/commits/{commit_sha}")
    resp.raise_for_status()
    return resp.json()["tree"]["sha"]


def upload_blob(session, repo, file_path: Path) -> tuple[Path, str | None]:
    """Upload a single file as a Git blob. Returns (file_path, blob_sha)."""
    content = base64.b64encode(file_path.read_bytes()).decode("utf-8")
    resp = session.post(
        f"{GITHUB_API}/repos/{repo}/git/blobs",
        json={"content": content, "encoding": "base64"},
        timeout=60,
    )
    if resp.status_code == 201:
        return file_path, resp.json()["sha"]
    else:
        log(f"  [blob-error] {file_path.name}: {resp.status_code} {resp.json().get('message', '')}")
        return file_path, None


def create_tree(session, repo, base_tree_sha, tree_items) -> str:
    """Create a Git tree from a list of {path, mode, type, sha} items."""
    resp = session.post(
        f"{GITHUB_API}/repos/{repo}/git/trees",
        json={"base_tree": base_tree_sha, "tree": tree_items},
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()["sha"]


def create_commit(session, repo, message, tree_sha, parent_sha) -> str:
    resp = session.post(
        f"{GITHUB_API}/repos/{repo}/git/commits",
        json={"message": message, "tree": tree_sha, "parents": [parent_sha]},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["sha"]


def update_branch(session, repo, branch, commit_sha):
    resp = session.patch(
        f"{GITHUB_API}/repos/{repo}/git/refs/heads/{branch}",
        json={"sha": commit_sha},
        timeout=30,
    )
    resp.raise_for_status()


def main():
    parser = argparse.ArgumentParser(description="Batch-push images to GitHub in one commit.")
    parser.add_argument("--images-dir", default="./images_tpl")
    parser.add_argument("--token", required=True)
    parser.add_argument("--repo", required=True, help="e.g. dataforlibs/old-toronto")
    parser.add_argument("--repo-path", default="public/archives_images")
    parser.add_argument("--mapping", default="url_mapping.json")
    parser.add_argument("--workers", type=int, default=8, help="Parallel blob uploads (default: 8)")
    parser.add_argument("--branch", default=None, help="Branch to commit to (default: repo default branch)")
    args = parser.parse_args()

    images_dir = Path(args.images_dir)
    mapping_path = Path(args.mapping)

    session = make_session(args.token)

    # Verify auth
    me = session.get(f"{GITHUB_API}/user")
    if me.status_code != 200:
        raise SystemExit(f"GitHub auth failed: {me.json().get('message')}")
    print(f"Authenticated as: {me.json()['login']}")

    branch = args.branch or get_default_branch(session, args.repo)
    print(f"Target branch: {branch}")

    # Collect all image files
    all_files = []
    for subdir_name in ("images", "thumbnails"):
        subdir = images_dir / subdir_name
        if not subdir.exists():
            print(f"[skip] {subdir} not found")
            continue
        files = [f for f in sorted(subdir.iterdir()) if f.is_file()]
        print(f"Found {len(files)} files in {subdir}")
        all_files.extend((f, subdir_name) for f in files)

    if not all_files:
        raise SystemExit("No image files found. Check --images-dir.")

    total = len(all_files)
    print(f"\nTotal files to upload: {total}")
    print(f"Uploading blobs with {args.workers} parallel workers...\n")

    # Load existing mapping if resuming
    blob_map: dict[str, str] = {}  # filename_stem -> blob_sha
    if mapping_path.exists():
        existing = json.loads(mapping_path.read_text())
        # mapping stores final URLs; we need to re-upload blobs anyway for the tree
        # but we can track which blobs we already have
        print(f"Found existing mapping with {len(existing)} entries (will still re-upload blobs for tree).\n")

    # Step 1: Upload all files as blobs
    blob_results: dict[Path, str] = {}  # file_path -> blob_sha
    failed = []
    counter = 0

    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        future_to_file = {
            executor.submit(upload_blob, session, args.repo, f): (f, subdir_name)
            for f, subdir_name in all_files
        }
        for future in as_completed(future_to_file):
            file_path, blob_sha = future.result()
            counter += 1
            if blob_sha:
                blob_results[file_path] = blob_sha
                log(f"  [{counter}/{total}] blob ok: {file_path.name}")
            else:
                failed.append(file_path)
                log(f"  [{counter}/{total}] blob FAILED: {file_path.name}")

    if failed:
        print(f"\n⚠️  {len(failed)} blobs failed to upload:")
        for f in failed:
            print(f"  {f}")
        print("These files will be missing from the commit.")

    print(f"\nAll blobs uploaded ({len(blob_results)} succeeded). Building Git tree...")

    # Step 2: Build tree items
    tree_items = []
    url_mapping: dict[str, str] = {}

    for (file_path, subdir_name) in all_files:
        if file_path not in blob_results:
            continue
        blob_sha = blob_results[file_path]
        repo_file_path = f"{args.repo_path}/{subdir_name}/{file_path.name}"
        tree_items.append({
            "path": repo_file_path,
            "mode": "100644",
            "type": "blob",
            "sha": blob_sha,
        })
        # Build the final github.io URL (Vite strips 'public/' prefix)
        # public/archives_images/images/foo.jpg → /archives_images/images/foo.jpg
        repo_name = args.repo.split("/")[1]
        path_without_public = repo_file_path.removeprefix("public/")
        github_io_url = f"https://{args.repo.split('/')[0]}.github.io/{repo_name}/{path_without_public}"
        url_mapping[file_path.stem] = github_io_url

    print(f"Tree has {len(tree_items)} items. Creating tree on GitHub...")

    # Step 3: Get current commit + tree SHA
    latest_commit_sha = get_latest_commit_sha(session, args.repo, branch)
    base_tree_sha = get_base_tree_sha(session, args.repo, latest_commit_sha)

    # Step 4: Create the tree (may take a moment for large sets)
    new_tree_sha = create_tree(session, args.repo, base_tree_sha, tree_items)
    print(f"Tree created: {new_tree_sha}")

    # Step 5: Create commit
    commit_message = f"Add {len(tree_items)} archive images from TPL digital archive"
    new_commit_sha = create_commit(session, args.repo, commit_message, new_tree_sha, latest_commit_sha)
    print(f"Commit created: {new_commit_sha}")

    # Step 6: Update branch
    update_branch(session, args.repo, branch, new_commit_sha)
    print(f"Branch '{branch}' updated → {new_commit_sha}")

    # Step 7: Save mapping
    mapping_path.write_text(json.dumps(url_mapping, indent=2))
    print(f"\nURL mapping saved to: {mapping_path.resolve()}")
    print(f"\n✅ Done! {len(tree_items)} images pushed in a single commit.")
    print(f"Run 'npm run deploy' in your project to make them live.")


if __name__ == "__main__":
    main()
