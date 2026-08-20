// 인스타 프로필 사전 조회 — 분석을 돌리기 **전에** 계정을 확인시켜 준다.
//
// 목적: 오타·비공개 계정으로 Apify+LLM 비용을 태우는 것을 입구에서 막는다.
//   · 존재하지 않는 아이디 → 404 를 즉시 보여줌 (Apify 호출 0)
//   · 비공개 계정        → 스크래핑 전에 업로드 경로로 안내 (Apify 호출 0)
//   · 공개 계정          → 아바타·이름 카드를 보여주고 "이 계정 맞아?" 확인
//
// 수단: instagram.com 의 비로그인 web_profile_info 엔드포인트.
// 2026-08-20 맥미니(주거용 IP)에서 실측 — 비로그인으로 정상 응답한다.
// 데이터센터 IP(Vercel)에서는 막힌다(실배포에서 확인) → 그때는 맥미니 프록시
// (PERSONA_EMBED_URL 의 /iglookup, 토큰 인증)로 한 번 더 시도하고,
// 그것도 안 되면 unavailable — 클라이언트는 카드 없이 기존 흐름으로 폴백한다.
// 이 조회는 편의 기능이지 필수 관문이 아니다.
import "server-only";

export type IgProfilePreview = {
  username: string;
  fullName: string;
  isPrivate: boolean;
  isVerified: boolean;
  followers: number;
  posts: number;
  /** data URL (서버에서 받아 base64 로 프록시). 실패 시 null — CDN 핫링크는 referer 로 깨질 수 있다 */
  avatar: string | null;
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

// 같은 아이디를 타이핑 중에 여러 번 조회하게 되므로 짧게 캐시한다.
// (인스타 쪽 레이트리밋을 아끼는 목적 — 서버 인스턴스당 메모리 캐시면 충분)
const cache = new Map<string, { at: number; value: LookupResult }>();
// 30분 — 프로필은 자주 안 바뀌고, 인스타 쪽 호출을 줄이는 게 레이트리밋 방어다
// (2026-08-20 테스트 폭주로 주거용 IP 까지 일시 제한을 실제로 맞았다)
const CACHE_TTL_MS = 30 * 60_000;
const CACHE_MAX = 500;

async function fetchAvatar(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > 400_000) return null; // 150px 프로필은 수십 KB
    const type = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0];
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/** 맥미니 임베딩 서비스의 /iglookup 프록시 — 주거용 IP 라 인스타 조회가 통과한다.
 *  PERSONA_EMBED_URL 미설정이거나 실패하면 unavailable. */
async function lookupViaProxy(username: string): Promise<LookupResult> {
  const base = process.env.PERSONA_EMBED_URL?.trim().replace(/\/$/, "");
  if (!base) return { status: "unavailable" };
  try {
    const res = await fetch(`${base}/iglookup?u=${encodeURIComponent(username)}`, {
      headers: process.env.PERSONA_SERVICE_TOKEN
        ? { "x-samae-token": process.env.PERSONA_SERVICE_TOKEN }
        : undefined,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { status: "unavailable" };
    const j = (await res.json()) as LookupResult;
    if (j.status === "found" || j.status === "not_found") return j;
    return { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

export type LookupResult =
  | { status: "found"; profile: IgProfilePreview }
  | { status: "not_found" } // 404 — "아이디를 확인해 주세요" 를 보여줄 수 있다
  | { status: "unavailable" }; // 차단·타임아웃 — 조회 기능 자체를 조용히 숨긴다 (기존 흐름 폴백)

/** 아이디 1개 → 프로필 미리보기. */
export async function lookupProfile(usernameRaw: string): Promise<LookupResult> {
  const username = usernameRaw.replace(/^@/, "").trim().toLowerCase();
  // 인스타 아이디 규칙: 영문/숫자/._ 만, 30자 이하. 형식이 틀리면 존재할 수 없는 계정이다.
  if (!/^[a-z0-9._]{1,30}$/.test(username)) return { status: "not_found" };

  const hit = cache.get(username);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  let value: LookupResult = { status: "unavailable" };
  try {
    const res = await fetch(
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
      {
        headers: {
          "User-Agent": UA,
          // 인스타 웹앱의 공개 앱 id — 이 헤더가 없으면 로그인 페이지로 넘긴다
          "x-ig-app-id": "936619743392459",
          Accept: "*/*",
          Referer: "https://www.instagram.com/",
          // Node fetch(undici)는 sec-fetch-mode: cors 를 자동으로 붙이는데, site 값이 없어
          // 인스타가 "SecFetch Policy violation"(400) 을 낸다. 브라우저의 same-origin
          // XHR 처럼 세 값을 명시하면 통과한다 (2026-08-20 실측 — curl 은 이 헤더가
          // 아예 없어서 통과했고, undici 는 어중간하게 하나만 붙여서 걸렸다).
          "Sec-Fetch-Site": "same-origin",
          "Sec-Fetch-Mode": "cors",
          "Sec-Fetch-Dest": "empty",
        },
        signal: AbortSignal.timeout(6000),
      }
    );
    if (res.ok) {
      const json = (await res.json()) as {
        data?: {
          user?: {
            username?: string;
            full_name?: string;
            is_private?: boolean;
            is_verified?: boolean;
            profile_pic_url?: string;
            edge_followed_by?: { count?: number };
            edge_owner_to_timeline_media?: { count?: number };
          };
        };
      };
      const u = json.data?.user;
      if (u?.username) {
        value = {
          status: "found",
          profile: {
            username: u.username,
            fullName: u.full_name ?? "",
            isPrivate: !!u.is_private,
            isVerified: !!u.is_verified,
            followers: u.edge_followed_by?.count ?? 0,
            posts: u.edge_owner_to_timeline_media?.count ?? 0,
            avatar: u.profile_pic_url ? await fetchAvatar(u.profile_pic_url) : null,
          },
        };
      } else {
        // 200 인데 user 가 비어 있는 경우도 미존재로 취급
        value = { status: "not_found" };
      }
    } else if (res.status === 404) {
      value = { status: "not_found" };
    }
    // 그 외(429·403 등 차단)는 unavailable 유지
  } catch {
    /* 타임아웃·네트워크 — unavailable 유지 */
  }

  // 직접 조회가 막혔으면(데이터센터 IP 등) 맥미니 프록시로 한 번 더
  if (value.status === "unavailable") {
    value = await lookupViaProxy(username);
  }

  // unavailable(일시 차단·타임아웃)은 캐시하지 않는다 — 5분간 고착되면 안 된다
  if (value.status !== "unavailable") {
    if (cache.size >= CACHE_MAX) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(username, { at: Date.now(), value });
  }
  return value;
}
