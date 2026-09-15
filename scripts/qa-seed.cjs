#!/usr/bin/env node
/**
 * QA 무대 깔기 — **모든 상태의 예약을 한 번에 세운다.**
 *
 * 세 입장(고객·작가·어드민)에서 흐름을 직접 눌러 보려면, 각 화면이 기다리는 상태의 예약이
 * 실제로 깔려 있어야 한다. 어드민 「입금 확인 대기」 큐를 보려면 입금을 알린 예약이 있어야
 * 하고, 「정산 대기」를 보려면 전달까지 끝난 예약이 있어야 한다. 그걸 매번 손으로 만들면
 * 한 바퀴 도는 데 반나절이 걸리고, 결국 안 돌게 된다.
 *
 * 무대는 이 둘 사이에 선다:
 *   고객  roleplay-customer@samae.test   (시크릿 창 + /dev/test-login)
 *   작가  김재즈                          (= 정훈 본인 계정 — 어드민도 같은 로그인)
 *
 * ⚠️ **운영 DB 에 진짜 행이 생긴다.** 별도 dev 프로젝트가 없어서다. 그래서 메모에 표식을
 *    박고(QA_TAG) `clean` 이 그 표식만 지운다 — 실제 거래는 건드리지 않는다.
 *
 * 쓰는 법:
 *   node scripts/qa-seed.cjs seed     무대 세우기 (이미 있으면 먼저 지운다)
 *   node scripts/qa-seed.cjs list     지금 깔린 것 + 각 화면 링크
 *   node scripts/qa-seed.cjs clean    표식 붙은 것 전부 제거
 */

const fs = require("fs");
const path = require("path");

// ── 환경 ────────────────────────────────────────────────
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(__dirname, "..", ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) {
  console.error("❌ .env.local 에 NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.");
  process.exit(1);
}
if (/supabase\.co/.test(URL_) === false) {
  console.error("❌ Supabase URL 이 아닙니다:", URL_);
  process.exit(1);
}

/** 이 스크립트가 만든 것을 알아보는 표식. clean 이 이것만 지운다 */
const QA_TAG = "[QA무대]";

const CUSTOMER = "e90f145d-6ee1-4ea6-ac07-86233545105b"; // roleplay-customer@samae.test
const PHOTOGRAPHER = "99d988d6-d42f-403e-b062-215d502ebc58"; // 김재즈
const PACKAGE = "a9d2a0da-14fc-4a27-be74-5bb39efc2d83";

const AMOUNT = 300_000;
const TRAVEL = 30_000;
const FEE_RATE = 0.2;

