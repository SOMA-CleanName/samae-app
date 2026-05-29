import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16: 구 middleware 규칙 → proxy 규칙. 매 요청마다 Supabase 세션 갱신.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // 정적 자산·이미지를 제외한 모든 경로에서 세션 갱신
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
