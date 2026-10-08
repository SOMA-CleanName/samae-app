"""사진 무드 표현 뼈대 — 무리(D3) 후보 AI 1차 판정 (docs/40 §17-5, 2026-09-24 사람 요청).

photo-cluster-candidates.json 의 후보(묶음 둘 이상이 나란히 놓인 카드)마다 qwen3:14b(로컬, 무료)가 "거의 같은 것인가" 를 본다 —
무리 기준은 화면과 같다: 거의 같은 것(노을 · 석양 · 선셋, 깜박이는 · 껌벅이는)만 묶고, 결이 비슷한 것(깜박이는 · 번쩍이는)은 이웃 그래프에 맡긴다.
판정은 힌트다 — 사람이 화면(/admin/photo-purpose/mood/cluster/photo)에서 "아직 안 정함" 만 보고, AI 가 정한 것은 훑으며 뒤집는다. 무리에는 대표가 없다.

  py judge_photo_clusters.py   → mood-edits/photo-cluster-ai.jsonl {heads, verdict: group|keep|unsure, why, members?}  (이어 하기 가능, 한 곳 10초 · 395곳 65분)
                                 그 뒤 py build_photo_cluster_candidates.py 를 다시 돌리면 후보에 ai 로 붙는다(heads 집합으로 맞춘다).
"""
import json
import sys
import time
import urllib.request
from pathlib import Path

EMBED = Path(__file__).resolve().parent
EDITS = EMBED / "mood-edits"
CASES = EDITS / "photo-cluster-candidates.json"
RESULT = EDITS / "photo-cluster-ai.jsonl"
MODEL = "qwen3:14b"

SYSTEM = (
    "너는 사진 검색어의 무드 어휘를 층으로 정리한다. 묶음 여러 개가 주어진다 — 묶음마다 이름과 식구(검색어 · 뜻풀이)가 있다.\n"
    "물음: 이 묶음들이 '거의 같은 것' 인가? 거의 같은 것이란 검색한 사람이 어느 쪽으로 찍어도 같은 사진을 기대하는 것이다 — "
    "노을 · 석양 · 선셋 · 해질녘, 흑백 · 블랙앤화이트, 화보 · 연예인 화보 같은, 깜박이는 · 껌벅이는.\n"
    "다른 것: 결이 비슷하지만 다른 장면이나 다른 무드(깜박이는 · 번쩍이는, 내추럴 · 꾸밈없는 모습, 겨울꽃 · 봄꽃, 따뜻한 · 포근한). 한쪽이 다른 쪽보다 훨씬 넓거나 좁으면 다른 것이다.\n"
    "출력은 딱 두 줄:\n판정: 묶음 | 안 묶음 | 애매\n이유: 한 문장\n"
    "묶음이 셋 이상인데 일부만 같으면 '판정: 묶음' 뒤에 괄호로 같은 묶음 이름만 적는다 — 예) 판정: 묶음 (노을, 석양). 설명은 이유 한 줄만."
)


def text(case):
    lines = []
    for g in case["groups"]:
        fam = " · ".join(f"{t['term']}" + (f"({t['gloss'][:24]})" if t.get("gloss") else "") for t in g["terms"][:8])
        lines.append(f"[{g['head']}] 축 {'/'.join(g['axes']) or '없음'} — {fam}")
    return "\n".join(lines)


def ask(case):
    # 생각 켬(think) — 끄면 395곳 중 297곳을 "묶음" 이라 해서(유사도 0.37 짝까지, 겨울꽃 · 봄꽃도) 무리가 65개짜리 사슬이 됐다. 켜면 한 곳 10초, 겨울꽃 · 봄꽃은 안 묶음
    body = json.dumps({"model": MODEL, "think": True, "stream": False,
                       "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": text(case)}],
                       "options": {"temperature": 0, "num_predict": 1500}}).encode()
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:11434/api/chat", data=body, headers={"Content-Type": "application/json"}), timeout=600) as r:
                return json.loads(r.read())["message"]["content"].strip()
        except Exception:
            if attempt == 2:
                raise
            time.sleep(3 * (attempt + 1))


def parse(answer, case):
    """'판정:' 부터 '이유:' 앞까지가 판정이다 — 애매가 섞이면 애매, 안 묶음이 있으면 안 묶음, 묶음이면 괄호 안 이름(묶음 이름이든 식구든)을 묶음으로 옮겨 둘 이상일 때만 받는다."""
    heads = [g["head"] for g in case["groups"]]
    owner = {t["term"]: g["head"] for g in case["groups"] for t in g["terms"]} | {h: h for h in heads}
    verdict, why, members = "unsure", "", None
    block, in_verdict = [], False
    for line in answer.splitlines():
        s = line.strip().lstrip("-* ")
        if s.startswith("이유"):
            why = s.split(":", 1)[-1].strip()
            in_verdict = False
        elif s.startswith("판정"):
            block.append(s.split(":", 1)[-1].strip())
            in_verdict = True
        elif in_verdict and s:
            block.append(s)
    v = " ".join(block)
    if not v or "애매" in v:
        verdict = "unsure"
    elif "안 묶음" in v or "안묶음" in v or "묶지 않" in v or "묶음 안" in v or "안 함" in v:
        verdict = "keep"
    elif "묶음" in v:
        verdict = "group"
        if "(" in v:
            inside = v[v.index("("):]
            picked = sorted({owner[w] for w in sorted(owner, key=len, reverse=True) if w in inside}, key=heads.index)
            if len(picked) >= 2:
                members = picked if len(picked) < len(heads) else None
            else:
                verdict = "unsure"                                       # 하나만 골랐으면 묶을 게 없다
    if verdict == "group" and members is None:
        members = list(heads)
    if not why:
        why = answer.replace("\n", " ")[:120]
    return verdict, why, members


def main():
    cases = json.loads(CASES.read_text(encoding="utf-8"))["cases"]
    done = {}
    if RESULT.exists():
        for l in RESULT.read_text(encoding="utf-8").splitlines():
            if l.strip():
                x = json.loads(l)
                done[frozenset(x["heads"])] = x
    todo = [c for c in cases if frozenset(g["head"] for g in c["groups"]) not in done]
    print(f"후보 {len(cases)} · 이미 {len(done)} · 남은 {len(todo)}", flush=True)
    t0 = time.time()
    tally = {"group": 0, "keep": 0, "unsure": 0}
    with RESULT.open("a", encoding="utf-8") as f:
        for n, c in enumerate(todo, 1):
            heads = [g["head"] for g in c["groups"]]
            answer = ask(c)
            verdict, why, members = parse(answer, c)
            row = {"heads": heads, "verdict": verdict, "why": why, "answer": answer}
            if verdict == "group":
                row["members"] = members
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
            f.flush()
            tally[verdict] += 1
            if n % 25 == 0 or n == len(todo):
                el = time.time() - t0
                print(f"  {n}/{len(todo)}  {el / n:.1f}s/곳  남은 {int((len(todo) - n) * el / n / 60)}분  {tally}", flush=True)
    print(f"→ {RESULT.relative_to(EMBED)}  이제 py build_photo_cluster_candidates.py")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
