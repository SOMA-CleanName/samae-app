#!/usr/bin/env python3
"""평가 하네스 — 시드 사진과 그 top-10 을 나란히 렌더한 HTML 을 만든다. (docs/22 §7.1)

정답 라벨이 없으므로 자동 지표(mAP 등)는 만들지 않는다. 사람이 눈으로 비교해
`max_num_patches` 와 모델을 고르는 것이 목적이다.

    # 표본 준비 후
    scripts/embed/.venv/bin/python scripts/embed/eval_models.py --budget 256
    scripts/embed/.venv/bin/python scripts/embed/eval_models.py --budget 1024
    # → out/*.html 두 개를 나란히 열어 비교

임베딩은 out/ 에 캐시하므로 같은 (모델, budget) 재실행은 즉시 끝난다.
DB 에 접속하지 않는다. sample/ 의 로컬 파일만 읽는다.
"""

import argparse
import html
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import siglip  # noqa: E402

SAMPLE_DIR = os.path.join(HERE, "sample")
OUT_DIR = os.path.join(HERE, "out")
DEFAULT_MODEL = siglip.MODEL_ID
TOP_K = 10


def embed_all(meta, model_id, budget, batch_size):
    """표본 전체를 임베딩해 (N, D) 정규화 행렬을 만든다. 결과는 캐시한다."""
    import numpy as np
    from PIL import Image

    tag = model_id.split("/")[-1]
    cache = os.path.join(OUT_DIR, f"emb_{tag}_{budget}.npy")
    if os.path.exists(cache):
        arr = np.load(cache)
        if arr.shape[0] == len(meta):
            print(f"캐시 사용: {cache}  shape={arr.shape}")
            return arr
        print(f"표본 수가 바뀌어 캐시를 무시한다({arr.shape[0]} → {len(meta)})")

    print(f"모델 로드: {model_id}")
    processor, model, device = siglip.load(model_id)
    print(f"  device={device}")

    vecs = []
    t0 = time.time()
    for i in range(0, len(meta), batch_size):
        chunk = meta[i : i + batch_size]
        images = [Image.open(os.path.join(SAMPLE_DIR, f"{p['id']}.jpg")).convert("RGB") for p in chunk]
        emb = siglip.encode(processor, model, images, budget, device)
        vecs.append(emb.float().cpu().numpy())
        done = min(i + batch_size, len(meta))
        print(f"  {done}/{len(meta)}  ({time.time() - t0:.0f}s)", flush=True)

    arr = np.concatenate(vecs, axis=0)
    os.makedirs(OUT_DIR, exist_ok=True)
    np.save(cache, arr)
    print(f"임베딩 완료 shape={arr.shape}  {time.time() - t0:.0f}s → {cache}")
    return arr


