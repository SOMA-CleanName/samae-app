"""Render the representative moods as numbered text for the axis pass.

Axes are assigned to the 2,647 representatives, not to all 5,176 words — members
follow their head (docs/36 §10). The graph and every definition the reviewer reads
come from the committed bundle, so this runs on any machine; `out/` is Git-excluded
and only exists where the vectors were produced (§9-6).

Senses are numbered per head so a decision can cite one, and a decision can never
point at a definition that was not shown (compile_mood_axes.py enforces it).
"""
import json
import sys
from pathlib import Path

EMBED = Path(__file__).resolve().parent
OUT = EMBED / "out" / "mood-vocabulary"
BUNDLE = EMBED / "mood-review-bundle.json"
VERDICTS = OUT / "head-review.json"
LEVELS = ["초급", "중급", "고급", "없음"]
MAX_MEMBERS = 40   # 식구가 많은 묶음은 꼬리를 줄인다. 축 판단에 전원이 필요하지는 않다.


def load_verdicts(path=VERDICTS):
    """Graph review decisions, if any were recorded. 판정 0건이어도 메모는 읽는다."""
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}


def prepare(bundle, verdicts):
    """Apply the graph review to the groups: drop what was discarded, honour a changed head."""
    prepared = []
    for group in bundle["groups"]:
        verdict = verdicts.get(group["head"], {})
        if verdict.get("status") == "drop":
            continue
        head = verdict["head"] if verdict.get("status") == "head" and verdict.get("head") else group["head"]
        members = [w for w in [group["head"], *group["members"]] if w != head]
        prepared.append({"head": head, "members": members, "prompts": group["prompts"],
                         "note": verdict.get("note", "")})
    return prepared


def render(groups, senses, start=1):
    """start 는 전체 기준 번호다 — 조각마다 1번부터 매기면 합칠 때 번호가 겹친다."""
    lines, index = [], {}
    for position, group in enumerate(groups, start):
        head, entry = group["head"], senses.get(group["head"], {})
        lines.append(f'[{position:04d}] {head}  |  식구 {len(group["members"])}  '
                     f'|  {" / ".join(group["prompts"])}')
        lines.append(f'   · {entry.get("pos") or "?"} / {LEVELS[entry.get("level", 3)]}')
        definitions = entry.get("senses", [])
        for number, definition in enumerate(definitions, 1):
            lines.append(f'     s{number}. {definition}')
        if not definitions:
            lines.append('     (사전 뜻풀이 없음 — 뜻풀이를 지어내지 말 것)')
        if group["members"]:
            shown = group["members"][:MAX_MEMBERS]
            tail = "" if len(shown) == len(group["members"]) else f' … 외 {len(group["members"]) - len(shown)}개'
            lines.append(f'   · 식구: {" · ".join(shown)}{tail}')
        if group["note"]:
            # 그래프 검수에서 남긴 물음이다. 여기가 답할 자리다 (§9-7).
            lines.append(f'   · 검수 메모: {group["note"]}')
        index[str(position)] = {"head": head, "members": group["members"],
                                "prompts": group["prompts"], "senses": definitions}
        lines.append("")
    return "\n".join(lines), index


def main():
    # build_mood_axis_input.py [--from N] [--to N] [--stem axes]
    argv = sys.argv[1:]
    def option(name, fallback=None):
        return argv[argv.index(name) + 1] if name in argv else fallback
    stem = option("--stem", "axes")
    bundle = json.loads(BUNDLE.read_text(encoding="utf-8"))
    groups = prepare(bundle, load_verdicts())
    start = int(option("--from", 1))
    end = int(option("--to", len(groups)))
    window = groups[start - 1:end]
    text, index = render(window, bundle["senses"], start=start)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"{stem}.txt").write_text(text, encoding="utf-8")
    (OUT / f"{stem}-index.json").write_text(json.dumps(index, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"groups": len(index), "range": [start, end], "words": sum(
        1 + len(g["members"]) for g in window), "characters": len(text)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
