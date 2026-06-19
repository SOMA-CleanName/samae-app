import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// 분석 대시보드 공용 데이터 로더 — 탭(라우트)마다 재사용.
// 이벤트 조회 → 작가·관리자 제외 → 세션 묶기 → 사진/작가 이름·썸네일 맵 → 경로 이름 해석기.

export const fmt = new Intl.NumberFormat("ko-KR");
export const FETCH_CAP = 20000;

export const RANGES = [
  { key: "1", label: "오늘", days: 1 },
  { key: "7", label: "최근 7일", days: 7 },
  { key: "30", label: "최근 30일", days: 30 },
];

export type Ev = {
  session_id: string;
  profile_id: string | null;
  type: "pageview" | "click" | "scroll";
  path: string;
  label: string | null;
  target: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  created_at: string;
};

export type Session = {
  id: string;
  profileId: string | null;
  events: Ev[];
  pageviews: number;
  firstTs: number;
  lastTs: number;
  lastPath: string | null;
  converted: boolean;
};

type Segment = { key: string; label: string; desc: string; match: (s: Session) => boolean };

// 기본 구분 — 계정/행동 기준. 페르소나와 독립적이며 교집합(AND)으로 적용됩니다.
export const SEGMENTS: Segment[] = [
  { key: "all", label: "전체", desc: "모든 방문자", match: () => true },
  { key: "guest", label: "비로그인", desc: "로그인 안 한 손님", match: (s) => !s.profileId },
  { key: "member", label: "로그인 회원", desc: "로그인한 회원", match: (s) => !!s.profileId },
  { key: "converted", label: "문의 전환", desc: "예약·문의까지 한 사람", match: (s) => s.converted },
];

// ⭐ 페르소나 — 추후 확정 시 여기에 카테고리만 추가하면 됩니다(예: 웨딩/프로필/가족 …).
// 기본 구분과 서로 영향 없이 독립적으로 교집합 적용됩니다. (지금은 '전체'만)
export const PERSONAS: Segment[] = [
  { key: "all", label: "전체", desc: "페르소나 구분 없음", match: () => true },
];

export const TABS = [
  { key: "overview", label: "개요", path: "/admin/analytics" },
  { key: "photos", label: "인기 사진", path: "/admin/analytics/photos" },
  { key: "pages", label: "페이지별", path: "/admin/analytics/pages" },
  { key: "photographers", label: "작가별", path: "/admin/analytics/photographers" },
  { key: "journeys", label: "전환 경로", path: "/admin/analytics/journeys" },
  { key: "engagement", label: "참여·유입", path: "/admin/analytics/engagement" },
];

