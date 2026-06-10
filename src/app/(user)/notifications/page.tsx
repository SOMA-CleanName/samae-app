import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listMyNotifications } from "@/lib/notifications";
import { MarkReadOnMount } from "./MarkReadOnMount";

export const dynamic = "force-dynamic";

// 상대 시각 표기 (방금/N분 전/N시간 전/날짜)
function ago(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    timeZone: "Asia/Seoul",
  }).format(new Date(iso));
}

// 알림 센터 — 예약·결제 등 비채팅 알림 목록
export default async function NotificationsPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/notifications");

  const items = await listMyNotifications();
  const hasUnread = items.some((n) => !n.read_at);

  return (
    <main className="mx-auto max-w-2xl px-4 sm:px-6 py-8 font-kr">
      <MarkReadOnMount hasUnread={hasUnread} />
      <h1 className="text-2xl font-semibold">알림</h1>

      {items.length === 0 ? (
        <p className="mt-10 text-center text-sm text-fg/45">아직 알림이 없어요.</p>
      ) : (
        <ul className="mt-5 divide-y divide-fg/8">
          {items.map((n) => {
            const inner = (
              <div className={`flex items-start gap-3 py-3 ${n.read_at ? "" : "bg-brand/[0.03]"}`}>
                {/* 안읽음 점 */}
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    n.read_at ? "bg-transparent" : "bg-brand"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{n.title}</p>
                  {n.body && <p className="mt-0.5 truncate text-sm text-fg/60">{n.body}</p>}
                </div>
                <span className="shrink-0 text-xs text-fg/40">{ago(n.created_at)}</span>
              </div>
            );
            return (
              <li key={n.id}>
                {n.link ? (
                  <Link href={n.link} className="block hover:bg-fg/[0.02]">
                    {inner}
                  </Link>
                ) : (
                  inner
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
