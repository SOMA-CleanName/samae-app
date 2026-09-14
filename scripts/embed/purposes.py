"""SigLIP 사진 목적 분류용 고정 어휘.

각 목적은 동일한 수의 caption prototype을 사용한다. 결과 코드는 운영자용
대분류 일곱 개뿐이며, 문장 속 세부 상황은 event/commercial 판별을 돕는
시각적 예시일 뿐 별도 태그로 저장하지 않는다.
"""

PURPOSE_KEYS = (
    "personal",
    "couple",
    "friendship",
    "wedding",
    "pet",
    "commercial",
    "event",
)

PROMPTS = {
    "personal": (
        "A solo portrait photography session of one person.",
        "A personal lifestyle snapshot of one person outdoors.",
        "An individual profile portrait with a clean background.",
        "A professional head-and-shoulders portrait of one person.",
        "An ID style portrait photograph of one person.",
        "A solo travel portrait taken at a scenic location.",
        "A candid personal photo shoot featuring one subject.",
        "A full-body personal portrait session in the city.",
    ),
    "couple": (
        "A romantic couple portrait photography session.",
        "Two partners on a casual outdoor date photo shoot.",
        "A candid snapshot of a couple spending time together.",
        "A couple posing affectionately in everyday clothes.",
        "Two people holding hands during a couple photo session.",
        "A romantic anniversary portrait of a couple.",
        "A lifestyle photograph of two partners walking together.",
        "A playful dating couple photographed in the city.",
    ),
    "friendship": (
        "A friendship snapshot of close friends posing together.",
        "Two friends laughing during a casual photo session.",
        "A small group of friends taking commemorative portraits.",
        "Best friends posing playfully outdoors.",
        "Friends making matching poses for a keepsake photo.",
        "A candid lifestyle photograph of close friends together.",
        "Friends celebrating their friendship in casual clothes.",
        "A fun group portrait made as a friendship memory.",
    ),
    "wedding": (
        "A bride and groom in wedding attire during a wedding photo shoot.",
        "A pre-wedding snapshot of an engaged couple.",
        "A wedding couple portrait with a white dress and formal suit.",
        "A romantic bridal photography session outdoors.",
        "Newlyweds posing together on their wedding day.",
        "A wedding ceremony moment featuring the married couple.",
        "An elegant studio wedding portrait of a bride and groom.",
        "A documentary wedding snapshot of the couple celebrating.",
    ),
    "pet": (
        "A pet portrait photography session with a dog.",
        "A person posing affectionately with their companion animal.",
        "A playful outdoor snapshot of a pet and its owner.",
        "A studio portrait focused on a companion animal.",
        "A family-style keepsake photograph featuring a pet.",
        "A candid lifestyle photo of a person and their dog.",
        "A close-up portrait of a beloved cat or dog.",
        "A commemorative photo session centered on a companion animal.",
    ),
    "commercial": (
        "A fashion lookbook photograph featuring styled clothing.",
        "An online shopping mall apparel campaign photo.",
        "A polished product advertisement photographed in a studio.",
        "A branded commercial lifestyle campaign image.",
        "A business profile headshot for a company website.",
        "A catalog photograph presenting a product for sale.",
        "A professional advertising image with deliberate art direction.",
        "A model posing for a fashion brand editorial shoot.",
    ),
    "event": (
        "A large group portrait taken at a formal event.",
        "A first birthday celebration photo with a baby and family.",
        "A maternity keepsake portrait celebrating pregnancy.",
        "A baby milestone photography session with family.",
        "A graduation portrait in a cap and gown.",
        "A banquet or reception group photograph.",
        "A club gathering commemorative group photo.",
        "A school ceremony or organized event group portrait.",
    ),
}

VERSION = "purpose-v2"
AUTO_THRESHOLD = 0.90

# 첫 dry-run 수동 검토 결과, 시각만으로 촬영 의도를 안정적으로 나눌 수 있었던
# 범주만 자동 적용한다. personal/friendship/pet/commercial 후보는 점수와 무관하게
# 운영자 큐에 남긴다(특히 반려동물이 포함된 웨딩과 개인 콘셉트/룩북이 충돌함).
AUTO_ENABLED = ("couple", "wedding", "event")


def check_prompts():
    """Validate a balanced, complete and duplicate-free prompt catalog."""
    if tuple(PROMPTS) != PURPOSE_KEYS:
        raise ValueError("prompt keys must match PURPOSE_KEYS in order")
    counts = {len(values) for values in PROMPTS.values()}
    if len(counts) != 1 or not counts or next(iter(counts)) == 0:
        raise ValueError("all purpose groups must contain the same nonzero prompt count")
    flattened = [text.strip() for values in PROMPTS.values() for text in values]
    if any(not text for text in flattened):
        raise ValueError("purpose prompts cannot be blank")
    lowered = [text.casefold() for text in flattened]
    if len(lowered) != len(set(lowered)):
        raise ValueError("purpose prompts must be unique")
    return len(flattened)
