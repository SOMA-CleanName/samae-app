#!/usr/bin/env python3
"""임베딩 백필 — 공개 사진의 벡터를 계산해 photos 에 채운다. (docs/22 §7, §9.2)

    scripts/embed/.venv/bin/python scripts/embed/embed_photos.py                     # dry-run
    scripts/embed/.venv/bin/python scripts/embed/embed_photos.py --apply --limit 10  # 소량 검증
    scripts/embed/.venv/bin/python scripts/embed/embed_photos.py --apply             # 전체

이 과제에서 **유일하게 실제 데이터를 쓰는** 스크립트다. docs/22 §10.4 의 규칙을 지킨다.

  - `--dry-run` 이 기본값. `--apply` 를 명시해야 DB 에 쓴다.
  - update 는 항상 `id=eq.<uuid>` 단건. 조건 없는 갱신을 만들 수 없는 구조로 짠다.
  - 건드리는 컬럼은 embedding · embedding_model · embedded_at **셋뿐**.
  - `embedded_at is null` 만 대상이므로 중단 후 재실행해도 이미 끝난 사진을
    다시 계산하지 않는다.

service_role 키는 RLS 를 우회한다. 위 규칙이 그 위험을 감싸는 장치다.
"""

import argparse
import datetime as dt
import json
import os
import sys
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import siglip  # noqa: E402
from check_db import count, load_env  # noqa: E402
from fetch_sample import download  # noqa: E402

SAMPLE_DIR = os.path.join(HERE, "sample")  # 1단계 표본 — 있으면 재다운로드를 건너뛴다
CACHE_DIR = os.path.join(HERE, "cache")
PAGE = 500  # PostgREST 페이지 크기(기본 상한 1000 미만으로)
FIELDS = "id,thumb_url"


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


def fetch_pending(env, limit):
    """embedded_at 이 null 인 공개 사진 목록. PostgREST 응답 상한 때문에 페이지로 나눠 받는다."""
    out, offset = [], 0
    while True:
        want = PAGE if limit is None else min(PAGE, limit - len(out))
        if want <= 0:
            break
        rows = api(
            env, "GET",
            f"photos?select={FIELDS}&visibility=eq.published&embedded_at=is.null"
            f"&order=created_at.asc&offset={offset}&limit={want}",
        )
        out.extend(rows)
        if len(rows) < want:
            break
        offset += len(rows)
    return out


def local_path(photo_id):
    """1단계 표본에 이미 받아둔 파일이 있으면 그것을 쓴다.

    사진은 업로드 시 uuid 경로로 생성되고 교체되지 않으므로, 같은 id 의 thumb 은
    같은 이미지다. 1,575장 중 300장을 다시 받지 않아도 된다.
    """
    p = os.path.join(SAMPLE_DIR, f"{photo_id}.jpg")
    if os.path.exists(p) and os.path.getsize(p) > 0:
        return p, True
    return os.path.join(CACHE_DIR, f"{photo_id}.jpg"), False


def to_pgvector(vec):
    """halfvec 리터럴. fp16 저장이라 유효숫자 5자리면 충분하다."""
    return "[" + ",".join(f"{v:.5g}" for v in vec) + "]"


def write_one(env, photo_id, vec, model_tag, apply_):
    """단건 갱신. URL 에 id=eq.<uuid> 가 반드시 들어가는 유일한 경로다."""
    if not photo_id:
        raise RuntimeError("photo_id 가 비어 있다 — 조건 없는 갱신 위험")
    body = {
        "embedding": to_pgvector(vec),
        "embedding_model": model_tag,
        "embedded_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    }
    if not apply_:
        return
    api(env, "PATCH", f"photos?id=eq.{photo_id}", body, {"Prefer": "return=minimal"})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="실제로 DB 에 쓴다(없으면 dry-run)")
    ap.add_argument("--limit", type=int, default=None, help="처리할 최대 장수")
    ap.add_argument("--budget", type=int, default=256, help="max_num_patches (docs/22 §4.4)")
    ap.add_argument("--batch-size", type=int, default=8)
    args = ap.parse_args()

    model_tag = f"{siglip.MODEL_ID.split('/')[-1]}@{args.budget}"
    mode = "APPLY (DB 에 씀)" if args.apply else "DRY-RUN (DB 에 쓰지 않음)"
    print(f"모드      {mode}")
    print(f"모델      {model_tag}\n")

    env = load_env(".env.local")
    pending = fetch_pending(env, args.limit)
    if not pending:
        print("대상 없음 — 모든 공개 사진에 임베딩이 있다.")
        return
    print(f"대상 {len(pending)}장 (embedded_at is null)\n")

    os.makedirs(CACHE_DIR, exist_ok=True)
    processor = model = device = None
    done = failed = reused = 0
    t0 = time.time()

    for i in range(0, len(pending), args.batch_size):
        chunk = pending[i : i + args.batch_size]

        # 이미지 확보 — 표본에 있으면 재사용, 없으면 다운로드
        images, rows = [], []
        from PIL import Image

        for p in chunk:
            path, is_reuse = local_path(p["id"])
            if not os.path.exists(path):
                raw, err = download(p["thumb_url"])
                if err:
                    print(f"  ⚠️ {p['id']} 다운로드 실패: {err}")
                    failed += 1
                    continue
                with open(path, "wb") as f:
                    f.write(raw)
            elif is_reuse:
                reused += 1
            try:
                images.append(Image.open(path).convert("RGB"))
                rows.append(p)
            except Exception as e:  # 깨진 파일 하나가 배치를 멈추지 않게
                print(f"  ⚠️ {p['id']} 이미지 열기 실패: {e}")
                failed += 1

        if not rows:
            continue

        if model is None:  # 대상이 있을 때만 모델을 올린다(dry-run 도 벡터는 계산)
            print("모델 로드 중…", flush=True)
            processor, model, device = siglip.load()
            print(f"  device={device}\n", flush=True)

        emb = siglip.encode(processor, model, images, args.budget, device).float().cpu().numpy()

        for p, vec in zip(rows, emb):
            write_one(env, p["id"], vec, model_tag, args.apply)
            done += 1

        if done % 100 < args.batch_size or i + args.batch_size >= len(pending):
            rate = done / max(time.time() - t0, 1e-9)
            print(f"  {done}/{len(pending)}  ({time.time() - t0:.0f}s · {rate:.1f}장/s)", flush=True)

    print(f"\n{'전송' if args.apply else '계산만(미전송)'} {done}장 · 실패 {failed}장 · 표본 재사용 {reused}장")
    print(f"소요 {time.time() - t0:.0f}s")

    if not args.apply:
        print("\n실제로 쓰려면 --apply 를 붙일 것. 먼저 --apply --limit 10 으로 검증 권장.")
        return

    # 전송 수를 반영 수로 믿으면 안 된다. PostgREST 는 매칭 0행인 PATCH 에도
    # 204 를 주므로, 배치 도중 삭제된 사진은 에러 없이 '성공'으로 세어진다.
    # 실제 커버리지를 다시 조회해 확인한다.
    total = count(env, "photos?select=id&visibility=eq.published")
    left = count(env, "photos?select=id&visibility=eq.published&embedded_at=is.null")
    print(f"\n커버리지  {total - left}/{total} (대기 {left}장)")
    if left:
        print("  대기가 남았다면 배치 중 새로 올라왔거나 공개로 전환된 사진이다.")
        print("  같은 명령을 다시 실행하면 그것만 처리한다.")


if __name__ == "__main__":
    main()
