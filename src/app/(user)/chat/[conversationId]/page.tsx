import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getConversation, getMessages, counterpartName, getBrief } from "@/lib/chat";
import { createClient } from "@/lib/supabase/server";
import { fetchPhotographerPackages } from "@/lib/discovery";
import { getRules, getBlocks, getBusyRanges } from "@/lib/availability";
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

  // 고객이면 예약 작성기 자료 준비 (패키지·가능시간·안내문·출장비)
  let composerData: ComposerData | null = null;
  if (amCustomer) {
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
          {/* 예약 제안 — 고객만(헤더에서 바로 작성) */}
          {composerData && <ProposeBookingButton data={composerData} />}
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
              프로필
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
      />
    </main>
  );
}
