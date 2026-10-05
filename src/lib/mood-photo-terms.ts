// 사진 무드 표현(docs/40 §17-5, 2026-09-23)의 순수 로직 — 사진에 실제로 쓸 말만 모은 뼈대.
// 에이전트가 사진용으로 모은 표현(mood-additions.json: 사진 표현 목록 · 검증 후보)과 작가가 사진 · 프로필에 직접 단 태그를 합친다.
// 사전 4.7만 낱말을 거르는 대신 이 뼈대가 고른 사전 말만 묶음에 들어온다.
import type { Addition } from "@/lib/mood-additions";
import type { AuthorTag } from "@/lib/mood-author-tags";

export type PhotoTermFrom = "generated" | "shortlisted" | "author";
export const FROM_LABEL: Record<PhotoTermFrom, string> = { generated: "사진 표현", shortlisted: "검증 후보", author: "작가 태그" };

/** 뺀 이유(사람 결정, 2026-09-23). 무드가 아니라 다른 분류의 몫이거나 장소 이름 · 촬영 형식 · 시험 입력이다 — 지우지 않고 표시만 한다. "사람" 은 화면에서 직접 뺀 것 */
export type PhotoTermDrop = "목적" | "관계" | "장소" | "형식" | "시험" | "사람";
export const DROP_REASONS: readonly PhotoTermDrop[] = ["목적", "관계", "장소", "형식", "시험", "사람"];

/**
 * 화면에서 사람이 살리거나(keep) 뺀(drop) 기록 — mood-edits/photo-term-edits.jsonl 에 한 줄씩, 마지막 줄이 이긴다.
 * keep 에 to 가 있으면 그 이름으로 살린다(럽스타 감성 → 럽스타: 목적 냄새가 나는 "X 감성" 은 감성을 떼면 양식 말이 된다). 원래 표기는 alt 로 남는다.
 */
export type PhotoTermEdit = { label: string; action: "keep" | "drop"; to?: string; at: string };

/**
 * 묶음 안 "같은 낱말의 다른 표기" 흡수(사람 결정, 2026-09-23) — mood-edits/photo-term-merges.jsonl, find_photo_term_merges.py 가 쓴다.
 * 노을 지는 · 노을빛 → 노을, 해 질 녘 → 해질녘. to(대표)는 가장 많이 쓰이고 무드에 가까운 말. 원래 표기는 alt 로 남는다.
 * 사람 기록보다 약하다 — from 을 사람이 그 이름으로 살렸으면(keep, to 없음) 흡수하지 않는다.
 */
export type PhotoTermMerge = { from: string; to: string; how: string; at: string };

export type PhotoTerm = {
  label: string;
  axes: string[];
  /** 구절 · 신조어 · 외래어 · 기타, 작가 태그만이면 "작가 태그" */
  kind: string;
  usage: string;
  from: PhotoTermFrom[];
  /** 스냅을 떼기 전 원래 표기(야구장스냅 → 야구장) */
  alt?: string[];
  photos: number;
  photographers: number;
  profiles: number;
  /** 1차 전처리 무드에 들어 있나 */
  inScreen: boolean;
  drop?: PhotoTermDrop;
  /** 규칙으로는 빠졌는데 사람이 살렸다 */
  kept?: boolean;
};

export const normLabel = (label: string) => label.normalize("NFKC").trim().replace(/\s+/gu, " ");

/**
 * "스냅" 은 촬영 형식이라 뗀다(사람 결정, §17-3) — 감성스냅 → 감성, 야구장 스냅 → 야구장. 스냅 · 스냅사진 · 스냅촬영만인 말은 버린다("").
 */
export function stripSnap(label: string) {
  const m = /^(.*?)\s*(?:스냅|snap)(?:\s*(?:사진|촬영))?$/iu.exec(normLabel(label));
  return m ? normLabel(m[1]) : normLabel(label);
}

/**
 * 꼬리의 "감성 · 갬성" 도 뗀다(사람 결정, 2026-09-23) — 가을 감성 → 가을, 필름 갬성 → 필름, 카페 감성 → 카페. 사진 표현의 "X 감성" 은 X 의 무드라는 뜻일 뿐이라
 * X 와 같은 말이다. 앞말이 두 글자 미만이면(힙감성) 그대로 두고, 감성 · 갬성만인 말도 그대로 둔다. 원래 표기는 alt 로 남는다.
 */
