"""사진마다 가족(D4) · 큰 무드(D5) 태그를 붙인다 — 검수용 결과만 만든다, DB 에는 쓰지 않는다 (docs/47, 2026-10-01).

사람 결정(2026-10-01): D4 · D5 는 UI 에 크게 쓰므로 사진마다 태그로 단다. 기준만 넘으면 개수 제한 없이 다 넣는다.
보이지 않는 감정 · 관계 가족도 붙인다(읽기 어려워도). **검수 후 반영** — 이 스크립트는 파일만 만든다.

  1) 층 고정 — mood-edits/photo-mood-layers-v1.json. 지금의 가족 97 · 큰 무드 27 을 키(f01 · m01)와 이름째로 굳힌다.
     이미 있으면 그대로 쓴다(다시 뭉쳐도 v1 키가 흔들리지 않게). 바꾸려면 v2 를 새로 만든다.
  2) 점수 — 가족마다 "이 사진이 다른 사진들보다 유난히 이 가족 같은가"(z, docs/22 §7.5 와 같은 상대 판정)
     · SigLIP: 가족마다 "a photo of …" 문장 4개(photo-family-prompts.json, 사람이 고치면 photo-family-prompt-edits.jsonl 이 이긴다)
       → 텍스트 타워 → 가족 벡터(평균). 허브 사진 보정 — 사진마다 모든 가족과의 평균 근접도를 먼저 뺀다
       (--bundle: 예전 방식 — 묶음마다 2~5단어 문구, 가족 = 식구 묶음 중 최대. 비교용)
     · 작가 태그: 사진 태그(mood_tags · generated_tags)가 가족의 말과 정확히 같으면 + TAG_BONUS
     · 측정: 픽셀로 재는 편이 나은 가족(모노톤 · 하이키 · 다크 · 로우키)은 tone_vec 으로 잰 z 와 SigLIP z 중 큰 쪽
  3) 태그 — 가족 z ≥ Z_CUT(기본) 이면 붙인다. Z_FLOOR 까지는 저장해 두어 가족마다 기준을 낮출 수 있다(검수 화면). 큰 무드 = 그 사진이 받은 가족들의 큰 무드(점수는 그중 가장 높은 가족 z)
     태그가 하나도 없는 사진은 near 에 가장 가까웠던 가족 셋을 남긴다(검수 화면 「태그 없는 사진」)

  py tag_photo_moods.py            →  mood-edits/photo-mood-tags-v1.json + 요약 출력
  py tag_photo_moods.py --eval     →  작가 태그를 정답 삼아 문턱별 재현율 · 사진당 태그 수만 출력
  py tag_photo_moods.py --eval --bundle   →  예전 방식으로 같은 표
"""
import json
import math
import sys
import urllib.request
from datetime import datetime
from pathlib import Path

import numpy as np

EMBED = Path(__file__).resolve().parent
ROOT = EMBED.parent.parent
EDITS = EMBED / "mood-edits"
LAYERS = EDITS / "photo-mood-layers-v1.json"
RESULT = EDITS / "photo-mood-tags-v1.json"
SERVE = "http://127.0.0.1:8077"
Z_CUT = 1.0     # 기본 기준 — 최대한 넓게(사람 결정 2026-10-01 "전부 1점대로, 검수는 내가" · 2.0 → 1.5 → 1.0)
Z_FLOOR = 1.0   # 여기까지 저장한다 — 가족마다 기준을 기본보다 낮출 수 있게(사람 결정 2026-10-01: 태그마다 기준을 다르게)
TAG_BONUS = 1.5
STATS = {}       # 가족마다 [허브 보정 뒤 코사인 평균, 표준편차] — 결과 파일에 남겨 신규 사진에 쓴다

# 픽셀로 재는 가족 — v1 키 기준. tone_vec 의 차원: 0~15 L 히스토그램(어두움 → 밝음) · 16 a평균 · 17 a편차 · 18 b평균 · 19 b편차 · 20 chroma평균 · 21 chroma편차
MEASURED = {
    "f05": ("모노톤", lambda t: -t[20]),                       # 채도가 낮을수록
    "f63": ("하이키", lambda t: t[12:16].sum()),               # 밝은 쪽 4칸이 많을수록
    "f66": ("다크", lambda t: t[0:4].sum()),                   # 어두운 쪽 4칸이 많을수록
    "f92": ("로우키", lambda t: t[0:4].sum() - t[8:12].sum()), # 어둡고 중간 밝기가 적을수록
}


def norm(text):
    import re
    import unicodedata
    return re.sub(r"[^\w]|_", "", unicodedata.normalize("NFKC", text.lower()))


