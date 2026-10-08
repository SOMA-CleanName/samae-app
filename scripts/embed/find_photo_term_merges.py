"""사진 무드 표현 뼈대 — 묶음 안 "같은 낱말의 다른 표기" 흡수 (docs/40 §17-5, 2026-09-23).

묶음(photo-groups.json)마다 식구를 읽고, 띄어쓰기 · 맞춤법 · 어미 · 접미(빛 · 지는 · 톤 · 느낌)만 다른 것을 한 이름으로 합친다 —
노을 · 노을 지는 · 노을빛 → 노을, 해 질 녘 · 해질녘 → 해질녘. 뜻이 같아도 낱말이 다르면(노을 · 석양 · 선셋) 합치지 않는다 —
그것은 다음 층(무리)이 사람 손으로 한다. 두 갈래:
  띄어쓰기  공백만 다른 식구는 규칙으로 바로 합친다(대표: 작가 사진 많은 쪽, 같으면 공백 없는 쪽)
  모델      나머지는 qwen3:14b(로컬)가 읽는다 — 답은 "대표 <= 변형, 변형" 한 줄씩, 식구에 없는 말은 버린다
대표(합친 뒤 남는 이름)는 사람 결정(2026-09-23): 누가 봐도 대표적인 무드 말 — 가장 많이 쓰이고 무드에 가까운 것. 작가 사진 수를 힌트로 준다.
결과는 mood-edits/photo-term-merges.jsonl {from, to, how, at} — mergePhotoTerms 가 사람 기록(photo-term-edits.jsonl)보다 먼저 적용한다(사람 기록이 이긴다).
원래 표기는 alt 로 남아 화면에 보인다. 모델 답 원문은 out/mood-vocabulary/photo-merge-proposals.jsonl 에 남긴다.

  py find_photo_term_merges.py            → 누적: 지난 줄은 그대로, 새 짝만 덧붙인다(잘못된 줄은 손으로 지운다). 모델 답 원문은 다시 쓴다
  py find_photo_term_merges.py --dry      → 파일 안 쓰고 결과만 출력
이어서 npx tsx export-photo-terms.mts → py build_photo_groups.py <조각> → py build_photo_cluster_candidates.py 순으로 다시 만든다.
셋째 갈래 "묶음 밖": 서로 다른 묶음에 남은 짝은 소리 변형 없이 한쪽이 다른 쪽의 기본형일 때만(시네마틱 · 시네마틱한).
"""
import datetime
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

from build_cluster_candidates import soften

EMBED = Path(__file__).resolve().parent
OUT = EMBED / "out" / "mood-vocabulary"
EDITS = EMBED / "mood-edits"
MODEL = "qwen3:14b"

SYSTEM = (
    "너는 사진 검색어 목록을 다듬는다. 주어진 말들 가운데 '같은 낱말의 다른 표기' 만 찾아 하나로 합친다.\n"
    "합치는 것: 띄어쓰기 · 맞춤법 · 어미(한/하는/지는)만 다른 것, 같은 낱말에 꼬리만 붙은 것(노을빛 · 필름톤 · 필름룩 · 필름 색감), 줄임말(필카 = 필름 카메라).\n"
    "합치지 않는 것: 뜻이 같아도 낱말이 다른 것(노을 · 석양 · 선셋 · 일몰), 다른 낱말이 붙어 뜻을 더한 것(심쿵 · 심장 저격, 설렘 · 설렘 폭발은 합치지만 설렘 · 첫사랑은 아님).\n"
    "대표는 목록에 있는 말 가운데 누가 봐도 대표적인 무드 말 — 가장 많이 쓰이고(괄호 안 숫자는 작가 사진 수, 힌트) 무드를 바로 떠올리게 하는 기본형. "
    "짧다고 대표가 아니고, 사진 수가 0이어도 널리 쓰는 표준 표기면 대표가 될 수 있다. 목록에 없는 말을 대표로 만들지 않는다.\n"
    "출력은 한 줄에 하나, '대표 <= 변형, 변형' 형식만(숫자는 빼고). 합칠 것이 없으면 '없음'. 설명 금지.\n"
    "보기) 노을(4), 노을 지는(0), 노을빛(0), 석양(0), 선셋(0), 해 질 녘(0), 해질녘(0)\n"
    "노을 <= 노을 지는, 노을빛\n해질녘 <= 해 질 녘"
)


