"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";

// 예약 템플릿 저장 — 예약 안내문/조건 + 출장비. (RLS: 본인 작가만)
export async function saveBookingTemplate(formData: FormData) {
  const me = await getCurrentUser();
  if (!me?.photographer) throw new Error("작가만 사용할 수 있습니다.");

  const note = String(formData.get("booking_note") ?? "").trim().slice(0, 1000);

  // 출장비: 빈 값/음수면 0
  const rawFee = String(formData.get("travel_fee_krw") ?? "").trim();
  let travelFee = 0;
  if (rawFee !== "") {
    const n = Math.trunc(Number(rawFee));
    travelFee = Number.isFinite(n) && n > 0 ? n : 0;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("photographers")
    .update({ booking_note: note || null, travel_fee_krw: travelFee })
    .eq("id", me.photographer.id);
  if (error) throw new Error(error.message);
  revalidatePath("/studio/booking");
}
