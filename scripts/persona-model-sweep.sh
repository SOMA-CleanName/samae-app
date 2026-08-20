#!/usr/bin/env bash
# 모델별 지연·품질 반복 측정.
#
# 단일 실행으로는 못 고른다 — 같은 모델도 실행마다 근거 개수와 표현이 흔들린다.
# (실측: sonnet-5 가 한 번은 3/3, 다음엔 1/2 였다) 그래서 같은 입력으로 여러 번 돌려 평균을 본다.
#
# 전제: IG_MOCK=true 로 뜬 dev 서버(기본 3100). 목업 프로필은 아이디로 시드되므로
#       같은 아이디 = 같은 사진 = 공정한 비교.
#
# 사용: scripts/persona-model-sweep.sh [반복수] [포트] [목업아이디]
set -uo pipefail

N="${1:-3}"
PORT="${2:-3100}"
USER_ID="${3:-fixed_bench_01}"
MODELS=(claude-opus-4-8 claude-sonnet-5 claude-haiku-4-5-20251001)
TMP="$(mktemp -d)"

for M in "${MODELS[@]}"; do
  for i in $(seq 1 "$N"); do
    curl -s --max-time 600 \
      "http://127.0.0.1:${PORT}/event/persona/preview?view=run&u=${USER_ID}&model=${M}" \
      -o "${TMP}/${M}-${i}.html"
    printf '.' >&2
  done
done
printf '\n' >&2

python3 - "$TMP" "$N" "${MODELS[@]}" <<'PY'
import glob, html, json, re, sys, statistics as st

tmp, n, *models = sys.argv[1], int(sys.argv[2]), *sys.argv[3:]
VIS = re.compile("색온도|채도|계조|그레인|하이키|로우키|역광|자연광|톤|명암|대비|흑백|빛바|무채색|따뜻|차가|그림자|여백")

print(f'{"모델":34}{"지연(중앙)":>11}{"최소~최대":>14}{"시각근거":>10}{"근거수":>8}{"실패":>6}')
print("─" * 84)
for m in models:
    secs, vis_ratio, reasons, fails = [], [], [], 0
    for path in sorted(glob.glob(f"{tmp}/{m}-*.html")):
        s = open(path, encoding="utf-8", errors="replace").read()
        r = re.search(r"<pre[^>]*>(.*?)</pre>", s, re.S)
        if not r:
            fails += 1
            continue
        try:
            d = json.loads(html.unescape(r.group(1)))
        except Exception:
            fails += 1
            continue
        secs.append(float(d["초"]))
        rs = d.get("근거", [])
        reasons.append(len(rs))
        if rs:
            vis_ratio.append(sum(1 for x in rs if VIS.search(x)) / len(rs))
    if not secs:
        print(f"{m:34}{'전부 실패':>11}")
        continue
    print(
        f"{m:34}{st.median(secs):>10.1f}s"
        f"{f'{min(secs):.0f}~{max(secs):.0f}s':>14}"
        f"{st.mean(vis_ratio)*100 if vis_ratio else 0:>9.0f}%"
        f"{st.mean(reasons):>8.1f}{fails:>6}"
    )
PY
