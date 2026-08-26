"use client";

/* eslint-disable @next/next/no-img-element */
import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { sendMessage, markRead, sendPortfolioPhoto, getBookingPayoutAccount } from "../actions";
import { sendBotTurn } from "../bot-actions";
import { canonicalChipsFor, type AskingKey } from "@/lib/inquiry-bot-llm";
import { acceptBooking, rejectBooking, cancelBooking } from "@/app/actions/bookings";
import { markTransferSent, markShot, ackSettlement, disputeSettlement } from "@/app/actions/payments";
import { mpTrack } from "@/lib/mixpanel";
import type { ChatMessage, BookingSnapshot, ConsultationBrief, BotSlots } from "@/lib/chat";
import type { PayoutAccount } from "@/lib/payments";
import { DeliveryUploader } from "@/app/(user)/bookings/[id]/DeliveryUploader";
import {
  BookingComposer,
  type ComposerData,
  type BookingEditTarget,
  type BookingDraft,
} from "./BookingComposer";
import { Spinner } from "@/components/ui";
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
  "id, status, shoot_at, shoot_date, location_text, amount_krw, travel_fee_krw, package_snapshot, package_id, memo, transfer_marked_at, proposed_by_photographer, settled_at, settlement_amount_krw, settlement_ack_at, settlement_dispute_at";

// 메시지 작성 시각 (카카오톡식 HH:MM)
function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export type PortfolioPhoto = { id: string; thumb_url: string; src_url: string };

