"use server";

import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";

export type InquiryState = {
  ok: boolean;
  message?: string;
  error?: string;
  values?: InquiryValues;
};

const PHONE_PATTERN = /^0\d{2}-\d{4}-\d{4}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REF_IMAGE_BUCKET = "samae-chat";
const MAX_REF_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_REF_IMAGES = 5;

export type InquiryValues = {
  phone: string;
  instagramId: string;
  discordId: string;
  contactEmail: string;
  brief: InquiryBriefValues;
};

type ContactInfo = {
  phone: string | null;
  instagramId: string | null;
  discordId: string | null;
  contactEmail: string | null;
};

type BriefInfo = {
  gender: string | null;
  partySize: string | null;
  purpose: string | null;
  preferredDate: string | null;
  region: string | null;
  note: string | null;
  refImagePaths: string[];
};

type InquiryBriefValues = {
  gender: string;
  partySize: string;
  purpose: string;
  preferredDate: string;
  region: string;
  note: string;
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

function validateBriefInfo(formData: FormData): BriefInfo {
  const brief = readBriefInfo(formData);
  if (!brief.purpose || !brief.preferredDate || !brief.region) {
    throw new Error("상담 정보를 먼저 작성해주세요.");
  }
  return brief;
}

function readInquiryValues(formData: FormData): InquiryValues {
  return {
    phone: String(formData.get("phone") || ""),
    instagramId: String(formData.get("instagramId") || ""),
    discordId: String(formData.get("discordId") || ""),
    contactEmail: String(formData.get("contactEmail") || ""),
    brief: readBriefValues(formData),
  };
}

function readBriefValues(formData: FormData) {
  return {
    gender: String(formData.get("gender") || ""),
    partySize: String(formData.get("partySize") || ""),
    purpose: String(formData.get("purpose") || ""),
    preferredDate: String(formData.get("preferredDate") || ""),
    region: String(formData.get("region") || ""),
    note: String(formData.get("note") || ""),
  };
}

function readBriefInfo(formData: FormData): BriefInfo {
  const values = readBriefValues(formData);
  return {
    gender: values.gender.trim() || null,
    partySize: values.partySize.trim() || null,
    purpose: values.purpose.trim() || null,
    preferredDate: values.preferredDate.trim() || null,
    region: values.region.trim() || null,
    note: values.note.trim() || null,
    refImagePaths: [],
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
  const values = readInquiryValues(formData);
  const me = await getCurrentUser();

  let contact: ContactInfo;
  let brief: BriefInfo;
  try {
    contact = validateContactInfo(formData);
    brief = validateBriefInfo(formData);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "연락 수단을 확인해주세요.",
      values,
    };
  }

  if (me) {
    const supabase = await createClient();
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
  }

  brief.refImagePaths = await uploadReferenceImages(formData);

  const inquiryId = await createInquiry(me?.id ?? null, photographerId, photoId, contact, brief);
  if (!inquiryId) return { ok: false, error: "문의 저장에 실패했어요.", values };

  await notifyPhotographer(photographerId, inquiryId, me?.displayName ?? null, contact, brief);

  return {
    ok: true,
    message: "작가에게 연락처가 전송되었습니다. 곧 연락을 할 예정입니다.",
  };
}

async function createInquiry(
  profileId: string | null,
  photographerId: string,
  photoId: string,
  contact: ContactInfo,
  brief: BriefInfo
) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("inquiries")
    .insert({
      profile_id: profileId,
      photographer_id: photographerId,
      source_photo_id: photoId || null,
      phone: contact.phone,
      instagram_id: contact.instagramId,
      discord_id: contact.discordId,
      contact_email: contact.contactEmail,
      gender: brief.gender,
      party_size: parsePartySize(brief.partySize),
      purpose: brief.purpose,
      preferred_date: brief.preferredDate,
      region: brief.region,
      note: brief.note,
      ref_image_paths: brief.refImagePaths,
    })
    .select("id")
    .single();

  if (error) return null;
  return data.id as string;
}

async function notifyPhotographer(
  photographerId: string,
  inquiryId: string,
  displayName: string | null,
  contact: ContactInfo,
  brief: BriefInfo
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
    type: "booking",
    title: "새 문의가 도착했어요",
    body: buildInquiryBody(displayName, contact, brief),
    link: null,
    inquiry_id: inquiryId,
  });
}

function inquiryNickname(displayName: string | null, contact: ContactInfo) {
  return displayName || contact.instagramId || contact.contactEmail || "비회원";
}

function buildInquiryBody(displayName: string | null, contact: ContactInfo, brief: BriefInfo) {
  const lines = [
    `${inquiryNickname(displayName, contact)} 님이 예약 문의를 하였습니다.`,
    contact.phone && `전화번호: ${contact.phone}`,
    contact.instagramId && `인스타: ${contact.instagramId}`,
    contact.discordId && `디스코드: ${contact.discordId}`,
    contact.contactEmail && `이메일: ${contact.contactEmail}`,
    `목적: ${brief.purpose}`,
    `희망 일정: ${brief.preferredDate}`,
    `희망 지역: ${brief.region}`,
    brief.refImagePaths.length > 0 && `레퍼런스 사진: ${brief.refImagePaths.length}장`,
  ].filter(Boolean);

  return lines.join("\n");
}

async function uploadReferenceImages(formData: FormData) {
  const files = formData
    .getAll("referenceImages")
    .filter((file): file is File => file instanceof File && file.size > 0)
    .slice(0, MAX_REF_IMAGES);
  if (files.length === 0) return [];

  const admin = createAdminClient();
  const sharp = (await import("sharp")).default;
  const uploaded: string[] = [];

  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    if (file.size > MAX_REF_IMAGE_BYTES) continue;

    const buffer = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize({ width: 1200, withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    const path = `inquiries/${randomUUID()}.jpg`;
    const { error } = await admin.storage
      .from(REF_IMAGE_BUCKET)
      .upload(path, buffer, { contentType: "image/jpeg" });
    if (error) continue;
    uploaded.push(admin.storage.from(REF_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl);
  }

  return uploaded;
}

function parsePartySize(value: string | null) {
  if (!value) return null;
  const parsed = parseInt(value.replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}
