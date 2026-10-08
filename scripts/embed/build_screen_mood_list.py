"""1차 전처리에서 무드로 판정된 낱말 목록 — 어드민 무드 화면 "전체 무드 보기" 가 읽는다 (docs/40 §17-3, 2026-09-23).

옛 판정(screening-screen-priority.json + 새 기준으로 뒤집은 mood-edits/rejudge-value.jsonl)과
새 판정(mood-edits/screen-judged.jsonl)에서 무드인 것만 모은다. 축은 검색어 번들(mood-terms-bundle.json)의
묶음에 들어 있으면 그 축, 아니면 비어 있다(새로 들어온 낱말 — 축 배정은 다음 단계).

끝으로 검증 후보(140) · 사전 밖 추가 후보(mood-additions.json) · 기존 사진 태그(DB 는 읽기만) 중 아직 없는 것을
how=added 로 더한다(사람 결정, 2026-09-23). 띄어쓰기만 다른 표기(파스텔톤 → 파스텔 톤)는 새로 더하지 않고 alt 로 붙인다 —
검색은 alt 로도 된다. 향 축을 더하며(2026-09-22) 판정에서 빠졌던 냄새 · 향 말도 되살려 더한다(mood-edits/scent-added.jsonl).
사전 뜻풀이가 사진 쪽 쓰임을 가려 무드 아님으로 판정된 것(그레인 "가죽 표면", 내추럴 "악보 기호")이
여기서 되살아난다.

out/ 은 Git 제외라 화면이 다른 PC 에서 비지 않게 커밋되는 파일로 쓴다: mood-screen-list.json
  {words: [{w, axes, how: old|flipped|new|added, sure, why, alt?, src?}], counts}

  --no-db   사진 태그를 읽지 않는다(DB 에 닿지 않는 곳에서)
"""
import json
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

EMBED = Path(__file__).resolve().parent
OUT = EMBED / "out" / "mood-vocabulary"
LIST = EMBED / "mood-screen-list.json"
# 촬영 형식 "스냅" 과, 그 앞에 붙은 목적 말 "커플"(야구장커플스냅 → 야구장)
SNAP = re.compile(r"\s*(커플)?\s*스냅$")
ADDED_SOURCE = {"shortlisted": "검증 후보", "generated": "사진 표현 목록", "photo-tags": "기존 사진 태그",
                "explore": "탐색 카테고리", "scent": "냄새 · 향 되살림"}
SCENT_ADDED = EMBED / "mood-edits" / "scent-added.jsonl"   # 냄새 말이 판정에서 빠졌었다 — 향 축과 함께 되살린 것
EXPLORE = EMBED / "mood-edits" / "explore-categories.json"   # 홈 "무드로 보기" 탐색 카테고리를 DB 에서 복사해 둔 것
# 탐색 카테고리 중 목적 · 장소라 무드가 아닌 것(사람 결정, 2026-09-23)
EXPLORE_NOT_MOOD = {"야외 웨딩 스냅", "캐주얼 웨딩", "스튜디오 웨딩", "스튜디오"}
# 기존 사진 태그 중 누가 봐도 무드가 아닌 것 — 목적 · 장소 이름 · 촬영 형식 · 시험 입력(사람 결정, 2026-09-23)
TAG_DROPS = EMBED / "mood-edits" / "tag-drops.jsonl"


def norm(label):
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", label or "").strip())


def photo_tags():
    """사진 태그(작가 태그 + 자동 태그, 보관만 빼고 비공개까지)와 작가 프로필 태그 — 읽기만 한다.
    어드민 "작가가 쓴 무드 단어" 탭과 같은 범위라, 그 탭의 단어가 모두 1차 전처리에 들어간다."""
    from purpose_backfill import api_request, fetch_pages, load_env
    env = load_env()
    request = lambda m, p, b=None, e=None: api_request(env, m, p, b, e)  # noqa: E731
    tags = {}
    for row in fetch_pages(request, "photos?select=mood_tags,auto_mood_tags&visibility=neq.archived"):
        for tag in {norm(t) for t in (row.get("mood_tags") or []) + (row.get("auto_mood_tags") or [])}:
            if tag:
                tags[tag] = tags.get(tag, 0) + 1
    for row in fetch_pages(request, "photographers?select=mood_tags"):
        for tag in {norm(t) for t in (row.get("mood_tags") or [])}:
            if tag:
                tags.setdefault(tag, 0)
    return tags


