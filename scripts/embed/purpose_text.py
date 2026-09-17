"""Pure, deterministic purpose evidence extraction from author-supplied text."""

from dataclasses import dataclass
import re
import unicodedata
from typing import Mapping, Sequence


PURPOSE_ORDER = (
    "personal",
    "couple",
    "friendship",
    "wedding",
    "pet",
    "commercial",
    "event",
)

# Strength 2 phrases directly describe a shoot. Strength 1 terms are useful
# candidates, but need source priority or image evidence to disambiguate.
PURPOSE_PHRASES: Mapping[str, tuple[tuple[str, int], ...]] = {
    "personal": (
        ("개인 스냅", 2), ("개인스냅", 2), ("프로필 촬영", 2),
        ("프로필 사진", 2), ("증명사진", 2), ("증명 사진", 2),
        ("여권사진", 2), ("여권 사진", 2), ("1인 스냅", 2),
        ("단독 스냅", 2), ("프로필", 1),
    ),
    "couple": (
        ("커플 스냅", 2), ("커플스냅", 2), ("커플 촬영", 2),
        ("커플 사진", 2), ("데이트 스냅", 2), ("데이트 촬영", 2),
        ("연인 스냅", 2), ("연인 촬영", 2), ("연인", 1),
        ("데이트", 1), ("커플", 1),
    ),
    "friendship": (
        ("우정 스냅", 2), ("우정스냅", 2), ("우정 촬영", 2),
        ("우정 사진", 2), ("친구 스냅", 2), ("친구 촬영", 2),
        ("베프 스냅", 2), ("우정", 1), ("친구", 1), ("베프", 1),
    ),
    "wedding": (
        ("웨딩 스냅", 2), ("웨딩스냅", 2), ("웨딩 촬영", 2),
        ("웨딩 사진", 2), ("본식 스냅", 2), ("본식 촬영", 2),
        ("결혼식", 2), ("신랑 신부", 2), ("신랑신부", 2),
        ("웨딩", 1), ("본식", 1), ("브라이덜", 1),
    ),
    "pet": (
        ("반려동물 촬영", 2), ("반려동물 스냅", 2),
        ("반려견 촬영", 2), ("반려견 스냅", 2),
        ("반려묘 촬영", 2), ("반려묘 스냅", 2),
        ("펫 촬영", 2), ("펫 스냅", 2), ("반려동물", 1),
        ("반려견", 1), ("반려묘", 1),
    ),
    "commercial": (
        ("상업 촬영", 2), ("브랜드 촬영", 2), ("쇼핑몰 촬영", 2),
        ("룩북 촬영", 2), ("제품 촬영", 2), ("제품 광고", 2),
        ("광고 촬영", 2), ("비즈니스 프로필", 2),
        ("상업", 1), ("브랜드", 1), ("쇼핑몰", 1), ("룩북", 1),
        ("제품", 1), ("광고", 1),
    ),
    "event": (
        ("단체 사진", 2), ("단체 촬영", 2), ("돌잔치", 2),
        ("돌 스냅", 2), ("첫돌", 2), ("만삭 스냅", 2),
        ("만삭 촬영", 2), ("아기 촬영", 2), ("베이비 스냅", 2),
        ("졸업 사진", 2), ("졸업 촬영", 2), ("졸업 기념", 2),
        ("연회 촬영", 2), ("동호회 촬영", 2), ("다인원 촬영", 2),
        ("단체", 1), ("만삭", 1), ("아기", 1),
        ("졸업", 1), ("연회", 1), ("동호회", 1), ("다인원", 1),
    ),
}

NEGATION = re.compile(r"(?:않|안\s*(?:함|해|됩|받|찍)|제외|불가|못\s*(?:함|해|찍))")
LISTING = re.compile(r"[/·,|]|(?:및|또는)|가능")


@dataclass(frozen=True)
class TextField:
    source: str
    text: str
    priority: int


@dataclass(frozen=True)
class TextEvidence:
    purpose: str | None
    candidates: tuple[str, ...]
    confidence: float
    conflict: bool
    matches: tuple[dict[str, object], ...]


def normalize_text(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).casefold()
    return re.sub(r"\s+", " ", value).strip()


def _is_negated(text: str, start: int, end: int) -> bool:
    window = text[max(0, start - 8):min(len(text), end + 24)]
    return NEGATION.search(window) is not None


def _field_matches(field: TextField) -> list[dict[str, object]]:
    text = normalize_text(field.text)
    if not text:
        return []

    found = []
    for purpose in PURPOSE_ORDER:
        best = None
        for phrase, strength in PURPOSE_PHRASES[purpose]:
            normalized_phrase = normalize_text(phrase)
            start = text.find(normalized_phrase)
            if start < 0 or _is_negated(text, start, start + len(normalized_phrase)):
                continue
            candidate = (strength, len(normalized_phrase), normalized_phrase)
            if best is None or candidate > best:
                best = candidate
        if best is not None:
            strength, _, phrase = best
            found.append({
                "source": field.source,
                "purpose": purpose,
                "phrase": phrase,
                "priority": field.priority,
                "strength": strength,
                "listing": bool(LISTING.search(text)),
            })
    return found


def classify_text(fields: Sequence[TextField]) -> TextEvidence:
    matches = [match for field in fields for match in _field_matches(field)]
    if not matches:
        return TextEvidence(None, (), 0.0, False, ())

    top_priority = max(int(match["priority"]) for match in matches)
    prioritized = [match for match in matches if match["priority"] == top_priority]
    prioritized_sources = {str(match["source"]) for match in prioritized}
    listed_purposes = {str(match["purpose"]) for match in prioritized if match["listing"]}
    is_multi_purpose_listing = len(prioritized_sources) == 1 and len(listed_purposes) > 1
    top_strength = max(int(match["strength"]) for match in prioritized)
    strongest = (
        prioritized
        if is_multi_purpose_listing
        else [match for match in prioritized if match["strength"] == top_strength]
    )
    candidate_set = {str(match["purpose"]) for match in strongest}
    candidates = tuple(purpose for purpose in PURPOSE_ORDER if purpose in candidate_set)

    evidence_matches = tuple(
        sorted(
            strongest,
            key=lambda match: (
                PURPOSE_ORDER.index(str(match["purpose"])),
                str(match["source"]),
            ),
        )
    )
    if len(candidates) == 1:
        confidence = 0.95 if top_strength == 2 else 0.82
        return TextEvidence(candidates[0], candidates, confidence, False, evidence_matches)

    sources = {str(match["source"]) for match in strongest}
    is_listing = len(sources) == 1 and all(bool(match["listing"]) for match in strongest)
    confidence = 0.72 if is_listing else 0.0
    return TextEvidence(None, candidates, confidence, not is_listing, evidence_matches)
