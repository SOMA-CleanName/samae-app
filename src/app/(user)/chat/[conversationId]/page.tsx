import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getConversation, getMessages, counterpartName } from "@/lib/chat";
import { ChatRoom } from "./ChatRoom";

// 채팅방
export default async function ChatRoomPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const me = await getCurrentUser();
  if (!me) redirect(`/login?next=/chat/${conversationId}`);

  const conv = await getConversation(conversationId);
  if (!conv) notFound(); // RLS상 참여자 아니면 조회 안 됨 → 404

  const messages = await getMessages(conversationId);
  const title = counterpartName(conv, me);

  return (
    <main className="mx-auto flex max-w-2xl flex-col px-4 sm:px-6 font-kr">
      <header className="flex items-center gap-3 border-b border-fg/8 py-3">
        <Link href="/chat" className="text-sm text-fg/50 hover:text-fg">
          ←
        </Link>
        <h1 className="text-base font-semibold">{title}</h1>
        {conv.user_id === me.id && conv.photographer && (
          <Link
            href={`/photographers/${conv.photographer.handle}`}
            className="ml-auto text-xs text-fg/50 hover:text-fg"
          >
            프로필 보기
          </Link>
        )}
      </header>

      <ChatRoom conversationId={conversationId} meId={me.id} initialMessages={messages} />
    </main>
  );
}
