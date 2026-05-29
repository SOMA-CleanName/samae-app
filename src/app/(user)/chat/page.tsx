import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listConversations, counterpartName, myUnread } from "@/lib/chat";

export const dynamic = "force-dynamic";

function when(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(new Date(iso));
}

// 채팅 목록
export default async function ChatListPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/chat");

  const convs = await listConversations();

  return (
    <main className="mx-auto max-w-2xl px-4 sm:px-6 py-8 font-kr">
      <h1 className="text-2xl font-semibold">채팅</h1>
      {convs.length === 0 ? (
        <p className="mt-10 text-center text-sm text-fg/45">
          아직 대화가 없어요. 작가 프로필에서 채팅을 시작해보세요.
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-fg/8">
          {convs.map((c) => {
            const unread = myUnread(c, me);
            return (
              <li key={c.id}>
                <Link
                  href={`/chat/${c.id}`}
                  className="flex items-center justify-between gap-3 py-3 hover:bg-fg/[0.02]"
                >
                  <span className="font-medium">{counterpartName(c, me)}</span>
                  <span className="flex items-center gap-2 text-xs text-fg/45">
                    {when(c.last_message_at)}
                    {unread > 0 && (
                      <span className="rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        {unread}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
