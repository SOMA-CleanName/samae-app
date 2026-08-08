#!/usr/bin/env python3
"""자동 무드 태그 배치 — photos.auto_mood_tags 를 채운다. (docs/22 §7.5 · 8단계)

    scripts/embed/.venv/bin/python scripts/embed/mood_tags.py                    # dry-run
    scripts/embed/.venv/bin/python scripts/embed/mood_tags.py --apply --limit 10 # 소량 검증
    scripts/embed/.venv/bin/python scripts/embed/mood_tags.py --apply            # 전체
    scripts/embed/.venv/bin/python scripts/embed/mood_tags.py --apply --all      # 전량 재계산

안전장치 (docs/22 §10.4)
  - `--dry-run` 이 기본값. `--apply` 를 명시해야 DB 에 쓴다.
  - `where id = ...` 없는 update 를 만들지 않는다. PATCH 는 항상 id 한정.
  - 건드리는 컬럼은 auto_mood_tags · auto_mood_model · auto_mood_at **셋뿐**.
  - 기본은 `auto_mood_at is null` 인 것만 쓴다. `--all` 이어야 전량 갱신.

**사진을 내려받지 않는다.** 0068 이 저장해둔 photos.embedding 을 그대로 쓴다.
어휘가 바뀌어도 재다운로드 없이 다시 돌릴 수 있는 이유다.

다만 측정 태그(흑백)는 픽셀이 필요하다. 그 태그를 쓰려면 thumb 을 받아야 하므로
`--no-measured` 로 끄면 임베딩만으로 훨씬 빠르게 끝난다.

z-score 기준에 대하여
  태그는 "카탈로그 대비 유난히 X" 로 정한다(절대 확률은 SigLIP 이 극도로 보수적이라
  임계값을 넘는 사진이 사실상 없다 — eval_moods.py 참조). 그래서 **매 실행마다 공개
  사진 전체의 임베딩을 받아 기준을 다시 잡는다.** 일부만 받아서 z 를 내면 그 배치의
  기준이 기존 행과 어긋나 태그가 미묘하게 달라진다. 받는 것은 전체, 쓰는 것은 대상만.
"""

import argparse
import datetime as dt
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import moods  # noqa: E402
import siglip  # noqa: E402

PAGE = 300          # 임베딩이 커서(행당 약 15KB) 페이지를 작게 잡는다
TOP_K = 5           # 사진당 붙일 프롬프트 태그 수


def load_env():
    env = {}
    for line in open(os.path.join(HERE, "..", "..", ".env.local"), encoding="utf-8"):
        m = re.match(r"^([A-Z_]+)=(.*)$", line.strip())
        if m:
            env[m[1]] = m[2].strip('"')
    for k in ("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"):
        if not env.get(k):
            sys.exit(f"❌ .env.local 에 {k} 가 없습니다.")
    return env


def api(env, method, path, body=None, extra=None):
    url = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1/" + path
    key = env["SUPABASE_SERVICE_ROLE_KEY"]
    headers = {"apikey": key, "Authorization": f"Bearer {key}",
               "Content-Type": "application/json", **(extra or {})}
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req) as r:
        raw = r.read()
        return json.loads(raw) if raw else None


def fetch_all(env):
    """공개 + 임베딩 있는 사진 전부. z 기준을 잡으려면 전량이 필요하다."""
    import numpy as np

    rows, off, t0 = [], 0, time.time()
    while True:
        page = api(env, "GET",
                   "photos?select=id,embedding,auto_mood_at,auto_mood_model"
                   f"&visibility=eq.published&embedding=not.is.null&offset={off}&limit={PAGE}")
        rows += page
        print(f"  임베딩 {len(rows)}장 ({time.time() - t0:.0f}s)", flush=True)
        if len(page) < PAGE:
            break
        off += PAGE
    emb = np.array([json.loads(r["embedding"]) for r in rows], dtype=np.float32)
    emb /= np.linalg.norm(emb, axis=1, keepdims=True)
    for r in rows:
        del r["embedding"]          # 메모리에서 문자열 사본을 놓아준다
    return rows, emb


