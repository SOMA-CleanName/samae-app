#!/usr/bin/env python3
"""7단계 평가 하네스 — 톤 가중치 α 를 눈으로 비교한다. (docs/22 §7)

    유사도 = α × (SigLIP 코사인) + (1−α) × (톤 코사인)

**현재 배포된 동작은 α=0.9 다**(2026-08-20 도입 · docs/22 §7.6). α=1.0 은 그 이전
동작이며, 아래 '유지율' 지표의 기준선으로 계속 쓴다. 값을 낮출수록 톤을 본다.
이 스크립트는 여러 α 의 top-10 을 같은 시드에 대해 나란히 렌더해, **톤을 섞어서
실제로 나아지는지**를 사람이 판단할 수 있게 한다.

    scripts/embed/.venv/bin/python scripts/embed/eval_tone.py
    scripts/embed/.venv/bin/python scripts/embed/eval_tone.py --alphas 1.0,0.9,0.8,0.7

DB 에 접속하지 않는다. sample/ 의 로컬 파일과 eval_models.py 가 만든 임베딩
캐시만 읽는다. **읽기 전용이며 앱·DB 에 아무 영향이 없다.**

정답 라벨이 없으므로 자동 지표로 우열을 가리지 않는다(§7.1). 아래 지표는 판단을
돕는 보조 수치일 뿐이다.
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
import tone  # noqa: E402

SAMPLE_DIR = os.path.join(HERE, "sample")
OUT_DIR = os.path.join(HERE, "out")


def tone_all(meta):
    """표본 전체의 톤 디스크립터. 원시값을 캐시하고 표준화는 매번 새로 한다."""
    import numpy as np
    from PIL import Image

    cache = os.path.join(OUT_DIR, f"tone_raw_{tone.RESIZE_LONG}_{tone.L_BINS}.npy")
    if os.path.exists(cache):
        raw = np.load(cache)
        if raw.shape == (len(meta), tone.DIM):
            print(f"톤 캐시 사용: {cache}  shape={raw.shape}")
            return raw
        print(f"캐시 형태가 달라 무시한다 {raw.shape} → ({len(meta)}, {tone.DIM})")

    t0 = time.time()
    rows = []
    for i, p in enumerate(meta, 1):
        with Image.open(os.path.join(SAMPLE_DIR, f"{p['id']}.jpg")) as im:
            rows.append(tone.descriptor(im))
        if i % 100 == 0 or i == len(meta):
            print(f"  톤 {i}/{len(meta)}  ({time.time() - t0:.0f}s)", flush=True)

    raw = np.vstack(rows)
    os.makedirs(OUT_DIR, exist_ok=True)
    np.save(cache, raw)
    print(f"톤 완료 shape={raw.shape}  {time.time() - t0:.0f}s → {cache}")
    return raw


class Src:
    """<img> 의 소스 속성을 만든다.

    기본은 '../sample/<id>.jpg' 상대경로다. HTML 만 떼어 보내면 사진이 전부 깨지므로,
    공유용으로는 standalone 을 써서 이미지를 data URI 로 박아 파일 하나로 만든다.
    표시 크기가 100~150px 이라 240px 로 줄여도 눈에 띄지 않는다.

    같은 사진이 α 줄마다 반복 등장하므로 **data URI 를 인라인으로 박으면 안 된다.**
    816개 자리에 그대로 넣으면 152장짜리 파일이 9.5MB 가 된다. 사진당 한 번만
    싣고 끝에서 스크립트로 붙인다.
    """

    def __init__(self, standalone, width=240, quality=78):
        self.standalone = standalone
        self.width = width
        self.quality = quality
        self._uri = {}

    def attr(self, pid):
        if not self.standalone:
            return f"src='../sample/{pid}.jpg'"
        if pid not in self._uri:
            self._uri[pid] = self._encode(pid)
        return f"data-p='{pid}'"

    def _encode(self, pid):
        import base64
        import io

        from PIL import Image

        with Image.open(os.path.join(SAMPLE_DIR, f"{pid}.jpg")) as im:
            im = im.convert("RGB")
            w, h = im.size
            scale = self.width / max(w, h)
            if scale < 1:
                im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))))
            buf = io.BytesIO()
            im.save(buf, "JPEG", quality=self.quality, optimize=True)
        return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()

    def tail(self):
        """본문 뒤에 붙일 스크립트. 사진당 data URI 를 한 번만 싣는다."""
        if not self.standalone:
            return ""
        return (
            "<script>\nconst IMG=" + json.dumps(self._uri) + ";\n"
            "for(const el of document.querySelectorAll('img[data-p]'))"
            "el.src=IMG[el.dataset.p];\n</script>"
        )


def album_of(meta, i):
    return meta[i].get("album_id") or f"single:{meta[i]['id']}"


def banned_sets(meta, seeds, exclude_same_album):
    """시드별로 후보에서 뺄 인덱스 집합.

    기본값이 '같은 게시물 제외' 인 이유: 0069 RPC 가 이미 그렇게 동작한다
    (n.album_id is distinct from v_album). 포함해서 보면 하네스가 프로덕션과
    다른 화면을 보여주게 된다.
    """
    if not exclude_same_album:
        return {si: set() for si in seeds}
    by_album = {}
    for i in range(len(meta)):
        by_album.setdefault(album_of(meta, i), set()).add(i)
    return {si: set(by_album[album_of(meta, si)]) for si in seeds}


def full_order(sims, si, banned=frozenset()):
    """시드를 뺀 전체 후보를 유사도 내림차순으로. 순위 이동을 계산하는 데 쓴다."""
    import numpy as np

    return [j for j in np.argsort(-sims[si]) if j != si and j not in banned]


def topk(sims, si, k, banned=frozenset()):
    return full_order(sims, si, banned)[:k]


def metrics(meta, raw, sims, base_order, seeds, k, banned):
    """판단 보조 지표. §4.4 가 쓴 것과 같은 종류지만 정의는 이 파일 기준이다.

    원래 §4.4 수치를 만든 코드가 repo 에 남아 있지 않아 정의를 복원할 수 없었다.
    따라서 아래 값은 **α 끼리 비교할 때만** 의미가 있고, 문서의 256/1024 표와
    직접 비교하면 안 된다.
    """
    import numpy as np

    L_mean = raw[:, : tone.L_BINS] @ (np.arange(tone.L_BINS) + 0.5) * (100.0 / tone.L_BINS)
    chroma_mean = raw[:, tone.L_BINS + 4]

    dL, dC, same_album, same_photog, n_photog, kept = [], [], 0, 0, [], 0
    for si in seeds:
        order = topk(sims, si, k, banned[si])
        dL.append(np.mean([abs(L_mean[j] - L_mean[si]) for j in order]) / 100.0)
        dC.append(np.mean([abs(chroma_mean[j] - chroma_mean[si]) for j in order]) / 100.0)

        seed_album = album_of(meta, si)
        same_album += sum(1 for j in order if album_of(meta, j) == seed_album)
        same_photog += sum(1 for j in order if meta[j]["photographer_id"] == meta[si]["photographer_id"])
        n_photog.append(len({meta[j]["photographer_id"] for j in order}))
        kept += len(set(order) & set(base_order[si]))

    n = len(seeds) * k
    return {
        "같은 게시물%": same_album / n * 100,
        "시드와 명도차": float(np.mean(dL)),
        "시드와 채도차": float(np.mean(dC)),
        "같은 작가%": same_photog / n * 100,
        "작가 수": float(np.mean(n_photog)),
        "α=1.0 유지율%": kept / n * 100,
    }


def render(meta, per_alpha, base_order, base_info, seeds, k, banned, excluded, src, out_path):
    """시드 하나당 α 별로 한 줄씩. α=1.0 에 없던 사진에 배지를 달아 변화를 드러낸다."""
    css = """
    body{background:#111;color:#eee;font:14px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;margin:0;padding:24px}
    h1{font-size:18px;margin:0 0 4px} .meta{color:#888;font-size:13px;margin-bottom:24px}
    .block{border-top:1px solid #222;padding:16px 0;display:flex;gap:16px;align-items:flex-start}
    .seed{flex:0 0 150px;position:sticky;top:16px} .seed img{width:150px;border-radius:6px;display:block}
    .rows{flex:1;min-width:0}
    .arow{display:flex;gap:10px;align-items:center;margin-bottom:8px}
    .alpha{flex:0 0 62px;color:#bbb;font-size:12px;font-variant-numeric:tabular-nums}
    .alpha b{color:#fff}
    .strip{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;flex:1;min-width:0}
    .cell{flex:0 0 100px;position:relative}
    .cell img{width:100px;border-radius:4px;display:block}
    .score{font-size:10px;color:#999;text-align:center;padding-top:2px;
           font-variant-numeric:tabular-nums;line-height:1.35}
    .was{display:block;font-size:9px;color:#777}
    .up{color:#f0b429;font-weight:700} .down{color:#7a9ec2}
    .same{outline:2px solid #e5533d;outline-offset:-2px}
    .badge{position:absolute;top:3px;left:3px;background:#e5533d;color:#fff;font-size:9px;
           padding:1px 4px;border-radius:3px}
    .new{outline:2px solid #f0b429;outline-offset:-2px}
    .newbadge{position:absolute;bottom:3px;right:3px;background:#f0b429;color:#000;font-size:9px;
              font-weight:700;padding:1px 4px;border-radius:3px}
    .gonewrap{display:flex;gap:8px;align-items:center;margin:2px 0 10px 72px}
    .gonelabel{flex:0 0 auto;color:#7a9ec2;font-size:10px}
    /* 밀려난 사진도 원색 그대로 둔다 — 톤을 눈으로 비교하는 것이 이 하네스의 목적이라
       흑백·반투명 처리를 하면 정작 판단해야 할 색을 못 본다. 구분은 테두리·배지로만. */
    .gone img{outline:2px solid #4a7fa5;outline-offset:-2px}
    .outbadge{position:absolute;bottom:3px;right:3px;background:#4a7fa5;color:#fff;font-size:9px;
              font-weight:700;padding:1px 4px;border-radius:3px}
    .label{color:#888;font-size:12px;margin-bottom:6px}
    """
    parts = [
        "<meta charset='utf-8'>",
        "<title>톤 가중치 α 비교 · docs/22 §7</title>",
        f"<style>{css}</style>",
        "<h1>톤 가중치 α 비교 — 유사도 = α×SigLIP + (1−α)×톤</h1>",
        f"<div class='meta'>표본 {len(meta)}장 · 시드 {len(seeds)}개 · top-{k} · "
        "<b>α=0.9 가 현재 운영값</b> · α=1.0 은 도입 전 동작(유지율 기준선) · "
        + ("<b style='color:#6cc'>같은 게시물 제외</b>(0069 RPC 와 동일) · "
           if excluded else "<span style='color:#e5533d'>빨강 = 시드와 같은 게시물</span> · ")
        + "<span style='color:#f0b429'>노랑 = α=1.0 에는 없던 사진</span> · "
        "<span style='color:#7a9ec2'>회색 = 밀려난 사진</span><br>"
        "각 사진 아래: <b>혼합점수</b> / <b>1.0 #순위 (그때 점수)</b> · "
        "<span style='color:#f0b429'>↑n</span> = 그만큼 올라옴, "
        "<span style='color:#7a9ec2'>↓n</span> = 내려감</div>",
    ]

    def cell(si, j, rank, sims, base_rank, base_sims, seed_album, base_top, gone=False):
        """사진 한 칸. α=1.0 에서의 순위·점수를 함께 적어 이동을 볼 수 있게 한다."""
        same = album_of(meta, j) == seed_album
        is_new = j not in base_top
        br = base_rank.get(j)
        cls = " ".join(c for c in ("same" if same else "",
                                   "new" if is_new and not same and not gone else "") if c)

        if br is None:
            was = "<span class='was'>1.0 권외</span>"
        else:
            d = br - rank
            move = (f"<span class='up'>↑{d}</span>" if d > 0
                    else f"<span class='down'>↓{-d}</span>" if d < 0 else "·")
            was = f"<span class='was'>1.0 #{br} ({base_sims[si][j]:.3f}) {move}</span>"

        badge = ("<span class=badge>같은 게시물</span>" if same else "")
        mark = ("<span class=outbadge>OUT</span>" if gone
                else "<span class=newbadge>NEW</span>" if is_new else "")
        return (f"<div class='cell{' gone' if gone else ''}'>{badge}{mark}"
                f"<img class='{cls}' {src.attr(meta[j]['id'])}>"
                f"<div class='score'>{sims[si][j]:.3f}{was}</div></div>")

    for si in seeds:
        seed = meta[si]
        seed_album = album_of(meta, si)
        base_top = set(base_order[si])
        base_sims, base_rank = base_info[si]

        rows = []
        for alpha, sims in per_alpha:
            order = topk(sims, si, k, banned[si])
            cells = [cell(si, j, r, sims, base_rank, base_sims, seed_album, base_top)
                     for r, j in enumerate(order, 1)]
            mark = (f"<b>α={alpha:g}</b><br>(현재)" if alpha == 0.9
                    else "<b>α=1.0</b><br>(도입 전)" if alpha == 1.0
                    else f"<b>α={alpha:g}</b>")
            rows.append(f"<div class='arow'><div class='alpha'>{mark}</div>"
                        f"<div class='strip'>{''.join(cells)}</div></div>")

            # 밀려난 것 — α=1.0 top-K 에 있었는데 이 줄에서 빠진 사진.
            # 들어온 것만 보면 판단이 반쪽이다. 무엇을 내주고 얻었는지 함께 봐야 한다.
            gone = [j for j in base_order[si] if j not in set(order)]
            if gone:
                cur_rank = {j: r for r, j in enumerate(full_order(sims, si, banned[si]), 1)}
                gcells = [cell(si, j, cur_rank.get(j, 0), sims, base_rank, base_sims,
                               seed_album, base_top, gone=True) for j in gone]
                rows.append(f"<div class='gonewrap'><div class='gonelabel'>밀려남 →</div>"
                            f"<div class='strip'>{''.join(gcells)}</div></div>")

        tags = ", ".join(seed.get("mood_tags") or []) or "(태그 없음)"
        parts.append(
            "<div class='block'>"
            f"<div class='seed'><div class='label'>시드</div>"
            f"<img {src.attr(seed['id'])}>"
            f"<div class='score'>{html.escape(tags[:60])}</div></div>"
            f"<div class='rows'>{''.join(rows)}</div></div>"
        )

    parts.append(src.tail())
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(parts))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default=siglip.MODEL_ID)
    ap.add_argument("--budget", type=int, default=256, help="max_num_patches (docs/22 §4.4)")
    ap.add_argument("--alphas", default="1.0,0.9,0.8,0.7,0.5",
                    help="쉼표 구분. 0.9 = 현재 운영값 · 1.0 = 도입 전 동작(유지율 기준선)")
    ap.add_argument("--seeds", type=int, default=12, help="시드 수 (α 마다 한 줄씩 붙어 길어진다)")
    ap.add_argument("--top-k", type=int, default=10)
    ap.add_argument("--no-balance", dest="balance", action="store_false",
                    help="두 축의 분산 보정을 끈다(보정 없이 섞으면 α 가 이름값을 못 한다)")
    ap.add_argument("--keep-same-album", dest="exclude_same_album", action="store_false",
                    help="같은 게시물 사진을 후보에 남긴다(기본은 제외 — 0069 RPC 와 동일)")
    ap.add_argument("--standalone", action="store_true",
                    help="이미지를 data URI 로 박아 파일 하나로 만든다(공유용). sample/ 없이 열린다")
    args = ap.parse_args()

    import numpy as np

    with open(os.path.join(SAMPLE_DIR, "meta.json"), encoding="utf-8") as f:
        meta = json.load(f)

    tag = args.model.split("/")[-1]
    emb_cache = os.path.join(OUT_DIR, f"emb_{tag}_{args.budget}.npy")
    if not os.path.exists(emb_cache):
        sys.exit(f"❌ 임베딩 캐시가 없습니다: {emb_cache}\n   eval_models.py --budget {args.budget} 를 먼저 실행하세요.")
    emb = np.load(emb_cache)
    print(f"표본 {len(meta)}장 · 임베딩 캐시 {emb.shape}\n")

    raw = tone_all(meta)
    tvec = tone.standardize(raw, tone.fit_stats(raw))

    sims_emb = emb @ emb.T
    sims_tone = tvec @ tvec.T

    # ── 두 축의 분산을 맞춘다. 이걸 빼먹으면 α 가 이름값을 못 한다. ──────────────
    # SigLIP 코사인은 좁은 띠에 몰려 있고(전부 0.3~1.0, 표준편차 0.08) 톤 코사인은
    # z-score 후 L2 정규화라 -1~1 에 넓게 퍼진다(표준편차 0.35). 그대로 섞으면
    # α=0.9 인데도 순위 변동의 3분의 1을 톤이 좌우한다. 표준편차로 나눠 맞춘 뒤
    # 섞어야 α 가 "톤을 몇 % 본다" 라는 뜻이 된다.
    # 프로덕션 SQL 에서도 상수 한 개를 곱하면 되므로 비용이 없다.
    off = ~np.eye(len(meta), dtype=bool)
    sd_emb, sd_tone = sims_emb[off].std(), sims_tone[off].std()
    scale = sd_emb / sd_tone if args.balance else 1.0
    print(f"\n분산: SigLIP {sd_emb:.3f} · 톤 {sd_tone:.3f} → 톤에 ×{scale:.3f}"
          + ("" if args.balance else "  (--no-balance: 보정 안 함)"))

    # 시드는 eval_models.py 와 같은 등간격 규칙 → 두 하네스의 시드가 일치한다.
    step = max(1, len(meta) // args.seeds)
    seeds = list(range(0, len(meta), step))[: args.seeds]

    alphas = [float(a) for a in args.alphas.split(",")]
    per_alpha = [(a, a * sims_emb + (1 - a) * scale * sims_tone) for a in alphas]

    banned = banned_sets(meta, seeds, args.exclude_same_album)
    if args.exclude_same_album:
        dropped = sum(len(b) - 1 for b in banned.values())
        print(f"같은 게시물 제외 (0069 RPC 와 동일) — 시드 {len(seeds)}개에서 후보 {dropped}장 빠짐")

    base = next((s for a, s in per_alpha if a == 1.0), sims_emb)
    base_order = {si: topk(base, si, args.top_k, banned[si]) for si in seeds}
    # α=1.0 에서의 전체 순위. 노란 사진이 원래 몇 등이었는지 보여주는 데 쓴다.
    base_info = {si: (base, {j: r for r, j in enumerate(full_order(base, si, banned[si]), 1)})
                 for si in seeds}

    os.makedirs(OUT_DIR, exist_ok=True)
    suffix = "_standalone" if args.standalone else ""
    out_path = os.path.join(OUT_DIR, f"tone_alpha_{tag}_{args.budget}{suffix}.html")
    render(meta, per_alpha, base_order, base_info, seeds, args.top_k, banned,
           args.exclude_same_album, Src(args.standalone), out_path)
    if args.standalone:
        print(f"자체 포함 파일 {os.path.getsize(out_path) / 1e6:.1f} MB — sample/ 없이 열린다")

    keys = ["시드와 명도차", "시드와 채도차", "같은 작가%", "작가 수", "α=1.0 유지율%"]
    if not args.exclude_same_album:
        keys.insert(0, "같은 게시물%")
    print(f"\n보조 지표 (시드 {len(seeds)}개 · top-{args.top_k})")
    print("  α     " + "".join(f"{k:>14}" for k in keys))
    for alpha, sims in per_alpha:
        m = metrics(meta, raw, sims, base_order, seeds, args.top_k, banned)
        print(f"  {alpha:<5g} " + "".join(f"{m[k]:>14.3f}" for k in keys))

    print("\n  명도차·채도차는 낮을수록 시드와 톤이 비슷하다는 뜻이다.")
    print("  유지율은 α=1.0 대비 top-K 가 얼마나 그대로인지 — 100 이면 아무것도 안 바뀐 것.")
    print("\n  ※ 이 수치로 우열을 정하지 말 것(§7.1). 판단은 HTML 을 눈으로 보고 한다.")
    print(f"\n→ {out_path}")


if __name__ == "__main__":
    main()
