import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listMyNotifications } from "@/lib/notifications";
import { listMyAcceptedInquiries } from "@/lib/inquiries";
import { MarkReadOnMount } from "./MarkReadOnMount";
import { NotificationsList } from "./NotificationsList";

export const dynamic = "force-dynamic";

// 예약 알림 — 문의/예약 관련 알림 목록
export default async function NotificationsPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/notifications");

  const [items, acceptedItems] = await Promise.all([
    listMyNotifications(),
    listMyAcceptedInquiries(),
  ]);
  const hasUnread = items.some((n) => !n.read_at);

  return (
    <main className="mx-auto max-w-2xl px-4 sm:px-6 py-8 font-kr">
      <MarkReadOnMount hasUnread={hasUnread} />
      <NotificationsList items={items} acceptedItems={acceptedItems} />
    </main>
  );
}
