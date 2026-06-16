"use client";

/* eslint-disable @next/next/no-img-element */
import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { sendMessage, markRead, sendPortfolioPhoto, getBookingPayoutAccount } from "../actions";
import { acceptBooking, rejectBooking, cancelBooking } from "@/app/actions/bookings";
import { markTransferSent, confirmTransfer, markShot } from "@/app/actions/payments";
import type { ChatMessage, BookingSnapshot, ConsultationBrief } from "@/lib/chat";
import type { PayoutAccount } from "@/lib/payments";
import { DeliveryUploader } from "@/app/(user)/bookings/[id]/DeliveryUploader";
import {
  BookingComposer,
  type ComposerData,
  type BookingEditTarget,
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
  "id, status, shoot_at, location_text, amount_krw, travel_fee_krw, package_snapshot, package_id, memo, transfer_marked_at, proposed_by_photographer";

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
}: {
  conversationId: string;
  meId: string;
  amPhotographer: boolean;
  initialMessages: ChatMessage[];
  composerData: ComposerData | null;
  portfolioPhotos: PortfolioPhoto[];
  brief: ConsultationBrief | null;
  sourcePhotoPath: string | null;
}) {
  const amCustomer = !amPhotographer; // 참여자 중 작가가 아니면 구매자
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false); // 입력창 + 옵션 메뉴
  const [pickerOpen, setPickerOpen] = useState(false); // 포트폴리오 사진 고르기 모달
  // 예약 작성기 — null이면 닫힘, {} 신규, {edit} 수정 모드
  const [composer, setComposer] = useState<null | { edit: BookingEditTarget | null }>(null);
  const [, startTransition] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);
  const firstScroll = useRef(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);

  // 안읽음 초기화
  useEffect(() => {
    markRead(conversationId);
  }, [conversationId]);

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
        .subscribe();
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
  }, [messages]);

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

  function onSend(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText("");
    startTransition(() => {
      sendMessage(conversationId, t);
    });
  }

  async function onFile(files: FileList | null) {
    if (!files?.[0]) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", files[0]);
    fd.append("conversationId", conversationId);
    await fetch("/api/chat/upload", { method: "POST", body: fd });
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 메시지 영역 — 이 컨테이너만 스크롤 */}
      <div
        ref={listRef}
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-4 sm:px-4"
      >
        {/* 작가: 고객이 작성한 상담 정보를 카드로 노출(대화 맥락) */}
        {amPhotographer && brief && (
          <ConsultationCard brief={brief} sourcePhotoPath={sourcePhotoPath} />
        )}
        {/* 상담 정보를 작성한 고객의 빈 방 — 첫 인사를 권유 (메시지가 생기면 사라짐) */}
        {messages.length === 0 && amCustomer && brief && (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-success-soft text-success">
              <CheckIcon className="h-6 w-6" />
            </span>
            <p className="mt-3 text-body font-semibold text-fg">상담 정보를 작성했어요</p>
            <p className="mt-1 text-body-sm text-muted">작가님께 먼저 대화를 건네보세요.</p>
          </div>
        )}
        {messages.map((m) => {
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
        })}
      </div>

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

// 작가용 상담 정보 카드 — 고객이 작성한 상담 정보를 채팅 상단에 읽기 전용 카드로 노출.
//   문의한 사진·기본 정보·레퍼런스 사진을 한눈에 보여준다(자세한 열람은 헤더의 상담 정보 버튼).
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
        className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl bg-surface p-5 shadow-pop"
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
  const [confirming, setConfirming] = useState(false); // 작가 [입금 확인] 중복 클릭 방지
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

  // 작가 입금 확인 — accepted→paid. 처리중 표시 후 카드 진행(req8)
  function doConfirm() {
    setConfirming(true);
    const fd = new FormData();
    fd.set("id", booking.id);
    startSend(async () => {
      await confirmTransfer(fd);
      onConfirmed();
    });
  }

  return (
    <div className="mt-3 border-t border-line pt-3" onClick={stop}>
      {/* ── 고객 화면: 계좌·금액·송금 완료·정책 ── */}
      {amCustomer && (
        <>
          <p className="flex items-center gap-1.5 text-caption font-semibold text-muted">
            <WalletIcon className="h-4 w-4" />
            송금 안내
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
              작가가 아직 계좌를 등록하지 않았어요. 채팅으로 계좌를 문의해주세요.
            </div>
          )}

          {marked ? (
            <p className="mt-3 flex items-center justify-center gap-1.5 rounded-full bg-success-soft px-3 py-2 text-center text-caption text-success">
              <CheckIcon className="h-4 w-4 shrink-0" />
              송금 완료를 알렸어요 · 작가의 입금 확인을 기다리는 중
            </p>
          ) : (
            payoutAccount && (
              <button
                type="button"
                onClick={notifySent}
                className="mt-3 w-full cursor-pointer rounded-full bg-fg py-2.5 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90"
              >
                송금 완료
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

      {/* ── 작가 화면: 입금 확인 ── */}
      {amPhotographer && (
        <>
          {marked ? (
            <p className="flex items-center gap-1.5 text-caption font-semibold text-success">
              <WalletIcon className="h-4 w-4 shrink-0" />
              고객이 송금 완료를 알렸어요
            </p>
          ) : (
            <p className="text-caption text-muted">고객의 송금을 기다리는 중이에요</p>
          )}
          <p className="mt-1 text-label text-faint">
            입금을 확인하면 결제가 완료되고 매칭 수수료가 발생합니다.
          </p>
          <button
            type="button"
            onClick={doConfirm}
            disabled={confirming}
            className="mt-3 w-full cursor-pointer rounded-full bg-fg py-2.5 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {confirming ? "처리 중…" : "입금 확인"}
          </button>
        </>
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

// 환불·취소 정책 안내 (직접이체 모델)
function PolicyNote() {
  return (
    <div className="mt-2 rounded-xl bg-surface-2 px-3 py-2 text-label leading-relaxed text-muted">
      · 송금 전에는 언제든 무료로 취소할 수 있어요.
      <br />
      · 작가가 입금을 확인한 뒤 환불이 필요하면, 작가와 협의해 직접 환불받게 됩니다.
      <br />
      · 사매는 결제를 중개·보증하지 않는 직접거래 방식이라 분쟁 시 중재에 한계가 있어요. 송금
      전 일정·금액을 꼭 확인하세요.
    </div>
  );
}
