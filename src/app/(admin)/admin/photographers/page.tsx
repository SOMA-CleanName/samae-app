import { createClient } from "@/lib/supabase/server";
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
  removePhotographer,
} from "./actions";
import { DEFAULT_FEE_RATE, feeSpecFromRow, feeSpecLabel } from "@/lib/platform-fee";
import { BusinessLicenseCell } from "./BusinessLicenseCell";
import { CopyApprovalScript } from "./CopyApprovalScript";
import { approvalScript } from "@/lib/ops-alert";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  display_name: string | null;
  bio: string;
  regions: string[];
  mood_tags: string[];
  price_from_krw: number;
  // 중개 수수료 — 기본은 정률 20%(수수료정책 1조). 정액은 옛 모델로 명시한 작가만.
  fee_mode: string | null;
  // 사업자등록증 — 세금계산서 발급과 전자상거래법 20조의 "확인" 에 필요하다(0124)
  business_type?: string | null;
  business_license_uploaded_at?: string | null;
  business_license_verified_at?: string | null;
  business_license_note?: string | null;
  fee_amount_krw: number | null;
  fee_rate: number | null;
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

// 작가 승인 관리 — pending 우선. 가드는 (admin)/layout.
export default async function AdminPhotographersPage() {
  const supabase = await createClient();
  const [{ data }, { data: leadData }] = await Promise.all([
    supabase
      .from("photographers")
      .select("id, display_name, bio, regions, mood_tags, price_from_krw, fee_mode, fee_amount_krw, fee_rate, review_count, status, created_at, business_type, business_license_uploaded_at, business_license_verified_at, business_license_note")
      .order("created_at", { ascending: false }),
    supabase
      .from("photographer_applications")
      .select("id, profile_id, display_name, portfolio_url, phone, bio, status, created_at")
      .in("status", ["new", "contacted"])
      .order("created_at", { ascending: false }),
  ]);

  const rows = (data ?? []) as Row[];
  const pending = rows.filter((r) => r.status === "pending");
  const others = rows.filter((r) => r.status !== "pending");
  const leads = (leadData ?? []) as Lead[];

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
      <h1 className="text-h1 font-semibold">작가 승인</h1>
      <p className="mt-1 text-body-sm text-muted">신청을 검토하고 승인·반려·정지를 관리해요.</p>

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
                    <PendingButton size="sm" fullWidth>승인</PendingButton>
                  </form>
                  <form action={rejectPhotographer} className="flex-1 sm:flex-none">
                    <input type="hidden" name="id" value={r.id} />
                    <PendingButton size="sm" variant="secondary" fullWidth>반려</PendingButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 전체 작가 — 리드 단가(작가가 리드 1건 해제 시 우리 계좌로 입금하는 금액) 관리 포함 */}
      <section className="mt-10">
        <h2 className="text-body-sm font-medium text-muted">전체 작가 {others.length}</h2>
        {others.length === 0 ? (
          <p className="mt-3 text-body-sm text-faint">아직 없어요.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {others.map((r) => (
              <li key={r.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar name={r.display_name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body-sm font-semibold text-fg">{r.display_name || "이름 없음"}</p>
                    <p className="truncate text-caption text-faint">
                      후기 {r.review_count}
                      {" · 수수료 "}
                      {feeSpecLabel(feeSpecFromRow(r))}
                      {r.fee_mode === "rate" && Number(r.fee_rate ?? DEFAULT_FEE_RATE) === DEFAULT_FEE_RATE && " (기본)"}
                    </p>
                  </div>
                </div>
                {/* ⚠️ 이 줄의 자식들은 모두 **줄어들 수 있어야 한다**(min-w-0 / shrink-0).
                    전에 등록증 셀을 flex 자식으로 그냥 얹었더니 이름 칸이 글자 하나 폭까지
                    짓눌려 세로로 흘렀다(2026-09-17 스크린샷). 여기 무언가를 더할 때는
                    폭을 스스로 정하는 요소인지 먼저 볼 것. */}
                <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
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
                  <StatusBadge status={r.status} />
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

// 굳어 있어 여기서 바꿔도 소급되지 않는다. (수수료정책 1조·2조)
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

// 상태별 액션 — approved→정지 / 그 외→승인
// 정지와 퇴출은 다르다.
//   정지 — status 만 바꿔 노출을 끊는다. 언제든 되돌린다
//   퇴출 — 작가 등록 자체를 없애 **일반 회원으로 되돌린다.** 사진·패키지·대화·후기가
//          함께 사라지고, 본인은 작가 신청부터 다시 할 수 있다 (아카이브되므로 복구 가능)
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
        <form action={removePhotographer}>
          <input type="hidden" name="id" value={row.id} />
          <button className="shrink-0 cursor-pointer rounded-full border border-danger/30 px-3 py-1 text-caption font-medium text-danger-ink transition-colors hover:bg-danger/[0.06]">
            퇴출
          </button>
        </form>
      </div>
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
