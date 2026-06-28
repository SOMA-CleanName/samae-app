import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listMyNotifications } from "@/lib/notifications";
import { MarkReadOnMount } from "./MarkReadOnMount";
import { NotificationsList } from "./NotificationsList";

export const dynamic = "force-dynamic";

// 알림 — 클릭 시 해당 위치로 이동만(처리는 스튜디오/해당 화면에서)
export default async function NotificationsPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/notifications");

  const items = await listMyNotifications();
  const hasUnread = items.some((n) => !n.read_at);

  return (
    <main className="mx-auto max-w-2xl px-3.5 sm:px-5 py-8 font-kr">
      <MarkReadOnMount hasUnread={hasUnread} />
      <NotificationsList items={items} />
    </main>
  );
}
