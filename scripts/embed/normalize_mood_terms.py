"""무드 낱말을 검색어 꼴로 정리한다.

사진은 늘 "{무드} 사진" 으로 찾는다. 그래서 낱말은 사전 표제형(조용하다)이 아니라
검색에 쓰는 꼴(조용한)이어야 한다. 명사가 더 자연스러우면 명사로 둔다(노을).

묶음 안에서 완전히 같은 뜻(활용형·표기 변이·같은 말)은 하나로 합치고,
결이 다른 것은 각각 살린다 — 조용하다 묶음의 고요한·잔잔한·차분한은 서로 다른 무드다.

LLM 은 **고르기만** 한다. 맛보기에서 "다듬어라" 를 시켰더니 없는 낱말을 지어냈다
(사명감 → 전의·패기·승부욕). 그래서 내놓은 낱말은 어간이 입력에 있어야 살아남고,
꼴은 규칙(korean_form)이 만든다.

  python normalize_mood_terms.py --sample 40      # 맛보기
  python normalize_mood_terms.py                   # 전량 (이어서 돌린다)
"""
import argparse, json, pathlib, random, re, sys, time, urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from korean_form import adnominal, is_adverb

ROOT = pathlib.Path(__file__).resolve().parent
BUNDLE = ROOT / "mood-axes-bundle.json"
OUT = ROOT / "out" / "mood-vocabulary" / "normalized-terms.jsonl"
OLLAMA, MODEL = "http://localhost:11434/api/chat", "qwen3:8b"

# 긴 꼬리부터 떼야 한다 — "명멸하는" 에서 "는" 만 떼면 "명멸하" 가 남는다.
TAILS = ("스러운", "스럽다", "거리는", "거리다", "하니", "하는", "하다", "이는", "이다",
         "대는", "대다", "되는", "되다", "로운", "롭다", "지는", "지다",
         "한", "인", "은", "는", "운", "진", "된", "히", "적", "이")

def stem(word: str) -> str:
    """표기 변이와 활용을 눈감고 비교할 뿌리. 깜빡거리다·껌벅이다·깜박이는 을 한 덩어리로 본다."""
    w = word
    for _ in range(2):                       # 깜박거리다 처럼 꼬리가 겹친 것
        for tail in TAILS:
            if w.endswith(tail) and len(w) > len(tail):
                w = w[: -len(tail)]
                break
        else:
            break
    w = w.translate(str.maketrans("빡뻑벅뻔껌끔깰", "박박박번깜깜갤"))
    half = len(w) // 2                        # 깜박깜박 같은 겹말
    if half and w[:half] == w[half:]:
        w = w[:half]
    return w

SYSTEM = (
    "너는 사진 검색어를 고른다. 낱말은 모두 \"{낱말} 사진\" 꼴로 쓰인다.\n"
    "주어진 낱말 중에서만 고른다. **없는 낱말을 지어내지 마라.**\n"
    "고름: 결이 다른 무드. 고요한·잔잔한·차분한은 서로 다르니 각각 고른다.\n"
    "버림: 완전히 같은 말. 표기만 다른 것(깜박/깜빡/껌벅), 활용만 다른 것"
    "(-거리다/-대다/-이다/-하다), 부사꼴(-히/-이)은 대표 하나만 남긴다.\n"
    "맨 앞 낱말이 그 묶음의 대표다. 대표보다 검색어로 더 자연스러운 낱말이 있으면 "
    "대표를 버리고 그것을 골라도 된다.\n"
    "출력은 고른 낱말만 쉼표로. 설명 금지."
)
SHOTS = [
    ("깜박이다, 깜박, 깜박거리다, 깜빡, 깜빡이다, 껌벅거리다, 끔벅이다, 명멸", "깜박이다, 명멸"),
    ("조용하다, 고요하다, 고요히, 고즈넉하다, 잔잔하다, 잔잔히, 진정되다, 차분하다, 평온하다, 조용히, 평화롭다, 편안하다, 느긋하다",
     "조용하다, 고요하다, 고즈넉하다, 잔잔하다, 차분하다, 평온하다, 평화롭다, 편안하다, 느긋하다"),
    ("노을, 놀, 저녁놀", "노을"),
]

class Stalled(Exception):
    """ollama 가 잠깐 멈춘 것. 한 묶음 때문에 전량이 죽으면 안 된다."""


