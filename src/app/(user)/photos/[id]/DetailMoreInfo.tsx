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
  moodTags,
}: {
  photographerId: string;
  avatarUrl: string | null;
  caption: string | null;
  moodTags: string[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-4 border-t border-line pt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between py-1 text-sm font-medium text-muted transition-colors hover:text-fg"
      >
        <span>작가 · 상세 정보</span>
        <ChevronRightIcon
          className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>

      {open && (
        <div className="mt-3">
          {/* 작가 프로필(익명) */}
          <Link
            href={`/photographers/${photographerId}`}
            className="flex items-center gap-3 rounded-2xl border border-line p-3 transition-colors hover:bg-surface-2"
          >
            <Avatar src={avatarUrl} name="사진작가" size="md" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body font-semibold">사진작가</span>
              <span className="block text-caption text-muted">이 작가의 다른 사진 보기</span>
            </span>
            <ChevronRightIcon className="h-4 w-4 shrink-0 text-faint" />
          </Link>

          {caption && (
            <p className="mt-5 whitespace-pre-wrap text-body text-fg/80">{caption}</p>
          )}

          {moodTags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {moodTags.map((m) => (
                <span
                  key={m}
                  className="rounded-full bg-fg/[0.06] px-2.5 py-1 text-caption text-fg/70"
                >
                  #{m}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