export function baseLabel(label: string) {
  const s = stripSnap(label);
  const m = /^(.{2,}?)\s*(?:감성|갬성)$/u.exec(s);
  return m ? normLabel(m[1]) : s;
}

/**
 * 목적이 분명한 말 — 커플 · 우정 · 가족 · 웨딩 · 프로필 · 반려동물 · 행사처럼 촬영 목적을 이름으로 부르는 말과, 시점 · 두 사람 사이를 그리는 말
 * (남친 시점 · 둘만의 · 서로 · 눈맞춤 · 손깍지 · 백허그 · 썸 · 첫사랑). "커플 감성" · "가족 케미" · "우정샷" · "손깍지" 는 여기.
 */
const PURPOSE_WORDS = [
  "커플", "연인", "연애", "데이트", "럽스타", "남친", "여친", "남편", "아내", "부부", "신혼", "잉꼬", "프러포즈", "프로포즈", "기념일", "염장",
  "웨딩", "본식", "신부", "신랑", "결혼", "하객", "리마인드", "브라이덜", "가족", "남매", "자매", "형제", "모녀", "부녀", "엄마", "아빠", "딸", "아들",
  "우정", "친구", "찐친", "절친", "베프", "bff", "프렌드", "소울메이트", "짝꿍", "브로맨스", "워맨스",
  "프로필", "증명", "여권", "만삭", "임신", "임산부", "아기", "베이비", "돌잔치", "반려", "강아지", "고양이", "졸업", "생일", "행사", "브랜드", "상업", "제품", "룩북",
  // 두 사람 사이 — 관계 축 무드지만 사진 무드 표현에서는 뺀다(썸머는 여름이라 "썸타" 로 잡는다)
  "둘만의", "우리만의", "서로", "눈맞춤", "아이컨택", "손깍지", "백허그", "스킨십", "썸타", "첫사랑", "짝사랑", "밀당",
];
/** 글자만 겹치는 것 — 베이비핑크는 색, 아빠 미소 · 엄마 미소는 누구나 짓는 흐뭇한 웃음, 연애 세포는 설렘이다 */
const PURPOSE_EXCEPT = ["베이비핑크", "아빠미소", "엄마미소", "연애세포"];

const flatten = (label: string) => normLabel(label).replace(/ /g, "").toLowerCase();

export function isPurposeTerm(label: string) {
  const stripped = PURPOSE_EXCEPT.reduce((s, x) => s.replaceAll(x, ""), flatten(label));
  return PURPOSE_WORDS.some((w) => stripped.includes(w));
}

/** 관계 축만 있는 말도 뺀다(케미 · 알콩달콩 · 다정한 시선). 관계에 다른 축이 같이 있으면(러블리 · 달달한 · 로맨틱한 분위기) 무드로 남긴다 */
const RELATION_ONLY_KEEP = ["거리감 있는", "리얼한", "비하인드 컷 느낌", "진솔한", "캔디드 컷"];    // 축이 관계로 잘못 붙은 촬영 말
export function isRelationOnly(label: string, axes: readonly string[]) {
  return axes.length === 1 && axes[0] === "관계" && !RELATION_ONLY_KEEP.includes(normLabel(label));
}

/**
 * 장소 이름(사람 결정, 2026-09-23) — 나라 · 도시 · 동네 · 명소 같은 고유 지명은 뺀다(성수 감성 · 제주 감성 · 한강 · 교토 감성).
 * 지하철 · 영화관 · 카페 · 루프탑처럼 장소의 종류를 부르는 말은 무드(공간 축)라 남긴다. 홍콩 영화 감성 · 일본 영화 색감 · 유럽풍 · 프렌치 시크는 양식이라 남긴다.
 */
const PLACE_WORDS = [
  // 서울 · 국내
  "서울", "성수", "연남", "을지로", "익선동", "한강", "홍대", "이태원", "한남", "청담", "삼청동", "북촌", "서촌", "망원", "송리단", "경리단", "가로수길", "남산", "경복궁", "덕수궁", "창덕궁",
  "잠실", "여의도", "뚝섬", "용산", "해방촌", "백빈건널목", "정독도서관", "동작대교", "창경궁", "수원", "용인", "부산", "해운대", "광안리", "강릉", "속초", "양양", "여수", "경주", "전주",
  "가평", "남이섬", "인천", "제주", "우도", "협재", "애월", "함덕",
  // 해외
  "교토", "도쿄", "오사카", "후쿠오카", "오키나와", "일본", "홍콩", "대만", "타이베이", "상하이", "방콕", "치앙마이", "다낭", "나트랑", "발리", "세부", "괌", "사이판", "하와이", "동남아",
  "뉴욕", "파리", "런던", "로마", "프라하", "스위스", "산토리니", "유럽", "북유럽", "미국", "해외",
];
/** 지명이 들어 있어도 양식을 부르는 말 */
const PLACE_KEEP_IF = ["영화", "색감", "풍", "시크", "무비"];

