import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlatformAccount, hasAccount } from "@/lib/platform-account";
import { EmptyState } from "@/components/ui";
import { ClipboardIcon } from "@/components/user/icons";
import { cn } from "@/lib/cn";
import { updatePlatformAccount } from "./actions";
import { AdminInquiries, type InquiryRow, type Stage } from "./AdminInquiries";

export const dynamic = "force-dynamic";

// status → stage
function stageOf(status: string): Stage {
  if (status === "new") return "new";
  if (status === "accepted") return "await";
  if (status === "confirmed") return "confirmed";
  return "done";
}

const FILTERS: { key: string; label: string; match: (s: Stage) => boolean }[] = [
  { key: "", label: "전체", match: () => true },
  { key: "await", label: "입금대기", match: (s) => s === "await" },
  { key: "confirmed", label: "입금확인", match: (s) => s === "confirmed" },
  { key: "new", label: "접수", match: (s) => s === "new" },
  { key: "done", label: "종료", match: (s) => s === "done" },
];

const one = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? v[0] ?? null : v ?? null;

type DbRow = {
  id: string;
  status: string;
  created_at: string;
  purpose: string;
  preferred_date: string;
  region: string | null;
  gender: string | null;
  party_size: number | null;
  note: string | null;
  deposit_amount_krw: number | null;
  phone: string | null;
  instagram_id: string | null;
  discord_id: string | null;
  contact_email: string | null;
  extra_contact: string | null;
  ref_image_paths: string[] | null;
  photographer: { display_name: string | null } | { display_name: string | null }[] | null;
  profile: { display_name: string | null } | { display_name: string | null }[] | null;
};

// 입금·문의 관리 — 단일 컴팩트 페이지. 가드는 (admin)/layout.
export default async function AdminInquiriesPage({
  searchParams,
}: {
  searchParams?: Promise<{ stage?: string }>;
}) {
  const stageFilter = (await searchParams)?.stage ?? "";
  const admin = createAdminClient();

  const [{ data }, account] = await Promise.all([
    admin
      .from("inquiries")
      .select(
        "id, status, created_at, purpose, preferred_date, region, gender, party_size, note, deposit_amount_krw, phone, instagram_id, discord_id, contact_email, extra_contact, ref_image_paths, photographer:photographers(display_name), profile:profiles!inquiries_profile_id_fkey(display_name)"
      )
      .order("created_at", { ascending: false })
      .limit(300),
    getPlatformAccount(),
  ]);

  const all = (data ?? []) as DbRow[];

  // 스테이지별 카운트
  const counts: Record<string, number> = {};
  for (const r of all) {
    const s = stageOf(r.status);
    counts[s] = (counts[s] ?? 0) + 1;
  }

  const matcher = FILTERS.find((f) => f.key === stageFilter) ?? FILTERS[0];
  const rows: InquiryRow[] = all
    .map((r): InquiryRow => {
      const stage = stageOf(r.status);
      const confirmed = stage === "confirmed" || stage === "done";
      const contacts = [
        ["전화", r.phone],
        ["인스타", r.instagram_id],
        ["디스코드", r.discord_id],
        ["이메일", r.contact_email],
        ["기타", r.extra_contact],
      ]
        .filter(([, v]) => v)
        .map(([label, value]) => ({ label: label as string, value: value as string }));
      return {
        id: r.id,
        stage,
        status: r.status,
        createdAt: r.created_at,
        purpose: r.purpose,
        preferredDate: r.preferred_date,
        region: r.region,
        gender: r.gender,
        partySize: r.party_size,
        note: r.note,
        depositAmount: r.deposit_amount_krw ?? 0,
        photographerName: one(r.photographer)?.display_name ?? "작가",
        customerName: one(r.profile)?.display_name ?? "비회원",
        contactLocked: !confirmed,
        contacts: confirmed ? contacts : [],
        refImages: r.ref_image_paths ?? [],
      };
    })
    .filter((r) => matcher.match(r.stage));

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
      <h1 className="text-h1 font-semibold">입금·문의 관리</h1>
      <p className="mt-1 text-body-sm text-muted">
        작가 수락 → 입금대기 → 입금확인 시 고객 연락처가 작가에게 공개돼요.
      </p>

      {/* 플랫폼 입금 계좌 */}
      <PlatformAccountEditor account={account} configured={hasAccount(account)} />

      {/* 스테이지 필터 */}
      <div className="mt-6 flex gap-1.5 overflow-x-auto scrollbar-none">
        {FILTERS.map((f) => {
          const active = stageFilter === f.key;
          const c = f.key === "" ? all.length : counts[f.key] ?? 0;
          return (
            <Link
              key={f.key}
              href={f.key ? `/admin/inquiries?stage=${f.key}` : "/admin/inquiries"}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-caption font-medium transition-colors",
                active ? "border-fg bg-fg text-bg" : "border-line-strong text-muted hover:bg-fg/[0.04]"
              )}
            >
              {f.label} {c}
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <EmptyState className="mt-6" icon={<ClipboardIcon className="h-7 w-7" />} title="해당하는 문의가 없어요" />
      ) : (
        <AdminInquiries rows={rows} />
      )}
    </main>
  );
}

// 플랫폼(우리) 입금 계좌 편집 — 미설정이면 강조
function PlatformAccountEditor({
  account,
  configured,
}: {
  account: { bank: string; number: string; holder: string; notice: string };
  configured: boolean;
}) {
  return (
    <details className="mt-5 rounded-2xl border border-line bg-surface" open={!configured}>
      <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-body-sm font-medium">
        플랫폼 입금 계좌
        {configured ? (
          <span className="text-caption text-faint">
            {account.bank} {account.number} · {account.holder}
          </span>
        ) : (
          <span className="text-caption font-semibold text-brand">미설정 — 입금 안내가 표시되지 않아요</span>
        )}
      </summary>
      <form action={updatePlatformAccount} className="grid grid-cols-1 gap-2.5 px-4 pb-4 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-caption text-muted">은행</span>
          <input name="bank" defaultValue={account.bank} placeholder="국민" className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-body-sm outline-none focus:border-fg/40" />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-caption text-muted">계좌번호</span>
          <input name="number" defaultValue={account.number} placeholder="000000-00-000000" className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-body-sm tabular-nums outline-none focus:border-fg/40" />
        </label>
        <label className="block">
          <span className="mb-1 block text-caption text-muted">예금주</span>
          <input name="holder" defaultValue={account.holder} placeholder="사매" className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-body-sm outline-none focus:border-fg/40" />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-caption text-muted">안내 문구 (선택)</span>
          <input name="notice" defaultValue={account.notice} placeholder="입금자명을 신청 닉네임과 동일하게 적어주세요." className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-body-sm outline-none focus:border-fg/40" />
        </label>
        <div className="sm:col-span-3">
          <button className="cursor-pointer rounded-lg bg-fg px-4 py-2 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90">
            계좌 저장
          </button>
        </div>
      </form>
    </details>
  );
}
