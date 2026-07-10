import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { CATEGORY_COOKIE } from "@/lib/category-constants";

// Next.js 16: 구 middleware 규칙 → proxy 규칙.
// ① 매 요청마다 Supabase 세션 갱신 ② 카테고리 광고 유입 컨텍스트 쿠키 set/clear.
export async function proxy(request: NextRequest) {
  const response = await updateSession(request);
  return applyCategoryContext(request, response);
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

const CATEGORY_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30일

function setCatCookie(response: NextResponse, slug: string) {
  response.cookies.set(CATEGORY_COOKIE, slug, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: CATEGORY_COOKIE_MAX_AGE,
  });
}

// 카테고리는 단일 페이지 /c/<slug> 로 통일. 홈(/)에 카테고리 컨텍스트가 있으면 /c/<slug> 로 리다이렉트.
// · /c/<slug> 진입 → 그 카테고리로 컨텍스트 고정 (쿠키)
// · /?cat=<slug> 또는 유지 쿠키(samae_cat) → /c/<slug> 로 리다이렉트 (?ad 유지)
// · /?nocat=1 (전체 보기) → 컨텍스트 해제(쿠키 삭제) + 홈 전체 피드 유지
// · /?q=... (검색) → 리다이렉트 안 함
function applyCategoryContext(request: NextRequest, response: NextResponse): NextResponse {
  const { pathname, searchParams } = request.nextUrl;

  if (pathname.startsWith("/c/")) {
    const slug = safeDecode(pathname.slice("/c/".length).split("/")[0]);
    if (slug) setCatCookie(response, slug);
    return response;
  }

  if (pathname === "/") {
    if (searchParams.has("q")) return response; // 검색 모드는 그대로
    if (searchParams.has("nocat")) {
      response.cookies.delete(CATEGORY_COOKIE);
      return response;
    }
    const cat = searchParams.get("cat") || request.cookies.get(CATEGORY_COOKIE)?.value;
    if (cat) {
      // /c/<cat> 로 통일 리다이렉트. ?ad 는 유지, cat/nocat 은 제거.
      const url = request.nextUrl.clone();
      url.pathname = `/c/${cat}`;
      const ad = searchParams.get("ad");
      url.search = ad ? `?ad=${encodeURIComponent(ad)}` : "";
      const redir = NextResponse.redirect(url);
      // updateSession 이 갱신한 세션 쿠키를 리다이렉트 응답으로 이관 + 카테고리 쿠키 set
      response.cookies.getAll().forEach((c) => redir.cookies.set(c));
      setCatCookie(redir, cat);
      return redir;
    }
  }
  return response;
}

export const config = {
  // 정적 자산·이미지를 제외한 모든 경로에서 세션 갱신
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
