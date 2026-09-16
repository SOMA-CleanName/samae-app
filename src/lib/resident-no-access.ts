import "server-only";

// 주민등록번호를 **여는** 유일한 통로.
//
// `decryptResidentNo()` 를 아무 데서나 부르면 "누가 언제 왜 열었는지" 가 남지 않는다.
// 그러면 목적 외 이용이 없었다는 걸 증명할 방법이 없고, 유출 사고 때 범위도 못 좁힌다.
// 그래서 복호화는 이 함수 하나만 하고, **로그를 먼저 남긴 뒤** 연다.
//
// ⚠️ 순서가 중요하다. 열고 나서 로그를 남기면, 로그 쓰기가 실패했을 때 **기록 없는 열람**이
//    성립한다. 먼저 남기면 최악의 경우 "열지도 않았는데 남은 기록" 이 되는데, 그쪽이 안전하다.

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptResidentNo } from "@/lib/resident-no";

/** 왜 열었는가 — 자유 문자열을 받지 않는다. 늘리려면 여기에 추가할 것 */
export type ResidentNoPurpose =
  | "withholding_report" // 원천징수 지급명세서 생성
  | "tax_correction" // 신고 정정
  | "user_request"; // 본인 요청에 따른 확인

export async function readResidentNo(params: {
  photographerId: string;
  /** 연 사람(어드민 profiles.id). 배치면 null */
  actorId: string | null;
  purpose: ResidentNoPurpose;
}): Promise<string | null> {
  const admin = createAdminClient();

  const { data: ph } = await admin
    .from("photographers")
    .select("resident_no_enc")
    .eq("id", params.photographerId)
    .maybeSingle();
  if (!ph?.resident_no_enc) return null;

  const h = await headers();
  // 로그가 먼저다 — 위 주석 참고
  const { error } = await admin.from("resident_no_access_logs").insert({
    photographer_id: params.photographerId,
    actor_id: params.actorId,
    purpose: params.purpose,
    ip: (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || null,
    user_agent: h.get("user-agent")?.slice(0, 300) ?? null,
  });
  // 기록을 못 남기면 **열지 않는다.** 기록 없는 열람을 만드느니 실패하는 쪽이 낫다.
  if (error) throw new Error("접근 기록을 남기지 못해 조회를 중단했습니다.");

  return decryptResidentNo(ph.resident_no_enc as string);
}