// 다음에 물을 코어 슬롯 — 초기 칩 계산용 (수집 순서 고정: 목적→희망일→지역→인원)
function firstMissingSlot(s: BotSlots | null): AskingKey {
  if (!s?.purpose) return "purpose";
  if (!s?.preferredDate) return "preferredDate";
  if (!s?.region) return "region";
  if (!s?.partySize) return "partySize";
  return "none";
}

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
  botMode?: { slots: BotSlots | null; intervened: boolean } | null;
}) {
  const amCustomer = !amPhotographer; // 참여자 중 작가가 아니면 구매자
  void brief; void sourcePhotoPath; // 레거시 상담정보 — 요약 카드로 대체, 과거 방 호환 위해 프롭만 유지
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [botSlots, setBotSlots] = useState<BotSlots | null>(initialBotSlots ?? null);
  // 채팅방 상주 봇 — 고객 발화를 이 방 안에서 봇이 받는다 (칩·타이핑·완료 상태)
  const [botChips, setBotChips] = useState<string[]>(
    botMode && !botMode.intervened ? canonicalChipsFor(firstMissingSlot(botMode.slots)) : []
  );
  const [botTyping, setBotTyping] = useState(false);
  const [botDone, setBotDone] = useState(false);
  const [botNeedContact, setBotNeedContact] = useState(false);
  const botActive = !!botMode && !botDone;
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
    if (botTyping) return;
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
          setBotChips(botMode && !botMode.intervened ? canonicalChipsFor(firstMissingSlot(botSlotsForChips())) : []);
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
      }
    });
  }

  // 차단 복구 시 칩 재계산용 — 프롭 슬롯 그대로 (턴이 실패했으니 슬롯 변화 없음)
  function botSlotsForChips(): BotSlots | null {
    return botMode?.slots ?? null;
  }

  function onSend(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    if (botActive) {
      submitBotTurn(t);
      return;
    }
    setBlockedNotice(null);
    startTransition(async () => {
      const res = await sendMessage(conversationId, t);
      if (!res.ok) {
        // 차단 — 입력은 유지해서 사용자가 문구를 고칠 수 있게
        setBlockedNotice(res.reason);
        mpTrack("Chat Message Blocked", {
          conversation_id: conversationId,
          role: amPhotographer ? "photographer" : "customer",
        });
        return;
      }
      setText("");
      mpTrack("Send Message", {
        conversation_id: conversationId,
        has_image: false,
        role: amPhotographer ? "photographer" : "customer",
      });
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
      {/* 작가용 문의 체크리스트 — 봇이 수집한 항목의 확인/미확인 현황 (실시간 갱신) */}
      {amPhotographer && botSlots && <InquiryChecklist slots={botSlots} />}


      {/* 메시지 영역 — 이 컨테이너만 스크롤 */}
      <div
        ref={listRef}
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-4 sm:px-4"
      >
        {/* 레거시 상담정보 카드·빈 방 안내는 제거 — 챗봇의 '문의 내용 정리' 요약 카드가
            타임라인 안에서 같은 역할을 한다 (brief 데이터는 과거 방 호환용으로만 유지) */}
        {(() => {
          // 작가가 봇을 이어받은 지점 — 첫 작가 실발화(text/image) 앞에 구분선을 그린다
          const firstPhotographerMsgId = messages.find(
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
                onEdit={
                  // 수정은 '구매자가 한 제안'에 한해 구매자만 가능
                  amCustomer && composerData && !m.booking.proposed_by_photographer
                    ? () =>
                        setComposer({
                          edit: {
                            id: m.booking!.id,
                            packageId: m.booking!.package_id,
                            shootAt: m.booking!.shoot_at,
                            shootDate: m.booking!.shoot_date,
                            locationText: m.booking!.location_text,
                            memo: m.booking!.memo,
                            travel: (m.booking!.travel_fee_krw ?? 0) > 0,
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
          // 챗봇 수집 대화 — 일반 버블 + 봇 발화(상대측)에만 '자동 응답' 라벨
          if (m.type === "bot") {
            return (
              <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                <div
                  className={`max-w-[75%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-body ${
                    mine ? "rounded-br-md bg-fg text-bg" : "rounded-bl-md bg-fg/[0.07] text-fg"
                  }`}
                >
                  {m.body}
                </div>
                {!mine && (
                  <span className="mt-0.5 text-label text-faint">자동 응답 · {timeLabel(m.created_at)}</span>
                )}
              </div>
            );
          }
          const isImage = m.type === "image" && m.image_path;
          return (
            <div
              key={m.id}
              className={`flex items-end gap-1.5 ${mine ? "justify-end" : "justify-start"}`}
            >
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
            </Fragment>
          );
        });
        })()}

        {/* 봇 응답 대기 — 타이핑 인디케이터 */}
        {botTyping && (
          <div className="flex flex-col items-start">
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-fg/[0.07] px-4 py-3">
              {[0, 160, 320].map((d) => (
                <span
                  key={d}
                  className="h-1.5 w-1.5 animate-pulse rounded-full bg-fg/40"
                  style={{ animationDelay: `${d}ms` }}
                />
              ))}
            </div>
            <span className="mt-0.5 text-label text-faint">자동 응답</span>
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

// 예약 진행에 따른 뱃지 색: 긍정(체결 이후) / 종료(거절·취소·환불) / 대기
const POSITIVE_STATUSES = new Set(["accepted", "paid", "shot", "delivered", "completed"]);
const CLOSED_STATUSES = new Set(["rejected", "cancelled", "refunded"]);

// 예약 제안 카드 — 클릭 시 상세, 수락/거절은 '제안자의 상대', 수정/취소는 제안자
function BookingCard({
  booking,
  amPhotographer,
  amCustomer,
  onOpenDetail,
  onEdit,
}: {
  booking: BookingSnapshot;
  amPhotographer: boolean;
  amCustomer: boolean;
  onOpenDetail: () => void;
  onEdit: (() => void) | null; // 구매자 제안일 때 구매자에게만 제공
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

  // 액션 버튼 클릭이 카드 상세 이동으로 번지지 않게
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  const statusLabel: Record<string, string> = {
    requested: "수락 대기 중",
    accepted: "수락됨 · 체결",
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

  return (
    <div
      onClick={onOpenDetail}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onOpenDetail()}
      className="mx-auto w-full max-w-sm cursor-pointer rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-line-strong"
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-caption font-semibold text-muted">
          <ClipboardIcon className="h-4 w-4" />
          예약 제안
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
          {statusLabel[status] ?? status}
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
      <p className="mt-2 text-body font-bold text-fg">
        ₩{fmt.format(booking.amount_krw ?? 0)}
        {booking.travel_fee_krw > 0 && (
          <span className="ml-1 text-caption font-normal text-faint">
            (출장비 ₩{fmt.format(booking.travel_fee_krw)} 포함)
          </span>
        )}
      </p>

      {/* 수락(체결) 후 송금 단계 — 고객: 계좌·송금완료, 작가: 입금확인 */}
      {status === "accepted" && (
        <TransferSection
          booking={booking}
          amCustomer={amCustomer}
          amPhotographer={amPhotographer}
          stop={stop}
          onConfirmed={() => {
            setActed("paid");
            router.refresh();
          }}
        />
      )}

      {/* 작가: 사매→작가 정산 송금 후 — 수령 확인/미수령 신고 트리거 */}
      {amPhotographer && booking.settled_at && (
        <SettlementAckSection booking={booking} stop={stop} />
      )}

      {/* 작가: 결제됨 → 촬영 완료 표시 (req9) */}
      {amPhotographer && status === "paid" && (
        <div className="mt-3 border-t border-line pt-3" onClick={stop}>
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
        <div className="mt-3 border-t border-line pt-3" onClick={stop}>
          <DeliveryUploader bookingId={booking.id} initialAssets={[]} initialLink="" />
        </div>
      )}

      {/* 보정본 전달 완료 → 고객 후기 유도 */}
      {status === "completed" && amCustomer && (
        <div className="mt-3 border-t border-line pt-3" onClick={stop}>
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
        <div className="mt-3 flex gap-2" onClick={stop}>
          <form action={rejectBooking} onSubmit={() => setActed("rejected")} className="flex-1">
            <input type="hidden" name="id" value={booking.id} />
            <button className="w-full cursor-pointer rounded-full border border-line-strong py-2.5 text-body-sm font-medium text-muted transition-colors hover:bg-fg/[0.04]">
              거절
            </button>
          </form>
          <form action={acceptBooking} onSubmit={() => setActed("accepted")} className="flex-1">
            <input type="hidden" name="id" value={booking.id} />
            <button className="w-full cursor-pointer rounded-full bg-fg py-2.5 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90">
              수락하기
            </button>
          </form>
        </div>
      )}

      {/* 수정/취소 — 제안자만, 대기 상태에서 (수정은 구매자 제안에 한해) */}
      {amProposer && status === "requested" && (
        <div className="mt-3 flex gap-2" onClick={stop}>
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="flex-1 cursor-pointer rounded-full border border-line-strong py-2.5 text-body-sm font-medium text-muted transition-colors hover:bg-fg/[0.04]"
            >
              수정
            </button>
          )}
          <form action={cancelBooking} onSubmit={() => setActed("cancelled")} className="flex-1">
            <input type="hidden" name="id" value={booking.id} />
            <button className="w-full cursor-pointer rounded-full border border-line-strong py-2.5 text-body-sm font-medium text-brand transition-colors hover:bg-brand/[0.06]">
              취소
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

// 수락(체결) 후 송금 단계 — 고객: 계좌·금액·[송금 완료]·환불정책 / 작가: [입금 확인].
// 상태 전이(accepted→paid)와 송금 표시는 부모의 bookings realtime 구독이 양쪽에 동기화한다.
function TransferSection({
  booking,
  amCustomer,
  amPhotographer,
  stop,
  onConfirmed,
}: {
  booking: BookingSnapshot;
  amCustomer: boolean;
  amPhotographer: boolean;
  stop: (e: React.MouseEvent) => void;
  onConfirmed: () => void; // 작가 입금 확인 후 카드 즉시 진행(req8)
}) {
  const router = useRouter();
  const [sent, setSent] = useState(false); // 고객 [송금 완료] 낙관적 반영
  const [showPolicy, setShowPolicy] = useState(false);
  const [, startSend] = useTransition();
  const marked = sent || !!booking.transfer_marked_at;

  // 작가 계좌는 수락(accepted) 이후 이 시점에만 서버액션으로 가져온다(고객 본인 + 예약 게이트 검증).
  // 채팅 진입만으로 계좌가 응답에 실리지 않게 하고, 수락 직후에도 즉시 표시되게 한다.
  const [payoutAccount, setPayoutAccount] = useState<PayoutAccount | null>(null);
  const [accountLoading, setAccountLoading] = useState(amCustomer);
  useEffect(() => {
    if (!amCustomer) return;
    let active = true;
    getBookingPayoutAccount(booking.id).then((acc) => {
      if (!active) return;
      setPayoutAccount(acc);
      setAccountLoading(false);
    });
    return () => {
      active = false;
    };
  }, [amCustomer, booking.id]);

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
    <div className="mt-3 border-t border-line pt-3" onClick={stop}>
      {/* ── 고객 화면: 계좌·금액·송금 완료·정책 ── */}
      {amCustomer && (
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
                <span className="text-body-sm font-bold text-fg">₩{fmt.format(booking.amount_krw ?? 0)}</span>
              </div>
            </div>
          ) : (
            <div className="mt-2 rounded-xl bg-warning-soft px-3 py-2 text-caption text-warning">
              입금 계좌 안내를 준비 중이에요. 잠시 후 다시 확인해주세요.
            </div>
          )}

          {marked ? (
            <p className="mt-3 flex items-center justify-center gap-1.5 rounded-full bg-success-soft px-3 py-2 text-center text-caption text-success">
              <CheckIcon className="h-4 w-4 shrink-0" />
              입금 완료를 알렸어요 · 사매가 확인하면 예약이 확정돼요
            </p>
          ) : (
            payoutAccount && (
              <button
                type="button"
                onClick={notifySent}
                className="mt-3 w-full cursor-pointer rounded-full bg-fg py-2.5 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90"
              >
                입금 완료
              </button>
            )
          )}

          <button
            type="button"
            onClick={() => setShowPolicy((v) => !v)}
            className="mt-3 cursor-pointer text-label text-faint underline"
          >
            환불·취소 정책 {showPolicy ? "접기" : "보기"}
          </button>
          {showPolicy && <PolicyNote />}
        </>
      )}

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

// 정산 수령 확인 (작가) — 사매가 정산금을 보낸 뒤: [정산 받았어요] / [아직 못 받았어요].
// 낙관적 반영 + realtime bookings UPDATE 가 최종 동기화.
function SettlementAckSection({
  booking,
  stop,
}: {
  booking: BookingSnapshot;
  stop: (e: React.MouseEvent) => void;
}) {
  const router = useRouter();
  const [acted, setActed] = useState<null | "ack" | "dispute">(null);
  const [, start] = useTransition();
  const acked = acted === "ack" || !!booking.settlement_ack_at;
  const disputed = !acked && (acted === "dispute" || !!booking.settlement_dispute_at);
  const amount = booking.settlement_amount_krw;

  function run(action: (fd: FormData) => Promise<void>, next: "ack" | "dispute") {
    const fd = new FormData();
    fd.set("id", booking.id);
    setActed(next);
    start(async () => {
      await action(fd);
      router.refresh();
    });
  }

  return (
    <div className="mt-3 border-t border-line pt-3" onClick={stop}>
      <p className="flex items-center gap-1.5 text-caption font-semibold text-muted">
        <WalletIcon className="h-4 w-4 shrink-0" />
        사매가 정산금{amount != null ? ` ₩${fmt.format(amount)}` : ""}을 보내드렸어요
      </p>
      {acked ? (
        <p className="mt-2 flex items-center justify-center gap-1.5 rounded-full bg-success-soft px-3 py-2 text-caption text-success">
          <CheckIcon className="h-4 w-4 shrink-0" />
          정산 입금을 확인했어요
        </p>
      ) : disputed ? (
        <p className="mt-2 rounded-xl bg-warning-soft px-3 py-2 text-caption text-warning">
          확인 요청을 접수했어요 — 사매가 송금 내역을 확인하고 다시 안내드릴게요.
        </p>
      ) : (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => run(disputeSettlement, "dispute")}
            className="flex-1 cursor-pointer rounded-full border border-line-strong py-2.5 text-body-sm font-medium text-muted transition-colors hover:bg-fg/[0.04]"
          >
            아직 못 받았어요
          </button>
          <button
            type="button"
            onClick={() => run(ackSettlement, "ack")}
            className="flex-1 cursor-pointer rounded-full bg-fg py-2.5 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90"
          >
            정산 받았어요
          </button>
        </div>
      )}
    </div>
  );
}

// 송금 안내 계좌 행
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

// 환불·취소 정책 안내 (에스크로 — 사매 계좌 경유)
function PolicyNote() {
  return (
    <div className="mt-2 rounded-xl bg-surface-2 px-3 py-2 text-label leading-relaxed text-muted">
      · 입금 전에는 언제든 무료로 취소할 수 있어요.
      <br />
      · 입금은 사매 계좌로 하며, 사매가 확인한 뒤 예약이 확정돼요. 촬영비는 사매가 작가에게
      정산해요.
      <br />
      · 확정 후 취소·환불이 필요하면 사매가 정책에 따라 처리해드려요. 작가 개인 계좌로의 직접
      송금은 보호받을 수 없으니 이용하지 마세요.
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
