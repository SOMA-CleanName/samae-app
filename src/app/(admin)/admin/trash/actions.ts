"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { restoreRecords } from "@/lib/soft-delete";

export type RestoreState = { error?: string; ok?: boolean };

// 선택한 삭제 기록을 원본 테이블로 복구 — 운영자. (복구는 비파괴적이라 비밀번호 불필요)
export async function restoreSelected(_prev: RestoreState, formData: FormData): Promise<RestoreState> {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") return { error: "운영자 권한이 필요합니다." };

  const ids = parseIds(formData.get("ids"));
  if (ids.length === 0) return { error: "선택된 항목이 없어요." };

  const { error } = await restoreRecords(ids);
  if (error) return { error };

  // 휴지통 + 복구가 반영될 만한 주요 어드민 페이지 갱신
  for (const p of ["/admin/trash", "/admin/inquiries", "/admin/transactions", "/admin/categories", "/admin/analytics"]) {
    revalidatePath(p);
  }
  return { ok: true };
}

// FormData 의 ids(JSON 문자열 배열) 파싱 — 안전하게 문자열 배열로.
function parseIds(raw: FormDataEntryValue | null): string[] {
  try {
    const arr = JSON.parse(String(raw ?? "[]"));
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}
