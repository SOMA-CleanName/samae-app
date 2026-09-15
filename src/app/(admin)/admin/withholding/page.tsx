import Link from "next/link";
import { EmptyState } from "@/components/ui";
import { loadWithholdingPayments, withholdingPeriods } from "@/lib/withholding-query";
import { groupByPerson, simpleReportDueDate, totalsOf } from "@/lib/withholding-report";

// 지급명세서 — **뗀 세금을 신고하는 자리.**
//
// 원천징수는 떼는 것으로 끝나지 않는다. 신고하고 납부해야 끝난다. 안 하면 작가는 낸 적 없는
// 세금으로 기록되고 우리는 미납이 된다 — 떼는 것보다 이쪽을 빠뜨리는 게 더 나쁘다.
//
// 기한(소득세법 164조·164조의3):
//   간이지급명세서(거주자 사업소득)   지급월의 **다음 달 말일**
//   원천세 신고·납부                 지급월의 다음 달 10일
//   지급명세서(연간)                 다음 해 3월 10일
//
// ⚠️ 이 화면은 **주민등록번호를 평문으로 보여주지 않는다.** 마스킹만 그린다.
//    실제 번호는 [내려받기] 가 서버에서 readResidentNo() 로 열고, 그때 접근 로그가 남는다.
//    화면에 띄우면 어깨너머로 새고, 무엇보다 "누가 왜 열었나" 가 안 남는다.

export const dynamic = "force-dynamic";

const fmt = new Intl.NumberFormat("ko-KR");
const monthLabel = (p: string) => `${p.slice(0, 4)}년 ${Number(p.slice(5, 7))}월`;

export default async function AdminWithholdingPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: raw } = await searchParams;
  const periods = await withholdingPeriods();
  const period = raw && /^\d{4}-\d{2}$/.test(raw) ? raw : periods[0];

  if (!period) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-5">
        <Header />
        <div className="mt-6">
          <EmptyState title="원천징수한 지급이 아직 없어요" />
        </div>
        <p className="mt-3 text-caption leading-relaxed text-faint">
          사업자 미등록 작가에게 정산이 나가면 여기 쌓입니다. 사업자 등록 작가는 세금계산서로
          처리되어 원천징수 대상이 아니라 잡히지 않습니다.
        </p>
      </main>
    );
  }

  const payments = await loadWithholdingPayments(period);
  const people = groupByPerson(payments);
  const t = totalsOf(people);
  const due = simpleReportDueDate(period);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-5">
      <Header />

      {/* 기간 — 지급일(정산 송금 시각) 기준이다 */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {periods.map((p) => (
          <Link
            key={p}
            href={`/admin/withholding?period=${p}`}
            className={
              p === period
                ? "rounded-full bg-fg px-3 py-1.5 text-caption font-semibold text-bg"
                : "rounded-full border border-line-strong px-3 py-1.5 text-caption text-muted transition-colors hover:bg-fg/[0.04]"
            }
          >
            {monthLabel(p)}
          </Link>
        ))}
      </div>

      <section className="mt-4 rounded-2xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
          <Stat k="지급 인원" v={`${t.people}명`} />
          <Stat k="지급 건수" v={`${t.count}건`} />
          <Stat k="지급총액" v={`₩${fmt.format(t.baseKrw)}`} />
          <Stat k="소득세" v={`₩${fmt.format(t.incomeTaxKrw)}`} />
          <Stat k="지방소득세" v={`₩${fmt.format(t.localTaxKrw)}`} />
          <Stat k="원천징수 계" v={`₩${fmt.format(t.taxKrw)}`} strong />
        </div>
        <p className="mt-3 border-t border-line pt-3 text-caption leading-relaxed text-muted">
          간이지급명세서 제출 기한 <b className="text-fg">{due}</b> · 원천세 신고·납부는{" "}
          <b className="text-fg">{period.slice(0, 4)}-{String(Number(period.slice(5, 7)) + 1).padStart(2, "0")}-10</b> 까지.
          지급일은 정산 송금 시각 기준입니다(소득세법 127조 — 의무는 지급하는 때 성립).
        </p>
      </section>

      {/* 신고할 수 없는 사람이 있으면 먼저 말한다 — 내려받고 나서 알면 다시 받아야 한다 */}
      {t.blocked > 0 && (
        <p className="mt-3 rounded-xl bg-warning-soft px-4 py-3 text-caption leading-relaxed text-warning-ink ring-1 ring-warning/25">
          <b>{t.blocked}명</b>은 실명 또는 주민등록번호가 비어 있어 신고서에 올릴 수 없어요.
          작가에게 받아 프로필에 채운 뒤 다시 받으세요.
        </p>
      )}

      {people.length === 0 ? (
        <div className="mt-4">
          <EmptyState title={`${monthLabel(period)}에 원천징수한 지급이 없어요`} />
        </div>
      ) : (
        <>
          <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {people.map((p) => (
              <li key={p.photographerId} className="px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-body-sm font-semibold text-fg">
                    {p.legalName ?? p.displayName}
                    {!p.legalName && <span className="ml-1 text-caption text-warning">실명 없음</span>}
                    <span className="ml-2 font-mono text-caption text-muted">
                      {p.residentMasked ?? "주민번호 없음"}
                    </span>
                  </span>
                  <span className="text-body-sm tabular-nums text-fg">
                    ₩{fmt.format(p.baseKrw)} · {p.count}건
                  </span>
                </div>
                <p className="mt-1 text-caption tabular-nums text-faint">
                  소득세 ₩{fmt.format(p.incomeTaxKrw)} · 지방소득세 ₩{fmt.format(p.localTaxKrw)} ·
                  실지급 ₩{fmt.format(p.netKrw)}
                  {p.blocked && <span className="ml-1 text-warning">— 신고 불가</span>}
                </p>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {/* 평문 주민번호가 나가는 유일한 자리. 서버가 readResidentNo() 로 열고 로그를 남긴다 */}
            <a
              href={`/admin/withholding/export?period=${period}`}
              className="rounded-xl bg-fg px-4 py-2.5 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90"
            >
              지급명세서 내려받기 (CSV)
            </a>
            <p className="text-caption leading-relaxed text-muted">
              주민등록번호가 들어간 파일입니다. <b className="text-fg">누가 언제 왜 열었는지 기록됩니다.</b>
              <br />
              받은 파일은 신고 후 지우세요 — 내려받는 순간부터 이 파일은 우리 보관 대상이 아닙니다.
            </p>
          </div>
        </>
      )}
    </main>
  );
}

function Header() {
  return (
    <>
      <h1 className="text-h1 font-semibold">지급명세서</h1>
      <p className="mt-1 text-body-sm leading-relaxed text-muted">
        사업자 미등록 작가에게 원천징수한 내역이에요. 떼는 것으로 끝나지 않고 신고·납부해야
        끝납니다 — 안 하면 작가는 낸 적 없는 세금으로 기록되고 우리는 미납이 됩니다.
      </p>
    </>
  );
}

function Stat({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <span className="flex flex-col">
      <span className="text-caption text-muted">{k}</span>
      <span className={`tabular-nums ${strong ? "text-title font-bold text-fg" : "text-body-sm text-fg"}`}>
        {v}
      </span>
    </span>
  );
}