export function isPlaceTerm(label: string) {
  const flat = flatten(label);
  return PLACE_WORDS.some((w) => flat.includes(w)) && !PLACE_KEEP_IF.some((k) => flat.includes(k));
}

/** 작가 태그에 섞인 시험 입력(§17-3 tag-drops 와 같다)과 촬영 형식 말 — 지하철 · 영화관 · 놀이공원 같은 장소 종류는 §17-3 과 달리 남긴다(사람 결정) */
const TEST_INPUTS = ["qwer", "qwer12", "공웡", "보스", "마피아"];
const FORMAT_WORDS = ["상반신", "호리존", "인물", "컨셉", "컨셉촬영"];

export function dropReason(label: string, axes: readonly string[]): PhotoTermDrop | undefined {
  const flat = flatten(label);
  if (TEST_INPUTS.includes(flat)) return "시험";
  if (FORMAT_WORDS.includes(flat)) return "형식";
  if (isPurposeTerm(label)) return "목적";
  if (isPlaceTerm(label)) return "장소";
  if (isRelationOnly(label, axes)) return "관계";
  return undefined;
}

/** 축 없는 말에 사람이 붙인 축 — mood-edits/photo-term-axes.jsonl {label, axes} */
export type PhotoTermAxes = { label: string; axes: string[] };

/**
 * 같은 표현(NFKC · 공백 정리 · 스냅 · 감성 뗀 뒤)은 하나로 합친다. 작가 태그에만 있는 말은 1차 전처리에 있으면 그 축을 물려받고, 없으면 축 없음 —
 * 그중 사람이 축을 붙인 것(axisFixes)은 그 축. 같은 낱말의 다른 표기(merges)는 대표에 흡수된다 — 뺀 말은 흡수하지 않고, 대표가 뺀 말이면 그 표시는 그대로.
 * 사람이 살리거나 뺀 기록(edits)은 규칙 · 흡수보다 세다 — 살리면 뺀 이유가 지워지고 kept 표시, 빼면 이유가 "사람".
 * 사진 많은 순, 같으면 이름순.
 */
