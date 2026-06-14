"use client";

import { useState } from "react";
import { BookingComposer, type ComposerData } from "./BookingComposer";
import { CalendarIcon } from "@/components/user/icons";

// 채팅방 헤더의 '예약 제안' 버튼 — 클릭 시 신규 예약 작성기(모달) 오픈. 구매자·작가 양측.
export function ProposeBookingButton({ data }: { data: ComposerData }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="예약 제안"
        title="예약 제안"
        className="grid h-9 w-9 cursor-pointer place-items-center rounded-full text-fg/65 transition-colors hover:bg-fg/[0.06] hover:text-fg"
      >
        <CalendarIcon className="h-5 w-5" />
      </button>
      {open && <BookingComposer data={data} editTarget={null} onClose={() => setOpen(false)} />}
    </>
  );
}
