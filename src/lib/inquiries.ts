import "server-only";

import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type AcceptedInquiry = {
  id: string;
  display_name: string | null;
  // 이름/닉네임 — 연락처 게이트 밖(입금 확인 전에도 노출)
  name: string | null;
  // 연락 수단 — 입금 확인(confirmed) 전에는 null 로 가려진다(리드 언락)
  phone: string | null;
  kakao_id: string | null;
  contact_email: string | null;
  purpose: string;
  preferred_date: string;
  region: string;
  gender: string | null;
  party_size: string | null;
  ref_images: string[];
  note: string | null;
  created_at: string; // 접수 시각(불변) — 카드 시각 표시 기준
  accepted_at: string;
  // 입금 플로우
  confirmed: boolean; // 운영자 입금 확인 여부
  deposit_amount_krw: number;
};

// 잠긴 리드 — 사전정보·연락처·닉네임은 입금 확인 전 일절 미노출.
// 클라이언트로도 보내지 않는다(네트워크 응답 유출 방지). 카드엔 받은 시각·해제 금액만 쓴다.
export type NewInquiry = {
  id: string;
  created_at: string;
  deposit_amount_krw: number;
};

// 작가가 받은(수락 전) 문의 — 식별/시각/금액만. 브리프는 반환하지 않는다. 최신순.
export async function listMyNewInquiries(): Promise<NewInquiry[]> {
  const me = await getCurrentUser();
  if (!me?.photographer) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("inquiries")
    .select("id, created_at, deposit_amount_krw")
    .eq("photographer_id", me.photographer.id)
    .eq("status", "new")
    .eq("hidden_from_photographer", false) // 운영진이 숨긴(취소) 문의 제외
    .order("created_at", { ascending: false });

  return (data ?? []).map((row) => ({
    id: row.id as string,
    created_at: row.created_at as string,
    deposit_amount_krw: (row.deposit_amount_krw as number | null) ?? 0,
  }));
}

// 작가가 수락한 문의 목록 — 입금대기(accepted) + 입금확인(confirmed). 수락 순.
export async function listMyAcceptedInquiries(): Promise<AcceptedInquiry[]> {
  const me = await getCurrentUser();
  if (!me?.photographer) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("inquiries")
    .select(
      "id, status, name, phone, kakao_id, contact_email, purpose, preferred_date, region, gender, party_size, ref_image_paths, note, created_at, accepted_at, deposit_amount_krw, profile:profiles!inquiries_profile_id_fkey(display_name)"
    )
    .eq("photographer_id", me.photographer.id)
    .in("status", ["accepted", "confirmed", "shot", "refund_requested"])
    .eq("hidden_from_photographer", false) // 운영진이 숨긴(취소) 문의 제외
    .not("accepted_at", "is", null)
    .order("accepted_at", { ascending: true });

  return (data ?? []).map((row) => {
    const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile;
    // accepted(입금대기) 외에는 모두 연락처 공개 단계(confirmed/shot/refund_requested)
    const confirmed = row.status !== "accepted";
    return {
      id: row.id as string,
      display_name: (profile?.display_name as string | null | undefined) ?? null,
      // 이름은 연락처 게이트 밖 — 입금 확인 전에도 노출
      name: (row.name as string | null) ?? null,
      // 입금 확인 전에는 연락처 비공개
      phone: confirmed ? (row.phone as string | null) : null,
      kakao_id: confirmed ? (row.kakao_id as string | null) : null,
      contact_email: confirmed ? (row.contact_email as string | null) : null,
      purpose: row.purpose as string,
      preferred_date: row.preferred_date as string,
      region: (row.region as string | null) ?? "",
      gender: (row.gender as string | null) ?? null,
      party_size: (row.party_size as string | null) ?? null,
      ref_images: (row.ref_image_paths as string[] | null) ?? [],
      note: (row.note as string | null) ?? null,
      created_at: row.created_at as string,
      accepted_at: row.accepted_at as string,
      confirmed,
      deposit_amount_krw: (row.deposit_amount_krw as number | null) ?? 0,
    };
  });
}
