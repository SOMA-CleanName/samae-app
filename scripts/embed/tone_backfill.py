#!/usr/bin/env python3
"""톤 백필 — 공개 사진의 22차원 톤 벡터를 photos 에 채운다. (docs/22 §7.6 · 7단계)

    scripts/embed/.venv/bin/python scripts/embed/tone_backfill.py --fit           # dry-run
    scripts/embed/.venv/bin/python scripts/embed/tone_backfill.py --fit --apply   # 최초 1회
    scripts/embed/.venv/bin/python scripts/embed/tone_backfill.py --apply         # 매일(신규분)

두 가지 모드가 있다.

  --fit   기준 통계(z-score 평균·표준편차)와 분산 보정 상수를 **카탈로그 전체로
          새로 측정**해 photo_tone_stats 에 활성 줄로 넣고, 전량을 그 기준으로
          채운다. 7단계 도입 시 한 번, 그리고 tone.py 의 RESIZE_LONG/L_BINS 를
          바꿨을 때만 쓴다.
  (기본)  이미 활성인 통계를 DB 에서 읽어, tone_vec 이 비어 있는 사진만 같은
          좌표계로 표준화해 채운다. launchd 배치가 매일 호출하는 경로다.

**--fit 을 함부로 다시 돌리면 안 된다.** 기준 통계가 바뀌면 기존 tone_vec 과
좌표계가 어긋나 비교가 성립하지 않는다(scripts/embed/tone.py 모듈 상단 '함정').
이미 활성 통계가 있으면 --force-refit 없이는 거부한다.

docs/22 §10.4 의 배치 규칙을 지킨다.

  - `--dry-run` 이 기본값. `--apply` 를 명시해야 DB 에 쓴다.
  - photos 의 update 는 항상 `id=eq.<uuid>` 단건.
  - photos 에서 건드리는 컬럼은 tone_vec · tone_stats_version · toned_at **셋뿐**.
    임베딩 3종은 embed_photos.py 소관이며 이 스크립트는 읽지도 쓰지도 않는다.
  - 전체 실행 전 `--limit 10` 으로 먼저 검증.

모델이 필요 없다 — PIL + numpy 로 계산한다. 1,800장에 20초쯤 걸린다.
"""

import argparse
import datetime as dt
import json
import os
import sys
import time
import urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import tone  # noqa: E402
from check_db import count, load_env  # noqa: E402
from embed_photos import CACHE_DIR, PAGE, api, local_path  # noqa: E402
from fetch_sample import download  # noqa: E402

# 기준 통계 이름. tone.py 의 입력 규격이 바뀌면 좌표계가 달라지므로 그것을 담는다.
VERSION = f"tone-v1@{tone.RESIZE_LONG}x{tone.L_BINS}"

# 분산 보정 상수를 재는 표본 크기. 코사인 쌍은 N² 이라 400장이면 16만 쌍이다.
SCALE_SAMPLE = 400


def to_pgvector(vec):
    """vector(22) 리터럴. float4 저장이라 유효숫자 6자리로 넉넉히 준다."""
    return "[" + ",".join(f"{v:.6g}" for v in vec) + "]"


def fetch_photos(env, pending_only, limit):
    """대상 목록. pending_only=True 면 tone_vec 이 비어 있는 것만.

    임베딩이 있는 사진만 본다. 톤만 있고 임베딩이 없으면 0078 RPC 의 후보 풀에
    애초에 들어가지 못해 계산이 버려진다(0077 의 idx_photos_tone_pending 과 동일 조건).
    """
    where = "visibility=eq.published&embedding=not.is.null"
    if pending_only:
        where += "&tone_vec=is.null"
    out, offset = [], 0
    while True:
        want = PAGE if limit is None else min(PAGE, limit - len(out))
        if want <= 0:
            break
        rows = api(env, "GET",
                   f"photos?select=id,thumb_url&{where}"
                   f"&order=created_at.asc&offset={offset}&limit={want}")
        out.extend(rows)
        if len(rows) < want:
            break
        offset += len(rows)
    return out


def ensure_image(env, photo):
    """로컬 파일 경로. 1단계 표본에 있으면 재사용하고 없으면 내려받는다."""
    path, _ = local_path(photo["id"])
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return path
    raw, err = download(photo["thumb_url"])
    if err:
        return None
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(raw)
    return path


