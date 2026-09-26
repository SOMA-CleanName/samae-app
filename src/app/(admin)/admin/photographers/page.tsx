import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { Avatar, Badge, EmptyState } from "@/components/ui";
import { PendingButton } from "@/components/ui/SubmitButton";
import { CameraIcon, MapPinIcon } from "@/components/user/icons";
import {
  approvePhotographer,
  rejectPhotographer,
  suspendPhotographer,
  approveApplication,
  rejectApplication,
  deleteApplication,
  updatePhotographerFee,
  beginRemoval,
  syncUnagreedVisibility,
} from "./actions";
import { DEFAULT_FEE_RATE, feeSpecFromRow, feeSpecLabel } from "@/lib/platform-fee";
import { BusinessLicenseCell } from "./BusinessLicenseCell";
import { CopyApprovalScript } from "./CopyApprovalScript";
import { approvalScript } from "@/lib/ops-alert";
import { agreementStatus, groupAgreementsByPhotographer, type AgreementState } from "@/lib/agreement-status";

export const dynamic = "force-dynamic";

/*
  작가 — 신청부터 운영까지 한 페이지. 가드는 (admin)/layout.

  ⚠️ 전에는 「작가 승인」과 「작가 관리」 두 페이지였다. 같은 대상(작가)을 보는데 화면이
     갈려 있어서 **정보까지 갈렸다** — 수수료율·등록증은 승인 쪽에만, 정산 계좌·활동 집계는
     관리 쪽에만 있었고, 입점 동의는 어느 쪽에도 없었다. 재동의를 요청해 둔 상태에서
     "누가 갱신했나" 를 어드민에서 셀 수가 없었다(2026-09-18).

     승인은 상태 전이일 뿐이라 페이지를 나눌 이유가 없다. 상태 필터 하나로 대신한다.
*/

type Row = {
  id: string;
  profile_id: string;
  display_name: string | null;
  bio: string;
  regions: string[];
  mood_tags: string[];
  price_from_krw: number;
  // 중개 수수료 — 기본은 정률 18%(작가약관 12조, 2026-09-21 신규 작가부터. 기존 실제 작가는 전원 10% 로 행에 박혀 있다). 정액은 옛 모델로 명시한 작가만.
  fee_mode: string | null;
  fee_amount_krw: number | null;
  fee_rate: number | null;
  // 사업자등록증 — 세금계산서 발급과 전자상거래법 20조의 "확인" 에 필요하다(0124)
  business_type?: string | null;
  business_license_uploaded_at?: string | null;
  business_license_verified_at?: string | null;
  business_license_note?: string | null;
  review_count: number;
  status: string;
  created_at: string;
};

