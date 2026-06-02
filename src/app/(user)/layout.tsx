import { getCurrentUser } from "@/lib/auth";
import { listConversations, myUnread } from "@/lib/chat";
import { Sidebar, type NavItem } from "@/components/user/Sidebar";
import { TopBar } from "@/components/user/TopBar";

// 사용자(탐색) 영역 공통 셸 — 핀터레스트식 좌측 레일 + 상단 검색바
export default async function UserLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await getCurrentUser();

  // 채팅 안읽음 합계 (로그인 시)
  let unreadTotal = 0;
  if (me) {
    const convs = await listConversations();
    unreadTotal = convs.reduce((sum, c) => sum + myUnread(c, me), 0);
  }

  // 레일 항목 구성 — 비로그인은 홈만 노출
  const items: NavItem[] = [{ href: "/", label: "탐색", icon: "home" }];
  if (me) {
    items.push(
      { href: "/favorites", label: "찜", icon: "heart" },
      { href: "/studio", label: me.photographer ? "스튜디오" : "작가 신청", icon: "plus" },
      { href: "/bookings", label: "예약", icon: "calendar" },
      { href: "/chat", label: "채팅", icon: "chat", badge: unreadTotal || undefined },
    );
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
