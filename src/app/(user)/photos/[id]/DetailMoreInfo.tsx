"use client";

import { useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui";
import { ChevronRightIcon } from "@/components/user/icons";

// 작가 프로필·작가 글·태그를 기본 접어두고, 누르면 펼친다(전환 최우선 — 가격·CTA만 먼저).
export function DetailMoreInfo({
  photographerId,
  avatarUrl,
  caption,
  packageInfo,
}: {
  photographerId: string;
  avatarUrl: string | null;
  caption: string | null;
  packageInfo: {
    name: string | null;
    description: string | null;
    price: number | null;
    duration: string | null;
    editedCount: number | null;
    location: string | null;
  };
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between gap-4 px-4 py-4 text-left transition-colors hover:bg-surface-2"
      >
        <span>
          <span className="block text-[11px] font-medium text-muted">이 사진에 관심있나요?</span>
          <span className="mt-0.5 block text-body font-semibold text-fg">작가 · 패키지 정보</span>
        </span>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-fg/[0.06] text-muted">
          <ChevronRightIcon
            className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`}
          />
        </span>
      </button>

      {open && (
        <div className="border-t border-line px-3 pb-4 pt-3">
          {/* 작가 홈 — 패키지보다 먼저 신뢰할 대상을 확인 */}
          <Link
            href={`/photographers/${photographerId}`}
            className="group flex items-center gap-3 rounded-2xl bg-bg p-3 transition-colors hover:bg-surface-2"
          >
            <Avatar src={avatarUrl} name="사진작가" size="md" />
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] text-muted">이 촬영을 진행하는</span>
              <span className="mt-0.5 block truncate text-body font-semibold text-fg">작가 홈 가기</span>
            </span>
            <ChevronRightIcon className="h-4 w-4 shrink-0 text-faint transition-transform group-hover:translate-x-0.5" />
          </Link>

          {/* 패키지 — 가격을 중심으로 조건을 한눈에 비교할 수 있는 카드 */}
          <div className="mt-3 rounded-2xl bg-fg/[0.04] p-4">
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-brand">패키지 정보</p>
                <p className="mt-1 truncate text-body font-semibold text-fg">
                  {packageInfo.name ?? "촬영 패키지"}
                </p>
              </div>
              <p className="shrink-0 text-title font-bold tracking-tight text-fg">
                {packageInfo.price != null
                  ? `₩${packageInfo.price.toLocaleString("ko-KR")}`
                  : "가격 · 장소 협의"}
              </p>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-2">
              {packageInfo.duration && <InfoTile label="촬영 시간" value={packageInfo.duration} />}
              {packageInfo.editedCount != null && (
                <InfoTile label="제공 보정본" value={`${packageInfo.editedCount}장`} />
              )}
              {packageInfo.location && (
                <InfoTile className="col-span-2" label="촬영 장소" value={packageInfo.location} />
              )}
            </dl>

            <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-brand/20 bg-brand/[0.07] px-3 py-3">
              <svg
                viewBox="0 0 24 24"
                className="mt-0.5 h-4 w-4 shrink-0 text-brand"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden
              >
                <path d="M5 5.5h14v10H9l-4 3v-13z" strokeLinejoin="round" />
                <path d="M8 9h8M8 12h5" strokeLinecap="round" />
              </svg>
              <p className="text-body-sm leading-relaxed text-fg/80">
                패키지 제공 내용(시간, 장소 등)은 작가님께 문의하면 협의할 수 있어요.
              </p>
            </div>

            {packageInfo.description && (
              <p className="mt-3 whitespace-pre-wrap border-t border-line pt-3 text-body-sm leading-relaxed text-muted">
                {packageInfo.description}
              </p>
            )}
          </div>

          {caption && (
            <div className="mt-3 rounded-2xl bg-bg p-4">
              <p className="text-[11px] font-medium text-brand">패키지 설명</p>
              <p className="mt-2 whitespace-pre-wrap text-body leading-relaxed text-fg/80">{caption}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InfoTile({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={`rounded-xl bg-bg px-3 py-2.5 ${className}`}>
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="mt-0.5 text-body-sm font-semibold text-fg">{value}</dd>
    </div>
  );
}
