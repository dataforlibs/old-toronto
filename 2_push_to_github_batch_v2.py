#!/usr/bin/env python3
"""
Script 2 (batch v2): Push ALL images to GitHub in a single commit.
Now with proper rate-limit handling — backs off on 403s and retries.

Usage:
    python 2_push_to_github_batch_v2.py \
        --images-dir ./images_tpl \
        --token ghp_yourTokenHere \
        --repo dataforlibs/old-toronto \
        --repo-path public/archives_images \
        --mapping url_mapping.json
"""

import json
import base64
import time
import argparse
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

try:
    import requests
except ImportError:
    raise SystemExit("Please run: pip install requests")

GITHUB_API = "https://api.github.com"
print_lock = threading.Lock()
# Shared rate-limit pause flag
rate_limit_until = 0.0
rate_limit_lock = threading.Lock()


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


def wait_if_rate_limited():
    """Block the current thread until the shared rate-limit pause expires."""
    global rate_limit_until
    while True:
        now = time.time()
        with rate_limit_lock:
            wait = rate_limit_until - now
        if wait <= 0:
            break
        log(f"  [rate-limit] waiting {wait:.0f}s...")
        time.sleep(min(wait, 5))


def set_rate_limit_pause(seconds: float = 60.0):
    global rate_limit_until
    with rate_limit_lock:
        rate_limit_until = max(rate_limit_until, time.time() + seconds)


def upload_blob(session, repo, file_path: Path) -> tuple[Path, str | None]:
    """Upload a single file as a Git blob with retry on rate limits."""
    content = base64.b64encode(file_path.read_bytes()).decode("utf-8")
    max_retries = 6

    for attempt in range(1, max_retries + 1):
        wait_if_rate_limited()

        resp = session.post(
            f"{GITHUB_API}/repos/{repo}/git/blobs",
            json={"content": content, "encoding": "base64"},
            timeout=60,
        )

        if resp.status_code == 201:
            return file_path, resp.json()["sha"]

        elif resp.status_code == 403:
            msg = resp.json().get("message", "")
            if "rate limit" in msg.lower() or "secondary" in msg.lower():
                pause = 60 * attempt  # back off longer each retry
                log(f"  [rate-limit] hit on {file_path.name}, pausing {pause}s (attempt {attempt}/{max_retries})")
                set_rate_limit_pause(pause)
                continue  # retry after pause
            else:
                log(f"  [403] {file_path.name}: {msg}")
                return file_path, None

        elif resp.status_code == 422:
            # Blob already exists — GitHub returns the SHA in this case
            sha = resp.json().get("sha")
            if sha:
                return file_path, sha
            log(f"  [422] {file_path.name}: {resp.json().get('message', '')}")
            return file_path, None

        else:
            log(f"  [blob-error {resp.status_code}] {file_path.name}: {resp.json().get('message', '')}")
            if attempt < max_retries:
                time.sleep(5 * attempt)
            else:
                return file_path, None

    log(f"  [gave-up] {file_path.name} after {max_retries} attempts")
    return file_path, None


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


