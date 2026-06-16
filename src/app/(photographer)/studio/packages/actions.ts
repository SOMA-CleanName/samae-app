"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { archiveAndDelete } from "@/lib/soft-delete";

// 호출자의 작가 id 확보 (없으면 에러)
async function requirePhotographerId(): Promise<string> {
  const me = await getCurrentUser();
  if (!me?.photographer) throw new Error("작가만 사용할 수 있습니다.");
  return me.photographer.id;
}

// 가격 상한 (350만원) — 초과 입력은 에러 대신 상한으로 맞춰(clamp) 저장한다.
const MAX_PRICE_KRW = 3_500_000;

const PackageSchema = z.object({
  name: z.string().trim().min(1, "이름을 입력하세요").max(60),
  description: z.string().trim().max(300).optional().default(""),
  priceKrw: z.coerce.number().int().min(0),
  durationMin: z.coerce.number().int().min(1).max(1440),
  editedCount: z.coerce.number().int().min(0).max(1000),
});

function parsePackage(formData: FormData) {
  const v = PackageSchema.parse({
    name: formData.get("name"),
    description: formData.get("description"),
    priceKrw: formData.get("priceKrw"),
    durationMin: formData.get("durationMin"),
    editedCount: formData.get("editedCount"),
  });
  return { ...v, priceKrw: Math.min(v.priceKrw, MAX_PRICE_KRW) }; // 350만원 상한
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

// 삭제 (소프트딜리트 — 아카이브 후 제거). 소유권 확인 후 진행.
export async function deletePackage(formData: FormData) {
  const me = await getCurrentUser();
  if (!me?.photographer) throw new Error("작가만 사용할 수 있습니다.");
  const id = String(formData.get("id"));
  const supabase = await createClient();
  const { data: pkg } = await supabase
    .from("packages")
    .select("id, photographer_id")
    .eq("id", id)
    .maybeSingle();
  if (!pkg || pkg.photographer_id !== me.photographer.id) throw new Error("권한이 없습니다.");

  const { error } = await archiveAndDelete("packages", { col: "id", op: "eq", val: id }, me.id);
  if (error) throw new Error(error);
  revalidatePath("/studio/packages");
}
