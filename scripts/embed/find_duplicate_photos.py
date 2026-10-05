"""같은 사진 찾기 — 1픽셀까지 같은 사진이 여러 번 올라온 것(사람 요청 2026-10-04: 검색 결과에서 없앤다).

DB 의 SigLIP 벡터(photos.embedding)를 견준다. 같은 사진은 다시 인코딩돼도 벡터가 사실상 같다(코사인 ≥ SAME).
연사처럼 비슷하기만 한 사진은 이보다 낮아 남는다. 묶음마다 하나(가장 먼저 올린 것)만 남기고 나머지를 표에 적는다.

  py find_duplicate_photos.py            →  src/lib/duplicate-photos.json  {photo: 남길 사진}
  py find_duplicate_photos.py --report   →  쓰지 않고 코사인 분포 · 묶음만 찍는다

읽기 전용(PostgREST · 서비스 키). DB 에는 쓰지 않는다.
"""

import json
import os
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "src" / "lib" / "duplicate-photos.json"
SAME = float(os.environ.get("DUP_SAME", "0.999"))


def env():
    vals = {}
    for line in (ROOT / ".env.local").read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.split("=", 1)
            vals[k.strip()] = v.strip().strip('"')
    return vals["NEXT_PUBLIC_SUPABASE_URL"], vals["SUPABASE_SERVICE_ROLE_KEY"]


def fetch():
    url, key = env()
    rows, page = [], 500
    for start in range(0, 100_000, page):
        req = urllib.request.Request(
            f"{url}/rest/v1/photos?select=id,created_at,album_id,embedding&embedding=not.is.null&order=created_at.asc,id.asc",
            headers={"apikey": key, "Authorization": f"Bearer {key}", "Range": f"{start}-{start + page - 1}"})
        with urllib.request.urlopen(req) as r:
            batch = json.load(r)
        rows += batch
        if len(batch) < page:
            return rows
    return rows


def main():
    rows = fetch()
    ids = [r["id"] for r in rows]
    vec = np.array([json.loads(r["embedding"]) for r in rows], dtype=np.float32)
    vec /= np.linalg.norm(vec, axis=1, keepdims=True)
    sims = vec @ vec.T
    np.fill_diagonal(sims, -1)

    # 같은 것끼리 묶는다(서로 이어지면 한 묶음) — 먼저 올린 사진이 남는다(rows 가 created_at 순)
    keep = list(range(len(ids)))
    def root(i):
        while keep[i] != i:
            keep[i] = keep[keep[i]]
            i = keep[i]
        return i
    pairs = np.argwhere(np.triu(sims, 1) >= SAME)
    for a, b in pairs:
        ra, rb = root(a), root(b)
        if ra != rb:
            keep[max(ra, rb)] = min(ra, rb)
    dup = {ids[i]: ids[root(i)] for i in range(len(ids)) if root(i) != i}

    top = np.sort(sims.max(axis=1))[::-1]
    bands = [(0.9999, 1.01), (0.999, 0.9999), (0.995, 0.999), (0.99, 0.995), (0.98, 0.99)]
    print(f"사진 {len(ids)}장 · 가장 닮은 짝의 코사인 분포:")
    for lo, hi in bands:
        print(f"  {lo:.4f} ~ {hi:.4f}: {int(((top >= lo) & (top < hi)).sum())}장")
    print(f"같은 사진(≥ {SAME}) — 묶음 {len(set(dup.values()))} · 뺄 사진 {len(dup)}")
    if "--report" in sys.argv:
        groups = {}
        for d, k in dup.items():
            groups.setdefault(k, []).append(d)
        album = {r["id"]: r["album_id"] for r in rows}
        for k, ds in list(groups.items())[:15]:
            same_album = all(album[d] == album[k] for d in ds)
            print(f"  {k} ← {', '.join(ds)}  ({'같은 앨범' if same_album else '다른 앨범'})")
        return
    OUT.write_text(json.dumps({
        "made_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "about": f"같은 사진(SigLIP 코사인 ≥ {SAME}) — 키는 뺄 사진, 값은 남길 사진(먼저 올린 것). find_duplicate_photos.py 가 만든다",
        "same": SAME,
        "duplicates": dup,
    }, ensure_ascii=False, separators=(",", ":")))
    print(f"→ {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
