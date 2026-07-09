"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { mpTrackServer } from "@/lib/mixpanel-server";

// 후기 작성/수정 (구매자, completed 예약만) — 1예약 1후기(upsert). 집계는 DB 트리거가 처리.
export async function submitReview(formData: FormData) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const bookingId = String(formData.get("bookingId"));
  const rating = Math.min(5, Math.max(1, parseInt(String(formData.get("rating") || "0"), 10) || 0));
  const body = String(formData.get("body") || "").slice(0, 1000);
  if (rating < 1) throw new Error("별점을 선택해주세요.");

  const supabase = await createClient();

  // 본인 + 완료된 예약만 후기 가능
  const { data: b } = await supabase
    .from("bookings")
    .select("id, user_id, photographer_id, status")
    .eq("id", bookingId)
    .maybeSingle();
  if (!b || b.user_id !== me.id) throw new Error("권한이 없습니다.");
  if (b.status !== "completed") throw new Error("완료된 예약만 후기를 남길 수 있어요.");

  const { error } = await supabase.from("reviews").upsert(
    {
      booking_id: bookingId,
      user_id: me.id,
      photographer_id: b.photographer_id,
      rating,
      body,
    },
    { onConflict: "booking_id" }
  );
  if (error) throw new Error(error.message);

  // 후기 작성 — 고객 타임라인. 수정(upsert)해도 1예약 1후기라 $insert_id 로 1건.
  await mpTrackServer(
    "Submit Review",
    me.id,
    { booking_id: bookingId, photographer_id: b.photographer_id, rating },
    `Submit Review:${bookingId}`,
  );

  revalidatePath(`/bookings/${bookingId}`);
}
