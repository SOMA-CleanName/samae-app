import { getCurrentUser } from "@/lib/auth";
import { CartProvider } from "@/components/user/cart/CartProvider";
import { FloatingCart } from "@/components/user/cart/FloatingCart";
import { FloatingNav } from "@/components/user/FloatingNav";
import { NavRevealProvider } from "@/components/user/NavReveal";
import { readMyInquiryIds } from "@/lib/my-inquiries";

// 사용자(탐색) 영역 공통 셸 — 기존 하단바/레일 제거.
// 하단 중앙 홈/탐색 플로팅 내비 + (로그인 시) 좌측 하단 계정 + 우측 하단 장바구니.
export default async function UserLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  const me = await getCurrentUser();
  // 비로그인도 '내 문의'가 있으면 내비에 노출 (쿠키 기반)
  const hasInquiries = (await readMyInquiryIds()).length > 0;
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
        {/* 하단 플로팅 내비 높이만큼 여백 확보. id=feed-viewport: 모달 열릴 때 이 영역을
            현재 스크롤 위치에 고정(feed-lock) → 창 스크롤이 모달을 스크롤하게 함 */}
        <main id="feed-viewport" className="pb-28">{children}</main>
        {/* 사진 상세 인터셉트 모달 슬롯 — 소프트 내비 시에만 채워짐(그 외엔 default=null) */}
        {modal}
        <FloatingNav me={profileMe} hasInquiries={hasInquiries} />
        <FloatingCart />
      </NavRevealProvider>
    </CartProvider>
  );
}
