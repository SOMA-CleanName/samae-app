"""Validate the multi-axis decisions against the input and compile the axis rows.

Replaces compile_mood_review.py for this pass. That one is built on the pilot's
primary/secondary split, which was retired (docs/36 §10-1): `황혼` must sit on 시간대
and 빛 as equals, because a primary-only search drops it from one of the two. It is
kept as is — the pilot's 500 rows still have to be read back in its format (§13-6).

What changed, besides the axes being equal:
  - `kind` is gone. Every item here is already settled as a mood (§7)
  - 11 axes, not 10 — 시간대 was added, and 계절 became 계절·날씨 (§8)
  - one row per representative, not per word. Members follow their head (§10)

Format, `|||` separated (docs §10-3):
    번호|||축|||sense참조|||사진 용례|||근거
    7|||시간대,빛|||s1|||해 질 무렵 붉게 물든 하늘|||해가 지는 때이면서 그때의 빛을 함께 가리킨다
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

OUT = Path(__file__).resolve().parent / "out" / "mood-vocabulary"
VERSION = "mood-axis-v1"
# 계절·날씨는 한 축이다. 비·눈·구름은 온도도 빛도 색감도 아니라 갈 데가 없었고,
# 계절 낱말과 뿌리가 같아(봄비·겨울바람·가을볕) 나눌 실익이 없다 (docs/36 §8).
AXES = {"감정", "관계", "스타일", "온도", "계절·날씨", "빛", "색감", "질감", "에너지", "공간", "시간대"}
SEPARATOR = "|||"
FIELDS = 5


def parse(text, index):
    rows, errors, seen = [], [], set()
    for number, line in enumerate(text.splitlines(), 1):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        parts = line.split(SEPARATOR)
        if len(parts) != FIELDS:
            errors.append(f"line {number}: expected {FIELDS} fields separated by {SEPARATOR!r}, "
                          f"got {len(parts)}")
            continue
        position, axis_field, ref_field, usage, reason = (p.strip() for p in parts)
        position = position.lstrip("[").rstrip("]").lstrip("0") or "0"
        entry = index.get(position)
        if entry is None:
            errors.append(f"line {number}: unknown item {position!r}")
            continue
        if position in seen:
            errors.append(f"line {number}: duplicate item {position}")
            continue
        seen.add(position)
        label = entry["head"]

        axes = [a.strip() for a in axis_field.split(",") if a.strip() and a.strip() != "-"]
        if not axes:
            errors.append(f"[{position}] {label}: at least one axis is required")
        for axis in axes:
            if axis not in AXES:
                errors.append(f"[{position}] {label}: invalid axis {axis!r}")
        if len(set(axes)) != len(axes):
            errors.append(f"[{position}] {label}: duplicate axes")

        available = {f"s{i + 1}": definition for i, definition in enumerate(entry["senses"])}
        cited = [r.strip() for r in ref_field.split(",") if r.strip() and r.strip() != "-"]
        for ref in cited:
            if ref not in available:
                errors.append(f"[{position}] {label}: sense {ref} does not exist")
        if entry["senses"] and not cited:
            errors.append(f"[{position}] {label}: must cite a sense when definitions exist")

        if not usage or usage == "-":
            errors.append(f"[{position}] {label}: photo usage required")
        if not reason or reason == "-":
            errors.append(f"[{position}] {label}: reason required")

        rows.append({"position": int(position), "head": label, "members": entry["members"],
                     "axes": axes, "prompts": entry["prompts"],
                     "cited_senses": [available[r] for r in cited if r in available],
                     "photo_usage": usage, "reason": reason,
                     "version": VERSION, "rule": "mood_axis_multi_review",
                     "evidence": {"reviewer": "claude-code-direct-review", "needs_review": True,
                                  "photo_suitability": "not_validated",
                                  "human_review_status": "not_reviewed"}})
    missing = sorted(set(index) - seen, key=int)
    if missing:
        errors.append(f"{len(missing)} items were not assigned: {missing[:20]}")
    return rows, errors


def summarise(rows):
    """축별 낱말 수와 낱말당 축 개수 분포. 다축이 실제로 쓰였는지 여기서 드러난다."""
    per_axis, per_count, words = {}, {}, 0
    for row in rows:
        words += 1 + len(row["members"])
        per_count[len(row["axes"])] = per_count.get(len(row["axes"]), 0) + 1
        for axis in row["axes"]:
            per_axis[axis] = per_axis.get(axis, 0) + 1
    return {"heads": len(rows), "words_covered": words,
            "per_axis": dict(sorted(per_axis.items(), key=lambda kv: -kv[1])),
            "axes_per_head": {str(k): per_count[k] for k in sorted(per_count)}}


def main():
    # compile_mood_axes.py [stem] — reads <stem>-index.json + <stem>-raw.txt.
    stem = sys.argv[1] if len(sys.argv) > 1 else "axes"
    index = json.loads((OUT / f"{stem}-index.json").read_text(encoding="utf-8"))
    text = (OUT / f"{stem}-raw.txt").read_text(encoding="utf-8")
    rows, errors = parse(text, index)
    if errors:
        print(json.dumps({"rejected": True, "errors": errors[:40], "error_count": len(errors)},
                         ensure_ascii=False, indent=1))
        sys.exit(1)
    counts = summarise(rows)
    data = {"version": VERSION, "compiled_at": datetime.now(timezone.utc).isoformat(),
            "reviewer": "claude-code-direct-review", "counts": counts,
            "note": "AI 제안이며 사람 검수·사진 검증을 대신하지 않는다. DB 반영은 0121 이후다",
            "rows": rows}
    (OUT / f"{stem}-v1.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(counts, ensure_ascii=False))


if __name__ == "__main__":
    main()
