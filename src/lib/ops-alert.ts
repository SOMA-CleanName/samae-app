import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { inquiryChannel } from "@/lib/inquiry-channel";
import { getPhotographerPayoutAccount, quoteRefund } from "@/lib/payments";
import { SITE_URL } from "@/lib/site";

const won = (n: number) => new Intl.NumberFormat("ko-KR").format(n);

// 운영진 알림 (디스코드 웹훅) — 리드 모델의 시작점.
// 새 문의가 들어오면 운영진 채널로 알려, 운영진이 작가에게 카톡으로 통보하도록 한다.
// ⚠️ 이 채널은 운영진 전용 — 어드민 페이지에서 보는 정보(연락처·유입·브리프)를 그대로 싣는다.
//    단, '작가에게 복사해 보낼 블록'만은 PII 미포함(연락처는 입금 확인 후 작가에게 공개).
// 링크는 정식 도메인 상수(lib/site)를 쓴다 — NEXT_PUBLIC_SITE_URL 은 비어있거나 localhost 라 부적합.

// 성격별 채널 웹훅 — 각각 미설정이면 통합 OPS 채널(DISCORD_OPS_WEBHOOK_URL)로 폴백(하위호환).
// 채널을 나누려면 디스코드에서 채널별 웹훅을 만들어 해당 env 만 채우면 된다.
const OPS_FALLBACK = process.env.DISCORD_OPS_WEBHOOK_URL;
const INQUIRY_WEBHOOK = process.env.DISCORD_INQUIRY_WEBHOOK_URL || OPS_FALLBACK; // 새 문의 · 장바구니 문의
const DEPOSIT_WEBHOOK = process.env.DISCORD_DEPOSIT_WEBHOOK_URL || OPS_FALLBACK; // 입금완료 신고
const APPLICATION_WEBHOOK = process.env.DISCORD_APPLICATION_WEBHOOK_URL || OPS_FALLBACK; // 작가 신청
// 환불·취소 신청 — 3영업일 시계가 도는 건이라 입금 신고와 같은 "돈" 채널로 보낸다
const REFUND_WEBHOOK = process.env.DISCORD_REFUND_WEBHOOK_URL || DEPOSIT_WEBHOOK;

const one = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? v[0] ?? null : v ?? null;

export async function notifyOpsNewInquiry(params: { inquiryId: string }): Promise<void> {
  const webhook = INQUIRY_WEBHOOK;
  if (!webhook) return; // 미설정이면 조용히 패스(로컬/미배포)

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

    await fetch(webhook, {
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
  const webhook = DEPOSIT_WEBHOOK;
  if (!webhook) return; // 미설정이면 조용히 패스(로컬/미배포)

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

    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: lines.join("\n") }),
      redirect: "manual",
    });
  } catch {
    // 디스코드 실패가 신고 처리를 막지 않게 무시
  }
}

// ── 에스크로(예약) 운영 알림 — 채팅 상주 플로우의 실제 비즈니스 트리거들 ──────
// 문의(요약 접수)는 더 이상 운영 알림을 울리지 않는다. 운영이 움직여야 하는 시점은
// ① 수락 ② 고객 입금 신고(사매 계좌 대조·확인).

