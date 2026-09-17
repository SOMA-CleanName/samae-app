"""Validate and compile the mood/not-mood screening pass.

Screening decides only whether an expression can describe how a photograph looks.
Axes are not assigned here — that is a separate pass over the accepted set, and the
final yes/no on any candidate belongs to a person, not to this file.
"""
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

OUT = Path(__file__).resolve().parent / "out" / "mood-vocabulary"
VERSION = "mood-screening-v2"
VERDICTS = {"Y": "mood", "N": "not_mood", "?": "undecided"}
FIELDS = 3


def parse(text, index):
    rows, errors, seen = [], [], set()
    for number, line in enumerate(text.splitlines(), 1):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) != FIELDS:
            errors.append(f"line {number}: expected {FIELDS} tab-separated fields, got {len(parts)}")
            continue
        position, verdict, reason = (p.strip() for p in parts)
        entry = index.get(position)
        if entry is None:
            errors.append(f"line {number}: unknown item {position!r}")
            continue
        if position in seen:
            errors.append(f"line {number}: duplicate item {position}")
            continue
        seen.add(position)
        if verdict not in VERDICTS:
            errors.append(f"[{position}] {entry['label']}: verdict must be Y, N or ?, got {verdict!r}")
            continue
        if not reason or reason == "-":
            errors.append(f"[{position}] {entry['label']}: reason required")
        rows.append({"candidate_id": entry["candidate_id"], "label": entry["label"],
                     "position": int(position), "verdict": VERDICTS[verdict], "reason": reason})
    missing = sorted(set(index) - seen, key=int)
    if missing:
        errors.append(f"{len(missing)} items were not screened: {missing[:20]}")
    duplicated = [label for label, n in Counter(r["candidate_id"] for r in rows).items() if n > 1]
    if duplicated:
        errors.append(f"same candidate screened under several positions: {duplicated[:10]}")
    return rows, errors


def compile_rows(rows):
    counts = Counter(row["verdict"] for row in rows)
    return {"version": VERSION, "compiled_at": datetime.now(timezone.utc).isoformat(),
            "reviewer": "claude-code-direct-review",
            "stage": "screening only — 축 분류 아님, 사람 검수 전",
            "note": "무드 여부 제안이며 최종 채택 여부는 사람이 정한다",
            "counts": dict(counts), "total": len(rows), "rows": rows}


def main():
    # compile_mood_screening.py [stem] — reads <stem>-index.json + screening-<stem>.tsv
    stem = sys.argv[1] if len(sys.argv) > 1 else "screen-priority"
    index = json.loads((OUT / f"{stem}-index.json").read_text(encoding="utf-8"))
    rows, errors = parse((OUT / f"screening-{stem}.tsv").read_text(encoding="utf-8"), index)
    if errors:
        print(json.dumps({"rejected": True, "error_count": len(errors), "errors": errors[:40]},
                         ensure_ascii=False, indent=1))
        sys.exit(1)
    data = compile_rows(rows)
    (OUT / f"screening-{stem}.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    accepted = [r for r in rows if r["verdict"] == "mood"]
    (OUT / f"accepted-{stem}.json").write_text(
        json.dumps({"version": VERSION, "total": len(accepted), "rows": accepted}, ensure_ascii=False),
        encoding="utf-8")
    print(json.dumps({"total": data["total"], "counts": data["counts"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
