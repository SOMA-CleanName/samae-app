"""사전에 없는 말을 가장 가까운 사전 예시의 목적으로 보낸다 (2026-09-19).

검색어를 미리 다 예측할 수 없다. "베이비"·"학사모"·"예식장" 처럼 사전에 없는 말도 뜻이 가까운 사전 말
("아기"·"졸업사진"·"결혼식")이 있으면 그 목적·세부분류로 보낸다. 사전 예시는 query_parse 의 사전 그대로다 —
사전이 커질수록 정확해진다.

실측(KURE-v1, 사전에 없는 목적 말 26개): 가장 가까운 예시와의 점수가 0.80 이상인 18개는 목적이 전부 맞았고,
0.80 미만 8개 중 3개가 틀렸다(워크샵·스드메·집사). 그래서 0.80 에서 자른다.

**가장 가까운 예시 3개 중 2개 이상이 같은 목적일 때만** 보낸다. 제대로 잡힌 말은 이웃이 한 목적으로 모이고
(학사모 → 졸업·졸업·졸업), 잘못 잡힌 말은 1위만 튄다(교복 → 룩북·행사·행사, 여행 → 커플·상업·상업).

무드가 새지 않게 두 겹으로 막는다. 무드 검색어 3,425개를 넣었더니 140개(4.1%)가 0.80 을 넘었다 —
"멍울멍울"→강아지, "첫사랑"→돌, "황혼"→기념일 처럼 뜻이 아니라 글자가 닮아서다(docs/40 §14-4 와 같은 병).
  1. 무드 어휘(mood-terms-bundle.json 의 대표·검색어·별칭)에 있는 말은 보내지 않는다 — 형태소와,
     쪼개기 전 낱말 둘 다 본다("멍울멍울" 은 어휘에 있는데 Kiwi 가 "멍울" 로 쪼개 빠져나갔다)
  2. 명사만 보낸다 — "외로운"·"로맨틱한" 같은 꾸밈말은 목적 말이 아니다
  3. 가까운 예시가 **한 글자**이고 새 말 안에 들어 있으면 버린다 — 돌담·돌계단 → 돌. 한 글자는 다른 낱말 안에
     너무 쉽게 들어간다. 두 글자 이상은 살린다 — 결혼기념일 ⊃ 결혼기념, 커플링 ⊃ 커플 은 제 뜻의 합성어다.
     (강아지풀 → 강아지 는 이 규칙으로 못 거른다. 글자로는 커플링과 구분할 수 없다 — 알려진 한계)
  4. 목적이 아니라고 정한 말(query_parse.NOT_PURPOSE — 화보·컨셉·인테리어)은 비교하지 않는다

낱말만 넣으면 글자 모양으로 붙는다(docs/40). "○○ 사진 촬영" 으로 감싸 뜻으로 비교한다.
"""
import json
import threading
from functools import lru_cache
from pathlib import Path

import numpy as np

MODEL_ID = "nlpai-lab/KURE-v1"
THRESHOLD = 0.80
NEIGHBOURS = 3   # 가장 가까운 예시 몇 개를 보나
AGREE = 2        # 그중 몇 개가 1위와 같은 목적이어야 하나
TEMPLATE = "{} 사진 촬영"
NOUN_TAGS = {"NNG", "NNP", "SL"}
MOOD_BUNDLE = Path(__file__).resolve().parent / "mood-terms-bundle.json"


def load_mood_words(path=MOOD_BUNDLE):
    """무드 어휘 — 대표·검색어·별칭 전부. 여기 있는 말은 목적으로 보내지 않는다."""
    try:
        rows = json.loads(path.read_text(encoding="utf-8"))["rows"]
    except FileNotFoundError:
        return set()
    words = set()
    for row in rows:
        words.add(row["head"])
        words.update(row["terms"])
        words.update(row["aliases"].keys())
    return words


