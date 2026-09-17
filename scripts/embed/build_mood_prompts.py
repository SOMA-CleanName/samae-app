"""Korean mood words -> short English photo prompts, via a local text-only LLM.

The prompt is not a translation. SigLIP matches photos against English text, and a
literal gloss ("그윽이" -> "deeply") retrieves nothing. What the vector needs is the
*look* the word points at ("deeply and serenely"), so the model is asked to read the
dictionary senses and describe the picture, not the word.

Output is a 3-field TSV (position, label, prompt) that the caller reviews by hand.
Nothing here writes to the database.
"""
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent / "out" / "mood-vocabulary"
OLLAMA = "http://127.0.0.1:11434"
MODEL = "qwen3:14b"
MAX_SENSES = 4

SYSTEM = """You write short English search phrases for a photo-search engine.

You are given a Korean word and its Korean dictionary definitions. Write the English
phrase that describes WHAT A PHOTO LOOKS LIKE when that word applies to it.

Rules:
- 2 to 5 words. No articles, no punctuation, no quotes.
- Describe the visible scene, mood, texture, light, colour or motion — not the word.
- A literal one-word gloss is wrong. "그윽이" is not "deeply"; it is "deeply and serenely".
- If several senses exist, use the one a photograph could show.
- Never answer in Korean. Never explain. Output the phrase only."""

EXAMPLES = [
    ("소복이", ["쌓이거나 담긴 물건 등이 볼록하게 많이."], "heaped up thickly"),
    ("그윽이", ["마음에 주는 느낌이 깊고 평안하게.", "인상이나 느낌이 은근하게."],
     "deeply and serenely"),
    ("낭패감", ["계획한 일이 실패하거나 기대에 어긋났다는 느낌."], "look of dismay"),
    ("퍼렇다", ["조금 탁하고 어둡게 푸르다."], "deep dark blue"),
]


def messages(label, senses):
    out = [{"role": "system", "content": SYSTEM}]
    for word, defs, answer in EXAMPLES:
        out.append({"role": "user", "content": render(word, defs)})
        out.append({"role": "assistant", "content": answer})
    out.append({"role": "user", "content": render(label, senses)})
    return out


def render(label, senses):
    body = "\n".join(f"- {s}" for s in senses[:MAX_SENSES])
    return f"word: {label}\ndefinitions:\n{body}"


def ask(label, senses, *, model=MODEL, retries=3):
    body = json.dumps({"model": model, "messages": messages(label, senses), "stream": False,
                       "think": False,
                       # 12토큰이면 5단어는 쓰고 그 이상은 못 쓴다 — 뜻을 여러 개
                       # 이어 붙이는 폭주(소복이 → "heaped up thickly bulging tightly
                       # fleshy swollen")를 길이로 막는다.
                       "options": {"temperature": 0.2, "num_predict": 12}}).encode()
    for attempt in range(retries):
        try:
            req = urllib.request.Request(f"{OLLAMA}/api/chat", data=body,
                                         headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=180) as r:
                return clean(json.loads(r.read())["message"]["content"])
        except (urllib.error.URLError, TimeoutError, KeyError) as exc:
            if attempt == retries - 1:
                raise
            time.sleep(2 * (attempt + 1))
            del exc


def clean(text):
    # Strip a stray <think> block, quotes, trailing period — the phrase alone is the answer.
    if "</think>" in text:
        text = text.split("</think>", 1)[1]
    text = text.strip().strip('"').strip("'").strip().rstrip(".")
    return " ".join(text.split())


def load(limit=None, only=None):
    pool = {c["candidate_id"]: c for c in json.loads(
        (OUT / "priority-pool.json").read_text(encoding="utf-8"))["items"]}
    rows = json.loads((OUT / "accepted-screen-priority.json").read_text(encoding="utf-8"))["rows"]
    rows.sort(key=lambda r: r["position"])
    if only is not None:
        rows = [r for r in rows if r["position"] in only]
    if limit:
        rows = rows[:limit]
    return [(r["position"], r["label"],
             [s["definition"] for d in pool[r["candidate_id"]]["dictionary"] for s in d["senses"]])
            for r in rows]


def main():
    # build_mood_prompts.py <out.tsv> [--limit N] [--from positions.tsv]
    args = sys.argv[1:]
    target = OUT / (args[0] if args else "mood-prompts.tsv")
    limit = int(args[args.index("--limit") + 1]) if "--limit" in args else None
    only = None
    if "--from" in args:
        src = Path(args[args.index("--from") + 1])
        only = {int(l.split("\t")[0]) for l in src.read_text(encoding="utf-8").splitlines() if l.strip()}
    items = load(limit, only)

    done = {}
    if target.exists():  # resume — a long run must survive a restart
        done = {int(l.split("\t")[0]): l for l in target.read_text(encoding="utf-8").splitlines() if l.strip()}
    started = time.time()
    with target.open("a", encoding="utf-8") as fh:
        for n, (pos, label, senses) in enumerate(items, 1):
            if pos in done:
                continue
            fh.write(f"{pos}\t{label}\t{ask(label, senses)}\n")
            fh.flush()
            if n % 50 == 0:
                rate = n / (time.time() - started)
                print(f"{n}/{len(items)}  {rate:.1f}/s  남은 {(len(items)-n)/rate/60:.0f}분",
                      flush=True)
    print(json.dumps({"total": len(items), "file": str(target)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
