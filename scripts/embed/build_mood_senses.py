"""Build sense definitions for collected candidates from the pinned dictionary cache.

Verifies each cached XML against the sha256 recorded in collection.json before reading it,
so the definitions provably come from the same revision the candidates were collected from.
"""
import hashlib
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from extract_mood_dictionary import extract_senses

OUT = Path(__file__).resolve().parent / "out" / "mood-vocabulary"


def build(out=OUT):
    collection = json.loads((out / "collection.json").read_text(encoding="utf-8"))
    source = next(s for s in collection["sources"] if s["id"].startswith("krdict-mirror:"))
    revision = source["revision"]
    # The mirror reuses one LexicalEntry id for a headword and its idioms/proverbs, so an
    # entry_key maps to a list and the candidate label picks the right one on join.
    entries, files, missing = {}, [], []
    for record in source["metadata"]["files"]:
        cached = out / f'{revision}-{Path(record["path"]).name}'
        if not cached.exists():
            missing.append(record["path"])
            continue
        digest = hashlib.sha256(cached.read_bytes()).hexdigest()
        if digest != record["sha256"]:
            raise SystemExit(f'Cached dictionary sha256 mismatch: {record["path"]}')
        count = 0
        for row in extract_senses(cached):
            count += 1
            entries.setdefault(row["entry_key"], []).append(
                {"label": row["label"], "metadata": row["metadata"], "senses": row["senses"]})
        if count != record["entries"]:
            raise SystemExit(f'Entry count changed for {record["path"]}: {count} != {record["entries"]}')
        files.append({"path": record["path"], "sha256": digest, "entries": count})
        print(f'{record["path"]}: {count} entries', file=sys.stderr)
    if missing:
        raise SystemExit(f'Cached dictionary files absent, re-run the collector: {missing}')
    lexical = [item for group in entries.values() for item in group]
    defined = sum(1 for item in lexical if item["senses"])
    shared = sum(1 for group in entries.values() if len(group) > 1)
    return {
        "built_at": datetime.now(timezone.utc).isoformat(),
        "source_id": source["id"], "revision": revision,
        "license_status": source["license_status"], "attribution": source["attribution"],
        "scope": "Korean Sense/definition only; SenseExample quotes, Equivalent translations and media excluded",
        "stats": {"files": len(files), "entry_keys": len(entries), "lexical_entries": len(lexical),
                  "entries_with_definition": defined, "entries_without_definition": len(lexical) - defined,
                  "senses": sum(len(item["senses"]) for item in lexical),
                  "entry_keys_shared_by_several_entries": shared},
        "files": files, "entries": entries,
    }


if __name__ == "__main__":
    started = time.time()
    data = build()
    data["stats"]["build_seconds"] = round(time.time() - started, 1)
    (OUT / "senses.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(data["stats"], ensure_ascii=False))
