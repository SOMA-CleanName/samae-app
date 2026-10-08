"""검색어 → 사진 뼈대 검색어(D1) → 가족(D4) — KURE-v1 유사도 (docs/47 §9, 2026-10-04).

사진 뼈대에서 확보한 검색어(굳힌 층 v1 의 가족 `words` · `bundles` · 가족 이름)를 KURE 로 미리 임베딩해 두고,
검색이 들어오면 무드 글자("비 오는 날 감성")와 가장 가까운 검색어를 찾아 그 검색어가 든 가족을 돌려준다.
앱은 그 가족에 확정된 사진을 보여준다(siglip-text-search.ts · familySearch).

- 검색어가 무드 글자 안에 그대로 있으면(2글자 이상) 유사도 1.0 — "비 오는 날 감성" 은 비 오는 날 · 감성 둘 다 잡는다
- 가족 점수 = 그 가족 검색어 중 가장 가까운 것
- 고르기: 검색어가 그대로 든 가족이 있으면 그것만(최대 MAX_FAMILIES), 없으면 1위와 GAP 안쪽이고 FLOOR 이상인 가족(최대 MAX_NEAR)

벡터는 cache/kure-mood-terms.npz 에 담아 둔다(검색어 목록이 바뀌면 다시 만든다).
단독 실행: py mood_family_match.py "비 오는 날" "청순한 느낌" …  → 가까운 검색어 · 가족을 찍는다
"""

import hashlib
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
LAYERS = os.path.join(HERE, "mood-edits", "photo-mood-layers-v1.json")
CACHE = os.path.join(HERE, "cache", "kure-mood-terms.npz")

FLOOR = 0.55          # 이보다 먼 검색어는 같은 말로 보지 않는다
GAP = 0.04            # 1위와 이만큼 안쪽이면 함께 보여준다
MAX_FAMILIES = 4      # 검색어가 그대로 든 가족까지 합친 상한
MAX_NEAR = 3          # 그대로 든 것 없이 가까움만으로 고를 때의 상한 — 1위가 흐릿하면 비슷한 점수가 줄줄이 붙는다
MIN_CONTAINED = 2     # 무드 글자 안에 그대로 든 검색어로 칠 최소 글자 수


def load_terms(path=LAYERS):
    """검색어 → 그 검색어가 든 가족들. 가족 이름 · 묶음 이름 · 식구 낱말을 모두 검색어로 친다."""
    with open(path, encoding="utf-8") as f:
        layers = json.load(f)
    term_families = {}
    names = {}
    for fam in layers["families"]:
        names[fam["key"]] = fam["name"]
        for term in [fam["name"], *fam["bundles"], *fam["words"]]:
            term = term.strip()
            if term:
                term_families.setdefault(term, [])
                if fam["key"] not in term_families[term]:
                    term_families[term].append(fam["key"])
    return term_families, names


class FamilyMatcher:
    def __init__(self, encode, path=LAYERS):
        self.encode = encode
        self.term_families, self.names = load_terms(path)
        self.terms = sorted(self.term_families)
        self.vectors = self._vectors()

    def _vectors(self):
        digest = hashlib.sha1("\n".join(self.terms).encode()).hexdigest()
        try:
            cached = np.load(CACHE)
            if str(cached["digest"]) == digest:
                return cached["vectors"]
        except (OSError, KeyError, ValueError):
            pass
        vectors = self.encode(self.terms)
        os.makedirs(os.path.dirname(CACHE), exist_ok=True)
        np.savez(CACHE, vectors=vectors, digest=digest)
        return vectors

    def match(self, text, top_terms=8):
        """→ {"families": [{key, name, score, term}], "terms": [[term, score]], "family_scores": {key: score}}
        family_scores — 모든 가족의 가까움(그 가족 검색어 중 가장 가까운 것). 앱이 비슷한 큰 무드를 고를 때 쓴다(묶음은 앱이 안다)."""
        text = (text or "").strip()
        if not text:
            return {"families": [], "terms": [], "family_scores": {}}
        scores = self.vectors @ self.encode([text])[0]
        squashed = text.replace(" ", "")
        for i, term in enumerate(self.terms):
            if len(term.replace(" ", "")) >= MIN_CONTAINED and term.replace(" ", "") in squashed:
                scores[i] = 1.0
        order = np.argsort(-scores)
        family_scores = {}
        for i, term in enumerate(self.terms):
            for key in self.term_families[term]:
                family_scores[key] = max(family_scores.get(key, -1.0), float(scores[i]))
        best = {}
        for i in order[:200]:
            s = float(scores[i])
            if s < FLOOR:
                break
            for key in self.term_families[self.terms[i]]:
                if key not in best:
                    best[key] = (s, self.terms[i])
        ranked = sorted(best.items(), key=lambda kv: -kv[1][0])
        top = ranked[0][1][0] if ranked else 0.0
        exact = [(k, s, t) for k, (s, t) in ranked if s >= 0.999]
        near = [(k, s, t) for k, (s, t) in ranked if s < 0.999 and s >= top - GAP][:MAX_NEAR]
        picked = (exact or near)[:MAX_FAMILIES]
        return {
            "families": [{"key": k, "name": self.names[k], "score": round(s, 4), "term": t} for k, s, t in picked],
            "terms": [[self.terms[i], round(float(scores[i]), 4)] for i in order[:top_terms]],
            "family_scores": {k: round(v, 3) for k, v in family_scores.items()},
        }


if __name__ == "__main__":
    from purpose_nearest import kure_encoder

    matcher = FamilyMatcher(kure_encoder())
    for q in sys.argv[1:] or ["비 오는 날", "청순", "몽환적인", "가을 감성", "벚꽃", "시크한 흑백", "바다 여행", "필름 느낌", "따뜻한 햇살", "도시 야경"]:
        got = matcher.match(q)
        fams = " · ".join(f"{f['name']}({f['score']:.2f} {f['term']})" for f in got["families"])
        terms = " · ".join(f"{t} {s:.2f}" for t, s in got["terms"][:6])
        print(f"{q:12s} → {fams}\n{'':14s}{terms}")
