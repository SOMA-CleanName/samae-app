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
