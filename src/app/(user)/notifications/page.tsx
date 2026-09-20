import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listMyNotifications } from "@/lib/notifications";
import { MarkReadOnMount } from "./MarkReadOnMount";
import { NotificationsList } from "./NotificationsList";
import { MpTrackOnce } from "@/components/MpTrackOnce";

export const dynamic = "force-dynamic";

// 로그인해야 쓰는 지면이라 색인 대상이 아니다.
// ⚠️ robots.txt 로 막는 것만으로는 **색인에서 빠지지 않는다** — 크롤러가 못 들어오면
//    noindex 를 읽을 수도 없어서 구글은 주소만 들고 색인해 버린다
//    ("색인이 생성되었으나 robots.txt에 의해 차단됨", 2026-09-21 GSC 경고).
//    그래서 noindex 를 내고, robots.txt 에서는 이 경로를 뺐다(src/app/robots.ts).
export const metadata: Metadata = { robots: { index: false, follow: false } };

// 알림 — 클릭 시 해당 위치로 이동만(처리는 스튜디오/해당 화면에서)
export default async function NotificationsPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/notifications");

  const items = await listMyNotifications();
  const hasUnread = items.some((n) => !n.read_at);

  return (
    <main className="mx-auto max-w-2xl px-3.5 sm:px-5 py-8 font-kr">
      {/* 알림함 진입 — 재방문 경로·알림 효용 */}
      <MpTrackOnce
        event="View Notifications"
        props={{ total: items.length, unread: items.filter((n) => !n.read_at).length }}
      />
      <MarkReadOnMount hasUnread={hasUnread} />
      <NotificationsList items={items} />
    </main>
  );
}