def env():
    out = {}
    for line in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().strip("\"'")
    return out


def latest_names(path, layers):
    """이름 기록에서 식구가 절반 이상 겹치는 마지막 줄 — 화면(layerNameFor)과 같은 규칙."""
    try:
        rows = [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]
    except FileNotFoundError:
        rows = []
    out = {}
    for key, members in layers.items():
        mine = set(members)
        for r in reversed(rows):
            theirs = set(r["members"])
            if len(mine & theirs) / max(1, len(mine | theirs)) >= 0.5:
                if r["name"].strip():
                    out[key] = {"name": r["name"].strip(), "by": r.get("by", "사람")}
                break
    return out


def freeze():
    """v1 이 없으면 지금의 가족 · 큰 무드를 굳힌다."""
    if LAYERS.exists():
        return json.loads(LAYERS.read_text(encoding="utf-8"))
    fam = json.loads((EDITS / "photo-families.json").read_text(encoding="utf-8"))
    groups = json.loads((EDITS / "photo-groups.json").read_text(encoding="utf-8"))["groups"]
    words = {g["members"][0]: g["members"] for g in groups}
    by = {f["id"]: f for f in fam["families"]}
    mood_members = {m["id"]: [h for fid in m["families"] for h in by[fid]["members"]] for m in fam["moods"]}
    fnames = latest_names(EDITS / "photo-family-names.jsonl", {f["id"]: f["members"] for f in fam["families"]})
    mnames = latest_names(EDITS / "photo-mood-names.jsonl", mood_members)
    layers = {
        "version": "v1", "frozen_at": datetime.now().isoformat(timespec="seconds"),
        "source": {"families_made_at": fam["made_at"], "resolution": fam["resolution"], "big_resolution": fam["big_resolution"]},
        "families": [{"key": f["id"], "name": fnames.get(f["id"], {}).get("name", f["id"].upper()),
                      "name_by": fnames.get(f["id"], {}).get("by", "없음"), "big": f["big"],
                      "bundles": f["members"], "words": [w for h in f["members"] for w in words.get(h, [h])]}
                     for f in fam["families"]],
        "moods": [{"key": m["id"], "name": mnames.get(m["id"], {}).get("name", m["id"].upper()), "families": m["families"]}
                  for m in fam["moods"]],
    }
    LAYERS.write_text(json.dumps(layers, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"층 고정 v1 — 가족 {len(layers['families'])} · 큰 무드 {len(layers['moods'])} → {LAYERS.relative_to(EMBED)}")
    return layers


def embed_texts(texts):
    vecs = []
    for i in range(0, len(texts), 8):                                     # 서버가 한 번에 8개까지 받는다. 검색보다 낮은 우선순위로
        body = json.dumps({"texts": [t[:120] for t in texts[i:i + 8]]}).encode()
        req = urllib.request.Request(f"{SERVE}/embed-text-backfill", data=body, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=300) as r:
            vecs += json.loads(r.read())["vectors"]
    V = np.asarray(vecs, dtype=np.float32)
    return V / (np.linalg.norm(V, axis=1, keepdims=True) + 1e-9)


def load_photos():
    """공개 사진의 SigLIP 벡터 · tone_vec · 태그 — DB 읽기만."""
    e = env()
    head = {"apikey": e["SUPABASE_SERVICE_ROLE_KEY"], "Authorization": "Bearer " + e["SUPABASE_SERVICE_ROLE_KEY"]}
    rows = []
    for start in range(0, 100_000, 500):
        url = (e["NEXT_PUBLIC_SUPABASE_URL"] + "/rest/v1/photos?select=id,embedding,tone_vec,mood_tags,generated_tags"
               "&visibility=eq.published&embedding=not.is.null&order=id")
        req = urllib.request.Request(url, headers={**head, "Range": f"{start}-{start + 499}"})
        with urllib.request.urlopen(req, timeout=120) as r:
            page = json.loads(r.read())
        rows += page
        if len(page) < 500:
            break
    parse = lambda v: np.asarray(json.loads(v) if isinstance(v, str) else v, dtype=np.float32) if v else None
    ids = [r["id"] for r in rows]
    V = np.stack([parse(r["embedding"]) for r in rows])
    V /= np.linalg.norm(V, axis=1, keepdims=True) + 1e-9
    tone = [parse(r["tone_vec"]) for r in rows]
    tags = [{norm(t) for t in (r.get("mood_tags") or []) + (r.get("generated_tags") or []) if t} for r in rows]
    return ids, V, tone, tags


def zscore(x):
    return (x - x.mean()) / (x.std() + 1e-9)


def family_prompts(layers):
    """가족마다 영어 문장 — qwen 초안(photo-family-prompts.json) 위에 사람이 화면에서 고친 것(photo-family-prompt-edits.jsonl, 마지막 줄)이 이긴다."""
    drafts = json.loads((EDITS / "photo-family-prompts.json").read_text(encoding="utf-8"))
    edits = {}
    try:
        for line in (EDITS / "photo-family-prompt-edits.jsonl").read_text(encoding="utf-8").splitlines():
            if line.strip():
                e = json.loads(line)
                edits[e["key"]] = e["prompts"]
    except FileNotFoundError:
        pass
    out = {}
    for f in layers["families"]:
        prompts = [p for p in edits.get(f["key"], drafts.get(f["key"], {}).get("prompts", [])) if p.strip()]
        if not prompts:
            raise SystemExit(f"{f['key']} {f['name']} 문장이 없다 — build_family_prompts.py 먼저")
        out[f["key"]] = prompts
    return out, sum(1 for k in out if k in edits)


def prompts_hash(layers):
    """지금 가족 문장의 지문 — 신규 사진은 같은 문장 · 같은 통계로만 점수를 낸다(문장을 고치면 전체를 다시 돌려야 한다)."""
    import hashlib
    prompts, _ = family_prompts(layers)
    return hashlib.sha1(json.dumps(prompts, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:12]


def siglip_by_bundle(layers, V):
    """예전 방식(--bundle) — 묶음(622)마다 2~5단어 문구, 가족 점수 = 식구 묶음 중 가장 가까운 것. 비교용으로 남긴다."""
    prompts = json.loads((EDITS / "photo-mood-prompts.json").read_text(encoding="utf-8"))
    fams = layers["families"]
    bundles = sorted({h for f in fams for h in f["bundles"]})
    texts = sorted({p for h in bundles for p in prompts[h]["prompts"]})
    T = embed_texts(texts)
    tidx = {t: i for i, t in enumerate(texts)}
    B = np.stack([T[[tidx[p] for p in prompts[h]["prompts"]]].mean(axis=0) for h in bundles])
    B /= np.linalg.norm(B, axis=1, keepdims=True) + 1e-9
    bidx = {h: i for i, h in enumerate(bundles)}
    S = V @ B.T
    S = S - S.mean(axis=1, keepdims=True)                                 # 허브 사진 보정(아래 siglip_by_family 와 같은 이유)
    return np.stack([zscore(S[:, [bidx[h] for h in f["bundles"]]].max(axis=1)) for f in fams], axis=1)


def siglip_by_family(layers, V):
    """가족마다 "a photo of …" 문장 4개(사람 판단 2026-10-01 — 묶음 문구가 짧고 틀어져 있었다). 가족 벡터 = 문장 벡터의 평균.
    허브 사진 보정 — 어느 문장과도 두루 가까운 사진이 있다(SigLIP 의 허브 현상). 그대로 z 를 매기면 그 사진이 모든 가족에서 부풀어
    한 장에 가족 41개가 붙었다. 사진마다 모든 가족과의 평균 근접도를 먼저 빼면 "이 사진이 유난히 이 가족 같은가" 만 남는다."""
    prompts, edited = family_prompts(layers)
    fams = layers["families"]
    texts = sorted({p for ps in prompts.values() for p in ps})
    T = embed_texts(texts)
    tidx = {t: i for i, t in enumerate(texts)}
    F = np.stack([T[[tidx[p] for p in prompts[f["key"]]]].mean(axis=0) for f in fams])
    F /= np.linalg.norm(F, axis=1, keepdims=True) + 1e-9
    S = V @ F.T
    S = S - S.mean(axis=1, keepdims=True)
    print(f"가족 문장 {len(texts)}개 · 사람이 고친 가족 {edited}")
    # 신규 사진용 기준 통계 — 새 사진 하나는 이 평균 · 편차로 z 를 낸다(전체를 다시 계산하지 않게, docs/22 §7 tone 과 같은 교훈: 기준을 고정)
    STATS.update({f["key"]: [round(float(S[:, k].mean()), 6), round(float(S[:, k].std()), 6)] for k, f in enumerate(fams)})
    return np.stack([zscore(S[:, k]) for k in range(len(fams))], axis=1)


def score(layers, ids, V, tone, tags, method="family"):
    fams = layers["families"]
    siglip = (siglip_by_bundle if method == "bundle" else siglip_by_family)(layers, V).astype(np.float32)
    Z = np.zeros_like(siglip)
    tagged = np.zeros_like(siglip, dtype=bool)
    for k, f in enumerate(fams):
        words = {norm(w) for w in f["words"]}
        tagged[:, k] = [bool(t & words) for t in tags]
        z = siglip[:, k].copy()
        if f["key"] in MEASURED:
            have = np.array([t is not None for t in tone])
            m = np.zeros(len(ids), dtype=np.float32)
            m[have] = zscore(np.array([MEASURED[f["key"]][1](t) for t in tone if t is not None], dtype=np.float32))
            z = np.maximum(z, m)
        Z[:, k] = z + TAG_BONUS * tagged[:, k]
    return Z, siglip, tagged


def evaluate(Z, siglip, tagged, fams):
    """작가 태그를 약한 정답으로 — SigLIP z 만으로 그 사진들을 얼마나 붙잡나(재현율), 문턱별 사진당 태그 수."""
    print("문턱  사진당 D4(평균·중간·0개 사진)   작가 태그 사진 재현율(SigLIP 만, 태그 10장+ 가족)")
    for cut in (1.5, 1.75, 2.0, 2.25, 2.5, 3.0):
        per = (Z >= cut).sum(axis=1)
        rec = [((siglip[:, k] >= cut) & tagged[:, k]).sum() / tagged[:, k].sum() for k in range(len(fams)) if tagged[:, k].sum() >= 10]
        print(f"{cut:4}  {per.mean():5.2f} · {int(np.median(per)):2d} · {int((per == 0).sum()):4d}      "
              f"{np.mean(rec):.0%} (가족 {len(rec)}개)  무작위면 {np.mean([(siglip[:, k] >= cut).mean() for k in range(len(fams))]):.0%}")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    layers = freeze()
    fams, moods = layers["families"], layers["moods"]
    ids, V, tone, tags = load_photos()
    print(f"사진 {len(ids)} · tone_vec 있음 {sum(t is not None for t in tone)}")
    method = "bundle" if "--bundle" in sys.argv else "family"
    Z, siglip, tagged = score(layers, ids, V, tone, tags, method)
    if "--eval" in sys.argv:
        evaluate(Z, siglip, tagged, fams)
        return
    big_of = {f["key"]: f["big"] for f in fams}
    photos = {}
    for i, pid in enumerate(ids):
        got = [(fams[k]["key"], round(float(Z[i, k]), 2), bool(tagged[i, k])) for k in np.argsort(-Z[i]) if Z[i, k] >= Z_FLOOR]
        bigs = {}
        for key, z, _ in got:
            if z >= Z_CUT:                                                # 큰 무드는 기본 기준으로 미리 적어 둔다 — 화면은 가족 기준을 반영해 다시 물려받는다
                bigs[big_of[key]] = max(bigs.get(big_of[key], -math.inf), z)
        photos[pid] = {"families": [[k, z, t] for k, z, t in got], "moods": sorted(([b, z] for b, z in bigs.items()), key=lambda x: -x[1])}
        if not any(z >= Z_CUT for _, z, _ in got):                        # 기본 기준으로 태그가 하나도 없는 사진 — 가장 가까웠던 가족 셋을 남겨 검수에서 본다
            photos[pid]["near"] = [[fams[k]["key"], round(float(Z[i, k]), 2)] for k in np.argsort(-Z[i])[:3]]
    per = [sum(1 for _, z, _ in p["families"] if z >= Z_CUT) for p in photos.values()]
    out = {"version": layers["version"], "made_at": datetime.now().isoformat(timespec="seconds"), "method": method, "z_cut": Z_CUT, "z_floor": Z_FLOOR, "tag_bonus": TAG_BONUS,
           "measured": {k: v[0] for k, v in MEASURED.items()},
           "stats": STATS, "prompts_hash": prompts_hash(layers), "photos": photos}
    RESULT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    fam_count = {f["key"]: sum(1 for p in photos.values() for k, z, _ in p["families"] if k == f["key"] and z >= Z_CUT) for f in fams}
    print(f"사진 {len(photos)} · 사진당 가족 평균 {np.mean(per):.2f} (중간 {int(np.median(per))} · 최대 {max(per)} · 0개 {per.count(0)}) "
          f"· 큰 무드 평균 {np.mean([len(p['moods']) for p in photos.values()]):.2f} → {RESULT.relative_to(EMBED)}")
    print("가족별 장수 — 적은 5:", sorted(fam_count.items(), key=lambda x: x[1])[:5], "· 많은 5:", sorted(fam_count.items(), key=lambda x: -x[1])[:5])


if __name__ == "__main__":
    main()
