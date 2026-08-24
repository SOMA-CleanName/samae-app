#!/usr/bin/env python3
"""태그 방식 vs 벡터 방식 — 같은 시드로 같은 지표를 잰다. (docs/22 §1 · §7.2)

    scripts/embed/.venv/bin/python scripts/embed/eval_tag_baseline.py
    scripts/embed/.venv/bin/python scripts/embed/eval_tag_baseline.py --seeds 300 --top-k 8

**왜 이 스크립트가 필요한가**

교체 전 태그 방식의 수치는 어디에도 기록되지 않았다. 2026-06-18(`ae410db`)에 구현될
때 설계 문서가 없었고, 커밋 메시지가 유일한 기록이다. 그래서 "태그 방식은 같은 작가가
몇 %였나" 를 인용할 근거가 없다. 이 스크립트가 그 자리를 메운다.

**읽기 전용이다.** DB 를 조회만 하며 아무것도 쓰지 않는다.

측정 대상은 **순위를 만드는 핵심 로직**뿐이다. 노출 낮춤(feed_hidden)·세로 비율 보정은
두 방식에 똑같이 얹히는 뒷단이라 제외한다. 그것까지 넣으면 두 방식의 차이가 아니라
공통 후처리의 효과가 섞인다.

  태그 방식 : src/lib/discovery.ts 의 similarByTags 를 그대로 옮김
              최신 400장 → 같은 게시물 제외 → 태그 겹침 개수 desc
              → 동점은 앨범 라운드로빈 → spaceByAlbum
  벡터 방식 : similar_photos_by_embedding RPC 를 그대로 호출 (0078)

앨범 라운드로빈이 셔플을 쓰므로 **시드 고정 난수**를 쓴다. 그러지 않으면 돌릴 때마다
숫자가 흔들려 인용할 수 없다.
"""

import argparse
import json
import os
import random
import sys
import time
import urllib.request
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from check_db import load_env  # noqa: E402

PAGE = 500
TAG_POOL = 400   # discovery.ts:1566 — similarByTags 의 후보 상한
RNG_SEED = 22    # 재현성을 위한 고정값. docs/22 번호에서 땄다.


def api(env, path, body=None):
    url = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1/" + path
    key = env["SUPABASE_SERVICE_ROLE_KEY"]
    req = urllib.request.Request(
        url, data=json.dumps(body).encode() if body is not None else None,
        method="POST" if body is not None else "GET")
    req.add_header("apikey", key)
    req.add_header("Authorization", "Bearer " + key)
    if body is not None:
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=60) as res:
        raw = res.read()
        return json.loads(raw) if raw else None


def fetch_catalog(env):
    """공개 사진 전체를 created_at 내림차순으로. 승인 작가만 남긴다."""
    approved = {p["id"] for p in api(env, "photographers?select=id&status=eq.approved")}
    out, offset = [], 0
    while True:
        rows = api(env, "photos?select=id,mood_tags,album_id,photographer_id,embedding_model"
                        f"&visibility=eq.published&order=created_at.desc"
                        f"&offset={offset}&limit={PAGE}")
        out.extend(rows)
        if len(rows) < PAGE:
            break
        offset += len(rows)
    return [p for p in out if p["photographer_id"] in approved]


def album_key(p):
    return p["album_id"] or f"single:{p['id']}"


def space_by_album(items):
    """discovery.ts 의 spaceByAlbum 이식 — 인접한 두 장이 같은 게시물이 되지 않게."""
    pending, out, last = list(items), [], None
    while pending:
        idx = next((i for i, it in enumerate(pending) if album_key(it) != last), 0)
        it = pending.pop(idx)
        out.append(it)
        last = album_key(it)
    return out


def similar_by_tags(catalog, seed, rng, variant="current"):
    """similarByTags 이식. catalog 는 created_at 내림차순이어야 한다.

    variant="current"  — 지금 코드(discovery.ts). 동점 안에서 앨범 라운드로빈 + spaceByAlbum
    variant="original" — 최초 구현(ae410db · 2026-06-18). 점수 desc, 동점은 최신순. 그것뿐.

    두 개를 나눠 재는 이유: 라운드로빈은 **동점 구간을 앨범 단위로 강제 분산**한다.
    태그가 겹치는 후보가 적으면 상위 대부분이 동점이라, 순위가 유사도가 아니라
    이 셔플로 정해진다. 즉 지금 코드의 '작가 다양성'은 추천이 잘돼서가 아니라
    무작위 때문일 수 있다. 원본과 나란히 놓아야 그 구분이 보인다.
    """
    # .neq("id", seed).order(created_at desc).limit(400)
    pool = [p for p in catalog if p["id"] != seed["id"]][:TAG_POOL]

    # 같은 게시물 제외 (앨범이 null 이면 유지)
    seed_album = seed["album_id"]
    candidates = [p for p in pool if not (seed_album and p["album_id"] == seed_album)]

    tagset = {t.lower() for t in (seed["mood_tags"] or [])}

    def score(p):
        if not tagset:
            return 0
        return sum(1 for t in (p["mood_tags"] or []) if t.lower() in tagset)

    by_score = {}
    for p in candidates:
        by_score.setdefault(score(p), []).append(p)

    if variant == "original":
        # ae410db: scored.sort((a,b) => b.score - a.score || a.i - b.i)
        # candidates 가 이미 최신순이므로 안정 정렬이면 동점은 최신순으로 남는다.
        return sorted(candidates, key=lambda p: -score(p)), candidates, by_score

    ordered = []
    for s in sorted(by_score, reverse=True):
        albums = {}
        for p in by_score[s]:
            albums.setdefault(album_key(p), []).append(p)
        groups = list(albums.values())
        for g in groups:
            rng.shuffle(g)
        rng.shuffle(groups)
        for rnd in range(max(len(g) for g in groups)):   # 앨범별 라운드로빈
            for g in groups:
                if rnd < len(g):
                    ordered.append(g[rnd])

    return space_by_album(ordered), candidates, by_score