// 예약 공통 컨텍스트 로더 — 작가·고객·패키지·금액·일시
async function loadBookingContext(bookingId: string) {
  const admin = createAdminClient();
  const { data: b } = await admin
    .from("bookings")
    .select(
      "id, amount_krw, travel_fee_krw, shoot_at, shoot_date, location_text, settlement_amount_krw, package_snapshot, photographer:photographers!bookings_photographer_id_fkey(display_name), user:profiles!bookings_user_id_fkey(display_name)"
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (!b) return null;
  return {
    ref: bookingId.slice(0, 8),
    photographer: one(b.photographer as { display_name?: string | null })?.display_name || "작가",
    customer: one(b.user as { display_name?: string | null })?.display_name || "고객",
    amount: (b.amount_krw as number | null) ?? 0,
    settlementAmount: (b.settlement_amount_krw as number | null) ?? null,
    pkg: (b.package_snapshot as { name?: string } | null)?.name ?? "촬영",
    when: (b.shoot_at as string | null) ?? (b.shoot_date as string | null) ?? "일정 협의",
    location: (b.location_text as string | null) || null,
  };
}

const ADMIN_TX_LINK = SITE_URL ? `${SITE_URL}/admin/transactions` : "/admin/transactions";
const ADMIN_SUPPORT_LINK = SITE_URL ? `${SITE_URL}/admin/support` : "/admin/support";

async function postDiscord(webhook: string | undefined, lines: string[]) {
  if (!webhook) return; // 미설정이면 조용히 패스(로컬/미배포)
  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: lines.join("\n") }),
      redirect: "manual",
    });
    // ⚠️ 응답을 **봐야 한다.** 웹훅이 죽었거나 본문이 거절되면 fetch 는 예외를 던지지 않고
    //    4xx 를 돌려줄 뿐이다. 전에는 그걸 안 봐서 "알림이 안 왔다" 는 신고를 받고도
    //    보냈는지조차 알 수 없었다(2026-09-17 입점 동의 알림). 실패는 로그에 남긴다.
    if (!res.ok) {
      console.error(
        `[ops-alert] 디스코드 전송 실패 ${res.status}: ${(await res.text()).slice(0, 200)}`
      );
    }
  } catch (e) {
    // 디스코드 실패가 본 처리를 막지 않게 삼키되, 조용히 사라지게는 두지 않는다
    console.error("[ops-alert] 디스코드 전송 중 예외:", e);
  }
}

/** 예약 수락 — 거래 시작의 실제 트리거. 운영은 입금 대기 큐를 주시하면 된다. */
export async function notifyOpsBookingAccepted(params: { bookingId: string }): Promise<void> {
  const c = await loadBookingContext(params.bookingId);
  if (!c) return;
  await postDiscord(INQUIRY_WEBHOOK, [
    `🤝 **예약 수락** — ${c.photographer} 작가 × ${c.customer}  (예약 \`${c.ref}\`)`,
    `📦 ${c.pkg} · **₩${won(c.amount)}** · ${c.when}${c.location ? ` · ${c.location}` : ""}`,
    `_고객에게 사매 계좌가 안내됐어요. 입금 신고가 오면 대조 후 확인 처리합니다._`,
    `🛠 ${ADMIN_TX_LINK}`,
  ]);
}

/** 고객 [입금 완료] 신고(에스크로) — 운영이 사매 계좌 입금내역과 대조 후 확인 처리 */
export async function notifyOpsBookingDeposit(params: { bookingId: string }): Promise<void> {
  const c = await loadBookingContext(params.bookingId);
  if (!c) return;
  await postDiscord(DEPOSIT_WEBHOOK, [
    `💰 **입금완료 신고 (에스크로)** — ${c.customer} → 사매 계좌  (예약 \`${c.ref}\`)`,
    `💳 금액: **₩${won(c.amount)}** · ${c.photographer} 작가 · ${c.pkg}`,
    `🛠 **사매 계좌 입금내역 대조 후 [입금 확인]: ${ADMIN_TX_LINK}**`,
  ]);
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
  const webhook = APPLICATION_WEBHOOK;
  if (!webhook) return; // 미설정이면 조용히 패스(로컬/미배포)

  try {
    const ref = params.applicationId.slice(0, 8); // 운영진 대조용 짧은 참조
    const lines: string[] = [
      `🎨 **새 작가 신청** — ${params.displayName}  (ID \`${ref}\`)`,
      `• 포트폴리오: ${params.portfolioUrl}`,
      `• 연락처: ${params.phone}`,
    ];
    if (params.bio) lines.push(`• 소개: ${params.bio}`);
    lines.push("", "작가가 카카오 채널로도 신청 메시지를 보낼 거예요. 채널 확인 후 진행해주세요.");

    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: lines.join("\n") }),
      redirect: "manual",
    });
  } catch {
    // 알림 실패가 신청 접수를 막지 않게 무시
  }
}

/**
 * 작가 입점 동의 완료 — **여기서부터 계약이 시작된다.**
 *
 * 신청 접수(notifyOpsNewApplication)와 승인은 운영이 직접 하는 일이라 이미 알고 있지만,
 * **동의는 작가가 언제 누를지 모른다.** 그 시점이 계약일이고, 그때부터 사진을 올리고
 * 의뢰를 받는다. 운영이 모르고 지나가면 "언제부터 활동 중인지" 를 나중에 되짚어야 한다.
 *
 * 사업자 유형을 같이 싣는 이유 — 정산 방식이 여기서 갈린다(미등록이면 3.3% 원천징수).
 * 세금계산서·지급명세서 준비가 유형에 따라 달라서, 동의 시점에 알아야 뒤늦게 안 바뀐다.
 */
