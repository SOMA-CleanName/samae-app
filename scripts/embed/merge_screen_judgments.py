"""사전 후보 판정 합치기 (docs/40 §17, 2026-09-23).

screen-candidates.jsonl(13만)을 2,000개씩 나눠 에이전트가 판정한 조각(jNNN.jsonl)을 하나로 모은다.
조각은 입력(cNNN.jsonl)과 줄 수 · 낱말 · 순서가 같아야 한다 — 하나라도 어긋나면 멈춘다.

바로잡기(에이전트가 기준을 어긴 것)
  - fixups.jsonl 의 낱말: 사람이 정한 기준(메스껍다는 무드) · 기준 위반(뜻 모름은 Y)을 낱말별로 덮는다
  - 판정 이유에 '뜻 불명 · 불명 · 모름' 이 있는데 N 인 것 → Y(애매) — 기준: 뜻을 모르면 Y
  - 옷 · 장신구 · 옷감 · 무늬 · 머리 모양 · 화장인데 N 인 것 → Y(애매) — 사람 결정(2026-09-23)

사용: python merge_screen_judgments.py <판정 조각 폴더>
출력: mood-edits/screen-judged.jsonl — {word, v, sure, why, chunk, fixed?}
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

EMBED = Path(__file__).resolve().parent
OUT = EMBED / "mood-edits" / "screen-judged.jsonl"
UNKNOWN = re.compile(r"뜻\s*불명|불명|모름|알 수 없")
# 옷 · 장신구 · 옷감 · 무늬 · 머리 모양 · 화장도 무드다 — 그것이 뿜는 분위기가 있다(2026-09-23 사람 결정).
# 에이전트마다 '사물 명사' 로 갈라 판정해서(무드 542 · 아님 1,130), 이름 끝이나 판정 이유로 찾아 무드(애매)로 올린다
FASHION_WORD = re.compile(
    r"(칼라|슬리브|소매|스커트|드레스|코트|재킷|자켓|해트|햇|캡|팬츠|바지|셔츠|부츠|슈즈|구두|힐|샌들|로퍼|스니커즈|네크라인|넥라인|"
    r"라펠|블라우스|원피스|카디건|가디건|모자|베레모|스웨터|니트|점퍼|패딩|조끼|베스트|턱시도|슈트|수트|정장|한복|저고리|치마|두루마기|"
    r"귀고리|귀걸이|목걸이|반지|팔찌|발찌|브로치|노리개|비녀|떨잠|장신구|액세서리|숄|스카프|머플러|넥타이|보타이|벨트|장갑|선글라스|"
    r"안경테|가발|보닛|터번|베일|코르셋|페티코트|레깅스|스타킹|양말|잠옷|속옷|비키니|수영복|앞치마|망토|케이프|판초|로브|가운| 진|청진|데님|"
    r"청바지|핸드백|클러치|토트백|숄더백|백팩|파우치)$")
# 모자(?!라): '모자람' · 화장(?!실): '화장실' 은 아니다
FASHION_WHY = re.compile(r"(옷(?!을 입히)|의복|의류|복식|복장|차림|장신구|액세서리|모자(?!라)|신발|구두|가방|화장품|화장(?!실)|옷감|직물|섬유|원단|무늬|문양|"
                         r"패턴|헤어|머리 모양|머리모양|머리형|두발|의상|패션|소매|깃|단추|장식)")


def load_chunk(folder, n):
    src = [json.loads(l)["word"] for l in (folder / f"c{n}.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
    out = [json.loads(l) for l in (folder / f"j{n}.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
    if [o["word"] for o in out] != src:
        raise SystemExit(f"조각 {n}: 입력과 낱말·순서가 다르다")
    for o in out:
        if o.get("v") not in ("Y", "N") or not isinstance(o.get("sure"), bool):
            raise SystemExit(f"조각 {n}: 형식 오류 {o}")
    return out


def main(folder):
    folder = Path(folder)
    chunks = sorted(p.stem[1:] for p in folder.glob("c[0-9][0-9][0-9].jsonl"))
    missing = [n for n in chunks if not (folder / f"j{n}.jsonl").exists()]
    if missing:
        raise SystemExit(f"판정이 없는 조각: {missing}")
    fix = {}
    fx = folder / "fixups.jsonl"
    if fx.exists():
        for line in fx.read_text(encoding="utf-8").splitlines():
            if line.strip():
                f = json.loads(line)
                fix[f["word"]] = f
    rows, why = [], Counter()
    for n in chunks:
        for o in load_chunk(folder, n):
            row = {"word": o["word"], "v": o["v"], "sure": o["sure"], "why": o.get("why", ""), "chunk": n}
            if o["word"] in fix and fix[o["word"]]["v"] != row["v"]:
                row.update(v=fix[o["word"]]["v"], sure=False, fixed=fix[o["word"]]["note"])
                why["바로잡기 목록"] += 1
            elif row["v"] == "N" and UNKNOWN.search(row["why"]):
                row.update(v="Y", sure=False, fixed="뜻 모름은 Y(기준)")
                why["뜻 모름 → Y"] += 1
            elif row["v"] == "N" and (FASHION_WORD.search(row["word"]) or FASHION_WHY.search(row["why"])):
                row.update(v="Y", sure=False, fixed="옷·장신구도 무드(사람 결정)")
                why["옷·장신구 → Y"] += 1
            rows.append(row)
    OUT.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8")
    k = Counter(r["v"] for r in rows)
    print(json.dumps({"조각": len(chunks), "낱말": len(rows), "무드": k["Y"], "아님": k["N"],
                      "애매": sum(not r["sure"] for r in rows), "바로잡음": dict(why)}, ensure_ascii=False))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main(sys.argv[1])
