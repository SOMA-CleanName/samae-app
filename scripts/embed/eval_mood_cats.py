#!/usr/bin/env python3
"""무드 카테고리 자동 배정이 가능한지 재본다. (docs/22 §7.5 · 8단계)

운영자가 손으로 넣은 explore_category_photos(kind='mood') 를 **정답지로 삼아**,
우리가 만든 값으로 그 배정을 맞힐 수 있는지 측정한다. 이 과제에서 처음으로
"좋아졌나" 를 눈이 아니라 숫자로 판정할 수 있는 지점이다.

    scripts/embed/.venv/bin/python scripts/embed/eval_mood_cats.py

**읽기 전용.** 아무것도 쓰지 않는다.

세 가지를 낸다.
  A. lift  — 각 무드 카테고리에서 어떤 auto_mood_tags 가 과대표되나.
             내가 대응표를 손으로 짜지 않고 데이터에서 뽑는다.
  B. 태그 기반 예측 — auto_mood_tags 만으로 카테고리를 맞히면 어느 정도인가.
  C. 임베딩 기반 예측 — photos.embedding 중심(centroid)으로 맞히면 어느 정도인가.

정답지가 불완전하다는 점에 주의
    무드 카테고리 커버리지가 13~22% 라, 어떤 사진이 카테고리에 없다고 해서
    "그 무드가 아니다" 라는 뜻이 아니다. 아직 배정 안 됐을 뿐일 수 있다.
    그래서 precision 은 과소평가되고 신뢰할 수 없다. **recall@K 로 본다** —
    점수 상위 K 장 안에 알려진 멤버가 얼마나 들어오나. 무작위 대비 몇 배인지가 핵심.
"""

import collections
import json
import os
import re
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import moods  # noqa: E402

PAGE = 300


def load_env():
    env = {}
    for line in open(os.path.join(HERE, "..", "..", ".env.local"), encoding="utf-8"):
        m = re.match(r"^([A-Z_]+)=(.*)$", line.strip())
        if m:
            env[m[1]] = m[2].strip('"')
    return env


