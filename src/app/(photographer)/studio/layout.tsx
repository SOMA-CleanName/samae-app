import { getCurrentUser } from "@/lib/auth";
import { countPhotographerUnread } from "@/lib/chat";
import { StudioSidebar } from "./StudioSidebar";

// 작가 스튜디오 공통 레이아웃 — 승인된 작가에게만 좌측 네비를 씌운다.
// 미신청·승인대기·반려 등은 사이드바 없이 페이지(상태 카드)만 그대로 노출.
export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentUser();

  if (!me?.photographer || me.photographer.status !== "approved") {
    return <>{children}</>;
  }

  const unread = await countPhotographerUnread(me.photographer.id);

  return (
    <div className="md:pl-52">
      <StudioSidebar unread={unread} />
      {children}
    </div>
  );
}
