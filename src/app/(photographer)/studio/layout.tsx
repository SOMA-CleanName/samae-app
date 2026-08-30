import { getCurrentUser } from "@/lib/auth";
import { fetchUnreadTotalForPhotographer } from "@/lib/chat";
import { RealtimeListRefresh } from "@/components/user/RealtimeListRefresh";
import { StudioSidebar } from "./StudioSidebar";

// 작가 스튜디오 공통 레이아웃 — 승인된 작가에게만 좌측 네비를 씌운다.
// 미신청·승인대기·반려 등은 사이드바 없이 페이지(상태 카드)만 그대로 노출.
export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentUser();

  if (!me?.photographer || me.photographer.status !== "approved") {
    return <>{children}</>;
  }

  // 채팅 안읽음 — 어느 탭에 있든 답장이 왔다는 걸 알아야 한다.
  // 고객은 답이 늦으면 그냥 다른 작가에게 간다.
  const chatUnread = await fetchUnreadTotalForPhotographer(me.photographer.id);

  return (
    <div className="md:pl-52">
      {/* 새 메시지가 오면 배지를 다시 그린다 — 스튜디오에는 (user) 레이아웃의 구독이 없다 */}
      <RealtimeListRefresh />
      <StudioSidebar chatUnread={chatUnread} />
      {children}
    </div>
  );
}
