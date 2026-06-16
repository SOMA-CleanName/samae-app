"use server";

import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function acceptInquiryNotifications(notificationIds: string[]) {
  const ids = [...new Set(notificationIds)].filter(Boolean);
  if (ids.length === 0) return [];

  const me = await getCurrentUser();
  if (!me?.photographer) throw new Error("작가 권한이 필요합니다.");

  const admin = createAdminClient();
  const { data: notifications, error } = await admin
    .from("notifications")
    .select("id, inquiry_id, created_at, recipient_id")
    .in("id", ids)
    .eq("recipient_id", me.id)
    .not("inquiry_id", "is", null);
  if (error) throw new Error(error.message);

  const rows = (notifications ?? [])
    .filter((row) => row.inquiry_id)
    .sort((a, b) => new Date(a.created_at as string).getTime() - new Date(b.created_at as string).getTime());

  const acceptedIds: string[] = [];
  const base = Date.now();

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const acceptedAt =
      rows.length === 1 ? new Date().toISOString() : new Date(base + index).toISOString();

    const { data: inquiry, error: updateError } = await admin
      .from("inquiries")
      .update({ status: "accepted", accepted_at: acceptedAt })
      .eq("id", row.inquiry_id)
      .eq("photographer_id", me.photographer.id)
      .select("id")
      .single();
    if (updateError) throw new Error(updateError.message);
    if (inquiry?.id) acceptedIds.push(inquiry.id as string);
  }

  if (rows.length > 0) {
    await admin
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .in(
        "id",
        rows.map((row) => row.id as string)
      );
  }

  return acceptedIds;
}
