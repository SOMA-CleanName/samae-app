"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { mpTrackServer } from "@/lib/mixpanel-server";

// 주간 격자 전체 저장 (전부 교체) — 연속 칸은 [start,end] 구간으로 병합된 채 전달됨
export async function saveRules(
  ranges: { weekday: number; start_time: string; end_time: string }[]
) {
  const me = await getCurrentUser();
  if (!me?.photographer) throw new Error("작가만 가능합니다.");
  const pid = me.photographer.id;

  // 검증: 요일 0~6, HH:00 형식(종료는 24:00 허용), 시작<종료
  const clean = ranges
    .filter(
      (r) =>
        r.weekday >= 0 &&
        r.weekday <= 6 &&
        /^\d\d:00$/.test(r.start_time) &&
        /^\d\d:00$/.test(r.end_time) &&
        r.start_time < r.end_time
    )
    .slice(0, 200);

  const supabase = await createClient();
  await supabase.from("availability_rules").delete().eq("photographer_id", pid);
  if (clean.length > 0) {
    const { error } = await supabase
      .from("availability_rules")
      .insert(clean.map((r) => ({ ...r, photographer_id: pid })));
    if (error) throw new Error(error.message);
  }

  await mpTrackServer("Set Availability", me.id, { rule_count: clean.length });

  revalidatePath("/studio/availability");
}

// 특정 일시 차단 추가 — 입력은 KST(+09:00) 로 해석
export async function addBlock(formData: FormData) {
  const me = await getCurrentUser();
  if (!me?.photographer) throw new Error("작가만 가능합니다.");
  const date = String(formData.get("date") || "");
  const start = String(formData.get("start_time") || "");
  const end = String(formData.get("end_time") || "");
  if (!date || !start || !end || start >= end) throw new Error("날짜와 시간을 확인해주세요.");

  const startAt = new Date(`${date}T${start}:00+09:00`);
  const endAt = new Date(`${date}T${end}:00+09:00`);
  if (isNaN(startAt.getTime()) || isNaN(endAt.getTime())) throw new Error("시간 형식 오류");

  const supabase = await createClient();
  const { error } = await supabase.from("availability_blocks").insert({
    photographer_id: me.photographer.id,
    start_at: startAt.toISOString(),
    end_at: endAt.toISOString(),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/studio/availability");
}

export async function removeBlock(formData: FormData) {
  const me = await getCurrentUser();
  if (!me?.photographer) throw new Error("작가만 가능합니다.");
  const supabase = await createClient();
  await supabase.from("availability_blocks").delete().eq("id", String(formData.get("id")));
  revalidatePath("/studio/availability");
}
