#!/usr/bin/env python3
"""평가용 표본 다운로드 — 공개 사진의 thumb 을 로컬에 받는다. (docs/22 §7.1)

DB 는 읽기만 하고, 이미지는 Storage 에서 내려받기만 한다. 재실행하면 이미 받은
파일은 건너뛴다.

    scripts/embed/.venv/bin/python scripts/embed/fetch_sample.py            # 300장
    scripts/embed/.venv/bin/python scripts/embed/fetch_sample.py --limit 50

표본은 최신 N장이 아니라 **전체 공개 사진에 고르게 퍼지도록** 등간격으로 뽑는다.
최신순 앞부분만 받으면 최근 등록 작가 몇 명에 쏠려 평가가 왜곡된다.

산출물 (.gitignore 제외 대상):
    scripts/embed/sample/meta.json   사진 메타 목록
    scripts/embed/sample/<id>.jpg    thumb 이미지
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from check_db import load_env, rest  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
SAMPLE_DIR = os.path.join(HERE, "sample")
POOL_LIMIT = 1000  # PostgREST 기본 응답 상한
FIELDS = "id,width,height,mood_tags,album_id,photographer_id,thumb_url"
RETRIES = 3


def download(url):
    """thumb 1장 다운로드. 실패 시 재시도하고, 끝내 실패하면 사유를 돌려준다.

    OSError 로 잡는 이유: urllib.error.URLError/HTTPError 와 TimeoutError 가
    모두 OSError 하위다. URLError 만 잡으면 느린 회선에서 나는 읽기 타임아웃이
    그대로 터져 배치 전체가 죽는다.
    """
    for attempt in range(1, RETRIES + 1):
        try:
            return urllib.request.urlopen(url, timeout=60).read(), None
        except OSError as e:
            if attempt == RETRIES:
                return None, f"{type(e).__name__}: {e}"
            time.sleep(2 * attempt)  # 점증 대기
    return None, "unreachable"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=300, help="받을 표본 수 (기본 300)")
    args = ap.parse_args()

    env = load_env(".env.local")
    body, _ = rest(env, f"photos?select={FIELDS}&visibility=eq.published&limit={POOL_LIMIT}")
    pool = json.loads(body)
    if not pool:
        sys.exit("❌ 공개 사진이 없습니다.")

    # 등간격 추출 — 풀 전체에 고르게 퍼진 표본.
    step = max(1, len(pool) // args.limit)
    picked = pool[::step][: args.limit]
    print(f"풀 {len(pool)}장 → 등간격 {step} 간격으로 {len(picked)}장 선택\n")

    os.makedirs(SAMPLE_DIR, exist_ok=True)
    saved, skipped, failed = 0, 0, []

    for i, p in enumerate(picked, 1):
        path = os.path.join(SAMPLE_DIR, f"{p['id']}.jpg")
        if os.path.exists(path) and os.path.getsize(path) > 0:
            skipped += 1
            continue
        raw, err = download(p["thumb_url"])
        if err:
            # 깨진 이미지·타임아웃 하나 때문에 전체가 멈추지 않게 한다.
            failed.append((p["id"], err))
            continue
        with open(path, "wb") as f:
            f.write(raw)
        saved += 1
        if i % 25 == 0:
            print(f"  {i}/{len(picked)} …", flush=True)

    # 실제로 파일이 있는 것만 메타에 남긴다 → 이후 단계가 파일 존재를 가정할 수 있다.
    have = [p for p in picked if os.path.exists(os.path.join(SAMPLE_DIR, f"{p['id']}.jpg"))]
    with open(os.path.join(SAMPLE_DIR, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(have, f, ensure_ascii=False, indent=1)

    album_count = len({p.get("album_id") or p["id"] for p in have})
    ph_count = len({p["photographer_id"] for p in have})
    print(f"\n신규 {saved}장 · 기존 {skipped}장 · 실패 {len(failed)}장")
    print(f"메타 {len(have)}장 → sample/meta.json")
    print(f"  게시물(앨범) {album_count}개 · 작가 {ph_count}명")
    for pid, err in failed[:5]:
        print(f"  ⚠️ {pid}: {err}")


if __name__ == "__main__":
    main()
