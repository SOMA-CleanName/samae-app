"use client";

import { useState } from "react";
import { BookingComposer, type ComposerData } from "./BookingComposer";
import { CalendarIcon } from "@/components/user/icons";

// 채팅방 헤더의 '예약 작성' 버튼 — 클릭 시 예약서 작성기(모달) 오픈. 구매자·작가 양측.
// 아이콘만 두면 무슨 기능인지 알 수 없다. 거래를 여는 동선이라 글자로 드러낸다.
export function ProposeBookingButton({ data }: { data: ComposerData }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex shrink-0 cursor-pointer items-center gap-1 rounded-full border border-line-strong px-3 py-1.5 text-caption font-semibold text-fg transition-colors hover:bg-fg/[0.05]"
      >
        <CalendarIcon className="h-3.5 w-3.5" />
        예약 작성
      </button>
      {open && <BookingComposer data={data} editTarget={null} onClose={() => setOpen(false)} />}
    </>
  );
}
