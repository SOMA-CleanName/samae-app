// 안내문서 캡처용 — 역할극 예약을 특정 화면 상태로 되돌린다.
//
// 캡처는 화면 상태마다 한 장씩 필요한데, 한 번 지나간 상태(예: 연락처 전달 전)는
// 다시 만들기 어렵다. 이 스크립트는 테스트 예약 한 건을 앞뒤로 옮겨
// 같은 방에서 모든 장면을 찍을 수 있게 한다.
//
// 테스트 손님(roleplay-customer*) 예약에만 손댄다. 실사용자 데이터는 건드리지 않는다.
//
// 사용: node scripts/capture-state.cjs <preset>
//   show           현재 상태 출력
//   contact-reset  연락처 전달 취소 → 작가에게 [연락처 보내기] 버튼이 다시 보인다
//   contact-sent   작가가 보낸 직후 → 고객에게 동의 카드가 보인다
//   contact-done   고객이 받은 뒤 → 연락처 카드가 채팅에 남는다
//   greet          봇이 인계한 방에 작가의 첫 인사를 넣는다
const fs = require("fs");
const { Client } = require("pg");

const t = fs.readFileSync(".env.local", "utf8");
const url =
  (t.match(/^SUPABASE_DB_POOLER_URL=(.+)$/m) || t.match(/^SUPABASE_DB_URL=(.+)$/m) || [])[1];
if (!url) throw new Error("SUPABASE_DB_POOLER_URL 을 .env.local 에서 찾지 못했어요.");

const CUSTOMER_EMAILS = ["roleplay-customer@samae.test", "roleplay-customer2@samae.test"];
const PRESET = (process.argv[2] || "show").trim();

const SET = {
  "contact-reset": "contact_sent_at = null, contact_delivered_at = null, contact_payload = null",
  "contact-sent": "contact_delivered_at = null",
  "contact-done": "contact_delivered_at = now()",
};

// 작가 인계 직후의 첫 인사 — 캡처에 "봇이 물러나고 작가가 답한다"가 보이려면 이 한 줄이 필요하다.
// 브라우저로 그 작가 계정에 로그인하지 않고 찍을 때 쓴다.
const GREETING = "안녕하세요 고객님! 문의 주셔서 감사합니다. 제가 이어서 답변드릴게요.";

(async () => {
  const c = new Client({ connectionString: url.trim() });
  await c.connect();

  const { rows: users } = await c.query("select id from auth.users where email = any($1)", [
    CUSTOMER_EMAILS,
  ]);
  if (users.length === 0) throw new Error("테스트 손님 계정이 없어요.");
  const ids = users.map((u) => u.id);

  if (PRESET === "whois") {
    const { rows } = await c.query(
      `select c.id, c.user_id, c.photographer_id, p.profile_id as photographer_profile,
              p.display_name, c.bot_disabled_at is not null as handed_off
         from conversations c left join photographers p on p.id = c.photographer_id
        where c.user_id = any($1)`,
      [ids]
    );
    console.table(rows);
    await c.end();
    return;
  }

  if (PRESET === "greet") {
    // 봇이 인계한 방마다 작가의 첫 인사를 한 번만 넣는다 (여러 번 돌려도 안전)
    const { rows: convs } = await c.query(
      `select id, photographer_id from conversations
        where user_id = any($1) and bot_disabled_at is not null`,
      [ids]
    );
    let added = 0;
    for (const cv of convs) {
      const { rows: ph } = await c.query("select profile_id from photographers where id = $1", [
        cv.photographer_id,
      ]);
      const senderId = ph[0]?.profile_id;
      if (!senderId) continue;
      const { rows: dup } = await c.query(
        "select 1 from messages where conversation_id = $1 and body = $2 limit 1",
        [cv.id, GREETING]
      );
      if (dup.length) continue;
      await c.query(
        `insert into messages (conversation_id, sender_id, body, type)
         values ($1, $2, $3, 'text')`,
        [cv.id, senderId, GREETING]
      );
      added++;
    }
    console.log(`\u2705 greet — 대화 ${convs.length}개 중 ${added}개에 인사 추가`);
  } else if (PRESET !== "show") {
    const set = SET[PRESET];
    if (!set) throw new Error(`모르는 preset: ${PRESET} — ${Object.keys(SET).join(", ")}`);
    // 연락처 카드 메시지도 함께 정리 — 안 그러면 지난 회차 말풍선이 겹쳐 찍힌다
    if (PRESET === "contact-reset") {
      await c.query(
        `delete from messages where type = 'contact_card'
           and conversation_id in (select id from conversations where user_id = any($1))`,
        [ids]
      );
    }
    const { rowCount } = await c.query(
      `update bookings set ${set} where user_id = any($1)`,
      [ids]
    );
    console.log(`✅ ${PRESET} — 예약 ${rowCount}건`);
  }

  const { rows } = await c.query(
    `select id, status, transfer_marked_at is not null as marked,
            contact_sent_at is not null as contact_sent,
            contact_delivered_at is not null as contact_delivered
       from bookings where user_id = any($1) order by created_at desc`,
    [ids]
  );
  console.table(rows);
  await c.end();
})().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
