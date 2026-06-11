import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getConversation, getMessages, counterpartName, getBrief } from "@/lib/chat";
import { createClient } from "@/lib/supabase/server";
import { fetchPhotographerPackages, fetchPhotographerPhotos } from "@/lib/discovery";
import { getRules, getBlocks, getBusyRanges } from "@/lib/availability";
import { getPhotographerPayoutAccount, type PayoutAccount } from "@/lib/payments";
import { ChatRoom } from "./ChatRoom";
import { BriefPanel } from "./BriefPanel";
import { BriefBanner } from "./BriefBanner";
import { ProposeBookingButton } from "./ProposeBookingButton";
import type { ComposerData } from "./BookingComposer";

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

  const [messages, brief] = await Promise.all([
    getMessages(conversationId),
    getBrief(conversationId),
  ]);
  const title = counterpartName(conv, me);
  const amCustomer = conv.user_id === me.id; // 내가 고객(예약 제안 측)

  // 고객이면 작가 수취 계좌 미리 준비 (수락 후 채팅 송금 카드에서 즉시 노출).
  // 채팅방 진입 = RLS로 참여 확인됨 → admin 조회 게이트 충족.
  const payoutAccount: PayoutAccount | null = amCustomer
    ? await getPhotographerPayoutAccount(conv.photographer_id)
    : null;

  // 포트폴리오 사진 — 채팅에서 작가 포트폴리오에서 골라 보내기(C5)
  const portfolioPhotos = (await fetchPhotographerPhotos(conv.photographer_id)).map((p) => ({
    id: p.id as string,
    thumb_url: (p.thumb_url ?? p.src_url) as string,
    src_url: p.src_url as string,
  }));

  // 예약 작성기 자료 준비 (패키지·가능시간·안내문·출장비) — 구매자·작가 양측 제안 가능
  let composerData: ComposerData | null = null;
  {
    const supabase = await createClient();
    const [packages, rules, blocks, busy, phRes] = await Promise.all([
      fetchPhotographerPackages(conv.photographer_id),
      getRules(conv.photographer_id),
      getBlocks(conv.photographer_id),
      getBusyRanges(conv.photographer_id),
      supabase
        .from("photographers")
        .select("booking_note, travel_fee_krw")
        .eq("id", conv.photographer_id)
        .single(),
    ]);
    composerData = {
      conversationId,
      photographerId: conv.photographer_id,
      packages: packages.map((p) => ({
        id: p.id,
        name: p.name,
        price_krw: p.price_krw,
        duration_min: p.duration_min,
      })),
      rules,
      blocks,
      busy,
      bookingNote: phRes.data?.booking_note ?? null,
      travelFeeKrw: phRes.data?.travel_fee_krw ?? 0,
    };
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col px-4 font-kr sm:px-6">
      <header className="flex items-center gap-3 border-b border-fg/8 py-3">
        <Link href="/chat" className="text-sm text-fg/50 hover:text-fg">
          ←
        </Link>
        <h1 className="text-base font-semibold">{title}</h1>
        <div className="ml-auto flex items-center gap-3">
          {/* 예약 제안 — 작가는 항상, 고객은 첫 채팅(메시지) 이후에만 노출 */}
          {composerData && (!amCustomer || messages.length > 0) && (
            <ProposeBookingButton data={composerData} />
          )}
          {/* 상담 정보 — 고객은 작성/수정, 작가는 열람(수시로) */}
          <BriefPanel
            conversationId={conversationId}
            amCustomer={amCustomer}
            initialBrief={brief}
          />
          {amCustomer && conv.photographer && (
            <Link
              href={`/photographers/${conv.photographer_id}`}
              className="text-xs text-fg/50 hover:text-fg"
            >
              작가 프로필
            </Link>
          )}
        </div>
      </header>

      {/* 상담 정보 미작성 고객 — 인라인 권유 배너(자동 모달 대체) */}
      {amCustomer && !brief && <BriefBanner />}

      <ChatRoom
        conversationId={conversationId}
        meId={me.id}
        amPhotographer={!amCustomer}
        initialMessages={messages}
        composerData={composerData}
        payoutAccount={payoutAccount}
        portfolioPhotos={portfolioPhotos}
      />
    </main>
  );
}
