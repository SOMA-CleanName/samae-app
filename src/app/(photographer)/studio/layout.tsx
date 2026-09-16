import { getCurrentUser } from "@/lib/auth";
import { fetchUnreadTotalForPhotographer } from "@/lib/chat";
import { createClient } from "@/lib/supabase/server";
import { hasCurrentPhotographerAgreement } from "@/lib/consent";
import type { BusinessType } from "@/lib/platform-fee";
import { RealtimeListRefresh } from "@/components/user/RealtimeListRefresh";
import { ChatToast } from "@/components/user/ChatToast";
import { StudioSidebar } from "./StudioSidebar";
import { AgreeGate } from "./AgreeGate";

// 작가 스튜디오 공통 레이아웃 — 승인된 작가에게만 좌측 네비를 씌운다.
// 미신청·승인대기·반려 등은 사이드바 없이 페이지(상태 카드)만 그대로 노출.
//
// 승인은 됐지만 현재 버전의 입점 계약에 동의하지 않았으면 어느 스튜디오 페이지로 들어와도
// 동의 화면을 대신 그린다 (작가약관 5조 2항 — 동의한 때부터 활동할 수 있다).
// 리다이렉트가 아니라 children 자리를 바꾸는 방식이라 별도 라우트·미들웨어가 필요 없다.
export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentUser();

  if (!me?.photographer || me.photographer.status !== "approved") {
    return <>{children}</>;
  }

  const supabase = await createClient();
  const agreed = await hasCurrentPhotographerAgreement(supabase, me.photographer.id);
  if (!agreed) {
    const [{ data: ph }, { data: prior }] = await Promise.all([
      supabase
        .from("photographers")
        .select("legal_name, business_type, business_no, promo_consent")
        .eq("id", me.photographer.id)
        .maybeSingle(),
      supabase
        .from("photographer_agreements")
        .select("id")
        .eq("photographer_id", me.photographer.id)
        .limit(1),
    ]);
    return (
      <AgreeGate
        displayName={me.photographer.displayName}
        initial={{
          legalName: ph?.legal_name ?? "",
          businessType: (ph?.business_type as BusinessType | null) ?? "",
          businessNo: ph?.business_no ?? "",
          promoConsent: !!ph?.promo_consent,
        }}
        reason={(prior?.length ?? 0) > 0 ? "updated" : "first"}
      />
    );
  }

  // 채팅 안읽음 — 어느 탭에 있든 답장이 왔다는 걸 알아야 한다.
  // 고객은 답이 늦으면 그냥 다른 작가에게 간다.
  const chatUnread = await fetchUnreadTotalForPhotographer(me.photographer.id);

  return (
    <div className="md:pl-52">
      {/* 새 메시지가 오면 배지를 다시 그린다 — 스튜디오에는 (user) 레이아웃의 구독이 없다 */}
      <RealtimeListRefresh />
      {/* 스튜디오 어느 탭에 있든 새 문의가 오면 바로 보인다 */}
      <ChatToast meId={me.id} />
      <StudioSidebar chatUnread={chatUnread} />
      {children}
    </div>
  );
}
