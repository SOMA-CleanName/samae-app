import { getCurrentUser } from "@/lib/auth";
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

  // 예약 알림만 사이드 UI에 노출한다.
  let unreadNotif = 0;
  if (me) {
    unreadNotif = await countUnreadNotifications();
  }

  // 코어 탭 — 프로필 시트 밖에 예약 알림을 독립 항목으로 둔다.
  // 비로그인은 Sidebar에서 게이트(탭 시 로그인)로 처리, 배지는 로그인 시에만.
  // 스튜디오·어드민·설정은 프로필 시트로 흡수.
  const items: NavItem[] = [
    { href: "/", label: "탐색", icon: "home" },
    { href: "/favorites", label: "찜", icon: "heart" },
  ];
  // 작가에게는 스튜디오 바로가기 아이콘을 레일/하단바에 노출
  if (me?.photographer) {
    items.push({ href: "/studio", label: "스튜디오", icon: "studio" });
  }
  items.push({
    href: "/notifications",
    label: "예약 알림",
    icon: "bell",
    badge: unreadNotif || undefined,
  });

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
                photographerId: me.photographer?.id ?? null,
                isAdmin: me.role === "admin",
              }
            : null
        }
      />
      <div className="md:pl-[72px]">
        {/* 모바일 하단 탭바 높이만큼 여백 확보 */}
        <main className="pb-24 md:pb-0">{children}</main>
      </div>
    </>
  );
}
