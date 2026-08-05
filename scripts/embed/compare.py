#!/usr/bin/env python3
"""판정용 비교 화면 — 현행 태그 방식 vs 벡터 두 설정을 한 시드에 3줄로 쌓는다. (docs/22 §7.1)

eval_models.py 는 설정 하나당 파일 하나라, 두 파일을 번갈아 보며 30장을 비교해야
해서 사람이 판정할 수 없었다. 이 스크립트는 같은 시드에 대해 세 방식을 세로로
쌓고, **두 벡터 설정이 가장 많이 갈리는 시드부터** 보여준다. 의견이 일치하는
시드는 판정에 정보가 없으므로 뒤로 밀린다.

    scripts/embed/.venv/bin/python scripts/embed/compare.py

전제: eval_models.py 를 --budget 256, 1024 로 각각 한 번씩 돌려 임베딩 캐시가
있어야 한다. DB·네트워크에 접속하지 않는다.

현행 방식 재현은 src/lib/discovery.ts 의 fetchSimilarPhotos 와 맞춘다.
  - mood_tags 겹치는 개수로 정렬
  - 같은 게시물(앨범) 제외
세 방식 모두 같은 앨범을 제외하므로, 화면에 보이는 것이 실제 사용자가 볼 결과에
가장 가깝다.
"""

import html
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import siglip  # noqa: E402

SAMPLE_DIR = os.path.join(HERE, "sample")
OUT_DIR = os.path.join(HERE, "out")
BUDGETS = [256, 1024]
TOP_K = 8
SEEDS = 24


def album_of(p):
    return p.get("album_id") or f"single:{p['id']}"


def tag_ranking(meta, i):
    """현행 방식 재현 — mood_tags 겹침 개수 내림차순. 동점은 입력 순서."""
    seed_tags = {t.lower() for t in (meta[i].get("mood_tags") or [])}
    seed_album = album_of(meta[i])
    scored = []
    for j, p in enumerate(meta):
        if j == i or album_of(p) == seed_album:
            continue
        overlap = len(seed_tags & {t.lower() for t in (p.get("mood_tags") or [])})
        scored.append((-overlap, j))
    scored.sort()
    return [j for _, j in scored[:TOP_K]], [-s for s, _ in scored[:TOP_K]]


def vec_ranking(meta, sims, i):
    import numpy as np

    seed_album = album_of(meta[i])
    order = [j for j in np.argsort(-sims[i]) if j != i and album_of(meta[j]) != seed_album]
    top = order[:TOP_K]
    return top, [float(sims[i][j]) for j in top]


CSS = """
body{background:#0e0e0e;color:#eee;font:14px/1.55 -apple-system,BlinkMacSystemFont,sans-serif;margin:0;padding:24px}
h1{font-size:19px;margin:0 0 10px}
.guide{background:#1a1a1a;border-left:3px solid #e5533d;padding:12px 16px;margin-bottom:26px;
       border-radius:0 6px 6px 0;font-size:13px;color:#ccc;max-width:900px}
.guide b{color:#fff}
.seedblock{border-top:1px solid #262626;padding:20px 0;display:flex;gap:20px;align-items:flex-start}
.seedcol{flex:0 0 160px;position:sticky;top:16px}
.seedcol img{width:160px;border-radius:6px;display:block}
.seedcol .cap{font-size:12px;color:#888;margin-top:6px}
.rows{flex:1;min-width:0;display:flex;flex-direction:column;gap:10px}
.row{display:flex;gap:10px;align-items:center}
.rowlabel{flex:0 0 108px;font-size:12px;text-align:right;color:#9a9a9a;line-height:1.3}
.rowlabel b{display:block;color:#fff;font-size:13px}
.strip{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px}
.cell{flex:0 0 92px;position:relative}
.cell img{width:92px;border-radius:4px;display:block}
.cell .s{font-size:10px;color:#777;text-align:center;padding-top:2px}
.only{outline:2px solid #4a9eff;outline-offset:-2px}
.dot{position:absolute;top:3px;right:3px;width:7px;height:7px;border-radius:50%;background:#4a9eff}
.legend{color:#777;font-size:12px;margin:10px 0 0}
"""


