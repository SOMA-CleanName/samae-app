"use client";

// 연락처 전달 — 작가가 보내고, 고객이 고지·동의 후 받는다 (docs/32 §3-3).
//
// 받는 순간 사매의 중개는 끝나고 이후는 추적할 수 없다. 그래서 그 시점에 청약철회
// 100% 구간이 닫히고, 그 사실을 **받기 전에** 알려야 근거가 된다.
// 받은 뒤에 알리면 고지가 아니라 통보다.

import { useState, useTransition } from "react";
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
        연락처를 전달했어요 — 고객님이 확인했습니다.
      </p>
    );
  }
  if (sentAt) {
    return (
      <p className="mt-3 border-t border-line pt-3 text-caption text-muted">
        연락처를 보냈어요 — 고객님이 확인하면 전달돼요.
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
              setError(e instanceof Error ? e.message : "보내지 못했어요.");
            }
          })
        }
        className="w-full cursor-pointer rounded-full border border-line-strong py-2.5 text-body-sm font-medium text-fg transition-colors hover:bg-fg/[0.04] disabled:opacity-50"
      >
        {sending ? "보내는 중…" : "연락처 보내기"}
      </button>
      <p className="mt-1.5 text-label text-faint">
        스튜디오 프로필에 등록한 연락 수단이 전달돼요.
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
  const methods: ContactMethod[] = normalizeContactMethods(payload);
  if (methods.length === 0) return null;

  if (deliveredAt) {
    return (
      <div className="mt-3 border-t border-line pt-3">
        <p className="text-caption font-semibold text-muted">작가님 연락처</p>
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
      <div className="rounded-xl bg-warning-soft p-3.5 ring-1 ring-warning/25">
        <p className="text-caption font-semibold text-warning">
          작가님이 연락처를 보냈어요
        </p>
        <p className="mt-1.5 text-caption leading-relaxed text-warning/90">
          받으시면 촬영 준비를 작가님과 직접 이야기하실 수 있어요. 다만 그 시점부터 사매의
          중개가 끝나기 때문에, <b>전액 환불 기간이 종료되고 취소 시 결제 금액의 50%가
          위약금으로 부과됩니다.</b>
        </p>
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
          {accepting ? "처리 중…" : "확인했어요 — 연락처 받기"}
        </button>
        <p className="mt-1.5 text-center text-label text-warning/70">
          받지 않으셔도 촬영은 예정대로 진행돼요.
        </p>
      </div>
    </div>
  );
}
