import { getCurrentUser } from "@/lib/auth";
import { CartProvider } from "@/components/user/cart/CartProvider";
import { FloatingCart } from "@/components/user/cart/FloatingCart";
import { FloatingNav } from "@/components/user/FloatingNav";
import { NavRevealProvider } from "@/components/user/NavReveal";
import { PhotoReturnScroll } from "@/components/user/PhotoReturnScroll";
import { readMyInquiryIds } from "@/lib/my-inquiries";
import { fetchUnreadTotalForUser, fetchUnreadTotalForPhotographer } from "@/lib/chat";
import { RealtimeListRefresh } from "@/components/user/RealtimeListRefresh";
import { ChatToast } from "@/components/user/ChatToast";

// 사용자(탐색) 영역 공통 셸 — 기존 하단바/레일 제거.
// 하단 중앙 홈/탐색 플로팅 내비 + (로그인 시) 좌측 하단 계정 + 우측 하단 장바구니.
export default async function UserLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
  const profileMe = me
    ? {
        displayName: me.displayName,
        email: me.email,
        avatarUrl: me.avatarUrl,
        isPhotographer: !!me.photographer,
        photographerId: me.photographer?.id ?? null,
        isAdmin: me.role === "admin",
      }
    : null;

  return (
    <CartProvider>
      <NavRevealProvider>
        <PhotoReturnScroll />
        {/* 새 메시지가 오면 셸을 다시 그린다 — 내비 배지가 어느 화면에서나 살아 있어야 한다
            (목록 페이지에도 있던 구독을 여기로 올렸다. 채널이 둘이면 같은 이름으로 겹친다) */}
        {me && <RealtimeListRefresh />}
        {/* 배지는 '어딘가에 왔다' 만 말한다 — 누가 뭐라고 했는지까지 띄워야 바로 답한다 */}
        {me && <ChatToast meId={me.id} />}
        {/* 하단 플로팅 내비 높이만큼 여백 확보 */}
        <main className="pb-28">{children}</main>
        <FloatingNav
          me={profileMe}
          hasInquiries={hasInquiries}
          unreadCount={unreadCount}
          studioUnread={studioUnread}
        />
        <FloatingCart />
      </NavRevealProvider>
    </CartProvider>
  );
}
