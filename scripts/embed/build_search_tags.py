#!/usr/bin/env python3
"""무드 태그 검색용 사진 목록을 만든다 — 매일 06:00 백필이 끝난 뒤 한 번. (docs/29 §12.15, 0138)

    scripts/embed/.venv/bin/python scripts/embed/build_search_tags.py           # dry-run (장수·크기만)
    scripts/embed/.venv/bin/python scripts/embed/build_search_tags.py --apply   # search_tag_snapshot 에 저장

무드 검색은 태그 직접 일치 + SigLIP 을 섞는다. 태그 일치를 찾으려면 공개 사진 전부의 태그·앨범 글이 필요한데,
검색마다 읽으면 느리다. 여기서 하루 한 번 만들어 두고 앱은 그것만 읽는다.

담는 사진은 앱의 태그 검색(discovery.ts fetchAllSearchablePhotos)과 같다 — 공개 · 피드에서 안 내림 · 승인 작가.
앨범·작가 정보는 사진마다 되풀이하지 않고 따로 모은다(사진마다 붙이면 1.5MB).

⚠️ 목록은 이 스크립트가 돌 때만 바뀐다. 그 사이 비공개로 돌린 사진도 다음 실행까지 검색에 걸릴 수 있다.

쓰는 곳은 search_tag_snapshot 의 한 줄(id=1)뿐이다. 사진 표는 읽기만 한다.
"""

import argparse
import datetime as dt
import json
import os
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from check_db import load_env  # noqa: E402

PAGE = 1000
PHOTO_FIELDS = ("id,src_url,thumb_url,width,height,region,location_text,mood_tags,generated_tags,"
                "price_krw,album_id,photographer_id,created_at")
ALBUM_FIELDS = "id,title,description,location_text"
PHOTOGRAPHER_FIELDS = "id,display_name,regions,mood_tags"


def api(env, method, path, body=None, headers=None):
    url = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1/" + path
    key = env["SUPABASE_SERVICE_ROLE_KEY"]
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("apikey", key)
    req.add_header("Authorization", "Bearer " + key)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    with urllib.request.urlopen(req, timeout=60) as res:
        raw = res.read()
        return json.loads(raw) if raw else None


def fetch_pages(env, path):
    out = []
    while True:
        rows = api(env, "GET", f"{path}&offset={len(out)}&limit={PAGE}")
        out.extend(rows)
        if len(rows) < PAGE:
            return out


def build(photos, albums, photographers):
    """승인 작가 사진만 남기고, 쓰이는 앨범·작가만 id → 정보로 모은다. 사진은 최신순 그대로."""
    approved = {p["id"]: p for p in photographers}
    kept = [p for p in photos if p["photographer_id"] in approved]
    album_ids = {p["album_id"] for p in kept if p.get("album_id")}
    photographer_ids = {p["photographer_id"] for p in kept}
    return {
        "photos": [{k: v for k, v in p.items() if k != "created_at"} for p in kept],
        "albums": {a["id"]: {k: a[k] for k in ("title", "description", "location_text")}
                   for a in albums if a["id"] in album_ids},
        "photographers": {pid: {k: p[k] for k in ("display_name", "regions", "mood_tags")}
                          for pid, p in approved.items() if pid in photographer_ids},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="search_tag_snapshot 에 저장한다(없으면 dry-run)")
    args = parser.parse_args()

    env = load_env(".env.local")
    photos = fetch_pages(env, f"photos?select={PHOTO_FIELDS}&visibility=eq.published&feed_hidden=eq.false"
                              "&order=created_at.desc,id.asc")
    photographers = fetch_pages(env, f"photographers?select={PHOTOGRAPHER_FIELDS}&status=eq.approved&order=id")
    albums = fetch_pages(env, f"albums?select={ALBUM_FIELDS}&order=id")
    snapshot = build(photos, albums, photographers)

    size_kb = len(json.dumps(snapshot, ensure_ascii=False).encode()) / 1024
    print(f"무드 태그 검색 목록: 사진 {len(snapshot['photos'])}장 · 앨범 {len(snapshot['albums'])}개 · "
          f"작가 {len(snapshot['photographers'])}명 · {size_kb:.0f}KB")
    if not args.apply:
        print("dry-run — 저장하지 않았습니다. --apply 로 저장합니다.")
        return
    api(env, "POST", "search_tag_snapshot?on_conflict=id", {
        "id": 1, **snapshot, "photo_count": len(snapshot["photos"]), "built_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    }, {"Prefer": "resolution=merge-duplicates,return=minimal"})
    print("✅ search_tag_snapshot 저장")


if __name__ == "__main__":
    main()
