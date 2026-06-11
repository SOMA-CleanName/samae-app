"use client";

import { useState } from "react";
import { BookingComposer, type ComposerData } from "./BookingComposer";

// 채팅방 헤더의 '예약 제안' 버튼 — 클릭 시 신규 예약 작성기(모달) 오픈. 구매자·작가 양측.
export function ProposeBookingButton({ data }: { data: ComposerData }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-fg/50 hover:text-fg"
      >
        📋 예약 제안
      </button>
      {open && <BookingComposer data={data} editTarget={null} onClose={() => setOpen(false)} />}
    </>
  );
}