def fetch_thumbs_chroma(env, rows):
    """측정 태그(흑백)용 톤 디스크립터. 여기서만 사진을 내려받는다."""
    import numpy as np
    from PIL import Image

    import tone

    ids = [r["id"] for r in rows]
    url_of = {}
    for i in range(0, len(ids), 200):
        chunk = ids[i:i + 200]
        got = api(env, "GET", "photos?select=id,thumb_url&id=in.(" + ",".join(chunk) + ")")
        url_of.update({g["id"]: g["thumb_url"] for g in got})

    out, t0 = np.zeros((len(rows), tone.DIM)), time.time()
    for i, r in enumerate(rows):
        u = url_of.get(r["id"])
        try:
            with urllib.request.urlopen(u, timeout=30) as resp:
                import io
                with Image.open(io.BytesIO(resp.read())) as im:
                    out[i] = tone.descriptor(im)
        except Exception:
            out[i] = np.nan          # 실패는 측정 태그 미부여로 처리
        if (i + 1) % 200 == 0 or i + 1 == len(rows):
            print(f"  thumb {i + 1}/{len(rows)} ({time.time() - t0:.0f}s)", flush=True)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="실제로 DB 에 쓴다(없으면 dry-run)")
    ap.add_argument("--limit", type=int, help="쓰기 대상 수 제한(검증용)")
    ap.add_argument("--all", action="store_true", help="auto_mood_at 이 있어도 전부 다시 쓴다")
    ap.add_argument("--top-k", type=int, default=TOP_K, help="사진당 프롬프트 태그 수")
    ap.add_argument("--no-measured", action="store_true", help="측정 태그(흑백) 생략 — thumb 다운로드 없음")
    args = ap.parse_args()

    import numpy as np

    n_prompt, n_meas = moods.check()
    model_tag = f"{siglip.MODEL_ID.split('/')[-1]}@{moods.VERSION}"
    print(f"모드      {'APPLY (DB 에 씀)' if args.apply else 'DRY-RUN (DB 에 쓰지 않음)'}")
    print(f"어휘      {model_tag} — 프롬프트 {n_prompt}개 + 측정 {n_meas}개\n")

    env = load_env()
    rows, emb = fetch_all(env)
    print(f"공개·임베딩 보유 {len(rows)}장\n")

    proc, model, dev = siglip.load()
    tvec = siglip.encode_text(proc, model, moods.PROMPTS, dev).float().cpu().numpy()
    cos = emb @ tvec.T
    z = (cos - cos.mean(axis=0)) / cos.std(axis=0)
    print(f"  device={dev} · z 기준 = 공개 {len(rows)}장 전체\n")

    # 대상 선정 — 임베딩은 z 기준 때문에 전량이 필요하지만, 쓰는 것은 대상만이다.
    targets = [i for i, r in enumerate(rows)
               if args.all or r["auto_mood_at"] is None or r["auto_mood_model"] != model_tag]
    if args.limit:
        targets = targets[: args.limit]
    print(f"쓰기 대상 {len(targets)}장 "
          f"({'전량 재계산' if args.all else 'auto_mood_at is null 또는 어휘 버전 불일치'})\n")

    # 측정 태그는 카탈로그 통계가 아니라 절대 임계값이라 **대상 사진만** 받으면 된다.
    # 전량을 받으면 --limit 10 검증에도 thumb 1,700여 장을 내려받게 된다.
    meas = []
    if not args.no_measured and targets:
        print(f"측정 태그용 thumb 내려받는 중 — 대상 {len(targets)}장만 (흑백 판정)")
        sub = fetch_thumbs_chroma(env, [rows[i] for i in targets])
        ok_sub = ~np.isnan(sub[:, 0])
        full = np.full((len(rows), sub.shape[1]), 1e9)   # 대상 아닌 행은 어떤 조건도 불만족
        ok = np.zeros(len(rows), dtype=bool)
        for k, i in enumerate(targets):
            full[i] = np.nan_to_num(sub[k], nan=1e9)
            ok[i] = ok_sub[k]
        meas = [(lab, grp, mask & ok, sc) for lab, grp, mask, sc in moods.measured(full)]
        for lab, _g, mask, _s in meas:
            print(f"  '{lab}' {int(mask.sum())}장 부여 (thumb 실패 {int((~ok_sub).sum())}장)\n")

    now = dt.datetime.now(dt.timezone.utc).isoformat()
    done = failed = 0
    counts = {}
    t0 = time.time()
    for c, i in enumerate(targets, 1):
        tags = [lab for lab, _g, mask, _s in meas if mask[i]]
        tags += [moods.LABELS[t] for t in np.argsort(-z[i])[: args.top_k]]
        for t in tags:
            counts[t] = counts.get(t, 0) + 1
        if c <= 3:
            print(f"  예시 {rows[i]['id'][:8]} → {', '.join(tags)}")
        if not args.apply:
            done += 1
            continue
        try:
            api(env, "PATCH", f"photos?id=eq.{rows[i]['id']}",
                {"auto_mood_tags": tags, "auto_mood_model": model_tag, "auto_mood_at": now},
                {"Prefer": "return=minimal"})
            done += 1
        except urllib.error.HTTPError as e:
            failed += 1
            if failed <= 3:
                print(f"  실패 {rows[i]['id'][:8]}: {e.code} {e.read()[:120]!r}")
        if c % 200 == 0 or c == len(targets):
            print(f"  {c}/{len(targets)} ({time.time() - t0:.0f}s)", flush=True)

    print(f"\n{'전송' if args.apply else '계산만(미전송)'} {done}장 · 실패 {failed}장 · {time.time() - t0:.0f}s")

    print("\n부여 빈도 상위")
    for t, k in sorted(counts.items(), key=lambda x: -x[1])[:15]:
        print(f"   {k:>5}  {t}")

    if args.apply:
        # 전송 수를 반영 수로 믿지 않는다 — 매칭 0행인 PATCH 도 204 다(docs/22 §9.2).
        left = api(env, "GET", "photos?select=id&visibility=eq.published&auto_mood_at=is.null",
                   None, {"Prefer": "count=exact", "Range": "0-0"})
        tot = api(env, "GET", "photos?select=id&visibility=eq.published",
                  None, {"Prefer": "count=exact", "Range": "0-0"})
        del left, tot
        print("\n커버리지는 check_db.py 또는 SQL 로 확인할 것.")
    else:
        print("\n실제로 쓰려면 --apply 를 붙일 것. 먼저 --apply --limit 10 권장.")


if __name__ == "__main__":
    main()
