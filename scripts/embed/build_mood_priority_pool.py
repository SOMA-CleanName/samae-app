"""List the candidates worth reviewing next, after the 500-item pilot.

The pilot found moods concentrated in modifiers and in a handful of dictionary semantic
categories, so the pool is everything still undecided that has a Korean definition and
matches either test. Each item records which test admitted it, and the pool is emitted in
the same shape as the pilot sample so render_mood_review.py can render it unchanged.
"""
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

from sample_mood_review import OUT, Evidence, load

# Word classes that modify how something looks, rather than naming a thing or an action.
MODIFIERS = {"형용사", "관형사", "부사"}
# Categories that actually produced moods in the pilot, plus the shape/quality catch-alls
# where texture and light vocabulary turned out to be filed.
CATEGORIES = {
    "개념 > 색깔", "개념 > 밝기", "개념 > 온도", "개념 > 속도", "개념 > 시간",
    "개념 > 모양", "개념 > 성질", "자연 > 기상 및 기후", "자연 > 자연물", "자연 > 지형",
    "인간 > 감정", "인간 > 감각", "인간 > 태도", "인간 > 성격", "인간 > 용모",
    "사회 생활 > 인간관계", "주생활 > 주거 상태",
}


def build(out=OUT, decided="classification-v2.json"):
    collection, classification, senses = load(out)
    evidence = Evidence(collection, senses)
    v1 = {row["candidate_id"]: row for row in classification["rows"]}
    path = out / decided
    already = {row["candidate_id"] for row in
               json.loads(path.read_text(encoding="utf-8"))["rows"]} if path.exists() else set()

    items, skipped = [], Counter()
    for candidate in sorted(collection["candidates"], key=lambda c: c["id"]):
        if candidate["id"] in already:
            skipped["이미 판단함"] += 1
            continue
        # An entry carrying no definition is no basis for a decision, same as having no entry.
        rows = [row for row in evidence.dictionary(candidate) if row["senses"]]
        if not rows:
            skipped["뜻풀이 없음"] += 1
            continue
        parts = {r["metadata"].get("partOfSpeech") for r in rows} & MODIFIERS
        categories = {r["metadata"].get("semanticCategory") for r in rows} & CATEGORIES
        if not parts and not categories:
            skipped["수식어도 무드 범주도 아님"] += 1
            continue
        reason = " / ".join(filter(None, [
            f"수식 품사 {'·'.join(sorted(parts))}" if parts else "",
            f"무드 범주 {'·'.join(sorted(categories))}" if categories else ""]))
        item = evidence.item(candidate, v1.get(candidate["id"], {}), "P-우선 구간", reason)
        item["dictionary"] = rows
        item["admitted_by"] = {"modifiers": sorted(parts), "categories": sorted(categories)}
        item["review_characters"] = sum(len(s["definition"]) for r in rows for s in r["senses"])
        items.append(item)

    by_pos, by_v1 = Counter(), Counter()
    for item in items:
        for part in {r["metadata"].get("partOfSpeech") for r in item["dictionary"]}:
            by_pos[part or "품사없음"] += 1
        by_v1[item["v1"].get("kind") or "없음"] += 1
    return {"built_at": datetime.now(timezone.utc).isoformat(), "version": "mood-sense-v2-priority",
            "dictionary_revision": senses["revision"], "dictionary_source_id": evidence.source_id,
            "total": len(items), "skipped": dict(skipped),
            "parts_of_speech": dict(by_pos.most_common()), "v1_kind": dict(by_v1.most_common()),
            "definition_characters": sum(i["review_characters"] for i in items),
            "counts": {"P-우선 구간": len(items)}, "items": items}


if __name__ == "__main__":
    data = build()
    (OUT / "priority-pool.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({key: data[key] for key in
                      ("total", "skipped", "parts_of_speech", "v1_kind", "definition_characters")},
                     ensure_ascii=False))
