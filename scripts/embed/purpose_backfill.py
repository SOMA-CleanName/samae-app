#!/usr/bin/env python3
"""SigLIP 앨범 목적 분류 배치.

기본 실행은 읽기 전용 dry-run이다. 저장된 photos.embedding만 분류에 사용하고,
리포트용 썸네일은 점수 계산이 끝난 뒤에만 받는다. `--apply`를 명시한 경우에도
DB 쓰기는 앨범 단위 원자 RPC와 검수 목적 상속 RPC로만 수행한다.
"""

import argparse
import csv
import io
import json
import os
import re
import sys
import urllib.request
from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Mapping, Sequence

import numpy as np

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import purpose_classifier  # noqa: E402
import purposes  # noqa: E402
import purpose_text  # noqa: E402
import siglip  # noqa: E402
from backfill_client import BackfillClient  # noqa: E402

PAGE_SIZE = 300
EMBEDDING_PREFIX = f"{siglip.MODEL_ID.split('/')[-1]}@"


@dataclass(frozen=True)
class ApplyResult:
    processed: int
    classified: int
    unclassified: int
    failed: int
    updated_photos: int


def load_env(path: Path | None = None) -> dict[str, str]:
    env_path = path or HERE.parent.parent / ".env.local"
    values = {}
    with env_path.open(encoding="utf-8") as handle:
        for line in handle:
            match = re.match(r"^([A-Z_]+)=(.*)$", line.strip())
            if match:
                values[match.group(1)] = match.group(2).strip('"')
    for key in ("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"):
        if not values.get(key):
            raise RuntimeError(f"{env_path}에 {key}가 없습니다")
    return values


def api_request(env, method, path, body=None, extra=None):
    url = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1/" + path
    key = env["SUPABASE_SERVICE_ROLE_KEY"]
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        **(extra or {}),
    }
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=60) as response:
        raw = response.read()
        return json.loads(raw) if raw else None


def fetch_pages(request, path: str, page_size: int = PAGE_SIZE) -> list[dict]:
    rows = []
    offset = 0
    joiner = "&" if "?" in path else "?"
    while True:
        page = request("GET", f"{path}{joiner}offset={offset}&limit={page_size}") or []
        rows.extend(page)
        if len(page) < page_size:
            return rows
        offset += page_size


def filter_eligible_rows(
    albums: Sequence[Mapping[str, object]],
    photos: Sequence[Mapping[str, object]],
) -> tuple[list[Mapping[str, object]], int]:
    protected = {
        str(album["id"])
        for album in albums
        if album.get("admin_purpose_reviewed") is True
        or album.get("admin_purpose_source") == "manual"
    }
    eligible = [
        row for row in photos
        if str(row.get("album_id")) not in protected
        and row.get("admin_purpose_reviewed") is not True
        and row.get("admin_purpose_source") != "manual"
        and row.get("admin_purpose_overridden") is not True
    ]
    excluded_photo_count = len(photos) - len(eligible) - sum(
        1 for row in photos if str(row.get("album_id")) in protected
    )
    return eligible, len(protected) + excluded_photo_count


def parse_embedding(value) -> np.ndarray:
    if isinstance(value, str):
        value = json.loads(value)
    vector = np.asarray(value, dtype=np.float32)
    if vector.shape != (siglip.EMBED_DIM,) or not np.isfinite(vector).all():
        raise ValueError(f"embedding must contain {siglip.EMBED_DIM} finite values")
    norm = np.linalg.norm(vector)
    if norm == 0:
        raise ValueError("embedding cannot be a zero vector")
    return vector / norm


def prediction_purpose(prediction, threshold: float, *, force_all: bool = False) -> str | None:
    if prediction.source in ("text", "hybrid"):
        return prediction.purpose
    if force_all:
        top_purpose = prediction.purpose or prediction.image_purpose
        if top_purpose not in purposes.PURPOSE_KEYS:
            raise ValueError("force-all prediction must have a valid top purpose")
        return top_purpose
    if prediction.conflict or prediction.confidence < threshold:
        return None
    if prediction.purpose not in purposes.AUTO_ENABLED:
        return None
    return prediction.purpose


