"""톤 디스크립터 — 사진의 색감·노출을 22차원 벡터로 요약한다. (docs/22 §7 · 7단계)

SigLIP 임베딩은 피사체·상황(의미)이 지배적이라 톤·질감 표현이 약하다(docs/22 §4.6).
이 모듈은 그 약한 축을 픽셀 통계로 따로 뽑아, 근접검색 점수에 섞을 수 있게 한다.
**모델이 필요 없다** — GPU 없이 PIL + numpy 로 계산한다.

왜 HSV 가 아니라 CIELAB 인가
    감성 사진에서 가장 크게 갈리는 축이 웜톤/쿨톤인데, LAB 의 b 축(청↔황)이
    그것을 한 숫자로 준다. HSV 의 hue 는 원형이라 평균이 성립하지 않고,
    채도가 낮은 필름톤 사진에서 값이 크게 튄다.

왜 L 을 평균 하나로 줄이지 않는가
    하이키와 로우키가 섞인 사진과 전체가 고르게 중간 밝기인 사진은 평균이 같다.
    분포(히스토그램)로 봐야 구분된다.

함정 — 기준 통계를 고정하지 않으면 좌표계가 어긋난다
    차원마다 스케일이 다르다(히스토그램 0~1 vs 표준편차 수십). 그대로 붙이면
    한 축이 거리 계산을 지배하므로 z-score 표준화가 필수인데, 그 평균·표준편차를
    저장해두지 않으면 신규 사진을 백필할 때마다 기준이 미세하게 달라져 **기존
    벡터와 좌표계가 어긋난다.** fit_stats() 결과를 반드시 함께 보관할 것.

함정 — 입력 해상도를 통일할 것
    표준편차는 리사이즈(=평활화)에 영향을 받는다. 전 사진에 같은 크기를 적용하면
    상대 비교는 유지되지만, 도중에 RESIZE_LONG 을 바꾸면 그 전후 벡터가 섞인다.
    임베딩이 thumb 으로 계산됐으므로 톤도 thumb 을 입력으로 쓴다(docs/22 §4.4).
"""

RESIZE_LONG = 160  # 긴 변 기준 리사이즈. 톤 통계에는 이 해상도로 충분하고 20배 빠르다.
L_BINS = 16        # L 히스토그램 구간 수
DIM = L_BINS + 6   # + a평균/a표준편차/b평균/b표준편차/chroma평균/chroma표준편차 = 22

# sRGB → XYZ (D65). 표준 행렬.
_M = ((0.4124564, 0.3575761, 0.1804375),
      (0.2126729, 0.7151522, 0.0721750),
      (0.0193339, 0.1191920, 0.9503041))
_WHITE = (0.95047, 1.00000, 1.08883)  # D65 백색점


def to_lab(img):
    """PIL RGB 이미지 → (L, a, b) 각각 1차원 배열. L 0~100, a·b 대략 -128~127.

    PIL 의 convert("LAB") 를 쓰지 않는 이유: 내부 백색점·행렬이 문서화돼 있지 않아
    재현성을 보장할 수 없다. 여기서는 D65 를 명시해 직접 변환한다.
    """
    import numpy as np

    w, h = img.size
    scale = RESIZE_LONG / max(w, h)
    if scale < 1:
        img = img.resize((max(1, round(w * scale)), max(1, round(h * scale))))

    rgb = np.asarray(img.convert("RGB"), dtype=np.float64) / 255.0
    # sRGB 감마 해제 → 선형 RGB
    lin = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    flat = lin.reshape(-1, 3)

    xyz = flat @ np.array(_M).T
    xyz /= np.array(_WHITE)

    eps = (6 / 29) ** 3
    f = np.where(xyz > eps, np.cbrt(xyz), xyz / (3 * (6 / 29) ** 2) + 4 / 29)
    fx, fy, fz = f[:, 0], f[:, 1], f[:, 2]

    return 116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)


def descriptor(img):
    """PIL 이미지 → 표준화 전 원시 디스크립터 (DIM,).

    표준화는 카탈로그 전체 통계가 있어야 하므로 여기서 하지 않는다. fit_stats 참조.
    """
    import numpy as np

    L, a, b = to_lab(img)
    hist, _ = np.histogram(L, bins=L_BINS, range=(0.0, 100.0))
    hist = hist / max(1, L.size)  # 장수·해상도와 무관하게 만든다
    chroma = np.sqrt(a * a + b * b)

    return np.concatenate([
        hist,
        [a.mean(), a.std(), b.mean(), b.std(), chroma.mean(), chroma.std()],
    ])


def fit_stats(raw):
    """(N, DIM) 원시 행렬 → z-score 기준 통계 (mean, std).

    **이 결과를 저장해 두어야 한다.** 신규 사진은 반드시 같은 통계로 표준화해야
    기존 벡터와 같은 좌표계에 놓인다(모듈 상단 함정 참조).
    """
    import numpy as np

    mean = raw.mean(axis=0)
    std = raw.std(axis=0)
    std[std < 1e-9] = 1.0  # 전 사진이 같은 값인 차원은 0 으로 남긴다
    return mean, std


def standardize(raw, stats):
    """원시 디스크립터를 z-score → L2 정규화. 코사인 유사도를 바로 쓸 수 있다."""
    import numpy as np

    mean, std = stats
    z = (np.atleast_2d(raw) - mean) / std
    norm = np.linalg.norm(z, axis=1, keepdims=True)
    norm[norm < 1e-9] = 1.0
    return z / norm
