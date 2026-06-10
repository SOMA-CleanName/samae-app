import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AvailRule, TimeRange } from "@/lib/slots";

// 점유로 간주하는 예약 상태 (시간이 막힘)
const BUSY_STATUSES = ["accepted", "paid", "shot", "delivered", "completed"];

// 작가 주간 가능시간 규칙
export async function getRules(photographerId: string): Promise<AvailRule[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("availability_rules")
    .select("weekday, start_time, end_time")
    .eq("photographer_id", photographerId)
    .order("weekday", { ascending: true })
    .order("start_time", { ascending: true });
  return (data ?? []) as AvailRule[];
}

// 작가 차단 구간 (미래만)
export async function getBlocks(photographerId: string): Promise<TimeRange[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("availability_blocks")
    .select("start_at, end_at")
    .eq("photographer_id", photographerId)
    .gte("end_at", new Date().toISOString())
    .order("start_at", { ascending: true });
  return (data ?? []).map((b) => ({ start: b.start_at, end: b.end_at }));
}

// 작가 예약 점유 시간대 — 개인정보 없이 [start,end] 만. (service_role: 타인 예약도 시간만 노출)
export async function getBusyRanges(photographerId: string): Promise<TimeRange[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("bookings")
    .select("shoot_at, duration_min, package_snapshot")
    .eq("photographer_id", photographerId)
    .in("status", BUSY_STATUSES)
    .not("shoot_at", "is", null);

  return (data ?? []).map((b) => {
    const dur =
      b.duration_min ??
      (b.package_snapshot as { duration_min?: number } | null)?.duration_min ??
      60;
    const start = new Date(b.shoot_at as string);
    const end = new Date(start.getTime() + dur * 60000);
    return { start: start.toISOString(), end: end.toISOString() };
  });
}
