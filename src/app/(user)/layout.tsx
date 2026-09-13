import { getCurrentUser } from "@/lib/auth";
import { Suspense } from "react";
import { CartProvider } from "@/components/user/cart/CartProvider";
import { FloatingCart } from "@/components/user/cart/FloatingCart";
import { FloatingNav } from "@/components/user/FloatingNav";
import { NavRevealProvider } from "@/components/user/NavReveal";
import { PhotoReturnScroll } from "@/components/user/PhotoReturnScroll";
import { SiteInfoBar } from "@/components/SiteInfoBar";
import { readMyInquiryIds } from "@/lib/my-inquiries";
import { fetchUnreadTotalForUser, fetchUnreadTotalForPhotographer } from "@/lib/chat";
import { RealtimeListRefresh } from "@/components/user/RealtimeListRefresh";
import { ChatToast } from "@/components/user/ChatToast";
import { toProfileMe } from "@/lib/profile-me";

// 사용자(탐색) 영역 공통 셸 — 기존 하단바/레일 제거.
// 하단 중앙 플로팅 내비 + 우측 하단 장바구니.
// 계정은 여기 없다 — 홈/카테고리 지면 상단 오른쪽 ProfileButton 이 맡는다.
async function UserSessionChrome() {
  const me = await getCurrentUser();
  // '문의' 탭 노출 — 로그인했으면 항상(대화 허브라 상시 진입점 필요, 빈 상태 화면 있음),
  // 비로그인은 쿠키(기기)에 문의 내역이 있을 때만
  const hasInquiries = !!me || (await readMyInquiryIds()).length > 0;
  // '문의' 탭 배지 — 목록을 열기 전에도 새 답장이 왔음을 알아야 다시 들어올 이유가 생긴다
  // 두 배지는 다른 것을 센다 — '문의' 는 내가 고객인 방, '스튜디오' 는 내가 작가인 방.
  // 작가가 다른 작가에게 문의하는 경우가 있어 한 숫자로 합치면 어디를 눌러야 할지 모른다.
  const [unreadCount, studioUnread] = await Promise.all([
    me ? fetchUnreadTotalForUser(me.id) : Promise.resolve(0),
    me?.photographer ? fetchUnreadTotalForPhotographer(me.photographer.id) : Promise.resolve(0),
  ]);
  const profileMe = toProfileMe(me);

  return (
    <>
      {me && <RealtimeListRefresh />}
      {me && <ChatToast meId={me.id} />}
      <FloatingNav me={profileMe} hasInquiries={hasInquiries} unreadCount={unreadCount} studioUnread={studioUnread} />
    </>
  );
}

export default function UserLayout({ children }: { children: React.ReactNode }) {

  return (
    <CartProvider>
      <NavRevealProvider>
        <PhotoReturnScroll />
        {/* 운영 주체 — 지면 맨 위, 데스크톱에서만 (SiteInfoBar 주석 참조) */}
        <SiteInfoBar />
        {/* 하단 플로팅 내비 높이만큼 여백 확보 */}
        <main className="pb-28">{children}</main>
        {/* 세션·안읽음 조회가 느려도 검색창·사진 영역의 대기 안내는 먼저 렌더한다. */}
        <Suspense fallback={<FloatingNav me={null} />}>
          <UserSessionChrome />
        </Suspense>
        <FloatingCart />
      </NavRevealProvider>
    </CartProvider>
  );
}
