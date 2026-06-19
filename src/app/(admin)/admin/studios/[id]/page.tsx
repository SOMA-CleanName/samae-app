import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Avatar, Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

const fmt = new Intl.NumberFormat("ko-KR");
const won = (n: number | null | undefined) => `₩${fmt.format(n ?? 0)}`;

function when(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "Asia/Seoul" }).format(new Date(iso));
}
function whenTime(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(
    new Date(iso)
  );
}

const BOOKING_LABEL: Record<string, string> = {
  requested: "요청",
  accepted: "수락",
  paid: "결제완료",
  shot: "촬영완료",
  delivered: "전달완료",
  completed: "완료",
  cancelled: "취소",
};
const SETTLE_LABEL: Record<string, string> = {
  pending: "대기",
  scheduled: "예정",
  paid: "지급완료",
  on_hold: "보류",
};

// 작가 관리 상세 — 한 작가의 모든 정보. 가드는 (admin)/layout.
export default async function StudioDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: ph } = await admin.from("photographers").select("*").eq("id", id).maybeSingle();
  if (!ph) notFound();

  const [
    { data: profile },
    { data: packages },
    { data: photos },
    { data: albums },
    { data: bookings },
    { data: reviews },
    { data: fees },
    { data: payout },
    { data: inquiries },
    { data: highlights },
    { count: favCount },
  ] = await Promise.all([
    admin
      .from("profiles")
      .select("id, display_name, avatar_url, phone, instagram_id, discord_id, contact_email, created_at")
      .eq("id", ph.profile_id)
      .maybeSingle(),
    admin
      .from("packages")
      .select("id, name, price_krw, duration_min, edited_count, is_active")
      .eq("photographer_id", id)
      .order("sort_order", { ascending: true }),
    admin.from("photos").select("id, thumb_url, src_url, visibility").eq("photographer_id", id).order("created_at", { ascending: false }),
    admin.from("albums").select("id").eq("photographer_id", id),
    admin
      .from("bookings")
      .select("id, status, amount_krw, shoot_at, created_at, user_id")
      .eq("photographer_id", id)
      .order("created_at", { ascending: false }),
    admin
      .from("reviews")
      .select("id, rating, body, created_at, user_id")
      .eq("photographer_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
    admin.from("platform_fees").select("status, fee_krw").eq("photographer_id", id),
    admin.from("payout_accounts").select("bank, holder, number, updated_at").eq("photographer_id", id).maybeSingle(),
    admin.from("inquiries").select("id, status, purpose, preferred_date, created_at").eq("photographer_id", id).order("created_at", { ascending: false }),
    admin
      .from("highlights")
      .select("id, title, cover_url, cover_photo_id")
      .eq("photographer_id", id)
      .order("sort_order", { ascending: true }),
    admin
      .from("favorites")
      .select("id", { count: "exact", head: true })
      .eq("target_type", "photographer")
      .eq("target_id", id),
  ]);

  // 예약·후기 작성자 이름 매핑
  const userIds = [
    ...new Set([...(bookings ?? []).map((b) => b.user_id), ...(reviews ?? []).map((r) => r.user_id)].filter(Boolean)),
  ] as string[];
  const { data: users } = userIds.length
    ? await admin.from("profiles").select("id, display_name").in("id", userIds)
    : { data: [] as { id: string; display_name: string | null }[] };
  const userName = new Map((users ?? []).map((u) => [u.id as string, (u.display_name as string) ?? "이름없음"]));

  // 하이라이트 — 사진 수 + 커버 이미지(cover_url 없으면 cover_photo_id 로 해석)
  const hlIds = (highlights ?? []).map((h) => h.id as string);
  const coverPhotoIds = (highlights ?? []).map((h) => h.cover_photo_id).filter(Boolean) as string[];
  const [{ data: hlItems }, { data: coverPhotos }] = await Promise.all([
    hlIds.length ? admin.from("highlight_items").select("highlight_id").in("highlight_id", hlIds) : Promise.resolve({ data: [] as { highlight_id: string }[] }),
    coverPhotoIds.length ? admin.from("photos").select("id, thumb_url, src_url").in("id", coverPhotoIds) : Promise.resolve({ data: [] as { id: string; thumb_url: string | null; src_url: string }[] }),
  ]);
  const hlItemCount = new Map<string, number>();
  for (const it of hlItems ?? []) hlItemCount.set(it.highlight_id, (hlItemCount.get(it.highlight_id) ?? 0) + 1);
  const coverMap = new Map((coverPhotos ?? []).map((p) => [p.id as string, (p.thumb_url as string) || (p.src_url as string)]));

  // 집계
  const publishedPhotos = (photos ?? []).filter((p) => p.visibility === "published").length;
  const paidStatuses = new Set(["paid", "shot", "delivered", "completed"]);
  const grossRevenue = (bookings ?? []).filter((b) => paidStatuses.has(b.status)).reduce((n, b) => n + (b.amount_krw ?? 0), 0);
  const completedCount = (bookings ?? []).filter((b) => b.status === "completed").length;
  const feesAccrued = (fees ?? []).filter((f) => f.status === "accrued" || f.status === "billed").reduce((n, f) => n + (f.fee_krw ?? 0), 0);
  const feesPaid = (fees ?? []).filter((f) => f.status === "paid").reduce((n, f) => n + (f.fee_krw ?? 0), 0);
  const inqByStatus = new Map<string, number>();
  for (const q of inquiries ?? []) inqByStatus.set(q.status, (inqByStatus.get(q.status) ?? 0) + 1);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
      <Link
        href="/admin/studios"
        className="inline-flex items-center gap-1 text-caption text-muted transition-colors hover:text-fg"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        작가 관리 목록으로
      </Link>

      {/* 헤더 */}
      <div className="mt-3 flex flex-wrap items-start gap-4 rounded-2xl border border-line bg-surface p-5">
        <Avatar src={profile?.avatar_url} name={ph.display_name} size="xl" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-h1 font-semibold">{ph.display_name || "이름 없음"}</h1>
            <StatusBadge status={ph.status} />
          </div>
          <p className="mt-1 text-body-sm text-muted">
            가입 {when(profile?.created_at ?? ph.created_at)}
            {ph.approved_at && ` · 승인 ${when(ph.approved_at)}`}
          </p>
          {ph.bio && <p className="mt-2 text-body-sm leading-relaxed text-fg/80">{ph.bio}</p>}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(ph.regions ?? []).map((x: string) => (
              <span key={x} className="rounded-full bg-fg/[0.06] px-2.5 py-1 text-caption text-fg/70">📍 {x}</span>
            ))}
            {(ph.mood_tags ?? []).map((x: string) => (
              <span key={x} className="rounded-full bg-fg/[0.06] px-2.5 py-1 text-caption text-fg/70">#{x}</span>
            ))}
          </div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto">
          <a
            href={`/photographers/${id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-body-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            작가 프로필 열기
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M7 17L17 7M9 7h8v8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
          <Link
            href={`/admin/analytics/photographers/${id}`}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-line-strong px-4 py-2.5 text-body-sm font-medium text-muted transition-colors hover:bg-fg/[0.04] hover:text-fg"
          >
            분석에서 보기
          </Link>
        </div>
      </div>

      {/* 핵심 지표 */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="평점" value={`★ ${(ph.rating_avg ?? 0).toFixed(1)}`} />
        <Stat label="후기" value={fmt.format(ph.review_count ?? 0)} />
        <Stat label="공개 사진" value={`${fmt.format(publishedPhotos)} / ${fmt.format((photos ?? []).length)}`} />
        <Stat label="패키지" value={fmt.format((packages ?? []).length)} />
        <Stat label="예약" value={fmt.format((bookings ?? []).length)} />
        <Stat label="찜" value={fmt.format(favCount ?? 0)} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* 계정·연락처 */}
        <Section title="계정 · 연락처">
          <Row k="작가 이름" v={ph.display_name || "—"} />
          <Row k="계정 이름" v={profile?.display_name || "—"} />
          <Row k="전화" v={profile?.phone || "—"} />
          <Row k="이메일" v={profile?.contact_email || "—"} />
          <Row k="인스타그램" v={profile?.instagram_id || "—"} />
          <Row k="디스코드" v={profile?.discord_id || "—"} />
          <Row k="계정 ID" v={ph.profile_id} mono />
        </Section>

        {/* 정산 */}
        <Section title="거래 · 수수료">
          <Row k="거래액(결제~완료)" v={won(grossRevenue)} />
          <Row k="완료 예약" v={`${fmt.format(completedCount)}건`} />
          <Row k="플랫폼 수수료 미납" v={won(feesAccrued)} accent={feesAccrued > 0} />
          <Row k="플랫폼 수수료 납부" v={won(feesPaid)} />
          <div className="mt-2 border-t border-line pt-2">
            <p className="text-caption text-faint">정산 계좌</p>
            {payout ? (
              <p className="mt-1 text-body-sm text-fg">
                {payout.bank} · {maskAccount(payout.number)} · {payout.holder}
              </p>
            ) : (
              <p className="mt-1 text-body-sm text-faint">등록 안 됨</p>
            )}
          </div>
        </Section>
      </div>

      {/* 패키지 */}
      <Section title={`패키지 (${fmt.format((packages ?? []).length)})`} className="mt-4">
        {(packages ?? []).length === 0 ? (
          <p className="text-body-sm text-faint">등록된 패키지가 없어요.</p>
        ) : (
          <ul className="divide-y divide-line">
            {(packages ?? []).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-body-sm font-medium text-fg">
                    {p.name}
                    {!p.is_active && <Badge tone="neutral">비활성</Badge>}
                  </p>
                  <p className="text-caption text-faint">{p.duration_min}분 · 보정 {p.edited_count}장</p>
                </div>
                <span className="shrink-0 text-body-sm font-semibold tabular-nums text-fg">{won(p.price_krw)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* 사진 썸네일 */}
      <Section title={`포트폴리오 사진 (공개 ${fmt.format(publishedPhotos)} · 게시물 ${fmt.format((albums ?? []).length)})`} className="mt-4">
        {(photos ?? []).length === 0 ? (
          <p className="text-body-sm text-faint">등록된 사진이 없어요.</p>
        ) : (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
            {(photos ?? []).slice(0, 24).map((p) => (
              <span key={p.id} className="relative aspect-square overflow-hidden rounded-lg bg-surface-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.thumb_url || p.src_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                {p.visibility !== "published" && (
                  <span className="absolute inset-x-0 bottom-0 bg-black/55 py-0.5 text-center text-[10px] text-white">비공개</span>
                )}
              </span>
            ))}
          </div>
        )}
      </Section>

      {/* 하이라이트 */}
      <Section title={`하이라이트 (${fmt.format((highlights ?? []).length)})`} className="mt-4">
        {(highlights ?? []).length === 0 ? (
          <p className="text-body-sm text-faint">등록된 하이라이트가 없어요.</p>
        ) : (
          <div className="flex flex-wrap gap-4">
            {(highlights ?? []).map((h) => {
              const cover = (h.cover_url as string) || coverMap.get(h.cover_photo_id as string) || null;
              return (
                <div key={h.id} className="flex w-20 flex-col items-center gap-1.5 text-center">
                  <span className="h-20 w-20 overflow-hidden rounded-full border border-line bg-surface-2">
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <span className="grid h-full w-full place-items-center text-caption text-faint">커버없음</span>
                    )}
                  </span>
                  <span className="w-full truncate text-caption font-medium text-fg">{(h.title as string) || "제목없음"}</span>
                  <span className="text-[11px] text-faint">사진 {fmt.format(hlItemCount.get(h.id as string) ?? 0)}</span>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* 예약 */}
        <Section title={`예약 (${fmt.format((bookings ?? []).length)})`}>
          {(bookings ?? []).length === 0 ? (
            <p className="text-body-sm text-faint">예약이 없어요.</p>
          ) : (
            <ul className="divide-y divide-line">
              {(bookings ?? []).map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-body-sm text-fg">{userName.get(b.user_id) ?? "—"}</p>
                    <p className="text-caption text-faint">{whenTime(b.shoot_at ?? b.created_at)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <Badge tone="neutral">{BOOKING_LABEL[b.status] ?? b.status}</Badge>
                    <p className="mt-0.5 text-caption tabular-nums text-muted">{won(b.amount_krw)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* 후기 */}
        <Section title={`후기 (${fmt.format((reviews ?? []).length)})`}>
          {(reviews ?? []).length === 0 ? (
            <p className="text-body-sm text-faint">후기가 없어요.</p>
          ) : (
            <ul className="divide-y divide-line">
              {(reviews ?? []).map((r) => (
                <li key={r.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-body-sm font-medium text-fg">{userName.get(r.user_id) ?? "—"}</span>
                    <span className="text-caption text-brand">{"★".repeat(r.rating)}<span className="text-faint">{"★".repeat(5 - r.rating)}</span></span>
                  </div>
                  {r.body && <p className="mt-1 text-caption leading-relaxed text-fg/80">{r.body}</p>}
                  <p className="mt-0.5 text-[11px] text-faint">{when(r.created_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {/* 문의 */}
      <Section title={`문의 (${fmt.format((inquiries ?? []).length)})`} className="mt-4">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {[...inqByStatus.entries()].map(([s, n]) => (
            <span key={s} className="rounded-full bg-fg/[0.06] px-2.5 py-1 text-caption text-fg/70">
              {INQ_LABEL[s] ?? s} {n}
            </span>
          ))}
        </div>
        {(inquiries ?? []).length === 0 ? (
          <p className="text-body-sm text-faint">문의가 없어요.</p>
        ) : (
          <ul className="divide-y divide-line">
            {(inquiries ?? []).slice(0, 10).map((q) => (
              <li key={q.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-body-sm text-fg">{q.purpose}</p>
                  <p className="text-caption text-faint">희망일 {q.preferred_date} · 접수 {when(q.created_at)}</p>
                </div>
                <Badge tone="neutral">{INQ_LABEL[q.status] ?? q.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <p className="mt-6 text-caption text-faint">작가 ID {id}</p>
    </main>
  );
}

const INQ_LABEL: Record<string, string> = { new: "신규", contacted: "연락함", converted: "전환", closed: "종료" };

function maskAccount(n: string): string {
  if (n.length <= 4) return n;
  return n.slice(0, 3) + "****" + n.slice(-3);
}

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-surface p-5 ${className ?? ""}`}>
      <h2 className="mb-3 text-body-sm font-semibold text-fg">{title}</h2>
      {children}
    </section>
  );
}

function Row({ k, v, mono, accent }: { k: string; v: string; mono?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-body-sm">
      <span className="shrink-0 text-muted">{k}</span>
      <span className={`min-w-0 truncate text-right ${accent ? "font-semibold text-brand" : "text-fg"} ${mono ? "font-mono text-caption" : ""}`}>
        {v}
      </span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-3.5">
      <p className="text-title font-semibold tabular-nums text-fg">{value}</p>
      <p className="mt-0.5 text-caption text-muted">{label}</p>
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
