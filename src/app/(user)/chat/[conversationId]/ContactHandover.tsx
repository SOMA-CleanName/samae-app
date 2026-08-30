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

/** 작가 화면 — 확정된 예약 카드의 [연락처 보내기] */
export function SendContactButton({
  bookingId,
  sentAt,
  deliveredAt,
}: {
  bookingId: string;
  sentAt: string | null;
  deliveredAt: string | null;
}) {
  const router = useRouter();
  const [sending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (deliveredAt) {
    return (
      <p className="mt-3 border-t border-line pt-3 text-caption text-success">
        연락처를 전달했습니다.
      </p>
    );
  }
  if (sentAt) {
    return (
      <p className="mt-3 border-t border-line pt-3 text-caption text-muted">
        연락처를 보냈습니다. 고객이 확인하면 전달됩니다.
      </p>
    );
  }

  return (
    <div className="mt-3 border-t border-line pt-3">
      <button
        type="button"
        disabled={sending}
        onClick={() =>
          start(async () => {
            setError(null);
            try {
              const fd = new FormData();
              fd.set("id", bookingId);
              await sendPhotographerContact(fd);
              router.refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : "보내지 못했습니다.");
            }
          })
        }
        className="w-full cursor-pointer rounded-full border border-line-strong py-2.5 text-body-sm font-medium text-fg transition-colors hover:bg-fg/[0.04] disabled:opacity-50"
      >
        {sending ? "보내는 중…" : "연락처 보내기"}
      </button>
      <p className="mt-1.5 text-label text-faint">
        스튜디오 프로필에 등록한 연락 수단이 전달됩니다.
      </p>
      {error && <p className="mt-1.5 text-caption text-danger">{error}</p>}
    </div>
  );
}

/** 고객 화면 — 받기 전 고지 + 동의, 받은 뒤 연락처 표시 */
export function ReceiveContactCard({
  bookingId,
  payload,
  deliveredAt,
}: {
  bookingId: string;
  payload: unknown;
  deliveredAt: string | null;
}) {
  const router = useRouter();
  const [accepting, start] = useTransition();
  // 지금 취소하면 얼마인지를 실제로 물어본다 — 어드민 판정과 같은 함수다.
  // 이미 위약금 구간이면 연락처를 받아도 달라지는 게 없으므로, 그때 '조건이 바뀐다'고
  // 말하면 거짓말이 된다.
  const [quote, setQuote] = useState<CustomerRefundQuote | null>(null);
  useEffect(() => {
    if (deliveredAt) return;
    let active = true;
    getCustomerRefundQuote(bookingId).then((q) => {
      if (active) setQuote(q);
    });
    return () => {
      active = false;
    };
  }, [bookingId, deliveredAt]);

  const methods: ContactMethod[] = normalizeContactMethods(payload);
  if (methods.length === 0) return null;

  if (deliveredAt) {
    return (
      <div className="mt-3 border-t border-line pt-3">
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

  return (
    <div className="mt-3 border-t border-line pt-3">
      {/* 노란 배경 위의 노란 글씨는 읽히지 않는다 — 배경은 흰 카드로 두고 테두리로만 경고한다 */}
      <div className="rounded-xl bg-surface p-3.5 ring-1 ring-warning/40">
        <p className="text-body-sm font-semibold text-fg">작가 연락처가 도착했습니다</p>

        {/* 규칙은 한 줄로 말하고, 금액은 표로 보여준다.
            이미 위약금 구간이면 '부과됩니다'가 거짓이 되므로 그때만 문장이 바뀐다. */}
        {quote &&
          (quote.percent === 100 ? (
            <>
              <p className="mt-1.5 text-caption leading-relaxed text-muted">
                작가 연락처를 받은 이후에는 환불 시 50% 위약금이 부과됩니다.
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
                    <span className="ml-1 text-caption font-medium">· 50% 위약금</span>
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
