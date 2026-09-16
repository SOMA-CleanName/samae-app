"""Pack the compiled axis assignment into one committed file for the admin screen.

Same reason as build_mood_review_bundle.py: `out/` is Git-excluded and only exists
where the vectors were produced, so a screen reading it would be blank everywhere
else. This keeps what the screen shows — the head, its axes, its members and the
one-line photo usage — and drops the audit trail (cited senses, reasoning,
evidence) that only the compiled JSON needs.
"""
import json
from pathlib import Path

EMBED = Path(__file__).resolve().parent
OUT = EMBED / "out" / "mood-vocabulary"
BUNDLE = EMBED / "mood-axes-bundle.json"


def build(compiled):
    groups, per_axis, words = [], {}, 0
    for row in compiled["rows"]:
        covered = 1 + len(row["members"])
        words += covered
        for axis in row["axes"]:
            tally = per_axis.setdefault(axis, {"heads": 0, "words": 0})
            tally["heads"] += 1
            tally["words"] += covered
        groups.append({"head": row["head"], "axes": row["axes"], "members": row["members"],
                       "prompts": row["prompts"], "usage": row["photo_usage"]})
    groups.sort(key=lambda g: (-len(g["members"]), g["head"]))
    return {"version": compiled["version"], "compiled_at": compiled["compiled_at"],
            "heads": len(groups), "words": words, "per_axis": per_axis, "groups": groups}


def main():
    compiled = json.loads((OUT / "axes-v1.json").read_text(encoding="utf-8"))
    bundle = build(compiled)
    BUNDLE.write_text(json.dumps(bundle, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"heads": bundle["heads"], "words": bundle["words"],
                      "size_mb": round(BUNDLE.stat().st_size / 1_048_576, 2)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
