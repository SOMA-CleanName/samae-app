import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { updateDisplayName } from "./actions";
import { AvatarUploader } from "./AvatarUploader";

export const dynamic = "force-dynamic";

// 계정 설정 — 닉네임·아바타 (1차)
export default async function SettingsPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/settings");

  const fallback = (me.displayName || me.email || "?").trim().charAt(0).toUpperCase();

  return (
    <main className="mx-auto max-w-lg px-4 sm:px-6 py-8 font-kr">
      <h1 className="text-2xl font-semibold">계정 설정</h1>
      <p className="mt-1 text-sm text-fg/50">채팅·예약에 표시되는 이름과 프로필 사진이에요.</p>

      {/* 아바타 */}
      <section className="mt-6">
        <p className="text-sm font-medium">프로필 사진</p>
        <div className="mt-3">
          <AvatarUploader initialUrl={me.avatarUrl} fallback={fallback} />
        </div>
      </section>

      {/* 닉네임 */}
      <section className="mt-8">
        <form action={updateDisplayName}>
          <label className="text-sm font-medium" htmlFor="displayName">
            닉네임
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id="displayName"
              name="displayName"
              defaultValue={me.displayName ?? ""}
              maxLength={30}
              required
              placeholder="표시할 이름"
              className="flex-1 rounded-xl border border-fg/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-fg/40"
            />
            <button className="shrink-0 rounded-xl bg-fg px-5 py-2.5 text-sm font-semibold text-bg hover:opacity-90">
              저장
            </button>
          </div>
        </form>
      </section>

      <p className="mt-8 text-xs text-fg/40">
        작가 활동용 공개 이름·소개는 스튜디오 → 프로필에서 따로 관리해요.
      </p>
    </main>
  );
}
