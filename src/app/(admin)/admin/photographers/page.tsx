import { createClient } from "@/lib/supabase/server";
import { Avatar, Badge, Button, EmptyState } from "@/components/ui";
import { CameraIcon, MapPinIcon } from "@/components/user/icons";
import { approvePhotographer, rejectPhotographer, suspendPhotographer } from "./actions";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  display_name: string | null;
  bio: string;
  regions: string[];
  mood_tags: string[];
  price_from_krw: number;
  review_count: number;
  status: string;
  created_at: string;
};

const fmt = new Intl.NumberFormat("ko-KR");

function when(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    timeZone: "Asia/Seoul",
  }).format(new Date(iso));
}

// 작가 승인 관리 — pending 우선. 가드는 (admin)/layout.
export default async function AdminPhotographersPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("photographers")
    .select("id, display_name, bio, regions, mood_tags, price_from_krw, review_count, status, created_at")
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as Row[];
  const pending = rows.filter((r) => r.status === "pending");
  const others = rows.filter((r) => r.status !== "pending");

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
      <h1 className="text-h1 font-semibold">작가 승인</h1>
      <p className="mt-1 text-body-sm text-muted">신청을 검토하고 승인·반려·정지를 관리해요.</p>

      {/* 승인 대기 */}
      <section className="mt-6">
        <h2 className="flex items-center gap-2 text-body-sm font-medium text-muted">
          승인 대기
          <Badge tone={pending.length > 0 ? "brand" : "neutral"}>{pending.length}</Badge>
        </h2>

        {pending.length === 0 ? (
          <EmptyState
            className="mt-2 py-10"
            icon={<CameraIcon className="h-7 w-7" />}
            title="대기 중인 신청이 없어요"
          />
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {pending.map((r) => (
              <li key={r.id} className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
                <ApplicantHeader row={r} />
                {r.bio && <p className="mt-3 text-body-sm leading-relaxed text-fg/80">{r.bio}</p>}
                <TagRow row={r} />
                <div className="mt-4 flex gap-2">
                  <form action={approvePhotographer} className="flex-1 sm:flex-none">
                    <input type="hidden" name="id" value={r.id} />
                    <Button type="submit" size="sm" fullWidth>승인</Button>
                  </form>
                  <form action={rejectPhotographer} className="flex-1 sm:flex-none">
                    <input type="hidden" name="id" value={r.id} />
                    <Button type="submit" size="sm" variant="secondary" fullWidth>반려</Button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 전체 작가 */}
      <section className="mt-10">
        <h2 className="text-body-sm font-medium text-muted">전체 작가 {others.length}</h2>
        {others.length === 0 ? (
          <p className="mt-3 text-body-sm text-faint">아직 없어요.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {others.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={r.display_name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-sm font-semibold text-fg">{r.display_name || "이름 없음"}</p>
                  <p className="truncate text-caption text-faint">후기 {r.review_count}</p>
                </div>
                <StatusBadge status={r.status} />
                <RowAction row={r} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

// 신청 카드 헤더 — 아바타·이름·신청일·시작가
function ApplicantHeader({ row }: { row: Row }) {
  return (
    <div className="flex items-start gap-3">
      <Avatar name={row.display_name} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-title font-semibold text-fg">{row.display_name || "이름 없음"}</p>
          <StatusBadge status={row.status} />
        </div>
        <p className="mt-0.5 text-caption text-faint">
          신청 {when(row.created_at)} · 시작가 ₩{fmt.format(row.price_from_krw)}
        </p>
      </div>
    </div>
  );
}

// 지역·무드 태그
function TagRow({ row }: { row: Row }) {
  if (!row.regions.length && !row.mood_tags.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {row.regions.map((x) => (
        <span key={x} className="inline-flex items-center gap-1 rounded-full bg-fg/[0.06] px-2.5 py-1 text-caption text-fg/70">
          <MapPinIcon className="h-3 w-3 text-fg/45" />
          {x}
        </span>
      ))}
      {row.mood_tags.map((x) => (
        <span key={x} className="rounded-full bg-fg/[0.06] px-2.5 py-1 text-caption text-fg/70">#{x}</span>
      ))}
    </div>
  );
}

// 상태별 액션 — approved→정지 / 그 외→승인
function RowAction({ row }: { row: Row }) {
  if (row.status === "approved") {
    return (
      <form action={suspendPhotographer}>
        <input type="hidden" name="id" value={row.id} />
        <button className="shrink-0 cursor-pointer rounded-full border border-line-strong px-3 py-1 text-caption font-medium text-muted transition-colors hover:bg-fg/[0.04]">
          정지
        </button>
      </form>
    );
  }
  return (
    <form action={approvePhotographer}>
      <input type="hidden" name="id" value={row.id} />
      <button className="shrink-0 cursor-pointer rounded-full bg-fg/[0.06] px-3 py-1 text-caption font-medium text-fg transition-colors hover:bg-fg/10">
        승인
      </button>
    </form>
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
