"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { getOrCreateConversation } from "@/lib/conversations";

export type InquiryState = {
  ok: boolean;
  message?: string;
  error?: string;
  values?: InquiryValues;
};

const PHONE_PATTERN = /^0\d{2}-\d{4}-\d{4}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type InquiryValues = {
  phone: string;
  instagramId: string;
  discordId: string;
  contactEmail: string;
};

type ContactInfo = {
  phone: string | null;
  instagramId: string | null;
  discordId: string | null;
  contactEmail: string | null;
};

function validatePhone(phone: string | null) {
  if (!phone) return null;
  const formatted = formatPhone(phone);
  if (!PHONE_PATTERN.test(formatted)) {
    throw new Error("전화번호는 010-1234-5678 형식으로 입력해주세요.");
  }
  return formatted;
}

function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function fieldText(formData: FormData, key: string) {
  const value = String(formData.get(key) || "").trim();
  return value || null;
}

function validateContactInfo(formData: FormData): ContactInfo {
  const phone = validatePhone(fieldText(formData, "phone"));
  const instagramId = normalizeInstagramId(fieldText(formData, "instagramId"));
  const discordId = fieldText(formData, "discordId");
  const contactEmail = fieldText(formData, "contactEmail");

  if (contactEmail && !EMAIL_PATTERN.test(contactEmail)) {
    throw new Error("이메일 형식을 확인해주세요.");
  }
  if (!phone && !instagramId && !discordId && !contactEmail) {
    throw new Error("연락 가능한 수단을 하나 이상 입력해주세요.");
  }

  return { phone, instagramId, discordId, contactEmail };
}

function readInquiryValues(formData: FormData): InquiryValues {
  return {
    phone: String(formData.get("phone") || ""),
    instagramId: String(formData.get("instagramId") || ""),
    discordId: String(formData.get("discordId") || ""),
    contactEmail: String(formData.get("contactEmail") || ""),
  };
}

function normalizeInstagramId(value: string | null) {
  if (!value) return null;
  const id = value.startsWith("@") ? value : `@${value}`;
  return id.replace(/\s/g, "");
}

// 문의 폼 제출 — 상담 정보 작성과 연락 수단 검증을 통과하면 작가에게 알림을 보낸다.
export async function submitInquiry(
  _prevState: InquiryState,
  formData: FormData
): Promise<InquiryState> {
  const photographerId = String(formData.get("photographerId") || "");
  const photoId = String(formData.get("photoId") || "");
  const briefRequiredAfter = String(formData.get("briefRequiredAfter") || "");
  const values = readInquiryValues(formData);
  const me = await getCurrentUser();
  if (!me) redirect(`/login?next=${encodeURIComponent(buildInquiryPath(photographerId, photoId))}`);

  let contact: ContactInfo;
  try {
    contact = validateContactInfo(formData);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "연락 수단을 확인해주세요.",
      values,
    };
  }

  const conversationId = await getOrCreateConversation(photographerId, photoId);
  const supabase = await createClient();
  const { data: brief } = await supabase
    .from("consultation_briefs")
    .select("purpose, preferred_date, region, updated_at")
    .eq("conversation_id", conversationId)
    .maybeSingle();
  if (
    !brief ||
    !brief.purpose ||
    !brief.preferred_date ||
    !brief.region ||
    !isFreshBrief(brief.updated_at as string | null, briefRequiredAfter)
  ) {
    return { ok: false, error: "상담 정보를 먼저 작성해주세요.", values };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      phone: contact.phone,
      instagram_id: contact.instagramId,
      discord_id: contact.discordId,
      contact_email: contact.contactEmail,
    })
    .eq("id", me.id);
  if (error) return { ok: false, error: error.message, values };

  await notifyPhotographer(photographerId, conversationId, contact);

  return {
    ok: true,
    message: "작가에게 연락처가 전송되었습니다. 곧 연락을 할 예정입니다.",
  };
}

async function notifyPhotographer(
  photographerId: string,
  conversationId: string,
  contact: ContactInfo
) {
  const admin = createAdminClient();
  const { data: photographer } = await admin
    .from("photographers")
    .select("profile_id")
    .eq("id", photographerId)
    .maybeSingle();

  if (!photographer?.profile_id) return;

  await admin.from("notifications").insert({
    recipient_id: photographer.profile_id,
    type: "chat",
    title: "연락처가 도착했어요",
    body: buildContactBody(contact),
    link: `/chat/${conversationId}`,
  });
}

function buildContactBody(contact: ContactInfo) {
  const lines = [
    contact.phone && `전화번호: ${contact.phone}`,
    contact.instagramId && `인스타: ${contact.instagramId}`,
    contact.discordId && `디스코드: ${contact.discordId}`,
    contact.contactEmail && `이메일: ${contact.contactEmail}`,
  ].filter(Boolean);

  return `고객 연락처\n${lines.join("\n")}`;
}

function isFreshBrief(updatedAt: string | null, requiredAfter: string) {
  if (!updatedAt || !requiredAfter) return false;
  const updated = new Date(updatedAt).getTime();
  const required = new Date(requiredAfter).getTime();
  return Number.isFinite(updated) && Number.isFinite(required) && updated >= required;
}

function buildInquiryPath(photographerId: string, photoId: string) {
  const params = new URLSearchParams({ photographerId });
  if (photoId) params.set("photoId", photoId);
  return `/inquiry?${params.toString()}`;
}
