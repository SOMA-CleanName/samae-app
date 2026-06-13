import { getCurrentUser } from "@/lib/auth";
import { listConversations, myUnread } from "@/lib/chat";
import { countActiveBookings } from "@/lib/bookings";
import { countUnreadNotifications } from "@/lib/notifications";
import { Sidebar, type NavItem } from "@/components/user/Sidebar";

// 사용자(탐색) 영역 공통 셸 — 통합 하단바/레일 1개.
// 상단바 제거: 검색은 탐색 페이지 sticky 헤더, 계정 메뉴는 프로필 시트로 이동.
export default async function UserLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await getCurrentUser();

  // 채팅 안읽음 합계 + 진행 중 예약 + 안읽은 알림 (로그인 시)
  let unreadTotal = 0;
  let activeBookings = 0;
  let unreadNotif = 0;
  if (me) {
    const [convs, bookingCount, notifCount] = await Promise.all([
      listConversations(),
      countActiveBookings(),
      countUnreadNotifications(),
    ]);
    unreadTotal = convs.reduce((sum, c) => sum + myUnread(c, me), 0);
    activeBookings = bookingCount;
    unreadNotif = notifCount;
  }

  // 코어 4탭(탐색·찜·채팅·예약) — 5번째 칸은 프로필.
  // 알림·스튜디오·어드민·설정은 프로필 시트로 흡수.
  const items: NavItem[] = [{ href: "/", label: "탐색", icon: "home" }];
  if (me) {
    items.push(
      { href: "/favorites", label: "찜", icon: "heart" },
      { href: "/chat", label: "채팅", icon: "chat", badge: unreadTotal || undefined },
      { href: "/bookings", label: "예약", icon: "calendar", badge: activeBookings || undefined },
    );
  }

  return (
    <>
      <Sidebar
        items={items}
        me={
          me
            ? {
                displayName: me.displayName,
                email: me.email,
                avatarUrl: me.avatarUrl,
                isPhotographer: !!me.photographer,
                isAdmin: me.role === "admin",
              }
            : null
        }
        notifUnread={unreadNotif}
      />
      <div className="md:pl-[72px]">
        {/* 모바일 하단 탭바 높이만큼 여백 확보 */}
        <main className="pb-24 md:pb-0">{children}</main>
      </div>
    </>
  );
}
