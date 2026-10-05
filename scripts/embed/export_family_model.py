"""신규 사진 점수용 기준을 굳힌다 — 가족 문장 벡터 · 통계(docs/47 §6, 2026-10-05).

새 사진은 지금 검수한 사진들과 **같은 문장 · 같은 통계**로만 점수를 낸다. 전체를 다시 계산하면 기존 사진 점수까지 흔들려
검수(구간 확정 · 뺀 것)가 어긋난다. 그래서 tag_photo_moods.py 가 쓴 것을 그대로 파일 하나에 굳힌다:

  - 가족 벡터: 가족마다 "a photo of …" 문장 벡터 평균(SigLIP 텍스트, 8077 서버) — float32 를 base64 로
  - stats: 허브 보정 뒤 코사인의 가족별 평균 · 표준편차 — photo-mood-tags-v1.json 에 이미 있다
  - tone_stats: 픽셀로 재는 가족 4개의 측정값 평균 · 표준편차 — 태그 결과에 든 사진들의 tone_vec 으로 다시 잰다
  - prompts_hash: 지금 문장의 지문. 결과 파일의 지문과 다르면 멈춘다(문장을 고쳤으면 전체를 다시 돌려야 한다)

  py export_family_model.py   →  mood-edits/photo-family-model.json   (8077 서버 · DB 읽기)

앱(어드민 「신규 사진」)이 이 파일로 새 사진 점수를 낸다(src/lib/mood-new-photos.ts).
"""
import base64
import json
import sys
from datetime import datetime

import numpy as np

import tag_photo_moods as T

OUT = T.EDITS / "photo-family-model.json"


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    layers = json.loads(T.LAYERS.read_text(encoding="utf-8"))
    tags = json.loads(T.RESULT.read_text(encoding="utf-8"))
    now_hash = T.prompts_hash(layers)
    if tags.get("prompts_hash") != now_hash:
        raise SystemExit(f"문장이 태그 결과와 다르다(결과 {tags.get('prompts_hash')} · 지금 {now_hash}) — tag_photo_moods.py 를 먼저 다시 돌릴 것")

    fams = layers["families"]
    prompts, _ = T.family_prompts(layers)
    texts = sorted({p for ps in prompts.values() for p in ps})
    V = T.embed_texts(texts)
    idx = {t: i for i, t in enumerate(texts)}
    F = np.stack([V[[idx[p] for p in prompts[f["key"]]]].mean(axis=0) for f in fams])
    F /= np.linalg.norm(F, axis=1, keepdims=True) + 1e-9

    # 측정 가족 통계 — 태그 결과에 든 사진(= 그때 점수를 낸 사진)의 tone_vec 으로
    ids, _, tone, _ = T.load_photos()   # 아래 검산도 이 사진들로
    scored = set(tags["photos"])
    tone_stats = {}
    for key, (_, fn) in T.MEASURED.items():
        vals = np.array([fn(t) for pid, t in zip(ids, tone) if pid in scored and t is not None], dtype=np.float64)
        tone_stats[key] = [round(float(vals.mean()), 6), round(float(vals.std()), 6)]

    out = {
        "made_at": datetime.now().isoformat(timespec="seconds"),
        "about": "신규 사진 점수용 기준 — export_family_model.py 가 만든다. 손으로 고치지 말 것(docs/47 §6)",
        "prompts_hash": now_hash,
        "tags_made_at": tags["made_at"],
        "z_cut": tags["z_cut"], "z_floor": tags.get("z_floor", tags["z_cut"]), "tag_bonus": tags["tag_bonus"],
        "families": [f["key"] for f in fams],
        "words": {f["key"]: f["words"] for f in fams},
        "dim": int(F.shape[1]),
        "vectors": base64.b64encode(F.astype("<f4").tobytes()).decode(),
        "stats": tags["stats"],
        "measured": {k: v[0] for k, v in T.MEASURED.items()},
        "tone_stats": tone_stats,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")

    # 검산 — 이미 점수를 낸 사진을 이 파일만으로 다시 매겨 결과 파일과 맞는지(앱 mood-new-photos.ts 와 같은 셈)
    ids_all, Vall, tone_all, tags_all = T.load_photos()   # (한 번 더 읽는다 — 벡터 · 태그까지)
    keys = [f["key"] for f in fams]
    mean = np.array([tags["stats"][k][0] for k in keys]); std = np.array([tags["stats"][k][1] for k in keys])
    words = [{T.norm(w) for w in f["words"]} for f in fams]
    diffs = []
    for i, pid in enumerate(ids_all):
        if pid not in scored:
            continue
        s = Vall[i] @ F.T
        z = ((s - s.mean()) - mean) / std
        for k, key in enumerate(keys):
            if key in T.MEASURED and tone_all[i] is not None:
                m, sd = tone_stats[key]
                z[k] = max(z[k], (T.MEASURED[key][1](tone_all[i]) - m) / sd)
            if tags_all[i] & words[k]:
                z[k] += tags["tag_bonus"]
        for key, zz, _ in tags["photos"][pid]["families"]:
            diffs.append(abs(z[keys.index(key)] - zz))
    diffs = np.array(diffs)
    print(f"가족 {len(fams)} · 문장 {len(texts)} · 측정 {list(tone_stats)} → {OUT.relative_to(T.EMBED)} ({OUT.stat().st_size // 1024}KB)")
    print(f"검산 — 태그 {len(diffs)}개 z 차이: 중간 {np.median(diffs):.3f} · 99% {np.percentile(diffs, 99):.3f} · 최대 {diffs.max():.3f}")

if __name__ == "__main__":
    main()
