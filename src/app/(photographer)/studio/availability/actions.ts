"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";

async function requirePhotographerId(): Promise<string> {
  const me = await getCurrentUser();
  if (!me?.photographer) throw new Error("작가만 사용할 수 있습니다.");
  return me.photographer.id;
}

const SlotSchema = z
  .object({
    start: z.string().min(1, "시작 시간을 입력하세요"),
    end: z.string().min(1, "종료 시간을 입력하세요"),
  })
  .refine((v) => new Date(v.end) > new Date(v.start), {
    message: "종료가 시작보다 빨라요",
  });

// 가능 슬롯 추가 (datetime-local 문자열 → ISO 저장)
export async function addSlot(formData: FormData) {
  const photographerId = await requirePhotographerId();
  const parsed = SlotSchema.safeParse({
    start: formData.get("start"),
    end: formData.get("end"),
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);

  const supabase = await createClient();
  const { error } = await supabase.from("availability").insert({
    photographer_id: photographerId,
    start_at: new Date(parsed.data.start).toISOString(),
    end_at: new Date(parsed.data.end).toISOString(),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/studio/availability");
}

// 슬롯 삭제 (예약 확정된 슬롯은 보호)
export async function deleteSlot(formData: FormData) {
  await requirePhotographerId();
  const id = String(formData.get("id"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("availability")
    .delete()
    .eq("id", id)
    .eq("is_booked", false);
  if (error) throw new Error(error.message);
  revalidatePath("/studio/availability");
}
