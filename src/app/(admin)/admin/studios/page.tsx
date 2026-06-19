import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { Avatar, Badge, EmptyState } from "@/components/ui";
import { CameraIcon } from "@/components/user/icons";

export const dynamic = "force-dynamic";

const fmt = new Intl.NumberFormat("ko-KR");

type Photographer = {
  id: string;
  profile_id: string;
  status: string;
  display_name: string | null;
  regions: string[];
  price_from_krw: number;
  rating_avg: number;
  review_count: number;
  created_at: string;
};

// 작가별 카운트 집계용 헬퍼 — 단일 컬럼만 받아 JS 집계(베타 규모에 충분)
function countBy<T extends Record<string, unknown>>(rows: T[] | null, key: keyof T): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows ?? []) {
    const k = r[key] as string;
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

const STATUS_ORDER: Record<string, number> = { approved: 0, pending: 1, suspended: 2, rejected: 3 };

// 작가 관리 — 전체 작가 요약 + 상세로 이동. 가드는 (admin)/layout.
export default async function AdminStudiosPage() {
  const admin = createAdminClient();
  const [{ data: phData }, { data: profData }, { data: photoRows }, { data: pkgRows }, { data: bookingRows }, { data: inqRows }] =
    await Promise.all([
      admin
        .from("photographers")
        .select("id, profile_id, status, display_name, regions, price_from_krw, rating_avg, review_count, created_at"),
      admin.from("profiles").select("id, avatar_url"),
      admin.from("photos").select("photographer_id"),
      admin.from("packages").select("photographer_id, is_active"),
      admin.from("bookings").select("photographer_id, status"),
      admin.from("inquiries").select("photographer_id, status"),
    ]);

  const photographers = (phData ?? []) as Photographer[];
  const avatarOf = new Map<string, string | null>(
    (profData ?? []).map((p) => [p.id as string, (p.avatar_url as string) ?? null])
  );
  const photoCount = countBy(photoRows, "photographer_id");
  const pkgCount = countBy((pkgRows ?? []).filter((p) => p.is_active), "photographer_id");
  const bookingCount = countBy(bookingRows, "photographer_id");
  const inqCount = countBy(inqRows, "photographer_id");

  const rows = photographers
    .map((p) => ({
      ...p,
      avatar: avatarOf.get(p.profile_id) ?? null,
      photos: photoCount.get(p.id) ?? 0,
      packages: pkgCount.get(p.id) ?? 0,
      bookings: bookingCount.get(p.id) ?? 0,
      inquiries: inqCount.get(p.id) ?? 0,
    }))
    .sort(
      (a, b) =>
        (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) ||
        b.bookings - a.bookings ||
        b.photos - a.photos
    );

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
      <h1 className="text-h1 font-semibold">작가 관리</h1>
      <p className="mt-1 text-body-sm text-muted">
        전체 작가 {fmt.format(rows.length)}명. 카드를 누르면 그 작가의 모든 정보를 자세히 볼 수 있어요.
      </p>

      {rows.length === 0 ? (
        <EmptyState
          className="mt-6 py-12"
          icon={<CameraIcon className="h-7 w-7" />}
          title="등록된 작가가 없어요"
          description="작가 승인 탭에서 신청을 승인하면 여기에 표시돼요."
        />
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {rows.map((r) => (
            <Link
              key={r.id}
              href={`/admin/studios/${r.id}`}
              className="group rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-line-strong hover:bg-fg/[0.02]"
            >
              <div className="flex items-start gap-3">
                <Avatar src={r.avatar} name={r.display_name} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-body-sm font-semibold text-fg">{r.display_name || "이름 없음"}</p>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="mt-0.5 truncate text-caption text-faint">
                    {r.regions.length > 0 ? r.regions.slice(0, 3).join(", ") : "지역 미설정"}
                  </p>
                  <p className="mt-0.5 text-caption text-muted">
                    ★ {r.rating_avg.toFixed(1)} · 후기 {fmt.format(r.review_count)} · 시작가 ₩{fmt.format(r.price_from_krw)}
                  </p>
                </div>
                <span className="shrink-0 self-center text-muted transition-transform group-hover:translate-x-0.5">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                <Mini label="사진" value={r.photos} />
                <Mini label="패키지" value={r.packages} />
                <Mini label="예약" value={r.bookings} />
                <Mini label="문의" value={r.inquiries} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-fg/[0.03] px-2 py-1.5">
      <p className="text-body-sm font-bold tabular-nums text-fg">{fmt.format(value)}</p>
      <p className="text-[11px] text-faint">{label}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { tone: "success" | "warning" | "danger" | "neutral"; label: string }> = {
    approved: { tone: "success", label: "승인됨" },
    pending: { tone: "warning", label: "대기" },
    rejected: { tone: "danger", label: "반려" },
    suspended: { tone: "neutral", label: "정지" },
  };
  const s = map[status] ?? { tone: "neutral" as const, label: status };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
