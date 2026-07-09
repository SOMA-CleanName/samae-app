"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { Avatar } from "@/components/ui";
import { ChevronDownIcon } from "@/components/user/icons";
import { inquiryStatusLabel, type MyInquiry } from "@/lib/my-inquiries-view";

export function MyInquiryList({ inquiries }: { inquiries: MyInquiry[] }) {
  return (
    <ul className="mt-4 space-y-2.5">
      {inquiries.map((iq) => (
        <MyInquiryItem key={iq.id} iq={iq} />
      ))}
    </ul>
  );
}

const TONE: Record<string, string> = {
  wait: "bg-fg/[0.06] text-muted",
  active: "bg-brand/10 text-brand",
  done: "bg-fg/[0.06] text-fg/60",
};

function MyInquiryItem({ iq }: { iq: MyInquiry }) {
  const [open, setOpen] = useState(false);
  const st = inquiryStatusLabel(iq.status);
  const date = new Date(iq.createdAt).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <li className="overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 p-3 text-left"
        aria-expanded={open}
      >
        <Avatar src={iq.photographerAvatar} name="사진작가" size="md" />
        {iq.photoThumb && (
          <img
            src={iq.photoThumb}
            alt="문의한 사진"
            className="h-12 w-12 shrink-0 rounded-lg object-cover"
            loading="lazy"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-body-sm font-medium text-fg">사진작가에게 문의</p>
          <p className="text-caption text-muted">{date}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-caption font-medium ${TONE[st.tone]}`}>
          {st.label}
        </span>
        <ChevronDownIcon
          className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* 펼침 상세 — 내가 보낸 내용 */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <dl className="space-y-2 border-t border-line px-3 py-3 text-body-sm">
            <Row label="목적" value={iq.purpose} />
            <Row label="희망일" value={iq.preferredDate} />
            <Row label="지역" value={iq.region} />
            {iq.partySize ? <Row label="인원" value={`${iq.partySize}명`} /> : null}
            <Row label="연락처" value={contactSummary(iq)} />
            {iq.note ? <Row label="메모" value={iq.note} /> : null}
            {iq.refImages.length > 0 && (
              <div className="pt-1">
                <dt className="mb-1 text-caption text-muted">참고 사진</dt>
                <div className="flex flex-wrap gap-1.5">
                  {iq.refImages.map((src, i) => (
                    <img
                      key={i}
                      src={src}
                      alt={`참고 ${i + 1}`}
                      className="h-16 w-16 rounded-lg object-cover ring-1 ring-line"
                      loading="lazy"
                    />
                  ))}
                </div>
              </div>
            )}
          </dl>
        </div>
      </div>
    </li>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-14 shrink-0 text-caption text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 whitespace-pre-wrap break-words text-fg">{value}</dd>
    </div>
  );
}

function contactSummary(iq: MyInquiry): string {
  const parts: string[] = [];
  if (iq.phone) parts.push(`전화 ${iq.phone}`);
  if (iq.instagram) parts.push(`인스타 ${iq.instagram}`);
  if (iq.kakao) parts.push(`카카오 ${iq.kakao}`);
  if (iq.extraContact) parts.push(iq.extraContact);
  return parts.join(" · ") || "-";
}
