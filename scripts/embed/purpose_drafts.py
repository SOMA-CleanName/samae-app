#!/usr/bin/env python3
"""목적 세부분류 · 개인 성별 자동 초안 — 매일 06:00 배치의 4단계 (docs/39 §3, §3.2, §7.4).

목적 분류(purpose_backfill.py)가 포트폴리오의 목적을 정한 뒤, 그 목적 안의 세부분류와 개인 사진의 성별을
초안(auto)으로 채운다. 사진은 보관(archived)만 빼고 비공개(draft)까지 센다 — 0135 와 같이 노출과 상관없이 붙여 둔다.
규칙은 scripts/draft-purpose-details.cjs · draft-personal-gender.cjs 와 같다 —
그 둘은 손으로 돌리는 도구였고 배치에 붙어 있지 않아, 2026-09-18 이후 들어온 포트폴리오는 목적만 붙고
세부분류 · 성별이 비어 있었다. 맥미니 배치는 Node 없이 venv 만으로 돌므로 같은 규칙을 파이썬으로 옮겼다.

  세부분류  목적마다 ① 제목 · 설명을 검색어 분리기(/search-query)에 넣어 나온 세부분류(글 먼저, §6)
           ② 없으면 세부분류마다 둔 영어 문장과 사진을 비교해 포트폴리오 안 다수결
           개인은 스냅 / 프로필 규칙(2026-09-18 확정)을 따른다 — 누가 봐도 프로필일 때만 프로필
  성별     개인 사진마다 "여자" · "남자" 문장과의 거리 차(경계 0.005)로 가르고 포트폴리오 안 다수결. 동수면 두지 않는다

쓰는 것은 apply_album_details_draft · apply_album_gender_draft RPC 뿐이다. 두 함수는 사람이 정한 값(manual)과
사진 예외를 건드리지 않는다. 초안은 auto 로 남아 어드민에서 검수한다.

  --daily  비어 있는 것만 채운다 — 세부분류가 없는 목적이 있는 포트폴리오, 성별이 없는 개인 포트폴리오.
           이미 들어간 초안은 다시 쓰지 않는다(검수하며 "보고 그대로 둔" auto 가 바뀌지 않게, docs/39 §3 교훈).
           초안 포트폴리오에 새 사진이 들어와 사진 쪽만 비었으면, 다시 계산하지 않고 앨범의 초안 값을 그 사진에 복사한다
           (검수한 포트폴리오의 새 사진은 2단계 상속 RPC 가 이미 복사한다)
  (없으면) 사람이 정하지 않은 모든 포트폴리오를 다시 계산한다 — 기준을 바꿨을 때만

검색어 분리기가 없으면(kiwipiepy 미설치 → 501) 실패로 끝낸다. 글 단서 없이 사진만으로 채우면 조용히 틀린다.

사용:
  python purpose_drafts.py --daily                 미리보기 (DB 에 쓰지 않는다)
  python purpose_drafts.py --daily --apply         초안 저장
"""

import argparse
import json
import os
import re
import sys
from collections import Counter
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import siglip  # noqa: E402
from backfill_client import BackfillClient  # noqa: E402
from purpose_backfill import api_request, fetch_pages, load_env, parse_embedding  # noqa: E402

EMBEDDING_PREFIX = f"{siglip.MODEL_ID.split('/')[-1]}@"

# 사진으로 고를 때 쓰는 문장. 키는 src/lib/purpose-details.json 과 같다 (draft-purpose-details.cjs 와 같은 문장).
PROMPTS = {
    "personal": {
        "snap": "a candid outdoor snapshot of a person on the street",
        "profile": "a studio profile portrait of a person",
        "body_profile": "a fitness body profile photo showing a toned muscular body",
        "id_photo": "a passport ID photo of a person on a plain background",
    },
    "couple": {
        "snap": "a couple walking together on a date",
        "anniversary": "a marriage proposal with flowers and a ring",
    },
    "friendship": {
        "snap": "a group of friends posing together",
        "siblings": "young siblings, brothers and sisters, posing together",
    },
    "wedding": {
        "ceremony": "a wedding ceremony in a wedding hall with guests",
        "shoot": "a bride and groom posing for a pre-wedding photoshoot",
        "remind": "a married couple celebrating their wedding anniversary",
    },
    "pet": {
        "dog": "a photo of a dog",
        "cat": "a photo of a cat",
        "other": "a photo of a small pet animal such as a rabbit or a bird",
    },
    "commercial": {
        "brand": "a brand advertising campaign photo",
        "lookbook": "a fashion lookbook model wearing clothes",
        "product": "a product photo on a clean background",
        "business_profile": "a business headshot of a person in a suit",
        "food_space": "food on a table or a restaurant interior",
    },
    "event": {
        "maternity": "a pregnant woman maternity photo",
        "baby": "a newborn baby",
        "first_birthday": "a baby's first birthday party with a traditional table",
        "family": "a family portrait with parents and children",
        "graduation": "a graduation photo with a gown and cap on campus",
        "group": "a large group photo of many people",
        "banquet": "a banquet or a birthday party celebration",
    },
}

