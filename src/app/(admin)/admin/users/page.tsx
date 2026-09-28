import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Avatar, Badge, EmptyState } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { UserIcon, SearchIcon } from "@/components/user/icons";
import { cn } from "@/lib/cn";
import { setUserRole, setUserBan } from "./actions";
import { termsStatus } from "@/lib/terms-status";

export const dynamic = "force-dynamic";

// 역할 구분 탭 — 배타 분류(운영자 > 작가 > 회원). 한 명은 한 탭에만.
const ROLE_TABS = [
  { key: "all", label: "전체" },
  { key: "user", label: "회원" },
  { key: "photographer", label: "작가" },
  { key: "admin", label: "운영자" },
] as const;
type TabKey = (typeof ROLE_TABS)[number]["key"];

function categoryOf(m: { role: string; isPhotographer: boolean }): "admin" | "photographer" | "user" {
  if (m.role === "admin") return "admin";
  if (m.isPhotographer) return "photographer";
  return "user";
}

type Member = {
  id: string;
  email: string | null;
  role: "user" | "admin";
  displayName: string | null;
  avatarUrl: string | null;
  provider: string;
  isPhotographer: boolean;
  banned: boolean;
  createdAt: string;
  // ── 펼쳤을 때 보이는 것 (2026-09-21 추가) ──
  lastSignInAt: string | null;
  emailConfirmed: boolean;
  phone: string | null;
  contactEmail: string | null;
  instagramId: string | null;
  kakaoId: string | null;
  extraContact: string | null;
  termsAgreedAt: string | null;
  termsVersion: string | null;
  counts: { bookings: number; favorites: number; reviews: number; support: number; chats: number };
};

function when(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "2-digit",
    month: "numeric",
    day: "numeric",
    timeZone: "Asia/Seoul",
  }).format(new Date(iso));
}

/** 분 단위까지 — "마지막 로그인" 은 날짜만으로는 활성 여부를 못 읽는다 */
function whenTime(iso: string | null): string {
  if (!iso) return "기록 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "2-digit",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(new Date(iso));
}

/** 며칠 지났나 — 휴면 판단은 절대 날짜보다 경과일이 빠르다 */
function daysAgo(iso: string | null): string {
  if (!iso) return "";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? "오늘" : `${d}일 전`;
}

