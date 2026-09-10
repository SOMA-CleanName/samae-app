import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { Badge, EmptyState } from "@/components/ui";
import { SUPPORT_KIND_LABEL, type SupportKind } from "@/lib/support";
import { resolveSupportRequest, reopenSupportRequest } from "./actions";

export const dynamic = "force-dynamic";

const fmt = new Intl.NumberFormat("ko-KR");

const stamp = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("ko-KR", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Seoul",
      }).format(new Date(iso))
    : "—";

type Row = {
  id: string;
  booking_id: string | null;
  conversation_id: string | null;
  requester_id: string;
  requester_role: string;
  kind: string;
  body: string;
  status: string;
  admin_note: string | null;
  created_at: string;
  resolved_at: string | null;
};

// 사매 문의 — 환불·날짜 변경 요청 접수함.
// 조치(환불 처리·예약 취소)는 거래·정산 화면에서 하고, 여기서는 "무엇을 요구했는지" 를 읽고
// 처리 여부만 닫는다. 두 화면을 링크로 이어 붙인다 — 맥락 없이 환불 버튼을 누르면 사고가 난다.
export default async function AdminSupportPage() {
  const admin = createAdminClient();

  const { data } = await admin
    .from("support_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = (data ?? []) as Row[];

  // 요청자 이름·예약 금액을 곁들인다 — 접수함만 보고도 급한 건인지 판단이 서야 한다
  const profileIds = [...new Set(rows.map((r) => r.requester_id))];
  const bookingIds = [...new Set(rows.map((r) => r.booking_id).filter((v): v is string => !!v))];

  const [{ data: profiles }, { data: bookings }] = await Promise.all([
    profileIds.length
      ? admin.from("profiles").select("id, display_name").in("id", profileIds)
      : Promise.resolve({ data: [] }),
    bookingIds.length
      ? admin
          .from("bookings")
          .select("id, status, amount_krw, shoot_at, photographer:photographers(display_name)")
          .in("id", bookingIds)
      : Promise.resolve({ data: [] }),
  ]);

  const nameById = new Map(
    ((profiles ?? []) as { id: string; display_name: string | null }[]).map((p) => [
      p.id,
      p.display_name,
    ])
  );
  type Bk = {
    id: string;
    status: string;
    amount_krw: number | null;
    shoot_at: string | null;
    photographer: { display_name: string | null } | { display_name: string | null }[] | null;
  };
  const bookingById = new Map(((bookings ?? []) as Bk[]).map((b) => [b.id, b]));
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

  const open = rows.filter((r) => r.status === "open");
  const done = rows.filter((r) => r.status !== "open");

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-5">
      <h1 className="text-h1 font-semibold">사매 문의</h1>
      <p className="mt-1 text-body-sm text-muted">
        환불·날짜 변경 요청이에요. 실제 처리는 거래·정산에서 하고 여기서는 접수만 닫아요.
      </p>

      <section className="mt-6">
        <h2 className="text-body-sm font-semibold text-fg">
          처리 대기 {open.length > 0 && <span className="text-brand">({open.length})</span>}
        </h2>
        {open.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="대기 중인 문의가 없어요" />
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {open.map((r) => (
              <RequestCard
                key={r.id}
                r={r}
                name={nameById.get(r.requester_id) ?? null}
                booking={bookingById.get(r.booking_id ?? "") ?? null}
                photographerName={
                  one(bookingById.get(r.booking_id ?? "")?.photographer ?? null)?.display_name ?? null
                }
              />
            ))}
          </ul>
        )}
      </section>

      {done.length > 0 && (
        <section className="mt-8">
          <h2 className="text-body-sm font-semibold text-muted">처리 완료</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {done.map((r) => (
              <li
                key={r.id}
                className="rounded-2xl border border-line bg-surface px-4 py-3 opacity-70"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-caption text-muted">
                    {SUPPORT_KIND_LABEL[r.kind as SupportKind] ?? r.kind} ·{" "}
                    {nameById.get(r.requester_id) ?? "회원"} · {stamp(r.created_at)}
                  </span>
                  <form action={reopenSupportRequest}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="cursor-pointer text-caption text-muted underline-offset-2 hover:underline">
                      다시 열기
                    </button>
                  </form>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-caption text-fg">{r.body}</p>
                {r.admin_note && (
                  <p className="mt-1 text-caption text-faint">처리 메모 — {r.admin_note}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function RequestCard({
  r,
  name,
  booking,
  photographerName,
}: {
  r: Row;
  name: string | null;
  booking: { id: string; status: string; amount_krw: number | null; shoot_at: string | null } | null;
  photographerName: string | null;
}) {
  return (
    <li className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={r.kind === "refund" ? "warning" : "info"}>
          {SUPPORT_KIND_LABEL[r.kind as SupportKind] ?? r.kind}
        </Badge>
        <span className="text-caption text-muted">
          {name ?? "회원"}
          {r.requester_role === "photographer" ? " (작가)" : ""} · {stamp(r.created_at)}
        </span>
      </div>

      <p className="mt-2 whitespace-pre-wrap text-body-sm text-fg">{r.body}</p>

      {booking && (
        <p className="mt-2 text-caption text-faint">
          예약 ₩{fmt.format(booking.amount_krw ?? 0)} · 촬영 {stamp(booking.shoot_at)}
          {photographerName ? ` · ${photographerName}` : ""} · 상태 {booking.status}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {r.conversation_id && (
          <Link
            href={`/admin/chats/${r.conversation_id}`}
            className="rounded-lg border border-line-strong px-3 py-1.5 text-caption font-medium text-fg transition-colors hover:bg-fg/[0.05]"
          >
            대화 보기
          </Link>
        )}
        <Link
          href="/admin/transactions"
          className="rounded-lg border border-line-strong px-3 py-1.5 text-caption font-medium text-fg transition-colors hover:bg-fg/[0.05]"
        >
          거래에서 처리
        </Link>

        <form action={resolveSupportRequest} className="ml-auto flex items-center gap-1.5">
          <input type="hidden" name="id" value={r.id} />
          <input
            name="note"
            maxLength={500}
            placeholder="처리 메모 (선택)"
            className="w-40 rounded-lg border border-line bg-bg px-2.5 py-1.5 text-caption outline-none focus:border-fg/40"
          />
          <button className="cursor-pointer rounded-lg bg-fg px-3 py-1.5 text-caption font-semibold text-bg hover:opacity-90">
            처리 완료
          </button>
        </form>
      </div>
    </li>
  );
}
