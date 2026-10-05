import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { EmptyState } from "@/components/ui";
import { ClipboardIcon } from "@/components/user/icons";
import { cn } from "@/lib/cn";
import { clearInquiries, deleteInquiriesSelected } from "./actions";
import { AdminInquiries, type InquiryRow, type Stage } from "./AdminInquiries";
import { PhotographerFilter } from "./PhotographerFilter";
import { DeleteModeProvider, DeleteModeToolbar } from "@/components/admin/DeleteMode";
import { inquiryChannel } from "@/lib/inquiry-channel";

export const dynamic = "force-dynamic";

// status → stage
function stageOf(status: string): Stage {
  if (status === "new") return "new";
  if (status === "accepted") return "await";
  if (status === "confirmed") return "confirmed";
  if (status === "shot") return "shot";
  if (status === "refund_requested") return "refund";
  if (status === "expired") return "expired";
  return "confirmed"; // 안전 폴백
}

const FILTERS: { key: string; label: string; match: (s: Stage) => boolean }[] = [
  { key: "", label: "전체", match: () => true },
  { key: "new", label: "접수", match: (s) => s === "new" },
  { key: "await", label: "입금대기", match: (s) => s === "await" },
  { key: "confirmed", label: "입금확인", match: (s) => s === "confirmed" },
  { key: "shot", label: "촬영완료", match: (s) => s === "shot" },
  { key: "refund", label: "환불신청", match: (s) => s === "refund" },
  { key: "expired", label: "만료", match: (s) => s === "expired" },
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
  hidden_from_photographer: boolean | null;
  photographer: { display_name: string | null } | { display_name: string | null }[] | null;
  profile: { display_name: string | null } | { display_name: string | null }[] | null;
};

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

  const { data } = await admin
    .from("inquiries")
    .select(
      "id, status, created_at, photographer_id, purpose, preferred_date, region, name, gender, party_size, note, deposit_amount_krw, deposit_confirmed_at, phone, kakao_id, contact_email, ref_image_paths, fbp, fbc, source_photo_id, utm_source, utm_medium, utm_campaign, landing_path, hidden_from_photographer, photographer:photographers(display_name), profile:profiles!inquiries_profile_id_fkey(display_name)"
    )
    .order("created_at", { ascending: false })
    .limit(300);

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
        photographerName: one(r.photographer)?.display_name ?? "작가",
        customerName: one(r.profile)?.display_name ?? "비회원",
        // 어드민(운영진)은 응대 위해 연락처 항상 표시 — 작가 공개(입금확인 후)와 별개
        contactLocked: false,
        contacts,
        refImages: r.ref_image_paths ?? [],
        // 유입 채널 — utm_medium 기준 정확 판별(광고/스토리/직접). fbc 는 폴백일 뿐
        channelLabel: inquiryChannel(r).label,
        channelKind: inquiryChannel(r).kind,
        landingPath: r.landing_path,
        isMember: !!one(r.profile)?.display_name,
        sourcePhotoId: r.source_photo_id,
        sourcePhotoThumb: photo?.thumb ?? null,
        sourcePhotoRegion: photo?.region ?? null,
        hidden: !!r.hidden_from_photographer,
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
          <h1 className="text-h1 font-semibold">문의 접수함</h1>
          <p className="mt-1 text-body-sm leading-relaxed text-muted">
            비로그인 게이트(<code className="text-caption">/inquiry</code>)로 들어온 문의예요. 읽고 상태만 정리해요.
          </p>
          <p className="mt-2 rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-caption leading-relaxed text-muted">
            {/* 아래 단계 칩에 「입금대기·입금확인」이 남아 있는데, 새로 들어오는 문의는
                거기까지 가지 않는다. 설명 없이 두면 운영자가 "왜 안 넘어가지" 를 찾는다. */}
            <b className="font-semibold text-fg">「입금대기·입금확인」은 지난 기록이에요.</b> 작가가 문의를 열며
            입금하던 옛 방식(리드)의 단계라, 새로 들어오는 문의는 「접수」에 머물러요. 지금 거래는 채팅에서
            예약을 잡고 고객이 사매 계좌에 입금하는 방식이고, 그건{" "}
            <a href="/admin/transactions" className="underline underline-offset-2 hover:text-fg">거래·정산</a>
            에서 봐요.
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

      {/* 리드 수익 집계와 사매 계좌 편집기가 여기 있었다 — **둘 다 걷었다(2026-09-19).**
          집계는 리드 모델(작가가 리드 해제하며 입금)의 것이라 지금 쓰이지 않고,
          계좌는 리드용이 아니라 예약 에스크로라서 거래·정산으로 옮겼다. */}

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