def explore_categories(use_db):
    """홈 "무드로 보기" 의 탐색 카테고리 제목. DB 에서 읽어 파일로 복사해 두고, --no-db 면 그 파일을 쓴다."""
    if use_db:
        from purpose_backfill import api_request, fetch_pages, load_env
        env = load_env()
        rows = fetch_pages(lambda m, p, b=None, e=None: api_request(env, m, p, b, e),
                           "explore_categories?select=slug,title,kind,published&order=sort")
        EXPLORE.write_text(json.dumps({"copied_at": __import__("datetime").date.today().isoformat(), "rows": rows},
                                      ensure_ascii=False, indent=1), encoding="utf-8")
    return json.loads(EXPLORE.read_text(encoding="utf-8"))["rows"] if EXPLORE.exists() else []


def main():
    pool = [json.loads(l) for l in (OUT / "screen-pool.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
    old = {r["label"]: r for r in json.loads((OUT / "screening-screen-priority.json").read_text(encoding="utf-8"))["rows"]}
    flipped = {}
    for line in (EMBED / "mood-edits" / "rejudge-value.jsonl").read_text(encoding="utf-8").splitlines():
        if line.strip():
            o = json.loads(line)
            flipped[o["word"]] = o
    judged = [json.loads(l) for l in (EMBED / "mood-edits" / "screen-judged.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
    lemmas = {}                         # 관형형 → 사전형(따뜻한 → 따뜻하다). 판정 · 근거는 사전형에 붙어 있다
    for line in (OUT / "master-words.jsonl").read_text(encoding="utf-8").splitlines():
        if line.strip():
            m = json.loads(line)
            if m.get("lemmas"):
                lemmas[m["word"]] = m["lemmas"]

    axes_of = {}
    for row in json.loads((EMBED / "mood-terms-bundle.json").read_text(encoding="utf-8"))["rows"]:
        if row["axes"]:
            for w in [row["head"], *row["terms"], *row["aliases"]]:
                axes_of.setdefault(w, row["axes"])

    words, seen = [], set()
    for p in pool:                      # 옛 판정 — 관형형(따뜻한)은 사전형 판정을 물려받아 풀에 들어 있다
        if p.get("judged") != "mood" or p["word"] in seen:
            continue
        w = p["word"]
        source = next((x for x in [w, *lemmas.get(w, [])] if x in flipped or x in old), w)
        if source in flipped:
            f = flipped[source]
            words.append({"w": w, "axes": axes_of.get(w, []), "how": "flipped", "sure": bool(f.get("sure", True)),
                          "why": f.get("why", "")})
        else:
            words.append({"w": w, "axes": axes_of.get(w, []), "how": "old", "sure": True,
                          "why": old.get(source, {}).get("reason", "")})
        seen.add(w)
    for j in judged:                    # 새 판정
        if j["v"] != "Y" or j["word"] in seen:
            continue
        words.append({"w": j["word"], "axes": axes_of.get(j["word"], []), "how": "new", "sure": j["sure"],
                      "why": j.get("fixed") or j.get("why", "")})
        seen.add(j["word"])

    # 띄어쓰기만 다른 표기 — 기준 표기(same_as)에 붙인다
    by_word = {x["w"]: x for x in words}
    alt_of = {}
    for line in (OUT / "master-words.jsonl").read_text(encoding="utf-8").splitlines():
        if line.strip():
            m = json.loads(line)
            if m.get("same_as") in by_word and m["word"].replace(" ", "") == m["same_as"].replace(" ", ""):
                by_word[m["same_as"]].setdefault("alt", []).append(m["word"])
                alt_of[m["word"]] = m["same_as"]
    present = {norm(w) for w in by_word} | {norm(w) for w in alt_of}

    # 검증 후보 · 사전 밖 추가 후보 · 기존 사진 태그 중 아직 없는 것 (사람 결정: 전부 넣는다)
    extra = {}
    collection = json.loads((OUT / "collection.json").read_text(encoding="utf-8"))
    for c in collection["candidates"]:
        if c.get("selection_status") == "shortlisted":
            extra.setdefault(norm(c["label"]), {"src": set(), "why": c.get("english_prompt", "")})["src"].add("shortlisted")
    for a in json.loads((EMBED / "mood-additions.json").read_text(encoding="utf-8"))["entries"]:
        e = extra.setdefault(norm(a["label"]), {"src": set(), "why": a.get("usage", ""), "axes": a.get("axes", [])})
        e["src"].update(s for s in a.get("sources", []) if s in ADDED_SOURCE)
        e["why"] = e["why"] or a.get("usage", "")
        e.setdefault("axes", a.get("axes", []))
    use_db = "--no-db" not in sys.argv
    if use_db:
        drops = {norm(json.loads(l)["word"]) for l in TAG_DROPS.read_text(encoding="utf-8").splitlines() if l.strip()}
        for tag, n in photo_tags().items():
            if tag in drops:
                continue
            # "~스냅" 은 촬영 형식이 붙은 것이다 — 스냅을 떼고 앞말로 넣는다(감성스냅 → 감성, 야구장스냅 → 야구장).
            # 원래 태그는 다른 표기로 붙여 그 말로도 찾게 한다(사람 결정, 2026-09-23)
            base = SNAP.sub("", tag)
            label = base if base and base != tag else tag
            e = extra.setdefault(label, {"src": set(), "why": f"사진 {n}장에 달린 태그" if n else "작가 프로필 태그"})
            e["src"].add("photo-tags")
            if label != tag:
                e.setdefault("alts", set()).add(tag)
    for row in explore_categories(use_db):
        # 제목의 붙임표는 두 무드를 잇는 표시다(시크-모던) — 한 구절로 넣는다
        title = norm((row.get("title") or "").replace("-", " "))
        if title and title not in {norm(t) for t in EXPLORE_NOT_MOOD}:
            e = extra.setdefault(title, {"src": set(), "why": f"홈 무드로 보기 · {row.get('slug')}"})
            e["src"].add("explore")
    if SCENT_ADDED.exists():
        for line in SCENT_ADDED.read_text(encoding="utf-8").splitlines():
            if line.strip():
                s = json.loads(line)
                e = extra.setdefault(norm(s["word"]), {"src": set(), "why": s["why"], "axes": s["axes"]})
                e["src"].add("scent")
                e["sure"] = s["sure"]
    by_norm = {norm(x["w"]): x for x in words}
    for w, target in alt_of.items():
        by_norm.setdefault(norm(w), by_word[target])
    for label, e in extra.items():
        if label in by_norm and e.get("alts"):     # 앞말이 이미 있다 — 원래 태그를 다른 표기로 붙인다
            twin = by_norm[label]
            twin["alt"] = sorted(set(twin.get("alt", [])) | e["alts"])
        if not label or label in present:
            continue
        compact = label.replace(" ", "")
        twin = next((by_word[w] for w in (compact,) if w in by_word), None)
        if twin is not None:            # 띄어 쓴 것만 다른 표기
            twin.setdefault("alt", []).append(label)
            continue
        word = {"w": label, "axes": e.get("axes") or [], "how": "added",
                "sure": bool({"shortlisted", "explore"} & e["src"]) or e.get("sure", False), "why": e["why"],
                "src": [ADDED_SOURCE[s] for s in ("shortlisted", "generated", "photo-tags", "explore", "scent") if s in e["src"]]}
        if e.get("alts"):
            word["alt"] = sorted(e["alts"])
        words.append(word)
        by_norm[label] = word
        present.add(label)

    # 판정에서 들어온 "~스냅" 도 같은 원칙 — 스냅은 촬영 형식이다. "스냅" 자체는 빼고, "선셋 스냅" 은 앞말에 붙인다
    final, by_w = [], {x["w"]: x for x in words}
    for x in words:
        base = SNAP.sub("", x["w"])
        if base == x["w"]:
            final.append(x)
        elif not base:
            continue
        elif base in by_w:
            by_w[base]["alt"] = sorted(set(by_w[base].get("alt", [])) | {x["w"], *x.get("alt", [])})
        else:
            final.append({**x, "w": base, "alt": sorted({x["w"], *x.get("alt", [])})})
    words = final

    # 축 — merge_axis_judgments.py 가 낱말마다 정한 것(사람이 정한 묶음 축 · 물려받음 · Claude 판정). 판정이 애매했으면 표시
    axis_file = EMBED / "mood-edits" / "axis-judged.jsonl"
    if axis_file.exists():
        judged_axes = {}
        for line in axis_file.read_text(encoding="utf-8").splitlines():
            if line.strip():
                j = json.loads(line)
                judged_axes[j["word"]] = j
        for x in words:
            j = judged_axes.get(x["w"])
            if j:
                x["axes"] = j["axes"]
                if not j["sure"]:
                    x["axis_unsure"] = True

    words.sort(key=lambda x: x["w"])
    counts = {"all": len(words), **Counter(x["how"] for x in words),
              "unsure": sum(not x["sure"] for x in words), "no_axis": sum(not x["axes"] for x in words),
              "axis_unsure": sum(bool(x.get("axis_unsure")) for x in words)}
    LIST.write_text(json.dumps({"words": words, "counts": counts}, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(counts, ensure_ascii=False))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
