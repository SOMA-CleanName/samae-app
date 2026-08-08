#!/usr/bin/env python3
"""8단계 평가 하네스 — 무드 어휘가 실제로 맞게 붙는지 눈으로 본다. (docs/22 §7.5)

DB 에 컬럼을 만들기 전에 오프라인으로 먼저 확인한다. 7단계에서 배운 순서다 —
증상도 결과도 모른 채 스키마부터 만들지 않는다.

    scripts/embed/.venv/bin/python scripts/embed/eval_moods.py
    scripts/embed/.venv/bin/python scripts/embed/eval_moods.py --standalone   # 공유용

두 화면을 만든다.
  1. 무드별 top-N  — "노을빛" 이 정말 노을 사진을 데려오나? 어휘 검증용
  2. 사진별 부여 태그 — 실제로 DB 에 들어갈 값이 어떻게 생겼나

DB 에 접속하지 않는다. sample/ 과 eval_models.py 의 임베딩 캐시만 읽는다.

점수 두 가지를 함께 본다.
  절대 — sigmoid(scale·cos + bias). SigLIP 의 보정 확률이다. **softmax 가 아니다**
        (siglip.sigmoid_params 주석 참조). 태그마다 독립적이라 후보를 바꿔도 안 흔들린다.
  상대 — 카탈로그 전체 대비 z-score. "이 사진은 남들보다 유난히 노을빛" 이라는 뜻.
        프롬프트 문구마다 기본 유사도가 달라 절대값만으로는 태그 간 비교가 안 된다.
"""

import argparse
import html
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import moods  # noqa: E402
import siglip  # noqa: E402
from eval_tone import Src  # noqa: E402  (이미지 인라인 로직을 한 곳에만 둔다)

SAMPLE_DIR = os.path.join(HERE, "sample")
OUT_DIR = os.path.join(HERE, "out")


