"""Pure numerical helpers for album-level SigLIP purpose classification."""

from dataclasses import dataclass
from typing import Mapping, Sequence

import numpy as np

try:
    from . import purposes
    from .purpose_text import TextEvidence
except ImportError:  # direct execution from scripts/embed
    import purposes
    from purpose_text import TextEvidence


@dataclass(frozen=True)
class AlbumEvidence:
    album_id: str
    candidate: str | None
    margin: float
    majority_ratio: float
    conflict: bool
    photo_count: int
    top_scores: tuple[float, float]
    top_purpose: str | None = None
    purpose_scores: tuple[tuple[str, float], ...] = ()


@dataclass(frozen=True)
class AlbumPrediction:
    album_id: str
    purpose: str | None
    confidence: float
    conflict: bool
    photo_count: int
    top_scores: tuple[float, float]
    top_purpose: str | None = None
    purpose_scores: tuple[tuple[str, float], ...] = ()


@dataclass(frozen=True)
class FinalPurposePrediction:
    album_id: str
    purpose: str | None
    confidence: float
    source: str
    conflict: bool
    photo_count: int
    top_scores: tuple[float, float]
    image_purpose: str | None
    evidence: dict[str, object]


def zscore_columns(cosine: np.ndarray) -> np.ndarray:
    matrix = np.asarray(cosine, dtype=np.float64)
    if matrix.ndim != 2 or not np.isfinite(matrix).all():
        raise ValueError("cosine matrix must be finite and two-dimensional")
    if matrix.shape[0] < 2 or matrix.shape[1] == 0:
        raise ValueError("cosine matrix needs at least two rows and one prompt")
    standard_deviation = matrix.std(axis=0)
    if np.any(standard_deviation == 0):
        raise ValueError("prompt score standard deviation must be nonzero")
    return (matrix - matrix.mean(axis=0)) / standard_deviation


def prompt_slices(keys: Sequence[str] = purposes.PURPOSE_KEYS) -> dict[str, slice]:
    purposes.check_prompts()
    width = len(purposes.PROMPTS[keys[0]])
    return {
        key: slice(index * width, (index + 1) * width)
        for index, key in enumerate(keys)
    }


def scores_by_purpose(
    zscores: np.ndarray,
    slices: Mapping[str, slice],
    keys: Sequence[str] = purposes.PURPOSE_KEYS,
) -> np.ndarray:
    matrix = np.asarray(zscores, dtype=np.float64)
    if matrix.ndim != 2 or not np.isfinite(matrix).all():
        raise ValueError("z-score matrix must be finite and two-dimensional")
    if len(keys) < 2:
        raise ValueError("at least two purpose keys are required")
    groups = []
    for key in keys:
        part = matrix[:, slices[key]]
        if part.shape[1] == 0:
            raise ValueError(f"purpose {key} has no prompt columns")
        groups.append(part.max(axis=1))
    return np.stack(groups, axis=1)


def aggregate_album(
    album_id: str,
    scores: np.ndarray,
    keys: Sequence[str] = purposes.PURPOSE_KEYS,
) -> AlbumEvidence:
    matrix = np.asarray(scores, dtype=np.float64)
    if matrix.ndim != 2 or matrix.shape[0] == 0 or matrix.shape[1] != len(keys):
        raise ValueError("album scores must be a nonempty photo-by-purpose matrix")
    if len(keys) < 2 or not np.isfinite(matrix).all():
        raise ValueError("album scores require at least two finite purpose columns")

    medians = np.median(matrix, axis=0)
    median_order = np.argsort(-medians, kind="stable")
    votes = np.argmax(matrix, axis=1)
    vote_counts = np.bincount(votes, minlength=len(keys))
    vote_order = np.argsort(-vote_counts, kind="stable")
    vote_tied = vote_counts[vote_order[0]] == vote_counts[vote_order[1]]
    median_tied = np.isclose(medians[median_order[0]], medians[median_order[1]])
    conflict = bool(vote_tied or median_tied or median_order[0] != vote_order[0])

    return AlbumEvidence(
        album_id=album_id,
        candidate=None if conflict else keys[int(median_order[0])],
        margin=float(medians[median_order[0]] - medians[median_order[1]]),
        majority_ratio=float(vote_counts[vote_order[0]] / matrix.shape[0]),
        conflict=conflict,
        photo_count=matrix.shape[0],
        top_scores=(
            float(medians[median_order[0]]),
            float(medians[median_order[1]]),
        ),
        top_purpose=keys[int(median_order[0])],
        purpose_scores=tuple(
            (key, float(medians[index])) for index, key in enumerate(keys)
        ),
    )


