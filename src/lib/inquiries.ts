import "server-only";

import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type AcceptedInquiry = {
  id: string;
  display_name: string | null;
  // 연락 수단 — 입금 확인(confirmed) 전에는 null 로 가려진다(리드 언락)
  phone: string | null;
  instagram_id: string | null;
  discord_id: string | null;
  contact_email: string | null;
  extra_contact: string | null;
  purpose: string;
  preferred_date: string;
  region: string;
  note: string | null;
  accepted_at: string;
  // 입금 플로우
  confirmed: boolean; // 운영자 입금 확인 여부
  deposit_amount_krw: number;
};

export type NewInquiry = {
  id: string;
  display_name: string | null;
  purpose: string;
  preferred_date: string;
  region: string;
  gender: string | null;
  party_size: number | null;
  note: string | null;
  created_at: string;
  deposit_amount_krw: number;
};

// 작가가 받은(수락 전) 문의 — 브리프만 노출, 연락처는 없음(수락+입금 후 공개). 최신순.
export async function listMyNewInquiries(): Promise<NewInquiry[]> {
  const me = await getCurrentUser();
  if (!me?.photographer) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("inquiries")
    .select(
      "id, purpose, preferred_date, region, gender, party_size, note, created_at, deposit_amount_krw, profile:profiles!inquiries_profile_id_fkey(display_name)"
    )
    .eq("photographer_id", me.photographer.id)
    .eq("status", "new")
    .order("created_at", { ascending: false });

  return (data ?? []).map((row) => {
    const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile;
    return {
      id: row.id as string,
      display_name: (profile?.display_name as string | null | undefined) ?? null,
      purpose: row.purpose as string,
      preferred_date: row.preferred_date as string,
      region: (row.region as string | null) ?? "",
      gender: (row.gender as string | null) ?? null,
      party_size: (row.party_size as number | null) ?? null,
      note: (row.note as string | null) ?? null,
      created_at: row.created_at as string,
      deposit_amount_krw: (row.deposit_amount_krw as number | null) ?? 0,
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
      "id, status, phone, instagram_id, discord_id, contact_email, extra_contact, purpose, preferred_date, region, note, accepted_at, deposit_amount_krw, profile:profiles!inquiries_profile_id_fkey(display_name)"
    )
    .eq("photographer_id", me.photographer.id)
    .in("status", ["accepted", "confirmed"])
    .not("accepted_at", "is", null)
    .order("accepted_at", { ascending: true });

  return (data ?? []).map((row) => {
    const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile;
    const confirmed = row.status === "confirmed";
    return {
      id: row.id as string,
      display_name: (profile?.display_name as string | null | undefined) ?? null,
      // 입금 확인 전에는 연락처 비공개
      phone: confirmed ? (row.phone as string | null) : null,
      instagram_id: confirmed ? (row.instagram_id as string | null) : null,
      discord_id: confirmed ? (row.discord_id as string | null) : null,
      contact_email: confirmed ? (row.contact_email as string | null) : null,
      extra_contact: confirmed ? (row.extra_contact as string | null) : null,
      purpose: row.purpose as string,
      preferred_date: row.preferred_date as string,
      region: (row.region as string | null) ?? "",
      note: (row.note as string | null) ?? null,
      accepted_at: row.accepted_at as string,
      confirmed,
      deposit_amount_krw: (row.deposit_amount_krw as number | null) ?? 0,
    };
  });
}
