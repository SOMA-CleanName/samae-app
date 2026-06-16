import "server-only";

import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type AcceptedInquiry = {
  id: string;
  display_name: string | null;
  phone: string | null;
  instagram_id: string | null;
  discord_id: string | null;
  contact_email: string | null;
  purpose: string;
  preferred_date: string;
  region: string;
  accepted_at: string;
};

// 작가가 수락한 문의 목록. 수락한 순서대로 보여준다.
export async function listMyAcceptedInquiries(): Promise<AcceptedInquiry[]> {
  const me = await getCurrentUser();
  if (!me?.photographer) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("inquiries")
    .select(
      "id, phone, instagram_id, discord_id, contact_email, purpose, preferred_date, region, accepted_at, profile:profiles(display_name)"
    )
    .eq("photographer_id", me.photographer.id)
    .eq("status", "accepted")
    .not("accepted_at", "is", null)
    .order("accepted_at", { ascending: true });

  return (data ?? []).map((row) => {
    const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile;
    return {
      id: row.id as string,
      display_name: (profile?.display_name as string | null | undefined) ?? null,
      phone: row.phone as string | null,
      instagram_id: row.instagram_id as string | null,
      discord_id: row.discord_id as string | null,
      contact_email: row.contact_email as string | null,
      purpose: row.purpose as string,
      preferred_date: row.preferred_date as string,
      region: row.region as string,
      accepted_at: row.accepted_at as string,
    };
  });
}