def examples_from(lexicon, kiwi=None):
    """사전 예시 — (목적, 세부분류|None, 문구). 같은 문구가 세부분류 사전에도 있으면 세부분류 쪽만 둔다.

    kiwi 를 주면 목적만 든 예시("졸업 촬영" — 작가 글 사전)에 세부분류를 붙인다. 검색어 분리기에 넣어 나온
    세부분류가 하나면 그것 — 새 말이 이 예시에 가장 가까워도 세부분류가 빠지지 않게."""
    rows = [(purpose, detail, phrase) for _forms, (purpose, phrase, detail) in lexicon]
    if kiwi is not None:
        from query_parse import parse
        rows = [(purpose, detail or _single_detail(parse(phrase, kiwi, lexicon), purpose), phrase)
                for purpose, detail, phrase in rows]
    with_detail = {phrase for _p, detail, phrase in rows if detail}
    seen, out = set(), []
    for purpose, detail, phrase in rows:
        if (detail is None and phrase in with_detail) or phrase in seen:
            continue
        seen.add(phrase)
        out.append((purpose, detail, phrase))
    return out


def _looks_alike(word, phrase):
    """한 글자 사전 말을 글자째 품은 다른 낱말인가 — "돌담" 과 "돌"."""
    a, b = word.replace(" ", ""), phrase.replace(" ", "")
    return len(b) == 1 and b in a and a != b


def _single_detail(parsed, purpose):
    own = [d for d in parsed["details"] if d.startswith(f"{purpose}.")]
    return own[0] if len(own) == 1 else None


class NearestPurpose:
    """word → (목적, 세부분류|None, 점수, 가장 가까운 예시) 또는 None."""

    def __init__(self, lexicon, encode, mood_words=None, threshold=THRESHOLD, kiwi=None):
        self.examples = examples_from(lexicon, kiwi)
        self.encode = encode
        self.mood_words = mood_words if mood_words is not None else load_mood_words()
        self.threshold = threshold
        self.vectors = encode([TEMPLATE.format(phrase) for _p, _d, phrase in self.examples])
        self._lookup = lru_cache(maxsize=4096)(self._nearest)

    def allowed(self, form, tag, word=None):
        from query_parse import NOT_PURPOSE
        return (tag in NOUN_TAGS and len(form) >= 2 and form not in NOT_PURPOSE
                and form not in self.mood_words and (word is None or word not in self.mood_words))

    def __call__(self, form, tag, word=None):
        """word — 쪼개기 전 낱말(띄어쓰기 단위). 무드 어휘 검사에 같이 쓴다."""
        if not self.allowed(form, tag, word):
            return None
        return self._lookup(form)

    def _nearest(self, form):
        scores = self.vectors @ self.encode([TEMPLATE.format(form)])[0]
        order = np.argsort(-scores)[:NEIGHBOURS]
        best = int(order[0])
        if scores[best] < self.threshold:
            return None
        purpose, detail, phrase = self.examples[best]
        if sum(self.examples[i][0] == purpose for i in order) < AGREE:
            return None   # 1위만 튀었다 — 이웃이 한 목적으로 모이지 않는다
        if _looks_alike(form, phrase):
            return None   # 뜻이 아니라 글자가 닮았다
        return purpose, detail, float(scores[best]), phrase


def kure_encoder(device=None, local_only=False):
    """KURE-v1 (bge-m3 계열) — CLS 풀링 후 정규화. 반정밀도로 올려 메모리를 반으로 줄인다.
    local_only — 받아 둔 모델만 쓴다(상주 서버가 켜질 때 2GB 를 몰래 내려받지 않게). 없으면 OSError."""
    import torch
    from transformers import AutoModel, AutoTokenizer

    device = device or ("mps" if torch.backends.mps.is_available() else "cpu")
    dtype = torch.float16 if device != "cpu" else torch.float32
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, local_files_only=local_only)
    model = AutoModel.from_pretrained(MODEL_ID, dtype=dtype, local_files_only=local_only).to(device).eval()

    lock = threading.Lock()   # 상주 서버는 요청마다 스레드다 — 같은 GPU 를 쓰는 모델 호출을 한 번에 하나로

    def encode(texts, batch=64):
        with lock:
            return _encode(texts, batch)

    def _encode(texts, batch):
        out = []
        for i in range(0, len(texts), batch):
            enc = tokenizer(texts[i:i + batch], padding=True, truncation=True, max_length=64,
                            return_tensors="pt").to(device)
            with torch.no_grad():
                hidden = model(**enc).last_hidden_state[:, 0]
            out.append(torch.nn.functional.normalize(hidden.float(), dim=-1).cpu().numpy())
        return np.concatenate(out).astype(np.float32)

    return encode