def descriptors(env, photos):
    """(살아남은 photo 목록, (N, 22) 원시 디스크립터 행렬)."""
    import numpy as np
    from PIL import Image

    os.makedirs(CACHE_DIR, exist_ok=True)
    kept, rows = [], []
    t0 = time.time()
    for i, p in enumerate(photos, 1):
        path = ensure_image(env, p)
        if not path:
            print(f"  ⚠️ {p['id']} 다운로드 실패 — 건너뜀")
            continue
        try:
            with Image.open(path) as im:
                rows.append(tone.descriptor(im))
            kept.append(p)
        except Exception as e:  # 깨진 파일 하나가 배치를 멈추지 않게
            print(f"  ⚠️ {p['id']} 이미지 열기 실패: {e}")
        if i % 300 == 0 or i == len(photos):
            print(f"  톤 {i}/{len(photos)}  ({time.time() - t0:.0f}s)", flush=True)
    return kept, (np.vstack(rows) if rows else np.empty((0, tone.DIM)))


def measure_blend_scale(env, photos, tvec):
    """두 축의 분산 보정 상수 = sd(SigLIP 코사인) / sd(톤 코사인). (docs/22 §7.6)

    SigLIP 코사인은 좁은 띠에 몰려 있고(표준편차 0.080) 톤 코사인은 넓게 퍼진다
    (0.348). 보정 없이 섞으면 α=0.9 인데 순위 변동의 3분의 1을 톤이 좌우한다 —
    눈금이 거짓말을 한다. 이 상수로 나눠야 α 가 "톤을 몇 % 본다" 는 뜻이 된다.

    표본만으로 충분하다. 재는 것이 분포의 폭이라 전량을 쓸 이유가 없고,
    N² 쌍이라 전량이면 오히려 메모리가 터진다.
    """
    import numpy as np

    index = {p["id"]: i for i, p in enumerate(photos)}
    rows = api(env, "GET",
               "photos?select=id,embedding&visibility=eq.published"
               f"&embedding=not.is.null&order=created_at.asc&limit={SCALE_SAMPLE}")

    pairs = [(index[r["id"]], json.loads(r["embedding"]))
             for r in rows if r.get("embedding") and r["id"] in index]
    if len(pairs) < 50:
        return None, len(pairs)

    idx = [i for i, _ in pairs]
    emb = np.array([v for _, v in pairs], dtype=np.float64)
    # 저장된 벡터는 이미 L2 정규화돼 있지만(siglip.encode), halfvec 왕복에서
    # 길이가 미세하게 흔들린다. 다시 맞춰야 내적이 곧 코사인이 된다.
    emb /= np.linalg.norm(emb, axis=1, keepdims=True)

    sims_emb = emb @ emb.T
    sims_tone = tvec[idx] @ tvec[idx].T
    off = ~np.eye(len(idx), dtype=bool)
    sd_emb, sd_tone = sims_emb[off].std(), sims_tone[off].std()

    print(f"\n분산 측정 (표본 {len(idx)}장 · {len(idx) * (len(idx) - 1):,}쌍)")
    print(f"  SigLIP 코사인  평균 {sims_emb[off].mean():+.3f}  표준편차 {sd_emb:.3f}")
    print(f"  톤 코사인      평균 {sims_tone[off].mean():+.3f}  표준편차 {sd_tone:.3f}")
    print(f"  → 톤에 곱할 상수 blend_scale = {sd_emb / sd_tone:.4f}")
    return float(sd_emb / sd_tone), len(idx)


def active_stats(env):
    """활성 기준 통계 한 줄. 없으면 None.

    0077 을 적용하기 전에는 테이블·컬럼 자체가 없어 PostgREST 가 404/400 을 준다.
    스택트레이스 대신 무엇을 먼저 해야 하는지 알려주고 멈춘다.
    """
    try:
        rows = api(env, "GET",
                   "photo_tone_stats?select=version,mean,std,blend_scale&is_active=is.true&limit=1")
    except urllib.error.HTTPError as e:
        if e.code in (400, 404):
            sys.exit("❌ photo_tone_stats 를 읽을 수 없습니다 — 0077 마이그레이션을 먼저 적용하세요.\n"
                     "   node scripts/migrate.cjs 0077_photo_tone_vectors")
        raise
    return rows[0] if rows else None


def write_stats(env, mean, std, blend_scale, sample_size, apply_):
    """새 기준 통계를 활성으로 넣는다. 기존 활성 줄은 version 단건으로 내린다.

    활성 줄이 둘이 되면 0078 RPC 가 어느 좌표계를 쓰는지 알 수 없어진다.
    DB 의 부분 유니크 인덱스가 그것을 막지만, 여기서도 순서를 지켜 충돌 자체를 없앤다.
    """
    prev = api(env, "GET", "photo_tone_stats?select=version&is_active=is.true")
    body = {
        "version": VERSION,
        "mean": [float(v) for v in mean],
        "std": [float(v) for v in std],
        "blend_scale": blend_scale,
        "sample_size": sample_size,
        "is_active": True,
    }
    if not apply_:
        print(f"\n(dry-run) photo_tone_stats 에 넣을 줄: {VERSION} · "
              f"blend_scale={blend_scale:.4f} · sample_size={sample_size}")
        return
    for row in prev or []:
        api(env, "PATCH", f"photo_tone_stats?version=eq.{row['version']}",
            {"is_active": False}, {"Prefer": "return=minimal"})
    api(env, "POST", "photo_tone_stats", body,
        {"Prefer": "resolution=merge-duplicates,return=minimal"})
    print(f"\n기준 통계 저장 — {VERSION} · blend_scale={blend_scale:.4f}")


