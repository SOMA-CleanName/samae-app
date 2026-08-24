#!/usr/bin/env python3
"""태그가 '분위기'를 실제로 묶고 있는가 — 임베딩으로 검증한다. (docs/22 §1)

    scripts/embed/.venv/bin/python scripts/embed/eval_tag_coherence.py
    scripts/embed/.venv/bin/python scripts/embed/eval_tag_coherence.py --min-photos 30

**읽기 전용이다.** DB 를 조회만 한다.

두 가지를 잰다.

  ① 추천이 시드와 얼마나 닮았나
     태그 방식 top-8 · 벡터 방식 top-8 · 무작위 8장 각각에 대해 시드와의
     코사인 유사도 평균을 낸다. 태그 방식이 무작위에 가까우면, 그 추천은
     '비슷한 사진'을 못 찾고 있다는 뜻이다.

  ② 어떤 태그가 시각적으로 흩어져 있나
     같은 태그를 단 사진끼리의 코사인 유사도 평균(= 응집도)을 태그별로 낸다.
     **같은 게시물 쌍은 제외한다** — 한 촬영본 사진끼리는 당연히 붙어 있어
     넣으면 태그가 실제보다 잘 묶는 것처럼 보인다.

     응집도가 카탈로그 평균에 가까운 태그 = 붙여도 아무 정보가 없는 태그다.
     "태그를 공유하는데 전혀 다른 사진" 의 대표 사례를 여기서 고른다.

임베딩은 photos.embedding 을 그대로 읽는다(0068). 앱이 쓰는 것과 같은 벡터다.
"""

import argparse
import json
import os
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from check_db import load_env  # noqa: E402

PAGE = 200      # 임베딩까지 받으므로 페이지를 작게 — 1장이 약 9KB 다
TAG_POOL = 400  # discovery.ts:1566
RNG_SEED = 22


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
    with urllib.request.urlopen(req, timeout=120) as res:
        raw = res.read()
        return json.loads(raw) if raw else None