// ── REST 헬퍼 ───────────────────────────────────────────
async function rest(method, pathname, body, prefer) {
  const res = await fetch(`${URL_}/rest/v1/${pathname}`, {
    method,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${pathname} → ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
const get = (p) => rest("GET", p);
const insert = (t, row) => rest("POST", t, row, "return=representation");
const patch = (t, row) => rest("PATCH", t, row, "return=representation");
const del = (t) => rest("DELETE", t);

// ── 날짜 ────────────────────────────────────────────────
// 같은 작가가 같은 시간대에 두 건을 가질 수 없다(DB exclusion 제약) —
// 같은 날짜를 쓰는 단계가 있으므로 단계마다 시각을 벌려 준다
const days = (n, hour = 14) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const ymd = d.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
  return `${ymd}T${String(hour).padStart(2, "0")}:00:00+09:00`;
};
const agoHours = (h) => new Date(Date.now() - h * 3600_000).toISOString();

/**
 * 깔 무대 — 각 행이 **어느 화면의 어느 상태**를 여는지가 라벨이다.
 * 위에서 아래로 거래가 진행되는 순서다.
 */
const STAGE = [
  {
    key: "requested",
    label: "① 작가 제안 · 고객 수락 대기",
    shootIn: 20,
    booking: { status: "requested" },
    sees: "고객 채팅에 [수락하기] · 작가 예약 카드에 [취소]",
  },
  {
    key: "accepted-far",
    label: "② 수락됨 · 입금 전 (촬영 20일 뒤 — 여유)",
    shootIn: 20,
    booking: { status: "accepted", accepted_at: agoHours(2) },
    sees: "고객: 계좌·위약금 표가 바로 열린다 (동의 모달 없음)",
  },
  {
    key: "accepted-late",
    label: "③ 수락됨 · 입금 전 (촬영 3일 뒤 — 임박)",
    shootIn: 3,
    booking: { status: "accepted", accepted_at: agoHours(1) },
    sees: "고객: 계좌가 가려지고 위약금 90% 동의 모달이 먼저 선다",
  },
  {
    key: "transfer-marked",
    label: "④ 고객이 [입금 완료] 누름 · 사매 확인 대기",
    shootIn: 15,
    booking: { status: "accepted", accepted_at: agoHours(30), transfer_marked_at: agoHours(1) },
    sees: "어드민 거래 → 「입금 확인 대기」 큐",
  },
  {
    key: "paid",
    label: "⑤ 입금 확인됨 · 촬영 5일 뒤 (연락처 열림)",
    shootIn: 5,
    booking: { status: "paid", accepted_at: agoHours(50), transfer_marked_at: agoHours(48), paid_at: agoHours(47) },
    fee: true,
    sees: "작가: [연락처 보내기]·[일정 변경 요청] / 고객: 받기·동의",
  },
  {
    key: "paid-early",
    label: "⑨ 입금 확인됨 · 촬영 30일 뒤 (연락처 아직 닫힘)",
    shootIn: 30,
    booking: { status: "paid", accepted_at: agoHours(50), transfer_marked_at: agoHours(48), paid_at: agoHours(47) },
    fee: true,
    sees: "작가 카드에 [연락처 보내기] 대신 «촬영 7일 전부터» 안내 (HANDOFF §3-1)",
  },
  {
    key: "delivered",
    label: "⑥ 결과물 전달 완료 · 정산 대기",
    shootIn: -5,
    booking: {
      status: "delivered",
      accepted_at: agoHours(400),
      transfer_marked_at: agoHours(398),
      paid_at: agoHours(397),
      delivered_at: agoHours(3),
    },
    fee: true,
    sees: "어드민 거래 → 「정산 대기」 큐 · 작가 정산 화면에 예정액",
  },
  {
    key: "settle-overdue",
    label: "⑩ 전달 후 12일 방치 · 정산 기한 초과",
    shootIn: -20,
    booking: {
      status: "delivered",
      accepted_at: agoHours(800),
      transfer_marked_at: agoHours(798),
      paid_at: agoHours(797),
      delivered_at: agoHours(12 * 24),
    },
    fee: true,
    sees: "어드민 거래 → 「정산 지연」 배지 + 붉은 줄 (전달 후 7영업일 초과)",
  },
  {
    key: "refund-open",
    label: "⑦ 환불 신청 접수됨 · 작가 합의 대기",
    shootIn: 5,
    booking: {
      status: "paid",
      accepted_at: agoHours(100),
      transfer_marked_at: agoHours(98),
      paid_at: agoHours(97),
      refund_due_at: agoHours(2),
    },
    fee: true,
    refundRequest: true,
    sees: "어드민 접수함 → [작가 합의 확인] · 거래 화면 [환불]은 잠겨 있다",
  },
  {
    key: "refunded-unpaid",
    label: "⑧ 환불 판정 끝 · PG 송금 전",
    shootIn: 8,
    booking: {
      status: "refunded",
      accepted_at: agoHours(200),
      transfer_marked_at: agoHours(198),
      paid_at: agoHours(197),
      refund_due_at: agoHours(30),
      refunded_at: agoHours(1),
      cancelled_at: agoHours(1),
      refund_reason: "penalty_0",
      refund_krw: AMOUNT + TRAVEL,
    },
    refundRequest: true,
    refundAcked: true,
    sees: "어드민 거래 → 「아직 송금 전」 블록 + [송금 완료로 기록]",
  },
];

async function conversationId() {
  const found = await get(
    `conversations?select=id&user_id=eq.${CUSTOMER}&photographer_id=eq.${PHOTOGRAPHER}`
  );
  if (found[0]) return found[0].id;
  const made = await insert("conversations", {
    user_id: CUSTOMER,
    photographer_id: PHOTOGRAPHER,
  });
  return made[0].id;
}

async function clean({ quiet } = {}) {
  const rows = await get(`bookings?select=id&memo=like.*${encodeURIComponent(QA_TAG)}*`);
  if (rows.length === 0) {
    if (!quiet) console.log("치울 게 없습니다.");
    return 0;
  }
  const ids = rows.map((r) => r.id);
  const inList = `(${ids.join(",")})`;
  // 자식부터 — bookings 를 restrict 로 참조하는 행이 남으면 삭제가 막힌다
  await del(`support_requests?booking_id=in.${inList}`);
  await del(`messages?booking_id=in.${inList}`);
  await del(`platform_fees?booking_id=in.${inList}`);
  await del(`payments?booking_id=in.${inList}`);
  await del(`bookings?id=in.${inList}`);
  if (!quiet) console.log(`🧹 ${ids.length}건 제거`);
  return ids.length;
}

async function seed() {
  await clean({ quiet: true });
  const convId = await conversationId();
  const pkg = (await get(`packages?select=*&id=eq.${PACKAGE}`))[0];

  console.log(`무대를 세웁니다 — 고객 roleplay-customer × 작가 김재즈\n`);
  for (const [i, s] of STAGE.entries()) {
    const amount = AMOUNT + TRAVEL;
    const feeKrw = Math.round(amount * FEE_RATE);
    const [b] = await insert("bookings", {
      user_id: CUSTOMER,
      photographer_id: PHOTOGRAPHER,
      package_id: PACKAGE,
      shoot_at: days(s.shootIn, 9 + (i % 9)),
      duration_min: pkg?.duration_min ?? 60,
      location_text: "서울 성동구 성수동",
      amount_krw: amount,
      travel_fee_krw: TRAVEL,
      package_snapshot: pkg ?? { name: "테스트패키지", delivery_days: 21 },
      fee_snapshot: { mode: "rate", rate: FEE_RATE, baseKrw: amount, shootFeeKrw: amount, feeKrw, vatKrw: Math.round(feeKrw * 0.1) },
      memo: `${QA_TAG} ${s.label}`,
      proposed_by_photographer: true,
      ...s.booking,
    });

    // 채팅 타임라인에 예약 카드를 세운다 — 채팅에서 눌러야 실제 흐름이다
    await insert("messages", {
      conversation_id: convId,
      sender_id: CUSTOMER,
      type: "system",
      body: `${QA_TAG} ${s.label}`,
      booking_id: b.id,
    });

    if (s.fee) {
      await insert("platform_fees", {
        booking_id: b.id,
        photographer_id: PHOTOGRAPHER,
        fee_krw: feeKrw,
        status: "accrued",
        period: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }).slice(0, 7),
        accrued_at: agoHours(40),
      });
    }

    if (s.refundRequest) {
      await insert("support_requests", {
        booking_id: b.id,
        conversation_id: convId,
        requester_id: CUSTOMER,
        requester_role: "customer",
        kind: "refund",
        body: `${QA_TAG} 사정이 생겨 취소하고 싶어요.`,
        refund_account: { bank: "국민은행", number: "123456-01-789012", holder: "테스트고객" },
        ...(s.refundAcked
          ? { photographer_ack_at: agoHours(5), photographer_ack_note: `${QA_TAG} 작가 합의함` }
          : {}),
        ...(s.key === "refunded-unpaid" ? { status: "resolved", resolved_at: agoHours(1) } : {}),
      });
    }

    console.log(`  ${s.label}`);
    console.log(`    ${b.id}  →  ${s.sees}`);
  }

  console.log(`\n채팅방  /chat/${convId}`);
  console.log(`전부 치우려면  node scripts/qa-seed.cjs clean`);
}

async function list() {
  const rows = await get(
    `bookings?select=id,status,memo,shoot_at&memo=like.*${encodeURIComponent(QA_TAG)}*&order=created_at.asc`
  );
  if (rows.length === 0) return console.log("깔린 무대가 없습니다. `seed` 로 세우세요.");
  for (const r of rows) {
    console.log(`${r.memo.replace(QA_TAG + " ", "")}`);
    console.log(`  ${r.id}  ·  ${r.status}  ·  촬영 ${String(r.shoot_at).slice(0, 10)}`);
  }
  const conv = await get(
    `conversations?select=id&user_id=eq.${CUSTOMER}&photographer_id=eq.${PHOTOGRAPHER}`
  );
  if (conv[0]) console.log(`\n채팅방  /chat/${conv[0].id}`);
}

(async () => {
  const cmd = process.argv[2] || "list";
  try {
    if (cmd === "seed") await seed();
    else if (cmd === "clean") await clean();
    else if (cmd === "list") await list();
    else {
      console.log("사용법: node scripts/qa-seed.cjs [seed|list|clean]");
      process.exit(1);
    }
  } catch (e) {
    console.error("❌", e instanceof Error ? e.message : e);
    process.exit(1);
  }
})();