type Lead = {
  id: string;
  profile_id: string | null;
  display_name: string;
  portfolio_url: string;
  phone: string;
  bio: string | null;
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

/** 작가별 카운트 — 단일 컬럼만 받아 JS 집계(베타 규모에 충분) */
function countBy<T extends Record<string, unknown>>(rows: T[] | null, key: keyof T): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows ?? []) {
    const k = r[key] as string;
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

type FilterKey = "active" | "pending" | "off" | "all";

/** statuses 가 null 이면 거르지 않는다(전체) */
type Filter = { key: FilterKey; label: string; statuses: readonly string[] | null };

const FILTERS: readonly Filter[] = [
  { key: "active", label: "활동 중", statuses: ["approved"] },
  { key: "pending", label: "승인 대기", statuses: ["pending"] },
  { key: "off", label: "정지 · 반려", statuses: ["suspended", "rejected"] },
  { key: "all", label: "전체", statuses: null },
];

export default async function AdminPhotographersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const filterKey: FilterKey = FILTERS.find((f) => f.key === sp.status)?.key ?? "active";
  const filter = FILTERS.find((f) => f.key === filterKey)!;

  const admin = createAdminClient();
  const [
    { data: phData },
    { data: leadData },
    { data: profData },
    { data: photoRows },
    { data: pkgRows },
    { data: bookingRows },
    { data: inqRows },
    { data: agreementRows },
  ] = await Promise.all([
    admin
      .from("photographers")
      .select(
        "id, profile_id, display_name, bio, regions, mood_tags, price_from_krw, fee_mode, fee_amount_krw, fee_rate, review_count, status, created_at, business_type, business_license_uploaded_at, business_license_verified_at, business_license_note"
      )
      .order("created_at", { ascending: false }),
    admin
      .from("photographer_applications")
      .select("id, profile_id, display_name, portfolio_url, phone, bio, status, created_at")
      .in("status", ["new", "contacted"])
      .order("created_at", { ascending: false }),
    admin.from("profiles").select("id, avatar_url"),
    admin.from("photos").select("photographer_id"),
    admin.from("packages").select("photographer_id, is_active"),
    admin.from("bookings").select("photographer_id, status"),
    admin.from("inquiries").select("photographer_id, status"),
    // 동의는 행이 쌓이는 표라 전부 받아 작가별로 묶는다 (판정은 최신 1건)
    admin.from("photographer_agreements").select("photographer_id, versions, agreed_at"),
  ]);

  const all = (phData ?? []) as Row[];
  const leads = (leadData ?? []) as Lead[];
  const avatarOf = new Map<string, string | null>(
    (profData ?? []).map((p) => [p.id as string, (p.avatar_url as string) ?? null])
  );
  const photoCount = countBy(photoRows, "photographer_id");
  const pkgCount = countBy((pkgRows ?? []).filter((p) => p.is_active), "photographer_id");
  const bookingCount = countBy(bookingRows, "photographer_id");
  const inqCount = countBy(inqRows, "photographer_id");
  const agreementsByPh = groupAgreementsByPhotographer(
    (agreementRows ?? []) as Array<{ photographer_id: string; versions: unknown; agreed_at: string }>
  );

  // 재동의 현황판 — **승인된 작가만 센다.** 정지·반려까지 넣으면 분모가 흔들려
  // "17명 중 몇 명" 이라는 질문에 답하지 못한다.
  const activeRows = all.filter((r) => r.status === "approved");
  const currentCount = activeRows.filter((r) => agreementStatus(agreementsByPh.get(r.id)).state === "current").length;

  const rows = all
    .filter((r) => !filter.statuses || filter.statuses.includes(r.status))
    .map((r) => ({
      ...r,
      avatar: avatarOf.get(r.profile_id) ?? null,
      photos: photoCount.get(r.id) ?? 0,
      packages: pkgCount.get(r.id) ?? 0,
      bookings: bookingCount.get(r.id) ?? 0,
      inquiries: inqCount.get(r.id) ?? 0,
      agreement: agreementStatus(agreementsByPh.get(r.id)),
    }))
    .sort((a, b) => b.bookings - a.bookings || b.photos - a.photos);

  const countOf = (f: Filter) =>
    f.statuses ? all.filter((r) => f.statuses!.includes(r.status)).length : all.length;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
      <h1 className="text-h1 font-semibold">작가</h1>
      <p className="mt-1 text-body-sm text-muted">
        신청 검토부터 수수료·등록증·입점 동의까지 여기서 봐요. 이름을 누르면 그 작가의 모든 정보가 나와요.
      </p>

      {/* 재동의 현황 — 약관을 개정하면 전원이 다시 동의해야 한다. 그 진행도가 여기 있다. */}
      {activeRows.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-line bg-surface px-4 py-3">
          <span className="text-body-sm font-semibold text-fg">현재 약관 동의</span>
          <span className="text-body-sm tabular-nums text-fg">
            {currentCount} / {activeRows.length}
          </span>
          {currentCount < activeRows.length && (
            <span className="text-caption text-warning-ink">
              {activeRows.length - currentCount}명이 아직 갱신 전이에요
            </span>
          )}
          {/*
            갱신 안 한 작가는 AgreeGate 에 막혀 스튜디오에 못 들어온다 = 문의를 받을 수
            없다. 그 상태로 사진이 노출되면 고객이 **받을 사람 없는 문의**를 넣게 된다.
            광고를 돌리는 동안엔 그게 제일 비싼 손해다.

            동의를 마치면 그 즉시 자동으로 되돌아오므로(studio 의 동의 처리) 이 버튼은
            누락분을 훑는 용도다. 여러 번 눌러도 안전하다.
          */}
          <form action={syncUnagreedVisibility} className="ml-auto">
            <PendingButton size="sm" variant="secondary">
              미갱신 작가 노출 정리
            </PendingButton>
          </form>
        </div>
      )}
      <p className="mt-1.5 px-1 text-caption text-faint">
        갱신 안 한 작가의 사진·패키지를 모든 고객 지면에서 가려요. 작가가 스스로 숨긴
        사진은 그대로 두고, 동의를 마치면 자동으로 다시 보여요.
      </p>

      {/* 작가 신청 — /apply 로 접수된 신청. 승인 시 그 계정으로 작가 등록. */}
      <section className="mt-6">
        <h2 className="flex items-center gap-2 text-body-sm font-medium text-muted">
          작가 신청
          <Badge tone={leads.length > 0 ? "brand" : "neutral"}>{leads.length}</Badge>
        </h2>
        <p className="mt-1 text-caption text-faint">
          승인하면 해당 계정이 작가로 등록돼 탐색에 노출돼요. 포트폴리오 링크를 확인하고 처리해주세요.
        </p>

        {leads.length === 0 ? (
          <p className="mt-3 text-body-sm text-faint">대기 중인 신청이 없어요.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {leads.map((l) => (
              <li key={l.id} className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <Avatar name={l.display_name} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-title font-semibold text-fg">{l.display_name}</p>
                      {!l.profile_id && <Badge tone="neutral">계정 미연동</Badge>}
                    </div>
                    <p className="mt-0.5 text-caption text-faint">신청 {when(l.created_at)}</p>
                    <dl className="mt-2 flex flex-col gap-1 text-body-sm">
                      <div className="flex gap-2">
                        <dt className="shrink-0 text-muted">연락처</dt>
                        <dd>
                          <a href={`tel:${l.phone}`} className="text-fg hover:text-brand">{l.phone}</a>
                        </dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="shrink-0 text-muted">포트폴리오</dt>
                        <dd className="min-w-0">
                          <a
                            href={l.portfolio_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="break-all text-brand-ink hover:underline"
                          >
                            {l.portfolio_url}
                          </a>
                        </dd>
                      </div>
                    </dl>
                    {l.bio && <p className="mt-2 text-body-sm leading-relaxed text-fg/80">{l.bio}</p>}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-end gap-2">
                  {l.profile_id ? (
                    <>
                      {/* 요율은 **승인하면서** 정한다. 승인 직후 작가가 입점 신청에서 바로
                          등록되므로 그 사이에 손볼 자리가 없고, 나중에 고치면 이미 등록된
                          상품·예약이 옛 요율로 굳어 있다(fee_snapshot 은 제안 시점에 박힌다) */}
                      <form action={approveApplication} className="flex items-end gap-2">
                        <input type="hidden" name="id" value={l.id} />
                        <label className="text-caption text-muted">
                          수수료율
                          <span className="ml-1 text-faint">(비우면 {DEFAULT_FEE_RATE * 100}%)</span>
                          <div className="mt-1 flex items-center gap-1">
                            <input
                              name="feeRate"
                              type="number"
                              step="0.5"
                              min="0.5"
                              max="50"
                              placeholder={String(DEFAULT_FEE_RATE * 100)}
                              className="w-20 rounded-lg border border-line bg-bg px-2.5 py-1.5 text-caption tabular-nums outline-none focus:border-fg/40"
                            />
                            <span className="text-caption text-muted">%</span>
                          </div>
                        </label>
                        <PendingButton size="sm">승인</PendingButton>
                      </form>
                      <form action={rejectApplication} className="flex-1 sm:flex-none">
                        <input type="hidden" name="id" value={l.id} />
                        <PendingButton size="sm" variant="secondary" fullWidth>반려</PendingButton>
                      </form>
                    </>
                  ) : (
                    <p className="flex-1 self-center text-caption text-faint">
                      계정 미연동(옛 신청) — 로그인 후 재신청 안내 필요
                    </p>
                  )}
                  <form action={deleteApplication} className="flex-1 sm:flex-none">
                    <input type="hidden" name="id" value={l.id} />
                    <PendingButton size="sm" variant="ghost" fullWidth>삭제</PendingButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 등록된 작가 — 상태로 거른다 */}
      <section className="mt-10">
        <nav className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const active = f.key === filterKey;
            return (
              <Link
                key={f.key}
                href={f.key === "active" ? "/admin/photographers" : `/admin/photographers?status=${f.key}`}
                aria-current={active ? "page" : undefined}
                className={`rounded-full border px-3 py-1.5 text-caption font-medium transition-colors ${
                  active
                    ? "border-fg bg-fg text-bg"
                    : "border-line-strong text-muted hover:bg-fg/[0.04] hover:text-fg"
                }`}
              >
                {f.label} {countOf(f)}
              </Link>
            );
          })}
        </nav>

        {rows.length === 0 ? (
          <EmptyState
            className="mt-4 py-12"
            icon={<CameraIcon className="h-7 w-7" />}
            title="해당하는 작가가 없어요"
          />
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {rows.map((r) => (
              <li key={r.id} className="rounded-2xl border border-line bg-surface p-4">
                <div className="flex items-start gap-3">
                  <Avatar src={r.avatar} name={r.display_name} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* 행 전체를 링크로 감싸면 아래 form 들이 <a> 안에 들어간다 — 이름만 링크 */}
                      <Link
                        href={`/admin/photographers/${r.id}`}
                        className="truncate text-title font-semibold text-fg hover:text-brand"
                      >
                        {r.display_name || "이름 없음"}
                      </Link>
                      <StatusBadge status={r.status} />
                      <AgreementBadge state={r.agreement.state} label={r.agreement.label} />
                    </div>
                    <p className="mt-0.5 truncate text-caption text-faint">
                      {r.regions.length > 0 ? r.regions.slice(0, 3).join(", ") : "지역 미설정"}
                      {" · 후기 "}
                      {fmt.format(r.review_count)}
                      {" · 시작가 ₩"}
                      {fmt.format(r.price_from_krw)}
                      {" · 수수료 "}
                      {feeSpecLabel(feeSpecFromRow(r))}
                      {r.fee_mode === "rate" &&
                        Number(r.fee_rate ?? DEFAULT_FEE_RATE) === DEFAULT_FEE_RATE &&
                        " (기본)"}
                    </p>
                  </div>
                </div>

                {/* 승인 대기는 판단에 필요한 게 다르다 — 소개·태그를 펼쳐 준다 */}
                {r.status === "pending" && (
                  <>
                    {r.bio && <p className="mt-3 text-body-sm leading-relaxed text-fg/80">{r.bio}</p>}
                    <TagRow row={r} />
                  </>
                )}

                <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                  <Mini label="사진" value={r.photos} />
                  <Mini label="패키지" value={r.packages} />
                  <Mini label="예약" value={r.bookings} />
                  <Mini label="문의" value={r.inquiries} />
                </div>

                {/* ⚠️ 이 줄의 자식들은 모두 **줄어들 수 있어야 한다**(min-w-0 / shrink-0).
                    전에 등록증 셀을 flex 자식으로 그냥 얹었더니 이름 칸이 글자 하나 폭까지
                    짓눌려 세로로 흘렀다(2026-09-17 스크린샷). 여기 무언가를 더할 때는
                    폭을 스스로 정하는 요소인지 먼저 볼 것. */}
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  {/* 승인 뒤 "다음에 뭘 하면 되는지" 를 보내야 작가가 멈추지 않는다.
                      승인 순간 디스코드에도 올라가지만, 다시 보낼 일이 생긴다. */}
                  <CopyApprovalScript
                    script={approvalScript({
                      displayName: r.display_name || "작가",
                      feeLabel: feeSpecLabel(feeSpecFromRow(r)),
                    })}
                  />
                  <BusinessLicenseCell
                    photographerId={r.id}
                    businessType={r.business_type ?? null}
                    uploadedAt={r.business_license_uploaded_at ?? null}
                    verifiedAt={r.business_license_verified_at ?? null}
                    note={r.business_license_note ?? null}
                  />
                  <FeeForm row={r} />
                  <RowAction row={r} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

// 지역·무드 태그
function TagRow({ row }: { row: Row }) {
  if (!row.regions.length && !row.mood_tags.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {row.regions.map((x) => (
        <span key={x} className="inline-flex items-center gap-1 rounded-full bg-fg/[0.06] px-2.5 py-1 text-caption text-fg/70">
          <MapPinIcon className="h-3 w-3 text-faint" />
          {x}
        </span>
      ))}
      {row.mood_tags.map((x) => (
        <span key={x} className="rounded-full bg-fg/[0.06] px-2.5 py-1 text-caption text-fg/70">#{x}</span>
      ))}
    </div>
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

// 이미 제안된 예약은 fee_snapshot 으로 굳어 있어 여기서 바꿔도 소급되지 않는다. (작가약관 12조 4항)
function FeeForm({ row }: { row: Row }) {
  const isRate = row.fee_mode !== "flat";
  return (
    <form action={updatePhotographerFee} className="flex items-center gap-1.5">
      <input type="hidden" name="id" value={row.id} />
      <select
        name="mode"
        defaultValue={isRate ? "rate" : "flat"}
        aria-label={`${row.display_name || "작가"} 수수료 방식`}
        className="cursor-pointer rounded-full border border-line-strong bg-bg px-2.5 py-1.5 text-caption text-fg focus:border-fg/30 focus:outline-none"
      >
        <option value="rate">정률 (%, 부가세 별도)</option>
        <option value="flat">정액 (옛 모델)</option>
      </select>
      <input
        name="value"
        inputMode="numeric"
        defaultValue={isRate ? String(+(Number(row.fee_rate ?? DEFAULT_FEE_RATE) * 100).toFixed(2)) : row.fee_amount_krw === null ? "" : String(row.fee_amount_krw)}
        placeholder={isRate ? String(DEFAULT_FEE_RATE * 100) : fmt.format(6000)}
        aria-label={`${row.display_name || "작가"} 수수료 값`}
        className="w-20 rounded-full border border-line-strong bg-bg px-3 py-1.5 text-body-sm text-fg placeholder:text-faint focus:border-fg/30 focus:outline-none"
      />
      <PendingButton size="sm" variant="ghost">저장</PendingButton>
    </form>
  );
}

// 상태별 액션 — approved→정지·퇴출 / 그 외→승인·반려
// 정지와 퇴출은 다르다.
//   정지 — status 만 바꿔 노출을 끊는다. 언제든 되돌린다
//   퇴출 — 작가 등록 자체를 없앤다. **하드 딜리트라 되돌릴 수 없다.**
//          그래서 이 버튼은 지우지 않고 정지 + 점검 화면으로 보낸다. 실제 삭제는
//          걸린 게 하나도 없을 때만 그 화면에서 일어난다.
function RowAction({ row }: { row: Row }) {
  if (row.status === "approved") {
    return (
      <div className="flex shrink-0 items-center gap-1.5">
        <form action={suspendPhotographer}>
          <input type="hidden" name="id" value={row.id} />
          <button className="shrink-0 cursor-pointer rounded-full border border-line-strong px-3 py-1 text-caption font-medium text-muted transition-colors hover:bg-fg/[0.04]">
            정지
          </button>
        </form>
        {/* 퇴출은 여기서 **지우지 않는다.** 정지시키고 점검 화면으로 보낸다 —
            되돌릴 수 없는 일을 한 번의 클릭으로 끝내면 안 된다(beginRemoval) */}
        <form action={beginRemoval}>
          <input type="hidden" name="id" value={row.id} />
          <button className="shrink-0 cursor-pointer rounded-full border border-danger/30 px-3 py-1 text-caption font-medium text-danger-ink transition-colors hover:bg-danger/[0.06]">
            퇴출
          </button>
        </form>
      </div>
    );
  }
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <form action={approvePhotographer}>
        <input type="hidden" name="id" value={row.id} />
        <button className="shrink-0 cursor-pointer rounded-full bg-fg/[0.06] px-3 py-1 text-caption font-medium text-fg transition-colors hover:bg-fg/10">
          승인
        </button>
      </form>
      {row.status === "pending" && (
        <form action={rejectPhotographer}>
          <input type="hidden" name="id" value={row.id} />
          <button className="shrink-0 cursor-pointer rounded-full border border-line-strong px-3 py-1 text-caption font-medium text-muted transition-colors hover:bg-fg/[0.04]">
            반려
          </button>
        </form>
      )}
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

function AgreementBadge({ state, label }: { state: AgreementState; label: string }) {
  const tone = state === "current" ? "success" : state === "outdated" ? "warning" : "danger";
  return <Badge tone={tone}>{`약관 ${label}`}</Badge>;
}
