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
import { GuideImagesButton } from "./GuideImagesButton";
import { fetchGuideImages } from "@/lib/guide-images";
import { photographerHasKb, resolveGreeting } from "@/lib/bot-kb-db";
import { listOpenQuestions } from "@/lib/bot-handoff";
import { fetchBotSettings } from "@/lib/bot-settings";
import { getPlatformAccount, hasAccount } from "@/lib/platform-account";
import { normalizeBookingFields } from "@/lib/booking-fields";
import { seedQaGreetingIfMissing } from "@/lib/inquiry-bot-room";
import { createAdminClient } from "@/lib/supabase/admin";

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

  const amCustomer = conv.user_id === me.id; // 내가 고객(예약 제안 측)
  // 상담(Q&A) 모드 — 작가 KB 가 등록돼 있으면 봇은 수집이 아니라 답변을 한다.
  const [qaMode, botSettings, guideImages] = await Promise.all([
    photographerHasKb(conv.photographer_id),
    fetchBotSettings(),
    // 촬영 안내 이미지 — 손님에게만 (작가는 자기가 올린 자료라 헤더가 붐빌 이유가 없다)
    amCustomer ? fetchGuideImages(conv.photographer_id) : Promise.resolve([]),
  ]);

  // 숨고형 폼(/inquiry)으로 만들어진 방에는 봇 발화가 하나도 없다(방 생성 + 요약 카드뿐).
  // 그 방에서도 작가가 오기 전까지는 봇이 응대해야 하므로 인사 한 줄을 여기서 깐다.
  // 메시지를 읽기 **전에** 넣어야 이번 렌더에 바로 보인다. (봇 발화가 있으면 no-op)
  if (amCustomer && qaMode && conv.bot_disabled_at == null && conv.photographer?.profile_id) {
    await seedQaGreetingIfMissing({
      conversationId,
      photographerProfileId: conv.photographer.profile_id,
      photographerName: conv.photographer.display_name ?? "작가",
      greeting: await resolveGreeting(conv.photographer_id, conv.photographer.display_name ?? "작가"),
    });
  }

  const [messages, brief] = await Promise.all([
    getMessages(conversationId),
    getBrief(conversationId),
  ]);
  const title = counterpartName(conv, me);
  const titleAvatar = counterpartAvatar(conv, me);
  // 작가가 채팅을 한 번이라도 보냈는지 (참여자는 둘뿐 → 고객 외 발신=작가)
  // 예약 제안 노출 조건 — 작가는 항상, 고객은 작가가 실제로 대화를 이어받은 뒤에만
  const photographerHasMessaged = messages.some(
    (m) => (m.type === "text" || m.type === "image") && m.sender_id !== conv.user_id
  );

  // 봇 정지 판정 — conversations.bot_disabled_at 이 진실(단방향). 이력 파생은 구방 폴백.
  const photographerIntervened =
    conv.bot_disabled_at != null ||
    messages.some((m) => (m.type === "text" || m.type === "image") && m.sender_id !== conv.user_id);
  // 봇이 이 방에서 응대할 것인가 — 작가가 이어받기 전까지는 언제나 그렇다.
  // 봇은 묻지 않고 답만 하므로 '접수 완료' 여부와 무관하다 (수집 모드 폐지).
  // KB 가 없는 작가여도 봇은 응대한다 — 답하는 대신 "작가님께 전달드릴게요" 로 받는다.
  const botMode =
    amCustomer && !photographerIntervened
      ? { slots: conv.bot_slots ?? null, intervened: false, qa: true }
      : null;

  // 입금 안내에 쓸 사매 계좌 — 손님에게 결제가 걸린 방에서만 미리 실어 보낸다.
  // 클라이언트에서 뒤늦게 불러오면 다이얼로그가 열리자마자 "계좌 불러오는 중…" 이 깜빡인다.
  // (아무 방에나 계좌를 싣지 않는다는 원칙은 이 조건으로 지킨다)
  const needsAccount =
    amCustomer &&
    messages.some(
      (m) =>
        m.booking &&
        (m.booking.status === "requested" ||
          (m.booking.status === "accepted" && !m.booking.transfer_marked_at))
    );
  const platformAccount = needsAccount ? await getPlatformAccount() : null;
  const payoutAccount =
    platformAccount && hasAccount(platformAccount)
      ? { bank: platformAccount.bank, number: platformAccount.number, holder: platformAccount.holder }
      : null;

  // 작가에게만 — 봇이 답하지 못하고 넘긴 질문 (방에 들어오면 무엇에 답해야 하는지 보인다)
  const openQuestions = amCustomer ? [] : await listOpenQuestions(createAdminClient(), conversationId);

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
        .select("travel_fee_krw, booking_fields")
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
      travelFeeKrw: phRes.data?.travel_fee_krw ?? 0,
      bookingFields: normalizeBookingFields(phRes.data?.booking_fields).fields,
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
            {/* 촬영 안내 — 상시. 예약 제안 왼쪽(정보 → 행동 순) */}
            <GuideImagesButton images={guideImages} />
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
          // 봇/작가를 아바타로 구분 — 참여자는 둘뿐이라 '내 것이 아닌' 말풍선의 주인은
          // 봇(type='bot') 이거나 상대(작가/고객) 둘 중 하나다.
          customerId={conv.user_id}
          counterpartName={title}
          counterpartAvatar={titleAvatar}
          botDisabled={conv.bot_disabled_at != null}
          openQuestions={openQuestions}
          guideImages={guideImages}
          payoutAccount={payoutAccount}
          botName={botSettings.messages.botName}
          handoffNotice={botSettings.messages.handoff}
        />
      </div>
    </main>
  );
}