def create_tree(session, repo, base_tree_sha, tree_items) -> str:
    resp = session.post(
        f"{GITHUB_API}/repos/{repo}/git/trees",
        json={"base_tree": base_tree_sha, "tree": tree_items},
        timeout=300,  # large trees take time
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
    parser = argparse.ArgumentParser()
    parser.add_argument("--images-dir", default="./images_tpl")
    parser.add_argument("--token", required=True)
    parser.add_argument("--repo", required=True)
    parser.add_argument("--repo-path", default="public/archives_images")
    parser.add_argument("--mapping", default="url_mapping.json")
    parser.add_argument("--workers", type=int, default=3,
                        help="Parallel blob uploads (default: 3 — conservative to avoid rate limits)")
    parser.add_argument("--delay", type=float, default=0.3,
                        help="Seconds between each blob upload (default: 0.3)")
    parser.add_argument("--branch", default=None)
    parser.add_argument("--blobs-only", action="store_true",
                        help="Only upload blobs and save SHA cache, skip tree/commit (for resuming)")
    args = parser.parse_args()

    images_dir = Path(args.images_dir)
    mapping_path = Path(args.mapping)
    blob_cache_path = Path("blob_cache.json")

    session = make_session(args.token)

    me = session.get(f"{GITHUB_API}/user")
    if me.status_code != 200:
        raise SystemExit(f"GitHub auth failed: {me.json().get('message')}")
    print(f"Authenticated as: {me.json()['login']}")

    branch = args.branch or get_default_branch(session, args.repo)
    print(f"Target branch: {branch}")

    # Collect all image files
    all_files = []  # list of (Path, subdir_name)
    for subdir_name in ("images", "thumbnails"):
        subdir = images_dir / subdir_name
        if not subdir.exists():
            print(f"[skip] {subdir} not found")
            continue
        files = [f for f in sorted(subdir.iterdir()) if f.is_file()]
        print(f"Found {len(files)} files in {subdir}")
        all_files.extend((f, subdir_name) for f in files)

    if not all_files:
        raise SystemExit("No image files found.")

    total = len(all_files)
    print(f"\nTotal files: {total}")

    # Load blob cache (filename stem → blob SHA) for resuming interrupted runs
    blob_cache: dict[str, str] = {}
    if blob_cache_path.exists():
        blob_cache = json.loads(blob_cache_path.read_text())
        print(f"Loaded blob cache: {len(blob_cache)} previously uploaded blobs.\n")

    # Filter out already-cached blobs
    to_upload = [(f, s) for f, s in all_files if f.stem not in blob_cache]
    print(f"Blobs to upload: {len(to_upload)} (skipping {total - len(to_upload)} cached)\n")
    print(f"Using {args.workers} workers with {args.delay}s delay — conservative to avoid rate limits.\n")

    # Upload blobs
    failed = []
    counter = len(blob_cache)  # start counter where we left off

    def upload_with_delay(args_tuple):
        file_path, subdir_name = args_tuple
        time.sleep(args.delay)
        return upload_blob(session, args.repo, file_path)

    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {executor.submit(upload_with_delay, item): item for item in to_upload}
        for future in as_completed(futures):
            file_path, blob_sha = future.result()
            counter += 1
            if blob_sha:
                blob_cache[file_path.stem] = blob_sha
                log(f"  [{counter}/{total}] ok: {file_path.name}")
                # Save cache periodically (every 50 uploads)
                if counter % 50 == 0:
                    blob_cache_path.write_text(json.dumps(blob_cache, indent=2))
            else:
                failed.append(file_path)
                log(f"  [{counter}/{total}] FAILED: {file_path.name}")

    # Save final blob cache
    blob_cache_path.write_text(json.dumps(blob_cache, indent=2))

    if failed:
        print(f"\n⚠️  {len(failed)} blobs failed:")
        for f in failed[:20]:
            print(f"  {f.name}")
        if len(failed) > 20:
            print(f"  ... and {len(failed) - 20} more")
        print(f"\nRe-run the script to retry — blob cache will skip successful ones.")
        print(f"The commit will be made with {len(blob_cache)} blobs that succeeded.")

    if args.blobs_only:
        print("\n--blobs-only mode: skipping tree/commit creation.")
        return

    print(f"\nAll blobs done ({len(blob_cache)} total). Building Git tree...")

    # Build tree items and URL mapping
    tree_items = []
    url_mapping: dict[str, str] = {}
    username = args.repo.split("/")[0]
    repo_name = args.repo.split("/")[1]

    for (file_path, subdir_name) in all_files:
        blob_sha = blob_cache.get(file_path.stem)
        if not blob_sha:
            continue  # skip failed blobs
        repo_file_path = f"{args.repo_path}/{subdir_name}/{file_path.name}"
        tree_items.append({
            "path": repo_file_path,
            "mode": "100644",
            "type": "blob",
            "sha": blob_sha,
        })
        # github.io URL (Vite strips 'public/' prefix at build time)
        path_without_public = repo_file_path.removeprefix("public/")
        github_io_url = f"https://{username}.github.io/{repo_name}/{path_without_public}"
        url_mapping[file_path.stem] = github_io_url

    print(f"Tree has {len(tree_items)} items. Creating tree on GitHub (may take 30-60s)...")

    latest_commit_sha = get_latest_commit_sha(session, args.repo, branch)
    base_tree_sha = get_base_tree_sha(session, args.repo, latest_commit_sha)
    new_tree_sha = create_tree(session, args.repo, base_tree_sha, tree_items)
    print(f"Tree created: {new_tree_sha}")

    commit_msg = f"Add {len(tree_items)} archive images from TPL digital archive"
    new_commit_sha = create_commit(session, args.repo, commit_msg, new_tree_sha, latest_commit_sha)
    print(f"Commit created: {new_commit_sha}")

    update_branch(session, args.repo, branch, new_commit_sha)
    print(f"Branch '{branch}' updated ✓")

    mapping_path.write_text(json.dumps(url_mapping, indent=2))
    print(f"\nURL mapping saved to: {mapping_path.resolve()}")
    print(f"\n✅ Done! {len(tree_items)} images in one commit.")
    print(f"Run 'npm run deploy' to make them live on github.io.")


if __name__ == "__main__":
    main()
