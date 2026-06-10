import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

// 작가 스튜디오 — 신청 상태에 따라 분기
export default async function StudioHome() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/studio");

  const ph = me.photographer;

  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-10 font-kr">
      <Link href="/" className="text-sm text-fg/50 hover:text-fg">
        ← 탐색으로
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">작가 스튜디오</h1>

      {/* 1) 미신청 → 신청 유도 */}
      {!ph && (
        <div className="mt-6 rounded-xl border border-fg/10 p-6">
          <p className="text-sm text-fg/70">
            아직 작가로 등록되지 않았어요. 신청하고 승인받으면 탐색 탭에 노출됩니다.
          </p>
          <Link
            href="/studio/apply"
            className="mt-4 inline-block rounded-full bg-fg px-5 py-2.5 text-sm font-semibold text-bg hover:opacity-90"
          >
            작가 신청하기
          </Link>
        </div>
      )}

      {/* 2) 승인 대기 */}
      {ph?.status === "pending" && (
        <StatusCard
          tone="wait"
          title="승인 대기 중"
          desc="운영자 검토 후 활동을 시작할 수 있어요. 보통 영업일 기준 1~2일 소요됩니다."
          displayName={ph.displayName}
        />
      )}

      {/* 3) 반려 */}
      {ph?.status === "rejected" && (
        <StatusCard
          tone="reject"
          title="신청이 반려되었어요"
          desc="자세한 사유는 안내 메시지를 확인해주세요."
          displayName={ph.displayName}
        />
      )}

      {/* 4) 정지 */}
      {ph?.status === "suspended" && (
        <StatusCard
          tone="reject"
          title="활동이 정지되었어요"
          desc="문의가 필요하면 운영자에게 연락해주세요."
          displayName={ph.displayName}
        />
      )}

      {/* 5) 승인됨 → 대시보드 */}
      {ph?.status === "approved" && (
        <div className="mt-6">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4 text-sm">
            <b>{ph.displayName}</b> · 승인 완료 — 활동 중이에요.
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <DashLink href="/studio/profile" label="프로필 편집" sub="소개·지역·무드·수취계좌" />
            <DashLink href="/studio/packages" label="패키지 관리" sub="가격·소요시간·보정본 수" />
            <DashLink href="/studio/portfolio" label="포트폴리오" sub="탐색 노출 사진" />
            <DashLink href="/studio/availability" label="일정 관리" sub="주간 시간·차단·예약 달력" />
            <DashLink href="/studio/booking" label="예약 설정" sub="예약 안내문·출장비" />
            <DashLink href="/studio/settlements" label="수수료 내역" sub="매칭 수수료 현황" />
          </div>
        </div>
      )}
    </main>
  );
}

function StatusCard({
  tone,
  title,
  desc,
  displayName,
}: {
  tone: "wait" | "reject";
  title: string;
  desc: string;
  displayName: string;
}) {
  const color =
    tone === "wait"
      ? "border-amber-500/20 bg-amber-500/[0.06]"
      : "border-brand/20 bg-brand/[0.06]";
  return (
    <div className={`mt-6 rounded-xl border p-6 ${color}`}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-sm text-fg/65">{desc}</p>
      <p className="mt-3 text-xs text-fg/45">작가명: {displayName}</p>
    </div>
  );
}

function DashLink({
  href,
  label,
  sub,
  soon,
}: {
  href: string;
  label: string;
  sub: string;
  soon?: boolean;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-fg/10 p-4 hover:border-fg/25 transition-colors"
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        {label}
        {soon && (
          <span className="rounded-full bg-fg/[0.06] px-1.5 py-0.5 text-[10px] text-fg/50">
            준비 중
          </span>
        )}
      </div>
      <p className="mt-0.5 text-xs text-fg/50">{sub}</p>
    </Link>
  );
}
