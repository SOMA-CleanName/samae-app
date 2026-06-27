import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// 운영진 알림 (디스코드 웹훅) — 리드 모델의 시작점.
// 새 문의가 들어오면 운영진 채널로 알려, 운영진이 작가에게 카톡으로 통보하도록 한다.
// ⚠️ 고객 연락처(PII)는 절대 싣지 않는다 — 작가명/브리프 요약/문의 식별자만(연락처는 입금 확인 후 공개).

const OPS_WEBHOOK = process.env.DISCORD_OPS_WEBHOOK_URL;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");

export async function notifyOpsNewInquiry(params: {
  inquiryId: string;
  photographerId: string;
  purpose: string | null;
  preferredDate: string | null;
  region: string | null;
}): Promise<void> {
  if (!OPS_WEBHOOK) return; // 미설정이면 조용히 패스(로컬/미배포)

  try {
    const admin = createAdminClient();
    const { data: ph } = await admin
      .from("photographers")
      .select("display_name")
      .eq("id", params.photographerId)
      .maybeSingle();

    const who = ph?.display_name || "작가";
    const ref = params.inquiryId.slice(0, 8); // 운영진 대조용 짧은 참조
    const studioLink = SITE_URL ? `${SITE_URL}/studio` : "/studio";

    // 작가에게 그대로 복사해 보낼 메시지 (코드블록으로 감싸 복붙 쉽게). 연락처·사전정보 미포함.
    const forPhotographer =
      `${who} 작가님, 작가님의 사진을 마음에 들어한 고객이 문의를 남기셨어요!\n` +
      `확인하러 가기 👉 ${studioLink}`;

    // 운영진용 컨텍스트(내부 참조) + 복붙 블록
    const lines: string[] = [`📨 **새 문의** — ${who} 작가  (ID \`${ref}\`)`];
    if (params.purpose) lines.push(`• 목적: ${params.purpose}`);
    if (params.preferredDate) lines.push(`• 희망일: ${params.preferredDate}`);
    if (params.region) lines.push(`• 지역: ${params.region}`);
    lines.push("", "⬇️ 아래 메시지를 복사해 작가에게 보내세요", "```", forPhotographer, "```");

    await fetch(OPS_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: lines.join("\n") }),
      redirect: "manual",
    });
  } catch {
    // 디스코드 실패가 문의 접수를 막지 않게 무시
  }
}

// 장바구니 일괄 상담 신청 — 고객이 담은 사진들로 운영진에게 한 번에 문의.
// 운영진이 사진별 작가에게 라우팅하므로 연락처를 포함한다(작가 신청 알림과 동일 원칙).
export async function notifyOpsCartInquiry(params: {
  contact: string;
  photoIds: string[];
  timing?: string | null;
  region?: string | null;
}): Promise<void> {
  if (!OPS_WEBHOOK) return;
  try {
    const admin = createAdminClient();
    const { data: photos } = await admin
      .from("photos")
      .select("id, photographer:photographers!photos_photographer_id_fkey(display_name)")
      .in("id", params.photoIds);

    const names = [
      ...new Set(
        (photos ?? [])
          .map((p) => (p.photographer as { display_name?: string } | null)?.display_name)
          .filter(Boolean)
      ),
    ];

    const lines: string[] = [
      `🛒 **장바구니 일괄 상담 신청** — 사진 ${params.photoIds.length}장`,
      `• 연락처: ${params.contact}`,
      params.timing ? `• 희망 시기: ${params.timing}` : null,
      params.region ? `• 희망 지역: ${params.region}` : null,
      `• 관련 작가: ${names.join(", ") || "확인 필요"}`,
      `• 사진 ID: ${params.photoIds.map((id) => "`" + id.slice(0, 8) + "`").join(", ")}`,
      "",
      "고객이 담아둔 사진들이에요. 해당 작가들에게 연결해주세요.",
    ].filter((l): l is string => Boolean(l));

    await fetch(OPS_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: lines.join("\n") }),
      redirect: "manual",
    });
  } catch {
    // 알림 실패가 접수를 막지 않게 무시
  }
}

// 새 작가 신청 알림 — 지원자가 남긴 정보.
// (문의와 달리 지원자 연락처는 운영자가 직접 연락해야 하므로 포함한다.)
export async function notifyOpsNewApplication(params: {
  applicationId: string;
  displayName: string;
  portfolioUrl: string;
  phone: string;
  bio: string | null;
}): Promise<void> {
  if (!OPS_WEBHOOK) return; // 미설정이면 조용히 패스(로컬/미배포)

  try {
    const ref = params.applicationId.slice(0, 8); // 운영진 대조용 짧은 참조
    const lines: string[] = [
      `🎨 **새 작가 신청** — ${params.displayName}  (ID \`${ref}\`)`,
      `• 포트폴리오: ${params.portfolioUrl}`,
      `• 연락처: ${params.phone}`,
    ];
    if (params.bio) lines.push(`• 소개: ${params.bio}`);
    lines.push("", "작가가 카카오 채널로도 신청 메시지를 보낼 거예요. 채널 확인 후 진행해주세요.");

    await fetch(OPS_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: lines.join("\n") }),
      redirect: "manual",
    });
  } catch {
    // 알림 실패가 신청 접수를 막지 않게 무시
  }
}