def fetch(env):
    """공개 사진 + 임베딩. created_at 내림차순(태그 방식 재현에 필요)."""
    out, offset = [], 0
    t0 = time.time()
    while True:
        rows = api(env, "photos?select=id,mood_tags,album_id,photographer_id,embedding"
                        "&visibility=eq.published&embedding=not.is.null"
                        f"&order=created_at.desc&offset={offset}&limit={PAGE}")
        out.extend(rows)
        print(f"  임베딩 {len(out)}장 ({time.time() - t0:.0f}s)", flush=True)
        if len(rows) < PAGE:
            break
        offset += len(rows)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", type=int, default=200)
    ap.add_argument("--top-k", type=int, default=8)
    ap.add_argument("--min-photos", type=int, default=20, help="응집도를 잴 태그의 최소 사진 수")
    ap.add_argument("--show", type=int, default=12, help="상·하위 몇 개를 보여줄지")
    args = ap.parse_args()

    import numpy as np

    env = load_env(".env.local")
    rows = fetch(env)
    n = len(rows)
    E = np.array([json.loads(r["embedding"]) for r in rows], dtype=np.float32)
    E /= np.linalg.norm(E, axis=1, keepdims=True)   # halfvec 왕복 오차 보정
    print(f"\n공개 사진 {n}장 · 임베딩 {E.shape}\n")

    album = np.array([r["album_id"] or f"single:{r['id']}" for r in rows])
    K = args.top_k
    rng = np.random.default_rng(RNG_SEED)

    # ── ① 추천이 시드와 얼마나 닮았나 ────────────────────────────────
    idx = list(range(0, n, max(1, n // args.seeds)))[: args.seeds]
    tag_sim, vec_sim, rnd_sim = [], [], []
    # 백분위 — 코사인의 바닥이 0 이 아니라(무작위 두 장도 0.67) 절대값 비율은 척도가
    # 왜곡된다. 순위로 바꾸면 기준점이 자명해진다: 무작위로 고르면 정의상 50 이다.
    #   *_pct_all  : 공개 사진 전체(같은 게시물·시드 제외)를 자로 삼는다 → 최종 성능
    #   tag_pct_own: 태그 방식이 '자기 후보 400장' 안에서 얼마나 잘 줄 세웠나 → 점수 자체의 질
    tag_pct, vec_pct, rnd_pct, tag_pct_own = [], [], [], []
    for si in idx:
        s = rows[si]
        pool = [j for j in range(n) if j != si][:TAG_POOL]
        cand = [j for j in pool if not (s["album_id"] and rows[j]["album_id"] == s["album_id"])]

        ts = {t.lower() for t in (s["mood_tags"] or [])}
        def score(j):
            return sum(1 for t in (rows[j]["mood_tags"] or []) if t.lower() in ts) if ts else 0
        top = sorted(cand, key=lambda j: -score(j))[:K]
        tag_sim.append(float((E[top] @ E[si]).mean()))

        # 벡터 방식 — 같은 게시물 제외 후 상위 K (RPC 와 같은 규칙)
        sims = E @ E[si]
        order = [j for j in np.argsort(-sims)
                 if j != si and not (s["album_id"] and rows[j]["album_id"] == s["album_id"])][:K]
        vec_sim.append(float(sims[order].mean()))

        pick = rng.choice(cand, size=min(K, len(cand)), replace=False)
        rnd_sim.append(float((E[pick] @ E[si]).mean()))

        # 자 ①: 공개 사진 전체 — 세 방식을 같은 기준에 놓는다
        universe = [j for j in range(n)
                    if j != si and not (s["album_id"] and rows[j]["album_id"] == s["album_id"])]
        rank_all = {j: r for r, j in enumerate(sorted(universe, key=lambda j: sims[j]))}
        mall = len(universe) - 1
        pct = lambda sel, rk, m_: float(np.mean([rk[j] for j in sel])) / m_ * 100
        tag_pct.append(pct(top, rank_all, mall))
        vec_pct.append(pct(order, rank_all, mall))
        rnd_pct.append(pct(list(pick), rank_all, mall))

        # 자 ②: 태그 방식의 자기 후보 400장 안에서의 순위
        rank_own = {j: r for r, j in enumerate(sorted(cand, key=lambda j: sims[j]))}
        tag_pct_own.append(pct(top, rank_own, len(cand) - 1))

    print(f"① 추천 {K}장이 시드와 얼마나 닮았나 (코사인 유사도 · 시드 {len(idx)}개)\n")
    print(f"  {'방식':<12}{'시드와 유사도':>14}{'무작위 대비':>13}{'백분위':>10}")
    base = float(np.mean(rnd_sim))
    for name, v, pc in (("태그", np.mean(tag_sim), np.mean(tag_pct)),
                        ("벡터", np.mean(vec_sim), np.mean(vec_pct)),
                        ("무작위", base, np.mean(rnd_pct))):
        gain = (float(v) - base) / base * 100
        print(f"  {name:<12}{float(v):>13.3f}{gain:>12.1f}%{float(pc):>9.1f}")
    print("\n  백분위 = 공개 사진 전체를 시드와 닮은 순으로 줄 세웠을 때 추천이 놓인 자리."
          "\n           무작위로 고르면 50 근처가 된다. 100 에 가까울수록 가장 닮은 것만 골랐다는 뜻.")
    print(f"\n  참고 — 태그 방식이 '자기 후보 400장' 안에서만 매긴 순위: "
          f"백분위 {float(np.mean(tag_pct_own)):.1f}"
          "\n         (후보를 400장으로 좁혀 줘도 그 안에서조차 거의 못 고른다는 뜻)")

    # ── ② 태그별 시각 응집도 ─────────────────────────────────────────
    by_tag = {}
    for i, r in enumerate(rows):
        for t in {x.strip() for x in (r["mood_tags"] or []) if x.strip()}:
            by_tag.setdefault(t, []).append(i)

    # 카탈로그 전체 기준선 — 같은 게시물 쌍을 뺀 무작위 쌍의 평균 유사도
    a = rng.integers(0, n, 60000); b = rng.integers(0, n, 60000)
    ok = (a != b) & (album[a] != album[b])
    baseline = float((E[a[ok]] * E[b[ok]]).sum(axis=1).mean())

    stats = []
    for t, ids in by_tag.items():
        if len(ids) < args.min_photos:
            continue
        sub, alb = E[ids], album[ids]
        S = sub @ sub.T
        m = ~np.eye(len(ids), dtype=bool) & (alb[:, None] != alb[None, :])  # 같은 게시물 쌍 제외
        if m.sum() < 30:
            continue
        stats.append((float(S[m].mean()), t, len(ids), int(m.sum() // 2)))
    stats.sort()

    print(f"\n② 같은 태그를 단 사진끼리의 시각 유사도 (같은 게시물 쌍 제외)")
    print(f"   카탈로그 무작위 두 장 기준선 = {baseline:.3f}\n")
    print(f"  {'태그':<12}{'사진':>7}{'비교쌍':>9}{'유사도':>9}{'기준선 대비':>12}")
    print("  ── 가장 흩어진 태그 (붙어도 정보가 거의 없다) " + "─" * 12)
    for v, t, cnt, pairs in stats[: args.show]:
        print(f"  {t:<12}{cnt:>6}장{pairs:>8}쌍{v:>9.3f}{(v - baseline) / baseline * 100:>+11.1f}%")
    print("  ── 가장 잘 뭉친 태그 " + "─" * 36)
    for v, t, cnt, pairs in stats[-args.show:][::-1]:
        print(f"  {t:<12}{cnt:>6}장{pairs:>8}쌍{v:>9.3f}{(v - baseline) / baseline * 100:>+11.1f}%")
    print(f"\n  태그 {len(stats)}개 ({args.min_photos}장 이상) · 응집도 평균 "
          f"{np.mean([s[0] for s in stats]):.3f}")


if __name__ == "__main__":
    main()
