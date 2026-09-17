"""Pick the fixed 500-candidate pilot sample and attach the dictionary senses to review.

Selection is deterministic (candidate id order inside each stratum) and records why each
item was chosen, so the same sample can be rebuilt and audited later.
"""
import json
import re
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

OUT = Path(__file__).resolve().parent / "out" / "mood-vocabulary"
VERSION = "mood-sense-v2-pilot"
AXES = ("감정", "관계", "스타일", "온도", "계절", "빛", "색감", "질감", "에너지", "공간")
# Must appear whatever the sampling picks: the user's required case plus the policy examples.
REQUIRED = ("부드럽다", "거칠다", "따뜻하다", "차갑다", "몽환적인", "강아지")

normalize = lambda value: re.sub(r"\s+", " ", unicodedata.normalize("NFKC", value).strip())


def load(out=OUT):
    read = lambda name: json.loads((out / name).read_text(encoding="utf-8"))
    return read("collection.json"), read("classification.json"), read("senses.json")


class Evidence:
    """Attaches dictionary senses and other source rows to a candidate.

    The mirror reuses one LexicalEntry id for a headword and its idioms/proverbs, so the
    collector's (source_id, entry_key) row survives for only one of them. Candidates are
    matched on (entry_key, label); a candidate whose stored row was overwritten is still
    recovered by label and marked so the provenance stays honest.
    """

    def __init__(self, collection, senses):
        self.source_id = senses["source_id"]
        self.by_label = defaultdict(list)
        for entry_key, group in senses["entries"].items():
            for item in group:
                self.by_label[normalize(item["label"])].append((entry_key, item))
        self.stored, self.extra = defaultdict(set), defaultdict(list)
        for entry in collection["entries"]:
            if entry["source_id"] == self.source_id:
                self.stored[entry["candidate_id"]].add(entry["entry_key"])
            else:
                self.extra[entry["candidate_id"]].append({"source_id": entry["source_id"],
                                                          "entry_key": entry["entry_key"],
                                                          "metadata": entry["metadata"]})

    def dictionary(self, candidate):
        rows = []
        for entry_key, item in self.by_label.get(normalize(candidate["label"]), []):
            rows.append({"source_id": self.source_id, "entry_key": entry_key, "label": item["label"],
                         "metadata": item["metadata"], "senses": item["senses"],
                         "join": "source_row" if entry_key in self.stored[candidate["id"]] else "label_recovered"})
        return rows

    def item(self, candidate, v1_row, stratum, reason):
        return {"candidate_id": candidate["id"], "label": candidate["label"],
                "existing_axis": candidate["axis"], "selection_status": candidate["selection_status"],
                "stratum": stratum, "selection_reason": reason,
                "v1": {key: v1_row.get(key) for key in ("kind", "axis", "rule")},
                "dictionary": self.dictionary(candidate),
                "other_sources": self.extra.get(candidate["id"], [])}


def build(out=OUT):
    collection, classification, senses = load(out)
    evidence = Evidence(collection, senses)
    v1 = {row["candidate_id"]: row for row in classification["rows"]}
    candidates = {c["id"]: c for c in collection["candidates"]}
    cache = {cid: evidence.dictionary(c) for cid, c in candidates.items()}
    parts_of_speech = lambda rows: {r["metadata"].get("partOfSpeech") for r in rows}

    picked, items = set(), []
    def take(candidate_id, stratum, reason):
        if candidate_id in picked:
            return False
        picked.add(candidate_id)
        items.append(evidence.item(candidates[candidate_id], v1.get(candidate_id, {}), stratum, reason))
        return True

    order = lambda pool: sorted(pool)          # candidate ids are content hashes: stable, unbiased order

    for label in REQUIRED:
        for cid in order([cid for cid, c in candidates.items() if normalize(c["label"]) == label]):
            take(cid, "required", f"필수 사례 {label}")

    adjectives = [cid for cid in candidates
                  if v1.get(cid, {}).get("kind") == "pending" and "형용사" in parts_of_speech(cache[cid])]
    for cid in order(adjectives):
        if len([i for i in items if i["stratum"] in ("required", "A-미분류 형용사")]) >= 300:
            break
        take(cid, "A-미분류 형용사", "v1 보류 상태의 형용사 — 감각·질감 표현이 모여 있는 구간")

    per_axis = defaultdict(list)
    for cid in candidates:
        row = v1.get(cid, {})
        if row.get("kind") == "mood":
            per_axis[row["axis"]].append(cid)
    for axis in AXES:
        taken, pool = 0, sorted(per_axis.get(axis, []), key=lambda cid: (not cache[cid], cid))
        for cid in pool:                       # a stratum overlap moves on rather than shrinking the axis quota
            if taken == 10:
                break
            taken += take(cid, "B-축 편중 점검", f"v1이 {axis}으로 본 표현 — 대표 축 재확인")

    conflicts = [cid for cid in candidates
                 if v1.get(cid, {}).get("rule") in ("conflicting_axes", "ambiguous_dictionary_senses")]
    taken = 0
    for cid in order(conflicts):
        if taken == 50:
            break
        taken += take(cid, "C-다의어 보류", "v1이 의미 충돌·모호를 이유로 보류한 사례")

    general = [cid for cid in candidates if v1.get(cid, {}).get("kind") == "general"]
    taken = 0
    for cid in order(general):
        if taken == 50:
            break
        taken += take(cid, "D-비무드 대조군", "v1이 일반 어휘로 본 사례 — 과도한 무드 편입 감시용")

    counts = defaultdict(int)
    for item in items:
        counts[item["stratum"]] += 1
    without = [i["label"] for i in items if not i["dictionary"]]
    return {"built_at": datetime.now(timezone.utc).isoformat(), "version": VERSION,
            "dictionary_revision": senses["revision"], "dictionary_source_id": evidence.source_id,
            "counts": dict(counts), "total": len(items),
            "definitions_missing": {"count": len(without), "labels": without},
            "items": items}


if __name__ == "__main__":
    data = build()
    (OUT / "sample-500.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"total": data["total"], "counts": data["counts"],
                      "definitions_missing": data["definitions_missing"]["count"]}, ensure_ascii=False))