# 개인 스냅 / 프로필 (2026-09-18 확정) — 프로필 문장은 뚜렷하게, 스냅 문장은 여럿 두고 가장 높은 점수를 쓴다
PROFILE_PROMPTS = [
    "a headshot portrait photo of a person, shoulders up, facing the camera",
    "a professional profile photo of a person looking straight at the camera",
    "an actor profile headshot with a simple background",
]
SNAP_PROMPTS = [
    "a candid snapshot of a person in a scenic place",
    "a full-body photo of a person walking outside",
    "a person enjoying a natural moment, not looking at the camera",
    "a lifestyle snapshot of a person in a cafe or on the street",
    "a person posing in a field of flowers or by the sea",
    "a moody film snapshot of a person in a room",
]
PROFILE_TEXT_SHARE = 0.5
PROFILE_IMAGE_SHARE = 0.9
PROFILE_REPEAT_SIMILARITY = 0.93

# siglip-text-search-core.ts 의 GENDER_BOUNDARY 와 같다. 남자까지 거리 − 여자까지 거리가 이보다 작으면 남자
GENDER_BOUNDARY = 0.005

SPLIT = re.compile(r"[\n.!?·,]+")


# ── 순수 규칙 (시험 대상) ────────────────────────────────────────────────

def text_pieces(text):
    """검색어 분리기는 120자까지 받는다 — 문장 단위로 나누고 100자씩 자른다."""
    for piece in (p.strip() for p in SPLIT.split(text or "")):
        for at in range(0, len(piece), 100):
            if piece[at:at + 100]:
                yield piece[at:at + 100]


def choose_personal(text_details, text, share, similarity, n):
    """개인 세부분류. 바디프로필 · 증명은 글 그대로, 프로필은 사진이 받쳐줄 때만."""
    kept = [d for d in text_details if d != "personal.profile"]
    if "personal.profile" in text_details:
        kept.append("personal.profile" if share >= PROFILE_TEXT_SHARE else "personal.snap")
        return kept, f"글 프로필 · 사진 {round(share * 100)}%"
    if kept:
        return kept, "글"
    if "스냅" in (text or ""):
        return ["personal.snap"], "글 스냅"
    obvious = n >= 2 and share >= PROFILE_IMAGE_SHARE and similarity >= PROFILE_REPEAT_SIMILARITY
    return ["personal.profile" if obvious else "personal.snap"], f"사진 {round(share * 100)}% · 반복 {similarity:.2f}"


def vote(vectors, prompt_vectors):
    """사진마다 가장 가까운 문장 → 다수결. 같은 표면 먼저 나온 문장(draft-purpose-details.cjs 와 같다)."""
    best = np.argmax(vectors @ prompt_vectors.T, axis=1)
    counts = Counter(int(i) for i in best)
    winner = max(counts, key=lambda i: (counts[i], -list(counts).index(i)))
    return winner, counts[winner]


def personal_stats(vectors, profile_vectors, snap_vectors):
    """프로필 쪽 사진 비율과, 사진끼리 얼마나 닮았나(구도 · 자세 반복)."""
    n = len(vectors)
    if not n:
        return 0.0, 0.0, 0
    margins = (vectors @ profile_vectors.T).max(axis=1) - (vectors @ snap_vectors.T).max(axis=1)
    share = float((margins > 0).mean())
    if n < 2:
        return share, 0.0, n
    sims = vectors @ vectors.T
    upper = sims[np.triu_indices(n, k=1)]
    return share, float(upper.mean()), n


