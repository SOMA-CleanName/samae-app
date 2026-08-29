import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { Badge, EmptyState } from "@/components/ui";
import { PendingButton } from "@/components/ui/SubmitButton";
import { ADULT_AGE, CASTING_BUCKET, ageYears } from "@/lib/casting";
import {
  decideCastingApplication,
  saveCastingMemo,
  setCastingRoundStatus,
  uploadGuardianConsent,
} from "./actions";

export const dynamic = "force-dynamic";

type Filter = "all" | "minor" | "consent_pending" | "selected" | "shortlisted" | "rejected";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "minor", label: "미성년" },
  { key: "consent_pending", label: "⚠️ 동의서 미비" },
  { key: "shortlisted", label: "예비" },
  { key: "selected", label: "선정" },
  { key: "rejected", label: "탈락" },
];

const STATUS_TONE: Record<string, "neutral" | "brand" | "success" | "warning" | "danger"> = {
  new: "neutral",
  shortlisted: "warning",
  selected: "success",
  rejected: "danger",
};
const STATUS_LABEL: Record<string, string> = {
  new: "심사 중",
  shortlisted: "예비",
  selected: "선정",
  rejected: "탈락",
};

const ROUND_NEXT: Record<string, { to: string; label: string }[]> = {
  draft: [{ to: "open", label: "접수 시작" }],
  open: [{ to: "closed", label: "접수 마감" }],
  closed: [{ to: "selecting", label: "심사 시작" }, { to: "open", label: "접수 재개" }],
  selecting: [{ to: "done", label: "회차 종료" }, { to: "closed", label: "심사 중단" }],
  done: [],
};

function when(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(new Date(iso));
}

type AppRow = {
  id: string;
  status: string;
  name: string;
  phone: string;
  birth_date: string;
  gender: string | null;
  region: string;
  preferred_photographer_ids: string[];
  preferred_photo_ids: string[];
  mood_tags: string[];
  concept_note: string | null;
  photo_paths: string[];
  consent_participate: boolean;
  consent_sns: boolean;
  consent_paid_ad: boolean;
  consent_credit: boolean;
  guardian_name: string | null;
  guardian_phone: string | null;
  guardian_relation: string | null;
  guardian_consent_path: string | null;
  utm_source: string | null;
  reject_reason: string | null;
  created_at: string;
};

