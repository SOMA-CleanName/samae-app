#!/usr/bin/env python3
"""모델 검증 — 임베딩 차원과 NaFlex 입출력 형태를 실측한다. (docs/22 §4.4, §9.3)

`0068` 의 halfvec 차원이 실제 모델과 맞는지 확인하는 것이 주 목적이다.
모델을 교체할 때도 이 스크립트로 차원을 먼저 재고 마이그레이션을 정한다.

    scripts/embed/.venv/bin/python scripts/embed/probe_model.py

DB 는 읽기만 한다(표본 사진 1장의 thumb_url 조회). 첫 실행 시 모델 웨이트를
내려받으므로 수 GB · 수 분이 걸린다(이후 ~/.cache/huggingface 에 캐시).
"""

import json
import os
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from check_db import load_env, rest  # noqa: E402

MODEL_ID = "google/siglip2-so400m-patch16-naflex"
PATCH_BUDGETS = [256, 1024]  # docs/22 §4.4 의 비교 후보


def pick_device(torch):
    if torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


def image_embedding(out):
    """get_image_features 결과에서 사진 1장당 벡터 1개를 꺼낸다.

    transformers 5.x 의 Siglip2Model.get_image_features 는 텐서가 아니라
    vision_model 의 출력 객체(BaseModelOutputWithPooling)를 그대로 반환한다.
    (공식 docstring 예제는 텐서처럼 쓰고 있어 그대로 믿으면 틀린다)

    풀링된 임베딩은 pooler_output 이다. last_hidden_state 는 패치별 토큰이라
    사진 단위 유사도에 쓰면 안 된다.
    """
    if hasattr(out, "shape"):  # 4.x 계열은 텐서를 직접 준다
        return out, "tensor"
    pooled = getattr(out, "pooler_output", None)
    if pooled is None:
        raise RuntimeError(f"풀링 출력을 찾을 수 없다: {type(out).__name__} / {list(out.keys())}")
    return pooled, "pooler_output"


def main():
    import torch
    from PIL import Image
    from transformers import AutoModel, AutoProcessor

    print(f"torch {torch.__version__}")
    import transformers

    print(f"transformers {transformers.__version__}")
    device = pick_device(torch)
    print(f"device {device}\n")

    # ── 표본 사진 1장 (공개 사진의 thumb) ────────────────────
    env = load_env(".env.local")
    body, _ = rest(env, "photos?select=id,width,height,thumb_url&visibility=eq.published&limit=1")
    photo = json.loads(body)[0]
    print(f"표본 사진 {photo['id']}  원본 {photo['width']}x{photo['height']}")
    raw = urllib.request.urlopen(photo["thumb_url"], timeout=60).read()
    tmp = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".probe.jpg")
    with open(tmp, "wb") as f:
        f.write(raw)
    image = Image.open(tmp).convert("RGB")
    print(f"thumb 실측  {image.width}x{image.height}\n")

    # ── 모델 로드 ────────────────────────────────────────────
    print(f"모델 로드: {MODEL_ID} (첫 실행이면 다운로드)")
    t0 = time.time()
    processor = AutoProcessor.from_pretrained(MODEL_ID)
    model = AutoModel.from_pretrained(MODEL_ID).to(device).eval()
    print(f"  로드 {time.time() - t0:.1f}s\n")

    # ── max_num_patches 별 입출력 실측 ───────────────────────
    for budget in PATCH_BUDGETS:
        inputs = processor(images=image, max_num_patches=budget, return_tensors="pt")
        shapes = {k: tuple(v.shape) for k, v in inputs.items() if hasattr(v, "shape")}
        inputs = {k: v.to(device) for k, v in inputs.items()}

        t0 = time.time()
        with torch.no_grad():
            # NaFlex 는 pixel_values 외에 pixel_attention_mask·spatial_shapes 를
            # 함께 넘겨야 한다. 통째로 언팩해 누락을 막는다.
            out = model.get_image_features(**inputs)
        dt = time.time() - t0
        emb, source = image_embedding(out)

        normed = emb / emb.norm(dim=-1, keepdim=True)
        print(f"■ max_num_patches={budget}")
        print(f"  processor 출력   {shapes}")
        if "spatial_shapes" in inputs:
            print(f"  spatial_shapes   {inputs['spatial_shapes'].tolist()}  (패치 단위 h,w)")
        print(f"  반환 타입        {type(out).__name__} → {source}")
        print(f"  임베딩 shape     {tuple(emb.shape)}  dtype={emb.dtype}")
        print(f"  ★ 임베딩 차원    {emb.shape[-1]}")
        print(f"  정규화 후 norm   {normed.norm(dim=-1).item():.6f}  (1.0 이어야 정상)")
        print(f"  추론 {dt:.2f}s\n")

    os.remove(tmp)
    print("→ 위 '임베딩 차원' 이 0068 의 halfvec(N) 과 일치해야 한다.")


if __name__ == "__main__":
    main()
