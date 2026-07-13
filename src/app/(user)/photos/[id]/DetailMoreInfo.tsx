"use client";

import { useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui";
import { ChevronRightIcon } from "@/components/user/icons";
import { PartnerBadge } from "@/components/user/PartnerBadge";

// 작가 프로필·작가 글·태그를 기본 접어두고, 누르면 펼친다(전환 최우선 — 가격·CTA만 먼저).
export function DetailMoreInfo({
  photographerId,
  avatarUrl,
  caption,
  partner = false,
}: {
  photographerId: string;
  avatarUrl: string | null;
  caption: string | null;
  // 사매 파트너 작가 뱃지 노출 여부(본인 사진엔 미노출)
  partner?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-4 border-t border-line pt-3">
      {/* '작가 · 상세 정보' 토글 + 파트너 뱃지 한 줄. 뱃지도 버튼이라 토글 버튼과 형제로 배치. */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex cursor-pointer items-center gap-1 py-1 text-sm font-medium text-muted transition-colors hover:text-fg"
        >
          <span>작가 · 상세 정보</span>
          <ChevronRightIcon
            className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`}
          />
        </button>
        {partner && <PartnerBadge />}
      </div>

      {open && (
        <div className="mt-3">
          {/* 작가 프로필(익명) */}
          <Link
            href={`/photographers/${photographerId}`}
            className="flex items-center gap-3 rounded-2xl border border-line p-3 transition-colors hover:bg-surface-2"
          >
            <Avatar src={avatarUrl} name="사진작가" size="md" />
            <span className="min-w-0 flex-1 truncate text-body font-medium text-fg">
              이 작가의 다른 사진 보기
            </span>
            <ChevronRightIcon className="h-4 w-4 shrink-0 text-faint" />
          </Link>

          {caption && (
            <p className="mt-5 whitespace-pre-wrap text-body text-fg/80">{caption}</p>
          )}
        </div>
      )}
    </div>
  );
}