def ask(members, photos):
    shown = ", ".join(f"{m}({photos.get(m, 0)})" for m in members)
    body = json.dumps({"model": MODEL, "think": False, "stream": False,
                       "messages": [{"role": "system", "content": SYSTEM},
                                    {"role": "user", "content": shown}],
                       "options": {"temperature": 0, "num_predict": 300}}).encode()
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:11434/api/chat", data=body, headers={"Content-Type": "application/json"}), timeout=600) as r:
                return json.loads(r.read())["message"]["content"].strip()
        except Exception:
            if attempt == 2:
                raise
            time.sleep(3 * (attempt + 1))


# 모델은 뜻이 같은 다른 낱말까지 합친다(심장 저격 → 심쿵, 캠코더 → VHS, 루프톱 → 옥상) — 그것은 무리(D3) 층에서 사람이 한다.
# 그래서 모델 답은 "같은 낱말인가" 규칙을 통과해야 받는다: 꼬리말(톤 · 색감 · 무드 · 분위기 · 느낌 · 같은 · 한 …)을 떼고
# 첩어를 반으로 접은 뒤(가을가을 → 가을) 남는 뿌리가 같거나(소리 변형 허용) 낱말 순서만 다르면 같은 낱말이다.
TAILS = sorted(["그 자체", "느낌 물씬", "느낌", "분위기", "무드", "색감", "조명", "컬러", "톤", "빛의", "빛", "미", "감성", "감", "한", "하는", "된", "되는",
                "지는", "해지는", "의", "적인", "스러운", "룩", "스타일", "넘치는", "가득한", "있는", "폭발", "뿜뿜", "터지는", "충만한", "돋는", "소환", "물씬",
                "샷", "컷", "사진", "보정", "바이브", "그레인", "같은", "낀", "풍", "터뜨린", "컨셉", "맛집", "속"], key=len, reverse=True)
# 줄임말 · 외래어 표기 차이는 규칙이 못 잡는다 — 눈으로 보고 허용한 짝(변형 → 대표). 대표 쪽은 같은 묶음에 있을 때만 쓴다
ABBREV = {"걸크": "걸크러쉬", "걸크러시": "걸크러쉬", "핀터": "핀터레스트", "필카": "필름 카메라", "느와르": "누아르", "엔틱한": "앤티크한",
          "멜랑꼴리한": "멜랑콜리한", "스트릿": "스트리트", "캐쥬얼": "캐주얼한", "콘셉트 있는": "컨셉 있는", "루프탑": "루프톱", "아웃포커싱": "아웃포커스",
          "따숩한": "따뜻한", "따스한": "따뜻", "따듯": "따뜻", "힙감성": "힙한", "뮤직비디오 같은": "뮤비", "썸머": "서머 무드", "귀요미": "귀여움 폭발",
          "센티멘털한": "센치한", "필름 그레인": "그레인", "골목길": "골목", "제주": "제주도", "플레어": "렌즈 플레어", "흔들림 있는": "흔들린",
          "여운이 남는": "여운 있는", "멜로 영화 같은": "멜로", "로맨틱 코미디 같은": "로코", "후지 색감": "후지필름", "y2k": "Y2K", "숲속": "숲"}