export async function notifyOpsPhotographerAgreed(params: {
  photographerId: string;
  displayName: string;
  legalName: string;
  businessType: string;
  businessNo: string | null;
  contractVersion: string;
}): Promise<void> {
  const ref = params.photographerId.slice(0, 8);
  const TYPE_LABEL: Record<string, string> = {
    general: "일반과세자",
    simplified: "간이과세자",
    unregistered: "사업자 미등록 (지출증빙용 현금영수증 발급)",
  };
  await postDiscord(APPLICATION_WEBHOOK, [
    `✍️ **입점 동의 완료** — ${params.displayName} 작가  (ID \`${ref}\`)`,
    `• 계약 당사자: ${params.legalName}`,
    `• 사업자 유형: ${TYPE_LABEL[params.businessType] ?? params.businessType}` +
      (params.businessNo ? ` · ${params.businessNo}` : ""),
    `• 계약 버전: ${params.contractVersion}`,
    "",
    "오늘이 계약일입니다. 이제부터 사진 게재와 의뢰 수신이 가능해요.",
  ]);
}

/**
 * 고객 환불(취소) 신청 — **시계가 도는 알림이다.**
 *
 * 신청이 들어온 순간이 곧 취소 시점(취소환불 5조 3항)이고, 거기서부터 **3영업일 안에**
 * 환급해야 한다(전자상거래법 18조 2항). 넘기면 연 15% 지연이자가 법정 의무로 붙는다.
 * 전에는 support_requests 에 행만 쌓이고 아무도 몰랐다 — 그 자체가 기한 초과의 원인이다.
 *
 * 판정 금액을 같이 싣는다. 운영이 어드민을 열기 전에 "얼마짜리 건인지" 를 알아야
 * 작가와 이야기를 시작할 수 있다. 계산은 화면·어드민과 같은 함수(quoteRefund)를 쓴다.
 */
export async function notifyOpsRefundRequested(params: {
  bookingId: string | null;
  requestId: string;
  /** 고객이 적은 사유 */
  body: string;
  /** 취소 신청이 아니라 작가측 촬영 취소인가 (취소환불 8조) */
  byPhotographer?: boolean;
}): Promise<void> {
  const webhook = REFUND_WEBHOOK;
  if (!webhook) return;

  const head = params.byPhotographer ? "🧨 **작가측 촬영 취소 접수**" : "💸 **환불(취소) 신청**";
  const lines: string[] = [];

  if (!params.bookingId) {
    // 예약이 안 붙은 일반 문의 — 금액을 셀 수 없다
    lines.push(head, `> ${params.body.slice(0, 300)}`, `🛠 ${ADMIN_SUPPORT_LINK}`);
    await postDiscord(webhook, lines);
    return;
  }

  const c = await loadBookingContext(params.bookingId);
  const quote = await quoteRefund(params.bookingId);
  const admin = createAdminClient();
  const { data: req } = await admin
    .from("support_requests")
    .select("refund_account")
    .eq("id", params.requestId)
    .maybeSingle();
  const acct = req?.refund_account as { bank?: string; number?: string; holder?: string } | null;

  lines.push(`${head} — ${c?.photographer ?? "작가"} 작가 × ${c?.customer ?? "고객"}  (예약 \`${c?.ref ?? ""}\`)`);
  if (c) lines.push(`📦 ${c.pkg} · 결제 **₩${won(c.amount)}** · 촬영 ${c.when}`);
  lines.push(`> ${params.body.slice(0, 300)}`);

  if (quote) {
    // 남은 날수는 **신청 시각** 기준이다 — 운영이 며칠 뒤에 봐도 이 숫자는 안 바뀐다
    const days = quote.daysUntilShoot;
    lines.push(
      `⚖️ 규정대로면 **₩${won(quote.refundKrw)} 환불** (위약금 ${quote.penaltyPct}%` +
        `${days != null ? ` · 촬영까지 ${days}일` : ""})`
    );
    if (quote.penaltyKrw > 0) {
      lines.push(`   └ 위약금 ₩${won(quote.penaltyKrw)} → 작가 ₩${won(quote.penaltyPhotographerKrw)} · 사매 ₩${won(quote.penaltyCompanyKrw)}`);
    }
  }
  if (acct?.number) lines.push(`🏦 환불 계좌 ${acct.bank ?? ""} ${acct.number} (${acct.holder ?? ""})`);

  lines.push(`⏰ **3영업일 안에 환급해야 합니다** — 넘기면 연 15% 지연이자`);
  lines.push(`🗣 **먼저 작가와 이야기하고**, 합의되면 접수함에서 [작가 합의 확인]: ${ADMIN_SUPPORT_LINK}`);

  await postDiscord(webhook, lines);
}

