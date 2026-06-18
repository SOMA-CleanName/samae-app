import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { CameraIcon, UserIcon, CalendarIcon, ClipboardIcon, ChevronRightIcon } from "@/components/user/icons";

export const dynamic = "force-dynamic";

// 진행 중으로 보는 예약 상태 (종료/취소/환불 제외)
const ACTIVE_BOOKING = ["requested", "accepted", "paid", "shot", "delivered"];

// 운영자 대시보드 — 처리 필요 / 현황 / 바로가기. 가드는 (admin)/layout 에서.
export default async function AdminHome() {
  const admin = createAdminClient();

  const [apps, pending, approved, users, bookings, inquiries, draftCategories] = await Promise.all([
    // 작가 신청(계정 연동 신청) 처리 전
    admin.from("photographer_applications").select("id", { count: "exact", head: true }).in("status", ["new", "contacted"]),
    // 레거시 photographers pending
    admin.from("photographers").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("photographers").select("id", { count: "exact", head: true }).eq("status", "approved"),
    admin.from("profiles").select("id", { count: "exact", head: true }),
    admin.from("bookings").select("id", { count: "exact", head: true }).in("status", ACTIVE_BOOKING),
    admin.from("inquiries").select("id", { count: "exact", head: true }).eq("status", "new"),
    admin.from("categories").select("id", { count: "exact", head: true }).eq("published", false),
  ]);

  const approvalNeeded = (apps.count ?? 0) + (pending.count ?? 0); // 작가 승인 대기(신청+레거시)
  const newInquiries = inquiries.count ?? 0;
  const draftCats = draftCategories.count ?? 0;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
      <h1 className="text-h1 font-semibold">대시보드</h1>
      <p className="mt-1 text-body-sm text-muted">처리할 일과 현황을 한눈에 봐요.</p>

      {/* ── 처리 필요 (액션) — 0보다 크면 브랜드 강조 ── */}
      <h2 className="mt-7 text-body-sm font-medium text-muted">처리 필요</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard
          href="/admin/photographers"
          icon={<CameraIcon className="h-5 w-5" />}
          label="작가 승인 대기"
          value={approvalNeeded}
          accent={approvalNeeded > 0}
        />
        <StatCard
          href="/admin/inquiries"
          icon={<ClipboardIcon className="h-5 w-5" />}
          label="미처리 문의"
          value={newInquiries}
          accent={newInquiries > 0}
        />
        <StatCard
          href="/admin/categories"
          icon={<ClipboardIcon className="h-5 w-5" />}
          label="비공개 카테고리"
          value={draftCats}
          accent={false}
        />
      </div>

      {/* ── 현황 ── */}
      <h2 className="mt-8 text-body-sm font-medium text-muted">현황</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard href="/admin/photographers" icon={<CameraIcon className="h-5 w-5" />} label="승인 작가" value={approved.count ?? 0} />
        <StatCard href="/admin/users" icon={<UserIcon className="h-5 w-5" />} label="전체 회원" value={users.count ?? 0} />
        <StatCard href="/admin/transactions" icon={<CalendarIcon className="h-5 w-5" />} label="진행 중 예약" value={bookings.count ?? 0} />
      </div>

      {/* ── 바로가기 (전체 메뉴) ── */}
      <h2 className="mt-8 text-body-sm font-medium text-muted">바로가기</h2>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {[
          { href: "/admin/photographers", label: "작가 승인" },
          { href: "/admin/transactions", label: "거래·정산" },
          { href: "/admin/users", label: "회원" },
          { href: "/admin/inquiries", label: "문의" },
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

// 통계 카드 — href 있으면 클릭 이동, accent 면 브랜드 강조
function StatCard({
  href,
  icon,
  label,
  value,
  accent,
}: {
  href?: string;
  icon: React.ReactNode;
  label: string;
  value: number;
  accent?: boolean;
}) {
  const body = (
    <div
      className={
        "flex h-full flex-col gap-3 rounded-2xl border p-5 transition-colors " +
        (accent
          ? "border-brand/30 bg-brand/[0.04]"
          : "border-line bg-surface " + (href ? "hover:border-line-strong" : ""))
      }
    >
      <span
        className={
          "grid h-9 w-9 place-items-center rounded-full " +
          (accent ? "bg-brand/10 text-brand" : "bg-fg/[0.06] text-muted")
        }
      >
        {icon}
      </span>
      <div>
        <p className={"text-display font-semibold tabular-nums " + (accent ? "text-brand" : "text-fg")}>
          {value}
        </p>
        <p className="mt-0.5 text-body-sm text-muted">{label}</p>
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
