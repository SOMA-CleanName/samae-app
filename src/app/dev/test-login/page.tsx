import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { testSignIn, testSignUpFresh, testCleanupFresh } from "./actions";

// 개발 전용 테스트 로그인 — 카카오 없이 가입 이후 흐름을 다시 보기 위한 뒷문.
// 프로덕션에서는 404 (NODE_ENV 는 빌드타임 상수라 번들에서도 제거된다).
//
// 가드는 actions.ts 에도 따로 있다 — 이 지면을 우회해도 막힌다. 거기 주석 참고.

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

const TEST_DOMAIN = "@samae.test";

type Row = {
  email: string;
  stage: string;
  detail: string;
};

export default async function TestLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ removed?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { removed } = await searchParams;

  const admin = createAdminClient();
  const rows = await loadTestAccounts(admin);

  return (
    <main className="mx-auto max-w-lg px-3.5 py-10 font-kr sm:px-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-brand">dev only</p>
      <h1 className="mt-1.5 text-2xl font-semibold">테스트 로그인</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        이메일 가입이 꺼져 있어(SMTP 준비 전) 가입 경로가 카카오뿐인데, QA 하는 사람의 카카오 계정은
        이미 가입돼 있습니다. 그래서 &ldquo;처음 온 사람&rdquo; 화면을 다시 볼 수 없었어요.
      </p>

      {removed != null && (
        <p className="mt-4 rounded-xl border border-success/30 bg-success-soft px-3.5 py-2.5 text-sm text-success-ink">
          임시 계정 {removed}개를 지웠어요.
        </p>
      )}

      {/* ── 새 사람으로 시작 ── */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold">처음 온 사람으로 시작</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          매번 <b className="font-semibold text-fg">새 계정</b>을 만들어 로그인합니다. 약관 동의도 전화번호도
          없는 상태라, 카카오로 막 가입한 사람과 같은 자리에서 출발해요.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          <form action={testSignUpFresh}>
            <input type="hidden" name="next" value="/apply" />
            <button className="w-full cursor-pointer rounded-xl bg-fg py-3 text-sm font-semibold text-bg transition-opacity hover:opacity-90">
              새 계정으로 /apply 열기
            </button>
          </form>
          <form action={testSignUpFresh}>
            <input type="hidden" name="next" value="/" />
            <button className="w-full cursor-pointer rounded-xl border border-line-strong py-3 text-sm font-medium transition-colors hover:bg-fg/[0.04]">
              새 계정으로 홈 열기
            </button>
          </form>
        </div>
      </section>

      {/* ── 기존 테스트 계정 ── */}
      <section className="mt-9">
        <h2 className="text-sm font-semibold">테스트 계정으로 로그인</h2>
        <p className="mt-1 text-xs text-muted">
          {TEST_DOMAIN} 계정만 보입니다. 단계 되감기는{" "}
          <code className="rounded bg-fg/[0.06] px-1 py-0.5 text-[0.7rem]">
            node scripts/qa-photographer.cjs
          </code>
        </p>

        {rows.length === 0 ? (
          <p className="mt-3 rounded-xl border border-line p-4 text-sm text-muted">
            테스트 계정이 없어요. <code>node scripts/qa-photographer.cjs setup</code> 으로 만드세요.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {rows.map((r) => (
              <li key={r.email} className="rounded-xl border border-line p-3">
                <p className="text-sm font-medium tabular-nums">{r.email}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {r.stage} · {r.detail}
                </p>
                <div className="mt-2.5 flex gap-2">
                  <form action={testSignIn} className="flex-1">
                    <input type="hidden" name="email" value={r.email} />
                    <input type="hidden" name="next" value="/apply" />
                    <button className="w-full cursor-pointer rounded-lg bg-fg/[0.06] py-2 text-xs font-semibold transition-colors hover:bg-fg/10">
                      /apply 로
                    </button>
                  </form>
                  <form action={testSignIn} className="flex-1">
                    <input type="hidden" name="email" value={r.email} />
                    <input type="hidden" name="next" value="/studio" />
                    <button className="w-full cursor-pointer rounded-lg bg-fg/[0.06] py-2 text-xs font-semibold transition-colors hover:bg-fg/10">
                      /studio 로
                    </button>
                  </form>
                  <form action={testSignIn} className="flex-1">
                    <input type="hidden" name="email" value={r.email} />
                    <input type="hidden" name="next" value="/" />
                    <button className="w-full cursor-pointer rounded-lg bg-fg/[0.06] py-2 text-xs font-semibold transition-colors hover:bg-fg/10">
                      홈으로
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-9 border-t border-line pt-5">
        <form action={testCleanupFresh}>
          <button className="cursor-pointer text-xs text-muted underline underline-offset-2 hover:text-fg">
            임시로 만든 qa-fresh-* 계정 전부 지우기
          </button>
        </form>
      </section>

      <Link href="/" className="mt-8 inline-block text-sm text-muted hover:text-fg">
        ← 홈으로
      </Link>
    </main>
  );
}

/** 테스트 계정 목록 + 각자 작가 흐름의 어느 단계인지 */
async function loadTestAccounts(admin: ReturnType<typeof createAdminClient>): Promise<Row[]> {
  const out: Row[] = [];
  const users: { id: string; email: string }[] = [];

  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;
    for (const u of data.users) {
      if (u.email?.endsWith(TEST_DOMAIN)) users.push({ id: u.id, email: u.email });
    }
    if (data.users.length < 200) break;
  }
  if (users.length === 0) return out;

  const ids = users.map((u) => u.id);
  const [{ data: phs }, { data: apps }] = await Promise.all([
    admin.from("photographers").select("id, profile_id, status").in("profile_id", ids),
    admin.from("photographer_applications").select("profile_id, status").in("profile_id", ids),
  ]);

  const agreedBy = new Set<string>();
  const phIds = (phs ?? []).map((p) => p.id as string);
  if (phIds.length) {
    const { data: ags } = await admin
      .from("photographer_agreements")
      .select("photographer_id")
      .in("photographer_id", phIds);
    for (const a of ags ?? []) agreedBy.add(a.photographer_id as string);
  }

  for (const u of users) {
    const ph = (phs ?? []).find((p) => p.profile_id === u.id);
    const app = (apps ?? []).find((a) => a.profile_id === u.id);
    const stage = !app && !ph
      ? "① 신청 전"
      : !ph
        ? "② 승인 대기"
        : !agreedBy.has(ph.id as string)
          ? "③ 입점 동의 전"
          : "④ 동의 완료";
    out.push({
      email: u.email,
      stage,
      detail: `신청 ${app?.status ?? "없음"} · 작가 ${ph?.status ?? "없음"}`,
    });
  }

  // 되감기용 고정 계정을 맨 위로, 임시 계정(qa-fresh-*)은 아래로
  return out.sort((a, b) => {
    const af = a.email.startsWith("qa-fresh-") ? 1 : 0;
    const bf = b.email.startsWith("qa-fresh-") ? 1 : 0;
    return af - bf || a.email.localeCompare(b.email);
  });
}
