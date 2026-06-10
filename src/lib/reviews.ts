import "server-only";

import { createClient } from "@/lib/supabase/server";

export type Review = {
  id: string;
  booking_id: string;
  rating: number;
  body: string;
  created_at: string;
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
