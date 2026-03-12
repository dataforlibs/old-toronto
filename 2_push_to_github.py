#!/usr/bin/env python3
"""
Script 2: Push downloaded images to a GitHub repository using the GitHub API.
Uploads files to a specified path inside your repo and records the resulting
raw.githubusercontent.com URLs in a mapping file for Script 3.

Usage:
    python 2_push_to_github.py \
        --images-dir ./downloaded_images \
        --token ghp_yourPersonalAccessToken \
        --repo YOUR_USERNAME/old-toronto \
        --repo-path public/archives_images \
        --mapping url_mapping.json

Requirements:
    pip install requests

Generate a token at: https://github.com/settings/tokens
  - Scopes needed: repo (full control of private repositories)
    OR public_repo if your repo is public
"""

import json
import base64
import time
import argparse
from pathlib import Path

try:
    import requests
except ImportError:
    raise SystemExit("Please run: pip install requests")

GITHUB_API = "https://api.github.com"


def get_file_sha(session: requests.Session, repo: str, path: str) -> str | None:
    """Get the SHA of an existing file (needed to update/overwrite it)."""
    resp = session.get(f"{GITHUB_API}/repos/{repo}/contents/{path}")
    if resp.status_code == 200:
        return resp.json().get("sha")
    return None


def upload_file(session: requests.Session, repo: str, repo_path: str, local_path: Path) -> str | None:
    """
    Upload a single file to GitHub. Returns the raw URL on success, None on failure.
    """
    content = base64.b64encode(local_path.read_bytes()).decode("utf-8")
    remote_path = f"{repo_path}/{local_path.name}"
    url = f"{GITHUB_API}/repos/{repo}/contents/{remote_path}"

    sha = get_file_sha(session, repo, remote_path)

    payload = {
        "message": f"Add archive image: {local_path.name}",
        "content": content,
    }
    if sha:
        payload["sha"] = sha  # required for updates

    resp = session.put(url, json=payload)

    if resp.status_code in (200, 201):
        # Build the raw URL
        branch = resp.json()["content"].get("download_url", "")
        # download_url is the raw URL — use it directly
        raw_url = branch
        return raw_url
    else:
        print(f"  [error] {resp.status_code}: {resp.json().get('message', resp.text)}")
        return None


def main():
    parser = argparse.ArgumentParser(description="Push images to GitHub and record URL mapping.")
    parser.add_argument("--images-dir", default="./downloaded_images", help="Directory from Script 1")
    parser.add_argument("--token", required=True, help="GitHub personal access token")
    parser.add_argument("--repo", required=True, help="GitHub repo in format USERNAME/REPONAME")
    parser.add_argument("--repo-path", default="public/archives_images",
                        help="Path inside the repo to upload images to")
    parser.add_argument("--mapping", default="url_mapping.json",
                        help="Output JSON file mapping old URLs → new GitHub raw URLs")
    parser.add_argument("--delay", type=float, default=0.5,
                        help="Seconds to wait between API calls (default: 0.5)")
    args = parser.parse_args()

    images_dir = Path(args.images_dir)
    mapping_path = Path(args.mapping)

    # Load existing mapping if resuming
    mapping: dict[str, str] = {}
    if mapping_path.exists():
        with open(mapping_path, "r") as f:
            mapping = json.load(f)
        print(f"Resuming — loaded {len(mapping)} existing URL mappings.\n")

    session = requests.Session()
    session.headers.update({
        "Authorization": f"token {args.token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    })

    # Verify auth
    me = session.get(f"{GITHUB_API}/user")
    if me.status_code != 200:
        raise SystemExit(f"GitHub auth failed: {me.json().get('message')}")
    print(f"Authenticated as: {me.json()['login']}\n")

    # Find all image files
    subdirs = {
        "images": images_dir / "images",
        "thumbnails": images_dir / "thumbnails",
    }

    for subdir_name, subdir_path in subdirs.items():
        if not subdir_path.exists():
            print(f"[skip] Directory not found: {subdir_path}")
            continue

        files = sorted(subdir_path.iterdir())
        print(f"\nUploading {len(files)} files from {subdir_path} → {args.repo}/{args.repo_path}/{subdir_name}")

        for i, file_path in enumerate(files, 1):
            if not file_path.is_file():
                continue

            print(f"  [{i}/{len(files)}] {file_path.name}")
            new_url = upload_file(
                session,
                args.repo,
                f"{args.repo_path}/{subdir_name}",
                file_path,
            )

            if new_url:
                # We need to reverse-map from new URL back to the original TPL URL.
                # We'll store by filename (asset_id) and reconstruct in Script 3.
                mapping[file_path.stem] = new_url
                print(f"        → {new_url}")

                # Save mapping after every file (safe to interrupt)
                with open(mapping_path, "w") as f:
                    json.dump(mapping, f, indent=2)

            time.sleep(args.delay)

    print(f"\nDone. {len(mapping)} URLs saved to {mapping_path.resolve()}")


if __name__ == "__main__":
    main()
