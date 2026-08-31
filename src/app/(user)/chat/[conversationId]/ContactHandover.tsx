"use client";

// 연락처 전달 — 작가가 보내고, 고객이 고지·동의 후 받는다 (docs/32 §3-3).
//
// 받는 순간 사매의 중개는 끝나고 이후는 추적할 수 없다. 그래서 그 시점에 청약철회
// 100% 구간이 닫히고, 그 사실을 **받기 전에** 알려야 근거가 된다.
// 받은 뒤에 알리면 고지가 아니라 통보다.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  acceptPhotographerContact,
  sendPhotographerContact,
} from "@/app/actions/contact-handover";
import {
  contactHref,
  contactLabel,
  normalizeContactMethods,
  type ContactMethod,
} from "@/lib/photographer-contacts";
import { getCustomerRefundQuote, type CustomerRefundQuote } from "@/app/actions/refund-quote";

const fmt = new Intl.NumberFormat("ko-KR");

/**
 * 작가 화면 — 입력창 + 메뉴의 [연락처 보내기].
 *
 * 예약 카드 안에 두면 대화가 쌓일 때 같이 밀려 올라간다. 보내는 건 '지금 하는 행동' 이라
 * 사진 보내기와 같은 자리에 있는 게 맞다.
 */
export function SendContactMenuItem({
  bookingId,
  sentAt,
  onDone,
  icon,
}: {
  bookingId: string;
  sentAt: string | null;
  onDone: () => void;
  icon: React.ReactNode;
}) {
  const router = useRouter();
  const [sending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        disabled={sending || !!sentAt}
        onClick={() =>
          start(async () => {
            setError(null);
            try {
              const fd = new FormData();
              fd.set("id", bookingId);
              await sendPhotographerContact(fd);
              onDone();
              router.refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : "보내지 못했습니다.");
            }
          })
        }
        className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left text-body-sm text-fg transition-colors hover:bg-fg/[0.04] disabled:opacity-40"
      >
        {icon}
        {sentAt ? "연락처 보냄" : sending ? "보내는 중…" : "연락처 보내기"}
      </button>
      {error && <p className="px-3 pb-2 text-caption text-danger">{error}</p>}
    </>
  );
}

/** 타임라인 말풍선 — 작가는 보낸 사실만, 고객은 고지·동의 후 수령 */
export function ContactCardBubble({
  bookingId,
  payload,
  deliveredAt,
  amCustomer,
}: {
  bookingId: string;
  payload: unknown;
  deliveredAt: string | null;
  amCustomer: boolean;
}) {
  const router = useRouter();
  const [accepting, start] = useTransition();
  // 지금 취소하면 얼마인지를 실제로 물어본다 — 어드민 판정과 같은 함수다.
  // 이미 위약금 구간이면 연락처를 받아도 달라지는 게 없으므로, 그때 '조건이 바뀐다'고
  // 말하면 거짓말이 된다.
  const [quote, setQuote] = useState<CustomerRefundQuote | null>(null);
  useEffect(() => {
    if (deliveredAt || !amCustomer) return;
    let active = true;
    getCustomerRefundQuote(bookingId).then((q) => {
      if (active) setQuote(q);
    });
    return () => {
      active = false;
    };
  }, [bookingId, deliveredAt, amCustomer]);

  const methods: ContactMethod[] = normalizeContactMethods(payload);
  if (methods.length === 0) return null;

  if (deliveredAt) {
    return (
      <div className="mx-auto w-full max-w-sm rounded-2xl border border-line bg-surface p-4">
        <p className="text-caption font-semibold text-muted">작가 연락처</p>
        <ul className="mt-2 flex flex-col gap-1.5">
          {methods.map((c) => {
            const href = contactHref(c);
            return (
              <li key={c.id} className="flex items-center gap-2 text-body-sm">
                <span className="w-16 shrink-0 text-caption text-muted">{contactLabel(c)}</span>
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 flex-1 truncate text-fg underline underline-offset-2"
                  >
                    {c.value}
                  </a>
                ) : (
                  <span className="min-w-0 flex-1 break-all text-fg">{c.value}</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  // 작가 화면 — 보낸 사실만 남긴다. 받는 건 고객의 몫이다
  if (!amCustomer) {
    return (
      <div className="mx-auto w-full max-w-sm rounded-2xl border border-line bg-surface px-4 py-3">
        <p className="text-caption font-semibold text-muted">연락처를 보냈습니다</p>
        <p className="mt-1 text-caption text-faint">고객이 안내를 확인하고 받으면 전달돼요.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-sm">
      {/* 노란 배경 위의 노란 글씨는 읽히지 않는다 — 배경은 흰 카드로 두고 테두리로만 경고한다 */}
      <div className="rounded-2xl bg-surface p-4 ring-1 ring-warning/40">
        <p className="text-body-sm font-semibold text-fg">작가님이 연락처를 보냈습니다</p>

        {/* 규칙은 한 줄로 말하고, 금액은 표로 보여준다.
            이미 위약금 구간이면 '부과됩니다'가 거짓이 되므로 그때만 문장이 바뀐다. */}
        {quote &&
          (quote.percent === 100 ? (
            <>
              <p className="mt-1.5 text-caption leading-relaxed text-muted">
                작가 연락처를 받은 이후에는 환불 시 지불 금액의 50%가 환불됩니다.
              </p>
              <dl className="mt-2.5 flex flex-col gap-2 rounded-lg bg-surface-2 p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-caption text-muted">지금 취소</dt>
                  <dd className="text-body-sm font-semibold text-fg">
                    ₩{fmt.format(quote.amountKrw)} 전액 환불
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-t border-line pt-2">
                  <dt className="text-caption font-medium text-fg">받은 뒤 취소</dt>
                  <dd className="text-body-sm font-bold text-danger">
                    ₩{fmt.format(Math.round(quote.amountKrw / 2))}
                    <span className="ml-1 text-caption font-medium">· 50% 환불</span>
                  </dd>
                </div>
              </dl>
            </>
          ) : (
            <p className="mt-1.5 text-caption leading-relaxed text-muted">
              연락처를 받아도 환불 조건은 그대로입니다.
            </p>
          ))}

        <button
          type="button"
          disabled={accepting}
          onClick={() =>
            start(async () => {
              const fd = new FormData();
              fd.set("id", bookingId);
              await acceptPhotographerContact(fd);
              router.refresh();
            })
          }
          className="mt-3 w-full cursor-pointer rounded-full bg-fg py-2.5 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {accepting ? "처리 중…" : "연락처 받기"}
        </button>
      </div>
    </div>
  );
}
