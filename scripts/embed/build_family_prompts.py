"""가족(D4) 97개마다 SigLIP 에 물을 영어 문장 — qwen 초안 (docs/47 §3, 2026-10-01).

처음에는 묶음(622)마다 2~5단어 문구 하나였다(build_photo_mood_prompts.py). 결과를 보니 문구가 문제였다(사람 판단 2026-10-01):
80% 가 2~3단어, 뜻이 틀어진 것(시크 → blank expression), 사진에 안 보이는 말(감성 → emotional atmosphere).
그래서 **태그 단위인 가족마다 "a photo of …" 문장 4개**를 쓴다 — 빛 · 색 · 장소 · 포즈 · 표정처럼 사진에 **보이는 것**으로.
보이지 않는 감정 · 관계 가족도 그 감정이 드러나는 표정 · 장면으로 쓴다(예시 "감동적인").

입력: 가족 이름 · 큰 무드 이름 · 식구 말 · 가족 글(photo-family-notes.json) · 묶음 용례. 모델: 로컬 qwen3:14b(맥미니에서 돌리지 않는다).
사람이 화면(사진 태그 › 태그 관리 › 가족)에서 고치면 photo-family-prompt-edits.jsonl 이 초안을 이긴다.

  py build_family_prompts.py [--redo]   →  mood-edits/photo-family-prompts.json {가족 키: {prompts, by, at}}  (이어 하기, --redo 는 처음부터)
"""
import json
import sys
import time
import urllib.request
from datetime import datetime
from pathlib import Path

EMBED = Path(__file__).resolve().parent
EDITS = EMBED / "mood-edits"
OUT = EDITS / "photo-family-prompts.json"
MODEL = "qwen3:14b"

SYSTEM = (
    "You write English captions that an image-search model (SigLIP) matches against photos from a Korean portrait and snap "
    "photography service. You are given one mood family used to tag those photos. Write exactly 4 different sentences, each "
    "starting with \"a photo of\", describing what is VISIBLE in a photo with this mood: subject, pose, expression, clothing, "
    "setting, light, colors, camera look. Be concrete. Never use abstract words alone (emotional, atmosphere, vibe, mood, feeling) — "
    "show them as faces, gestures and scenes. 8 to 20 words each. One sentence per line. English only. No numbering, no quotes."
)

EXAMPLES = [
    ({"name": "골든 아워", "big": "햇살", "words": ["노을", "선라이즈", "골든 아워", "나른한 오후", "늦은 오후 햇살", "일몰"],
      "note": "해 뜨고 지는 시간의 햇빛", "usage": ["붉게 물든 노을빛 사진", "해가 낮게 깔린 오후의 따뜻한 빛"]},
     "a photo of a person backlit by low golden sunset light with a warm orange glow\n"
     "a photo of a couple silhouetted against an orange and pink evening sky\n"
     "a photo with long soft shadows and warm amber sunlight in the late afternoon\n"
     "a photo of a portrait with golden rim light shining through the hair at sunset"),
    ({"name": "감동적인", "big": "아련한", "words": ["벅찬 감동", "눈물 버튼", "울림 있는", "울컥하는"],
      "note": "벅찬 감동과 울림", "usage": ["눈물이 날 만큼 마음이 벅찬 사진"]},
     "a photo of a person with teary eyes and a trembling smile\n"
     "a photo of a bride wiping away tears during a wedding ceremony\n"
     "a photo of two people hugging tightly with moved faces and closed eyes\n"
     "a photo of a close-up face with glistening eyes in soft window light"),
]


def render(f):
    return (f"family: {f['name']}\nbig mood: {f['big']}\nwords: {', '.join(f['words'][:15])}\n"
            f"description: {f['note']}\nexamples of use: {' / '.join(f['usage'][:4])}")


def ask(f, retries=3):
    messages = [{"role": "system", "content": SYSTEM}]
    for example, answer in EXAMPLES:
        messages += [{"role": "user", "content": render(example)}, {"role": "assistant", "content": answer}]
    messages.append({"role": "user", "content": render(f)})
    body = json.dumps({"model": MODEL, "messages": messages, "stream": False, "think": False,
                       "options": {"temperature": 0.3, "num_predict": 220}}).encode()
    for attempt in range(retries):
        try:
            req = urllib.request.Request("http://127.0.0.1:11434/api/chat", data=body, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=300) as r:
                text = json.loads(r.read())["message"]["content"]
            if "</think>" in text:
                text = text.split("</think>", 1)[1]
            lines = [l.strip().strip("-•*0123456789. \"'") for l in text.splitlines()]
            lines = [l.rstrip(".") for l in lines if l.lower().startswith("a photo")]
            if len(lines) >= 3:
                return lines[:4]
        except Exception:                                                 # noqa: BLE001 — 다시 묻는다
            if attempt == retries - 1:
                raise
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"{f['name']}: 문장을 못 받았다")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    layers = json.loads((EDITS / "photo-mood-layers-v1.json").read_text(encoding="utf-8"))
    notes = json.loads((EDITS / "photo-family-notes.json").read_text(encoding="utf-8"))["notes"]
    nodes = json.loads((EDITS / "photo-neighbors.json").read_text(encoding="utf-8"))["nodes"]
    usage = json.loads((EDITS / "photo-term-usage.json").read_text(encoding="utf-8"))["usage"]
    big = {m["key"]: m["name"] for m in layers["moods"]}

    def note_of(members):
        mine = set(members)
        best = max(notes, key=lambda n: len(mine & set(n["members"])) / len(mine | set(n["members"])))
        return best["note"] if len(mine & set(best["members"])) / len(mine | set(best["members"])) >= 0.5 else ""

    done = {} if "--redo" in sys.argv or not OUT.exists() else json.loads(OUT.read_text(encoding="utf-8"))
    todo = [f for f in layers["families"] if f["key"] not in done]
    print(f"가족 {len(layers['families'])} · 쓸 것 {len(todo)}", flush=True)
    started = time.time()
    for n, f in enumerate(todo, 1):
        item = {"name": f["name"], "big": big.get(f["big"], ""), "words": f["words"], "note": note_of(f["bundles"]),
                "usage": [u for h in f["bundles"] for u in [nodes.get(h, {}).get("usage") or usage.get(h, "")] if u]}
        done[f["key"]] = {"prompts": ask(item), "by": MODEL, "at": datetime.now().isoformat(timespec="seconds")}
        if n % 10 == 0 or n == len(todo):
            OUT.write_text(json.dumps(done, ensure_ascii=False, indent=1), encoding="utf-8")
            rate = n / (time.time() - started)
            print(f"  {n}/{len(todo)}  {rate:.2f}/s  남은 {(len(todo) - n) / rate / 60:.0f}분", flush=True)
    print(f"끝 → {OUT.relative_to(EMBED)}")


if __name__ == "__main__":
    main()
