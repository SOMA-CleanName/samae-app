"""가족마다 영어 문장 → 한글 문장 (docs/47 §3-2, 2026-10-01).

사람 요청: 영어 문장 칸 아래 한글 칸을 두고, 한글로 고치면 영어로 바꿔 쓴다. 처음 한글 칸은 지금 영어 문장을 옮겨 채운다.
줄마다 짝이다 — 한글 i 번째 줄 ↔ 영어 i 번째 줄. 번역은 로컬 qwen3:14b(맥미니에서 돌리지 않는다).
⚠️ 2026-10-01 첫 초벌은 이 스크립트가 아니라 Claude(Sonnet 에이전트)로 옮겼다 — qwen 이 peonies(작약)를 백합으로 옮기는 등 명사를 틀렸고,
   한글 칸이 편집의 기준이 되므로 오역이 다시 영어로 번지면 안 돼서다. 새 가족이 생겨 초벌이 더 필요할 때 이 스크립트를 쓴다(검수하고).

  py build_family_prompts_ko.py [--redo]   →  mood-edits/photo-family-prompts-ko.json {가족 키: {prompts_ko, from, by, at}}
    from — 옮길 때의 영어 문장. 영어를 나중에 고치면 화면이 "한글이 예전 영어 기준" 이라고 알린다
"""
import json
import sys
import time
import urllib.request
from datetime import datetime
from pathlib import Path

EMBED = Path(__file__).resolve().parent
EDITS = EMBED / "mood-edits"
OUT = EDITS / "photo-family-prompts-ko.json"
MODEL = "qwen3:14b"
SYSTEM = ("Translate one English photo caption into natural Korean that a Korean photographer would write to describe the photo. "
          "Keep every visual detail, add nothing. Drop the leading \"a photo of\" and end with a noun phrase like '~ 사진'. "
          "Output the Korean sentence only.")
EXAMPLE = ("a photo of a couple silhouetted against the sunset on a beach, backlit by orange light",
           "노을 지는 바닷가에서 주황빛 역광에 실루엣만 보이는 커플 사진")


def current_english():
    """지금 영어 문장 — 사람이 고친 마지막 줄이 초안을 이긴다(tag_photo_moods.family_prompts 와 같은 규칙)."""
    drafts = json.loads((EDITS / "photo-family-prompts.json").read_text(encoding="utf-8"))
    out = {k: v["prompts"] for k, v in drafts.items()}
    path = EDITS / "photo-family-prompt-edits.jsonl"
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                e = json.loads(line)
                out[e["key"]] = e["prompts"]
    return out


def ask(english):
    body = json.dumps({"model": MODEL, "stream": False, "think": False, "options": {"temperature": 0.2, "num_predict": 80},
                       "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": EXAMPLE[0]},
                                    {"role": "assistant", "content": EXAMPLE[1]}, {"role": "user", "content": english}]}).encode()
    for attempt in range(3):
        try:
            req = urllib.request.Request("http://127.0.0.1:11434/api/chat", data=body, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=120) as r:
                text = json.loads(r.read())["message"]["content"]
            text = text.split("</think>")[-1].strip().strip("\"'").splitlines()[0].strip()
            if text:
                return text
        except Exception:                                                 # noqa: BLE001 — 다시 묻는다
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"번역 실패: {english}")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    english = current_english()
    done = {} if "--redo" in sys.argv or not OUT.exists() else json.loads(OUT.read_text(encoding="utf-8"))
    todo = [k for k in english if k not in done]
    print(f"가족 {len(english)} · 옮길 것 {len(todo)}", flush=True)
    for n, key in enumerate(todo, 1):
        done[key] = {"prompts_ko": [ask(e) for e in english[key]], "from": english[key], "by": MODEL,
                     "at": datetime.now().isoformat(timespec="seconds")}
        if n % 10 == 0 or n == len(todo):
            OUT.write_text(json.dumps(done, ensure_ascii=False, indent=1), encoding="utf-8")
            print(f"  {n}/{len(todo)}", flush=True)
    print(f"끝 → {OUT.relative_to(EMBED)}")


if __name__ == "__main__":
    main()
