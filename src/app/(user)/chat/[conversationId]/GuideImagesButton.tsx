"use client";

// 촬영 안내 보기 — 작가가 올린 안내 이미지를 채팅방 안에서 연다.
//
// 왜 채팅방에도 두는가: "어떻게 진행되나요 / 뭘 준비하죠" 는 대화 처음부터 예약 확정 직후까지
// 아무 때나 생기는 질문이다. 사진 상세에서 이미 봤더라도 다시 찾아 나가야 하고,
// /chat/start 로 바로 들어온 손님은 아예 본 적이 없다.
//
// 두 모양으로 쓴다:
//   icon   — 헤더 상시 노출 (사라지지 않는 자리)
//   inline — 봇 첫 인사 바로 아래 1회 (아이콘만으로는 발견이 안 되므로)

import { useState } from "react";
import { ClipboardIcon } from "@/components/user/icons";
import { GuideImageViewer } from "@/components/user/GuideImageGallery";
import type { GuideImage } from "@/lib/guide-images";

export function GuideImagesButton({
  images,
  variant = "icon",
}: {
  images: GuideImage[];
  variant?: "icon" | "inline";
}) {
  const [open, setOpen] = useState(false);

  // 안내 이미지가 없는 작가는 버튼 자체를 숨긴다 — 빈 뷰어가 열리는 것보다 없는 게 낫다
  if (images.length === 0) return null;

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="촬영 안내 보기"
          title="촬영 안내 보기"
          className="grid h-9 w-9 cursor-pointer place-items-center rounded-full text-fg/65 transition-colors hover:bg-fg/[0.06] hover:text-fg"
        >
          <ClipboardIcon className="h-5 w-5" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex cursor-pointer items-center gap-1.5 self-start rounded-full bg-fg/[0.06] px-3.5 py-2 text-caption font-medium text-fg ring-1 ring-line transition-colors hover:bg-fg/10"
        >
          <ClipboardIcon className="h-3.5 w-3.5" />
          촬영 안내 보기 ({images.length}장)
        </button>
      )}

      {open && (
        <GuideImageViewer images={images} startIndex={0} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