def stem(term, soft=True):
    t = term.replace(" ", "").lower()
    changed = True
    while changed and len(t) > 1:
        changed = False
        for s in TAILS:
            k = s.replace(" ", "")
            if t.endswith(k) and len(t) - len(k) >= 1:
                t = t[: -len(k)]
                changed = True
                break
    if len(t) % 2 == 0 and len(t) >= 4 and t[: len(t) // 2] == t[len(t) // 2:]:
        t = t[: len(t) // 2]
    return soften(t) if soft else t


def same_lexeme(a, b):
    if ABBREV.get(a) == b or ABBREV.get(b) == a:
        return True
    if a.replace(" ", "").lower() == b.replace(" ", "").lower():
        return True
    sa, sb = stem(a), stem(b)
    if sa and sa == sb:
        return True
    ta, tb = sorted(a.split()), sorted(b.split())                       # 낱말 순서만 다름(심도 얕은 · 얕은 심도)
    return len(ta) > 1 and ta == tb


def bare_pair(a, b):
    """묶음 밖에서도 합치는 엄격한 짝 — 띄어쓰기만 다르거나, 허용 표기이거나, 한쪽이 다른 쪽의 기본형(시네마틱 · 시네마틱한, 몽환 · 몽환적).
    소리 변형은 안 본다(포스 있는 · 보스가 이어진다) — 판정으로 이미 비슷하다고 본 묶음 안에서만 허용한다."""
    na, nb = a.replace(" ", "").lower(), b.replace(" ", "").lower()
    if na == nb or ABBREV.get(a) == b or ABBREV.get(b) == a:
        return True
    sa, sb = stem(a, soft=False), stem(b, soft=False)
    return bool(sa) and sa == sb and (na == sa or nb == sa)


def parse(answer, members):
    """'대표 <= 변형, 변형' 줄만 받는다. 대표 · 변형이 식구에 없으면 그 줄은 버린다(모델이 만든 말 금지)."""
    got = []
    for line in answer.splitlines():
        if "<=" not in line:
            continue
        head, _, rest = line.partition("<=")
        head = re.sub(r"\(\d+\)\s*$", "", head.strip(" -*")).strip()
        if head not in members:
            continue
        for v in (re.sub(r"\(\d+\)\s*$", "", x.strip()).strip() for x in rest.split(",")):
            if v and v in members and v != head:
                got.append((v, head))
    return got


def main():
    dry = "--dry" in sys.argv
    photos = {r["term"]: r.get("photos", 0) or 0 for r in (json.loads(l) for l in (OUT / "photo-terms.jsonl").read_text(encoding="utf-8").splitlines() if l.strip())}
    groups = [g["members"] for g in json.loads((EDITS / "photo-groups.json").read_text(encoding="utf-8"))["groups"] if len(g["members"]) > 1]
    now = datetime.datetime.now().isoformat(timespec="seconds")
    merges, proposals = [], []
    try:                                                                  # 누적 — 지난 기록은 그대로 두고 새 짝만 덧붙인다(지우려면 파일을 손으로 고친다)
        merges = [json.loads(l) for l in (EDITS / "photo-term-merges.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
    except FileNotFoundError:
        pass
    known = {m["from"] for m in merges}
    t0 = time.time()
    for n, members in enumerate(groups, 1):
        # 1) 같은 낱말인 식구를 규칙으로 잇는다(띄어쓰기 · 꼬리말 · 첩어 · 소리 변형 · 허용한 줄임말) — 이어진 것이 한 덩이
        parent = {m: m for m in members}

        def find(x):
            while parent[x] != x:
                x = parent[x]
            return x

        how_of = {}
        for i, a in enumerate(members):
            for b in members[i + 1:]:
                if same_lexeme(a, b):
                    parent[find(b)] = find(a)
                    how = "띄어쓰기" if a.replace(" ", "").lower() == b.replace(" ", "").lower() else "표기" if ABBREV.get(a) == b or ABBREV.get(b) == a else "뿌리"
                    how_of.setdefault(a, how)
                    how_of.setdefault(b, how)
        clusters = {}
        for m in members:
            clusters.setdefault(find(m), []).append(m)
        clusters = [c for c in clusters.values() if len(c) > 1]
        if not clusters:
            continue
        # 2) 대표는 모델에게 묻는다(같은 낱말 규칙을 통과한 답만 받는다). 최종 대표: 작가 사진 많은 쪽 → 허용 표기의 대표 쪽 → 모델이 고른 쪽 → 짧은 쪽
        answer = ask(members, photos)
        got = parse(answer, members)
        votes = {}
        for f, h in got:
            if same_lexeme(f, h):
                votes[h] = votes.get(h, 0) + 1
        proposals.append({"members": members, "answer": answer, "rejected": [f"{f} → {h}" for f, h in got if not same_lexeme(f, h)]})
        for c in clusters:
            targets = {ABBREV[m] for m in c if ABBREV.get(m) in c}
            head = max(c, key=lambda m: (photos.get(m, 0), m in targets, votes.get(m, 0), -len(m.replace(" ", "")), -m.count(" ")))
            for f in c:
                if f != head and f not in known:
                    merges.append({"from": f, "to": head, "how": how_of.get(f, "뿌리"), "at": now})
                    known.add(f)
    # 3) 묶음 밖 — 서로 다른 묶음에 남은 엄격한 짝(한쪽이 다른 쪽의 기본형). 대표는 같은 기준
    universe = sorted({t for g in json.loads((EDITS / "photo-groups.json").read_text(encoding="utf-8"))["groups"] for t in g["members"]} | set(photos)) 
    heads = {m["to"] for m in merges}
    universe = [t for t in universe if t not in known]
    by_stem = {}
    for t in universe:
        by_stem.setdefault(stem(t, soft=False), []).append(t)
    for cands in by_stem.values():
        if len(cands) < 2:
            continue
        for i, a in enumerate(cands):
            for b in cands[i + 1:]:
                if a in known or b in known or not bare_pair(a, b):
                    continue
                head = max((a, b), key=lambda m: (photos.get(m, 0), m in heads, ABBREV.get(a) == m or ABBREV.get(b) == m, -len(m.replace(" ", "")), -m.count(" ")))
                f = b if head == a else a
                merges.append({"from": f, "to": head, "how": "묶음 밖", "at": now})
                known.add(f)
    for t in universe:                                                    # 허용 표기 짝은 뿌리가 달라도 잇는다(필카 · 필름 카메라)
        if t not in known and ABBREV.get(t) in photos and ABBREV[t] not in known:
            merges.append({"from": t, "to": ABBREV[t], "how": "묶음 밖", "at": now})
            known.add(t)
        if n % 20 == 0 or n == len(groups):
            el = time.time() - t0
            print(f"  {n}/{len(groups)}  합침 {len(merges)}  {el / n:.1f}s/묶음", flush=True)

    kinds = {}
    for m in merges:
        kinds[m["how"]] = kinds.get(m["how"], 0) + 1
    rejected = [r for p in proposals for r in p["rejected"]]
    print(f"둘 이상 묶음 {len(groups)} · 흡수 {len(merges)} {kinds} · 모델이 합치자 했지만 다른 낱말이라 둔 것 {len(rejected)}")
    by_head = {}
    for m in merges:
        by_head.setdefault(m["to"], []).append(m["from"])
    for head, forms in list(by_head.items())[:40]:
        print(f"  {head} <= {', '.join(forms)}")
    if dry:
        return
    (EDITS / "photo-term-merges.jsonl").write_text("".join(json.dumps(m, ensure_ascii=False) + "\n" for m in merges), encoding="utf-8")
    (OUT / "photo-merge-proposals.jsonl").write_text("".join(json.dumps(p, ensure_ascii=False) + "\n" for p in proposals), encoding="utf-8")
    print(f"→ mood-edits/photo-term-merges.jsonl · out/mood-vocabulary/photo-merge-proposals.jsonl")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
