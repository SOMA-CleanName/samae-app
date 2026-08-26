import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getConversation, getMessages, counterpartName, counterpartAvatar, getBrief } from "@/lib/chat";
import { createClient } from "@/lib/supabase/server";
import { fetchPhotographerPackages, fetchPhotographerPhotos } from "@/lib/discovery";
import { getRules, getBlocks, getBusyRanges } from "@/lib/availability";
import { ChatRoom } from "./ChatRoom";
import type { ComposerData } from "./BookingComposer";
import { Avatar } from "@/components/ui";
import { BackButton } from "./BackButton";
import { ProposeBookingButton } from "./ProposeBookingButton";

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
  const titleAvatar = counterpartAvatar(conv, me);
  const amCustomer = conv.user_id === me.id; // 내가 고객(예약 제안 측)
  // 작가가 채팅을 한 번이라도 보냈는지 (참여자는 둘뿐 → 고객 외 발신=작가)
  // 예약 제안 노출 조건 — 작가는 항상, 고객은 작가가 실제로 대화를 이어받은 뒤에만
  const photographerHasMessaged = messages.some(
    (m) => (m.type === "text" || m.type === "image") && m.sender_id !== conv.user_id
  );

  // 채팅방 상주 봇 — 봇으로 시작한 방이 아직 접수 전이면, 고객의 발화를 이 방 안에서
  // 봇이 받는다 (작가 개입 시 봇은 조용한 추출로 전환 — 서버 액션이 판단).
  const startedWithBot = conv.bot_photo_id != null || conv.bot_slots != null;
  const inquirySubmitted = messages.some((m) => m.type === "summary_card");
  const photographerIntervened = messages.some(
    (m) => (m.type === "text" || m.type === "image") && m.sender_id !== conv.user_id
  );
  const botMode =
    amCustomer && startedWithBot && !inquirySubmitted
      ? { slots: conv.bot_slots ?? null, intervened: photographerIntervened }
      : null;

  // 작가 수취 계좌는 여기서 미리 내려보내지 않는다 — 수락(accepted) 이후 송금 카드에서
  // getBookingPayoutAccount 서버액션으로 지연 로딩(채팅 진입만으로 계좌가 응답에 실리는 것 방지).

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
        .select("booking_note, travel_fee_krw, travel_fee_note")
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
      travelFeeNote: phRes.data?.travel_fee_note ?? null,
    };
  }

  // 헤더 아바타/이름 — 고객이면 작가 프로필로 이동(별도 '작가 프로필' 링크 흡수)
  const headerHref = amCustomer && conv.photographer ? `/photographers/${conv.photographer_id}` : null;

  return (
    <main className="font-kr">
      {/* 뷰포트 전체를 채우는 고정 높이 컬럼 — 채팅방은 모바일 하단 탭바가 숨겨지므로(몰입형)
          풀 dvh를 쓰고, 부모 pb-24만 상쇄. 내부에서 메시지 리스트만 스크롤 → 진입 시 윈도우가 통째로 밀리지 않음 */}
      <div className="mx-auto flex h-dvh max-w-2xl flex-col -mb-24 md:mb-0">
        <header className="flex shrink-0 items-center gap-2 border-b border-line px-2 py-2 sm:px-3">
          <BackButton />

          {/* 아바타 + 이름 (고객이면 작가 프로필로 이동) */}
          {headerHref ? (
            <Link href={headerHref} className="flex min-w-0 items-center gap-2.5">
              <Avatar src={titleAvatar} name={title} size="sm" />
              <span className="truncate text-title font-semibold">{title}</span>
            </Link>
          ) : (
            <span className="flex min-w-0 items-center gap-2.5">
              <Avatar src={titleAvatar} name={title} size="sm" />
              <span className="truncate text-title font-semibold">{title}</span>
            </span>
          )}

          {/* 예약 제안 (에스크로 플로우의 시작) — 상담정보 작성/열람은 요약 카드가 대체해 제거 */}
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {composerData && (!amCustomer || photographerHasMessaged) && (
              <ProposeBookingButton data={composerData} />
            )}
          </div>
        </header>

        <ChatRoom
          conversationId={conversationId}
          meId={me.id}
          amPhotographer={!amCustomer}
          initialMessages={messages}
          composerData={composerData}
          portfolioPhotos={portfolioPhotos}
          brief={brief}
          sourcePhotoPath={conv.source_photo_path}
          // 작가에게만 — 봇 수집 현황 체크리스트 (고객 화면에는 봇 대화가 곧 그 정보)
          initialBotSlots={!amCustomer ? conv.bot_slots ?? null : null}
          botMode={botMode}
        />
      </div>
    </main>
  );
}