def render(meta, labels, groups, prob, z, meas, seeds, top_n, per_photo_k, src, out_path):
    css = """
    body{background:#111;color:#eee;font:14px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;margin:0;padding:24px}
    h1{font-size:18px;margin:0 0 4px} h2{font-size:15px;margin:32px 0 8px;color:#8fd}
    .meta{color:#888;font-size:13px;margin-bottom:20px}
    .row{display:flex;gap:14px;align-items:flex-start;padding:12px 0;border-top:1px solid #222}
    .tag{flex:0 0 130px}
    .tag b{font-size:14px} .tag .g{color:#777;font-size:11px}
    .tag .en{color:#666;font-size:10px;display:block;margin-top:3px;line-height:1.3}
    .strip{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;flex:1;min-width:0}
    .cell{flex:0 0 96px}
    .cell img{width:96px;border-radius:4px;display:block}
    .score{font-size:10px;color:#999;text-align:center;padding-top:2px;
           font-variant-numeric:tabular-nums;line-height:1.3}
    .zz{display:block;font-size:9px;color:#f0b429}
    .pcell{flex:0 0 150px}
    .pcell img{width:150px;border-radius:6px;display:block}
    .chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
    .chip{background:#233;color:#adf;font-size:11px;padding:2px 7px;border-radius:10px}
    .chip s{color:#666;text-decoration:none;font-size:9px}
    .mchip{background:#3a2f13;color:#f0b429}
    .mrow{border-top:1px solid #4a3a10}
    .mtag b{color:#f0b429}
    .none{color:#666;font-size:12px;padding:8px 0}
    .pgrid{display:flex;flex-wrap:wrap;gap:18px}
    .pbox{width:150px}
    .old{color:#777;font-size:10px;margin-top:4px;line-height:1.3}
    """
    parts = [
        "<meta charset='utf-8'>", "<title>무드 어휘 검증 · docs/22 §7.5</title>",
        f"<style>{css}</style>",
        "<h1>무드 어휘 검증 — SigLIP 텍스트 타워</h1>",
        f"<div class='meta'>표본 {len(meta)}장 · 프롬프트 어휘 {len(labels)}개 + "
        f"<span style='color:#f0b429'>측정 태그 {len(meas)}개</span> ({moods.VERSION}) · "
        "촬영 종류 제외, 무드만 · 점수 = 절대 확률 / "
        "<span style='color:#f0b429'>z = 카탈로그 대비</span></div>",
    ]

    import numpy as np

    # 측정 태그를 먼저 — 프롬프트가 아니라 픽셀로 판정하므로 성격이 다르다.
    if meas:
        parts.append("<h2 style='color:#f0b429'>0. 측정 태그 — 픽셀로 판정 (프롬프트 아님)</h2>")
        for lab, grp, mask, score in meas:
            idx = [int(i) for i in np.argsort(-score) if mask[i]]
            body = (
                "".join(
                    f"<div class='cell'><img {src.attr(meta[j]['id'])}>"
                    f"<div class='score'>{score[j]:.2f}</div></div>" for j in idx[:top_n]
                )
                if idx else "<div class='none'>조건을 만족하는 사진 없음 — 그래서 아무 사진도 안 붙는다</div>"
            )
            parts.append(
                f"<div class='row mrow'><div class='tag mtag'><b>{html.escape(lab)}</b> "
                f"<span class='g'>{grp}</span>"
                f"<span class='en'>측정 · 부여 {len(idx)}장 / {len(meta)}장</span></div>"
                f"<div class='strip'>{body}</div></div>"
            )

    parts.append(f"<h2>1. 프롬프트 무드별 top-{top_n} — 어휘가 맞게 데려오나</h2>")

    for ti, lab in enumerate(labels):
        order = np.argsort(-z[:, ti])[:top_n]
        cells = "".join(
            f"<div class='cell'><img {src.attr(meta[j]['id'])}>"
            f"<div class='score'>{prob[j, ti]:.3f}<span class='zz'>z {z[j, ti]:+.1f}</span></div></div>"
            for j in order
        )
        parts.append(
            f"<div class='row'><div class='tag'><b>{html.escape(lab)}</b> "
            f"<span class='g'>{groups[ti]}</span>"
            f"<span class='en'>{html.escape(moods.PROMPTS[ti])}</span></div>"
            f"<div class='strip'>{cells}</div></div>"
        )

    parts.append(f"<h2>2. 사진별 부여 태그 (상위 {per_photo_k}개) — DB 에 들어갈 값</h2>")
    parts.append("<div class='pgrid'>")
    for si in seeds:
        order = np.argsort(-z[si])[:per_photo_k]
        chips = "".join(
            f"<span class='chip mchip'>{html.escape(lab)} <s>측정</s></span>"
            for lab, _g, mask, _s in meas if mask[si]
        ) + "".join(
            f"<span class='chip'>{html.escape(labels[ti])} <s>{prob[si, ti]:.2f}</s></span>"
            for ti in order
        )
        old = ", ".join(meta[si].get("mood_tags") or []) or "(없음)"
        parts.append(
            f"<div class='pbox'><img {src.attr(meta[si]['id'])}>"
            f"<div class='chips'>{chips}</div>"
            f"<div class='old'>작가 태그: {html.escape(old[:70])}</div></div>"
        )
    parts.append("</div>")
    parts.append(src.tail())

    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(parts))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default=siglip.MODEL_ID)
    ap.add_argument("--budget", type=int, default=256)
    ap.add_argument("--top-n", type=int, default=12, help="무드당 보여줄 사진 수")
    ap.add_argument("--photos", type=int, default=24, help="2번 화면에 보여줄 사진 수")
    ap.add_argument("--per-photo", type=int, default=5, help="사진당 부여할 태그 수")
    ap.add_argument("--standalone", action="store_true", help="이미지를 박아 단일 파일로(공유용)")
    args = ap.parse_args()

    import numpy as np

    n, n_meas = moods.check()
    with open(os.path.join(SAMPLE_DIR, "meta.json"), encoding="utf-8") as f:
        meta = json.load(f)

    tag = args.model.split("/")[-1]
    emb_cache = os.path.join(OUT_DIR, f"emb_{tag}_{args.budget}.npy")
    if not os.path.exists(emb_cache):
        sys.exit(f"❌ 임베딩 캐시가 없습니다: {emb_cache}\n   eval_models.py 를 먼저 실행하세요.")
    emb = np.load(emb_cache)
    print(f"표본 {len(meta)}장 · 프롬프트 어휘 {n}개 + 측정 태그 {n_meas}개 ({moods.VERSION})")

    # 측정 태그용 톤 디스크립터. eval_tone 과 같은 캐시를 쓴다.
    from eval_tone import tone_all
    meas = moods.measured(tone_all(meta))

    proc, model, dev = siglip.load(args.model)
    tvec = siglip.encode_text(proc, model, moods.PROMPTS, dev).float().cpu().numpy()
    scale, bias = siglip.sigmoid_params(model)
    print(f"  device={dev} · logit_scale={scale:.2f} logit_bias={bias:.2f}")

    cos = emb @ tvec.T                       # (사진, 무드)
    prob = 1 / (1 + np.exp(-(scale * cos + bias)))
    z = (cos - cos.mean(axis=0)) / cos.std(axis=0)

    step = max(1, len(meta) // args.photos)
    seeds = list(range(0, len(meta), step))[: args.photos]

    os.makedirs(OUT_DIR, exist_ok=True)
    suffix = "_standalone" if args.standalone else ""
    out_path = os.path.join(OUT_DIR, f"moods_{moods.VERSION}{suffix}.html")
    render(meta, moods.LABELS, moods.GROUPS, prob, z, meas, seeds, args.top_n,
           args.per_photo, Src(args.standalone), out_path)

    print("\n무드별 — 절대확률 평균 / 최대 · 상위 5개 사진의 평균 z")
    print(f"  {'무드':<12}{'갈래':<6}{'평균':>8}{'최대':>8}{'top5 z':>9}")
    for ti, lab in enumerate(moods.LABELS):
        top5 = np.argsort(-z[:, ti])[:5]
        print(f"  {lab:<12}{moods.GROUPS[ti]:<6}{prob[:, ti].mean():>8.3f}"
              f"{prob[:, ti].max():>8.3f}{z[top5, ti].mean():>9.2f}")

    for lab, _g, mask, _s in meas:
        print(f"\n측정 태그 '{lab}' : {int(mask.sum())}장 / {len(meta)}장 "
              f"({mask.sum()/len(meta)*100:.1f}%) 부여")

    flat = prob.max(axis=0)
    print(f"\n절대확률이 전 사진에서 0.5 를 넘긴 적 없는 무드: "
          f"{sum(1 for v in flat if v < 0.5)}/{n}개")
    print("  → SigLIP 확률은 보수적이라 절대 임계값으로 태깅하면 대부분 안 붙는다.")
    print("     실제 태깅은 z(카탈로그 대비) 상위 N개로 하는 편이 맞다.")
    print(f"\n→ {out_path}")


if __name__ == "__main__":
    main()
