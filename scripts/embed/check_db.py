#!/usr/bin/env python3
"""사진 임베딩 사전 측정 — docs/22 §3 수치를 재생성한다.

읽기 전용이다. DB 를 변경하지 않으며, Storage 는 표본 몇 장만 내려받는다.
외부 패키지 없이 표준 라이브러리만 쓰므로 venv 없이 시스템 python3 로 바로 돌아간다.

    python3 scripts/embed/check_db.py

접속정보: .env.local 의 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
service_role 키는 RLS 를 우회하므로 이 스크립트는 조회만 하고 절대 쓰지 않는다.

pgvector 설치 여부는 PostgREST 로 시스템 카탈로그를 못 읽어 확인할 수 없다.
Supabase SQL Editor 에서 아래를 직접 실행할 것:

    select extname, extversion from pg_extension where extname = 'vector';
"""

import json
import os
import re
import struct
import sys
import urllib.error
import urllib.request
from collections import Counter

ENV_PATH = ".env.local"
SAMPLE_SIZE = 3  # 실제 이미지를 내려받아 크기를 재는 표본 수


def load_env(path):
    """.env.local 파싱 — scripts/migrate.cjs 와 같은 방식."""
    if not os.path.exists(path):
        sys.exit(f"❌ {path} 이 없습니다. 프로젝트 루트에서 실행하세요.")
    env = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            m = re.match(r"^([A-Z_]+)=(.*)$", line.strip())
            if m:
                env[m.group(1)] = m.group(2).strip('"')
    return env


def rest(env, path, headers=None, optional=False):
    """PostgREST 요청. (본문, 응답헤더) 반환.

    optional=True 면 실패해도 죽지 않고 (None, None) 을 준다.
    0068 적용 전에는 embedding 관련 컬럼이 없어 400 이 나므로, 그 경우에 쓴다.
    """
    url = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1/" + path
    key = env["SUPABASE_SERVICE_ROLE_KEY"]
    req = urllib.request.Request(url)
    req.add_header("apikey", key)
    req.add_header("Authorization", "Bearer " + key)
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return res.read(), res.headers
    except urllib.error.HTTPError as e:
        if optional:
            return None, None
        sys.exit(f"❌ 요청 실패 ({e.code}): {path}\n{e.read().decode(errors='replace')[:300]}")


def count(env, path, optional=False):
    """Prefer: count=exact 로 전체 행 수만 얻는다(본문 0행). 실패 시 None."""
    _, headers = rest(env, path, {"Prefer": "count=exact", "Range": "0-0"}, optional)
    if headers is None:
        return None
    cr = headers.get("Content-Range", "")
    return int(cr.split("/")[-1]) if "/" in cr else None


def jpeg_size(data):
    """JPEG SOF 마커에서 (가로, 세로) 추출. Pillow 없이 헤더만 읽는다."""
    i = 2
    while i < len(data) - 9:
        if data[i] != 0xFF:
            i += 1
            continue
        marker = data[i + 1]
        if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
            h, w = struct.unpack(">HH", data[i + 5 : i + 9])
            return w, h
        if marker in (0xD8, 0xD9) or 0xD0 <= marker <= 0xD7:
            i += 2
            continue
        i += 2 + struct.unpack(">H", data[i + 2 : i + 4])[0]
    return None


def main():
    env = load_env(ENV_PATH)
    print(f"프로젝트: {env['NEXT_PUBLIC_SUPABASE_URL']}\n")

    # ── 규모 ───────────────────────────────────────────────
    print("■ 규모")
    published = count(env, "photos?select=id&visibility=eq.published")
    rows = [
        ("전체 사진", count(env, "photos?select=id")),
        ("공개(published) 사진", published),
        ("thumb_url 누락", count(env, "photos?select=id&visibility=eq.published&thumb_url=is.null")),
        ("승인 작가", count(env, "photographers?select=id&status=eq.approved")),
        # 0068 적용 전에는 컬럼이 없어 None 이 된다.
        ("임베딩 대기(embedded_at null)", count(env, "photos?select=id&visibility=eq.published&embedded_at=is.null", optional=True)),
    ]
    for label, n in rows:
        print(f"  {label:32s} {n if n is not None else '— (0068 미적용)'}")

    # ── 저장량 추정 ────────────────────────────────────────
    if published > 0:
        mb = published * 1152 * 2 / 1024 / 1024
        print(f"\n  halfvec(1152) 예상 저장량        약 {mb:.1f} MB")

    # ── 이미지 실측 ────────────────────────────────────────
    print("\n■ 이미지 실측 (표본)")
    body, _ = rest(env, f"photos?select=width,height,src_url,thumb_url&visibility=eq.published&limit={SAMPLE_SIZE}")
    for r in json.loads(body):
        line = []
        for kind in ("thumb_url", "src_url"):
            if not r.get(kind):
                continue
            raw = urllib.request.urlopen(r[kind], timeout=30).read()
            wh = jpeg_size(raw)
            dims = f"{wh[0]}x{wh[1]}" if wh else "?"
            line.append(f"{kind.replace('_url',''):5s} {dims:>10s} {len(raw)/1024:6.0f}KB")
        print("  " + "  |  ".join(line) + f"  (DB 기록 {r['width']}x{r['height']})")

    # ── 비율 분포 ──────────────────────────────────────────
    # PostgREST 기본 응답 상한이 1000행이라 전수가 아닌 표본이다.
    print("\n■ 비율 분포")
    body, _ = rest(env, "photos?select=width,height&visibility=eq.published&limit=2000")
    dims = json.loads(body)
    c = Counter()
    for r in dims:
        w, h = r["width"], r["height"]
        if not w or not h:
            c["미기록"] += 1
            continue
        ar = w / h
        c["세로 (ar<0.9)" if ar < 0.9 else "정사각 (0.9~1.1)" if ar <= 1.1 else "가로 (ar>1.1)"] += 1
    total = len(dims)
    note = "" if total >= published else f"  ※ 공개 {published}장 중 {total}장 표본(PostgREST 응답 상한)"
    print(f"  표본 {total}장{note}")
    for k, v in c.most_common():
        print(f"  {k:20s} {v:5d}  {v/total*100:5.1f}%")

    print("\n■ pgvector — SQL Editor 에서 직접 확인")
    print("  select extname, extversion from pg_extension where extname = 'vector';")


if __name__ == "__main__":
    main()