export function matchPhoto(p: string): string | null {
  const m = p.match(/^\/photos\/([^/?#]+)/);
  return m ? m[1] : null;
}
export function matchPhotographer(p: string): string | null {
  const m = p.match(/^\/photographers\/([^/?#]+)/);
  return m ? m[1] : null;
}

const STATIC_PAGES: { test: RegExp; name: string }[] = [
  { test: /^\/login/, name: "로그인 페이지" },
  { test: /^\/signup/, name: "회원가입 페이지" },
  { test: /^\/inquiry/, name: "문의·예약 페이지" },
  { test: /^\/favorites/, name: "찜 목록" },
  { test: /^\/apply/, name: "작가 신청 페이지" },
  { test: /^\/bookings\/[^/]+\/pay/, name: "결제 페이지" },
  { test: /^\/bookings\/[^/]+\/refund/, name: "환불 페이지" },
  { test: /^\/bookings/, name: "예약 내역" },
  { test: /^\/chat/, name: "채팅" },
  { test: /^\/notifications/, name: "알림" },
  { test: /^\/settings/, name: "설정" },
];

const CTA_NAMES: Record<string, string> = {
  "cta:inquiry": "문의·예약하기 버튼",
  "cta:photo": "사진 카드 클릭",
  "cta:signup_kakao": "카카오로 시작하기",
  "toggle:price": "가격 표시 켜기/끄기",
  "toggle:name": "작가명 표시 켜기/끄기",
};
export function ctaName(label: string | null, target: string | null): string {
  if (label && CTA_NAMES[label]) return CTA_NAMES[label];
  if (label && label.startsWith("cta:")) return label.slice(4);
  if (target) {
    if (matchPhoto(target)) return "사진 보러 가기";
    if (matchPhotographer(target)) return "작가 프로필 보기";
    if (/^\/inquiry/.test(target)) return "문의·예약하기";
    if (/^\/login/.test(target)) return "로그인하러 가기";
    if (/^\/signup/.test(target)) return "회원가입하러 가기";
    if (/^\/favorites/.test(target)) return "찜 목록 열기";
    if (/^\/c\//.test(target)) return "카테고리 보기";
    if (target === "/") return "메인으로";
  }
  return label || "(이름 없는 버튼)";
}

export function fmtDuration(sec: number): string {
  if (sec < 1) return "0초";
  if (sec < 60) return `${Math.round(sec)}초`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return s > 0 ? `${m}분 ${s}초` : `${m}분`;
}

export type PhotoMeta = {
  thumb: string | null;
  src: string | null;
  price: number | null;
  region: string | null;
  tags: string[];
  photographer: string | null;
  pgId: string | null;
};

export type AnalyticsData = {
  range: (typeof RANGES)[number];
  seg: Segment; // 기본 구분
  persona: Segment; // 페르소나(독립)
  events: Ev[];
  capped: boolean;
  sessions: Session[]; // 기본 구분 ∩ 페르소나 적용됨
  allSessions: Session[]; // 세그먼트 카운트용(전체)
  photoMeta: Map<string, PhotoMeta>;
  pgName: Map<string, string>;
  pageName: (path: string) => { title: string; sub?: string };
};

// 무거운 base(이벤트·메타·세션) — seg 와 무관하므로 range 별로만 계산.
type AnalyticsBase = {
  range: (typeof RANGES)[number];
  events: Ev[];
  capped: boolean;
  allSessions: Session[];
  photoMeta: Map<string, PhotoMeta>;
  pgName: Map<string, string>;
};

// range 별 인메모리 캐시(60초) — 탭/페르소나 전환 시 DB 재조회·세션 재구성을 건너뜀.
// 서버리스 인스턴스가 재사용되는 동안 유효(저트래픽 어드민에 충분).
const BASE_TTL_MS = 60_000;
const baseCache = new Map<string, { at: number; data: AnalyticsBase }>();

// 데이터 초기화 등으로 즉시 새로고침이 필요할 때 호출
export function invalidateAnalyticsCache() {
  baseCache.clear();
}

async function loadBase(rangeKey?: string): Promise<AnalyticsBase> {
  const range = RANGES.find((r) => r.key === rangeKey) ?? RANGES[1];
  const cached = baseCache.get(range.key);
  if (cached && Date.now() - cached.at < BASE_TTL_MS) return cached.data;

  const sinceIso = new Date(Date.now() - range.days * 86400000).toISOString();
  const admin = createAdminClient();
  const [{ data: evData }, { data: phRows }, { data: adminRows }, { data: inqRows }] = await Promise.all([
    admin
      .from("analytics_events")
      .select("session_id, profile_id, type, path, label, target, utm_source, utm_campaign, created_at")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(FETCH_CAP),
    admin.from("photographers").select("profile_id"),
    admin.from("profiles").select("id").eq("role", "admin"),
    admin.from("inquiries").select("profile_id").not("profile_id", "is", null),
  ]);

  const excluded = new Set<string>([
    ...(phRows ?? []).map((r) => r.profile_id as string),
    ...(adminRows ?? []).map((r) => r.id as string),
  ]);
  const inquirers = new Set<string>((inqRows ?? []).map((r) => r.profile_id as string));

  const events = ((evData ?? []) as Ev[])
    .filter((e) => !(e.profile_id && excluded.has(e.profile_id)))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const capped = (evData?.length ?? 0) >= FETCH_CAP;

  // 사진/작가 id 수집 → 실제 이름·썸네일
  const photoIdSet = new Set<string>();
  const pgIdSet = new Set<string>();
  for (const e of events) {
    for (const v of [e.path, e.target ?? ""]) {
      const a = matchPhoto(v);
      if (a) photoIdSet.add(a);
      const b = matchPhotographer(v);
      if (b) pgIdSet.add(b);
    }
  }
  const photoIds = [...photoIdSet].slice(0, 600);
  const pgIds = [...pgIdSet].slice(0, 400);

  const [{ data: photoRows }, { data: pgRows }] = await Promise.all([
    photoIds.length
      ? admin
          .from("photos")
          .select(
            "id, thumb_url, src_url, price_krw, region, mood_tags, photographer_id, photographer:photographers!photos_photographer_id_fkey(display_name)"
          )
          .in("id", photoIds)
      : Promise.resolve({ data: [] as unknown[] }),
    pgIds.length
      ? admin.from("photographers").select("id, display_name").in("id", pgIds)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  const photoMeta = new Map<string, PhotoMeta>();
  for (const r of (photoRows ?? []) as Record<string, unknown>[]) {
    const ph = r.photographer as { display_name?: string | null } | null;
    photoMeta.set(r.id as string, {
      thumb: (r.thumb_url as string) ?? null,
      src: (r.src_url as string) ?? null,
      price: (r.price_krw as number) ?? null,
      region: (r.region as string) ?? null,
      tags: ((r.mood_tags as string[]) ?? []).slice(0, 6),
      photographer: ph?.display_name ?? null,
      pgId: (r.photographer_id as string) ?? null,
    });
  }
  const pgName = new Map<string, string>();
  for (const r of (pgRows ?? []) as Record<string, unknown>[]) {
    pgName.set(r.id as string, (r.display_name as string) ?? "이름 미입력 작가");
  }
  // 사진 메타에서 작가 이름 보강(프로필 방문이 없던 작가도 이름 확보)
  for (const m of photoMeta.values()) {
    if (m.pgId && m.photographer && !pgName.has(m.pgId)) pgName.set(m.pgId, m.photographer);
  }

  // 세션 묶기
  const map = new Map<string, Session>();
  for (const e of events) {
    let s = map.get(e.session_id);
    if (!s) {
      s = { id: e.session_id, profileId: e.profile_id, events: [], pageviews: 0, firstTs: Infinity, lastTs: 0, lastPath: null, converted: false };
      map.set(e.session_id, s);
    }
    if (e.profile_id) s.profileId = e.profile_id;
    s.events.push(e);
    const ts = Date.parse(e.created_at);
    s.firstTs = Math.min(s.firstTs, ts);
    s.lastTs = Math.max(s.lastTs, ts);
    if (e.type === "pageview") {
      s.pageviews += 1;
      s.lastPath = e.path;
    }
    if ((e.type === "click" && (e.target ?? "").includes("/inquiry")) || (e.profile_id && inquirers.has(e.profile_id))) {
      s.converted = true;
    }
  }
  const allSessions = [...map.values()];

  const data: AnalyticsBase = { range, events, capped, allSessions, photoMeta, pgName };
  baseCache.set(range.key, { at: Date.now(), data });
  return data;
}

export async function loadAnalytics(rangeKey?: string, segKey?: string, personaKey?: string): Promise<AnalyticsData> {
  const seg = SEGMENTS.find((s) => s.key === segKey) ?? SEGMENTS[0];
  const persona = PERSONAS.find((p) => p.key === personaKey) ?? PERSONAS[0];
  const base = await loadBase(rangeKey);
  const { range, events, capped, allSessions, photoMeta, pgName } = base;
  // 기본 구분 ∩ 페르소나 (서로 독립, 교집합)
  const sessions = allSessions.filter((s) => seg.match(s) && persona.match(s));

  // 경로 → 한글 페이지 이름 (캐시된 메타 사용)
  const pageName = (path: string): { title: string; sub?: string } => {
    if (path === "/" || path === "") return { title: "메인페이지", sub: "사진 탐색 홈" };
    const ph = matchPhoto(path);
    if (ph) {
      const m = photoMeta.get(ph);
      return { title: "사진 상세페이지", sub: m ? `${m.photographer ?? "작가"}${m.region ? ` · ${m.region}` : ""}` : "삭제됨" };
    }
    const pg = matchPhotographer(path);
    if (pg) return { title: "작가 프로필", sub: pgName.get(pg) ?? "삭제됨" };
    if (/^\/c\//.test(path)) {
      const slug = decodeURIComponent(path.split("/")[2] ?? "");
      return { title: "카테고리", sub: slug };
    }
    for (const s of STATIC_PAGES) if (s.test.test(path)) return { title: s.name };
    return { title: path };
  };

  return { range, seg, persona, events, capped, sessions, allSessions, photoMeta, pgName, pageName };
}

// 탭 간 range·seg·persona 유지용 쿼리스트링
export function buildQs(range: string, seg: string, persona = "all"): string {
  return `?range=${range}&seg=${seg}&persona=${persona}`;
}