def get(env, path):
    url = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1/" + path
    key = env["SUPABASE_SERVICE_ROLE_KEY"]
    req = urllib.request.Request(url, headers={"apikey": key, "Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def page_all(env, path, page=1000):
    out, off = [], 0
    while True:
        sep = "&" if "?" in path else "?"
        p = get(env, f"{path}{sep}offset={off}&limit={page}")
        out += p
        if len(p) < page:
            return out
        off += page


def main():
    import numpy as np

    env = load_env()

    cats = [c for c in get(env, "explore_categories?select=id,slug,title,kind,published")
            if c["kind"] == "mood"]
    cat_ids = {c["id"] for c in cats}
    print(f"무드 카테고리 {len(cats)}개: " + ", ".join(c["title"] for c in cats) + "\n")

    mem = page_all(env, "explore_category_photos?select=category_id,photo_id")
    members = collections.defaultdict(set)
    for m in mem:
        if m["category_id"] in cat_ids:
            members[m["category_id"]].add(m["photo_id"])
    print(f"정답지: kind=mood 소속 {sum(len(v) for v in members.values())}행 "
          f"(전체 멤버십 {len(mem)}행 중)\n")

    rows, off = [], 0
    while True:
        p = get(env, "photos?select=id,auto_mood_tags,embedding&visibility=eq.published"
                     f"&embedding=not.is.null&offset={off}&limit={PAGE}")
        rows += p
        if len(p) < PAGE:
            break
        off += PAGE
    idx = {r["id"]: i for i, r in enumerate(rows)}
    N = len(rows)
    emb = np.array([json.loads(r["embedding"]) for r in rows], dtype=np.float32)
    emb /= np.linalg.norm(emb, axis=1, keepdims=True)
    tags = [set(r["auto_mood_tags"] or []) for r in rows]
    print(f"공개·임베딩 보유 {N}장\n")

    base = {lab: sum(1 for t in tags if lab in t) / N for lab in moods.LABELS + moods.MEASURED_LABELS}

    print("═" * 74)
    print("A. lift — 각 카테고리에서 과대표되는 우리 태그 (1.0 = 카탈로그 평균)")
    print("═" * 74)
    for c in cats:
        ids = [idx[p] for p in members[c["id"]] if p in idx]
        if not ids:
            continue
        cnt = collections.Counter(t for i in ids for t in tags[i])
        lifts = [(lab, (n / len(ids)) / base[lab], n) for lab, n in cnt.items()
                 if base[lab] > 0 and n >= 10]
        lifts.sort(key=lambda x: -x[1])
        print(f"\n  {c['title']} ({len(ids)}장)")
        for lab, lf, n in lifts[:6]:
            print(f"     {lf:5.2f}×  {lab:<12} ({n}장, 소속 중 {n / len(ids) * 100:.0f}%)")

    print("\n" + "═" * 74)
    print("B/C. 예측 — 점수 상위 K 안에 알려진 멤버가 얼마나 들어오나 (recall@K)")
    print("     정답지가 불완전해 precision 은 못 믿는다. 무작위 대비 배수를 본다.")
    print("═" * 74)

    rng = np.random.default_rng(0)
    for c in cats:
        ids = np.array(sorted(idx[p] for p in members[c["id"]] if p in idx))
        if len(ids) < 20:
            continue
        K = len(ids)
        y = np.zeros(N, dtype=bool)
        y[ids] = True

        # B. 태그 — lift 상위 태그를 가중치로 점수화. 정답 누출을 막으려 5-fold 로 나눈다.
        # C. 임베딩 — 멤버 중심 벡터와의 코사인. 역시 5-fold.
        fold = rng.permutation(len(ids)) % 5
        hit_tag = hit_emb = 0.0
        exp = 0.0
        for f in range(5):
            tr, te = ids[fold != f], ids[fold == f]
            if len(tr) < 5 or len(te) == 0:
                continue
            # 무작위 기대치는 **이 폴드의 실제 후보/정답 수**로 계산해야 한다.
            # 훈련 멤버를 후보에서 빼놓고 전체 멤버 기준으로 기대치를 잡으면
            # 기준선이 5배쯤 부풀려져 멀쩡한 예측이 "무작위보다 나쁨" 으로 보인다.
            exp += K * len(te) / (N - len(tr))
            # 학습: 이 폴드의 훈련 멤버로만 대응표·중심을 만든다
            cnt = collections.Counter(t for i in tr for t in tags[i])
            w = {lab: np.log((n / len(tr)) / base[lab]) for lab, n in cnt.items()
                 if base[lab] > 0 and n >= 5}
            s_tag = np.array([sum(w.get(t, 0.0) for t in tags[i]) for i in range(N)])
            cen = emb[tr].mean(axis=0)
            cen /= np.linalg.norm(cen)
            s_emb = emb @ cen
            # 평가: 훈련 멤버는 후보에서 빼고, 상위 K 안에 테스트 멤버가 몇 개 들어오나
            mask = np.ones(N, dtype=bool)
            mask[tr] = False
            for s, name in ((s_tag, "tag"), (s_emb, "emb")):
                ss = np.where(mask, s, -np.inf)
                top = np.argpartition(-ss, K)[:K]
                h = int(y[top].sum())
                if name == "tag":
                    hit_tag += h
                else:
                    hit_emb += h
        print(f"\n  {c['title']} — 멤버 {K}장 / 후보 {N}장 · 상위 {K}장을 뽑아 채점")
        print(f"     무작위 기대   {exp / 5:6.1f}장 (폴드 평균)")
        print(f"     태그 기반     {hit_tag / 5:6.1f}장  ({hit_tag / max(exp, 1e-9):.1f}배)")
        print(f"     임베딩 기반   {hit_emb / 5:6.1f}장  ({hit_emb / max(exp, 1e-9):.1f}배)")


if __name__ == "__main__":
    main()