def render(meta, sims, seeds, model_id, budget, out_path):
    """시드별 top-10 을 가로 스트립으로 렌더. 같은 게시물이면 배지를 단다."""
    import numpy as np

    css = """
    body{background:#111;color:#eee;font:14px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;margin:0;padding:24px}
    h1{font-size:18px;margin:0 0 4px} .meta{color:#888;font-size:13px;margin-bottom:24px}
    .row{display:flex;gap:16px;align-items:flex-start;padding:16px 0;border-top:1px solid #222}
    .seed{flex:0 0 150px} .seed img{width:150px;border-radius:6px;display:block}
    .strip{display:flex;gap:8px;overflow-x:auto;padding-bottom:6px}
    .cell{flex:0 0 110px;position:relative}
    .cell img{width:110px;border-radius:4px;display:block}
    .score{font-size:11px;color:#999;text-align:center;padding-top:3px}
    .same{outline:2px solid #e5533d;outline-offset:-2px}
    .badge{position:absolute;top:3px;left:3px;background:#e5533d;color:#fff;font-size:9px;
           padding:1px 4px;border-radius:3px}
    .label{color:#888;font-size:12px;margin-bottom:6px}
    """
    parts = [
        "<meta charset='utf-8'>",
        f"<title>{html.escape(model_id)} · {budget}</title>",
        f"<style>{css}</style>",
        f"<h1>{html.escape(model_id)}</h1>",
        f"<div class='meta'>max_num_patches={budget} · 표본 {len(meta)}장 · 시드 {len(seeds)}개 · "
        f"빨간 테두리 = 시드와 같은 게시물(앨범)</div>",
    ]

    for si in seeds:
        seed = meta[si]
        order = np.argsort(-sims[si])
        order = [j for j in order if j != si][:TOP_K]
        seed_album = seed.get("album_id") or f"single:{seed['id']}"

        cells = []
        for j in order:
            p = meta[j]
            album = p.get("album_id") or f"single:{p['id']}"
            same = album == seed_album
            badge = "<span class='badge'>같은 게시물</span>" if same else ""
            cells.append(
                f"<div class='cell'>{badge}"
                f"<img class='{'same' if same else ''}' src='../sample/{p['id']}.jpg'>"
                f"<div class='score'>{sims[si][j]:.3f}</div></div>"
            )

        tags = ", ".join(seed.get("mood_tags") or []) or "(태그 없음)"
        parts.append(
            "<div class='row'>"
            f"<div class='seed'><div class='label'>시드</div>"
            f"<img src='../sample/{seed['id']}.jpg'>"
            f"<div class='score'>{html.escape(tags)}</div></div>"
            f"<div style='flex:1;min-width:0'><div class='label'>top-{TOP_K}</div>"
            f"<div class='strip'>{''.join(cells)}</div></div>"
            "</div>"
        )

    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(parts))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--budget", type=int, default=256, help="max_num_patches (docs/22 §4.4)")
    ap.add_argument("--seeds", type=int, default=30, help="비교할 시드 사진 수")
    ap.add_argument("--batch-size", type=int, default=8)
    args = ap.parse_args()

    meta_path = os.path.join(SAMPLE_DIR, "meta.json")
    if not os.path.exists(meta_path):
        sys.exit("❌ sample/meta.json 이 없습니다. fetch_sample.py 를 먼저 실행하세요.")
    with open(meta_path, encoding="utf-8") as f:
        meta = json.load(f)
    print(f"표본 {len(meta)}장\n")

    import numpy as np

    emb = embed_all(meta, args.model, args.budget, args.batch_size)
    sims = emb @ emb.T  # 정규화된 벡터라 내적 = 코사인 유사도

    # 시드는 표본 전체에 고르게 퍼지도록 등간격으로 뽑는다(무작위 아님 → 실행마다 동일).
    step = max(1, len(meta) // args.seeds)
    seeds = list(range(0, len(meta), step))[: args.seeds]

    os.makedirs(OUT_DIR, exist_ok=True)
    tag = args.model.split("/")[-1]
    out_path = os.path.join(OUT_DIR, f"eval_{tag}_{args.budget}.html")
    render(meta, sims, seeds, args.model, args.budget, out_path)

    # 같은 게시물이 top-10 을 얼마나 먹는지 — 벡터 추천의 알려진 실패 모드(§7.2).
    same_total = 0
    for si in seeds:
        order = [j for j in np.argsort(-sims[si]) if j != si][:TOP_K]
        seed_album = meta[si].get("album_id") or f"single:{meta[si]['id']}"
        same_total += sum(1 for j in order if (meta[j].get("album_id") or f"single:{meta[j]['id']}") == seed_album)
    print(f"\ntop-{TOP_K} 중 같은 게시물 비중: {same_total}/{len(seeds) * TOP_K} "
          f"({same_total / (len(seeds) * TOP_K) * 100:.1f}%) — 앨범 분산 후처리 필요도 지표")
    print(f"→ {out_path}")


if __name__ == "__main__":
    main()
