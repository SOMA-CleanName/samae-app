import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { CameraIcon, UserIcon, CalendarIcon, ClipboardIcon, ChevronRightIcon } from "@/components/user/icons";
import { IN_PROGRESS, queueCounts, type QueueBooking } from "@/lib/admin-queues";

export const dynamic = "force-dynamic";

/*
  운영자 대시보드 — 처리 필요 / 현황 / 바로가기. 가드는 (admin)/layout 에서.

  ⚠️ **「처리 필요」가 옛 모델을 가리키고 있었다(2026-09-19 수정).** 리드 시절의
     「미처리 문의」와 「비공개 카테고리」를 띄우고 있었는데, 지금 거래는 에스크로다 —
     운영이 멈추면 돈이 멈추는 지점은 딴 데 있다.

       ① 입금 확인 대기 — 고객이 사매 계좌에 넣고 [입금 완료] 를 눌렀다.
          운영이 대조·확인해야 예약이 확정된다
       ② 정산 대기 — 작가가 결과물 전달을 알렸다. 수수료를 떼고 보내야 한다
          (전달 알림으로부터 7영업일, 작가약관 13조 2항)

     이 둘이 대시보드에 아예 없어서, 어드민의 첫 화면이 **아무도 기다리지 않는 수**를
     보여주고 정작 사람이 기다리는 큐는 한 번 더 들어가야 보였다.

  큐 판정은 lib/admin-queues 에 있다 — 거래·정산 화면과 같은 답을 써야 한다.
*/
export default async function AdminHome() {
  const admin = createAdminClient();

  const [apps, pending, approved, users, bookingRows, openSupport] = await Promise.all([
    // 작가 신청(계정 연동 신청) 처리 전
    admin.from("photographer_applications").select("id", { count: "exact", head: true }).in("status", ["new", "contacted"]),
    // 레거시 photographers pending
    admin.from("photographers").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("photographers").select("id", { count: "exact", head: true }).eq("status", "approved"),
    admin.from("profiles").select("id", { count: "exact", head: true }),
    // 큐는 세는 게 아니라 **걸러야** 해서 행을 받는다(전달·정산·환불 시각을 본다).
    // 베타 규모라 전량을 받아 JS 로 센다 — 거래·정산 화면도 같은 방식이다.
    admin
      .from("bookings")
      .select("status, transfer_marked_at, delivered_at, settled_at, refunded_at"),
    admin.from("support_requests").select("id", { count: "exact", head: true }).eq("status", "open"),
  ]);

  const rows = (bookingRows.data ?? []) as QueueBooking[];
  const q = queueCounts(rows);
  const inProgress = rows.filter((b) => (IN_PROGRESS as readonly string[]).includes(b.status)).length;
  const approvalNeeded = (apps.count ?? 0) + (pending.count ?? 0); // 작가 승인 대기(신청+레거시)
  const supportOpen = openSupport.count ?? 0;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
      <h1 className="text-h1 font-semibold">대시보드</h1>
      <p className="mt-1 text-body-sm text-muted">처리할 일과 현황을 한눈에 봐요.</p>

      {/* ── 처리 필요 (액션) — 0보다 크면 강조.
             앞의 둘이 **돈이 멈춰 있는 자리**라 먼저 온다. ── */}
      <h2 className="mt-7 text-body-sm font-medium text-muted">처리 필요</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          href="/admin/transactions"
          icon={<CalendarIcon className="h-5 w-5" />}
          label="입금 확인 대기"
          hint="고객이 입금을 알렸어요"
          value={q.confirm}
          accent={q.confirm > 0}
        />
        <StatCard
          href="/admin/transactions"
          icon={<CalendarIcon className="h-5 w-5" />}
          label="정산 대기"
          // 기한(전달 알림 7영업일)을 넘긴 건은 우리가 늦은 것이라 수 옆에 붙여 둔다
          hint={q.settleOverdue > 0 ? `기한 초과 ${q.settleOverdue}건` : "전달 완료된 건"}
          value={q.settle}
          accent={q.settle > 0}
          danger={q.settleOverdue > 0}
        />
        <StatCard
          href="/admin/support"
          icon={<ClipboardIcon className="h-5 w-5" />}
          label="사매 문의"
          hint="환불·일정 변경 요청"
          value={supportOpen}
          accent={supportOpen > 0}
        />
        <StatCard
          href="/admin/photographers"
          icon={<CameraIcon className="h-5 w-5" />}
          label="작가 승인 대기"
          value={approvalNeeded}
          accent={approvalNeeded > 0}
        />
      </div>

      {/* 운영이 할 일은 없지만 흐름이 어디 있는지는 보여야 한다 */}
      {q.deposit > 0 && (
        <p className="mt-2.5 text-caption text-faint">
          이 밖에 <b className="font-semibold text-muted">{q.deposit}건</b>이 고객 입금을 기다리는 중이에요 —
          운영이 할 일은 없어요.
        </p>
      )}

      {/* ── 현황 ── */}
      <h2 className="mt-8 text-body-sm font-medium text-muted">현황</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard href="/admin/photographers" icon={<CameraIcon className="h-5 w-5" />} label="승인 작가" value={approved.count ?? 0} />
        <StatCard href="/admin/users" icon={<UserIcon className="h-5 w-5" />} label="전체 회원" value={users.count ?? 0} />
        <StatCard href="/admin/transactions" icon={<CalendarIcon className="h-5 w-5" />} label="진행 중 예약" value={inProgress} />
      </div>

      {/* ── 바로가기 (전체 메뉴) ── */}
      <h2 className="mt-8 text-body-sm font-medium text-muted">바로가기</h2>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {[
          { href: "/admin/transactions", label: "거래·정산" },
          { href: "/admin/photographers", label: "작가" },
          { href: "/admin/users", label: "회원" },
          { href: "/admin/support", label: "사매 문의" },
          { href: "/admin/categories", label: "카테고리" },
          { href: "/admin/tags", label: "태그" },
          { href: "/admin/analytics", label: "분석" },
        ].map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3 text-body-sm font-medium text-fg transition-colors hover:border-line-strong hover:bg-surface-2"
          >
            {m.label}
            <ChevronRightIcon className="h-4 w-4 text-faint" />
          </Link>
        ))}
      </div>
    </main>
  );
}

