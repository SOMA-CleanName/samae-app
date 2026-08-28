"use client";

import { useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui";
import { ChevronRightIcon } from "@/components/user/icons";

// 작가 프로필·작가 글을 기본 접어두고, 누르면 펼친다(전환 최우선 — 가격·CTA만 먼저).
// 패키지 정보(촬영시간·보정본·가격·촬영 위치)는 PackageInfoSection 으로 빠졌다 — 여기서 중복 노출 금지.
export function DetailMoreInfo({
  photographerId,
  avatarUrl,
  caption,
}: {
  photographerId: string;
  avatarUrl: string | null;
  caption: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="photo-detail-more-info"
        className="flex w-full cursor-pointer items-center justify-between gap-4 px-4 py-4 text-left transition-colors hover:bg-surface-2"
      >
        <span>
          <span className="block text-[11px] font-medium text-muted">이 사진에 관심있나요?</span>
          <span className="mt-0.5 block text-body font-semibold text-fg">작가 정보</span>
        </span>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-fg/[0.06] text-muted">
          <ChevronRightIcon
            className={`h-4 w-4 transition-transform duration-300 ${open ? "rotate-90" : ""}`}
          />
        </span>
      </button>

      <div
        id="photo-detail-more-info"
        aria-hidden={!open}
        inert={!open}
        className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
          open ? "grid-rows-[1fr] opacity-100" : "pointer-events-none grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div
            className={`border-t border-line px-3 pb-4 pt-3 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
              open ? "translate-y-0" : "-translate-y-3"
            }`}
          >
          {/* 작가 홈 — 누구에게 맡기는지 먼저 확인 */}
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

          {caption && (
            <div className="mt-3 rounded-2xl bg-bg p-4">
              {/* 패키지 설명은 위 섹션으로 갔다 — 여기 글은 이 사진에 대한 작가의 코멘트 */}
              <p className="text-[11px] font-medium text-brand">작가의 글</p>
              <p className="mt-2 whitespace-pre-wrap text-body leading-relaxed text-fg/80">{caption}</p>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
