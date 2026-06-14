import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listChatRooms } from "@/lib/chat";
import { EmptyState } from "@/components/ui";
import { ChatIcon } from "@/components/user/icons";
import { ChatRoomRow } from "@/app/(user)/chat/page";

export const dynamic = "force-dynamic";

// 스튜디오 문의함 — 작가가 받은 대화 목록 (스튜디오 크롬 유지). 방은 /chat/[id] 공유.
export default async function StudioChatPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/studio/chat");
  if (!me.photographer) redirect("/studio");

  const rooms = await listChatRooms(me);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 font-kr sm:px-6">
      <h1 className="text-h1 font-semibold">문의</h1>
      <p className="mt-1 text-body-sm text-muted">고객과의 상담·예약 대화예요.</p>

      {rooms.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon={<ChatIcon className="h-7 w-7" />}
          title="아직 받은 문의가 없어요"
          description="고객이 채팅을 시작하면 여기에 표시돼요."
        />
      ) : (
        <ul className="mt-5 divide-y divide-line">
          {rooms.map((c) => (
            <ChatRoomRow key={c.id} room={c} me={me} />
          ))}
        </ul>
      )}
    </main>
  );
}
