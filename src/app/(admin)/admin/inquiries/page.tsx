import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { Badge, EmptyState } from "@/components/ui";
import { ClipboardIcon, MapPinIcon } from "@/components/user/icons";
import { setInquiryStatus } from "./actions";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; tone: "warning" | "info" | "neutral" | "success" }> = {
  new: { label: "접수", tone: "warning" },
  accepted: { label: "수락", tone: "info" },
  contacted: { label: "연락함", tone: "neutral" },
  converted: { label: "전환", tone: "success" },
  closed: { label: "종료", tone: "neutral" },
};
const STATUS_KEYS = Object.keys(STATUS);

const FILTERS = [
  { key: "", label: "전체" },
  { key: "new", label: "접수" },
  { key: "accepted", label: "수락" },
  { key: "contacted", label: "연락함" },
  { key: "converted", label: "전환" },
  { key: "closed", label: "종료" },
];

type Row = {
  id: string;
  status: string;
  created_at: string;
  purpose: string;
  preferred_date: string;
  region: string | null;
  gender: string | null;
  party_size: number | null;
  note: string | null;
  phone: string | null;
  instagram_id: string | null;
  discord_id: string | null;
  contact_email: string | null;
  extra_contact: string | null;
  photographer: { display_name: string | null } | { display_name: string | null }[] | null;
  profile: { display_name: string | null } | { display_name: string | null }[] | null;
};

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? v[0] ?? null : v;
}

function when(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(new Date(iso));
}

// 문의 관리 — 전체 문의 모니터링 + 상태 변경. 가드는 (admin)/layout.
export default async function AdminInquiriesPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  const status = (await searchParams)?.status ?? "";
  const admin = createAdminClient();

  let query = admin
    .from("inquiries")
    .select(
      "id, status, created_at, purpose, preferred_date, region, gender, party_size, note, phone, instagram_id, discord_id, contact_email, extra_contact, photographer:photographers(display_name), profile:profiles(display_name)"
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (status && STATUS_KEYS.includes(status)) query = query.eq("status", status);

  const { data } = await query;
  const rows = (data ?? []) as Row[];

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
      <h1 className="text-h1 font-semibold">문의 관리</h1>
      <p className="mt-1 text-body-sm text-muted">예약·상담 문의 접수 현황이에요.</p>

      {/* 상태 필터 */}
      <div className="mt-5 flex gap-1.5 overflow-x-auto scrollbar-none">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key ? `/admin/inquiries?status=${f.key}` : "/admin/inquiries"}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-caption font-medium transition-colors",
              status === f.key
                ? "border-fg bg-fg text-bg"
                : "border-line-strong text-muted hover:bg-fg/[0.04]"
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<ClipboardIcon className="h-7 w-7" />}
          title="문의가 없어요"
        />
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {rows.map((r) => (
            <InquiryCard key={r.id} row={r} />
          ))}
        </ul>
      )}
    </main>
  );
}

function InquiryCard({ row }: { row: Row }) {
  const ph = one(row.photographer)?.display_name ?? "작가";
  const customer = one(row.profile)?.display_name ?? "비회원";
  const s = STATUS[row.status] ?? { label: row.status, tone: "neutral" as const };

  const contacts: [string, string | null][] = [
    ["전화", row.phone],
    ["인스타", row.instagram_id],
    ["디스코드", row.discord_id],
    ["이메일", row.contact_email],
    ["기타", row.extra_contact],
  ];
  const meta: [string, string | null][] = [
    ["희망일", row.preferred_date],
    ["지역", row.region],
    ["성별", row.gender],
    ["인원", row.party_size != null ? `${row.party_size}명` : null],
  ];

  return (
    <li className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-body font-semibold text-fg">{row.purpose}</p>
          <p className="mt-0.5 text-caption text-faint">
            {customer} → {ph} · {when(row.created_at)}
          </p>
        </div>
        <Badge tone={s.tone}>{s.label}</Badge>
      </div>

      {/* 메타 */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {meta
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <span key={k} className="inline-flex items-center gap-1 rounded-full bg-fg/[0.06] px-2.5 py-1 text-caption text-fg/70">
              {k === "지역" && <MapPinIcon className="h-3 w-3 text-fg/45" />}
              <span className="text-faint">{k}</span> {v}
            </span>
          ))}
      </div>

      {row.note && <p className="mt-3 text-body-sm leading-relaxed text-fg/80">{row.note}</p>}

      {/* 연락 수단 */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-caption">
        {contacts
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <span key={k}>
              <span className="text-faint">{k}</span>{" "}
              <span className="font-medium text-fg">{v}</span>
            </span>
          ))}
      </div>

      {/* 상태 변경 */}
      <form action={setInquiryStatus} className="mt-4 flex items-center gap-2 border-t border-line pt-3">
        <input type="hidden" name="id" value={row.id} />
        <span className="text-caption text-muted">상태 변경</span>
        <select
          name="status"
          defaultValue={row.status}
          className="rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-caption outline-none focus:border-fg/40"
        >
          {STATUS_KEYS.map((k) => (
            <option key={k} value={k}>
              {STATUS[k].label}
            </option>
          ))}
        </select>
        <button className="cursor-pointer rounded-lg bg-fg px-3 py-1.5 text-caption font-semibold text-bg transition-opacity hover:opacity-90">
          변경
        </button>
      </form>
    </li>
  );
}
