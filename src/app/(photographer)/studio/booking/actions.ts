"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";

// 예약 템플릿 저장 — 예약 안내문/조건 + 출장비. (RLS: 본인 작가만)
export async function saveBookingTemplate(formData: FormData) {
  const me = await getCurrentUser();
  if (!me?.photographer) throw new Error("작가만 사용할 수 있습니다.");

  const note = String(formData.get("booking_note") ?? "").trim().slice(0, 1000);

  // 출장비: 자유 텍스트 안내 (예: "성수 무료, 그 외 지역 협의"). 고정 금액 add-on은 비활성(0).
  const travelNote = String(formData.get("travel_fee_note") ?? "").trim().slice(0, 300);

  const supabase = await createClient();
  const { error } = await supabase
    .from("photographers")
    .update({
      booking_note: note || null,
      travel_fee_note: travelNote || null,
      travel_fee_krw: 0,
    })
    .eq("id", me.photographer.id);
  if (error) throw new Error(error.message);
  revalidatePath("/studio/booking");
}
