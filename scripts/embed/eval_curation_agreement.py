#!/usr/bin/env python3
"""사람이 묶은 카테고리를 정답으로 삼아 두 추천 방식을 채점한다. (docs/22 §1)

    scripts/embed/.venv/bin/python scripts/embed/eval_curation_agreement.py
    scripts/embed/.venv/bin/python scripts/embed/eval_curation_agreement.py --kind mood

**읽기 전용이다.**

왜 이 스크립트가 필요한가 — 앞선 평가의 순환 논리
    "추천이 시드와 닮았나" 를 SigLIP 코사인으로 재면 **벡터 방식이 이길 수밖에 없다.**
    벡터 방식이 바로 그 코사인을 최대화해서 고르는 방법이기 때문이다. 자기 목적함수로
    자기를 채점하는 셈이라 그 결과는 성능이 아니라 정의다.

    그래서 두 방식 중 **어느 쪽도 최적화하지 않은 기준**이 필요하다.
    explore_category_photos 는 운영자가 손으로 사진을 카테고리에 넣은 기록이다
    (source='manual'). "이 사진들은 한 묶음" 이라는 사람의 판단이므로 제3의 자가 된다.

채점 방법
    같은 카테고리에 속한 사진을 정답으로 본다. 시드와 카테고리를 하나라도 공유하면 적중.
    precision@K = 추천 K장 중 적중한 장수 / K

기준선을 반드시 함께 본다
    카테고리가 크면 아무거나 찍어도 맞는다. 무작위 K장의 precision 을 같이 재서,
    **무작위 대비 몇 배**인지로 읽어야 한다.

알아둘 편향 — 이 자는 태그 방식에 유리하다
    운영자가 카테고리를 채울 때 태그를 보고 골랐을 가능성이 높다(categories.tags 가
    태그→카테고리 매핑을 갖고 있다). 즉 이 정답지는 태그 쪽으로 기울어 있다.
    **그런데도 벡터가 이긴다면** 그 결론은 훨씬 단단하다. 반대로 태그가 이겨도
    그것이 곧 태그 방식이 낫다는 뜻은 아니다 — 정답지가 태그로 만들어졌을 뿐일 수 있다.
"""

import argparse
import json
import os
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from check_db import load_env  # noqa: E402

PAGE = 200
TAG_POOL = 400   # discovery.ts:1566
RNG_SEED = 22


def api(env, path):
    url = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1/" + path
    key = env["SUPABASE_SERVICE_ROLE_KEY"]
    req = urllib.request.Request(url)
    req.add_header("apikey", key)
    req.add_header("Authorization", "Bearer " + key)
    with urllib.request.urlopen(req, timeout=120) as res:
        return json.loads(res.read())