/**
 * 작가 [정산 못 받았어요] — 사매가 보냈다고 기록했는데 작가는 받지 못한 건.
 *
 * 돈이 어디서 멈췄는지 아는 사람이 아무도 없는 상태라 **사람이 봐야 한다.**
 * 입금 신고와 같은 채널로 보낸다 — 대조할 곳이 사매 계좌 거래내역으로 같다.
 */
export async function notifyOpsSettlementDispute(params: { bookingId: string }): Promise<void> {
  const c = await loadBookingContext(params.bookingId);
  if (!c) return;
  await postDiscord(DEPOSIT_WEBHOOK, [
    `🚨 **정산 미수령 신고** — ${c.photographer} 작가  (예약 \`${c.ref}\`)`,
    `💳 결제액 **₩${won(c.amount)}** · ${c.customer} 고객 · ${c.pkg}`,
    `_사매는 정산 송금을 완료로 기록했는데 작가는 받지 못했다고 합니다._`,
    `🛠 **송금 내역 확인 후 재처리: ${ADMIN_TX_LINK}**`,
  ]);
}

/**
 * 작가 신청 승인 — **운영자가 보낼 안내 대본을 같이 만들어 준다.**
 *
 * 승인만 눌러 두면 작가는 아무것도 모른다. 승인은 "이제 입점할 수 있다" 는 뜻이지
 * 입점이 끝났다는 뜻이 아니어서, 다음에 뭘 해야 하는지 알려 주지 않으면 그대로 멈춘다.
 *
 * 지금은 채널톡으로 사람이 직접 보내므로, 복사해 붙일 수 있게 **코드 블록**으로 던진다.
 * 나중에 알림톡으로 옮길 것 — 다만 문안을 바꾸면 템플릿 재심사이므로 그때 한 번에 한다
 * (docs/34-kakao-alimtalk.md).
 */
export function approvalScript(params: { displayName: string; feeLabel: string }): string {
  return [
    "안녕하세요, 사매입니다. 🎞",
    "",
    `${params.displayName} 작가님, 신청 검토가 완료되어 승인해 드렸어요.`,
    "이제 입점 절차만 마치면 바로 활동하실 수 있습니다.",
    "",
    `▸ 입점하기: ${SITE_URL || "https://www.samae.ai"}/studio`,
    "",
    "스튜디오에 들어가시면 입점 동의 화면이 떠요. 5분이면 끝납니다.",
    "",
    "준비해 주실 것",
    "· 계약에 쓰일 성명 또는 상호",
    "· 사업자 유형 (일반과세자 / 간이과세자 / 미등록)",
    "· 사업자등록증 사본 — 등록 작가만, PDF 또는 사진",
    "  (수수료 세금계산서 발급에 필요해요. 사매 운영진만 열람합니다)",
    "",
    `중개 수수료는 ${params.feeLabel}이고, 정산은 결과물 전달 확인 후 7영업일 안에 보내드려요.`,
    "사매는 원천징수를 하지 않아, 촬영 대금은 작가님이 직접 신고하시면 됩니다.",
    "",
    "궁금한 점 있으시면 편하게 답장 주세요!",
  ].join("\n");
}

/** 승인 직후 운영 채널에 안내 대본을 올린다 — 그대로 복사해 보내면 된다 */
export async function notifyOpsApplicationApproved(params: {
  displayName: string;
  feeLabel: string;
}): Promise<void> {
  await postDiscord(APPLICATION_WEBHOOK, [
    `✅ **작가 신청 승인** — ${params.displayName}`,
    "아래를 그대로 복사해 채널톡으로 보내주세요.",
    "```",
    approvalScript(params),
    "```",
  ]);
}
