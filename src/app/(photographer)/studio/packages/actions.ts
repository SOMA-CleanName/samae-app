"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { archiveAndDelete } from "@/lib/soft-delete";
import { mpTrackServer } from "@/lib/mixpanel-server";

// 호출자의 작가 id 확보 (없으면 에러)
async function requirePhotographerId(): Promise<string> {
  const me = await getCurrentUser();
  if (!me?.photographer) throw new Error("작가만 사용할 수 있습니다.");
  return me.photographer.id;
}

// 범위 상한/하한 — 초과·미달 입력은 에러 대신 범위로 맞춰(clamp) 저장한다.
// 가격 상한은 사실상 무제한(안전값 1억) — 고가 패키지(웨딩·상업) 허용.
const MAX_PRICE_KRW = 100_000_000;

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

// 숫자 필드는 잘못된 입력이어도 throw 하지 않고 기본값으로 받은 뒤 코드에서 clamp 한다.
const PackageSchema = z.object({
  name: z.string().trim().min(1, "이름을 입력하세요").max(60),
  description: z.string().trim().max(300).optional().default(""),
  priceKrw: z.coerce.number().int().catch(0),
  durationMin: z.coerce.number().int().catch(60),
  editedCount: z.coerce.number().int().catch(10),
});

function parsePackage(formData: FormData) {
  const parsed = PackageSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    priceKrw: formData.get("priceKrw"),
    durationMin: formData.get("durationMin"),
    editedCount: formData.get("editedCount"),
  });
  if (!parsed.success) throw new Error("패키지 정보를 확인해주세요.");
  const v = parsed.data;
  return {
    ...v,
    priceKrw: clamp(v.priceKrw, 0, MAX_PRICE_KRW), // 0 ~ 350만원
    durationMin: clamp(v.durationMin, 10, 1440), // 10분 ~ 24시간
    editedCount: clamp(v.editedCount, 0, 1000), // 0 ~ 1000장
  };
}

// 패키지 생성
export async function createPackage(formData: FormData) {
  const me = await getCurrentUser();
  if (!me?.photographer) throw new Error("작가만 사용할 수 있습니다.");
  const photographerId = me.photographer.id;
  const v = parsePackage(formData);
  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from("packages")
    .insert({
      photographer_id: photographerId,
      name: v.name,
      description: v.description,
      price_krw: v.priceKrw,
      duration_min: v.durationMin,
      edited_count: v.editedCount,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await mpTrackServer(
    "Create Package",
    me.id,
    { package_id: created?.id, price_krw: v.priceKrw, duration_min: v.durationMin },
    created?.id ? `Create Package:${created.id}` : undefined,
  );

  revalidatePath("/studio/packages");
}

// 패키지 수정 (RLS: 본인 작가 패키지만)
export async function updatePackage(formData: FormData) {
  const me = await getCurrentUser();
  if (!me?.photographer) throw new Error("작가만 사용할 수 있습니다.");
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

  await mpTrackServer("Edit Package", me.id, {
    package_id: id,
    price_krw: v.priceKrw,
    duration_min: v.durationMin,
  });

  revalidatePath("/studio/packages");
}

// 노출 토글
export async function togglePackageActive(formData: FormData) {
  const me = await getCurrentUser();
  if (!me?.photographer) throw new Error("작가만 사용할 수 있습니다.");
  const id = String(formData.get("id"));
  const isActive = formData.get("isActive") === "true";
  const supabase = await createClient();
  const { error } = await supabase
    .from("packages")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await mpTrackServer("Toggle Package Active", me.id, { package_id: id, is_active: isActive });

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

  await mpTrackServer("Delete Package", me.id, { package_id: id });

  revalidatePath("/studio/packages");
}