def apply_predictions(
    predictions,
    *,
    request,
    apply: bool,
    threshold: float,
    limit: int | None,
    force_all: bool = False,
    version: str = purposes.TEXT_FIRST_VERSION,
) -> ApplyResult:
    if not 0 <= threshold <= 1:
        raise ValueError("threshold must be between zero and one")
    if limit is not None and limit < 0:
        raise ValueError("limit cannot be negative")
    ordered = sorted(predictions, key=lambda item: (-item.confidence, item.album_id))
    selected = list(ordered[:limit] if limit is not None else ordered)
    classified = sum(
        prediction_purpose(item, threshold, force_all=force_all) is not None
        for item in selected
    )
    if not apply:
        return ApplyResult(len(selected), classified, len(selected) - classified, 0, 0)

    failed = 0
    updated_photos = 0
    for item in selected:
        try:
            # albums/photos evidence is readable by their owner; internal package links are not.
            public_evidence = {
                **item.evidence,
                "text_matches": [
                    match for match in item.evidence.get("text_matches", [])
                    if match.get("source") not in ("internal_package_name", "internal_package_description")
                ],
            }
            response = request(
                "POST",
                "rpc/apply_album_purpose_classification",
                {
                    "p_album_id": item.album_id,
                    "p_purpose": prediction_purpose(item, threshold, force_all=force_all),
                    "p_confidence": item.confidence,
                    "p_source": item.source,
                    "p_version": version,
                    "p_evidence": public_evidence,
                },
                {"Prefer": "return=representation"},
            )
            if isinstance(response, int):
                updated_photos += response
        except Exception as error:  # continue the batch, but report every failed portfolio
            failed += 1
            print(f"  실패 {item.album_id}: {error}", file=sys.stderr)
    return ApplyResult(
        processed=len(selected),
        classified=classified,
        unclassified=len(selected) - classified,
        failed=failed,
        updated_photos=updated_photos,
    )


def _json_record(prediction, album, threshold, *, force_all=False):
    record = asdict(prediction)
    record["top_scores"] = list(prediction.top_scores)
    record["title"] = album.get("title")
    record["description"] = album.get("description")
    record["applied_purpose"] = prediction_purpose(
        prediction, threshold, force_all=force_all
    )
    return record


def _default_fetch_thumbnail(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=30) as response:
        return response.read()


