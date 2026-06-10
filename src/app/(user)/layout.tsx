import { getCurrentUser } from "@/lib/auth";
import { listConversations, myUnread } from "@/lib/chat";
import { countActiveBookings } from "@/lib/bookings";
import { countUnreadNotifications } from "@/lib/notifications";
import { Sidebar, type NavItem } from "@/components/user/Sidebar";
import { TopBar } from "@/components/user/TopBar";

// 사용자(탐색) 영역 공통 셸 — 핀터레스트식 좌측 레일 + 상단 검색바
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

  // 레일 항목 구성 — 비로그인은 홈만 노출
  const items: NavItem[] = [{ href: "/", label: "탐색", icon: "home" }];
  if (me) {
    items.push(
      { href: "/favorites", label: "찜", icon: "heart" },
      { href: "/bookings", label: "예약", icon: "calendar", badge: activeBookings || undefined },
      { href: "/chat", label: "채팅", icon: "chat", badge: unreadTotal || undefined },
      { href: "/notifications", label: "알림", icon: "bell", badge: unreadNotif || undefined },
    );
    // 작가 신청은 사이드바에서 제외 — 작가만 '스튜디오' 진입 노출
    if (me.photographer) {
      items.push({ href: "/studio", label: "스튜디오", icon: "plus" });
    }
    if (me.role === "admin") {
      items.push({ href: "/admin", label: "어드민", icon: "shield" });
    }
  }

  return (
    <>
      <Sidebar items={items} />
      <div className="md:pl-[72px]">
        <TopBar
          me={
            me
              ? {
                  displayName: me.displayName,
                  email: me.email,
                  avatarUrl: me.avatarUrl,
                  isPhotographer: !!me.photographer,
                }
              : null
          }
        />
        {/* 모바일 하단 탭바 높이만큼 여백 확보 */}
        <main className="pb-20 md:pb-0">{children}</main>
      </div>
    </>
  );
}