def render(meta, rankings, seeds, out_path, disagree):
    parts = [
        "<meta charset='utf-8'><title>유사도 방식 비교</title>",
        f"<style>{CSS}</style>",
        "<h1>유사도 방식 비교 — 현행 태그 vs 벡터 256 vs 벡터 1024</h1>",
        "<div class='guide'>"
        "<b>무엇을 보는가</b><br>"
        "각 시드(왼쪽 큰 사진)에 대해 세 방식이 뽑은 상위 8장을 세로로 쌓았다. "
        "세 줄 모두 <b>같은 게시물은 제외</b>했으므로 실제 사용자가 볼 결과에 가깝다.<br><br>"
        "<b>판정 순서</b><br>"
        "1. <b>현행 vs 벡터</b> — 첫 줄과 아래 두 줄이 확연히 다르면 이 과제는 이미 값을 한다.<br>"
        "2. <b>256 vs 1024</b> — 파란 점이 붙은 것이 <b>그 줄에만 나온 사진</b>이다. 파란 점끼리 비교해 "
        "어느 쪽이 시드의 톤·분위기에 더 가까운지만 보면 된다.<br><br>"
        "<b>판단이 안 서면 그것도 결론이다.</b> 256과 1024가 구별되지 않으면 기본값 256을 쓴다(4배 빠름).<br>"
        "시드는 <b>두 벡터 설정이 가장 많이 갈리는 순서</b>로 정렬했다. 위쪽일수록 차이가 크다."
        "</div>",
    ]

    for rank, si in enumerate(seeds, 1):
        seed = meta[si]
        tags = ", ".join(seed.get("mood_tags") or []) or "(태그 없음)"

        blocks = []
        for name, per_seed, label in (
            ("현행", rankings["현행"], "mood_tags 겹침"),
            ("벡터 256", rankings["벡터 256"], "max_num_patches=256"),
            ("벡터 1024", rankings["벡터 1024"], "max_num_patches=1024"),
        ):
            idx, scores = per_seed[si]
            # 파란 점 = 다른 벡터 설정에는 없고 이 줄에만 나온 사진
            if name.startswith("벡터"):
                other = "벡터 1024" if name == "벡터 256" else "벡터 256"
                other_set = set(rankings[other][si][0])
                unique = [j for j in idx if j not in other_set]
            else:
                unique = []
            cells = []
            for j, sc in zip(idx, scores):
                p = meta[j]
                mark = "only" if j in unique else ""
                dot = "<span class='dot'></span>" if j in unique else ""
                fmt = f"{sc:.3f}" if name != "현행" else f"태그 {int(sc)}개"
                cells.append(
                    f"<div class='cell'>{dot}"
                    f"<img class='{mark}' src='../sample/{p['id']}.jpg'>"
                    f"<div class='s'>{fmt}</div></div>"
                )
            blocks.append(
                f"<div class='row'><div class='rowlabel'><b>{name}</b>{label}</div>"
                f"<div class='strip'>{''.join(cells)}</div></div>"
            )

        parts.append(
            "<div class='seedblock'>"
            f"<div class='seedcol'><img src='../sample/{seed['id']}.jpg'>"
            f"<div class='cap'>#{rank} · 두 설정 불일치 {disagree[si]}/{TOP_K}<br>{html.escape(tags)}</div></div>"
            f"<div class='rows'>{''.join(blocks)}</div>"
            "</div>"
        )

    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(parts))


def main():
    import numpy as np

    with open(os.path.join(SAMPLE_DIR, "meta.json"), encoding="utf-8") as f:
        meta = json.load(f)

    tag = siglip.MODEL_ID.split("/")[-1]
    embs = {}
    for b in BUDGETS:
        path = os.path.join(OUT_DIR, f"emb_{tag}_{b}.npy")
        if not os.path.exists(path):
            sys.exit(f"❌ {path} 없음. eval_models.py --budget {b} 를 먼저 실행하세요.")
        embs[b] = np.load(path)

    rankings = {"현행": {}, "벡터 256": {}, "벡터 1024": {}}
    sims = {b: embs[b] @ embs[b].T for b in BUDGETS}
    for i in range(len(meta)):
        rankings["현행"][i] = tag_ranking(meta, i)
        for b in BUDGETS:
            rankings[f"벡터 {b}"][i] = vec_ranking(meta, sims[b], i)

    # 두 벡터 설정의 top-K 불일치 수 — 클수록 판정에 정보가 많다.
    disagree = {
        i: TOP_K - len(set(rankings["벡터 256"][i][0]) & set(rankings["벡터 1024"][i][0]))
        for i in range(len(meta))
    }
    seeds = sorted(range(len(meta)), key=lambda i: -disagree[i])[:SEEDS]

    os.makedirs(OUT_DIR, exist_ok=True)
    out_path = os.path.join(OUT_DIR, "compare.html")
    render(meta, rankings, seeds, out_path, disagree)

    vals = list(disagree.values())
    print(f"두 설정 top-{TOP_K} 불일치  평균 {np.mean(vals):.1f}/{TOP_K} · 최대 {max(vals)}")
    print(f"불일치 상위 {SEEDS}개 시드로 렌더")
    print(f"→ {out_path}")


if __name__ == "__main__":
    main()