def _render_sheet(entries, destination: Path, fetch_thumbnail) -> list[dict]:
    from PIL import Image, ImageDraw, ImageOps

    cell_width, cell_height = 240, 220
    columns = 4
    rows = max(1, (len(entries) + columns - 1) // columns)
    canvas = Image.new("RGB", (columns * cell_width, rows * cell_height), "white")
    draw = ImageDraw.Draw(canvas)
    failures = []
    for index, entry in enumerate(entries):
        x = (index % columns) * cell_width
        y = (index // columns) * cell_height
        photo = entry["photo"]
        try:
            raw = fetch_thumbnail(photo["thumb_url"])
            with Image.open(io.BytesIO(raw)) as image:
                tile = ImageOps.fit(image.convert("RGB"), (cell_width, 180))
            canvas.paste(tile, (x, y))
        except Exception as error:
            draw.rectangle((x, y, x + cell_width, y + 180), fill="#dddddd")
            failures.append({"photo_id": photo.get("id"), "error": str(error)})
        label = f"{entry['prediction'].album_id[:8]} {entry['prediction'].confidence:.3f}"
        draw.text((x + 6, y + 187), label, fill="black")
    canvas.save(destination, quality=88)
    return failures


def write_artifacts(
    predictions,
    *,
    albums_by_id: Mapping[str, Mapping[str, object]],
    photos_by_album: Mapping[str, Sequence[Mapping[str, object]]],
    output_dir: Path,
    fetch_thumbnail: Callable[[str], bytes] | None = _default_fetch_thumbnail,
    threshold: float = purposes.AUTO_THRESHOLD,
    force_all: bool = False,
    version: str = purposes.TEXT_FIRST_VERSION,
) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    ordered = sorted(predictions, key=lambda item: (-item.confidence, item.album_id))
    records = [
        _json_record(
            item,
            albums_by_id.get(item.album_id, {}),
            threshold,
            force_all=force_all,
        )
        for item in ordered
    ]

    prediction_path = output_dir / "purpose-predictions.json"
    prediction_path.write_text(
        json.dumps(records, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    summary_path = output_dir / "purpose-summary.csv"
    with summary_path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=[
            "album_id",
            "title",
            "candidate",
            "applied_purpose",
            "source",
            "confidence",
            "conflict",
            "photo_count",
            "margin",
            "image_purpose",
            "text_candidates",
        ])
        writer.writeheader()
        for item, record in zip(ordered, records, strict=True):
            writer.writerow({
                "album_id": item.album_id,
                "title": record.get("title") or "",
                "candidate": item.purpose or "",
                "applied_purpose": record.get("applied_purpose") or "",
                "source": item.source,
                "confidence": f"{item.confidence:.6f}",
                "conflict": str(item.conflict).lower(),
                "photo_count": item.photo_count,
                "margin": f"{item.top_scores[0] - item.top_scores[1]:.6f}",
                "image_purpose": item.image_purpose or "",
                "text_candidates": "|".join(item.evidence.get("text_candidates", [])),
            })

    manifest = {
        "version": version,
        "threshold": None if force_all else threshold,
        "force_all": force_all,
        "albums": [],
        "sheets": [],
    }
    sheet_groups = defaultdict(list)
    boundary = []
    for item in ordered:
        photos = photos_by_album.get(item.album_id, ())
        representative = next((photo for photo in photos if photo.get("thumb_url")), None)
        manifest["albums"].append({
            "album_id": item.album_id,
            "candidate": item.purpose,
            "confidence": item.confidence,
            "representative_photo_id": representative.get("id") if representative else None,
        })
        if representative and fetch_thumbnail:
            entry = {"prediction": item, "photo": representative}
            sheet_purpose = prediction_purpose(
                item, threshold, force_all=force_all
            )
            sheet_groups[sheet_purpose or "unclassified"].append(entry)
            if abs(item.confidence - threshold) <= 0.1 or item.conflict:
                boundary.append(entry)

    generated = [prediction_path, summary_path]
    if fetch_thumbnail:
        for group, entries in sorted(sheet_groups.items()):
            sheet_path = output_dir / f"purpose-{group}.jpg"
            failures = _render_sheet(entries[:24], sheet_path, fetch_thumbnail)
            manifest["sheets"].append({
                "file": sheet_path.name,
                "album_count": min(len(entries), 24),
                "image_failures": failures,
            })
            generated.append(sheet_path)
        if boundary:
            sheet_path = output_dir / "purpose-boundary.jpg"
            failures = _render_sheet(boundary[:40], sheet_path, fetch_thumbnail)
            manifest["sheets"].append({
                "file": sheet_path.name,
                "album_count": min(len(boundary), 40),
                "image_failures": failures,
            })
            generated.append(sheet_path)

    manifest_path = output_dir / "contact-sheet-manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    generated.append(manifest_path)
    return generated


def fetch_inputs(request, *, include_unpublished: bool = False, reference_rows: list | None = None):
    albums = fetch_pages(
        request,
        "albums?select=id,title,description,package_id,target_category_id,admin_purpose_source,"
        "admin_purpose_reviewed,admin_purpose_version,admin_purpose_at,updated_at",
    )
    photo_filters = "&album_id=not.is.null&embedding=not.is.null"
    if not include_unpublished:
        photo_filters += "&visibility=eq.published"
    photos = fetch_pages(
        request,
        "photos?select=id,album_id,src_url,thumb_url,title,caption,mood_tags,embedding,embedding_model,visibility,"
        "admin_purpose_source,admin_purpose_reviewed,admin_purpose_overridden,admin_purpose_version,"
        "admin_purpose_at,updated_at"
        + photo_filters,
    )
    packages = fetch_pages(request, "packages?select=id,name,description,updated_at")
    admin_packages = fetch_pages(request, "album_admin_packages?select=album_id,package_id,assigned_at")
    categories = fetch_pages(request, "categories?select=id,name")
    memberships = fetch_pages(
        request,
        "album_explore_categories?select=album_id,explore_category_id",
    )
    explore_categories = fetch_pages(request, "explore_categories?select=id,title")

    packages_by_id = {str(row["id"]): row for row in packages}
    admin_package_by_album = {str(row["album_id"]): row for row in admin_packages}
    categories_by_id = {str(row["id"]): row for row in categories}
    explores_by_id = {str(row["id"]): row for row in explore_categories}
    explore_ids_by_album = defaultdict(list)
    for row in memberships:
        explore_ids_by_album[str(row["album_id"])].append(str(row["explore_category_id"]))
    for album in albums:
        internal = admin_package_by_album.get(str(album["id"]), {})
        package_id = album.get("package_id") or internal.get("package_id")
        album["package_is_internal"] = not album.get("package_id") and bool(package_id)
        target_id = album.get("target_category_id")
        album["package"] = packages_by_id.get(str(package_id)) if package_id else None
        album["package_updated_at"] = (album["package"] or {}).get("updated_at")
        album["package_assigned_at"] = internal.get("assigned_at") if album["package_is_internal"] else None
        target = categories_by_id.get(str(target_id)) if target_id else None
        album["target_category_name"] = target.get("name") if target else None
        album["explore_category_names"] = [
            explores_by_id[explore_id]["title"]
            for explore_id in explore_ids_by_album.get(str(album["id"]), [])
            if explore_id in explores_by_id
        ]
    compatible = []
    for photo in photos:
        model = photo.get("embedding_model")
        if isinstance(model, str) and model.startswith(EMBEDDING_PREFIX):
            compatible.append(photo)
    eligible, excluded = filter_eligible_rows(albums, compatible)
    if reference_rows is not None:
        reference_rows.extend(compatible)
    return albums, eligible, excluded, len(photos) - len(compatible)


def changed_since_classification(row, *fields):
    def timestamp(value):
        if not value:
            return None
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)

    classified_at = timestamp(row.get("admin_purpose_at"))
    return any(
        changed_at is not None and (classified_at is None or changed_at > classified_at)
        for changed_at in (timestamp(row.get(field)) for field in fields)
    )


def pending_album_ids(albums, eligible_photos):
    eligible_ids = {str(row["album_id"]) for row in eligible_photos}
    pending = {str(album["id"]) for album in albums
               if album.get("admin_purpose_version") != purposes.DAILY_VERSION
               or changed_since_classification(album, "updated_at", "package_updated_at", "package_assigned_at")}
    pending.update(str(row["album_id"]) for row in eligible_photos
                   if row.get("admin_purpose_version") != purposes.DAILY_VERSION
                   or changed_since_classification(row, "updated_at"))
    return pending & eligible_ids


def build_text_fields(album, photos):
    fields = []

    def add(source, value, priority):
        if isinstance(value, str) and value.strip():
            fields.append(purpose_text.TextField(source, value, priority))

    for photo in photos:
        add("photo_title", photo.get("title"), 5)
        add("photo_caption", photo.get("caption"), 5)
    add("album_title", album.get("title"), 4)
    add("album_description", album.get("description"), 4)
    add("target_category", album.get("target_category_name"), 3)
    for name in album.get("explore_category_names") or []:
        add("explore_category", name, 3)
    package = album.get("package")
    if isinstance(package, Mapping):
        prefix = "internal_" if album.get("package_is_internal") else ""
        add(prefix + "package_name", package.get("name"), 2)
        add(prefix + "package_description", package.get("description"), 2)
    hashtags = []
    for photo in photos:
        for tag in photo.get("mood_tags") or []:
            if isinstance(tag, str) and tag.strip():
                hashtags.append(tag.strip())
    if hashtags:
        add("hashtags", " ".join(dict.fromkeys(hashtags)), 1)
    return fields


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="원자 RPC로 DB에 저장")
    parser.add_argument("--daily", action="store_true", help="공개 신규/미처리 목적만 처리, 시각 후보는 한 개 선택")
    parser.add_argument("--embed-url", default="http://127.0.0.1:8077", help="검색 우선 상주 서버 주소")
    parser.add_argument("--standalone", action="store_true", help="상주 서버를 끈 오프라인 분석용 별도 모델")
    parser.add_argument(
        "--force-all",
        action="store_true",
        help="비공개 사진까지 포함하고 임계값·충돌과 무관하게 중앙값 1위를 저장",
    )
    parser.add_argument("--limit", type=int, help="저장할 최대 포트폴리오 수")
    parser.add_argument("--threshold", type=float, default=purposes.AUTO_THRESHOLD)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("/private/tmp/samae-purpose-analysis/purpose-v1"),
    )
    args = parser.parse_args()
    if args.limit is not None and args.limit < 0:
        parser.error("--limit은 0 이상이어야 합니다")
    if not 0 <= args.threshold <= 1:
        parser.error("--threshold는 0 이상 1 이하여야 합니다")
    if args.daily and (args.force_all or args.standalone):
        parser.error("--daily는 공개 사진·상주 서버만 사용하므로 --force-all/--standalone과 함께 사용할 수 없습니다")

    purposes.check_prompts()
    env = load_env()
    request = lambda method, path, body=None, extra=None: api_request(  # noqa: E731
        env, method, path, body, extra
    )
    inherited = 0
    if args.daily and args.apply:
        inherited = request("POST", "rpc/backfill_inherited_photo_purposes", {})
        if type(inherited) is not int or inherited < 0:
            raise RuntimeError("검수 목적 상속 RPC가 유효한 처리 개수를 반환하지 않았습니다")
        print(f"기존 검수 목적 상속 {inherited}장", flush=True)
    reference_rows = []
    albums, eligible_rows, excluded, incompatible = fetch_inputs(
        request, include_unpublished=args.force_all, reference_rows=reference_rows
    )
    targets = (pending_album_ids(albums, eligible_rows) if args.daily
               else {str(row["album_id"]) for row in eligible_rows})
    rows = [row for row in eligible_rows if str(row["album_id"]) in targets]
    force_top = args.force_all or args.daily
    version = purposes.DAILY_VERSION if args.daily else purposes.TEXT_FIRST_VERSION
    print(
        f"모드 {'APPLY' if args.apply else 'DRY-RUN'}"
        f"{' DAILY' if args.daily else ' FORCE-ALL' if args.force_all else ''} · 사진 {len(rows)}장 · "
        f"보호 대상 {excluded}개 · 비호환 임베딩 {incompatible}장"
    )

    if not rows:
        write_artifacts([], albums_by_id={}, photos_by_album={}, output_dir=args.output,
                        fetch_thumbnail=None, force_all=force_top, version=version)
        (args.output / "purpose-result.json").write_text(
            json.dumps({**asdict(ApplyResult(0, 0, 0, 0, 0)), "inherited_photos": inherited,
                        "apply": args.apply, "version": version}), encoding="utf-8")
        print("목적 대상 없음 — 검수·수동 지정 또는 현재 버전 처리 완료. 정상 종료.")
        return 0

    # 검수 데이터는 임베딩 점수 분포의 읽기 전용 기준으로만 쓴다.
    # 대상의 투표·저장에는 검수/예외 사진을 넣지 않는다.
    image_vectors = np.stack([parse_embedding(row["embedding"]) for row in reference_rows])
    prompt_texts = [text for key in purposes.PURPOSE_KEYS for text in purposes.PROMPTS[key]]
    if args.standalone:
        processor, model, device = siglip.load()
        text_vectors = siglip.encode_text(processor, model, prompt_texts, device).float().cpu().numpy()
    else:
        token = os.environ.get("PERSONA_SERVICE_TOKEN") or env.get("PERSONA_SERVICE_TOKEN", "")
        if not token.strip():
            raise RuntimeError("목적 백필에 PERSONA_SERVICE_TOKEN이 필요합니다")
        client = BackfillClient(args.embed_url, token, 256)
        client.check_health()
        text_vectors = np.asarray(client.embed_texts(prompt_texts), dtype=np.float64)
    albums_by_id = {str(album["id"]): album for album in albums}
    photos_by_album = defaultdict(list)
    for row in rows:
        photos_by_album[str(row["album_id"])].append(row)
    image_predictions = purpose_classifier.classify_catalog(
        reference_rows, image_vectors, text_vectors, target_photo_ids={str(row["id"]) for row in rows}
    )
    predictions = [
        purpose_classifier.combine_prediction(
            purpose_text.classify_text(
                build_text_fields(
                    albums_by_id.get(item.album_id, {}),
                    photos_by_album.get(item.album_id, ()),
                )
            ),
            item,
        )
        for item in image_predictions if item.album_id in targets
    ]
    paths = write_artifacts(
        predictions,
        albums_by_id=albums_by_id,
        photos_by_album=photos_by_album,
        output_dir=args.output,
        threshold=args.threshold,
        force_all=force_top,
        version=version,
        **({"fetch_thumbnail": None} if args.daily else {}),
    )
    result = apply_predictions(
        predictions,
        request=request,
        apply=args.apply,
        threshold=args.threshold,
        limit=args.limit,
        force_all=force_top,
        version=version,
    )
    print(
        f"포트폴리오 {result.processed}개 · 분류 {result.classified} · "
        f"미분류 {result.unclassified} · 실패 {result.failed} · "
        f"갱신 사진 {result.updated_photos}장"
    )
    print("산출물 " + ", ".join(str(path) for path in paths))
    (args.output / "purpose-result.json").write_text(
        json.dumps({**asdict(result), "inherited_photos": inherited, "apply": args.apply, "version": version}, ensure_ascii=False),
        encoding="utf-8",
    )
    if not args.apply:
        print("DB 쓰기 없음. 적용하려면 --apply를 명시하세요.")
    return 1 if result.failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
