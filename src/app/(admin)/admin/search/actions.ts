"use server";

import { getCurrentUser } from "@/lib/auth";
import { debugSearchPhotos, type DebugSearchResponse } from "@/lib/discovery";

export type DebugState = {
  ran: boolean;
  q: string;
  data: DebugSearchResponse | null;
  error?: string;
};

// 어드민 미니 검색 디버그 — 입력어를 실제 검색 엔진으로 채점해 상위 결과+점수 분해를 돌려준다.
export async function runSearchDebug(_prev: DebugState, formData: FormData): Promise<DebugState> {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") {
    return { ran: false, q: "", data: null, error: "운영자 권한이 필요합니다." };
  }
  const q = String(formData.get("q") ?? "").trim();
  if (!q) return { ran: false, q: "", data: null };

  const data = await debugSearchPhotos(q);
  return { ran: true, q, data };
}
