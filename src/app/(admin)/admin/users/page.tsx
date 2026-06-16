import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Avatar, Badge, EmptyState } from "@/components/ui";
import { UserIcon, SearchIcon } from "@/components/user/icons";
import { setUserRole, setUserBan } from "./actions";

export const dynamic = "force-dynamic";

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
};

function when(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "2-digit",
    month: "numeric",
    day: "numeric",
    timeZone: "Asia/Seoul",
  }).format(new Date(iso));
}

// 회원 관리 — auth.users(이메일·정지) + profiles(역할) 머지. 가드는 (admin)/layout.
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>;
}) {
  const me = await getCurrentUser();
  const q = ((await searchParams)?.q ?? "").trim().toLowerCase();
  const admin = createAdminClient();

  // auth 사용자(이메일·정지·가입일·provider) + profiles(역할·이름·아바타) + 작가 여부
  const [{ data: authData }, { data: profiles }, { data: photographers }] = await Promise.all([
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin.from("profiles").select("id, role, display_name, avatar_url"),
    admin.from("photographers").select("profile_id"),
  ]);

  const profById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const photoSet = new Set((photographers ?? []).map((p) => p.profile_id as string));

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

  const adminCount = members.filter((m) => m.role === "admin").length;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
      <h1 className="text-h1 font-semibold">회원 관리</h1>
      <p className="mt-1 text-body-sm text-muted">
        전체 {members.length}명 · 운영자 {adminCount}명
      </p>

      {/* 검색 (GET) */}
      <form className="mt-5 flex items-center gap-2 rounded-xl border border-line-strong bg-surface px-3.5 py-2.5">
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

      {members.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<UserIcon className="h-7 w-7" />}
          title={q ? "검색 결과가 없어요" : "회원이 없어요"}
        />
      ) : (
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
              <Avatar src={m.avatarUrl} name={m.displayName || m.email} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-body-sm font-semibold text-fg">
                    {m.displayName || "이름 없음"}
                  </p>
                  {m.id === me?.id && <span className="shrink-0 text-caption text-brand">나</span>}
                </div>
                <p className="truncate text-caption text-faint">{m.email ?? "이메일 없음"}</p>
              </div>

              {/* 배지들 */}
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="text-caption text-faint">{m.provider}</span>
                {m.isPhotographer && <Badge tone="info">작가</Badge>}
                {m.role === "admin" && <Badge tone="brand">운영자</Badge>}
                {m.banned && <Badge tone="danger">정지</Badge>}
                <span className="hidden text-caption text-faint sm:inline">{when(m.createdAt)}</span>
              </div>

              {/* 액션 — 본인은 보호 */}
              {m.id !== me?.id && (
                <div className="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto">
                  <RoleButton id={m.id} role={m.role} />
                  <BanButton id={m.id} banned={m.banned} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

// 역할 토글
function RoleButton({ id, role }: { id: string; role: "user" | "admin" }) {
  const next = role === "admin" ? "user" : "admin";
  return (
    <form action={setUserRole}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="role" value={next} />
      <button className="shrink-0 cursor-pointer rounded-full border border-line-strong px-3 py-1 text-caption font-medium text-muted transition-colors hover:bg-fg/[0.04]">
        {role === "admin" ? "운영자 해제" : "운영자 지정"}
      </button>
    </form>
  );
}

// 정지 토글
function BanButton({ id, banned }: { id: string; banned: boolean }) {
  return (
    <form action={setUserBan}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="ban" value={banned ? "0" : "1"} />
      <button
        className={
          "shrink-0 cursor-pointer rounded-full px-3 py-1 text-caption font-medium transition-colors " +
          (banned
            ? "bg-fg/[0.06] text-fg hover:bg-fg/10"
            : "border border-line-strong text-danger hover:bg-danger-soft")
        }
      >
        {banned ? "정지 해제" : "정지"}
      </button>
    </form>
  );
}