def gender_of(vectors, female, male):
    """사진마다 여 / 남, 포트폴리오 다수결. 동수면 None."""
    margin = (1 - vectors @ male) - (1 - vectors @ female)
    f = int((margin >= GENDER_BOUNDARY).sum())
    m = len(vectors) - f
    return (None if f == m else "female" if f > m else "male"), f, m


def detail_targets(album, daily):
    """세부분류를 채울 포트폴리오인가. 사람이 정했으면 아니다. --daily 는 비어 있는 목적이 있을 때만."""
    purposes = album.get("admin_purposes") or []
    if not purposes or album.get("admin_purpose_details_source") == "manual":
        return False
    if not daily:
        return True
    details = album.get("admin_purpose_details") or []
    return any(not any(d.startswith(f"{p}.") for d in details) for p in purposes)


def gender_target(album, daily):
    if "personal" not in (album.get("admin_purposes") or []) or album.get("admin_purpose_gender_source") == "manual":
        return False
    return not daily or not album.get("admin_purpose_gender")


def photos_missing(album, photos, field):
    """앨범에는 초안(auto)이 있는데 사진 쪽이 빈 것 — 초안 뒤에 들어온 새 사진. 그 값을 그대로 복사하면 된다."""
    if not album.get(field) or album.get(f"{field}_source") != "auto":
        return False
    if field == "admin_purpose_gender":
        photos = [p for p in photos if "personal" in (p.get("admin_purposes") or [])]
    return any(not p.get(field) for p in photos)


# ── 배치 ────────────────────────────────────────────────────────────────

def fetch(request):
    albums = fetch_pages(
        request,
        "albums?select=id,title,description,admin_purposes,admin_purpose_details,admin_purpose_details_source,"
        "admin_purpose_gender,admin_purpose_gender_source&order=created_at.desc",
    )
    photos = fetch_pages(
        request,
        "photos?select=id,album_id,embedding,embedding_model,admin_purposes,admin_purpose_overridden,"
        "admin_purpose_details,admin_purpose_gender"
        "&album_id=not.is.null&embedding=not.is.null&visibility=neq.archived&admin_purpose_overridden=is.false",
    )
    by_album = {}
    for photo in photos:
        model = photo.get("embedding_model")
        if isinstance(model, str) and model.startswith(EMBEDDING_PREFIX):
            by_album.setdefault(str(photo["album_id"]), []).append(photo)
    return albums, by_album


def stack(photos):
    return np.stack([parse_embedding(p["embedding"]) for p in photos]).astype(np.float64)


def plan_details(albums, photos_by_album, client, daily):
    keys = {p: list(prompts) for p, prompts in PROMPTS.items()}
    prompt_vectors = {p: np.asarray(client.embed_texts([PROMPTS[p][k] for k in keys[p]])) for p in PROMPTS}
    profile_vectors = np.asarray(client.embed_texts(PROFILE_PROMPTS))
    snap_vectors = np.asarray(client.embed_texts(SNAP_PROMPTS))
    parsed = {}

    def from_text(text):
        found = set()
        for piece in text_pieces(text):
            if piece not in parsed:
                # 없으면 BackfillClient 가 RuntimeError 를 낸다(501) — 글 단서 없이 조용히 채우지 않는다
                parsed[piece] = client._request("/search-query", {"query": piece}).get("details") or []
            found.update(parsed[piece])
        return found

    plan = []
    for album in albums:
        photos = photos_by_album.get(str(album["id"]), [])
        if not photos:
            continue
        if daily and not detail_targets(album, daily) and photos_missing(album, photos, "admin_purpose_details"):
            plan.append({"id": album["id"], "title": album.get("title"), "details": album["admin_purpose_details"],
                         "why": ["새 사진에 앨범 초안 복사"]})
            continue
        if not detail_targets(album, daily):
            continue
        text = f"{(album.get('title') or '').strip() or '제목 없음'}\n{album.get('description') or ''}"
        found = from_text(text)
        vectors = stack(photos)
        details, why = [], []
        for purpose in album["admin_purposes"]:
            own = sorted(d for d in found if d.startswith(f"{purpose}."))
            if purpose == "personal":
                chosen, reason = choose_personal(own, text, *personal_stats(vectors, profile_vectors, snap_vectors))
                details += chosen
                why.append(f"personal: {reason}")
            elif own:
                details += own
                why.append(f"{purpose}: 글")
            elif purpose in prompt_vectors:
                winner, count = vote(vectors, prompt_vectors[purpose])
                details.append(f"{purpose}.{keys[purpose][winner]}")
                why.append(f"{purpose}: 사진 {count}/{len(photos)}")
        if details:
            plan.append({"id": album["id"], "title": album.get("title"), "details": list(dict.fromkeys(details)), "why": why})
    return plan


