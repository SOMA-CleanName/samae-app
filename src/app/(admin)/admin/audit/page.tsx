import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { Badge, EmptyState } from "@/components/ui";
import { ShieldIcon } from "@/components/user/icons";
import { listAdminActions } from "@/lib/admin-audit";
import { adminActionLabel, isHeavyAction } from "@/lib/admin-audit-labels";

export const dynamic = "force-dynamic";

/*
  운영 기록 — 누가 무엇을 했나 (0136 admin_actions).

  ⚠️ **삭제는 여기 없다.** 지운 것은 「휴지통」(deleted_records, 0039)이 원본째 들고 있고
     거기서 되돌린다. 이 지면은 **삭제가 아닌 상태 변경**만 본다 — 환불·정산·입금 확인·
     수수료 변경·작가 자격·회원 역할.

  기록은 **고칠 수 없다.** RLS 에 select 정책만 두고 쓰기 정책을 두지 않았다(0136).
  사람이 지우거나 고칠 수 있으면 기록의 뜻이 없다.
*/

const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(new Date(iso));

/** 대상으로 바로 갈 수 있으면 링크를 건다 — 기록만 보고 끝나면 확인을 못 한다 */
function targetHref(table: string | null, id: string | null): string | null {
  if (!id) return null;
  if (table === "bookings") return `/admin/transactions?q=${encodeURIComponent(id)}`;
  if (table === "photographers") return `/admin/photographers/${id}`;
  if (table === "profiles") return `/admin/users`;
  return null;
}

export default async function AdminAuditPage() {
  const rows = await listAdminActions(200);

  // 운영자 이름 — actor_label 은 그때 이름이라 바뀌었을 수 있다. 지금 이름을 우선한다.
  const actorIds = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))] as string[];
  const { data: profiles } = actorIds.length
    ? await createAdminClient().from("profiles").select("id, display_name").in("id", actorIds)
    : { data: [] as { id: string; display_name: string | null }[] };
  const nameById = new Map((profiles ?? []).map((p) => [p.id as string, p.display_name as string | null]));

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
      <h1 className="text-h1 font-semibold">운영 기록</h1>
      <p className="mt-1 text-body-sm leading-relaxed text-muted">
        돈과 계약이 움직인 일을 누가 했는지 남겨요. 최근 {rows.length}건. 이 기록은 고칠 수 없어요.
        {" "}지운 데이터는 <Link href="/admin/trash" className="underline underline-offset-2 hover:text-fg">휴지통</Link>에서 봐요.
      </p>

      {rows.length === 0 ? (
        <EmptyState
          className="mt-6 py-12"
          icon={<ShieldIcon className="h-7 w-7" />}
          title="아직 기록이 없어요"
          description="환불·정산·입금 확인·수수료 변경 같은 일을 하면 여기에 쌓여요."
        />
      ) : (
        <ul className="mt-6 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {rows.map((r) => {
            const heavy = isHeavyAction(r.action);
            const href = targetHref(r.target_table, r.target_id);
            const who = nameById.get(r.actor_id ?? "") ?? r.actor_label ?? "(탈퇴한 운영자)";
            const detail = Object.entries(r.detail ?? {}).filter(([, v]) => v !== null && v !== "");
            return (
              <li key={r.id} className={`px-4 py-3 ${heavy ? "bg-danger/[0.03]" : ""}`}>
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <span className="text-caption tabular-nums text-faint">{fmtTime(r.created_at)}</span>
                  {/* 되돌릴 수 없는 일은 눈에 띄어야 한다 — 돈이 이미 나갔거나 데이터가 사라진 것 */}
                  <Badge tone={heavy ? "danger" : "neutral"}>{adminActionLabel(r.action)}</Badge>
                  <span className="text-body-sm font-medium text-fg">{who}</span>
                  {href ? (
                    <Link href={href} className="text-caption text-brand-ink underline underline-offset-2">
                      대상 보기
                    </Link>
                  ) : (
                    r.target_id && (
                      <span className="font-mono text-caption text-faint">{r.target_id.slice(0, 8)}</span>
                    )
                  )}
                </div>
                {detail.length > 0 && (
                  <p className="mt-1 break-all text-caption text-muted">
                    {detail.map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" · ")}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
