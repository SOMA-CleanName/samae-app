"""사진 무드 표현 뼈대를 검색이 읽을 표로 굳힌다 (docs/40 §16-2 7번 · §17-7, 2026-10-01).

검색 결과가 모자라면 넓히는 순서 — 묶음(D2) → 같은 무리(D3) → 같은 가족(D4) → 이웃 → 같은 큰 무드(D5).
검색은 이 표만 읽는다(src/lib/mood-search-map.json). 화면 · 판정 파일(mood-edits/)은 저장소 밖으로 나갈 수 있어서다(§17-5 "전처리가 끝나면 뺀다").

  heads   묶음 이름 목록 — 번호가 곧 묶음 id
  terms   {정규화한 말: 묶음 id} — 묶음 식구 + 흡수된 옛 표기(photo-term-merges.jsonl 의 from)
  words   [묶음 id → 그 묶음의 말(원래 표기)] — 태그와 맞춰 볼 말
  cluster [묶음 id → 같은 무리의 다른 묶음 id]
  family  [묶음 id → 가족 id], families [가족 id → 묶음 id]
  big     [가족 id → 큰 무드 id], moods [큰 무드 id → 가족 id]
  near    [묶음 id → 이웃 묶음 id, 센 순] — 서로 고름 · 엇갈림만(후보 밖 · 억지는 약해서 뺀다), 최대 NEAR 개

  py build_mood_search_map.py   →  src/lib/mood-search-map.json
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

EMBED = Path(__file__).resolve().parent
EDITS = EMBED / "mood-edits"
OUT = EMBED.parent.parent / "src" / "lib" / "mood-search-map.json"
NEAR = 8
STRONG = {"mutual": 2, "disagreed": 1}


def norm(text):
    """search-metadata-core.ts 의 normalizeMetadataText 와 같다 — 소문자 · NFKC · 글자와 숫자만."""
    return re.sub(r"[^\w]|_", "", unicodedata.normalize("NFKC", text.lower()))


def main():
    groups = json.loads((EDITS / "photo-groups.json").read_text(encoding="utf-8"))["groups"]
    clusters = json.loads((EDITS / "photo-clusters.json").read_text(encoding="utf-8"))["clusters"]
    fam = json.loads((EDITS / "photo-families.json").read_text(encoding="utf-8"))
    bundle = json.loads((EDITS / "photo-neighbors.json").read_text(encoding="utf-8"))
    merges = [json.loads(l) for l in (EDITS / "photo-term-merges.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]

    heads = [g["members"][0] for g in groups]
    gid = {h: i for i, h in enumerate(heads)}
    of_term = {t: gid[g["members"][0]] for g in groups for t in g["members"]}

    words = [list(dict.fromkeys(g["members"])) for g in groups]
    for m in merges:                                                      # 흡수된 옛 표기도 그 묶음의 말이다(노을빛 → 노을)
        if m["to"] in of_term and m["from"] not in of_term:
            words[of_term[m["to"]]].append(m["from"])

    terms = {}
    for i, ws in enumerate(words):
        for w in ws:
            terms.setdefault(norm(w), i)                                  # 같은 꼴이 두 묶음에 있으면 먼저 온 쪽(묶음 대표 쪽)

    cluster = [[] for _ in heads]
    for c in clusters:
        ids = [gid[h] for h in c["members"] if h in gid]
        for i in ids:
            cluster[i] = [j for j in ids if j != i]

    fam_ids = {f["id"]: k for k, f in enumerate(fam["families"])}
    family = [0] * len(heads)
    families = []
    for k, f in enumerate(fam["families"]):
        families.append([gid[h] for h in f["members"]])
        for h in f["members"]:
            family[gid[h]] = k
    mood_ids = {m["id"]: k for k, m in enumerate(fam["moods"])}
    big = [mood_ids[f["big"]] for f in fam["families"]]
    moods = [[fam_ids[x] for x in m["families"]] for m in fam["moods"]]

    ranked = [[] for _ in heads]
    for e in bundle["edges"]:
        w = STRONG.get(e["state"])
        if not w or e["a"] not in gid or e["b"] not in gid:
            continue
        a, b = gid[e["a"]], gid[e["b"]]
        ranked[a].append((w, e.get("score", 0), b))
        ranked[b].append((w, e.get("score", 0), a))
    near = [[j for _, _, j in sorted(r, reverse=True)][:NEAR] for r in ranked]

    out = {"made_at": fam["made_at"], "source": "docs/40 §17-7 — build_mood_search_map.py", "heads": heads, "terms": terms,
           "words": words, "cluster": cluster, "family": family, "families": families, "big": big, "moods": moods, "near": near}
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"묶음 {len(heads)} · 말 {len(terms)} · 무리에 든 묶음 {sum(1 for c in cluster if c)} · 가족 {len(families)} · 큰 무드 {len(moods)} · "
          f"이웃 있는 묶음 {sum(1 for n in near if n)} → {OUT.relative_to(EMBED.parent.parent)} ({OUT.stat().st_size // 1024}KB)")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
