"""페르소나용 로컬 SigLIP 타당성 확인 — 맥미니에서 몇 초에 끝나는가.

배경: qwen3-vl 로 사진 6장을 보게 하면 이미지 입력 처리에만 20~26초가 든다(2026-08-20 실측).
사진을 매번 VLM 에 밀어넣는 대신 **임베딩**으로 바꾸면
  · 사용자 사진 → 벡터 (여기서 재는 것)
  · 벡터 평균 → pgvector kNN → '내 사진과 닮은 사매 사진' (수십 ms)
  · 무드도 카테고리 중심 벡터와의 코사인으로 분류 가능
가 되어 LLM 은 문장만 쓰면 된다.

실행:
  scripts/embed/.venv/bin/python scripts/embed/persona_probe.py [사진수] [패치예산]
"""

import io
import json
import os
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import siglip  # noqa: E402


def load_env():
    """.env / .env.local 에서 Supabase 접속값만 읽는다 (python-dotenv 없이)."""
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    env = {}
    for name in (".env", ".env.local"):
        path = os.path.join(root, name)
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return env


def fetch_photo_urls(env, n):
    url = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
    key = env["SUPABASE_SERVICE_ROLE_KEY"]
    q = f"{url}/rest/v1/photos?select=id,src_url&visibility=eq.published&src_url=not.is.null&limit={n}"
    req = urllib.request.Request(q, headers={"apikey": key, "Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return [row["src_url"] for row in json.load(r) if row.get("src_url")]


def main():
    from PIL import Image

    n = int(sys.argv[1]) if len(sys.argv) > 1 else 9
    budget = int(sys.argv[2]) if len(sys.argv) > 2 else 256

    env = load_env()
    urls = fetch_photo_urls(env, n)
    print(f"📷 사진 {len(urls)}장")

    t = time.perf_counter()
    images = []
    for u in urls:
        with urllib.request.urlopen(u, timeout=20) as r:
            images.append(Image.open(io.BytesIO(r.read())).convert("RGB"))
    dl = time.perf_counter() - t
    print(f"⬇️  다운로드 {dl:.1f}s")

    t = time.perf_counter()
    processor, model, device = siglip.load()
    load_s = time.perf_counter() - t
    print(f"🧠 모델 로드 {load_s:.1f}s  (device={device})")

    # 첫 호출은 커널 컴파일 때문에 느리다 — 워밍업과 실측을 나눈다.
    t = time.perf_counter()
    siglip.encode(processor, model, images[:1], budget, device)
    warm = time.perf_counter() - t
    print(f"🔥 워밍업 1장 {warm:.1f}s")

    t = time.perf_counter()
    emb = siglip.encode(processor, model, images, budget, device)
    infer = time.perf_counter() - t
    print(f"⚡ 임베딩 {len(images)}장 {infer:.2f}s  ({infer / len(images) * 1000:.0f}ms/장)  shape={tuple(emb.shape)}")

    # 평균 벡터 — 이게 '이 사람의 미감' 대표 벡터가 된다
    import torch

    mean = emb.mean(dim=0)
    mean = mean / mean.norm()
    print(f"🎯 평균 벡터 norm={float(mean.norm()):.4f}  dim={mean.shape[0]}")

    # 사진끼리 얼마나 흩어져 있는지 — 피드 일관성 지표로 쓸 수 있다
    sims = (emb @ mean).tolist()
    print(f"📐 평균과의 코사인: 최소 {min(sims):.3f} / 중앙 {sorted(sims)[len(sims)//2]:.3f} / 최대 {max(sims):.3f}")
    print(f"\n벡터 앞 8개: {[round(float(x), 4) for x in mean[:8]]}")


if __name__ == "__main__":
    main()
