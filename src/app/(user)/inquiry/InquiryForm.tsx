"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { submitInquiry, type InquiryState } from "./actions";

const INITIAL_STATE: InquiryState = { ok: false };

export function InquiryForm({
  photographerId,
  photoId,
  initialPhone,
  initialInstagramId,
  initialDiscordId,
  initialContactEmail,
  briefRequiredAfter,
}: {
  photographerId: string;
  photoId: string;
  initialPhone: string;
  initialInstagramId: string;
  initialDiscordId: string;
  initialContactEmail: string;
  briefRequiredAfter: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(submitInquiry, INITIAL_STATE);
  const [phone, setPhone] = useState(formatPhone(initialPhone));
  const [instagramId, setInstagramId] = useState(initialInstagramId);
  const [discordId, setDiscordId] = useState(initialDiscordId);
  const [contactEmail, setContactEmail] = useState(initialContactEmail);
  const [showSuccess, setShowSuccess] = useState(false);
  const returnPath = photoId ? `/photos/${photoId}` : `/photographers/${photographerId}`;

  useEffect(() => {
    if (!state.ok) return;
    setShowSuccess(true);
    const id = window.setTimeout(() => {
      setShowSuccess(false);
      router.push(returnPath);
    }, 5000);
    return () => window.clearTimeout(id);
  }, [returnPath, router, state.ok]);

  useEffect(() => {
    if (!state.values) return;
    setPhone(formatPhone(state.values.phone));
    setInstagramId(state.values.instagramId);
    setDiscordId(state.values.discordId);
    setContactEmail(state.values.contactEmail);
  }, [state.values]);

  return (
    <>
      <form action={formAction} className="mt-6 space-y-4">
        <input type="hidden" name="photographerId" value={photographerId} />
        <input type="hidden" name="photoId" value={photoId} />
        <input type="hidden" name="briefRequiredAfter" value={briefRequiredAfter} />
        <p className="text-sm font-medium text-fg/80">연락 가능한 수단을 하나 이상 입력해주세요.</p>

        <label className="block">
          <span className="text-sm font-medium text-fg/80">전화번호</span>
          <input
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(event) => setPhone(formatPhone(event.target.value))}
            placeholder="010-1234-5678"
            pattern="0[0-9]{2}-[0-9]{4}-[0-9]{4}"
            className="mt-2 h-12 w-full rounded-xl border border-line-strong bg-white px-4 text-base outline-none transition-colors placeholder:text-fg/30 focus:border-fg/45"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-fg/80">인스타 아이디</span>
          <input
            name="instagramId"
            type="text"
            autoComplete="off"
            value={instagramId}
            onChange={(event) => setInstagramId(event.target.value)}
            placeholder="@samae.photo"
            className="mt-2 h-12 w-full rounded-xl border border-line-strong bg-white px-4 text-base outline-none transition-colors placeholder:text-fg/30 focus:border-fg/45"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-fg/80">디스코드 아이디</span>
          <input
            name="discordId"
            type="text"
            autoComplete="off"
            value={discordId}
            onChange={(event) => setDiscordId(event.target.value)}
            placeholder="samae#1234"
            className="mt-2 h-12 w-full rounded-xl border border-line-strong bg-white px-4 text-base outline-none transition-colors placeholder:text-fg/30 focus:border-fg/45"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-fg/80">사용하는 이메일</span>
          <input
            name="contactEmail"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={contactEmail}
            onChange={(event) => setContactEmail(event.target.value)}
            placeholder="name@example.com"
            className="mt-2 h-12 w-full rounded-xl border border-line-strong bg-white px-4 text-base outline-none transition-colors placeholder:text-fg/30 focus:border-fg/45"
          />
        </label>

        {state.error && <p className="text-sm font-medium text-brand">{state.error}</p>}

        <Button type="submit" size="lg" fullWidth loading={pending}>
          다음
        </Button>
      </form>

      {showSuccess && state.message && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-4 font-kr">
          <div className="w-full max-w-sm rounded-2xl bg-bg p-5 text-center shadow-pop">
            <p className="text-base font-semibold text-fg">{state.message}</p>
          </div>
        </div>
      )}
    </>
  );
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}