// 캐스팅 심사 — 회차별 신청 조회·판정. 가드는 (admin)/layout.
export default async function AdminCastingPage({
  searchParams,
}: {
  searchParams?: Promise<{ round?: string; f?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const filter: Filter = (FILTERS.find((f) => f.key === sp.f)?.key ?? "all") as Filter;
  const admin = createAdminClient();

  const { data: roundRows } = await admin
    .from("casting_rounds")
    .select("id, slug, title, status, capacity, closes_at, shoot_from, shoot_to")
    .order("created_at", { ascending: false });

  const rounds = roundRows ?? [];
  if (rounds.length === 0) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
        <h1 className="text-h1 font-semibold">캐스팅</h1>
        <EmptyState
          className="mt-6 py-12"
          title="회차가 없어요"
          description="마이그레이션(0084·0085)을 적용하면 가을 1회차가 생겨요."
        />
      </main>
    );
  }

  const round = rounds.find((r) => r.slug === sp.round) ?? rounds[0];

  const [{ data: appRows }, { data: joinRows }] = await Promise.all([
    admin
      .from("casting_applications")
      .select(
        "id, status, name, phone, birth_date, gender, region, preferred_photographer_ids, preferred_photo_ids, mood_tags, concept_note, photo_paths, consent_participate, consent_sns, consent_paid_ad, consent_credit, guardian_name, guardian_phone, guardian_relation, guardian_consent_path, utm_source, reject_reason, created_at",
      )
      .eq("round_id", round.id)
      .neq("status", "withdrawn")
      .order("created_at", { ascending: false }),
    admin
      .from("casting_round_photographers")
      .select("photographer_id, slots, photographer:photographers!inner(display_name)")
      .eq("round_id", round.id)
      .order("sort_order"),
  ]);

  const apps = (appRows ?? []) as AppRow[];

  // 작가 이름 — 희망 작가 표시용
  const nameById = new Map<string, string>();
  for (const r of joinRows ?? []) {
    const p = (Array.isArray(r.photographer) ? r.photographer[0] : r.photographer) as {
      display_name: string | null;
    };
    nameById.set(r.photographer_id as string, p?.display_name ?? "작가");
  }

  const ageOf = (a: AppRow) => ageYears(a.birth_date) ?? 0;
  const isMinor = (a: AppRow) => ageOf(a) < ADULT_AGE;
  const consentPending = (a: AppRow) => isMinor(a) && !a.guardian_consent_path;

  const counts = {
    total: apps.length,
    selected: apps.filter((a) => a.status === "selected").length,
    minor: apps.filter(isMinor).length,
    pending: apps.filter(consentPending).length,
  };

  const shown = apps.filter((a) => {
    switch (filter) {
      case "minor":
        return isMinor(a);
      case "consent_pending":
        return consentPending(a);
      case "selected":
      case "shortlisted":
      case "rejected":
        return a.status === filter;
      default:
        return true;
    }
  });

  // 신청자가 고른 포트폴리오 사진 — 어떤 취향인지가 심사의 핵심 정보다
  const pickedIds = [...new Set(shown.flatMap((a) => a.preferred_photo_ids ?? []))];
  const pickedById = new Map<string, string>();
  if (pickedIds.length > 0) {
    const { data: pp } = await admin.from("photos").select("id, thumb_url, src_url").in("id", pickedIds);
    for (const p of pp ?? []) pickedById.set(p.id as string, (p.thumb_url || p.src_url) as string);
  }

  // 신청자 사진 — private 버킷이라 렌더 시점에 서명 URL 을 만든다(60분).
  // 동의서와 달리 목록에서 한눈에 봐야 심사가 되므로 인라인으로 노출한다.
  const allPhotoPaths = shown.flatMap((a) => a.photo_paths ?? []);
  const photoUrl = new Map<string, string>();
  if (allPhotoPaths.length > 0) {
    const { data: signed } = await admin.storage.from(CASTING_BUCKET).createSignedUrls(allPhotoPaths, 3600);
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) photoUrl.set(s.path, s.signedUrl);
    }
  }

  const overCapacity = round.capacity != null && counts.selected > round.capacity;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
      <h1 className="text-h1 font-semibold">캐스팅</h1>
      <p className="mt-1 text-body-sm text-muted">무료 모델 모집 회차와 신청을 심사해요.</p>

      {/* 회차 선택 */}
      {rounds.length > 1 && (
        <div className="mt-5 flex flex-wrap gap-1.5">
          {rounds.map((r) => (
            <Link
              key={r.id}
              href={`/admin/casting?round=${r.slug}`}
              className={`rounded-full border px-3.5 py-2 text-body-sm font-medium transition-colors ${
                r.id === round.id ? "border-fg bg-fg text-bg" : "border-line-strong text-muted hover:border-fg/40"
              }`}
            >
              {r.title}
            </Link>
          ))}
        </div>
      )}

      {/* 회차 헤더 */}
      <section className="mt-5 rounded-2xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-title font-semibold">{round.title}</p>
          <Badge tone={round.status === "open" ? "success" : round.status === "draft" ? "neutral" : "warning"}>
            {round.status}
          </Badge>
          {round.status === "draft" && (
            <span className="text-caption text-faint">draft 는 /casting 에 노출되지 않아요</span>
          )}
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Stat label="신청" value={`${counts.total}건`} />
          <Stat
            label="선정"
            value={`${counts.selected}${round.capacity != null ? ` / ${round.capacity}` : ""}`}
            tone={overCapacity ? "danger" : undefined}
          />
          <Stat label="미성년" value={`${counts.minor}건`} />
          <Stat label="동의서 미비" value={`${counts.pending}건`} tone={counts.pending > 0 ? "warning" : undefined} />
        </dl>

        {overCapacity && (
          <p className="mt-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-body-sm text-danger">
            선정 인원이 정원({round.capacity}명)을 넘었어요. 참여 작가 슬롯을 확인해주세요.
          </p>
        )}

        {(ROUND_NEXT[round.status] ?? []).length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {(ROUND_NEXT[round.status] ?? []).map((n) => (
              <form key={n.to} action={setCastingRoundStatus}>
                <input type="hidden" name="roundId" value={round.id} />
                <input type="hidden" name="status" value={n.to} />
                <PendingButton size="sm" variant="secondary">{n.label}</PendingButton>
              </form>
            ))}
          </div>
        )}
      </section>

      {/* 필터 */}
      <div className="mt-6 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const n =
            f.key === "all" ? counts.total
            : f.key === "minor" ? counts.minor
            : f.key === "consent_pending" ? counts.pending
            : apps.filter((a) => a.status === f.key).length;
          return (
            <Link
              key={f.key}
              href={`/admin/casting?round=${round.slug}&f=${f.key}`}
              className={`rounded-full border px-3.5 py-2 text-body-sm font-medium transition-colors ${
                f.key === filter ? "border-fg bg-fg text-bg" : "border-line-strong text-muted hover:border-fg/40"
              }`}
            >
              {f.label} {n}
            </Link>
          );
        })}
      </div>

      {/* 신청 목록 */}
      {shown.length === 0 ? (
        <EmptyState className="mt-4 py-12" title="해당하는 신청이 없어요" />
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {shown.map((a) => {
            const age = ageOf(a);
            const minor = isMinor(a);
            const blocked = consentPending(a);
            const picks = (a.preferred_photographer_ids ?? []).map((id) => nameById.get(id) ?? "알 수 없음");

            return (
              <li key={a.id} className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row">
                  {/* 사진 */}
                  <div className="flex gap-2 sm:w-40 sm:shrink-0 sm:flex-col">
                    {(a.photo_paths ?? []).length === 0 && (
                      <div className="grid h-28 w-24 place-items-center rounded-xl border border-dashed border-line-strong text-caption text-faint sm:w-full">
                        사진 없음
                      </div>
                    )}
                    {(a.photo_paths ?? []).map((p) => {
                      const url = photoUrl.get(p);
                      return url ? (
                        // 서명 URL 은 만료되므로 next/image 최적화 대상으로 두지 않는다
                        <a key={p} href={url} target="_blank" rel="noreferrer" className="block">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt="" className="h-28 w-24 rounded-xl object-cover sm:h-40 sm:w-full" />
                        </a>
                      ) : null;
                    })}
                  </div>

                  {/* 본문 */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-title font-semibold">{a.name}</p>
                      <Badge tone={STATUS_TONE[a.status] ?? "neutral"}>{STATUS_LABEL[a.status] ?? a.status}</Badge>
                      <Badge tone={minor ? "warning" : "neutral"}>만 {age}세{minor ? " · 미성년" : ""}</Badge>
                      {blocked && <Badge tone="danger">동의서 미비</Badge>}
                    </div>

                    <p className="mt-1 text-caption text-faint">
                      {a.region} · <a href={`tel:${a.phone}`} className="hover:text-brand">{a.phone}</a>
                      {a.gender ? ` · ${a.gender}` : ""} · 신청 {when(a.created_at)}
                      {a.utm_source ? ` · 유입 ${a.utm_source}` : ""}
                    </p>

                    {/* 고른 사진 — 이 사람이 원하는 톤이 무엇인지가 배정 판단의 핵심이다 */}
                    <div className="mt-2.5">
                      <p className="text-body-sm">
                        <span className="text-muted">희망 작가</span>{" "}
                        <span className="font-medium">{picks.join(", ") || "-"}</span>
                      </p>
                      {(a.preferred_photo_ids ?? []).length > 0 && (
                        <div className="mt-1.5 flex gap-1.5">
                          {(a.preferred_photo_ids ?? []).map((pid) => {
                            const url = pickedById.get(pid);
                            return url ? (
                              <a key={pid} href={`/photos/${pid}`} target="_blank" rel="noreferrer">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={url} alt="" className="h-16 w-12 rounded-lg object-cover" />
                              </a>
                            ) : null;
                          })}
                        </div>
                      )}
                    </div>

                    {(a.mood_tags ?? []).length > 0 && (
                      <p className="mt-1 text-body-sm">
                        <span className="text-muted">무드</span>{" "}
                        <span className="font-medium">{a.mood_tags.join(", ")}</span>
                      </p>
                    )}

                    {/* 동의 — 항목별로 따로 받으므로 따로 보여야 한다 */}
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      <ConsentChip on={a.consent_participate} label="참여" />
                      <ConsentChip on={a.consent_sns} label="SNS 게시" />
                      <ConsentChip on={a.consent_paid_ad} label="유료 광고" />
                      <ConsentChip on={a.consent_credit} label="크레딧" />
                    </div>

                    {a.concept_note && (
                      <p className="mt-3 whitespace-pre-wrap rounded-xl bg-fg/[0.03] px-3.5 py-2.5 text-body-sm leading-relaxed text-fg/80">
                        {a.concept_note}
                      </p>
                    )}

                    {/* 보호자 */}
                    {minor && (
                      <div className="mt-3 rounded-xl border border-warning/30 bg-warning-soft p-3.5">
                        <p className="text-body-sm font-semibold">
                          보호자 {a.guardian_name ?? "-"}
                          {a.guardian_relation ? ` (${a.guardian_relation})` : ""}
                          {a.guardian_phone && (
                            <>
                              {" · "}
                              <a href={`tel:${a.guardian_phone}`} className="font-normal hover:text-brand">
                                {a.guardian_phone}
                              </a>
                            </>
                          )}
                        </p>
                        {a.guardian_consent_path ? (
                          <a
                            href={`/admin/casting/consent/${a.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-block text-body-sm font-medium underline underline-offset-4"
                          >
                            동의서 열람 (5분 링크)
                          </a>
                        ) : (
                          <form action={uploadGuardianConsent} className="mt-2 flex flex-wrap items-center gap-2">
                            <input type="hidden" name="id" value={a.id} />
                            <input
                              type="file"
                              name="file"
                              accept="image/*,application/pdf"
                              required
                              className="max-w-full text-caption file:mr-2 file:rounded-lg file:border-0 file:bg-fg file:px-3 file:py-1.5 file:text-caption file:font-semibold file:text-bg"
                            />
                            <PendingButton size="sm" variant="secondary">동의서 등록</PendingButton>
                          </form>
                        )}
                      </div>
                    )}

                    {/* 내부 메모 */}
                    <form action={saveCastingMemo} className="mt-3 flex gap-2">
                      <input type="hidden" name="id" value={a.id} />
                      <input
                        name="memo"
                        defaultValue={a.reject_reason ?? ""}
                        placeholder="내부 메모 (신청자에게 보이지 않아요)"
                        className="h-9 min-w-0 flex-1 rounded-lg border border-line-strong bg-bg px-3 text-body-sm outline-none focus:border-fg/45"
                      />
                      <PendingButton size="sm" variant="ghost">저장</PendingButton>
                    </form>

                    {/* 판정 */}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Decide id={a.id} to="selected" label="선정" disabled={blocked} current={a.status} />
                      <Decide id={a.id} to="shortlisted" label="예비" current={a.status} />
                      <Decide id={a.id} to="rejected" label="탈락" current={a.status} />
                      {a.status !== "new" && <Decide id={a.id} to="new" label="되돌리기" current={a.status} ghost />}
                    </div>
                    {blocked && (
                      <p className="mt-2 text-caption text-danger">
                        보호자 동의서가 없어 선정할 수 없어요. 위에서 동의서를 등록해주세요.
                      </p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warning" | "danger" }) {
  return (
    <div className="rounded-xl border border-line bg-bg px-3.5 py-3">
      <dt className="text-caption text-faint">{label}</dt>
      <dd
        className={`mt-0.5 text-body font-semibold ${
          tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function ConsentChip({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-caption font-medium ${
        on ? "bg-success-soft text-success" : "bg-fg/[0.06] text-fg/40"
      }`}
    >
      {on ? "✓" : "✕"} {label}
    </span>
  );
}

function Decide({
  id,
  to,
  label,
  current,
  disabled,
  ghost,
}: {
  id: string;
  to: string;
  label: string;
  current: string;
  disabled?: boolean;
  ghost?: boolean;
}) {
  const active = current === to;
  return (
    <form action={decideCastingApplication}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="decision" value={to} />
      <PendingButton
        size="sm"
        variant={ghost ? "ghost" : active ? "primary" : "secondary"}
        disabled={disabled || active}
      >
        {label}
      </PendingButton>
    </form>
  );
}
