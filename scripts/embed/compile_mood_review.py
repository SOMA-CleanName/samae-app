"""Validate the reviewed decisions against the sample and compile the v2 classification rows.

Rejects missing/duplicate/unknown items, invalid axes and sense references that do not exist,
so a decision can never point at a definition the reviewer was not shown.
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

OUT = Path(__file__).resolve().parent / "out" / "mood-vocabulary"
VERSION = "mood-sense-v2-pilot"
AXES = {"감정", "관계", "스타일", "온도", "계절", "빛", "색감", "질감", "에너지", "공간"}
KINDS = {"mood", "general", "pending"}
FIELDS = 7


def parse(text, index):
    rows, errors, seen = [], [], set()
    for number, line in enumerate(text.splitlines(), 1):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) != FIELDS:
            errors.append(f"line {number}: expected {FIELDS} tab-separated fields, got {len(parts)}")
            continue
        position, kind, primary, secondary, refs, usage, reason = (p.strip() for p in parts)
        entry = index.get(position)
        if entry is None:
            errors.append(f"line {number}: unknown item {position!r}")
            continue
        if position in seen:
            errors.append(f"line {number}: duplicate item {position}")
            continue
        seen.add(position)
        if kind not in KINDS:
            errors.append(f"[{position}] invalid kind {kind!r}")
            continue
        axes = [a for a in secondary.split(",") if a and a != "-"]
        cited = [r for r in refs.split(",") if r and r != "-"]
        available = {f"s{i + 1}": ref for i, ref in enumerate(entry["senses"])}
        if kind == "mood":
            if primary not in AXES:
                errors.append(f"[{position}] {entry['label']}: invalid primary axis {primary!r}")
                continue
            if not usage or usage == "-":
                errors.append(f"[{position}] {entry['label']}: mood needs a photo usage")
            if not cited and entry["senses"]:
                errors.append(f"[{position}] {entry['label']}: mood must cite a sense when definitions exist")
        elif primary != "-" or axes:
            errors.append(f"[{position}] {entry['label']}: {kind} must not carry an axis")
            continue
        for axis in axes:
            if axis not in AXES:
                errors.append(f"[{position}] {entry['label']}: invalid secondary axis {axis!r}")
            if axis == primary:
                errors.append(f"[{position}] {entry['label']}: secondary axis repeats the primary axis")
        if len(set(axes)) != len(axes):
            errors.append(f"[{position}] {entry['label']}: duplicate secondary axes")
        for ref in cited:
            if ref not in available:
                errors.append(f"[{position}] {entry['label']}: sense {ref} does not exist")
        if not reason or reason == "-":
            errors.append(f"[{position}] {entry['label']}: reason required")
        rows.append({"candidate_id": entry["candidate_id"], "label": entry["label"], "position": int(position),
                     "kind": kind, "axis": primary if kind == "mood" else None,
                     "version": VERSION, "rule": "sense_definition_review",
                     "evidence": {"secondary_axes": axes,
                                  "applicable_senses": [available[r] for r in cited if r in available],
                                  "photo_usage": usage if usage != "-" else None, "reason": reason,
                                  "reviewer": "claude-code-direct-review", "needs_review": True,
                                  "photo_suitability": "not_validated",
                                  "human_review_status": "not_reviewed"}})
    missing = sorted(set(index) - seen, key=int)
    if missing:
        errors.append(f"{len(missing)} items were not reviewed: {missing[:20]}")
    return rows, errors


def main():
    # compile_mood_review.py [stem] — reads <stem>-index.json + decisions-<stem>.tsv.
    stem = sys.argv[1] if len(sys.argv) > 1 else "review-500"
    index = json.loads((OUT / f"{stem}-index.json").read_text(encoding="utf-8"))
    text = (OUT / f"decisions-{stem}.tsv").read_text(encoding="utf-8")
    rows, errors = parse(text, index)
    if errors:
        print(json.dumps({"rejected": True, "errors": errors[:40], "error_count": len(errors)},
                         ensure_ascii=False, indent=1))
        sys.exit(1)
    counts = {}
    for row in rows:
        key = row["axis"] or row["kind"]
        counts[key] = counts.get(key, 0) + 1
    data = {"version": VERSION, "compiled_at": datetime.now(timezone.utc).isoformat(),
            "reviewer": "claude-code-direct-review", "counts": counts,
            "note": "AI 제안이며 사람 검수·사진 검증을 대신하지 않는다", "rows": rows}
    (OUT / f"classification-v2{'' if stem == 'review-500' else '-' + stem}.json").write_text(
        json.dumps(data, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"rows": len(rows), "counts": counts}, ensure_ascii=False))


if __name__ == "__main__":
    main()