def plan_gender(albums, photos_by_album, client, daily):
    female, male = (np.asarray(v) for v in client.embed_texts(["여자", "남자"]))
    plan, ties = [], 0
    for album in albums:
        own = photos_by_album.get(str(album["id"]), [])
        if daily and not gender_target(album, daily) and photos_missing(album, own, "admin_purpose_gender"):
            plan.append({"id": album["id"], "title": album.get("title"), "gender": album["admin_purpose_gender"],
                         "f": 0, "m": 0, "copy": True})
            continue
        if not gender_target(album, daily):
            continue
        photos = [p for p in own if "personal" in (p.get("admin_purposes") or [])]
        if not photos:
            continue
        gender, f, m = gender_of(stack(photos), female, male)
        if gender is None:
            ties += 1
            continue
        plan.append({"id": album["id"], "title": album.get("title"), "gender": gender, "f": f, "m": m})
    return plan, ties


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="초안 RPC 로 DB 에 저장")
    parser.add_argument("--daily", action="store_true", help="비어 있는 세부분류 · 성별만 채운다")
    parser.add_argument("--embed-url", default="http://127.0.0.1:8077", help="상주 서버 주소")
    args = parser.parse_args()

    env = load_env()
    request = lambda method, path, body=None, extra=None: api_request(env, method, path, body, extra)  # noqa: E731
    token = os.environ.get("PERSONA_SERVICE_TOKEN") or env.get("PERSONA_SERVICE_TOKEN", "")
    if not token.strip():
        raise RuntimeError("세부분류 · 성별 초안에 PERSONA_SERVICE_TOKEN 이 필요합니다")
    client = BackfillClient(args.embed_url, token, 256)
    client.check_health()

    albums, photos_by_album = fetch(request)
    details = plan_details(albums, photos_by_album, client, args.daily)
    genders, ties = plan_gender(albums, photos_by_album, client, args.daily)

    tally = Counter(d for item in details for d in item["details"])
    print(f"모드 {'APPLY' if args.apply else 'DRY-RUN'}{' DAILY' if args.daily else ''}")
    print(f"세부분류 초안 {len(details)}개 · " + (", ".join(f"{k} {v}" for k, v in tally.most_common()) or "없음"))
    for item in details:
        print(f"  {', '.join(item['details'])}  ← {(item['title'] or '제목 없음')[:30]}  ({'; '.join(item['why'])})")
    print(f"성별 초안 {len(genders)}개 · 여성 {sum(g['gender'] == 'female' for g in genders)} · "
          f"남성 {sum(g['gender'] == 'male' for g in genders)} · 동수라 두지 않음 {ties}")
    copies = sum(1 for g in genders if g.get("copy"))
    if copies:
        print(f"  그중 새 사진에 앨범 성별 초안 복사 {copies}개")
    for item in genders:
        if item.get("copy"):
            continue
        if item["gender"] == "male" or min(item["f"], item["m"]) / (item["f"] + item["m"]) >= 0.2:
            print(f"  검수 때 먼저 볼 것: {item['gender']} 여{item['f']}·남{item['m']}  {(item['title'] or '제목 없음')[:30]}")

    if not args.apply:
        print("DB 쓰기 없음. 저장하려면 --apply")
        return 0
    failed = saved_photos = 0
    for item in details:
        try:
            saved_photos += request("POST", "rpc/apply_album_details_draft",
                                    {"p_album_id": item["id"], "p_details": item["details"]}) or 0
        except Exception as e:  # 한 포트폴리오가 실패해도 나머지는 채운다 — 종료 코드로 알린다
            failed += 1
            print(f"  ❌ 세부분류 {item['id']}: {e}")
    for item in genders:
        try:
            saved_photos += request("POST", "rpc/apply_album_gender_draft",
                                    {"p_album_id": item["id"], "p_gender": item["gender"]}) or 0
        except Exception as e:
            failed += 1
            print(f"  ❌ 성별 {item['id']}: {e}")
    print(f"저장: 세부분류 {len(details)}개 · 성별 {len(genders)}개 포트폴리오 · 사진 {saved_photos}장(auto) · 실패 {failed}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
