import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listMyBookings, STATUS_LABEL, statusTone, fmtShootAt, type BookingRow } from "@/lib/bookings";

export const dynamic = "force-dynamic";

// 예약 목록 (구매자/작가 통합)
export default async function BookingsPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/bookings");

  const all = await listMyBookings();
  const asBuyer = all.filter((b) => b.user_id === me.id);
  const asPhotographer = all.filter((b) => me.photographer && b.photographer_id === me.photographer.id);

  return (
    <main className="mx-auto max-w-2xl px-4 sm:px-6 py-8 font-kr">
      <h1 className="text-2xl font-semibold">예약</h1>

      {me.photographer && (
        <Section title="받은 예약" rows={asPhotographer} me={me.id} role="photographer" />
      )}
      <Section title="내 예약" rows={asBuyer} me={me.id} role="buyer" />
    </main>
  );
}

function Section({
  title,
  rows,
  role,
}: {
  title: string;
  rows: BookingRow[];
  me: string;
  role: "buyer" | "photographer";
}) {
  return (
    <section className="mt-6">
      <h2 className="text-sm font-medium text-fg/70">
        {title} {rows.length > 0 && <span className="text-fg/40">{rows.length}</span>}
      </h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-fg/45">아직 없어요.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {rows.map((b) => (
            <li key={b.id}>
              <Link
                href={`/bookings/${b.id}`}
                className="block rounded-xl border border-fg/10 p-4 hover:border-fg/25"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    {role === "buyer"
                      ? b.photographer?.display_name || `@${b.photographer?.handle}`
                      : b.user?.display_name || "고객"}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusTone(b.status)}`}>
                    {STATUS_LABEL[b.status]}
                  </span>
                </div>
                <p className="mt-1 text-xs text-fg/55">
                  {b.package?.name ?? b.package_snapshot?.name ?? "패키지"} · {fmtShootAt(b.shoot_at)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