def write_one(env, photo_id, vec, version, apply_):
    """단건 갱신. URL 에 id=eq.<uuid> 가 반드시 들어가는 유일한 경로다."""
    if not photo_id:
        raise RuntimeError("photo_id 가 비어 있다 — 조건 없는 갱신 위험")
    if not apply_:
        return
    api(env, "PATCH", f"photos?id=eq.{photo_id}", {
        "tone_vec": to_pgvector(vec),
        "tone_stats_version": version,
        "toned_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    }, {"Prefer": "return=minimal"})


def coverage(env):
    """끝나고 DB 에 실제로 몇 장이 찼는지 다시 조회한다.

    보낸 장수를 믿으면 안 된다. 도중에 삭제된 사진에 대한 PATCH 는 0행을 고치고도
    204 를 돌려주므로 에러 없이 숫자가 어긋난다(docs/22 §11 의 08-06 사례).
    """
    base = "photos?select=id&visibility=eq.published&embedding=not.is.null"
    total = count(env, base)
    done = count(env, base + "&tone_vec=not.is.null")
    if total:
        print(f"커버리지 {done}/{total}장 ({done / total * 100:.1f}%)")
    else:
        print("커버리지 — 대상 사진 수를 읽지 못했습니다.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="실제로 DB 에 쓴다(없으면 dry-run)")
    ap.add_argument("--fit", action="store_true",
                    help="기준 통계를 새로 측정하고 전량을 그 기준으로 채운다(도입 시 1회)")
    ap.add_argument("--force-refit", action="store_true",
                    help="활성 통계가 이미 있어도 --fit 을 강행한다(좌표계가 바뀐다)")
    ap.add_argument("--limit", type=int, default=None, help="처리할 최대 장수")
    args = ap.parse_args()

    import numpy as np

    mode = "APPLY (DB 에 씀)" if args.apply else "DRY-RUN (DB 에 쓰지 않음)"
    print(f"모드      {mode}")
    print(f"기준통계  {VERSION}{'  ← 새로 측정' if args.fit else '  ← DB 에서 읽음'}\n")

    env = load_env(".env.local")
    current = active_stats(env)

    if args.fit and current and not args.force_refit:
        sys.exit(
            f"❌ 이미 활성 기준 통계가 있습니다: {current['version']}\n"
            "   --fit 을 다시 돌리면 좌표계가 바뀌어 기존 tone_vec 과 비교가 성립하지 않습니다.\n"
            "   정말 다시 맞추려면 --force-refit 을 주고, 끝난 뒤 반드시 전량을 다시 채우세요:\n"
            "     update photos set tone_vec = null, toned_at = null where tone_vec is not null;"
        )
    if not args.fit and not current:
        sys.exit("❌ 활성 기준 통계가 없습니다. 최초 1회는 --fit 으로 실행하세요.")

    photos = fetch_photos(env, pending_only=not args.fit, limit=args.limit)
    if not photos:
        print("대상 없음 — 임베딩이 있는 공개 사진에 톤 벡터가 모두 있습니다.")
        return
    print(f"대상 {len(photos)}장\n")

    photos, raw = descriptors(env, photos)
    if not photos:
        print("계산된 사진이 없습니다.")
        return

    if args.fit:
        mean, std = tone.fit_stats(raw)
        tvec = tone.standardize(raw, (mean, std))
        scale, n = measure_blend_scale(env, photos, tvec)
        if scale is None:
            sys.exit(f"❌ 분산 보정 상수를 잴 표본이 부족합니다({n}장). 임베딩 백필을 먼저 끝내세요.")
        write_stats(env, mean, std, scale, n, args.apply)
        version = VERSION
    else:
        mean = np.array(current["mean"], dtype=np.float64)
        std = np.array(current["std"], dtype=np.float64)
        tvec = tone.standardize(raw, (mean, std))
        version = current["version"]

    t0 = time.time()
    for i, (p, vec) in enumerate(zip(photos, tvec), 1):
        write_one(env, p["id"], vec, version, args.apply)
        if i % 300 == 0 or i == len(photos):
            print(f"  쓰기 {i}/{len(photos)}  ({time.time() - t0:.0f}s)", flush=True)

    print(f"\n{'전송' if args.apply else '계산만(미전송)'} {len(photos)}장")
    if args.apply:
        coverage(env)


if __name__ == "__main__":
    main()