def ask(prompt: str, retries: int = 5) -> str:
    msgs = [{"role": "system", "content": SYSTEM}]
    for user, out in SHOTS:
        msgs += [{"role": "user", "content": user}, {"role": "assistant", "content": out}]
    msgs.append({"role": "user", "content": prompt})
    body = json.dumps({"model": MODEL, "messages": msgs, "stream": False,
                       "think": False,
                       "options": {"temperature": 0, "num_predict": 256}}).encode()
    for attempt in range(retries):
        try:
            req = urllib.request.Request(OLLAMA, body, {"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(r.read())["message"]["content"].strip()
        except Exception as exc:
            if attempt == retries - 1:
                raise Stalled(str(exc)) from exc
            print(f"  재시도 {attempt + 1}: {exc}", file=sys.stderr)
            time.sleep(2 ** attempt)          # 멈췄으면 조금씩 더 기다린다
    return ""

def split_words(raw: str) -> list[str]:
    out = []
    for piece in re.split(r"[,\n·]", raw):
        word = piece.strip().strip("·-—\"'`").strip()
        if word and len(word) <= 20 and " " not in word:
            out.append(word)
    return out

def candidates(group: dict) -> list[str]:
    """부사는 같은 뿌리의 제대로 된 꼴이 있으면 미리 뺀다 — '고요히' 는 '고요하다' 가 삼킨다."""
    words = [group["head"], *group["members"]]
    solid = {stem(w) for w in words if not is_adverb(w)}
    return [w for w in words if not (is_adverb(w) and stem(w) in solid)]

def best_form(words: list[str]) -> str:
    """같은 뿌리에서 검색 꼴을 만들기 좋은 낱말을 고른다.
    사전형(황홀하다)이 명사(황홀)보다 낫다 — '황홀 사진' 보다 '황홀한 사진' 이 자연스럽다."""
    def rank(word: str) -> int:
        if word.endswith("다"):
            return 0
        return 2 if is_adverb(word) else 1
    return sorted(words, key=lambda w: (rank(w), len(w)))[0]


def choose(group: dict) -> tuple[list[str], list[str]]:
    """LLM 이 고른 것 중 입력에 어간이 있는 것만 살린다.
    대표도 버릴 수 있다 — 더 자연스러운 낱말이 있으면 그게 대표 자리를 넘겨받는다."""
    pool = candidates(group)
    if len(pool) == 1:
        return pool, []
    same: dict[str, list[str]] = {}
    for word in pool:
        same.setdefault(stem(word), []).append(word)
    by_stem = {key: best_form(words) for key, words in same.items()}
    picked, made_up = [], []
    for word in split_words(ask(", ".join(pool))):
        key = stem(word)
        if key in by_stem:
            if by_stem[key] not in picked:
                picked.append(by_stem[key])
        else:
            made_up.append(word)
    return picked or [group["head"]], made_up

def verbish(word: str, usage: str) -> bool:
    """동사는 -는, 형용사는 -ㄴ. 용례에 '-하는/-이는' 으로 나오면 동사로 본다."""
    root = stem(word)
    return bool(root) and bool(re.search(re.escape(root) + r"\w*(이는|하는|거리는|대는)", usage))

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", type=int, default=0, help="이만큼만 골라 돌린다")
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()

    groups = json.load(BUNDLE.open())["groups"]
    if args.sample:
        rng = random.Random(args.seed)
        big = [g for g in groups if len(g["members"]) >= 3]
        mid = [g for g in groups if 1 <= len(g["members"]) <= 2]
        solo = [g for g in groups if not g["members"]]
        half = args.sample // 2
        groups = (rng.sample(big, min(half, len(big)))
                  + rng.sample(mid, min(args.sample // 4, len(mid)))
                  + rng.sample(solo, min(args.sample - half - args.sample // 4, len(solo))))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    done = set()
    if OUT.exists() and not args.sample:
        done = {json.loads(l)["head"] for l in OUT.open()}
    todo = [g for g in groups if g["head"] not in done]
    print(f"{len(todo)}개 / 이미 끝난 것 {len(done)}개", file=sys.stderr)

    started = time.time()
    with OUT.open("w" if args.sample else "a") as sink:
        failed = 0
        for i, group in enumerate(todo, 1):
            try:
                picked, made_up = choose(group)
            except Stalled as exc:
                # 건너뛴 묶음은 파일에 안 남으므로 다시 돌리면 이어서 잡는다.
                failed += 1
                print(f"  건너뜀 {group['head']}: {exc}", file=sys.stderr)
                continue
            terms = []
            for word in picked:
                form = adnominal(word, verbish(word, group["usage"]))
                if form not in terms:
                    terms.append(form)
            by_stem = {stem(t): t for t in terms}
            sink.write(json.dumps({
                "head": group["head"], "axes": group["axes"], "usage": group["usage"],
                "terms": terms,
                # 버린 낱말은 사라지지 않는다. 검색 별칭으로 살아남아야 한다 —
                # 사용자가 "깜빡거리다" 로 찾아도 "깜박이는" 사진이 나와야 한다.
                "aliases": {w: by_stem.get(stem(w), terms[0])
                            for w in [group["head"], *group["members"]] if w not in terms},
                "made_up": made_up,
                "odd": [t for t in terms if t.endswith("다") or is_adverb(t) or len(t) < 2],
            }, ensure_ascii=False) + "\n")
            sink.flush()
            if i % 50 == 0 or i == len(todo):
                rate = i / (time.time() - started)
                print(f"{i}/{len(todo)} · {rate:.2f}/s · 남은 {int((len(todo)-i)/max(rate,1e-9)/60)}분"
                      + (f" · 건너뜀 {failed}" if failed else ""), file=sys.stderr)

if __name__ == "__main__":
    main()
