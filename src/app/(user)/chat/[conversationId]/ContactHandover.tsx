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
  gate,
  sendAction = sendPhotographerContact,
}: {
  bookingId: string;
  sentAt: string | null;
  onDone: () => void;
  icon: React.ReactNode;
  /** 아직 안 열렸으면 메뉴에 아예 올리지 않는다 (HANDOFF §3-1) */
  gate?: { allowed: boolean };
  /** 기본은 진짜 서버 액션. QA 샌드박스만 갈아 끼운다 (chat-io.ts) */
  sendAction?: (formData: FormData) => Promise<void>;
}) {
  const router = useRouter();
  const [sending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // 닫혀 있으면 메뉴에서 뺀다 — 이유는 예약 카드 쪽이 말한다(한 자리에서만 설명한다)
  if (gate && !gate.allowed) return null;

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
              await sendAction(fd);
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


/**
 * 예약 카드 안의 [연락처 보내기] — + 메뉴와 같은 일을 한다.
 *
 * 두 자리에 둔 이유: + 메뉴는 '지금 보내려고 마음먹은' 작가의 자리이고, 카드는
 * 예약을 확인하다가 "아 연락처 줘야지" 를 떠올리는 자리다. 한 곳에만 두면
 * 나머지 한 동선에서는 이 기능이 없는 것처럼 보인다.
 */
export function SendContactCardButton({
  bookingId,
  sentAt,
  deliveredAt,
  gate,
  sendAction = sendPhotographerContact,
}: {
  bookingId: string;
  sentAt: string | null;
  deliveredAt: string | null;
  /** 아직 안 열렸으면 왜 닫혀 있는지 — 버튼 자리를 이 문구가 대신한다 (HANDOFF §3-1) */
  gate?: { allowed: boolean; notice?: string };
  /** 기본은 진짜 서버 액션. QA 샌드박스만 갈아 끼운다 (chat-io.ts) */
  sendAction?: (formData: FormData) => Promise<void>;
}) {
  const router = useRouter();
  const [sending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (deliveredAt)
    return (
      <p className="mt-3 border-t border-line pt-3 text-caption text-success">
        연락처를 전달했습니다.
      </p>
    );
  if (sentAt)
    return (
      <p className="mt-3 border-t border-line pt-3 text-caption text-muted">
        연락처를 보냈습니다. 고객이 확인하면 전달됩니다.
      </p>
    );

  // 촬영이 멀면 아직 열리지 않는다. 버튼을 그냥 감추면 "왜 없지" 가 되므로 이유를 남긴다
  if (gate && !gate.allowed)
    return (
      <p className="mt-3 border-t border-line pt-3 text-caption leading-relaxed text-muted">
        📵 {gate.notice}
        <br />
        <span className="text-faint">
          촬영이 가까워지면 열려요. 그 전까지는 이 채팅에서 이야기해주세요.
        </span>
      </p>
    );

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
              await sendAction(fd);
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

/** 타임라인 말풍선 — 작가는 보낸 사실만, 고객은 고지·동의 후 수령 */
export function ContactCardBubble({
  bookingId,
  payload,
  deliveredAt,
  amCustomer,
  acceptAction = acceptPhotographerContact,
}: {
  bookingId: string;
  payload: unknown;
  deliveredAt: string | null;
  amCustomer: boolean;
  /** 기본은 진짜 서버 액션. QA 샌드박스만 갈아 끼운다 (chat-io.ts) */
  acceptAction?: (formData: FormData) => Promise<void>;
}) {
  const router = useRouter();
  const [accepting, start] = useTransition();
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

        {/* 연락처 수령은 환불과 무관하다(취소환불정책 1.0). 용도 제한만 고지한다 (회원약관 6조 4항) */}
        <p className="mt-1.5 text-caption leading-relaxed text-muted">
          연락처는 이 촬영의 상담과 진행에만 사용할 수 있어요. 다른 목적으로 쓰거나 다른 사람에게 알려주시면 안 돼요.
        </p>

        <button
          type="button"
          disabled={accepting}
          onClick={() =>
            start(async () => {
              const fd = new FormData();
              fd.set("id", bookingId);
              await acceptAction(fd);
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
