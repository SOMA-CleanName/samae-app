"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { sendMessage, markRead } from "../actions";
import { acceptBooking, rejectBooking, cancelBooking } from "@/app/actions/bookings";
import type { ChatMessage, BookingSnapshot } from "@/lib/chat";
import {
  BookingComposer,
  type ComposerData,
  type BookingEditTarget,
} from "./BookingComposer";

const fmt = new Intl.NumberFormat("ko-KR");

const BOOKING_COLS =
  "id, status, shoot_at, location_text, amount_krw, travel_fee_krw, package_snapshot, package_id, memo";

// 메시지 작성 시각 (카카오톡식 HH:MM)
function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ChatRoom({
  conversationId,
  meId,
  amPhotographer,
  initialMessages,
  composerData,
}: {
  conversationId: string;
  meId: string;
  amPhotographer: boolean;
  initialMessages: ChatMessage[];
  composerData: ComposerData | null;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false); // 입력창 + 옵션 메뉴
  // 예약 작성기 — null이면 닫힘, {} 신규, {edit} 수정 모드
  const [composer, setComposer] = useState<null | { edit: BookingEditTarget | null }>(null);
  const [, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
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
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [conversationId, meId]);

  // 새 메시지 시 스크롤 하단
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
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
    <div className="flex h-[calc(100svh-8rem)] flex-col">
      {/* 메시지 영역 */}
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto py-4">
        {messages.map((m) => {
          // 예약 제안 카드
          if (m.booking_id && m.booking) {
            return (
              <BookingCard
                key={m.id}
                booking={m.booking}
                amPhotographer={amPhotographer}
                onOpenDetail={() => router.push(`/bookings/${m.booking!.id}`)}
                onEdit={
                  // 고객(작성자)만 수정 가능 — composerData 있으면 고객
                  composerData
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
              <div key={m.id} className="flex justify-center">
                <span className="rounded-full bg-fg/[0.06] px-3 py-1 text-xs text-fg/55">{m.body}</span>
              </div>
            );
          }
          return (
            <div
              key={m.id}
              className={`flex items-end gap-1.5 ${mine ? "justify-end" : "justify-start"}`}
            >
              {/* 카카오톡식: 내 메시지는 시간이 왼쪽, 상대 메시지는 오른쪽 */}
              {mine && (
                <span className="mb-0.5 shrink-0 text-[10px] text-fg/40">
                  {timeLabel(m.created_at)}
                </span>
              )}
              <div
                className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                  mine ? "bg-fg text-bg" : "bg-fg/[0.07] text-fg"
                }`}
              >
                {m.type === "image" && m.image_path ? (
                  <img src={m.image_path} alt="" className="max-h-60 rounded-lg" loading="lazy" />
                ) : (
                  <span className="whitespace-pre-wrap break-words">{m.body}</span>
                )}
              </div>
              {!mine && (
                <span className="mb-0.5 shrink-0 text-[10px] text-fg/40">
                  {timeLabel(m.created_at)}
                </span>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* 입력 */}
      <form onSubmit={onSend} className="flex items-center gap-2 border-t border-fg/8 py-3">
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files)} />

        {/* + 옵션 메뉴 — 사진 보내기 등 추가 동작 (추후 확장) */}
        <div ref={optionsRef} className="relative shrink-0">
          <button
            type="button"
            disabled={uploading}
            onClick={() => setOptionsOpen((v) => !v)}
            aria-label="추가 옵션"
            aria-expanded={optionsOpen}
            className="grid h-9 w-9 place-items-center rounded-full bg-fg/[0.06] text-xl leading-none text-fg/70 hover:bg-fg/10 disabled:opacity-50"
          >
            {uploading ? "…" : "+"}
          </button>
          {optionsOpen && (
            <div className="absolute bottom-full left-0 mb-2 w-44 overflow-hidden rounded-xl border border-fg/10 bg-white py-1 shadow-lg">
              <button
                type="button"
                disabled={uploading}
                onClick={() => {
                  setOptionsOpen(false);
                  fileRef.current?.click();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-fg/[0.04] disabled:opacity-50"
              >
                🖼 사진 보내기
              </button>
              {/* 예약 제안은 헤더의 '📋 예약 제안' 버튼으로 이동 — 수정은 예약 카드에서 */}
            </div>
          )}
        </div>

        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="메시지"
          className="flex-1 rounded-full border border-fg/15 bg-white px-4 py-2 text-sm outline-none focus:border-fg/40"
        />
        <button
          type="submit"
          className="shrink-0 rounded-full bg-fg px-4 py-2 text-sm font-semibold text-bg hover:opacity-90"
        >
          전송
        </button>
      </form>

      {/* 예약 작성기 (신규/수정) — 고객만 */}
      {composer && composerData && (
        <BookingComposer
          data={composerData}
          editTarget={composer.edit}
          onClose={() => setComposer(null)}
        />
      )}
    </div>
  );
}

// 예약 제안 카드 — 클릭 시 상세, 작가는 수락/거절, 고객은 수정/취소
function BookingCard({
  booking,
  amPhotographer,
  onOpenDetail,
  onEdit,
}: {
  booking: BookingSnapshot;
  amPhotographer: boolean;
  onOpenDetail: () => void;
  onEdit: (() => void) | null; // 고객일 때만 제공
}) {
  // 처리 결과를 낙관적으로 반영
  const [acted, setActed] = useState<null | "accepted" | "rejected" | "cancelled">(null);
  const status = acted ?? booking.status;
  const amCustomer = onEdit !== null; // composerData 보유 = 고객

  // 액션 버튼 클릭이 카드 상세 이동으로 번지지 않게
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  const statusLabel: Record<string, string> = {
    requested: "수락 대기 중",
    accepted: "수락됨 ✓ 체결",
    rejected: "거절됨",
    cancelled: "취소됨",
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
      className="mx-auto w-full max-w-sm cursor-pointer rounded-2xl border border-fg/12 bg-white p-4 transition hover:border-fg/25"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-fg/50">📋 예약 제안</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] ${
            status === "accepted"
              ? "bg-emerald-500/15 text-emerald-600"
              : status === "rejected" || status === "cancelled"
              ? "bg-fg/[0.06] text-fg/50"
              : "bg-amber-500/15 text-amber-600"
          }`}
        >
          {statusLabel[status] ?? status}
        </span>
      </div>

      <p className="mt-2 text-sm font-semibold">{booking.package_snapshot?.name ?? "촬영"}</p>
      <p className="mt-1 text-xs text-fg/60">🗓 {when}</p>
      {booking.location_text && <p className="mt-0.5 text-xs text-fg/60">📍 {booking.location_text}</p>}
      <p className="mt-2 text-sm font-bold">
        ₩{fmt.format(booking.amount_krw ?? 0)}
        {booking.travel_fee_krw > 0 && (
          <span className="ml-1 text-xs font-normal text-fg/45">
            (출장비 ₩{fmt.format(booking.travel_fee_krw)} 포함)
          </span>
        )}
      </p>

      {/* 작가: 대기 상태일 때만 수락/거절 */}
      {amPhotographer && status === "requested" && (
        <div className="mt-3 flex gap-2" onClick={stop}>
          <form action={rejectBooking} onSubmit={() => setActed("rejected")} className="flex-1">
            <input type="hidden" name="id" value={booking.id} />
            <button className="w-full rounded-full border border-fg/20 py-2 text-sm font-medium text-fg/70 hover:bg-fg/[0.04]">
              거절
            </button>
          </form>
          <form action={acceptBooking} onSubmit={() => setActed("accepted")} className="flex-1">
            <input type="hidden" name="id" value={booking.id} />
            <button className="w-full rounded-full bg-fg py-2 text-sm font-semibold text-bg hover:opacity-90">
              수락하기
            </button>
          </form>
        </div>
      )}

      {/* 고객: 대기 상태일 때만 수정/취소 */}
      {amCustomer && status === "requested" && (
        <div className="mt-3 flex gap-2" onClick={stop}>
          <button
            type="button"
            onClick={onEdit ?? undefined}
            className="flex-1 rounded-full border border-fg/20 py-2 text-sm font-medium text-fg/70 hover:bg-fg/[0.04]"
          >
            수정
          </button>
          <form action={cancelBooking} onSubmit={() => setActed("cancelled")} className="flex-1">
            <input type="hidden" name="id" value={booking.id} />
            <button className="w-full rounded-full border border-fg/20 py-2 text-sm font-medium text-brand hover:bg-brand/[0.06]">
              취소
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