export function mergePhotoTerms(entries: readonly Addition[], tags: readonly AuthorTag[], screenAxes: ReadonlyMap<string, string[]>,
  edits: readonly PhotoTermEdit[] = [], axisFixes: readonly PhotoTermAxes[] = [], merges: readonly PhotoTermMerge[] = []) {
  const out = new Map<string, PhotoTerm>();
  const fresh = (key: string, kind: string, usage: string, axes: string[]): PhotoTerm =>
    ({ label: key, axes, kind, usage, from: [], photos: 0, photographers: 0, profiles: 0, inScreen: screenAxes.has(key) });
  const noteAlt = (row: PhotoTerm, raw: string) => {
    const orig = normLabel(raw);
    if (orig !== row.label && !(row.alt ?? []).includes(orig)) row.alt = [...(row.alt ?? []), orig];
  };
  /** key 줄을 target 에 합친다 — 축 · 출처 · 사진 수를 모으고 원래 표기는 alt 로. 뺀 표시 · 살린 표시는 건드리지 않는다 */
  const absorb = (key: string, row: PhotoTerm, target: PhotoTerm) => {
    out.delete(key);
    for (const a of row.axes) if (!target.axes.includes(a)) target.axes.push(a);
    for (const s of row.from) if (!target.from.includes(s)) target.from.push(s);
    if (!target.usage) target.usage = row.usage;
    target.photos += row.photos;
    target.photographers = Math.max(target.photographers, row.photographers);
    target.profiles += row.profiles;
    for (const a of [key, ...(row.alt ?? [])]) noteAlt(target, a);
  };
  for (const e of entries) {
    const key = baseLabel(e.label);
    if (!key) continue;
    const row = out.get(key) ?? fresh(key, e.kind, e.usage, []);
    for (const a of e.axes) if (!row.axes.includes(a)) row.axes.push(a);
    for (const s of e.sources) if (s !== "photo-tags" && !row.from.includes(s)) row.from.push(s);
    if (!row.usage) row.usage = e.usage;
    noteAlt(row, e.label);
    out.set(key, row);
  }
  for (const t of tags) {
    const key = baseLabel(t.label);
    if (!key) continue;
    const row = out.get(key) ?? fresh(key, "작가 태그", "", [...(screenAxes.get(key) ?? [])]);
    if (!row.from.includes("author")) row.from.push("author");
    row.photos += t.photos;                           // 야구장스냅 · 야구장 처럼 스냅을 떼면 같은 말이 되는 태그는 사진 수를 합친다
    row.photographers = Math.max(row.photographers, t.photographers);
    row.profiles += t.profiles;
    noteAlt(row, t.label);
    out.set(key, row);
  }
  for (const fix of axisFixes) {
    const row = out.get(baseLabel(fix.label));
    if (row && !row.axes.length) row.axes = [...fix.axes];
  }
  for (const row of out.values()) {
    const drop = dropReason(row.label, row.axes);
    if (drop) row.drop = drop;
  }
  const manual = new Map<string, PhotoTermEdit>();
  for (const e of edits) manual.set(baseLabel(e.label), e);                // 마지막 줄이 이긴다. 기록이 "교토 감성" 이라도 지금 이름 "교토" 에 맞춘다
  for (const m of merges) {                                                // 같은 낱말의 다른 표기 → 대표. 사람이 그 이름으로 살린 말은 그대로 둔다
    const key = baseLabel(m.from), to = baseLabel(m.to);
    const row = out.get(key), target = out.get(to);
    const keptAsIs = manual.get(key)?.action === "keep" && !baseLabel(manual.get(key)?.to ?? "");
    if (!row || !target || key === to || row.drop || keptAsIs) continue;
    absorb(key, row, target);
  }
  for (const [key, e] of manual) {
    const row = out.get(key);
    if (!row) continue;
    if (e.action === "drop") {
      row.drop = "사람";
      continue;
    }
    const to = baseLabel(e.to ?? "");
    if (!to || to === key) {                                             // 그 이름 그대로 살린다
      if (row.drop) {
        delete row.drop;
        row.kept = true;
      }
      continue;
    }
    const target = out.get(to) ?? fresh(to, row.kind, row.usage, [...row.axes]);   // 다른 이름으로 살린다 — 이미 있는 말이면 거기에 합친다
    absorb(key, row, target);
    delete target.drop;
    target.kept = true;
    out.set(to, target);
  }
  return [...out.values()].sort((a, b) => b.photos - a.photos || a.label.localeCompare(b.label, "ko"));
}

/** 축마다 검색어(뺀 말 제외)가 몇 개인가. 한 말이 여러 축에 들면 축마다 한 번씩 센다. 축 없는 말은 noAxis 로 */
export function photoAxisTally(rows: readonly PhotoTerm[], axes: readonly string[]) {
  const tally = new Map<string, number>(axes.map((a) => [a, 0]));
  let noAxis = 0;
  for (const r of rows) {
    if (r.drop) continue;
    if (!r.axes.length) noAxis += 1;
    for (const a of r.axes) tally.set(a, (tally.get(a) ?? 0) + 1);
  }
  return { tally, noAxis };
}

/** 검색은 표현 · 원래 표기 · 용례, 축은 하나 골라 좁히거나 "축 없음" 만, 출처는 하나 골라 좁힌다. 뺀 말은 기본으로 안 보이고, dropped 를 켜면 그것만 본다 */
export function selectPhotoTerms(rows: readonly PhotoTerm[], { q, axis, from, noAxis, dropped = false }: { q: string; axis: string; from: string; noAxis: string; dropped?: boolean }) {
  const needle = q.trim();
  return rows.filter((r) =>
    !!r.drop === dropped
    && (!from || r.from.includes(from as PhotoTermFrom))
    && (!axis || (axis === noAxis ? r.axes.length === 0 : r.axes.includes(axis)))
    && (!needle || r.label.includes(needle) || r.usage.includes(needle) || (r.alt ?? []).some((a) => a.includes(needle))));
}
