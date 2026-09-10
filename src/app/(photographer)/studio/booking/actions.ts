"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { mpTrackServer } from "@/lib/mixpanel-server";
import { normalizeBookingFields } from "@/lib/booking-fields";

// 예약 설정 저장 — 예약서 추가 항목. (RLS: 본인 작가만)
export async function saveBookingTemplate(formData: FormData) {
  const me = await getCurrentUser();
  if (!me?.photographer) throw new Error("작가만 사용할 수 있습니다.");

  // 예약서 추가 항목 — 편집기가 JSON 으로 실어보낸다. 규칙 위반은 저장 전에 막는다.
  // 편집기가 JSON 으로 실어보낸다. 형식이 깨졌거나 덜 채운 항목은 조용히 버린다 —
  // 여기서 throw 하면 설정 페이지가 통째로 런타임 에러로 죽는다. 안내는 편집기가 한다.
  let bookingFields: unknown = [];
  try {
    bookingFields = JSON.parse(String(formData.get("booking_fields") ?? "[]"));
  } catch {
    bookingFields = [];
  }
  const { fields } = normalizeBookingFields(bookingFields);

  const supabase = await createClient();
  const { error } = await supabase
    .from("photographers")
    .update({
      booking_fields: fields,
    })
    .eq("id", me.photographer.id);
  if (error) throw new Error(error.message);

  await mpTrackServer("Save Booking Template", me.id, {
    custom_fields: fields.length,
  });

  revalidatePath("/studio/booking");
}
