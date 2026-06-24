import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { CATEGORY_COOKIE } from "@/lib/category-constants";

// Next.js 16: 구 middleware 규칙 → proxy 규칙.
// ① 매 요청마다 Supabase 세션 갱신 ② 카테고리 광고 유입 컨텍스트 쿠키 set/clear.
export async function proxy(request: NextRequest) {
  const response = await updateSession(request);
  applyCategoryContext(request, response);
  return response;
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

// 카테고리 알고리즘 "유지"를 위한 쿠키 관리.
// · /c/<slug> 진입 → 그 카테고리로 컨텍스트 고정 (메인 복귀해도 유지)
// · /?cat=<slug> (광고 유입) → 그 카테고리로 고정
// · /?nocat=1 (전체 보기) → 컨텍스트 해제
function applyCategoryContext(request: NextRequest, response: NextResponse) {
  const { pathname, searchParams } = request.nextUrl;

  if (pathname.startsWith("/c/")) {
    const slug = safeDecode(pathname.slice("/c/".length).split("/")[0]);
    if (slug) setCatCookie(response, slug);
    return;
  }

  if (pathname === "/") {
    if (searchParams.has("nocat")) {
      response.cookies.delete(CATEGORY_COOKIE);
      return;
    }
    const cat = searchParams.get("cat");
    if (cat) setCatCookie(response, cat);
  }
}

export const config = {
  // 정적 자산·이미지를 제외한 모든 경로에서 세션 갱신
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
