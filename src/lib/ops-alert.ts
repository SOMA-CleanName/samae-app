import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { inquiryChannel } from "@/lib/inquiry-channel";
import { getPhotographerPayoutAccount } from "@/lib/payments";
import { SITE_URL } from "@/lib/site";

const won = (n: number) => new Intl.NumberFormat("ko-KR").format(n);

// 운영진 알림 (디스코드 웹훅) — 리드 모델의 시작점.
// 새 문의가 들어오면 운영진 채널로 알려, 운영진이 작가에게 카톡으로 통보하도록 한다.
// ⚠️ 이 채널은 운영진 전용 — 어드민 페이지에서 보는 정보(연락처·유입·브리프)를 그대로 싣는다.
//    단, '작가에게 복사해 보낼 블록'만은 PII 미포함(연락처는 입금 확인 후 작가에게 공개).
// 링크는 정식 도메인 상수(lib/site)를 쓴다 — NEXT_PUBLIC_SITE_URL 은 비어있거나 localhost 라 부적합.

const OPS_WEBHOOK = process.env.DISCORD_OPS_WEBHOOK_URL;

const one = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? v[0] ?? null : v ?? null;

export async function notifyOpsNewInquiry(params: { inquiryId: string }): Promise<void> {
  if (!OPS_WEBHOOK) return; // 미설정이면 조용히 패스(로컬/미배포)

  try {
    const admin = createAdminClient();
    const { data: q } = await admin
      .from("inquiries")
      .select(
        "id, name, phone, kakao_id, contact_email, purpose, preferred_date, region, gender, party_size, note, source_photo_id, utm_source, utm_medium, utm_campaign, landing_path, fbc, photographer:photographers!inquiries_photographer_id_fkey(display_name), profile:profiles!inquiries_profile_id_fkey(display_name)"
      )
      .eq("id", params.inquiryId)
      .maybeSingle();
    if (!q) return;

    const who = one(q.photographer as { display_name?: string | null })?.display_name || "작가";
    const member = one(q.profile as { display_name?: string | null })?.display_name || null;
    const ref = params.inquiryId.slice(0, 8); // 운영진 대조용 짧은 참조
    const ch = inquiryChannel(q);

    const studioLink = SITE_URL ? `${SITE_URL}/studio` : "/studio";
    // 어드민 문의 페이지 딥링크 — 해당 문의를 자동으로 펼치고 스크롤.
    const adminLink = SITE_URL
      ? `${SITE_URL}/admin/inquiries?open=${params.inquiryId}#inq-${params.inquiryId}`
      : `/admin/inquiries?open=${params.inquiryId}`;

    // 연락 수단 — 운영진 전용 섹션에만 노출
    const contacts = [
      q.phone ? `전화 ${q.phone}` : null,
      q.kakao_id ? `카카오 ${q.kakao_id}` : null,
      q.contact_email ? `이메일 ${q.contact_email}` : null,
    ].filter(Boolean);

    // 작가에게 그대로 복사해 보낼 메시지 (연락처·사전정보 미포함 — 입금 확인 후 공개).
    const forPhotographer =
      `${who} 작가님, 작가님의 사진을 마음에 들어한 고객이 문의를 남기셨어요!\n` +
      `확인하러 가기 👉 ${studioLink}`;

    const lines: string[] = [
      `📨 **새 문의** — ${who} 작가  ·  ${ch.label}  (ID \`${ref}\`)`,
      `👤 고객: ${q.name || member || "비회원(게스트)"}${member ? " · 회원" : " · 비회원"}`,
      `📞 연락처: ${contacts.length ? contacts.join(" / ") : "없음"}`,
    ];
    // 브리프
    const brief = [
      q.purpose ? `목적 ${q.purpose}` : null,
      q.preferred_date ? `희망일 ${q.preferred_date}` : null,
      q.region ? `지역 ${q.region}` : null,
      q.gender ? `성별 ${q.gender}` : null,
      q.party_size ? `인원 ${q.party_size}` : null,
    ].filter(Boolean);
    if (brief.length) lines.push(`📋 ${brief.join(" · ")}`);
    if (q.note) lines.push(`📝 메모: ${q.note}`);
    // 유입 경로
    if (q.landing_path) lines.push(`🔗 랜딩: ${q.landing_path}`);
    if (q.source_photo_id && SITE_URL) lines.push(`🖼 문의한 사진: ${SITE_URL}/photos/${q.source_photo_id}`);
    // 어드민 바로가기
    lines.push(`🛠 **어드민에서 열기: ${adminLink}**`);
    // 작가 복붙 블록
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

// 작가 '입금완료' 신고 — 입금 대기(accepted) 리드에서 작가가 입금완료 버튼을 누르면 호출.
// 운영진이 대조·처리할 수 있게: 어떤 작가·어떤 건·금액·입금자명(작가 수취계좌 예금주)·어드민 딥링크를 싣는다.
// 실제 입금확인(accepted→confirmed)은 운영진이 계좌 입금내역과 대조 후 어드민에서 수동 처리.
export async function notifyOpsDepositReported(params: { inquiryId: string }): Promise<void> {
  if (!OPS_WEBHOOK) return; // 미설정이면 조용히 패스(로컬/미배포)

  try {
    const admin = createAdminClient();
    const { data: q } = await admin
      .from("inquiries")
      .select(
        "id, purpose, preferred_date, region, party_size, deposit_amount_krw, photographer_id, photographer:photographers!inquiries_photographer_id_fkey(display_name)"
      )
      .eq("id", params.inquiryId)
      .maybeSingle();
    if (!q) return;

    const who = one(q.photographer as { display_name?: string | null })?.display_name || "작가";
    const ref = params.inquiryId.slice(0, 8); // 운영진 대조용 짧은 참조
    const amount = (q.deposit_amount_krw as number | null) ?? 0;

    // 입금자명 대조용 — 작가 수취계좌 예금주명(미설정이면 안내)
    const account = await getPhotographerPayoutAccount(q.photographer_id as string);
    const holder = account?.holder?.trim() || "미설정";

    // 어드민 문의 페이지 딥링크 — 해당 문의를 자동으로 펼치고 스크롤(입금확인 처리).
    const adminLink = SITE_URL
      ? `${SITE_URL}/admin/inquiries?open=${params.inquiryId}#inq-${params.inquiryId}`
      : `/admin/inquiries?open=${params.inquiryId}`;

    const brief = [
      q.purpose ? `목적 ${q.purpose}` : null,
      q.preferred_date ? `희망일 ${q.preferred_date}` : null,
      q.region ? `지역 ${q.region}` : null,
      q.party_size ? `인원 ${q.party_size}` : null,
    ].filter(Boolean);

    const lines: string[] = [
      `💰 **입금완료 신고** — ${who} 작가  (문의 \`${ref}\`)`,
      `💳 금액: **₩${won(amount)}**  ·  입금자명(예금주): **${holder}**`,
    ];
    if (brief.length) lines.push(`📋 ${brief.join(" · ")}`);
    lines.push(`🛠 **어드민에서 확인·입금확인 처리: ${adminLink}**`);
    lines.push(`_계좌 입금내역의 입금자명이 위 예금주와 일치하면 ‘입금확인’으로 변경하세요._`);

    await fetch(OPS_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: lines.join("\n") }),
      redirect: "manual",
    });
  } catch {
    // 디스코드 실패가 신고 처리를 막지 않게 무시
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
