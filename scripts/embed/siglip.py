"""SigLIP 2 NaFlex 공용 유틸 — probe/eval/backfill 이 함께 쓴다. (docs/22 §4)

이 파일에 모아둔 이유: 아래 두 함정을 각 스크립트가 따로 구현하면 하나는 반드시
틀리게 짜고, 틀려도 에러 없이 "그럴듯한 벡터"가 나와 발견이 늦는다.

함정 1 — NaFlex 는 입력 텐서가 3개다.
    pixel_values 만 넘기면 안 되고 pixel_attention_mask(패딩 마스크)와
    spatial_shapes(원본 비율)를 함께 넘겨야 한다. processor 결과를 통째로
    언팩(**inputs)하면 자연히 지켜진다.

함정 2 — get_image_features 가 텐서를 반환하지 않는다. (transformers 5.x)
    vision_model 의 출력 객체(BaseModelOutputWithPooling)를 그대로 돌려준다.
    공식 docstring 예제조차 텐서처럼 쓰고 있어 그대로 믿으면 틀린다.
    풀링 벡터는 pooler_output 이며, last_hidden_state 는 패치별 토큰이라
    사진 단위 유사도에 쓰면 안 된다.
"""

MODEL_ID = "google/siglip2-so400m-patch16-naflex"
EMBED_DIM = 1152  # 실측값. 0068 의 halfvec(N) 과 일치해야 한다(docs/22 §6).


def pick_device(torch):
    if torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


def load(model_id=MODEL_ID, device=None):
    """(processor, model, device) 를 준비한다. 모델은 eval 모드."""
    import torch
    from transformers import AutoModel, AutoProcessor

    device = device or pick_device(torch)
    processor = AutoProcessor.from_pretrained(model_id)
    model = AutoModel.from_pretrained(model_id).to(device).eval()
    return processor, model, device


def image_embedding(out):
    """get_image_features 결과에서 사진 1장당 벡터 1개를 꺼낸다. (함정 2)

    반환: (텐서, 출처 라벨)
    """
    if hasattr(out, "shape"):  # 4.x 계열은 텐서를 직접 준다
        return out, "tensor"
    pooled = getattr(out, "pooler_output", None)
    if pooled is None:
        keys = list(out.keys()) if hasattr(out, "keys") else dir(out)
        raise RuntimeError(f"풀링 출력을 찾을 수 없다: {type(out).__name__} / {keys}")
    return pooled, "pooler_output"


def encode(processor, model, images, budget, device):
    """이미지 리스트 → L2 정규화된 (N, EMBED_DIM) 텐서. (함정 1·2 모두 처리)"""
    import torch

    inputs = processor(images=images, max_num_patches=budget, return_tensors="pt")
    inputs = {k: v.to(device) for k, v in inputs.items()}
    with torch.no_grad():
        out = model.get_image_features(**inputs)
    emb, _ = image_embedding(out)
    if emb.shape[-1] != EMBED_DIM:
        raise RuntimeError(f"임베딩 차원이 {emb.shape[-1]} 이다. EMBED_DIM({EMBED_DIM}) 과 0068 을 확인할 것.")
    return emb / emb.norm(dim=-1, keepdim=True)
