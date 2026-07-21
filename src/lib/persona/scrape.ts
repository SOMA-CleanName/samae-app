// 서버 전용 모듈 (API/서버액션에서만 import). APIFY_TOKEN 등 비밀값 사용.
// (woori-mirae `lib/instagram/scrape.ts` 포팅 — 다중 username 지원 유지, 이벤트에선 1개만 넘김)
import "server-only";
import type { IgProfile, IgPost } from "./types";

const APIFY_ACTOR = "apify~instagram-profile-scraper";
const APIFY_URL = (token: string) =>
  `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${token}`;

function useMock(): boolean {
  return process.env.IG_MOCK === "true" || !process.env.APIFY_TOKEN;
}

/** 계정 스크래핑 (여러 개 지원, 실패 시 개별 처리) */
export async function scrapeProfiles(usernames: string[]): Promise<IgProfile[]> {
  const clean = usernames.map((u) => u.replace(/^@/, "").trim().toLowerCase());
  if (useMock()) return clean.map(mockProfile);

  const token = process.env.APIFY_TOKEN!;
  const res = await fetch(APIFY_URL(token), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      usernames: clean,
      resultsLimit: 20, // 계정당 최근 게시물 수
    }),
    // Apify sync 실행은 오래 걸릴 수 있음
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Apify 스크래핑 실패 (${res.status}): ${text.slice(0, 200)}`);
  }

  const items: unknown[] = await res.json();
  const byName = new Map<string, IgProfile>();
  for (const raw of items) {
    const p = normalize(raw);
    if (p) byName.set(p.username.toLowerCase(), p);
  }
  // 요청 순서 보존, 못 찾은 계정은 비공개/실패로 표시
  return clean.map((u) => byName.get(u) ?? emptyProfile(u));
}

/** 단일 계정 스크래핑 편의 함수 (이벤트 기본 경로) */
export async function scrapeProfile(username: string): Promise<IgProfile> {
  const [p] = await scrapeProfiles([username]);
  return p;
}

// ── Apify 원시 응답 정규화 (필드명은 액터별로 다를 수 있어 방어적으로) ──
type Raw = Record<string, unknown>;
const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

function normalize(raw: unknown): IgProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Raw;
  const username = str(r.username) ?? str(r.ownerUsername);
  if (!username) return null;

  const rawPosts = (r.latestPosts ?? r.posts ?? []) as Raw[];
  const posts: IgPost[] = (Array.isArray(rawPosts) ? rawPosts : [])
    .slice(0, 20)
    .map((p) => {
      const caption = str(p.caption) ?? "";
      return {
        caption,
        likes: num(p.likesCount ?? p.likes),
        comments: num(p.commentsCount ?? p.comments),
        timestamp: str(p.timestamp) ?? str(p.takenAt) ?? "",
        type: normType(str(p.type)),
        imageUrl: str(p.displayUrl) ?? str(p.imageUrl) ?? str(p.thumbnailUrl),
        location: str(p.locationName) ?? str(p.location),
        hashtags: extractHashtags(caption, p.hashtags),
      } satisfies IgPost;
    });

  return {
    username,
    fullName: str(r.fullName),
    bio: str(r.biography) ?? str(r.bio),
    profilePicUrl: str(r.profilePicUrlHD) ?? str(r.profilePicUrl),
    followers: num(r.followersCount),
    following: num(r.followsCount ?? r.followingCount),
    postsCount: num(r.postsCount),
    isPrivate: Boolean(r.private ?? r.isPrivate),
    isVerified: Boolean(r.verified ?? r.isVerified),
    posts,
    scrapedAt: new Date().toISOString(),
    source: "apify",
  };
}

function normType(t?: string): IgPost["type"] {
  const s = (t ?? "").toLowerCase();
  if (s.includes("video") || s.includes("reel")) return "video";
  if (s.includes("sidecar") || s.includes("carousel")) return "carousel";
  if (s.includes("image") || s.includes("photo")) return "image";
  return "unknown";
}

function extractHashtags(caption: string, given?: unknown): string[] {
  if (Array.isArray(given) && given.length) return given.map(String);
  const m = caption.match(/#[\p{L}\p{N}_]+/gu);
  return m ? m.map((h) => h.slice(1)) : [];
}

function emptyProfile(username: string): IgProfile {
  return {
    username,
    followers: 0,
    following: 0,
    postsCount: 0,
    isPrivate: true, // 못 가져옴 → 비공개로 간주 (fallback 트리거용)
    isVerified: false,
    posts: [],
    scrapedAt: new Date().toISOString(),
    source: "apify",
  };
}

// ────────────────────────── MOCK ──────────────────────────
// 토큰 없이 파이프라인을 개발/테스트하기 위한 가짜 데이터.
// username으로 시드를 만들어 계정마다 다르게 보이게 한다.

function seed(s: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MOCK_THEMES = [
  { tag: "카페", caps: ["오늘도 여기 구석 자리 ☕️ #카페 #작업", "라떼 한 잔의 여유 🤍", "노트북 켜고 또 카페 출근 💻 #카페투어"], loc: "성수동 카페" },
  { tag: "혼자", caps: ["혼자만의 시간 🌙", "퇴근하고 혼밥 🍜", "이 시간이 제일 좋다"], loc: undefined },
  { tag: "운동", caps: ["오운완 💪 #헬스", "러닝 5km 🏃", "요가 클래스 🧘‍♀️"], loc: "한강" },
  { tag: "여행", caps: ["떠나고 싶었어 ✈️ #여행", "바다 보러 왔다 🌊", "제주 한 달 살기 🏝️"], loc: "제주도" },
  { tag: "음식", caps: ["오마카세 🍣 #맛집", "디저트는 진리 🍰", "친구랑 삼겹살 🥓"], loc: "이태원" },
  { tag: "일상", caps: ["소소한 하루 🌷", "책 한 권 📖", "집꾸미기 완료 🪴"], loc: undefined },
];

function mockProfile(username: string): IgProfile {
  const rnd = seed(username);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
  const postN = 12 + Math.floor(rnd() * 8); // 12~19
  const bias = pick(MOCK_THEMES); // 이 계정이 편향된 테마

  const posts: IgPost[] = Array.from({ length: postN }, (_, i) => {
    // 60% 확률로 bias 테마, 나머지는 랜덤
    const theme = rnd() < 0.6 ? bias : pick(MOCK_THEMES);
    const caption = pick(theme.caps);
    const daysAgo = i * (2 + Math.floor(rnd() * 5));
    return {
      caption,
      likes: 20 + Math.floor(rnd() * 400),
      comments: Math.floor(rnd() * 30),
      timestamp: new Date(Date.now() - daysAgo * 86400000).toISOString(),
      type: rnd() < 0.25 ? "video" : "image",
      imageUrl: `https://picsum.photos/seed/${encodeURIComponent(username + i)}/600/600`,
      location: theme.loc,
      hashtags: extractHashtags(caption),
    };
  });

  const followers = 200 + Math.floor(rnd() * 5000);
  return {
    username,
    fullName: username,
    bio: pick([
      "☕️ 카페 러버 · 📷 일상 기록",
      "🌙 나만의 속도로",
      "✈️ 여행 · 🍽 맛집 · 📚 책",
      "🏃 운동하는 삶 · 🤍",
      "그냥 나답게",
    ]),
    profilePicUrl: `https://picsum.photos/seed/${encodeURIComponent(username)}/200/200`,
    followers,
    following: 100 + Math.floor(rnd() * 800),
    postsCount: postN + Math.floor(rnd() * 200),
    isPrivate: false,
    isVerified: false,
    posts,
    scrapedAt: new Date().toISOString(),
    source: "mock",
  };
}
