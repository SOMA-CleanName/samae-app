import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type PlatformAccount = {
  bank: string;
  number: string;
  holder: string;
  notice: string;
};

const EMPTY: PlatformAccount = { bank: "", number: "", holder: "", notice: "" };

// 플랫폼(우리) 입금 계좌 — 싱글턴 1행. 작가 입금 안내·어드민 편집에 사용.
export async function getPlatformAccount(): Promise<PlatformAccount> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("platform_account")
    .select("bank, number, holder, notice")
    .eq("id", true)
    .maybeSingle();
  if (!data) return EMPTY;
  return {
    bank: (data.bank as string) ?? "",
    number: (data.number as string) ?? "",
    holder: (data.holder as string) ?? "",
    notice: (data.notice as string) ?? "",
  };
}

// 계좌 설정 여부 (안내 노출 분기)
export function hasAccount(a: PlatformAccount): boolean {
  return !!(a.bank && a.number);
}
