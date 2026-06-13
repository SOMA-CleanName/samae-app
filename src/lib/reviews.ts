import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type Review = {
  id: string;
  booking_id: string;
  rating: number;
  body: string;
  created_at: string;
};

// 작가 후기 모아보기용 — 작성자 이름·예약(패키지/일시) 포함
export type PhotographerReview = Review & {
  user: { display_name: string | null } | null;
  booking: { shoot_at: string | null; package_snapshot: { name?: string } | null } | null;
};

// 예약 1건의 후기 (없으면 null). RLS: 공개 조회.
export async function getReviewByBooking(bookingId: string): Promise<Review | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reviews")
    .select("id, booking_id, rating, body, created_at")
    .eq("booking_id", bookingId)
    .maybeSingle();
  return (data as Review) ?? null;
}

// 한 작가의 모든 후기 (최신순). 작성자 이름은 profiles RLS(본인만)에 막히므로 admin으로 읽되,
// ⚠️ 호출자가 이 작가 본인임을 먼저 보장해야 한다(스튜디오 페이지가 me.photographer로 게이트).
export async function listReviewsForPhotographer(
  photographerId: string
): Promise<PhotographerReview[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("reviews")
    .select(
      "id, booking_id, rating, body, created_at, " +
        "user:profiles!reviews_user_id_fkey(display_name), " +
        "booking:bookings(shoot_at, package_snapshot)"
    )
    .eq("photographer_id", photographerId)
    .order("created_at", { ascending: false });
  return (data ?? []) as unknown as PhotographerReview[];
}