def paged(env, path):
    out, offset = [], 0
    while True:
        rows = api(env, f"{path}&offset={offset}&limit={PAGE}")
        out.extend(rows)
        if len(rows) < PAGE:
            return out
        offset += len(rows)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--top-k", type=int, default=30)
    ap.add_argument("--kind", default=None, help="explore_categories.kind 로 제한 (예: mood)")
    ap.add_argument("--min-size", type=int, default=15, help="정답으로 쓸 카테고리 최소 사진 수")
    args = ap.parse_args()

    import numpy as np

    env = load_env(".env.local")

    photos = paged(env, "photos?select=id,mood_tags,album_id,photographer_id,embedding"
                        "&visibility=eq.published&embedding=not.is.null&order=created_at.desc")
    n = len(photos)
    pos = {p["id"]: i for i, p in enumerate(photos)}
    E = np.array([json.loads(p["embedding"]) for p in photos], dtype=np.float32)
    E /= np.linalg.norm(E, axis=1, keepdims=True)

    cats = {c["id"]: c for c in api(env, "explore_categories?select=id,slug,title,kind,published")}
    links = paged(env, "explore_category_photos?select=category_id,photo_id,source,excluded"
                       "&excluded=is.false&order=created_at.asc")

    members = {}
    for r in links:
        c = cats.get(r["category_id"])
        if not c or r["photo_id"] not in pos:
            continue
        if args.kind and c["kind"] != args.kind:
            continue
        members.setdefault(r["category_id"], set()).add(pos[r["photo_id"]])
    members = {k: v for k, v in members.items() if len(v) >= args.min_size}

    of_photo = {}
    for cid, ids in members.items():
        for i in ids:
            of_photo.setdefault(i, set()).add(cid)

    print(f"공개 사진 {n}장 · 사람이 묶은 카테고리 {len(members)}개"
          f"{' (kind=' + args.kind + ')' if args.kind else ''}")
    for cid, ids in sorted(members.items(), key=lambda kv: -len(kv[1])):
        print(f"    {cats[cid]['title'][:22]:<24} {len(ids):>4}장  ({cats[cid]['kind']})")
    seeds = sorted(of_photo)
    print(f"  → 정답이 있는 사진 {len(seeds)}장을 시드로 쓴다\n")

    # 운영자가 카테고리를 채운 사진은 대부분 오래된 것이라, 최신 400장 안에는
    # 정답이 거의 없다. 그 상태로 재면 '후보 범위 차이'가 '점수 품질'로 둔갑한다.
    # 그래서 후보 범위를 두 가지로 나눠 각각 잰다.
    for i, w in ((0, TAG_POOL), (1, n)):
        sub = [j for j in range(min(w, n))]
        c = sum(1 for j in sub if j in of_photo)
        print(f"  후보 {('최신 %d장' % w) if w == TAG_POOL else '전체 %d장' % n}"
              f" 중 정답 보유: {c}장 ({c / len(sub) * 100:.1f}%)")
    print()

    K = args.top_k
    rng = np.random.default_rng(RNG_SEED)

  # 아래 run() 이 후보 범위를 바꿔가며 같은 채점을 반복한다.
    def run(pool_size, title):
      hit = {"태그": 0, "벡터": 0, "무작위": 0}
      tot = 0
      for si in seeds:
        s = photos[si]
        gold = of_photo[si]
        pool = [j for j in range(n) if j != si][:pool_size]
        cand = [j for j in pool if not (s["album_id"] and photos[j]["album_id"] == s["album_id"])]
        if len(cand) < K:
            continue

        ts = {t.lower() for t in (s["mood_tags"] or [])}
        def score(j):
            return sum(1 for t in (photos[j]["mood_tags"] or []) if t.lower() in ts) if ts else 0
        tag_top = sorted(cand, key=lambda j: -score(j))[:K]

        sims = E @ E[si]
        vec_top = sorted(cand, key=lambda j: -sims[j])[:K]
        rnd_top = list(rng.choice(cand, size=K, replace=False))

        for name, sel in (("태그", tag_top), ("벡터", vec_top), ("무작위", rnd_top)):
            hit[name] += sum(1 for j in sel if of_photo.get(int(j), set()) & gold)
        tot += K

      print(f"{title} — precision@{K} · 시드 {len(seeds)}개\n")
      base = hit["무작위"] / tot * 100
      print(f"  {'방식':<10}{'적중률':>10}{'무작위 대비':>14}")
      for name in ("무작위", "태그", "벡터"):
        v = hit[name] / tot * 100
        print(f"  {name:<10}{v:>9.1f}%{v / base if base else 0:>12.2f}배")
      print()

    run(n, "① 같은 후보(공개 사진 전체)를 주고 — 점수 자체의 질")
    run(TAG_POOL, "② 실제 운영 조건(후보 최신 400장) — 태그 방식이 실제로 겪던 상황")
    print("\n  적중 = 추천된 사진이 시드와 같은 카테고리에 사람 손으로 들어가 있음")
    print("  ※ 이 정답지는 태그 쪽에 유리할 수 있다(모듈 상단 '알아둘 편향' 참조)")


if __name__ == "__main__":
    main()