/** 행 하나를 세는 헬퍼 — 관련 표가 작아 전부 받아 JS 로 센다(어드민 전반과 같은 방식) */
function countBy(rows: { [k: string]: unknown }[] | null, key: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows ?? []) {
    const k = r[key] as string;
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

// 회원 관리 — auth.users(이메일·정지) + profiles(역할) 머지. 가드는 (admin)/layout.
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; tab?: string }>;
}) {
  const me = await getCurrentUser();
  const sp = (await searchParams) ?? {};
  const q = (sp.q ?? "").trim().toLowerCase();
  const tab: TabKey = (ROLE_TABS.find((t) => t.key === sp.tab)?.key ?? "all") as TabKey;
  const admin = createAdminClient();

  // auth 사용자(이메일·정지·가입일·provider) + profiles(역할·이름·아바타) + 작가 여부
  const [
    { data: authData },
    { data: profiles },
    { data: photographers },
    { data: bookingRows },
    { data: favRows },
    { data: reviewRows },
    { data: supportRows },
    { data: chatRows },
  ] = await Promise.all([
    admin.auth.admin.listUsers({ perPage: 1000 }),
    // 연락처·약관 동의까지 — 펼침 상세가 쓴다
    admin
      .from("profiles")
      .select(
        "id, role, display_name, avatar_url, phone, contact_email, instagram_id, kakao_id, extra_contact, terms_agreed_at, terms_version"
      ),
    admin.from("photographers").select("profile_id"),
    // 활동 집계 — 표가 작아 전부 받아 JS 로 센다(어드민 전반과 같은 방식)
    admin.from("bookings").select("user_id"),
    admin.from("favorites").select("user_id"),
    admin.from("reviews").select("user_id"),
    admin.from("support_requests").select("requester_id"),
    admin.from("conversations").select("user_id"),
  ]);

  const profById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const photoSet = new Set((photographers ?? []).map((p) => p.profile_id as string));
  const nBooking = countBy(bookingRows, "user_id");
  const nFav = countBy(favRows, "user_id");
  const nReview = countBy(reviewRows, "user_id");
  const nSupport = countBy(supportRows, "requester_id");
  const nChat = countBy(chatRows, "user_id");

  let members: Member[] = (authData?.users ?? []).map((u) => {
    const p = profById.get(u.id);
    return {
      id: u.id,
      email: u.email ?? null,
      role: (p?.role as "user" | "admin") ?? "user",
      displayName: (p?.display_name as string | null) ?? null,
      avatarUrl: (p?.avatar_url as string | null) ?? null,
      provider: u.app_metadata?.provider ?? "email",
      isPhotographer: photoSet.has(u.id),
      banned: !!(u as { banned_until?: string }).banned_until,
      createdAt: u.created_at,
      lastSignInAt: (u as { last_sign_in_at?: string | null }).last_sign_in_at ?? null,
      emailConfirmed: !!(u as { email_confirmed_at?: string | null }).email_confirmed_at,
      phone: (p?.phone as string | null) ?? null,
      contactEmail: (p?.contact_email as string | null) ?? null,
      instagramId: (p?.instagram_id as string | null) ?? null,
      kakaoId: (p?.kakao_id as string | null) ?? null,
      extraContact: (p?.extra_contact as string | null) ?? null,
      termsAgreedAt: (p?.terms_agreed_at as string | null) ?? null,
      termsVersion: (p?.terms_version as string | null) ?? null,
      counts: {
        bookings: nBooking.get(u.id) ?? 0,
        favorites: nFav.get(u.id) ?? 0,
        reviews: nReview.get(u.id) ?? 0,
        support: nSupport.get(u.id) ?? 0,
        chats: nChat.get(u.id) ?? 0,
      },
    };
  });

  // 검색 (이메일·이름)
  if (q) {
    members = members.filter(
      (m) =>
        (m.email ?? "").toLowerCase().includes(q) ||
        (m.displayName ?? "").toLowerCase().includes(q)
    );
  }
  // 최신 가입 우선
  members.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  // 역할별 카운트(검색 반영) + 탭 필터
  const count = {
    all: members.length,
    user: members.filter((m) => categoryOf(m) === "user").length,
    photographer: members.filter((m) => categoryOf(m) === "photographer").length,
    admin: members.filter((m) => categoryOf(m) === "admin").length,
  };
  const shown = tab === "all" ? members : members.filter((m) => categoryOf(m) === tab);
  const tabHref = (key: TabKey) => `/admin/users?tab=${key}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
      <h1 className="text-h1 font-semibold">회원 관리</h1>
      <p className="mt-1 text-body-sm text-muted">
        전체 {count.all}명 · 회원 {count.user} · 작가 {count.photographer} · 운영자 {count.admin}
      </p>

      {/* 검색 (GET) — 현재 탭 유지 */}
      <form className="mt-5 flex items-center gap-2 rounded-xl border border-line-strong bg-surface px-3.5 py-2.5">
        <input type="hidden" name="tab" value={tab} />
        <SearchIcon className="h-4 w-4 shrink-0 text-faint" />
        <input
          name="q"
          defaultValue={q}
          placeholder="이메일·이름 검색"
          className="min-w-0 flex-1 bg-transparent text-body-sm outline-none"
        />
        <button className="shrink-0 cursor-pointer rounded-lg bg-fg px-3 py-1 text-caption font-semibold text-bg">
          검색
        </button>
      </form>

      {/* 역할 구분 탭 */}
      <nav className="mt-4 flex gap-1 overflow-x-auto border-b border-line">
        {ROLE_TABS.map((t) => (
          <Link
            key={t.key}
            href={tabHref(t.key)}
            className={cn(
              "shrink-0 border-b-2 px-3.5 py-2 text-body-sm font-medium transition-colors",
              t.key === tab ? "border-brand text-brand-ink" : "border-transparent text-muted hover:text-fg"
            )}
          >
            {t.label} <span className="tabular-nums opacity-70">{count[t.key]}</span>
          </Link>
        ))}
      </nav>

      {shown.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<UserIcon className="h-7 w-7" />}
          title={q ? "검색 결과가 없어요" : "해당하는 회원이 없어요"}
        />
      ) : (
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {shown.map((m) => {
            const terms = termsStatus({ terms_agreed_at: m.termsAgreedAt, terms_version: m.termsVersion });
            const c = m.counts;
            return (
              <li key={m.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <Avatar src={m.avatarUrl} name={m.displayName || m.email} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-body-sm font-semibold text-fg">
                        {m.displayName || "이름 없음"}
                      </p>
                      {m.id === me?.id && <span className="shrink-0 text-caption text-brand-ink">나</span>}
                    </div>
                    <p className="truncate text-caption text-faint">{m.email ?? "이메일 없음"}</p>
                  </div>

                  {/* 배지들 — 접힌 줄에서도 약관 상태는 보여야 한다. 재동의를 요청해 둔
                      상태에서 "누가 아직인가" 가 펼쳐야만 보이면 셀 수가 없다. */}
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge tone={terms.tone}>{`약관 ${terms.label}`}</Badge>
                    {m.isPhotographer && <Badge tone="info">작가</Badge>}
                    {m.role === "admin" && <Badge tone="brand">운영자</Badge>}
                    {m.banned && <Badge tone="danger">정지</Badge>}
                    <span className="hidden text-caption text-faint sm:inline">
                      {daysAgo(m.lastSignInAt) || when(m.createdAt)}
                    </span>
                  </div>

                  {/* 액션 — 본인은 보호 */}
                  {m.id !== me?.id && (
                    <div className="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto">
                      <RoleButton id={m.id} role={m.role} />
                      <BanButton id={m.id} banned={m.banned} />
                    </div>
                  )}
                </div>

                {/* 상세 — 접어 둔다. 한 줄에 다 밀어 넣으면 목록으로서 못 읽는다. */}
                <details className="mt-2 group">
                  <summary className="cursor-pointer list-none text-caption text-muted transition-colors hover:text-fg">
                    자세히 <span className="group-open:hidden">▾</span><span className="hidden group-open:inline">▴</span>
                  </summary>
                  <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-3 rounded-xl bg-fg/[0.03] p-3.5 sm:grid-cols-3">
                    <Detail title="계정">
                      <Row k="가입" v={when(m.createdAt)} />
                      <Row k="최근 로그인" v={`${whenTime(m.lastSignInAt)}${m.lastSignInAt ? ` (${daysAgo(m.lastSignInAt)})` : ""}`} />
                      <Row k="로그인 수단" v={m.provider} />
                      <Row k="이메일 인증" v={m.emailConfirmed ? "완료" : "안 됨"} warn={!m.emailConfirmed} />
                      <Row k="계정 ID" v={m.id} mono />
                    </Detail>

                    {/* ⚠️ 연락처는 운영 응대용이다. 작가에게 공개되는 값이 아니다
                        (연락처 전달은 예약 확정 뒤 작가→고객 단방향, docs/32 §3-3). */}
                    <Detail title="연락처">
                      <Row k="전화" v={m.phone || "없음"} />
                      <Row k="이메일" v={m.contactEmail || m.email || "없음"} />
                      <Row k="카카오" v={m.kakaoId || "없음"} />
                      <Row k="인스타" v={m.instagramId || "없음"} />
                      {m.extraContact && <Row k="기타" v={m.extraContact} />}
                    </Detail>

                    <Detail title="약관 · 활동">
                      <Row
                        k="약관 동의"
                        v={m.termsAgreedAt ? `${whenTime(m.termsAgreedAt)} · v${m.termsVersion ?? "?"}` : "안 함"}
                        warn={terms.state !== "current"}
                      />
                      <Row k="예약" v={`${c.bookings}건`} />
                      <Row k="대화" v={`${c.chats}개`} />
                      <Row k="찜" v={`${c.favorites}개`} />
                      <Row k="후기" v={`${c.reviews}건`} />
                      <Row k="사매 문의" v={`${c.support}건`} warn={c.support > 0} />
                    </Detail>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function Detail({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-faint">{title}</p>
      <dl className="flex flex-col gap-0.5">{children}</dl>
    </div>
  );
}

function Row({ k, v, mono, warn }: { k: string; v: string; mono?: boolean; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-caption">
      <dt className="shrink-0 text-muted">{k}</dt>
      <dd className={`min-w-0 truncate text-right ${warn ? "font-medium text-warning-ink" : "text-fg"} ${mono ? "font-mono text-[10px]" : ""}`}>
        {v}
      </dd>
    </div>
  );
}

// 역할 토글
function RoleButton({ id, role }: { id: string; role: "user" | "admin" }) {
  const next = role === "admin" ? "user" : "admin";
  return (
    <form action={setUserRole}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="role" value={next} />
      <SubmitButton pendingText="처리 중…" className="shrink-0 cursor-pointer rounded-full border border-line-strong px-3 py-1 text-caption font-medium text-muted transition-colors hover:bg-fg/[0.04] disabled:opacity-50">
        {role === "admin" ? "운영자 해제" : "운영자 지정"}
      </SubmitButton>
    </form>
  );
}

// 정지 토글
function BanButton({ id, banned }: { id: string; banned: boolean }) {
  return (
    <form action={setUserBan}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="ban" value={banned ? "0" : "1"} />
      <SubmitButton
        pendingText="처리 중…"
        className={
          "shrink-0 cursor-pointer rounded-full px-3 py-1 text-caption font-medium transition-colors disabled:opacity-50 " +
          (banned
            ? "bg-fg/[0.06] text-fg hover:bg-fg/10"
            : "border border-line-strong text-danger-ink hover:bg-danger-soft")
        }
      >
        {banned ? "정지 해제" : "정지"}
      </SubmitButton>
    </form>
  );
}
