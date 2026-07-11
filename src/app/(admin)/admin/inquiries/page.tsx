import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlatformAccount, hasAccount } from "@/lib/platform-account";
import { EmptyState } from "@/components/ui";
import { ClipboardIcon } from "@/components/user/icons";
import { cn } from "@/lib/cn";
import { updatePlatformAccount, clearInquiries, deleteInquiriesSelected } from "./actions";
import { AdminInquiries, type InquiryRow, type Stage } from "./AdminInquiries";
import { PhotographerFilter } from "./PhotographerFilter";
import { DeleteModeProvider, DeleteModeToolbar } from "@/components/admin/DeleteMode";

export const dynamic = "force-dynamic";

// status → stage
function stageOf(status: string): Stage {
  if (status === "new") return "new";
  if (status === "accepted") return "await";
  if (status === "confirmed") return "confirmed";
  if (status === "shot") return "shot";
  if (status === "refund_requested") return "refund";
  return "confirmed"; // 안전 폴백
}

const FILTERS: { key: string; label: string; match: (s: Stage) => boolean }[] = [
  { key: "", label: "전체", match: () => true },
  { key: "new", label: "접수", match: (s) => s === "new" },
  { key: "await", label: "입금대기", match: (s) => s === "await" },
  { key: "confirmed", label: "입금확인", match: (s) => s === "confirmed" },
  { key: "shot", label: "촬영완료", match: (s) => s === "shot" },
  { key: "refund", label: "환불신청", match: (s) => s === "refund" },
];

const one = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? v[0] ?? null : v ?? null;

type DbRow = {
  id: string;
  status: string;
  created_at: string;
  photographer_id: string;
  purpose: string;
  preferred_date: string;
  region: string | null;
  name: string | null;
  gender: string | null;
  party_size: string | null;
  note: string | null;
  deposit_amount_krw: number | null;
  deposit_confirmed_at: string | null;
  phone: string | null;
  kakao_id: string | null;
  contact_email: string | null;
  ref_image_paths: string[] | null;
  fbp: string | null;
  fbc: string | null;
  source_photo_id: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  landing_path: string | null;
  photographer: { display_name: string | null } | { display_name: string | null }[] | null;
  profile: { display_name: string | null } | { display_name: string | null }[] | null;
};

// 유입 채널 판별 — utm_medium 이 정확한 신호(paid_social=유료광고 · social=오가닉 스토리).
// utm 이 없으면 fbc 로 폴백하되 '광고'로 단정하지 않는다(인스타가 오가닉에도 fbclid 를 붙이므로).
function channelOf(r: DbRow): { label: string; kind: "ad" | "organic" | "direct" | "unknown" } {
  const m = r.utm_medium?.toLowerCase() ?? "";
  const camp = r.utm_campaign ? ` · ${r.utm_campaign}` : "";
  if (/paid/.test(m)) return { label: `🎯 메타 광고${camp}`, kind: "ad" };
  if (m === "social") return { label: `📱 스토리·오가닉${camp}`, kind: "organic" };
  if (m) return { label: `${r.utm_source ?? "유입"} · ${r.utm_medium}${camp}`, kind: "organic" };
  if (r.utm_source) return { label: `${r.utm_source}${camp}`, kind: "organic" };
  if (r.fbc) return { label: "인스타 유입 (경로 불명)", kind: "unknown" };
  return { label: "직접 방문", kind: "direct" };
}

