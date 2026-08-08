"""무드 어휘 — SigLIP 텍스트 타워에 넣을 프롬프트와 한글 라벨. (docs/22 §7.5 · 8단계)

**촬영 종류를 넣지 않는다.** 웨딩·커플·가족 같은 말은 여기 없다. 그것은 타겟 축
(target_explore_categories)이 담당하고, PR #267 에서 확인했듯 태그로 판단하면
범용 태그 하나에 걸려 피드가 오염된다. 여기서 만드는 것은 **무드(톤·빛·분위기·질감)**
뿐이다. 사진이 훨씬 많아지면 촬영 종류를 다시 넣는 편이 나을 수 있으나(그때는
태그가 세분화돼 과매칭이 줄어든다), 현재 규모에서는 추천을 강제하는 쪽으로 작용한다.

**프롬프트는 영어, 라벨은 한글.** SigLIP 은 영어 학습이 지배적이라 한글 프롬프트를
직접 넣으면 품질이 떨어진다. 화면에 나가는 것은 한글 라벨이다.

VERSION 을 반드시 올릴 것 — 어휘가 바뀌면 기존에 붙은 태그와 좌표계가 달라진다.
DB 에는 `<모델명>@<VERSION>` 형태로 기록해 재생성 대상을 고를 수 있게 한다(§6 참조).
"""

VERSION = "mood-v1"

# 프롬프트 템플릿. SigLIP 은 캡션 문장으로 학습됐으므로 단어만 넣지 않는다.
TEMPLATE = "a photo with {}"

# (한글 라벨, 영어 프롬프트 조각, 갈래)
MOODS = [
    # ── 색조 ───────────────────────────────────────────────
    ("따뜻한 톤", "warm orange and amber color tones", "색조"),
    ("차가운 톤", "cool blue and teal color tones", "색조"),
    ("채도 낮은", "muted desaturated washed out colors", "색조"),
    ("선명한 색", "vivid saturated punchy colors", "색조"),
    ("파스텔", "soft pastel pale colors", "색조"),
    # '흑백' 은 여기 없다 — 프롬프트가 아니라 픽셀로 측정한다. MEASURED 참조.
    ("베이지톤", "beige cream and sand neutral tones", "색조"),
    ("짙은 색감", "deep rich dark saturated colors", "색조"),
    ("초록빛", "lush green foliage tones", "색조"),

    # ── 빛 ─────────────────────────────────────────────────
    ("노을빛", "golden hour sunset light", "빛"),
    ("역광", "strong backlight with lens flare", "빛"),
    ("부드러운 빛", "soft diffused even lighting", "빛"),
    ("쨍한 햇빛", "harsh direct midday sunlight and hard shadows", "빛"),
    ("밤", "night time darkness with artificial lights", "빛"),
    ("실내 자연광", "indoor natural window light", "빛"),
    ("스튜디오 조명", "studio strobe lighting on a plain backdrop", "빛"),
    ("나뭇잎 빛", "dappled sunlight filtered through leaves", "빛"),
    ("흐린 날", "overcast cloudy grey daylight", "빛"),
    ("푸른 새벽", "blue hour twilight", "빛"),

    # ── 분위기 ─────────────────────────────────────────────
    ("몽환적인", "dreamy ethereal atmosphere", "분위기"),
    ("차분한", "calm serene quiet mood", "분위기"),
    ("발랄한", "playful cheerful joyful mood", "분위기"),
    ("다정한", "intimate tender affectionate mood", "분위기"),
    ("드라마틱한", "dramatic cinematic mood", "분위기"),
    ("아련한", "nostalgic wistful mood", "분위기"),
    ("화사한", "bright airy luminous mood", "분위기"),
    ("어두운", "dark moody somber atmosphere", "분위기"),
    ("로맨틱한", "romantic dreamy love mood", "분위기"),
    ("역동적인", "energetic dynamic movement", "분위기"),
    ("고요한", "still lonely empty quiet scene", "분위기"),
    ("따뜻한 분위기", "cozy warm comforting mood", "분위기"),

    # ── 질감·스타일 ────────────────────────────────────────
    ("필름", "analog film grain texture", "질감"),
    ("빈티지", "vintage retro faded look", "질감"),
    ("깔끔한", "clean sharp modern digital look", "질감"),
    ("흔들린", "motion blur camera shake", "질감"),
    ("소프트포커스", "soft focus shallow depth of field blur", "질감"),
    ("강한 대비", "high contrast deep blacks", "질감"),
    ("플랫한", "low contrast flat matte look", "질감"),
    ("뿌연", "hazy misty foggy air", "질감"),
    ("미니멀", "minimal simple composition with empty space", "질감"),
    ("거친 입자", "grainy noisy high iso texture", "질감"),

    # ── 공간감 (촬영 종류가 아니라 '어디에 있는 느낌'인지) ──
    ("탁 트인", "wide open expansive landscape", "공간"),
    ("좁고 아늑한", "tight enclosed cozy interior", "공간"),
    ("도시적인", "urban city street architecture", "공간"),
    ("자연 속", "natural outdoor nature setting", "공간"),
]

LABELS = [m[0] for m in MOODS]
PROMPTS = [TEMPLATE.format(m[1]) for m in MOODS]
GROUPS = [m[2] for m in MOODS]


# ── 측정 태그 ──────────────────────────────────────────────────────────
# 픽셀에서 정확히 잴 수 있는 것을 텍스트 타워에 묻지 않는다. 프롬프트 유사도는
# 순위(z-score)만 주므로 "진짜 흑백이 한 장도 없어도 상위 12장은 채워진다."
# 흑백은 chroma 로 딱 떨어지므로 재서 판정한다. 안 맞으면 아예 안 붙는 것이 맞다.
#
# 실측 (표본 300장): chroma 평균의 0% 분위가 0.09(완전 그레이스케일), 5% 분위가
# 4.18, 중앙값이 12.53. 3 아래가 실질 흑백 군집이다.
BW_CHROMA = 3.0       # 평균 채도가 이보다 낮으면 흑백
BW_CHROMA_STD = 6.0   # 부분적으로만 색이 있는 사진(스팟 컬러)은 제외


def measured(raw):
    """tone.descriptor 행렬 (N, tone.DIM) → [(라벨, 갈래, 부여여부 mask, 점수)].

    점수는 0~1 이며 1 이 가장 확실하다. 프롬프트 태그의 z-score 와 척도가 다르므로
    섞어서 정렬하지 말 것 — 측정 태그는 붙거나 안 붙거나 둘 중 하나다.
    """
    import numpy as np

    import tone

    ch = raw[:, tone.L_BINS + 4]
    ch_std = raw[:, tone.L_BINS + 5]
    mask = (ch < BW_CHROMA) & (ch_std < BW_CHROMA_STD)
    score = np.clip(1.0 - ch / BW_CHROMA, 0.0, 1.0)
    return [("흑백", "색조", mask, score)]


MEASURED_LABELS = ["흑백"]


def check():
    """라벨 중복을 막는다. 중복이 있으면 태그가 조용히 덮어써진다."""
    allv = LABELS + MEASURED_LABELS
    dup = {x for x in allv if allv.count(x) > 1}
    if dup:
        raise ValueError(f"라벨 중복: {dup}")
    return len(MOODS), len(MEASURED_LABELS)
