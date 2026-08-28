"use client";

/* eslint-disable @next/next/no-img-element */
import { Fragment, useEffect, useRef, useState, useTransition, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { sendMessage, markRead, sendPortfolioPhoto, getBookingPayoutAccount } from "../actions";
import { sendBotTurn } from "../bot-actions";
import { KB_EXAMPLE_QUESTIONS } from "@/lib/bot-kb";
import { BOT_DISPLAY_NAME, BOT_HANDOFF_NOTICE } from "@/lib/bot-identity";
import { acceptBooking, rejectBooking, cancelBooking } from "@/app/actions/bookings";
import { markTransferSent, markShot } from "@/app/actions/payments";
import { mpTrack } from "@/lib/mixpanel";
import type { ChatMessage, BookingSnapshot, ConsultationBrief, BotSlots } from "@/lib/chat";
import { bookingStatusLabel, type BookingStatus } from "@/lib/booking-status";
import type { PayoutAccount } from "@/lib/payments";
import { DeliveryUploader } from "@/app/(user)/bookings/[id]/DeliveryUploader";
import {
  BookingComposer,
  type ComposerData,
  type BookingEditTarget,
  type BookingDraft,
} from "./BookingComposer";
import { Spinner, Avatar } from "@/components/ui";
import { GuideImagesButton } from "./GuideImagesButton";
import { AcceptPayDialog } from "./AcceptPayDialog";
import { PolicyNote } from "./PolicyNote";
import { SupportButton } from "./SupportButton";
import type { GuideImage } from "@/lib/guide-images";
import { readStoredFieldValues } from "@/lib/booking-fields";
import {
  PlusIcon,
  SendIcon,
  ImageIcon,
  LayersIcon,
  CheckIcon,
  ClipboardIcon,
  CalendarIcon,
  MapPinIcon,
  CameraIcon,
  WalletIcon,
  XIcon,
} from "@/components/user/icons";

const fmt = new Intl.NumberFormat("ko-KR");

const BOOKING_COLS =
  "id, status, shoot_at, shoot_date, location_text, amount_krw, travel_fee_krw, package_snapshot, package_id, memo, custom_fields, transfer_marked_at, proposed_by_photographer, settled_at, settlement_amount_krw, settlement_ack_at, settlement_dispute_at";

// 메시지 작성 시각 (카카오톡식 HH:MM)
function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export type PortfolioPhoto = { id: string; thumb_url: string; src_url: string };

export function ChatRoom({
  conversationId,
  meId,
  amPhotographer,
  initialMessages,
  composerData,
  portfolioPhotos,
  brief,
  sourcePhotoPath,
  initialBotSlots,
  botMode,
  customerId,
  counterpartName,
  counterpartAvatar,
  botDisabled,
  openQuestions,
  guideImages,
  payoutAccount,
  botName,
  handoffNotice,
}: {
  conversationId: string;
  meId: string;
  amPhotographer: boolean;
  initialMessages: ChatMessage[];
  composerData: ComposerData | null;
  portfolioPhotos: PortfolioPhoto[];
  brief: ConsultationBrief | null;
  sourcePhotoPath: string | null;
  /** 봇 수집 슬롯 — 작가용 문의 체크리스트 (고객 화면은 null) */
  initialBotSlots?: BotSlots | null;
  /** 고객용 — 채팅방 상주 봇 활성 (미접수 봇 문의): 발화가 sendBotTurn 으로 라우팅된다 */
  botMode?: { slots: BotSlots | null; intervened: boolean; qa?: boolean } | null;
  /** 이 방의 고객(conversations.user_id) — 봇 발화와 고객 발화를 가르는 기준 */
  customerId: string;
  /** 상대(작가 또는 고객) 표시 정보 — 봇 말풍선과 아바타로 구분하기 위해 필요 */
  counterpartName?: string;
  counterpartAvatar?: string | null;
  /** 작가가 이미 이어받은 방 — 봇은 다시 발화하지 않는다 */
  botDisabled?: boolean;
  /** 작가에게만 — 봇이 답하지 못하고 넘긴 질문 */
  openQuestions?: { id: string; question: string; created_at: string }[];
  /** 작가 촬영 안내 이미지 — 봇 첫 인사 아래에 여는 버튼을 단다 (손님 화면만) */
  guideImages?: GuideImage[];
  /** 사매 입금 계좌 — 결제가 걸린 방에서만 서버가 미리 실어 보낸다 (없으면 필요할 때 조회) */
  payoutAccount?: PayoutAccount | null;
  /** 봇 표시 이름 — 운영이 어드민에서 바꾼다 (없으면 코드 기본) */
  botName?: string;
  /** 현재 인계 안내 문구 — 이 말풍선만 다르게 그린다 (문구가 바뀌어도 옛 방이 깨지지 않게 코드 상수도 함께 본다) */
  handoffNotice?: string;
}) {
  const amCustomer = !amPhotographer; // 참여자 중 작가가 아니면 구매자
  const botLabel = (botName ?? "").trim() || BOT_DISPLAY_NAME;
  // 인계 안내 판별 — 운영이 문구를 바꿔도, 바꾸기 전에 쌓인 방도 그대로 인식돼야 한다
  const isHandoffBody = (body: string) =>
    body === BOT_HANDOFF_NOTICE || (!!handoffNotice && body === handoffNotice);
  void brief; void sourcePhotoPath; // 레거시 상담정보 — 요약 카드로 대체, 과거 방 호환 위해 프롭만 유지
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [botSlots, setBotSlots] = useState<BotSlots | null>(initialBotSlots ?? null);
  // 채팅방 상주 봇 — 고객 발화를 이 방 안에서 봇이 받는다 (칩·타이핑·완료 상태)
  const [botChips, setBotChips] = useState<string[]>(
    // 봇은 묻지 않는다 — 칩은 '손님이 물어볼 만한 것' 예시다(수집 선택지가 아니다)
    botMode && !botMode.intervened ? KB_EXAMPLE_QUESTIONS : []
  );
  const [botTyping, setBotTyping] = useState(false);
  const [botDone, setBotDone] = useState(false);
  const [botNeedContact, setBotNeedContact] = useState(false);
  // 작가가 이어받았으면(botDisabled) 봇은 다시 켜지지 않는다 — 칩·라우팅 모두 죽는다
  const botActive = !!botMode && !botDone && !botDisabled;
  // 입금 안내 — 수락 직후, 그리고 입금 전 방에 다시 들어왔을 때 (고객만)
  const [payFor, setPayFor] = useState<BookingSnapshot | null>(null); // 수락 직후 즉시
  const [payDismissed, setPayDismissed] = useState(false); // 이번 방문에서 닫음

  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false); // 입력창 + 옵션 메뉴
  const [pickerOpen, setPickerOpen] = useState(false); // 포트폴리오 사진 고르기 모달
  // 예약 작성기 — null이면 닫힘, {} 신규, {edit} 수정, {draft} 요약 기반 프리필
  const [composer, setComposer] = useState<null | {
    edit: BookingEditTarget | null;
    draft?: BookingDraft | null;
  }>(null);
  const [, startTransition] = useTransition();
  const sendingRef = useRef(false); // 전송 중 재진입 잠금 (엔터 연타)
  const listRef = useRef<HTMLDivElement>(null);
  const firstScroll = useRef(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);

  // 안읽음 초기화
  useEffect(() => {
    markRead(conversationId);
  }, [conversationId]);

  // 대화방 진입 — 방마다 1회 (채팅 engagement)
  useEffect(() => {
    mpTrack("Open Chat", {
      conversation_id: conversationId,
      role: amPhotographer ? "photographer" : "customer",
    });
  }, [conversationId, amPhotographer]);

  // 입금 대기 중인 예약 — 수락됐지만 아직 [입금 완료]를 누르지 않은 건.
  // 상태에서 파생하므로 방에 들어올 때마다 자동으로 뜬다. 수락하고 나갔다가
  // 돌아온 손님이 '뭘 해야 하지' 를 다시 찾지 않게 — 이 방의 다음 행동은 입금뿐이다.
  // 입금 완료를 누르면 transfer_marked_at 이 차서 조건이 풀린다.
  const pendingPay = useMemo(() => {
    if (!amCustomer || payDismissed) return null;
    for (let i = messages.length - 1; i >= 0; i--) {
      const b = messages[i].booking;
      if (b && b.status === "accepted" && !b.transfer_marked_at) return b;
    }
    return null;
  }, [amCustomer, payDismissed, messages]);

  const payDialogFor = payFor ?? pendingPay;

  // 예약 작성기 열기 — 예약 제안 직전 이탈지점. 열릴 때(신규/수정)만.
  useEffect(() => {
    if (!composer) return;
    mpTrack("Open Booking Composer", {
      conversation_id: conversationId,
      is_edit: !!composer.edit,
      role: amPhotographer ? "photographer" : "customer",
    });
  }, [composer, conversationId, amPhotographer]);

  // Realtime 구독 — 새 메시지 수신 (예약 메시지는 booking 스냅샷 보강)
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) supabase.realtime.setAuth(data.session.access_token);

      channel = supabase
        .channel(`messages:${conversationId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `conversation_id=eq.${conversationId}`,
          },
          async (payload) => {
            const m = payload.new as ChatMessage;
            // 예약 메시지면 booking 스냅샷을 별도 조회해 붙임 (realtime payload엔 join 없음)
            if (m.booking_id && !m.booking) {
              const { data: bk } = await supabase
                .from("bookings")
                .select(BOOKING_COLS)
                .eq("id", m.booking_id)
                .maybeSingle();
              m.booking = (bk as unknown as BookingSnapshot) ?? null;
            }
            setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
            if (m.sender_id !== meId) markRead(conversationId);
            // 작가가 실발화로 개입 — 봇 칩은 접는다 (봇은 서버에서 조용한 추출로 전환됨)
            if ((m.type === "text" || m.type === "image") && m.sender_id !== meId) {
              setBotChips((prev) => (prev.length > 0 ? [] : prev));
            }
          }
        )
        // 봇 수집 슬롯 갱신 → 작가용 문의 체크리스트 실시간 반영
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "conversations",
            filter: `id=eq.${conversationId}`,
          },
          (payload) => {
            const c = payload.new as { bot_slots?: BotSlots | null };
            if (c.bot_slots !== undefined) setBotSlots(c.bot_slots ?? null);
          }
        )
        // 예약 상태 변경(수락/거절/취소/송금 등) → 해당 booking_id 카드 스냅샷 갱신
        // RLS가 당사자 예약만 흘려보내므로 별도 row 필터 없이 id로 매칭한다.
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "bookings" },
          (payload) => {
            const b = payload.new as BookingSnapshot;
            setMessages((prev) =>
              prev.map((m) =>
                m.booking_id === b.id && m.booking
                  ? { ...m, booking: { ...m.booking, ...b } }
                  : m
              )
            );
          }
        )
        .subscribe((status, err) => {
          // 구독 상태 가시화 — CHANNEL_ERROR/TIMED_OUT 이 조용히 삼켜지지 않게
          if (status !== "SUBSCRIBED")
            console.warn("[chat-realtime]", status, err ? String(err) : "");
          else console.log("[chat-realtime] SUBSCRIBED", conversationId);
        });
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [conversationId, meId]);

  // 새 메시지 시 하단으로 — 내부 리스트만 스크롤(진입 시 윈도우가 통째로 밀리는 현상 방지).
  // 첫 렌더는 즉시(auto), 이후 새 메시지는 부드럽게(smooth).
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: firstScroll.current ? "auto" : "smooth" });
    firstScroll.current = false;
  }, [messages, botTyping]);

  // + 옵션 메뉴 바깥 클릭 시 닫기
  useEffect(() => {
    if (!optionsOpen) return;
    function onDown(e: MouseEvent) {
      if (optionsRef.current && !optionsRef.current.contains(e.target as Node)) {
        setOptionsOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [optionsOpen]);

  const [blockedNotice, setBlockedNotice] = useState<string | null>(null);

  // 봇 턴 전송 — 입력바·칩 공용. 응답 대기 중엔 연타를 막고, 결과로 칩·완료 상태 갱신.
  // (사용자·봇 말풍선은 서버 insert → realtime 으로 그려진다)
  function submitBotTurn(t: string) {
    // botTyping 은 state 라 다음 렌더에서야 참이 된다 — 그 틈의 두 번째 엔터를 ref 로 막는다
    if (botTyping || sendingRef.current) return;
    sendingRef.current = true;
    setBlockedNotice(null);
    setText("");
    setBotChips([]);
    setBotTyping(true);
    startTransition(async () => {
      try {
        const res = await sendBotTurn(conversationId, t);
        if (!res.ok) {
          setBlockedNotice(res.reason);
          setText(t); // 입력 복원 — 문구를 고쳐 다시 보낼 수 있게
          setBotChips(botMode && !botMode.intervened ? KB_EXAMPLE_QUESTIONS : []);
          mpTrack("Chat Message Blocked", { conversation_id: conversationId, role: "customer" });
          return;
        }
        setBotChips(res.quickReplies);
        if (res.needContact) setBotNeedContact(true);
        if (res.done) {
          setBotDone(true);
          mpTrack("Submit Inquiry", {
            conversation_id: conversationId,
            mode: "room-bot",
            source: "chat",
          });
        }
        mpTrack("Send Message", { conversation_id: conversationId, has_image: false, role: "customer", bot: true });
      } finally {
        setBotTyping(false);
        sendingRef.current = false;
      }
    });
  }

  function onSend(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    if (botActive) {
      submitBotTurn(t);
      return;
    }
    // 전송이 끝나기 전에 엔터가 한 번 더 들어오면 같은 문장이 두 번 나간다.
    // 서버 왕복은 수백 ms 라 연타로 충분히 겹친다 — ref 로 즉시 잠근다
    // (state 는 다음 렌더에서야 반영돼 그 사이 두 번째 엔터를 못 막는다).
    if (sendingRef.current) return;
    sendingRef.current = true;

    // 입력은 먼저 비운다. 응답을 기다렸다 비우면 그 사이의 엔터가 같은 텍스트를 다시 읽는다.
    // 차단된 경우에만 되돌려 놓아, 문구를 고쳐 다시 보낼 수 있게 한다.
    setText("");
    setBlockedNotice(null);
    startTransition(async () => {
      try {
        const res = await sendMessage(conversationId, t);
        if (!res.ok) {
          setBlockedNotice(res.reason);
          setText(t);
          mpTrack("Chat Message Blocked", {
            conversation_id: conversationId,
            role: amPhotographer ? "photographer" : "customer",
          });
          return;
        }
        mpTrack("Send Message", {
          conversation_id: conversationId,
          has_image: false,
          role: amPhotographer ? "photographer" : "customer",
        });
      } finally {
        sendingRef.current = false;
      }
    });
  }

  async function onFile(files: FileList | null) {
    if (!files?.[0]) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", files[0]);
    fd.append("conversationId", conversationId);
    const res = await fetch("/api/chat/upload", { method: "POST", body: fd });
    if (res.ok) {
      mpTrack("Send Message", {
        conversation_id: conversationId,
        has_image: true,
        role: amPhotographer ? "photographer" : "customer",
      });
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {payDialogFor && (
        <AcceptPayDialog
          bookingId={payDialogFor.id}
          amountKrw={payDialogFor.amount_krw ?? 0}
          account={payoutAccount ?? null}
          onClose={() => {
            setPayFor(null);
            setPayDismissed(true);
          }}
        />
      )}

      {/* 작가용 문의 체크리스트 — 봇이 수집한 항목의 확인/미확인 현황 (실시간 갱신) */}
      {amPhotographer && botSlots && <InquiryChecklist slots={botSlots} />}
      {amPhotographer && (openQuestions?.length ?? 0) > 0 && (
        <OpenQuestions items={openQuestions!} />
      )}


      {/* 메시지 영역 — 이 컨테이너만 스크롤 */}
      <div
        ref={listRef}
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-4 sm:px-4"
      >
        {/* 레거시 상담정보 카드·빈 방 안내는 제거 — 챗봇의 '문의 내용 정리' 요약 카드가
            타임라인 안에서 같은 역할을 한다 (brief 데이터는 과거 방 호환용으로만 유지) */}
        {(() => {
          // 작가가 봇을 이어받은 지점 — 첫 작가 실발화(text/image) 앞에 구분선을 그린다.
          // 단 봇이 인계를 직접 말한 방(0097 이후)에서는 그 말풍선이 같은 역할을 하므로 생략한다.
          const botAnnouncedHandoff = messages.some((m) => m.type === "bot" && isHandoffBody(m.body));
          // 촬영 안내 버튼은 봇 첫 인사 바로 아래 1회만 — 헤더 아이콘만으로는 발견이 안 된다.
          // (그 자리에서 봇이 "미리 알려주신 내용은 답해드릴게요" 라고 말한 직후라 맥락이 맞다)
          const firstBotMsgId = messages.find(
            (m) => m.type === "bot" && m.sender_id !== customerId && !isHandoffBody(m.body)
          )?.id;
          const firstPhotographerMsgId = botAnnouncedHandoff
            ? undefined
            : messages.find(
                (m) =>
                  (m.type === "text" || m.type === "image") &&
                  (amPhotographer ? m.sender_id === meId : m.sender_id !== meId)
              )?.id;
          return messages.map((m) => {
          const handoffDivider =
            m.id === firstPhotographerMsgId ? (
              <div key={`handoff-${m.id}`} className="flex items-center gap-3 py-1.5">
                <span className="h-px flex-1 bg-line" />
                <span className="rounded-full bg-success-soft px-3 py-1 text-caption font-medium text-success">
                  여기서부터 작가님이 직접 답해요
                </span>
                <span className="h-px flex-1 bg-line" />
              </div>
            ) : null;
          const rendered = (() => {
          // 예약 제안 카드
          if (m.booking_id && m.booking) {
            return (
              <BookingCard
                key={m.id}
                booking={m.booking}
                amPhotographer={amPhotographer}
                amCustomer={amCustomer}
                onOpenDetail={() => router.push(`/bookings/${m.booking!.id}?from=chat`)}
                onNeedPay={() => setPayFor(m.booking!)}
                payoutAccount={payoutAccount ?? null}
                conversationId={conversationId}
                onReuse={
                  composerData
                    ? () => setComposer({ edit: null, draft: draftFromBooking(m.booking!) })
                    : null
                }
                onEdit={
                  // 수락 전에는 제안한 쪽이, 입금이 확인된 뒤에는 작가가 고칠 수 있다.
                  // (권한 판정의 진실은 서버 updateBooking — 여기서는 버튼 노출만)
                  composerData &&
                  (["paid", "shot"].includes(m.booking.status)
                    ? amPhotographer
                    : m.booking.proposed_by_photographer
                    ? amPhotographer
                    : amCustomer)
                    ? () =>
                        setComposer({
                          edit: {
                            id: m.booking!.id,
                            packageId: m.booking!.package_id,
                            shootAt: m.booking!.shoot_at,
                            shootDate: m.booking!.shoot_date,
                            locationText: m.booking!.location_text,
                            memo: m.booking!.memo,
                            amountKrw: m.booking!.amount_krw,
                            travelFeeKrw: m.booking!.travel_fee_krw,
                            amountLocked: ["paid", "shot"].includes(m.booking!.status),
                          },
                        })
                    : null
                }
              />
            );
          }
          const mine = m.sender_id === meId;
          // 시스템 안내는 가운데 정렬 회색 칩
          if (m.type === "system") {
            return (
              <div key={m.id} className="flex justify-center py-1">
                <span className="rounded-full bg-fg/[0.06] px-3 py-1 text-caption text-muted">{m.body}</span>
              </div>
            );
          }
          // 문의 요약 카드 — 챗봇이 수집한 내용의 상주 요약 (body=JSON)
          // 작가에겐 정리된 내용을 그대로 제안서로 옮기는 CTA를 함께 보여준다.
          if (m.type === "summary_card") {
            return (
              <SummaryCardBubble
                key={m.id}
                body={m.body}
                time={timeLabel(m.created_at)}
                onPropose={
                  amPhotographer && composerData
                    ? (draft) => setComposer({ edit: null, draft })
                    : null
                }
              />
            );
          }
          // 챗봇 발화 — 작가 말풍선과 **같아 보이면 안 된다**. 봇 전용 아바타 + 이름을 단다.
          //
          // ⚠️ 봇 판정은 '내 것이 아님'이 아니라 **발신자가 고객이 아님**이다.
          //   · 개입 전 고객 발화도 무알림을 위해 type='bot' 으로 저장된다 → 고객의 말이다
          //   · 봇 발화는 작가 profile_id 로 저장된다 → 작가 화면에서는 sender_id === meId 다
          // meId 로 가르면 작가 화면에서 고객 질문이 '사매 안내봇'으로, 봇 답이 작가 자신의
          // 말풍선으로 뒤집힌다. 두 화면 모두 같은 기준(customerId)을 써야 한다.
          const isBotSpeech = m.type === "bot" && m.sender_id !== customerId;
          if (m.type === "bot" && !isBotSpeech) {
            // 고객이 봇에게 한 말 — 평범한 고객 말풍선으로 (보는 사람에 따라 좌/우)
            return (
              <div key={m.id} className={`flex items-end gap-1.5 ${mine ? "justify-end" : "justify-start"}`}>
                {!mine && (
                  <span className="mb-0.5 shrink-0">
                    <Avatar src={counterpartAvatar ?? null} name={counterpartName ?? ""} size="xs" />
                  </span>
                )}
                {mine && <span className="mb-0.5 shrink-0 text-label text-faint">{timeLabel(m.created_at)}</span>}
                <div
                  className={`max-w-[75%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-body ${
                    mine ? "rounded-br-md bg-fg text-bg" : "rounded-bl-md bg-fg/[0.07] text-fg"
                  }`}
                >
                  {m.body}
                </div>
                {!mine && <span className="mb-0.5 shrink-0 text-label text-faint">{timeLabel(m.created_at)}</span>}
              </div>
            );
          }
          if (isBotSpeech) {
            const isHandoff = isHandoffBody(m.body);
            return (
              <div key={m.id} className="flex items-start gap-2">
                <BotAvatar />
                <div className="flex min-w-0 flex-col items-start">
                  <span className="mb-0.5 text-label font-medium text-muted">{botLabel}</span>
                  <div
                    className={`max-w-full whitespace-pre-wrap break-words rounded-2xl rounded-tl-md px-3.5 py-2 text-body ${
                      isHandoff
                        ? "bg-success-soft text-success ring-1 ring-success/20"
                        : "bg-fg/[0.07] text-fg"
                    }`}
                  >
                    {m.body}
                  </div>
                  <span className="mt-0.5 text-label text-faint">
                    {isHandoff ? timeLabel(m.created_at) : `자동 응답 · ${timeLabel(m.created_at)}`}
                  </span>
                </div>
              </div>
            );
          }
          const isImage = m.type === "image" && m.image_path;
          return (
            <div
              key={m.id}
              className={`flex items-end gap-1.5 ${mine ? "justify-end" : "justify-start"}`}
            >
              {/* 상대(작가) 발화에는 프로필 아바타 — 봇 아바타와 나란히 놓였을 때 다른 객체임이 보인다 */}
              {!mine && (
                <span className="mb-0.5 shrink-0">
                  <Avatar src={counterpartAvatar ?? null} name={counterpartName ?? ""} size="xs" />
                </span>
              )}
              {/* 카카오톡식: 내 메시지는 시간이 왼쪽, 상대 메시지는 오른쪽 */}
              {mine && (
                <span className="mb-0.5 shrink-0 text-label text-faint">
                  {timeLabel(m.created_at)}
                </span>
              )}
              {isImage ? (
                <img
                  src={m.image_path!}
                  alt=""
                  loading="lazy"
                  className="max-h-64 max-w-[75%] rounded-2xl object-cover"
                />
              ) : (
                <div
                  className={`max-w-[75%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-body ${
                    mine ? "rounded-br-md bg-fg text-bg" : "rounded-bl-md bg-fg/[0.07] text-fg"
                  }`}
                >
                  {m.body}
                </div>
              )}
              {!mine && (
                <span className="mb-0.5 shrink-0 text-label text-faint">
                  {timeLabel(m.created_at)}
                </span>
              )}
            </div>
          );
          })();
          return (
            <Fragment key={`w-${m.id}`}>
              {handoffDivider}
              {rendered}
              {m.id === firstBotMsgId && amCustomer && (guideImages?.length ?? 0) > 0 && (
                <div className="pl-8">
                  <GuideImagesButton images={guideImages!} variant="inline" />
                </div>
              )}
            </Fragment>
          );
        });
        })()}

        {/* 봇 응답 대기 — 타이핑 인디케이터 */}
        {botTyping && (
          <div className="flex items-start gap-2">
            <BotAvatar />
            <div className="flex items-center gap-1 rounded-2xl rounded-tl-md bg-fg/[0.07] px-4 py-3">
              {[0, 160, 320].map((d) => (
                <span
                  key={d}
                  className="h-1.5 w-1.5 animate-pulse rounded-full bg-fg/40"
                  style={{ animationDelay: `${d}ms` }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 봇 선택지 칩 — 자유 입력이 주인공, 칩은 보조 (탭하면 그 텍스트가 발화가 된다) */}
      {botActive && !botTyping && botChips.length > 0 && (
        <div
          role="group"
          aria-label="추천 답변 — 탭해도 되고 직접 입력해도 돼요"
          className="flex shrink-0 gap-1.5 overflow-x-auto px-3 pb-1 pt-2 [scrollbar-width:none] sm:px-4 [&::-webkit-scrollbar]:hidden"
        >
          {botChips.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => submitBotTurn(q)}
              className="shrink-0 cursor-pointer whitespace-nowrap rounded-full bg-fg/[0.06] px-3.5 py-2 text-caption font-medium text-fg ring-1 ring-line transition-colors hover:bg-fg/10"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* 수집 완주했는데 프로필 연락처가 없어 접수 보류 — 등록 동선 제공 */}
      {botNeedContact && (
        <div className="mx-3 mb-1.5 rounded-xl bg-warning-soft px-3.5 py-2.5 text-caption text-warning sm:mx-4">
          알림을 받을 연락처가 필요해요.{" "}
          <Link
            href={`/signup/contact?next=/chat/${conversationId}`}
            className="font-semibold underline underline-offset-2"
          >
            전화번호 등록하고 문의 보내기
          </Link>
        </div>
      )}

      {/* 오프플랫폼 유도 차단 안내 — 입력은 유지된 채 문구만 고치게 */}
      {blockedNotice && (
        <div className="mx-3 mb-1.5 flex items-start justify-between gap-2 rounded-xl bg-danger-soft px-3.5 py-2.5 text-caption text-danger sm:mx-4">
          <span>{blockedNotice}</span>
          <button
            type="button"
            onClick={() => setBlockedNotice(null)}
            aria-label="닫기"
            className="shrink-0 cursor-pointer font-semibold underline underline-offset-2"
          >
            닫기
          </button>
        </div>
      )}

      {/* 입력 바 — 하단은 safe-area(홈 인디케이터)만큼만 여유 */}
      <form
        onSubmit={onSend}
        className="flex shrink-0 items-center gap-2 border-t border-line px-3 pt-2.5 sm:px-4"
        style={{ paddingBottom: "calc(0.625rem + env(safe-area-inset-bottom))" }}
      >
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files)} />

        {/* + 옵션 메뉴 — 사진 보내기 등 추가 동작 */}
        <div ref={optionsRef} className="relative shrink-0">
          <button
            type="button"
            disabled={uploading}
            onClick={() => setOptionsOpen((v) => !v)}
            aria-label="추가 옵션"
            aria-expanded={optionsOpen}
            className="grid h-10 w-10 cursor-pointer place-items-center rounded-full bg-fg/[0.06] text-fg/70 transition-colors hover:bg-fg/10 disabled:opacity-50"
          >
            {uploading ? <Spinner className="h-4 w-4" /> : <PlusIcon className="h-5 w-5" />}
          </button>
          {optionsOpen && (
            <div className="absolute bottom-full left-0 mb-2 w-48 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-pop">
              <button
                type="button"
                disabled={uploading}
                onClick={() => {
                  setOptionsOpen(false);
                  fileRef.current?.click();
                }}
                className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left text-body-sm text-fg transition-colors hover:bg-fg/[0.04] disabled:opacity-50"
              >
                <ImageIcon className="h-5 w-5 text-muted" />
                사진 보내기
              </button>
              {portfolioPhotos.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setOptionsOpen(false);
                    setPickerOpen(true);
                  }}
                  className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left text-body-sm text-fg transition-colors hover:bg-fg/[0.04]"
                >
                  <LayersIcon className="h-5 w-5 text-muted" />
                  포트폴리오에서 고르기
                </button>
              )}
              {/* 예약 제안은 헤더의 예약 제안 버튼으로 이동 — 수정은 예약 카드에서 */}
            </div>
          )}
        </div>

        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="메시지"
          className="min-w-0 flex-1 rounded-full border border-line-strong bg-surface px-4 py-2.5 text-body outline-none transition-colors focus:border-fg/40"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          aria-label="전송"
          className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-full bg-fg text-bg transition-opacity hover:opacity-90 disabled:opacity-30"
        >
          <SendIcon className="h-5 w-5" />
        </button>
      </form>

      {/* 예약 작성기 (신규/수정) — 구매자·작가 양측 */}
      {composer && composerData && (
        <BookingComposer
          data={composerData}
          editTarget={composer.edit}
          draft={composer.draft}
          onClose={() => setComposer(null)}
        />
      )}

      {/* 포트폴리오 사진 고르기 모달 */}
      {pickerOpen && (
        <PhotoPicker
          photos={portfolioPhotos}
          onClose={() => setPickerOpen(false)}
          onPick={(photoId) => {
            setPickerOpen(false);
            startTransition(() => {
              sendPortfolioPhoto(conversationId, photoId);
            });
          }}
        />
      )}
    </div>
  );
}

// 작가용 문의 체크리스트 — 봇이 수집한 슬롯 기준으로 "확인됨/미확인"을 한 줄 바에 요약.
// 수집이 덜 됐으면 펼쳐서 시작(무엇을 물어야 할지 바로 보이게), 완료면 접어서 시작.
// 봇 아바타 — 작가 프로필 사진과 겹치지 않도록 사람 얼굴이 아닌 도형으로 간다.
// (작가 아바타는 원형 사진, 봇은 라운드 사각 + 안테나 아이콘 — 실루엣부터 다르다)
function BotAvatar() {
  return (
    <span
      aria-label="안내봇"
      className="mt-5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-brand/15 text-brand ring-1 ring-brand/20"
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 3v3" strokeLinecap="round" />
        <rect x="4" y="6" width="16" height="12" rx="3" />
        <path d="M9 12h.01M15 12h.01" strokeLinecap="round" />
      </svg>
    </span>
  );
}

// 작가에게만 — 봇이 근거가 없어 답하지 못하고 넘긴 질문.
// 이 목록이 있다는 건 "고객이 물었는데 아직 아무도 답을 안 한 것" 이 남아 있다는 뜻이다.
function OpenQuestions({ items }: { items: { id: string; question: string }[] }) {
  return (
    <div className="shrink-0 border-b border-line bg-warning-soft px-3 py-2.5 sm:px-4">
      <p className="text-caption font-semibold text-warning">
        봇이 답하지 못한 질문 {items.length}개 — 작가님 답변이 필요해요
      </p>
      <ul className="mt-1.5 flex flex-col gap-1">
        {items.map((q) => (
          <li key={q.id} className="text-caption text-fg">
            · {q.question}
          </li>
        ))}
      </ul>
    </div>
  );
}

function InquiryChecklist({ slots }: { slots: BotSlots }) {
  const core: { label: string; value: string | undefined }[] = [
    { label: "촬영 종류", value: slots.purpose },
    { label: "희망일", value: slots.preferredDate },
    { label: "지역", value: slots.region },
    { label: "인원", value: slots.partySize },
  ];
  const filledCount = core.filter((c) => c.value).length;
  const missing = core.filter((c) => !c.value).map((c) => c.label);
  const customEntries = Object.entries(slots.custom ?? {});
  const complete = missing.length === 0;
  const [open, setOpen] = useState(!complete);

  return (
    <div className="shrink-0 border-b border-line bg-surface-2/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-2 px-3.5 py-2 text-left sm:px-4"
      >
        <ClipboardIcon className="h-4 w-4 shrink-0 text-muted" />
        <span className="text-caption font-semibold text-fg">
          문의 체크리스트{" "}
          <span className={complete ? "text-success" : "text-warning"}>
            {filledCount}/{core.length}
          </span>
        </span>
        {!open && (
          <span className="min-w-0 truncate text-caption text-muted">
            {complete
              ? "기본 정보 확인 완료"
              : `미확인: ${missing.join(" · ")}`}
          </span>
        )}
        <svg
          viewBox="0 0 24 24"
          className={`ml-auto h-4 w-4 shrink-0 text-faint transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="space-y-1 px-3.5 pb-2.5 sm:px-4">
          {core.map((c) => (
            <div key={c.label} className="flex items-baseline gap-2 text-caption">
              {c.value ? (
                <CheckIcon className="h-3.5 w-3.5 shrink-0 translate-y-0.5 text-success" />
              ) : (
                <span className="h-3.5 w-3.5 shrink-0 translate-y-0.5 rounded-full border border-line-strong" />
              )}
              <span className="w-16 shrink-0 text-muted">{c.label}</span>
              <span className={`min-w-0 break-words ${c.value ? "font-medium text-fg" : "text-faint"}`}>
                {c.value ?? "미확인 — 대화로 여쭤보세요"}
              </span>
            </div>
          ))}
          {customEntries.map(([k, v]) => (
            <div key={k} className="flex items-baseline gap-2 text-caption">
              <CheckIcon className="h-3.5 w-3.5 shrink-0 translate-y-0.5 text-success" />
              <span className="w-16 shrink-0 truncate text-muted" title={k}>
                {k}
              </span>
              <span className="min-w-0 break-words font-medium text-fg">{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 작가용 상담 정보 카드 — 고객이 작성한 상담 정보를 채팅 상단에 읽기 전용 카드로 노출.
//   문의한 사진·기본 정보·레퍼런스 사진을 한눈에 보여준다(자세한 열람은 헤더의 상담 정보 버튼).
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- 레거시 보존 (되돌릴 때 사용)
function ConsultationCard({
  brief,
  sourcePhotoPath,
}: {
  brief: ConsultationBrief;
  sourcePhotoPath: string | null;
}) {
  const rows: [string, string | null][] = [
    ["성별", brief.gender],
    ["인원", brief.party_size != null ? `${brief.party_size}명` : null],
    ["목적", brief.purpose],
    ["희망 일정", brief.preferred_date],
    ["희망 지역", brief.region],
    ["요청", brief.note],
  ];
  return (
    <div className="mx-auto w-full max-w-sm rounded-2xl border border-line bg-surface p-4">
      <p className="flex items-center gap-1.5 text-caption font-semibold text-muted">
        <ClipboardIcon className="h-4 w-4" />
        상담 정보
      </p>

      {sourcePhotoPath && (
        <div className="mt-3">
          <p className="text-caption text-faint">문의한 사진</p>
          <a
            href={sourcePhotoPath}
            target="_blank"
            rel="noreferrer"
            className="mt-1.5 block aspect-[4/5] w-24 overflow-hidden rounded-lg bg-fg/[0.05]"
          >
            <img src={sourcePhotoPath} alt="" loading="lazy" className="h-full w-full object-cover" />
          </a>
        </div>
      )}

      <dl className="mt-3 grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-2 text-body-sm">
        {rows.map(([label, value]) => (
          <Fragment key={label}>
            <dt className="text-faint">{label}</dt>
            <dd className={value ? "text-fg" : "text-faint"}>{value || "—"}</dd>
          </Fragment>
        ))}
      </dl>

      {brief.ref_image_paths.length > 0 && (
        <div className="mt-3">
          <p className="text-caption text-faint">레퍼런스 사진</p>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {brief.ref_image_paths.map((url) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="block aspect-square overflow-hidden rounded-lg bg-fg/[0.05]"
              >
                <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// 작가 포트폴리오 사진 고르기 — 그리드에서 하나 선택해 채팅으로 전송
function PhotoPicker({
  photos,
  onClose,
  onPick,
}: {
  photos: PortfolioPhoto[];
  onClose: () => void;
  onPick: (photoId: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 font-kr" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[80svh] w-full max-w-md overflow-y-auto rounded-2xl bg-surface p-5 shadow-pop"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-title font-semibold">포트폴리오에서 고르기</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="grid h-8 w-8 cursor-pointer place-items-center rounded-full text-muted transition-colors hover:bg-fg/[0.06] hover:text-fg"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPick(p.id)}
              className="aspect-square cursor-pointer overflow-hidden rounded-lg border border-line transition-colors hover:border-fg/40"
            >
              <img src={p.thumb_url} alt="" className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// 예약 진행에 따른 뱃지 색: 긍정(수락 이후) / 종료(거절·취소·환불) / 대기
const POSITIVE_STATUSES = new Set(["accepted", "paid", "shot", "delivered", "completed"]);
const CLOSED_STATUSES = new Set(["rejected", "cancelled", "refunded"]);

// 예약 제안 카드 — 클릭 시 상세, 수락/거절은 '제안자의 상대', 수정/취소는 제안자
function BookingCard({
  booking,
  amPhotographer,
  amCustomer,
  onOpenDetail,
  onEdit,
  onReuse,
  onNeedPay,
  payoutAccount,
  conversationId,
}: {
  booking: BookingSnapshot;
  amPhotographer: boolean;
  amCustomer: boolean;
  onOpenDetail: () => void;
  onEdit: (() => void) | null; // 제안한 쪽에만 제공
  /** 취소·거절된 예약 — 카드를 누르면 그 내용 그대로 새 예약서를 연다 */
  onReuse: (() => void) | null;
  /** 고객이 수락한 직후 — 방이 입금 안내를 띄운다 */
  onNeedPay: () => void;
  /** 서버가 미리 실어 보낸 사매 계좌 (없으면 TransferSection 이 직접 조회) */
  payoutAccount: PayoutAccount | null;
  conversationId: string;
}) {
  // 처리 결과를 낙관적으로 반영 (서버 액션 + realtime 지연에도 카드가 즉시 진행)
  const [acted, setActed] = useState<
    null | "accepted" | "rejected" | "cancelled" | "paid" | "shot"
  >(null);
  const status = acted ?? booking.status;
  const router = useRouter();
  const [advancing, startAdvance] = useTransition();

  // 상태 전이 액션을 실행하고 카드를 낙관적으로 진행시킨다(req8) — markShot/입금확인 등
  function advance(action: (fd: FormData) => Promise<void>, next: "paid" | "shot") {
    const fd = new FormData();
    fd.set("id", booking.id);
    startAdvance(async () => {
      await action(fd);
      setActed(next);
      router.refresh();
    });
  }

  // 제안자/수락자 판별 — 작가 제안이면 구매자가 수락, 구매자 제안이면 작가가 수락
  const proposedByPhotographer = booking.proposed_by_photographer;
  const amRecipient = proposedByPhotographer ? amCustomer : amPhotographer; // 수락/거절 권한자
  const amProposer = proposedByPhotographer ? amPhotographer : amCustomer; // 취소 권한자

  // 입금 완료를 누른 뒤 고객에게는 끝난 거래다 — 배지도 그렇게 읽혀야 한다.
  // (작가·운영에게는 사매 확인이 남았으므로 다르게 보여준다)
  const paidMarked = status === "accepted" && !!booking.transfer_marked_at;

  const statusLabel: Record<string, string> = {
    requested: "수락 대기 중",
    accepted: "수락됨 · 입금 대기",
    paid: "결제 완료",
    shot: "촬영 완료",
    delivered: "보정본 전달",
    completed: "거래 완료",
    rejected: "거절됨",
    cancelled: "취소됨",
    refunded: "환불됨",
  };

  const when = booking.shoot_at
    ? new Date(booking.shoot_at).toLocaleString("ko-KR", {
        month: "long",
        day: "numeric",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : booking.shoot_date
    ? `${new Date(`${booking.shoot_date}T00:00:00+09:00`).toLocaleDateString("ko-KR", {
        month: "long",
        day: "numeric",
        weekday: "short",
      })} · 시간 협의`
    : "날짜 미정 (협의)";

  // 취소·거절된 예약은 더 이상 살아 있는 카드가 아니라 '지난 내용' 이다.
  // 다시 잡으려면 같은 내용을 처음부터 다시 적어야 했는데, 그 자리가 곧 이 카드다 —
  // 눌러서 그대로 채워진 예약서를 연다. (되살리는 게 아니라 새 제안이다)
  const reusable = (status === "cancelled" || status === "rejected") && !!onReuse;

  return (
    // 카드는 읽는 것이지 누르는 것이 아니다 — 카드 전체를 링크로 두면 버튼을 노리다 빗나가
    // 엉뚱한 화면으로 튄다. 이동이 필요한 자리(보정본 받기)에만 버튼을 둔다.
    // 예외: 취소·거절된 카드는 안에 버튼이 하나도 없어 빗나갈 것이 없다 — 전체를 누를 수 있게 둔다.
    <div
      {...(reusable
        ? {
            role: "button" as const,
            tabIndex: 0,
            onClick: onReuse!,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onReuse!();
              }
            },
          }
        : {})}
      className={`mx-auto w-full max-w-sm rounded-2xl border border-line bg-surface p-4 ${
        reusable ? "cursor-pointer transition-colors hover:bg-fg/[0.03]" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-caption font-semibold text-muted">
          <ClipboardIcon className="h-4 w-4" />
          {status === "requested" ? "예약 제안" : "예약"}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-label font-semibold ${
            POSITIVE_STATUSES.has(status)
              ? "bg-success-soft text-success"
              : CLOSED_STATUSES.has(status)
              ? "bg-fg/[0.06] text-faint"
              : "bg-warning-soft text-warning"
          }`}
        >
          {/* 라벨 규칙은 lib/bookings 의 bookingStatusLabel 이 진실 — 낙관적 상태(acted)일 때만 로컬 표기 */}
          {acted && acted !== booking.status
            ? (statusLabel[status] ?? status)
            : bookingStatusLabel(
                { status: booking.status as BookingStatus, transfer_marked_at: booking.transfer_marked_at },
                amCustomer
              )}
        </span>
      </div>

      <p className="mt-2 text-body font-semibold text-fg">{booking.package_snapshot?.name ?? "촬영"}</p>
      <p className="mt-1.5 flex items-center gap-1.5 text-caption text-muted">
        <CalendarIcon className="h-4 w-4 shrink-0 text-faint" />
        {when}
      </p>
      {booking.location_text && (
        <p className="mt-0.5 flex items-center gap-1.5 text-caption text-muted">
          <MapPinIcon className="h-4 w-4 shrink-0 text-faint" />
          {booking.location_text}
        </p>
      )}
      {/* 작가가 정의한 추가 항목 — 제안 시점 값 그대로 (라벨까지 스냅샷) */}
      {readStoredFieldValues(booking.custom_fields).length > 0 && (
        <dl className="mt-2 flex flex-col gap-1">
          {readStoredFieldValues(booking.custom_fields).map((f) => (
            <div key={f.id} className="flex gap-2 text-caption">
              <dt className="shrink-0 text-muted">{f.label}</dt>
              <dd className="min-w-0 flex-1 text-fg">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* 금액 — 촬영비와 출장비를 분리 표기. 합계가 곧 사매 계좌로 입금할 금액이다 */}
      <div className="mt-2">
        {booking.travel_fee_krw > 0 && (
          <div className="text-caption text-muted">
            <span>촬영비 ₩{fmt.format((booking.amount_krw ?? 0) - booking.travel_fee_krw)}</span>
            <span className="ml-2">출장비 ₩{fmt.format(booking.travel_fee_krw)}</span>
          </div>
        )}
        <p className="text-body font-bold text-fg">₩{fmt.format(booking.amount_krw ?? 0)}</p>
      </div>

      {/* 수락 후 입금 단계 — 고객: 계좌·입금완료, 작가: 대기 안내 */}
      {status === "accepted" && (
        <TransferSection
          booking={booking}
          amCustomer={amCustomer}
          amPhotographer={amPhotographer}
          preloadedAccount={payoutAccount}
          onConfirmed={() => {
            setActed("paid");
            router.refresh();
          }}
        />
      )}

      {/* 작가: 결제됨 → 촬영 완료 표시 (req9) */}
      {amPhotographer && status === "paid" && (
        <div className="mt-3 border-t border-line pt-3">
          <button
            type="button"
            disabled={advancing}
            onClick={() => advance(markShot, "shot")}
            className="w-full cursor-pointer rounded-full bg-fg py-2.5 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {advancing ? "처리 중…" : "촬영 완료 표시"}
          </button>
        </div>
      )}

      {/* 작가: 촬영됨 → 보정본 전달 업로더 (req9) */}
      {amPhotographer && status === "shot" && (
        <div className="mt-3 border-t border-line pt-3">
          <DeliveryUploader bookingId={booking.id} initialAssets={[]} initialLink="" />
        </div>
      )}

      {/* 보정본 전달 완료 → 고객 후기 유도 */}
      {status === "completed" && amCustomer && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="flex items-center gap-1.5 text-caption text-muted">
            <CameraIcon className="h-4 w-4 shrink-0 text-faint" />
            보정본 전달이 완료됐어요. 촬영은 어떠셨나요?
          </p>
          <button
            type="button"
            onClick={onOpenDetail}
            className="mt-2 w-full cursor-pointer rounded-full bg-fg py-2.5 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90"
          >
            보정본 받기 · 후기 남기기
          </button>
        </div>
      )}

      {/* 수락/거절 — 제안자의 상대(수신자)만, 대기 상태에서 */}
      {amRecipient && status === "requested" && (
        <div className="mt-3 flex gap-2">
          <form action={rejectBooking} onSubmit={() => setActed("rejected")} className="flex-1">
            <input type="hidden" name="id" value={booking.id} />
            <button className="w-full cursor-pointer rounded-full border border-line-strong py-2.5 text-body-sm font-medium text-muted transition-colors hover:bg-fg/[0.04]">
              거절
            </button>
          </form>
          <form
            action={acceptBooking}
            onSubmit={() => {
              setActed("accepted");
              // 수락만 하고 방을 떠나는 걸 막는다 — 계좌·금액·다음 행동을 바로 띄운다
              if (amCustomer) onNeedPay();
            }}
            className="flex-1"
          >
            <input type="hidden" name="id" value={booking.id} />
            <button className="w-full cursor-pointer rounded-full bg-fg py-2.5 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90">
              수락하기
            </button>
          </form>
        </div>
      )}

      {/* 수정 — 수락 전에는 제안한 쪽, 입금이 확인된 뒤에는 작가만 (docs/32 §3-6).
          입금 대기 구간(accepted)에서는 아무도 못 고친다: 금액이 바뀌면 고객이 보고 있는
          입금액과 어긋난다. */}
      {onEdit &&
        ((amProposer && status === "requested") ||
          (amPhotographer && ["paid", "shot"].includes(status))) && (
        <div className="mt-3">
          <button
            type="button"
            onClick={onEdit}
            className="w-full cursor-pointer rounded-full border border-line-strong py-2.5 text-body-sm font-medium text-muted transition-colors hover:bg-fg/[0.04]"
          >
            {status === "requested" ? "수정" : "예약 변경"}
          </button>
        </div>
      )}

      {/* 취소 — 대기 중이면 제안자, 수락된 뒤에는 양측 모두. 단 입금을 알린 뒤에는 감춘다.
          수락은 확정이 아니라 입금 대기 상태라 그때까진 어느 쪽이든 무를 수 있어야 하지만,
          입금 후 취소는 환불이 걸린 사안이라 사매를 거친다(정책에 그렇게 적혀 있다). */}
      {/* 취소·거절된 카드 — 누르면 이 내용으로 새 예약서가 열린다는 걸 알려준다 */}
      {reusable && (
        <p className="mt-3 border-t border-line pt-3 text-caption font-medium text-brand">
          이 내용으로 다시 예약서 작성하기
        </p>
      )}

      {/* 입금을 알린 뒤에는 당사자끼리 무를 수 없다 — 환불이 걸린 사안이라 사매를 거친다.
          그 대신 요청 창구를 같은 자리에 둔다. 창구가 없으면 채팅에서 작가에게 말하게 되고,
          작가는 결정할 수 없는 걸 약속하게 된다 (docs/32).

          고객에게만 둔다. 작가는 이미 사매와 카톡으로 이어져 있어(정산도 그렇게 오간다)
          서비스 안에 창구를 하나 더 만들면 어디로 말해야 할지만 헷갈린다. */}
      {amCustomer && (paidMarked || ["paid", "shot"].includes(status)) && (
        <SupportButton bookingId={booking.id} conversationId={conversationId} />
      )}

      {!paidMarked && ((amProposer && status === "requested") || status === "accepted") && (
        <div className="mt-2">
          <form action={cancelBooking} onSubmit={() => setActed("cancelled")}>
            <input type="hidden" name="id" value={booking.id} />
            <button className="w-full cursor-pointer rounded-full border border-line-strong py-2.5 text-body-sm font-medium text-brand transition-colors hover:bg-brand/[0.06]">
              예약 취소
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

// 수락 후 입금 단계 — 고객: 계좌·금액·[입금 완료]·환불정책 / 작가: 대기 안내.
// 상태 전이(accepted→paid)와 송금 표시는 부모의 bookings realtime 구독이 양쪽에 동기화한다.
function TransferSection({
  booking,
  amCustomer,
  amPhotographer,
  onConfirmed,
  preloadedAccount,
}: {
  booking: BookingSnapshot;
  amCustomer: boolean;
  amPhotographer: boolean;
  onConfirmed: () => void; // 작가 입금 확인 후 카드 즉시 진행(req8)
  preloadedAccount: PayoutAccount | null;
}) {
  const router = useRouter();
  const [sent, setSent] = useState(false); // 고객 [송금 완료] 낙관적 반영
  const [, startSend] = useTransition();
  const marked = sent || !!booking.transfer_marked_at;

  // 계좌는 결제가 걸린 방이면 서버가 미리 실어 보낸다 — 그 경우 조회 없이 바로 그린다.
  // 못 받았을 때(수락 직후처럼 서버 렌더가 앞선 경우)만 서버액션으로 채운다.
  const [fetched, setFetched] = useState<PayoutAccount | null>(null);
  const [accountLoading, setAccountLoading] = useState(amCustomer && !preloadedAccount);
  const payoutAccount = preloadedAccount ?? fetched;
  useEffect(() => {
    if (!amCustomer || preloadedAccount) return;
    let active = true;
    getBookingPayoutAccount(booking.id).then((acc) => {
      if (!active) return;
      setFetched(acc);
      setAccountLoading(false);
    });
    return () => {
      active = false;
    };
  }, [amCustomer, booking.id, preloadedAccount]);

  // 고객 송금 완료 알림 — 낙관적 표시 + 서버 반영 후 새로고침
  function notifySent() {
    setSent(true);
    const fd = new FormData();
    fd.set("id", booking.id);
    startSend(async () => {
      await markTransferSent(fd);
      router.refresh();
    });
  }

  void onConfirmed; // 에스크로 전환 — 입금 확인 주체가 운영자(어드민)로 이동, 콜백은 호환 유지

  return (
    <div className="mt-3 border-t border-line pt-3">
      {/* ── 고객 화면 ──
          입금 전: 계좌·금액·[입금 완료]·환불정책
          입금 후: 전부 걷어내고 확정 안내만. 계좌도 정책도 이미 할 일이 끝난 정보다. */}
      {amCustomer &&
        (marked ? (
          <div className="rounded-xl bg-success-soft px-3 py-3 text-center">
            <p className="flex items-center justify-center gap-1.5 text-body-sm font-semibold text-success">
              <CheckIcon className="h-4 w-4 shrink-0" />
              예약이 확정됐어요
            </p>
            <p className="mt-1 text-caption leading-relaxed text-success/80">
              이제 촬영일에 만나면 돼요.
            </p>
          </div>
        ) : (
          <>
            <p className="flex items-center gap-1.5 text-caption font-semibold text-muted">
              <WalletIcon className="h-4 w-4" />
              입금 안내 — 사매 계좌로 안전하게
            </p>
            {accountLoading ? (
              <div className="mt-2 flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-3 text-caption text-muted">
                <Spinner className="h-4 w-4" />
                계좌 정보를 불러오는 중…
              </div>
            ) : payoutAccount ? (
              <div className="mt-2 rounded-xl bg-surface-2 p-3 text-caption">
                <TransferRow label="은행" value={payoutAccount.bank} />
                <TransferRow label="계좌번호" value={payoutAccount.number} mono />
                <TransferRow label="예금주" value={payoutAccount.holder} />
                <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
                  <span className="text-faint">보낼 금액</span>
                  <span className="text-body-sm font-bold text-fg">
                    ₩{fmt.format(booking.amount_krw ?? 0)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="mt-2 rounded-xl bg-warning-soft px-3 py-2 text-caption text-warning">
                입금 계좌 안내를 준비 중이에요. 잠시 후 다시 확인해주세요.
              </div>
            )}

            {payoutAccount && (
              <button
                type="button"
                onClick={notifySent}
                className="mt-3 w-full cursor-pointer rounded-full bg-fg py-2.5 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90"
              >
                입금 완료
              </button>
            )}

            <PolicyNote />
          </>
        ))}

      {/* ── 작가 화면: 사매 입금 확인 대기 (에스크로 — 확인 주체는 운영자) ── */}
      {amPhotographer && (
        <>
          {marked ? (
            <p className="flex items-center gap-1.5 text-caption font-semibold text-success">
              <WalletIcon className="h-4 w-4 shrink-0" />
              고객이 입금 완료를 알렸어요 — 사매가 확인 중이에요
            </p>
          ) : (
            <p className="text-caption text-muted">고객의 입금을 기다리는 중이에요</p>
          )}
          <p className="mt-1 text-label text-faint">
            입금은 사매 계좌로 받고, 사매가 확인하면 예약이 확정돼요. 촬영비는 수수료 차감 후
            정산해드려요.
          </p>
        </>
      )}
    </div>
  );
}

function TransferRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span className="shrink-0 text-faint">{label}</span>
      <span className={`text-right font-medium text-fg ${mono ? "tabular-nums tracking-tight" : ""}`}>
        {value}
      </span>
    </div>
  );
}

// 요약 JSON 스키마 (챗봇이 접수 시 기록)
type InquirySummary = {
  purpose?: string;
  preferredDate?: string;
  region?: string;
  partySize?: string | null;
  note?: string | null;
};

// 자유 텍스트 희망일 → YYYY-MM-DD 추출 (실패 시 null — 날짜는 작성기에서 고르면 됨)
function parsePreferredDate(text: string | undefined): string | null {
  if (!text) return null;
  const iso = /(\d{4})[-./](\d{1,2})[-./](\d{1,2})/.exec(text);
  const pad = (n: number) => String(n).padStart(2, "0");
  if (iso) return `${iso[1]}-${pad(+iso[2])}-${pad(+iso[3])}`;
  const ko = /(\d{1,2})\s*월\s*(\d{1,2})\s*일/.exec(text);
  if (ko) {
    const now = new Date();
    const m = +ko[1];
    const d = +ko[2];
    // 이미 지난 날짜면 내년으로 (과거 예약 방지)
    const y =
      m < now.getMonth() + 1 || (m === now.getMonth() + 1 && d < now.getDate())
        ? now.getFullYear() + 1
        : now.getFullYear();
    return `${y}-${pad(m)}-${pad(d)}`;
  }
  return null;
}

// 요약 카드 → 예약 작성기 프리필 초안
// 취소·거절된 예약 → 새 예약서 프리필.
// 지난 날짜는 넘기지 않는다 — 달력이 고를 수 없는 날짜를 채워두면 제출은 되는데 손댈 수는 없다.
function draftFromBooking(b: BookingSnapshot): BookingDraft {
  const at = b.shoot_at ? new Date(b.shoot_at) : null;
  const valid = at && !isNaN(at.getTime());
  const dateStr = valid ? at.toLocaleDateString("en-CA") : b.shoot_date ?? null;
  const todayStr = new Date().toLocaleDateString("en-CA");
  const pad = (n: number) => String(n).padStart(2, "0");

  return {
    packageId: b.package_id,
    date: dateStr && dateStr >= todayStr ? dateStr : null,
    // 시간 선택은 30분 격자 — 어긋난 분은 내림해서 맞춘다
    time: valid ? `${pad(at.getHours())}:${at.getMinutes() >= 30 ? "30" : "00"}` : null,
    locationText: b.location_text,
    memo: b.memo,
    shootFeeKrw: Math.max(0, (b.amount_krw ?? 0) - (b.travel_fee_krw ?? 0)),
    travelFeeKrw: b.travel_fee_krw,
    fieldValues: Object.fromEntries(
      readStoredFieldValues(b.custom_fields).map((f) => [f.id, f.value])
    ),
  };
}

function draftFromSummary(s: InquirySummary): BookingDraft {
  const memoLines: string[] = [];
  if (s.purpose) memoLines.push(`촬영 종류: ${s.purpose}`);
  if (s.preferredDate) memoLines.push(`희망 일정: ${s.preferredDate}`);
  if (s.partySize) memoLines.push(`인원: ${s.partySize}`);
  if (s.note) memoLines.push(s.note);
  return {
    date: parsePreferredDate(s.preferredDate),
    locationText: s.region ?? "",
    memo: memoLines.join("\n"),
  };
}

// 챗봇이 수집한 문의 요약 카드 — 채팅방 타임라인에 상주 (body=JSON, 파싱 실패 시 무해하게 생략).
// onPropose(작가 화면): 정리된 내용이 그대로 채워진 예약 제안 작성기를 연다.
function SummaryCardBubble({
  body,
  time,
  onPropose,
}: {
  body: string;
  time: string;
  onPropose: ((draft: BookingDraft) => void) | null;
}) {
  let s: InquirySummary | null = null;
  try {
    s = JSON.parse(body);
  } catch {
    s = null;
  }
  if (!s) return null;
  const rows: [string, string][] = [
    ["촬영 종류", s.purpose ?? "-"],
    ["희망일", s.preferredDate ?? "-"],
    ["지역", s.region ?? "-"],
  ];
  if (s.partySize) rows.push(["인원", s.partySize]);
  return (
    <div className="flex flex-col items-end">
      <div className="w-full max-w-[85%] overflow-hidden rounded-2xl rounded-br-md border border-line bg-surface">
        <p className="border-b border-line bg-brand-soft px-3.5 py-2 text-body-sm font-semibold text-brand">
          문의 내용 정리
        </p>
        <div className="space-y-1.5 px-3.5 py-3">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-baseline gap-3 text-body-sm">
              <span className="w-16 shrink-0 text-muted">{k}</span>
              <span className="min-w-0 break-words font-medium text-fg">{v}</span>
            </div>
          ))}
          {s.note && (
            <p className="mt-1 whitespace-pre-wrap break-words border-t border-line pt-2 text-body-sm text-fg">
              {s.note}
            </p>
          )}
          {onPropose && (
            <button
              type="button"
              onClick={() => onPropose(draftFromSummary(s!))}
              className="mt-2 w-full cursor-pointer rounded-full bg-fg py-2.5 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90"
            >
              이 내용으로 예약 제안
            </button>
          )}
        </div>
      </div>
      <span className="mt-0.5 text-label text-faint">{time}</span>
    </div>
  );
}
