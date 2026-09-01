"use client";

// 시뮬레이터 화면 — 폰 두 대를 나란히 놓는다.
//
// 왼쪽이 고객, 오른쪽이 작가다. 고객은 "작가 상세를 보고 있는 상태" 에서 시작한다 —
// 상담이 시작되기 전이 이 흐름의 진짜 출발점이라, 채팅방부터 보여주면 절반을 건너뛰게 된다.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar, Spinner } from "@/components/ui";
import { BOT_DISPLAY_NAME, isHandoffNotice } from "@/lib/bot-identity";
import { photographerLabel } from "@/lib/photographer-label";
import type { SimState } from "@/lib/sim-room";
import type { ChatMessage } from "@/lib/chat";
import { actStartChat, actCustomerSay, actPhotographerSay, actReset } from "./actions";

const fmt = new Intl.NumberFormat("ko-KR");
const timeLabel = (iso: string) =>
  new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export function Simulator({ state }: { state: SimState }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [blocked, setBlocked] = useState<string | null>(null);
  const ph = state.photographer;

  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      router.refresh();
    });

  if (!ph) {
    return (
      <p className="mx-auto max-w-6xl text-body-sm text-muted">승인된 작가가 없어요.</p>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      {/* 조작 줄 — 어느 작가로 걸어볼지와 리셋 */}
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-3">
        <label className="flex items-center gap-2 text-caption text-muted">
          작가
          <select
            value={ph.id}
            onChange={(e) => router.push(`/admin/simulator?p=${e.target.value}`)}
            className="rounded-lg border border-line bg-bg px-2.5 py-1.5 text-body-sm text-fg"
          >
            {state.photographers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>
        </label>

        <span className="text-caption text-muted">
          상태{" "}
          <b className="text-fg">
            {!state.conversationId ? "상담 전" : state.handedOff ? "작가 상담중" : "챗봇 상담중"}
          </b>
        </span>

        <button
          type="button"
          onClick={() => run(() => actReset(ph.id))}
          disabled={pending}
          className="ml-auto cursor-pointer rounded-full border border-line-strong px-3.5 py-1.5 text-caption font-semibold text-fg transition-colors hover:bg-fg/[0.05] disabled:opacity-50"
        >
          처음으로 (리셋)
        </button>
        {pending && <Spinner className="h-4 w-4" />}
      </div>

      {blocked && (
        <p className="mb-4 rounded-xl bg-danger-soft px-4 py-2.5 text-caption text-danger-ink">
          검열에 걸렸어요 — {blocked}
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Phone label="고객 화면" sub={state.customer.displayName}>
          {state.conversationId ? (
            <ChatScreen
              title={photographerLabel(ph.displayName)}
              avatar={ph.avatarUrl}
              messages={state.messages}
              customerId={state.customer.id}
              meIsCustomer
              counterpartName={photographerLabel(ph.displayName)}
              counterpartAvatar={ph.avatarUrl}
              disabled={pending}
              onSend={(t) =>
                run(async () => {
                  const r = await actCustomerSay(ph.id, state.conversationId!, t);
                  setBlocked(r.blocked);
                })
              }
            />
          ) : (
            <PhotoDetail photographer={ph} disabled={pending} onConsult={() => run(() => actStartChat(ph.id))} />
          )}
        </Phone>

        <Phone label="작가 화면" sub={ph.displayName}>
          {state.conversationId ? (
            <ChatScreen
              title={state.customer.displayName}
              avatar={null}
              messages={state.messages}
              customerId={state.customer.id}
              meIsCustomer={false}
              counterpartName={state.customer.displayName}
              counterpartAvatar={null}
              disabled={pending}
              onSend={(t) => run(() => actPhotographerSay(ph.id, state.conversationId!, t))}
            />
          ) : (
            <div className="grid h-full place-items-center px-8 text-center text-body-sm text-muted">
              아직 문의가 없어요.
              <br />
              고객이 [작가 상담하기] 를 누르면 여기 방이 열립니다.
            </div>
          )}
        </Phone>
      </div>
    </div>
  );
}

/** 폰 껍데기 — 실제 기기 폭(390) 그대로 두어야 줄바꿈이 실제와 같이 접힌다 */
function Phone({
  label,
  sub,
  children,
}: {
  label: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-body-sm font-semibold text-fg">{label}</span>
        <span className="text-caption text-muted">{sub}</span>
      </div>
      <div className="mx-auto w-[390px] max-w-full overflow-hidden rounded-[28px] border border-line-strong bg-bg shadow-pop">
        <div className="h-[640px] overflow-hidden">{children}</div>
      </div>
    </div>
  );
}

/** 고객의 시작 화면 — 작가 상세를 보고 있는 상태 */
function PhotoDetail({
  photographer,
  disabled,
  onConsult,
}: {
  photographer: SimState["photographer"];
  disabled: boolean;
  onConsult: () => void;
}) {
  if (!photographer) return null;
  return (
    <div className="flex h-full flex-col">
      <div className="relative flex-1 bg-surface-2">
        {photographer.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photographer.photoUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full place-items-center text-caption text-faint">
            등록된 사진이 없어요
          </div>
        )}
      </div>
      <div className="shrink-0 border-t border-line bg-bg px-4 pb-5 pt-4">
        <div className="flex items-center gap-2.5">
          <Avatar src={photographer.avatarUrl} name={photographer.displayName} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-body-sm font-semibold text-fg">
              {photographerLabel(photographer.displayName)}
            </p>
            <p className="truncate text-caption text-muted">
              {photographer.regions.slice(0, 3).join(" · ") || "지역 미등록"}
              {photographer.priceFromKrw > 0 && ` · ₩${fmt.format(photographer.priceFromKrw)}~`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onConsult}
          disabled={disabled}
          className="mt-4 w-full cursor-pointer rounded-xl border border-line-strong py-3 text-body-sm font-semibold text-fg transition-colors hover:bg-fg/[0.04] disabled:opacity-50"
        >
          작가 상담하기
        </button>
        <button
          type="button"
          disabled
          className="mt-2 w-full rounded-xl bg-brand py-3 text-body-sm font-semibold text-white opacity-40"
        >
          촬영 예약하기
        </button>
        <p className="mt-2 text-center text-label text-faint">
          시뮬레이터에서는 상담 경로만 걸어봅니다
        </p>
      </div>
    </div>
  );
}

function ChatScreen({
  title,
  avatar,
  messages,
  customerId,
  meIsCustomer,
  counterpartName,
  counterpartAvatar,
  disabled,
  onSend,
}: {
  title: string;
  avatar: string | null;
  messages: ChatMessage[];
  customerId: string;
  meIsCustomer: boolean;
  counterpartName: string;
  counterpartAvatar: string | null;
  disabled: boolean;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const send = () => {
    const t = text.trim();
    if (!t || disabled) return;
    setText("");
    onSend(t);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center gap-2.5 border-b border-line px-3 py-2.5">
        <Avatar src={avatar} name={title} size="sm" />
        <span className="truncate text-body-sm font-semibold text-fg">{title}</span>
      </header>

      <div className="flex-1 space-y-2.5 overflow-y-auto px-3 py-3">
        {messages.length === 0 && (
          <p className="pt-8 text-center text-caption text-faint">아직 대화가 없어요</p>
        )}
        {messages.map((m) => (
          <Bubble
            key={m.id}
            m={m}
            customerId={customerId}
            meIsCustomer={meIsCustomer}
            counterpartName={counterpartName}
            counterpartAvatar={counterpartAvatar}
          />
        ))}
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-line px-3 py-2.5">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="메시지"
          className="min-w-0 flex-1 rounded-full border border-line bg-surface px-3.5 py-2 text-body-sm text-fg outline-none focus:border-line-strong"
        />
        <button
          type="button"
          onClick={send}
          disabled={disabled || !text.trim()}
          className="shrink-0 cursor-pointer rounded-full bg-fg px-3.5 py-2 text-caption font-semibold text-bg disabled:opacity-40"
        >
          전송
        </button>
      </div>
    </div>
  );
}

function Bubble({
  m,
  customerId,
  meIsCustomer,
  counterpartName,
  counterpartAvatar,
}: {
  m: ChatMessage;
  customerId: string;
  meIsCustomer: boolean;
  counterpartName: string;
  counterpartAvatar: string | null;
}) {
  // 봇 판정은 '내 것이 아님' 이 아니라 **발신자가 고객이 아님** 이다 —
  // 개입 전 고객 발화도 무알림을 위해 type='bot' 으로 저장되기 때문이다(실제 화면과 같은 기준).
  const isBotSpeech = m.type === "bot" && m.sender_id !== customerId;
  const mine = meIsCustomer ? m.sender_id === customerId : m.sender_id !== customerId;

  if (m.type === "system") {
    return (
      <div className="flex justify-center py-1">
        <span className="max-w-full whitespace-pre-wrap rounded-2xl bg-fg/[0.05] px-3.5 py-2 text-center text-label text-muted">
          {m.body}
        </span>
      </div>
    );
  }

  if (m.type === "summary_card" || m.type === "contact_card") {
    return (
      <div className="flex justify-center py-1">
        <span className="rounded-xl border border-line bg-surface px-3 py-2 text-label text-muted">
          {m.type === "summary_card" ? "문의 요약 카드" : "연락처 카드"}
        </span>
      </div>
    );
  }

  if (isBotSpeech) {
    const handoff = isHandoffNotice(m.body);
    return (
      <div className={`flex items-start gap-2 ${mine ? "justify-end" : "justify-start"}`}>
        <div className={`flex min-w-0 max-w-[80%] flex-col ${mine ? "items-end" : "items-start"}`}>
          <span className="mb-0.5 text-label font-medium text-muted">{BOT_DISPLAY_NAME}</span>
          <div
            className={`whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-body-sm ${
              handoff
                ? "bg-success-soft text-success-ink ring-1 ring-success-ink/25"
                : "bg-fg/[0.07] text-fg"
            }`}
          >
            {m.body}
          </div>
          <span className="mt-0.5 text-label text-faint">
            {handoff ? timeLabel(m.created_at) : `자동 응답 · ${timeLabel(m.created_at)}`}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-end gap-1.5 ${mine ? "justify-end" : "justify-start"}`}>
      {!mine && (
        <span className="mb-0.5 shrink-0">
          <Avatar src={counterpartAvatar} name={counterpartName} size="xs" />
        </span>
      )}
      <div className={`flex min-w-0 max-w-[75%] flex-col ${mine ? "items-end" : "items-start"}`}>
        {!mine && (
          <span className="mb-0.5 text-label font-medium text-muted">{counterpartName}</span>
        )}
        {m.type === "image" && m.image_path ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.image_path} alt="" className="max-h-40 rounded-2xl object-cover" />
        ) : (
          <div
            className={`whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-body-sm ${
              mine ? "bg-fg text-bg" : "bg-fg/[0.07] text-fg"
            }`}
          >
            {m.body}
          </div>
        )}
      </div>
      <span className="mb-0.5 shrink-0 text-label text-faint">{timeLabel(m.created_at)}</span>
    </div>
  );
}
