import type { Metadata } from "next";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

// QA 허브 — **세 입장에서 흐름을 직접 눌러 보는 곳.**
//
// 지면이 흩어져 있으면 주소를 외워야 하고, 외워야 하면 결국 안 돌게 된다.
// 여기서는 역할별로 "어디로 가서 무엇을 확인하는가" 만 본다.
//
// 샌드박스(가짜 데이터)와 실제 지면(진짜 데이터)을 **섞지 않고 구분해 적는다.**
// 샌드박스는 밖으로 나가는 게 없어 마음껏 눌러도 되고, 실제 지면은 진짜 행이 움직인다.
//
// 프로덕션에서는 proxy.ts 의 blockDevRoutes 가 404 로 막는다.

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const QA_TAG = "[QA무대]";

type Item = {
  href: string;
  title: string;
  check: string;
  /** 진짜 행이 움직이는 지면인가 */
  live?: boolean;
};

export default async function DevHubPage() {
  const admin = createAdminClient();

  // 무대가 깔려 있는가 — 없으면 스크립트부터 돌려야 한다
  const { data: staged } = await admin
    .from("bookings")
    .select("id, status, memo, shoot_at")
    .like("memo", `%${QA_TAG}%`)
    .order("created_at", { ascending: true });
  const rows = staged ?? [];

  const { data: conv } = await admin
    .from("conversations")
    .select("id")
    .eq("user_id", "e90f145d-6ee1-4ea6-ac07-86233545105b")
    .eq("photographer_id", "99d988d6-d42f-403e-b062-215d502ebc58")
    .maybeSingle();
  const chat = conv?.id ? `/chat/${conv.id}` : null;

  const customer: Item[] = [
    { href: "/dev/chat?stage=late", title: "채팅 — 결제 팝업 (샌드박스)", check: "수락 → 임박 동의 → 계좌 → 입금완료. `]` `[` 로 단계, `r` 로 역할" },
    { href: "/dev/chat?stage=paid&role=photographer", title: "채팅 — 연락처·일정 변경 (샌드박스)", check: "촬영 5일 뒤라 [연락처 보내기]가 열려 있다. ⑥단계(30일)는 닫혀 있다" },
    { href: "/dev/pay?stage=late", title: "예약 상세 — 결제 구간 (샌드박스)", check: "임박이면 계좌가 가려지는가. 알림 링크가 전부 이쪽이다" },
    ...(chat ? [{ href: chat, title: "실제 채팅방 — 깔린 예약 8건", check: "①~⑧ 카드가 순서대로 선다. 여기서 실제로 수락·결제한다", live: true }] : []),
    { href: "/bookings", title: "내 예약 목록", check: "상태별 카드와 [사매에 문의] 진입", live: true },
  ];

  const photographer: Item[] = [
    { href: "/dev/flow", title: "온보딩 — 가입부터 입점 동의까지 (샌드박스)", check: "약관을 끝까지 내려야 동의가 열리는가. `]` `[` 로 단계" },
    { href: "/dev/money", title: "정산 금액 (샌드박스)", check: "사업자 유형 토글 — 원천징수 줄이 붙고 빠지는가" },
    { href: "/studio", title: "스튜디오", check: "승인·동의 상태에 따라 무엇이 열리는가", live: true },
    { href: "/studio/settlements", title: "정산 내역", check: "⑤⑥ 건의 예정액 · 원천징수 안내", live: true },
    { href: "/apply", title: "작가 신청 (모집 주소)", check: "비로그인은 안내 지면, 로그인하면 폼", live: true },
  ];

  const adminItems: Item[] = [
    { href: "/admin/transactions", title: "거래와 정산", check: "④ 입금 확인 · ⑥ 정산 · ⑦ 환불 잠김 · ⑧ 송금 전 블록", live: true },
    { href: "/admin/support", title: "접수함", check: "⑦ 에서 [작가 합의 확인] → 거래 화면의 [환불] 이 열린다", live: true },
    { href: "/admin/photographers", title: "작가 관리", check: "신청 승인 · 수수료 설정", live: true },
    { href: "/admin/withholding", title: "지급명세서", check: "원천징수 신고 대상 · CSV 내려받기(주민번호 열람은 로그가 남는다)", live: true },
    { href: "/dev/refund-test", title: "환불 알림 쏘기", check: "진짜 경로로 디스코드 발송. `?undo=` 로 되돌린다", live: true },
  ];

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 font-kr">
      <h1 className="text-h1 font-semibold">QA 허브</h1>
      <p className="mt-1.5 text-body-sm leading-relaxed text-muted">
        세 입장에서 흐름을 직접 눌러 봅니다. <b className="text-fg">샌드박스</b>는 밖으로 나가는 게
        없어 마음껏 눌러도 되고, <b className="text-fg">실선 표시</b>가 붙은 건 진짜 행이 움직입니다.
      </p>

      <section className="mt-6 rounded-2xl border border-line bg-surface p-4">
        <p className="text-caption font-semibold text-muted">로그인 전환</p>
        <p className="mt-1.5 text-body-sm leading-relaxed text-fg">
          <b>어드민·작가</b>는 지금 계정 그대로 (정훈 = 어드민 + 작가 김재즈).
          <br />
          <b>고객</b>은 <b className="text-brand-ink">시크릿 창</b>에서{" "}
          <Link href="/dev/test-login" className="underline underline-offset-2">
            /dev/test-login
          </Link>{" "}
          → <code className="rounded bg-surface-2 px-1">roleplay-customer@samae.test</code>
        </p>
        <p className="mt-2 text-caption text-faint">
          같은 창에서 바꾸면 어드민 세션이 끊겨 왔다 갔다 하게 됩니다. 창을 나누는 게 빠릅니다.
        </p>
      </section>

      {rows.length === 0 ? (
        <section className="mt-4 rounded-2xl bg-warning-soft p-4 ring-1 ring-warning/25">
          <p className="text-body-sm font-semibold text-warning-ink">무대가 안 깔려 있습니다</p>
          <p className="mt-1 text-caption leading-relaxed text-warning-ink/85">
            어드민 큐(입금 확인·정산·환불)는 해당 상태의 예약이 있어야 보입니다. 터미널에서:
          </p>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-fg/[0.06] px-3 py-2 text-caption">
            node scripts/qa-seed.cjs seed
          </pre>
        </section>
      ) : (
        <section className="mt-4 rounded-2xl border border-line bg-surface p-4">
          <p className="text-caption font-semibold text-muted">
            깔린 무대 {rows.length}건 · 고객 roleplay-customer × 작가 김재즈
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {rows.map((r) => (
              <li key={r.id as string} className="flex items-baseline gap-2 text-caption">
                <Link
                  href={`/bookings/${r.id}`}
                  className="min-w-0 flex-1 truncate text-fg underline-offset-2 hover:underline"
                >
                  {String(r.memo ?? "").replace(`${QA_TAG} `, "")}
                </Link>
                <span className="shrink-0 text-faint">{String(r.status)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-caption text-faint">
            치우기 · 다시 세우기 — <code>node scripts/qa-seed.cjs clean | seed</code>
          </p>
        </section>
      )}

      <Group title="고객" items={customer} />
      <Group title="작가" items={photographer} />
      <Group title="어드민" items={adminItems} />

      <section className="mt-8 rounded-2xl bg-surface-2 p-4">
        <p className="text-caption font-semibold text-muted">한 바퀴 도는 순서</p>
        <ol className="mt-2 flex flex-col gap-1.5 text-caption leading-relaxed text-fg">
          <li>1. 고객 창(시크릿)에서 채팅방 → ① 예약 수락 → 임박 동의 → 입금 완료</li>
          <li>2. 어드민 창에서 거래 → 「입금 확인 대기」에 뜨는가 → 입금 확인</li>
          <li>3. 작가 시점(/studio)에서 연락처 보내기 → 고객 창에서 받기</li>
          <li>4. 고객 창에서 [사매에 문의 → 환불] → 디스코드 알림이 오는가</li>
          <li>5. 어드민 접수함에서 [작가 합의 확인] → 거래에서 [환불] → [송금 완료로 기록]</li>
          <li>
            6. 원천징수까지 보려면 — 작가 프로필에서 사업자 유형을 <b>미등록</b>으로 두고
            주민번호를 넣은 뒤, 어드민에서 ⑥ 건을 <b>정산</b>하면 지급명세서에 잡힌다
          </li>
        </ol>
        <p className="mt-2 text-caption text-faint">
          자세한 확인 항목은 <code>docs/36-photographer-flow-qa.md</code>
        </p>
      </section>
    </main>
  );
}

function Group({ title, items }: { title: string; items: Item[] }) {
  return (
    <section className="mt-6">
      <h2 className="text-body-sm font-semibold text-fg">{title}</h2>
      <ul className="mt-2 flex flex-col gap-2">
        {items.map((it) => (
          <li key={it.href}>
            <Link
              href={it.href}
              className="block rounded-xl border border-line bg-surface p-3.5 transition-colors hover:bg-fg/[0.03]"
            >
              <p className="flex items-center gap-2 text-body-sm font-medium text-fg">
                {it.title}
                {it.live && (
                  <span className="rounded-full bg-danger/10 px-2 py-0.5 text-label font-semibold text-danger-ink">
                    실선
                  </span>
                )}
              </p>
              <p className="mt-1 text-caption leading-relaxed text-muted">{it.check}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