def stats(rows, seed, k):
    """top-k 의 같은 작가 비율·등장 작가 수."""
    top = rows[:k]
    if not top:
        return None
    same = sum(1 for p in top if p["photographer_id"] == seed["photographer_id"])
    return same, len({p["photographer_id"] for p in top}), len(top)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", type=int, default=200, help="시드 사진 수 (등간격 표본)")
    ap.add_argument("--top-k", type=int, default=8, help="상위 몇 장을 볼지")
    ap.add_argument("--alpha", type=float, default=None,
                    help="벡터 방식 α. 생략하면 RPC 기본값(운영값)")
    ap.add_argument("--variants", default="original,current",
                    help="태그 방식 변형. original=ae410db 최초 구현 · current=지금 코드")
    args = ap.parse_args()

    env = load_env(".env.local")
    catalog = fetch_catalog(env)
    n = len(catalog)
    print(f"공개 사진 {n}장 (승인 작가)")
    print(f"태그 방식 후보 상한 {TAG_POOL}장 → 커버리지 {TAG_POOL / n * 100:.1f}%\n")

    step = max(1, n // args.seeds)
    seeds = catalog[::step][: args.seeds]
    rng = random.Random(RNG_SEED)

    k = args.top_k
    variants = [v.strip() for v in args.variants.split(",") if v.strip()]
    label = {"original": "태그(최초)", "current": "태그(현재)"}
    names = [label[v] for v in variants] + ["벡터"]
    agg = {nm: [0, 0, 0] for nm in names}   # [같은작가 합, 작가수 합, 칸 수]
    no_tag_seeds = zero_score_seeds = 0
    t0 = time.time()

    for i, seed in enumerate(seeds, 1):
        # ── 태그 방식 ────────────────────────────────────────────
        for v in variants:
            rows, candidates, by_score = similar_by_tags(catalog, seed, rng, v)
            r = stats(rows, seed, k)
            if r:
                nm = label[v]
                agg[nm][0] += r[0]; agg[nm][1] += r[1]; agg[nm][2] += r[2]
        if not (seed["mood_tags"] or []):
            no_tag_seeds += 1
        # 상위 k 가 전부 0점이면 '유사도'가 순위에 아무 역할도 못 한 것
        positive = sum(len(vv) for sc, vv in by_score.items() if sc > 0)
        if positive < k:
            zero_score_seeds += 1

        # ── 벡터 방식 ────────────────────────────────────────────
        body = {"p_photo_id": seed["id"], "p_limit": k}
        if args.alpha is not None:
            body["p_alpha"] = args.alpha
        vec = api(env, "rpc/similar_photos_by_embedding", body) or []
        r = stats(vec, seed, k)
        if r:
            agg["벡터"][0] += r[0]; agg["벡터"][1] += r[1]; agg["벡터"][2] += r[2]

        if i % 50 == 0 or i == len(seeds):
            print(f"  {i}/{len(seeds)}  ({time.time() - t0:.0f}s)", flush=True)

    alpha_label = "기본값(운영)" if args.alpha is None else f"α={args.alpha:g}"
    print(f"\n시드 {len(seeds)}개 · top-{k} · 벡터 {alpha_label} · 난수시드 {RNG_SEED}\n")
    print(f"  {'방식':<12}{'같은 작가%':>12}{'같은 작가 장수':>16}{'등장 작가 수':>14}")
    for name in names:
        same, distinct, cells = agg[name]
        if not cells:
            continue
        print(f"  {name:<12}{same / cells * 100:>11.1f}%{same / len(seeds):>15.1f}장"
              f"{distinct / len(seeds):>13.1f}명")

    print(f"\n  시드 중 태그가 아예 없는 사진: {no_tag_seeds}개 ({no_tag_seeds / len(seeds) * 100:.1f}%)")
    print(f"  태그 방식에서 top-{k} 를 채울 만큼 겹치는 후보가 없던 시드: "
          f"{zero_score_seeds}개 ({zero_score_seeds / len(seeds) * 100:.1f}%)")
    print("    → 이 시드들은 순위가 사실상 무작위다(전부 0점이라 셔플만 남는다)")


if __name__ == "__main__":
    main()
