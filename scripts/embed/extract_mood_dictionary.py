"""Extract headwords/POS/categories from NIKL XML; Korean sense definitions on request.

Examples (SenseExample), translated Equivalent definitions and media are never collected.
"""
import json
import io
import re
import sys
import xml.etree.ElementTree as ET

CONTROL = re.compile(rb'[\x00-\x08\x0b\x0c\x0e-\x1f]')
META = ("partOfSpeech", "semanticCategory", "vocabularyLevel", "lexicalUnit")


def _lexical_entries(path):
    with open(path, 'rb') as handle:
        raw = handle.read()
    # Some mirrored translation definitions contain U+0008, forbidden in XML 1.0.
    # Retain the original cached bytes/hash; strip only invalid control bytes for parsing.
    clean, count = CONTROL.subn(b'', raw)
    if count:
        print(f'XML invalid control bytes removed for parsing: {count}', file=sys.stderr)
    for _, node in ET.iterparse(io.BytesIO(clean), events=("end",)):
        if node.tag != "LexicalEntry":
            continue
        lemma = node.find("Lemma/feat[@att='writtenForm']")
        if lemma is not None and lemma.get("val"):
            features = {f.get("att"): f.get("val") for f in node.findall("feat")}
            yield node, {"entry_key": node.get("val"), "label": lemma.get("val"),
                         "metadata": {key: features[key] for key in META if key in features}}
        node.clear()


def extract(path):
    for _, row in _lexical_entries(path):
        yield row


def extract_senses(path):
    """Add the Korean definition of each sense; findall('feat') stays on direct children only."""
    for node, row in _lexical_entries(path):
        senses = []
        for sense in node.findall("Sense"):
            definition = next((f.get("val") for f in sense.findall("feat")
                               if f.get("att") == "definition" and f.get("val")), None)
            if definition:
                senses.append({"sense_id": sense.get("val"), "definition": " ".join(definition.split())})
        yield {**row, "senses": senses}


if __name__ == "__main__":
    arguments = sys.argv[1:]
    paths = [a for a in arguments if not a.startswith("--")]
    rows = extract_senses(paths[0]) if "--senses" in arguments else extract(paths[0])
    print(json.dumps(list(rows), ensure_ascii=True))
