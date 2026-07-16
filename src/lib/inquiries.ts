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
  deposit_reported: boolean; // 작가가 '입금완료' 신고했는지(운영진 확인 대기)
  deposit_amount_krw: number;
  source_photo: { url: string; width: number; height: number } | null; // 고객이 신청한 그 사진
};

// 잠긴 리드 — 연락처(전화·카톡·이메일)만 게이트. 브리프(목적·날짜·지역·인원·메모·참고사진)와
// 고객이 신청한 사진은 구매 전에도 노출해 작가가 리드 가치를 보고 해제하도록 한다.
// 연락처 컬럼은 select 하지 않아 네트워크 응답에도 실리지 않는다.
export type NewInquiry = {
  id: string;
  created_at: string;
  deposit_amount_krw: number;
  name: string | null;
  display_name: string | null;
  purpose: string;
  preferred_date: string;
  region: string;
  party_size: string | null;
  note: string | null;
  ref_images: string[];
  source_photo: { url: string; width: number; height: number } | null; // 고객이 신청한 그 사진
};

// 작가가 받은(수락 전) 문의 — 브리프 + 신청 사진 포함(연락처 제외). 최신순.
export async function listMyNewInquiries(): Promise<NewInquiry[]> {
  const me = await getCurrentUser();
  if (!me?.photographer) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("inquiries")
    .select(
      "id, created_at, deposit_amount_krw, name, purpose, preferred_date, region, party_size, ref_image_paths, note, profile:profiles!inquiries_profile_id_fkey(display_name), source_photo:photos!inquiries_source_photo_id_fkey(src_url, thumb_url, width, height)"
    )
    .eq("photographer_id", me.photographer.id)
    .eq("status", "new")
    .eq("hidden_from_photographer", false) // 운영진이 숨긴(취소) 문의 제외
    .order("created_at", { ascending: false });

  return (data ?? []).map((row) => {
    const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile;
    const p = (Array.isArray(row.source_photo) ? row.source_photo[0] : row.source_photo) as
      | { src_url?: string | null; thumb_url?: string | null; width?: number | null; height?: number | null }
      | null
      | undefined;
    const url = p?.thumb_url ?? p?.src_url ?? null;
    return {
      id: row.id as string,
      created_at: row.created_at as string,
      deposit_amount_krw: (row.deposit_amount_krw as number | null) ?? 0,
      name: (row.name as string | null) ?? null,
      display_name: (profile?.display_name as string | null | undefined) ?? null,
      purpose: row.purpose as string,
      preferred_date: row.preferred_date as string,
      region: (row.region as string | null) ?? "",
      party_size: (row.party_size as string | null) ?? null,
      note: (row.note as string | null) ?? null,
      ref_images: (row.ref_image_paths as string[] | null) ?? [],
      source_photo: url ? { url, width: p?.width ?? 0, height: p?.height ?? 0 } : null,
    };
  });
}

// 작가가 수락한 문의 목록 — 입금대기(accepted) + 입금확인(confirmed). 수락 순.
export async function listMyAcceptedInquiries(): Promise<AcceptedInquiry[]> {
  const me = await getCurrentUser();
  if (!me?.photographer) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("inquiries")
    .select(
      "id, status, name, phone, kakao_id, contact_email, purpose, preferred_date, region, gender, party_size, ref_image_paths, note, created_at, accepted_at, deposit_reported_at, deposit_amount_krw, profile:profiles!inquiries_profile_id_fkey(display_name), source_photo:photos!inquiries_source_photo_id_fkey(src_url, thumb_url, width, height)"
    )
    .eq("photographer_id", me.photographer.id)
    .in("status", ["accepted", "confirmed", "shot", "refund_requested"])
    .eq("hidden_from_photographer", false) // 운영진이 숨긴(취소) 문의 제외
    .not("accepted_at", "is", null)
    .order("accepted_at", { ascending: true });

  return (data ?? []).map((row) => {
    const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile;
    const p = (Array.isArray(row.source_photo) ? row.source_photo[0] : row.source_photo) as
      | { src_url?: string | null; thumb_url?: string | null; width?: number | null; height?: number | null }
      | null
      | undefined;
    const photoUrl = p?.thumb_url ?? p?.src_url ?? null;
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
      deposit_reported: row.deposit_reported_at != null,
      deposit_amount_krw: (row.deposit_amount_krw as number | null) ?? 0,
      source_photo: photoUrl ? { url: photoUrl, width: p?.width ?? 0, height: p?.height ?? 0 } : null,
    };
  });
}
