"""Pack everything the admin review screen needs into one committed file.

The screen used to read `mood-heads-0.91.json` plus the 12MB `priority-pool.json`
out of `scripts/embed/out/`, which is a Git-excluded, machine-local directory —
so the review could only be done on the machine that produced it. This writes a
single bundle carrying the graph and, for each word in it, just the part of
speech, level and senses the reviewer actually reads.
"""
import json
from pathlib import Path

EMBED = Path(__file__).resolve().parent
OUT = EMBED / "out" / "mood-vocabulary"
BUNDLE = EMBED / "mood-review-bundle.json"
LEVELS = ["초급", "중급", "고급", "없음"]
MAX_SENSES = 3   # 검수자는 앞의 두어 개만 읽는다. 전부 담으면 파일이 세 배가 된다.


def level_of(entries):
    found = [LEVELS.index(e["metadata"]["vocabularyLevel"])
             for e in entries
             if e.get("metadata", {}).get("vocabularyLevel") in LEVELS]
    return min(found, default=len(LEVELS) - 1)


def build(out=OUT, layer="0.91"):
    graph = json.loads((out / f"mood-heads-{layer}.json").read_text(encoding="utf-8"))
    pool = json.loads((out / "priority-pool.json").read_text(encoding="utf-8"))
    wanted = {w for g in graph["groups"] for w in [g["head"], *g["members"]]}
    senses = {}
    for item in pool["items"]:
        if item["label"] not in wanted:
            continue
        entries = item["dictionary"]
        senses[item["label"]] = {
            "pos": "/".join(sorted({e["metadata"].get("partOfSpeech") for e in entries
                                    if e.get("metadata", {}).get("partOfSpeech")})),
            "level": level_of(entries),
            "senses": [s["definition"] for e in entries for s in e["senses"]][:MAX_SENSES],
        }
    missing = sorted(wanted - set(senses))
    return {"layer": layer, "groups": graph["groups"], "senses": senses,
            "words": len(wanted), "without_senses": missing}


def main():
    bundle = build()
    BUNDLE.write_text(json.dumps(bundle, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"groups": len(bundle["groups"]), "words": bundle["words"],
                      "without_senses": len(bundle["without_senses"]),
                      "size_mb": round(BUNDLE.stat().st_size / 1_048_576, 2)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
