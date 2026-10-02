"""사진 무드 뼈대 묶음(622) → SigLIP 에 물을 영어 문구 (docs/47 §3, 2026-10-01).

SigLIP 은 영어로 물어야 한다 — 한글을 그대로 넣으면 품질이 떨어진다(docs/22 §7.5). 문구는 번역이 아니라
"그 말이 가리키는 사진의 모습" 이다(build_mood_prompts.py 와 같은 규칙 · 같은 예시 · 같은 qwen3:14b).

1) 이미 있는 문구를 먼저 쓴다 — 사진 표현 목록(mood-additions.json 의 prompt)과 사전 쪽 묶음(mood-axes-bundle.json 의 prompts,
   사전 묶음의 말 · 꼴 · 변형이 이 묶음의 말과 같을 때)
2) 없는 묶음만 로컬 qwen 이 쓴다(사람 결정 2026-10-01 "없으면 qwen") — 입력은 묶음 이름 · 같은 말 · 사진 용례

  py build_photo_mood_prompts.py   →  mood-edits/photo-mood-prompts.json {묶음 이름: {prompts, source}}  (이어 하기 가능)
"""
import json
import re
import sys
import time
import unicodedata
from pathlib import Path

from build_mood_prompts import ask

EMBED = Path(__file__).resolve().parent
EDITS = EMBED / "mood-edits"
OUT = EDITS / "photo-mood-prompts.json"


def norm(text):
    return re.sub(r"[^\w]|_", "", unicodedata.normalize("NFKC", text.lower()))


def existing(groups):
    """묶음마다 이미 있는 영어 문구 — 사진 표현 목록 · 사전 쪽 묶음."""
    add = {norm(e["label"]): e["prompt"] for e in json.loads((EMBED / "mood-additions.json").read_text(encoding="utf-8"))["entries"] if e.get("prompt")}
    rows = {r["head"]: r for r in json.loads((EMBED / "mood-terms-bundle.json").read_text(encoding="utf-8"))["rows"]}
    dic = {}
    for g in json.loads((EMBED / "mood-axes-bundle.json").read_text(encoding="utf-8"))["groups"]:
        words = {g["head"], *g["members"]}
        for w in list(words):
            if w in rows:
                words |= set(rows[w]["terms"]) | set(rows[w]["aliases"])
        for w in words:
            dic.setdefault(norm(w), []).extend(g.get("prompts") or [])
    out = {}
    for g in groups:
        found = []
        for w in g["members"]:
            found += [add[norm(w)]] if norm(w) in add else []
            found += dic.get(norm(w), [])
        if found:
            out[g["members"][0]] = list(dict.fromkeys(p.strip().rstrip(".") for p in found))[:4]
    return out


def main():
    groups = json.loads((EDITS / "photo-groups.json").read_text(encoding="utf-8"))["groups"]
    nodes = json.loads((EDITS / "photo-neighbors.json").read_text(encoding="utf-8"))["nodes"]
    usage = json.loads((EDITS / "photo-term-usage.json").read_text(encoding="utf-8"))["usage"]
    have = existing(groups)
    done = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    for head, prompts in have.items():
        done[head] = {"prompts": prompts, "source": "existing"}
    todo = [g for g in groups if g["members"][0] not in done]
    print(f"묶음 {len(groups)} · 이미 있는 문구 {len(have)} · qwen 이 쓸 것 {len(todo)}", flush=True)
    started = time.time()
    for n, g in enumerate(todo, 1):
        head = g["members"][0]
        senses = [u for u in [nodes.get(head, {}).get("usage", "") or usage.get(head, "")] if u]
        if len(g["members"]) > 1:
            senses.append("같은 말: " + ", ".join(g["members"][1:8]))
        done[head] = {"prompts": [ask(head, senses or [head])], "source": "qwen3:14b"}
        if n % 25 == 0 or n == len(todo):
            OUT.write_text(json.dumps(done, ensure_ascii=False, indent=1), encoding="utf-8")
            rate = n / (time.time() - started)
            print(f"  {n}/{len(todo)}  {rate:.2f}/s  남은 {(len(todo) - n) / rate / 60:.0f}분", flush=True)
    OUT.write_text(json.dumps(done, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"끝 — 묶음 {len(done)} → {OUT.relative_to(EMBED)}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
