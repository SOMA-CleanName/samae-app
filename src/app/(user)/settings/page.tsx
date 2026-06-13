import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { updateDisplayName } from "./actions";
import { AvatarUploader } from "./AvatarUploader";
import { DeleteAccount } from "./DeleteAccount";

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
          <input
            id="displayName"
            name="displayName"
            defaultValue={me.displayName ?? ""}
            maxLength={30}
            required
            placeholder="표시할 이름"
            className="mt-2 w-full rounded-xl border border-fg/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-fg/40"
          />
          <button className="mt-3 w-full rounded-xl bg-fg py-3 text-sm font-semibold text-bg hover:opacity-90">
            변경 사항 저장
          </button>
        </form>
      </section>

      <p className="mt-8 text-xs text-fg/40">
        작가 활동용 공개 이름·소개는 스튜디오 → 프로필에서 따로 관리해요.
      </p>

      {/* 회원 탈퇴 */}
      <section className="mt-10 border-t border-fg/10 pt-6">
        <p className="text-sm font-medium">회원 탈퇴</p>
        <p className="mt-1 text-xs text-fg/50">
          계정과 대화·예약·찜·후기 등 모든 데이터가 삭제되며 되돌릴 수 없어요. 진행 중인 예약이
          있으면 마무리한 뒤에 탈퇴할 수 있어요.
        </p>
        <div className="mt-3">
          <DeleteAccount />
        </div>
      </section>
    </main>
  );
}