def calibrate_evidence(items: Sequence[AlbumEvidence]) -> list[AlbumPrediction]:
    if not items:
        return []
    margins = np.asarray([item.margin for item in items], dtype=np.float64)
    if not np.isfinite(margins).all():
        raise ValueError("album margins must be finite")
    order = np.argsort(np.argsort(margins, kind="stable"), kind="stable")
    denominator = max(len(items) - 1, 1)
    output = []
    for item, rank in zip(items, order, strict=True):
        margin_percentile = float(rank) / denominator
        confidence = (margin_percentile + item.majority_ratio) / 2.0
        output.append(AlbumPrediction(
            album_id=item.album_id,
            purpose=item.candidate,
            confidence=max(0.0, min(1.0, confidence)),
            conflict=item.conflict,
            photo_count=item.photo_count,
            top_scores=item.top_scores,
            top_purpose=item.top_purpose or item.candidate,
            purpose_scores=item.purpose_scores,
        ))
    return output


def _unit_rows(matrix: np.ndarray, name: str) -> np.ndarray:
    values = np.asarray(matrix, dtype=np.float64)
    if values.ndim != 2 or values.shape[0] == 0 or not np.isfinite(values).all():
        raise ValueError(f"{name} must be a nonempty finite matrix")
    norms = np.linalg.norm(values, axis=1, keepdims=True)
    if np.any(norms == 0):
        raise ValueError(f"{name} cannot contain zero vectors")
    return values / norms


def classify_catalog(
    photo_rows: Sequence[Mapping[str, object]],
    embeddings: np.ndarray,
    text_vectors: np.ndarray,
    *,
    keys: Sequence[str] = purposes.PURPOSE_KEYS,
    prompt_slices: Mapping[str, slice] | None = None,
) -> list[AlbumPrediction]:
    if len(photo_rows) != len(embeddings):
        raise ValueError("photo row and embedding counts must match")
    image_matrix = _unit_rows(embeddings, "image embeddings")
    text_matrix = _unit_rows(text_vectors, "text vectors")
    if image_matrix.shape[1] != text_matrix.shape[1]:
        raise ValueError("image and text embedding dimensions must match")

    cosine = image_matrix @ text_matrix.T
    zscores = zscore_columns(cosine)
    slices = prompt_slices or globals()["prompt_slices"](keys)
    purpose_scores = scores_by_purpose(zscores, slices, keys)

    indexes_by_album: dict[str, list[int]] = {}
    for index, row in enumerate(photo_rows):
        album_id = row.get("album_id")
        if not isinstance(album_id, str) or not album_id:
            raise ValueError("every classified photo must have an album_id")
        indexes_by_album.setdefault(album_id, []).append(index)

    evidence = [
        aggregate_album(album_id, purpose_scores[indexes], keys)
        for album_id, indexes in sorted(indexes_by_album.items())
    ]
    return calibrate_evidence(evidence)


def combine_prediction(
    text: TextEvidence,
    image: AlbumPrediction,
) -> FinalPurposePrediction:
    image_purpose = image.top_purpose or image.purpose
    evidence = {
        "text_candidates": list(text.candidates),
        "text_matches": list(text.matches),
        "text_conflict": text.conflict,
        "image_purpose": image_purpose,
        "image_confidence": image.confidence,
        "image_scores": dict(image.purpose_scores),
    }

    if text.conflict:
        return FinalPurposePrediction(
            image.album_id, None, 0.0, "hybrid", True, image.photo_count,
            image.top_scores, image_purpose, evidence,
        )

    if text.purpose is not None:
        return FinalPurposePrediction(
            image.album_id, text.purpose, text.confidence, "text", False,
            image.photo_count, image.top_scores, image_purpose, evidence,
        )

    if text.candidates:
        scores = dict(image.purpose_scores)
        if scores:
            chosen = max(text.candidates, key=lambda purpose: scores.get(purpose, float("-inf")))
        elif image_purpose in text.candidates:
            chosen = image_purpose
        else:
            chosen = None
        return FinalPurposePrediction(
            image.album_id,
            chosen,
            min(1.0, (text.confidence + image.confidence) / 2.0),
            "hybrid",
            chosen is None,
            image.photo_count,
            image.top_scores,
            image_purpose,
            evidence,
        )

    return FinalPurposePrediction(
        image.album_id,
        image_purpose,
        image.confidence,
        "siglip",
        image.conflict,
        image.photo_count,
        image.top_scores,
        image_purpose,
        evidence,
    )
