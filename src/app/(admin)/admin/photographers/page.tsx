import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { approvePhotographer, rejectPhotographer } from "./actions";

type Row = {
  id: string;
  handle: string;
  display_name: string | null;
  bio: string;
  regions: string[];
  mood_tags: string[];
  status: string;
  created_at: string;
};

// 작가 승인 관리 — pending 우선 노출
export default async function AdminPhotographersPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/admin/photographers");
  if (me.role !== "admin") redirect("/");

  const supabase = await createClient();
  const { data } = await supabase
    .from("photographers")
    .select("id, handle, display_name, bio, regions, mood_tags, status, created_at")
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as Row[];
  const pending = rows.filter((r) => r.status === "pending");
  const others = rows.filter((r) => r.status !== "pending");

  return (
    <main className="mx-auto max-w-4xl px-4 sm:px-6 py-10 font-kr">
      <Link href="/admin" className="text-sm text-fg/50 hover:text-fg">
        ← 어드민
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">작가 승인</h1>

      {/* 승인 대기 */}
      <section className="mt-6">
        <h2 className="text-sm font-medium text-fg/70">
          승인 대기 <span className="text-brand">{pending.length}</span>
        </h2>
        {pending.length === 0 ? (
          <p className="mt-3 text-sm text-fg/45">대기 중인 신청이 없어요.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {pending.map((r) => (
              <li key={r.id} className="rounded-xl border border-fg/10 p-4">
                <PhotographerInfo row={r} />
                <div className="mt-3 flex gap-2">
                  <form action={approvePhotographer}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="rounded-full bg-fg px-4 py-1.5 text-xs font-semibold text-bg hover:opacity-90">
                      승인
                    </button>
                  </form>
                  <form action={rejectPhotographer}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="rounded-full border border-fg/20 px-4 py-1.5 text-xs text-fg/70 hover:bg-fg/[0.04]">
                      반려
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 그 외 (승인됨/반려/정지) */}
      <section className="mt-10">
        <h2 className="text-sm font-medium text-fg/70">전체 작가 {others.length}</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {others.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between rounded-lg border border-fg/10 px-4 py-3"
            >
              <div className="text-sm">
                <b>@{r.handle}</b>{" "}
                <span className="text-fg/50">{r.display_name}</span>
              </div>
              <div className="flex items-center gap-2">
                <StatusPill status={r.status} />
                {r.status !== "approved" && (
                  <form action={approvePhotographer}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="rounded-full bg-fg/[0.06] px-3 py-1 text-xs hover:bg-fg/10">
                      승인
                    </button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function PhotographerInfo({ row }: { row: Row }) {
  return (
    <div>
      <p className="text-sm">
        <b>@{row.handle}</b>{" "}
        <span className="text-fg/55">· {row.display_name}</span>
      </p>
      {row.bio && <p className="mt-1 text-sm text-fg/65">{row.bio}</p>}
      <div className="mt-2 flex flex-wrap gap-1 text-[11px] text-fg/55">
        {row.regions.map((x) => (
          <span key={x} className="rounded-full bg-fg/[0.06] px-2 py-0.5">
            📍 {x}
          </span>
        ))}
        {row.mood_tags.map((x) => (
          <span key={x} className="rounded-full bg-fg/[0.06] px-2 py-0.5">
            #{x}
          </span>
        ))}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    approved: "bg-emerald-500/15 text-emerald-700",
    pending: "bg-amber-500/15 text-amber-700",
    rejected: "bg-brand/15 text-brand",
    suspended: "bg-fg/10 text-fg/60",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] ${map[status] ?? "bg-fg/10"}`}>
      {status}
    </span>
  );
}
