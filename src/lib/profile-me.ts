import type { CurrentUser } from "@/lib/auth";
import type { ProfileMe } from "@/components/user/ProfileSheet";

/**
 * getCurrentUser() 결과 → 프로필 시트가 필요로 하는 최소 형태.
 *
 * 세 군데(홈·카테고리 지면·(user) 레이아웃)에서 같은 객체를 손으로 만들고 있었다.
 * 필드가 하나 늘 때 한 곳만 고치면 나머지 둘이 조용히 어긋난다.
 *
 * ⚠️ 이 파일은 "use client" 가 아니다. ProfileSheet(클라이언트 모듈)에 이 함수를 두면
 *    서버 컴포넌트가 import 할 때 실제 함수가 아니라 클라이언트 참조 프록시를 받는다.
 *    (타입만은 클라이언트 모듈에서 가져와도 안전하다 — 빌드 시 지워진다)
 */
export function toProfileMe(me: CurrentUser | null): ProfileMe | null {
  if (!me) return null;
  return {
    displayName: me.displayName,
    email: me.email,
    avatarUrl: me.avatarUrl,
    isPhotographer: !!me.photographer,
    photographerId: me.photographer?.id ?? null,
    isAdmin: me.role === "admin",
  };
}
