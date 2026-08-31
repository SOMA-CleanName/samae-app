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
  updateLeadPrice,
  updateDefaultLeadPrice,
  updatePhotographerFee,
} from "./actions";
import { feeSpecFromRow, feeSpecLabel } from "@/lib/platform-fee";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  display_name: string | null;
  bio: string;
  regions: string[];
  mood_tags: string[];
  price_from_krw: number;
  // 리드 단가 — null 이면 기본 단가를 따른다
  lead_price_krw: number | null;
  // 중개 수수료 — 미설정이면 전역 기본(정액 6,000). docs/32
  fee_mode: string | null;
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
  const [{ data }, { data: leadData }, { data: platform }] = await Promise.all([
    supabase
      .from("photographers")
      .select("id, display_name, bio, regions, mood_tags, price_from_krw, lead_price_krw, fee_mode, fee_amount_krw, fee_rate, review_count, status, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("photographer_applications")
      .select("id, profile_id, display_name, portfolio_url, phone, bio, status, created_at")
      .in("status", ["new", "contacted"])
      .order("created_at", { ascending: false }),
    supabase.from("platform_account").select("default_lead_price_krw").eq("id", true).maybeSingle(),
  ]);

  const rows = (data ?? []) as Row[];
  const pending = rows.filter((r) => r.status === "pending");
  const others = rows.filter((r) => r.status !== "pending");
  const leads = (leadData ?? []) as Lead[];
  const defaultLeadPrice = (platform?.default_lead_price_krw as number | null) ?? 6000;

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
                            className="break-all text-brand hover:underline"
                          >
                            {l.portfolio_url}
                          </a>
                        </dd>
                      </div>
                    </dl>
                    {l.bio && <p className="mt-2 text-body-sm leading-relaxed text-fg/80">{l.bio}</p>}
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  {l.profile_id ? (
                    <>
                      <form action={approveApplication} className="flex-1 sm:flex-none">
                        <input type="hidden" name="id" value={l.id} />
                        <PendingButton size="sm" fullWidth>승인</PendingButton>
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
        <p className="mt-1 text-caption text-faint">
          리드 단가는 작가마다 다르게 정할 수 있어요. 비워두면 기본 단가를 따라가고, 단가를 바꾸면 아직 해제하지
          않은 리드에도 바로 적용돼요(입금 대기·입금 확인된 건은 그대로).
        </p>

        {/* 기본 단가 — 개별 단가가 없는 작가 전원에게 적용 */}
        <form
          action={updateDefaultLeadPrice}
          className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3"
        >
          <label htmlFor="default-lead-price" className="text-body-sm font-medium text-fg">
            기본 리드 단가
          </label>
          <PriceInput id="default-lead-price" defaultValue={String(defaultLeadPrice)} />
          <PendingButton size="sm" variant="secondary">저장</PendingButton>
        </form>

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
                      후기 {r.review_count} · 리드 단가 ₩{fmt.format(r.lead_price_krw ?? defaultLeadPrice)}
                      {r.lead_price_krw === null && " (기본)"}
                      {" · 수수료 "}
                      {feeSpecLabel(feeSpecFromRow(r))}
                      {r.fee_mode !== "rate" && r.fee_amount_krw === null && " (기본)"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:shrink-0">
                  <LeadPriceForm row={r} defaultLeadPrice={defaultLeadPrice} />
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
          <MapPinIcon className="h-3 w-3 text-fg/45" />
          {x}
        </span>
      ))}
      {row.mood_tags.map((x) => (
        <span key={x} className="rounded-full bg-fg/[0.06] px-2.5 py-1 text-caption text-fg/70">#{x}</span>
      ))}
    </div>
  );
}

// 원화 금액 입력 — 어드민 전용, 숫자만. placeholder 로 대체값(기본 단가)을 보여준다.
function PriceInput({
  id,
  defaultValue,
  placeholder,
  ariaLabel,
}: {
  id?: string;
  defaultValue?: string;
  placeholder?: string;
  ariaLabel?: string;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-caption text-faint">₩</span>
      <input
        id={id}
        name="price"
        type="number"
        min={0}
        max={10000000}
        step={1000}
        inputMode="numeric"
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="w-32 rounded-full border border-line-strong bg-bg py-1.5 pl-7 pr-3 text-body-sm text-fg placeholder:text-faint focus:border-fg/30 focus:outline-none"
      />
    </div>
  );
}

// 작가별 리드 단가 — 비우고 저장하면 기본 단가로 되돌아간다(lead_price_krw = null)
function LeadPriceForm({ row, defaultLeadPrice }: { row: Row; defaultLeadPrice: number }) {
  return (
    <form action={updateLeadPrice} className="flex items-center gap-1.5">
      <input type="hidden" name="id" value={row.id} />
      <PriceInput
        defaultValue={row.lead_price_krw === null ? "" : String(row.lead_price_krw)}
        placeholder={fmt.format(defaultLeadPrice)}
        ariaLabel={`${row.display_name || "작가"} 리드 단가`}
      />
      <PendingButton size="sm" variant="ghost">저장</PendingButton>
    </form>
  );
}

// 작가별 중개 수수료 — 정액(원)과 정률(%)을 한 자리에서 고른다.
//
// 요율은 퍼센트로 받고 저장할 때 비율로 바꾼다 (0.1 대신 10 을 넣는 사고가 잦아서다).
// 정액을 비우고 저장하면 전역 기본값으로 되돌아간다. 이미 제안된 예약은 스냅샷으로
// 굳어 있어 여기서 바꿔도 소급되지 않는다. (docs/32 §2)
function FeeForm({ row }: { row: Row }) {
  const isRate = row.fee_mode === "rate";
  return (
    <form action={updatePhotographerFee} className="flex items-center gap-1.5">
      <input type="hidden" name="id" value={row.id} />
      <select
        name="mode"
        defaultValue={isRate ? "rate" : "flat"}
        aria-label={`${row.display_name || "작가"} 수수료 방식`}
        className="cursor-pointer rounded-full border border-line-strong bg-bg px-2.5 py-1.5 text-caption text-fg focus:border-fg/30 focus:outline-none"
      >
        <option value="flat">정액</option>
        <option value="rate">정률</option>
      </select>
      <input
        name="value"
        inputMode="numeric"
        defaultValue={isRate ? String(+(Number(row.fee_rate ?? 0) * 100).toFixed(2)) : row.fee_amount_krw === null ? "" : String(row.fee_amount_krw)}
        placeholder={isRate ? "10" : fmt.format(6000)}
        aria-label={`${row.display_name || "작가"} 수수료 값`}
        className="w-20 rounded-full border border-line-strong bg-bg px-3 py-1.5 text-body-sm text-fg placeholder:text-faint focus:border-fg/30 focus:outline-none"
      />
      <PendingButton size="sm" variant="ghost">저장</PendingButton>
    </form>
  );
}

// 상태별 액션 — approved→정지 / 그 외→승인
function RowAction({ row }: { row: Row }) {
  if (row.status === "approved") {
    return (
      <form action={suspendPhotographer}>
        <input type="hidden" name="id" value={row.id} />
        <button className="shrink-0 cursor-pointer rounded-full border border-line-strong px-3 py-1 text-caption font-medium text-muted transition-colors hover:bg-fg/[0.04]">
          정지
        </button>
      </form>
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