// 입금·문의 관리 — 단일 컴팩트 페이지. 가드는 (admin)/layout.
export default async function AdminInquiriesPage({
  searchParams,
}: {
  searchParams?: Promise<{ stage?: string; pg?: string }>;
}) {
  const sp = await searchParams;
  const stageFilter = sp?.stage ?? "";
  const pgFilter = sp?.pg ?? "";
  const admin = createAdminClient();

  const [{ data }, account] = await Promise.all([
    admin
      .from("inquiries")
      .select(
        "id, status, created_at, photographer_id, purpose, preferred_date, region, name, gender, party_size, note, deposit_amount_krw, deposit_confirmed_at, phone, kakao_id, contact_email, ref_image_paths, fbp, fbc, source_photo_id, utm_source, utm_medium, utm_campaign, landing_path, photographer:photographers(display_name), profile:profiles!inquiries_profile_id_fkey(display_name)"
      )
      .order("created_at", { ascending: false })
      .limit(300),
    getPlatformAccount(),
  ]);

  const all = (data ?? []) as DbRow[];

  // 문의가 걸린 사진(어떤 사진 보고 들어왔나) 썸네일·지역 해석
  const photoIds = Array.from(new Set(all.map((r) => r.source_photo_id).filter(Boolean))) as string[];
  const { data: photoRows } = photoIds.length
    ? await admin.from("photos").select("id, thumb_url, src_url, region").in("id", photoIds)
    : { data: [] as { id: string; thumb_url: string | null; src_url: string | null; region: string | null }[] };
  const photoMap = new Map(
    (photoRows ?? []).map((p) => [p.id, { thumb: p.thumb_url ?? p.src_url, region: p.region }])
  );

  // 작가 필터 옵션 (문의가 있는 작가만, 이름순)
  const photographers = Array.from(
    new Map(
      all.map((r) => [r.photographer_id, one(r.photographer)?.display_name ?? "작가"])
    ).entries()
  )
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));

  // 선택된 작가로 먼저 좁힌 뒤 카운트·집계
  const scoped = pgFilter ? all.filter((r) => r.photographer_id === pgFilter) : all;

  // 스테이지별 카운트
  const counts: Record<string, number> = {};
  for (const r of scoped) {
    const s = stageOf(r.status);
    counts[s] = (counts[s] ?? 0) + 1;
  }

  // 리드 수익 집계 — 입금 확인(deposit_confirmed_at) 된 건이 실제 수익, 입금대기는 미수금.
  const fmt = new Intl.NumberFormat("ko-KR");
  const revenue = scoped
    .filter((r) => r.deposit_confirmed_at)
    .reduce((sum, r) => sum + (r.deposit_amount_krw ?? 0), 0);
  const pending = scoped
    .filter((r) => !r.deposit_confirmed_at && stageOf(r.status) === "await")
    .reduce((sum, r) => sum + (r.deposit_amount_krw ?? 0), 0);

  const matcher = FILTERS.find((f) => f.key === stageFilter) ?? FILTERS[0];
  const rows: InquiryRow[] = scoped
    .map((r): InquiryRow => {
      const stage = stageOf(r.status);
      const contacts = [
        ["전화", r.phone],
        ["카카오", r.kakao_id],
        ["이메일", r.contact_email],
      ]
        .filter(([, v]) => v)
        .map(([label, value]) => ({ label: label as string, value: value as string }));
      const photo = r.source_photo_id ? photoMap.get(r.source_photo_id) : null;
      return {
        id: r.id,
        stage,
        status: r.status,
        createdAt: r.created_at,
        photographerId: r.photographer_id,
        purpose: r.purpose,
        preferredDate: r.preferred_date,
        region: r.region,
        name: r.name,
        gender: r.gender,
        partySize: r.party_size,
        note: r.note,
        depositAmount: r.deposit_amount_krw ?? 0,
        photographerName: one(r.photographer)?.display_name ?? "작가",
        customerName: one(r.profile)?.display_name ?? "비회원",
        // 어드민(운영진)은 응대 위해 연락처 항상 표시 — 작가 공개(입금확인 후)와 별개
        contactLocked: false,
        contacts,
        refImages: r.ref_image_paths ?? [],
        // 유입 채널 — utm_medium 기준 정확 판별(광고/스토리/직접). fbc 는 폴백일 뿐
        channelLabel: channelOf(r).label,
        channelKind: channelOf(r).kind,
        landingPath: r.landing_path,
        isMember: !!one(r.profile)?.display_name,
        sourcePhotoId: r.source_photo_id,
        sourcePhotoThumb: photo?.thumb ?? null,
        sourcePhotoRegion: photo?.region ?? null,
      };
    })
    .filter((r) => matcher.match(r.stage));

  // 스테이지 칩 href — 현재 작가(pg) 필터를 유지
  const chipHref = (stageKey: string) => {
    const q = new URLSearchParams();
    if (stageKey) q.set("stage", stageKey);
    if (pgFilter) q.set("pg", pgFilter);
    const s = q.toString();
    return s ? `/admin/inquiries?${s}` : "/admin/inquiries";
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
     <DeleteModeProvider>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-h1 font-semibold">입금·문의 관리</h1>
          <p className="mt-1 text-body-sm text-muted">
            작가 수락 → 입금대기 → 입금확인 시 고객 연락처가 작가에게 공개돼요.
          </p>
        </div>
        <DeleteModeToolbar
          clearAction={clearInquiries}
          deleteSelectedAction={deleteInquiriesSelected}
          allIds={rows.map((r) => r.id)}
          clearWarning="모든 문의가 삭제돼요. 되돌릴 수 없어요(백업은 보관)."
          entityLabel="건"
        />
      </div>

      {/* 리드 수익 집계 — 입금 확인 누계 vs 입금 대기(미수금) */}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-line p-4">
          <p className="text-caption text-muted">입금 확인 누계</p>
          <p className="mt-1 text-h2 font-semibold text-success">₩{fmt.format(revenue)}</p>
        </div>
        <div className="rounded-xl border border-line p-4">
          <p className="text-caption text-muted">입금 대기</p>
          <p className="mt-1 text-h2 font-semibold text-brand">₩{fmt.format(pending)}</p>
        </div>
      </div>

      {/* 플랫폼 입금 계좌 */}
      <PlatformAccountEditor account={account} configured={hasAccount(account)} />

      {/* 작가 필터 */}
      <div className="mt-6">
        <PhotographerFilter photographers={photographers} current={pgFilter} />
      </div>

      {/* 스테이지 필터 */}
      <div className="mt-3 flex gap-1.5 overflow-x-auto scrollbar-none">
        {FILTERS.map((f) => {
          const active = stageFilter === f.key;
          const c = f.key === "" ? scoped.length : counts[f.key] ?? 0;
          return (
            <Link
              key={f.key}
              href={chipHref(f.key)}
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
     </DeleteModeProvider>
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
