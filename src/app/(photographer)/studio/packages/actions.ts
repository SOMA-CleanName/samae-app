"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";

// 호출자의 작가 id 확보 (없으면 에러)
async function requirePhotographerId(): Promise<string> {
  const me = await getCurrentUser();
  if (!me?.photographer) throw new Error("작가만 사용할 수 있습니다.");
  return me.photographer.id;
}

const PackageSchema = z.object({
  name: z.string().trim().min(1, "이름을 입력하세요").max(60),
  description: z.string().trim().max(300).optional().default(""),
  priceKrw: z.coerce.number().int().min(0).max(100_000_000),
  durationMin: z.coerce.number().int().min(1).max(1440),
  editedCount: z.coerce.number().int().min(0).max(1000),
});

function parsePackage(formData: FormData) {
  return PackageSchema.parse({
    name: formData.get("name"),
    description: formData.get("description"),
    priceKrw: formData.get("priceKrw"),
    durationMin: formData.get("durationMin"),
    editedCount: formData.get("editedCount"),
  });
}

// 패키지 생성
export async function createPackage(formData: FormData) {
  const photographerId = await requirePhotographerId();
  const v = parsePackage(formData);
  const supabase = await createClient();
  const { error } = await supabase.from("packages").insert({
    photographer_id: photographerId,
    name: v.name,
    description: v.description,
    price_krw: v.priceKrw,
    duration_min: v.durationMin,
    edited_count: v.editedCount,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/studio/packages");
}

// 패키지 수정 (RLS: 본인 작가 패키지만)
export async function updatePackage(formData: FormData) {
  await requirePhotographerId();
  const id = String(formData.get("id"));
  const v = parsePackage(formData);
  const supabase = await createClient();
  const { error } = await supabase
    .from("packages")
    .update({
      name: v.name,
      description: v.description,
      price_krw: v.priceKrw,
      duration_min: v.durationMin,
      edited_count: v.editedCount,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/studio/packages");
}

// 노출 토글
export async function togglePackageActive(formData: FormData) {
  await requirePhotographerId();
  const id = String(formData.get("id"));
  const isActive = formData.get("isActive") === "true";
  const supabase = await createClient();
  const { error } = await supabase
    .from("packages")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/studio/packages");
}

// 삭제
export async function deletePackage(formData: FormData) {
  await requirePhotographerId();
  const id = String(formData.get("id"));
  const supabase = await createClient();
  const { error } = await supabase.from("packages").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/studio/packages");
}