// 통계 카드 — href 있으면 클릭 이동, accent 면 브랜드 강조, danger 면 붉게.
// hint 는 "이 수가 무슨 뜻인가" 를 한 줄로 — 라벨만으로는 새로 온 사람이 못 읽는다.
function StatCard({
  href,
  icon,
  label,
  hint,
  value,
  accent,
  danger,
}: {
  href?: string;
  icon: React.ReactNode;
  label: string;
  hint?: string;
  value: number;
  accent?: boolean;
  danger?: boolean;
}) {
  const body = (
    <div
      className={
        "flex h-full flex-col gap-3 rounded-2xl border p-5 transition-colors " +
        (danger
          ? "border-danger/30 bg-danger/[0.04]"
          : accent
            ? "border-brand/30 bg-brand/[0.04]"
            : "border-line bg-surface " + (href ? "hover:border-line-strong" : ""))
      }
    >
      <span
        className={
          "grid h-9 w-9 place-items-center rounded-full " +
          (danger ? "bg-danger/10 text-danger-ink" : accent ? "bg-brand/10 text-brand" : "bg-fg/[0.06] text-muted")
        }
      >
        {icon}
      </span>
      <div>
        <p
          className={
            "text-display font-semibold tabular-nums " +
            (danger ? "text-danger-ink" : accent ? "text-brand-ink" : "text-fg")
          }
        >
          {value}
        </p>
        <p className="mt-0.5 text-body-sm text-muted">{label}</p>
        {hint && (
          <p className={"mt-0.5 text-caption " + (danger ? "text-danger-ink" : "text-faint")}>{hint}</p>
        )}
      </div>
    </div>
  );

  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}
