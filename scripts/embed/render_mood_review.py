"""Render the pilot sample as review text, numbering every sense so a decision can cite it."""
import json
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parent / "out" / "mood-vocabulary"


def render(data, screening=False):
    """screening=True drops everything a yes/no pass cannot use: the old rule's verdict
    (it is often wrong and must not anchor the decision), an unassigned editorial axis,
    entry ids, and sentiment polarity. Definitions and word class stay."""
    lines, index = [], {}
    for position, item in enumerate(data["items"], 1):
        v1 = item["v1"]
        if screening:
            axis = "" if item["existing_axis"] == "unassigned" else f'  |  기존축={item["existing_axis"]}'
            lines.append(f'[{position:03d}] {item["label"]}{axis}')
        else:
            lines.append(f'[{position:03d}] {item["label"]}  |  층={item["stratum"]}  '
                         f'|  v1={v1["kind"]}/{v1["axis"] or "-"} ({v1["rule"]})  |  기존축={item["existing_axis"]}')
        refs, number = [], 0
        for entry in item["dictionary"]:
            meta = entry["metadata"]
            if screening:
                lines.append(f'   · {meta.get("partOfSpeech","?")} / {meta.get("semanticCategory","범주없음")}')
            else:
                lines.append(f'   · {meta.get("partOfSpeech","?")} / {meta.get("semanticCategory","범주없음")}'
                             f' / {meta.get("vocabularyLevel","-")} / {meta.get("lexicalUnit","-")}'
                             f'  [{entry["entry_key"]}, {entry["join"]}]')
            for sense in entry["senses"]:
                number += 1
                refs.append({"source_id": entry["source_id"], "entry_key": entry["entry_key"],
                             "sense_id": sense["sense_id"]})
                lines.append(f'     s{number}. {sense["definition"]}')
        for other in item["other_sources"]:
            meta = other["metadata"]
            editorial = other["source_id"].startswith("editorial:")
            if screening and not editorial:
                continue                       # KNU polarity says nothing about photo mood
            detail = meta.get("description") or f'극성 {meta.get("polarity")}'
            lines.append(f'   · [{"편집" if editorial else "KNU"}] {detail}')
        if not item["dictionary"]:
            lines.append('     (사전 뜻풀이 없음 — 뜻풀이를 지어내지 말 것)')
        # String keys so the in-memory index matches the one read back from JSON.
        index[str(position)] = {"candidate_id": item["candidate_id"], "label": item["label"], "senses": refs}
        lines.append("")
    return "\n".join(lines), index


if __name__ == "__main__":
    # render_mood_review.py [input.json] [output stem] [--screening]
    screening = "--screening" in sys.argv
    arguments = [a for a in sys.argv[1:] if not a.startswith("--")]
    source, stem = (arguments + ["sample-500.json", "review-500"])[:2]
    data = json.loads((OUT / source).read_text(encoding="utf-8"))
    text, index = render(data, screening=screening)
    (OUT / f"{stem}.txt").write_text(text, encoding="utf-8")
    (OUT / f"{stem}-index.json").write_text(json.dumps(index, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"items": len(index), "lines": text.count(chr(10)),
                      "characters": len(text)}, ensure_ascii=False))
