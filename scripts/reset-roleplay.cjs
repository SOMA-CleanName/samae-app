// 역할극 초기화 — 손님↔김재즈 테스트 대화를 처음 상태로 되돌린다.
//
//   지우는 것: 두 테스트 손님과 김재즈 사이의 대화·메시지·예약·문의·미답변질문·검열기록
//   건드리지 않는 것: 김재즈 KB, 봇 전역 정책, 실사용자 데이터
//
// 여러 번 돌려도 안전하다. 테스트를 다시 처음부터 하고 싶을 때마다 실행.
// 사용: node scripts/reset-roleplay.cjs
const fs = require("fs");
const { Client } = require("pg");

const t = fs.readFileSync(".env.local", "utf8");
const url =
  (t.match(/^SUPABASE_DB_POOLER_URL=(.+)$/m) || t.match(/^SUPABASE_DB_URL=(.+)$/m) || [])[1];
if (!url) throw new Error("SUPABASE_DB_POOLER_URL 을 .env.local 에서 찾지 못했어요.");

const PHOTOGRAPHER = "99d988d6-d42f-403e-b062-215d502ebc58"; // 김재즈
const CUSTOMER_EMAILS = ["roleplay-customer@samae.test", "roleplay-customer2@samae.test"];

(async () => {
  const c = new Client({ connectionString: url.trim() });
  await c.connect();

  const { rows: users } = await c.query(
    "select id, email from auth.users where email = any($1)",
    [CUSTOMER_EMAILS]
  );
  if (users.length === 0) throw new Error("테스트 손님 계정이 없어요.");
  const ids = users.map((u) => u.id);

  const { rows: convs } = await c.query(
    "select id from conversations where photographer_id = $1 and user_id = any($2)",
    [PHOTOGRAPHER, ids]
  );
  const convIds = convs.map((r) => r.id);

  if (convIds.length > 0) {
    // 메시지는 예약을 참조하므로 메시지 → 예약 순서로 지운다
    await c.query("delete from messages where conversation_id = any($1)", [convIds]);
    await c.query("delete from bot_open_questions where conversation_id = any($1)", [convIds]);
    await c.query("delete from moderation_events where conversation_id = any($1)", [convIds]);
  }

  // 예약·결제·수수료 — 테스트 손님과 김재즈 건만
  const { rows: bookings } = await c.query(
    "select id from bookings where photographer_id = $1 and user_id = any($2)",
    [PHOTOGRAPHER, ids]
  );
  const bookingIds = bookings.map((b) => b.id);
  if (bookingIds.length > 0) {
    await c.query("delete from platform_fees where booking_id = any($1)", [bookingIds]);
    await c.query("delete from payments where booking_id = any($1)", [bookingIds]);
    await c.query("update conversations set booking_id = null where booking_id = any($1)", [bookingIds]);
    await c.query("delete from bookings where id = any($1)", [bookingIds]);
  }

  await c.query("delete from inquiries where photographer_id = $1 and profile_id = any($2)", [
    PHOTOGRAPHER,
    ids,
  ]);

  // 대화 자체는 남기되 봇 상태를 처음으로 (방을 지우면 URL 이 매번 바뀌어 불편하다)
  if (convIds.length > 0) {
    await c.query(
      `update conversations
          set bot_disabled_at = null, bot_handoff_notified_at = null, bot_slots = null,
              user_unread = 0, photographer_unread = 0, last_message_at = null,
              user_hidden_at = null, photographer_hidden_at = null
        where id = any($1)`,
      [convIds]
    );
  }

  // 알림도 정리 — 지난 회차 알림이 섞이면 뭐가 새 건지 헷갈린다
  await c.query("delete from notifications where recipient_id = any($1)", [ids]);

  console.log(`✅ 초기화 완료 — 대화 ${convIds.length}개, 예약 ${bookingIds.length}건 정리`);
  for (const u of users) console.log(`   · ${u.email}`);
  console.log("\n손님 진입: /chat/start?photographerId=" + PHOTOGRAPHER);
  await c.end();
})().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
