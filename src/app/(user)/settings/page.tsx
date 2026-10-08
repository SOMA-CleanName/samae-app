import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { updateDisplayName, updateMarketingConsent } from "./actions";
import { submitSupportRequest } from "@/app/actions/support";
import { AvatarUploader } from "./AvatarUploader";
import { DeleteAccount } from "./DeleteAccount";
import { loadPhoneConsentState, maskPhone } from "@/lib/phone-consent";
import { createClient } from "@/lib/supabase/server";
import { KakaoPhoneConsentButton } from "@/components/user/KakaoPhoneConsentButton";

export const dynamic = "force-dynamic";

// 로그인해야 쓰는 지면이라 색인 대상이 아니다.
// ⚠️ robots.txt 로 막는 것만으로는 **색인에서 빠지지 않는다** — 크롤러가 못 들어오면
//    noindex 를 읽을 수도 없어서 구글은 주소만 들고 색인해 버린다
//    ("색인이 생성되었으나 robots.txt에 의해 차단됨", 2026-09-21 GSC 경고).
//    그래서 noindex 를 내고, robots.txt 에서는 이 경로를 뺐다(src/app/robots.ts).
export const metadata: Metadata = { robots: { index: false, follow: false } };

// 계정 설정 — 닉네임·아바타 + 알림 연락처
export default async function SettingsPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/settings");

  const fallback = (me.displayName || me.email || "?").trim().charAt(0).toUpperCase();
  // 채팅방 배너를 접었거나 놓친 사람이 "언제든" 돌아올 수 있는 자리
  const phoneConsent = await loadPhoneConsentState();
  // 광고성 정보 수신 동의 — 현재 값을 그대로 체크박스에 반영한다(끈 사람에게 켜진 걸 보여주면 안 된다)
  const { data: consentRow } = await (await createClient())
    .from("profiles")
    .select("marketing_consent")
    .eq("id", me.id)
    .maybeSingle();
  const marketingOn = consentRow?.marketing_consent === true;

  return (
    <main className="mx-auto max-w-lg px-3.5 sm:px-5 py-8 font-kr">
      <h1 className="text-2xl font-semibold">계정 설정</h1>
      <p className="mt-1 text-sm text-muted">채팅·예약에 표시되는 이름과 프로필 사진이에요.</p>

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
            className="mt-2 w-full rounded-xl border border-fg/15 bg-surface px-3 py-2.5 text-sm outline-none focus:border-fg/40"
          />
          <button className="mt-3 w-full rounded-xl bg-fg py-3 text-sm font-semibold text-bg hover:opacity-90">
            변경 사항 저장
          </button>
        </form>
      </section>

      {/* 알림 연락처 — 번호가 없으면 알림톡·문자가 한 통도 안 나간다.
          채팅방 배너를 접은 사람이 다시 찾아올 수 있는 상시 경로다. */}
      <section className="mt-8">
        <p className="text-sm font-medium">알림 받을 연락처</p>
        {phoneConsent.hasPhone ? (
          <div className="mt-2 flex items-center justify-between rounded-xl border border-fg/15 px-3 py-2.5">
            <span className="text-sm tabular-nums">{maskPhone(phoneConsent.phone!)}</span>
            <span className="text-xs text-success">알림 받는 중</span>
          </div>
        ) : (
          <div className="mt-2 rounded-xl border border-fg/15 bg-brand/[0.05] p-3">
            <p className="text-xs leading-relaxed text-fg/60">
              연락처가 없어서 <strong className="font-semibold text-fg">답장·예약 알림을 받지 못하고 있어요.</strong>
              <br />
              등록하면 카카오톡으로 알려드려요. 광고는 보내지 않아요.
            </p>
            <div className="mt-3">
              {phoneConsent.canAskKakao ? (
                <KakaoPhoneConsentButton next="/settings" context="settings" />
              ) : (
                <Link
                  href="/signup/contact?next=/settings"
                  className="block w-full rounded-xl bg-fg py-3 text-center text-sm font-semibold text-bg transition-opacity hover:opacity-90"
                >
                  번호 인증하기
                </Link>
              )}
            </div>
          </div>
        )}
      </section>

      <p className="mt-8 text-xs text-faint">
        작가 활동용 공개 이름·소개는 스튜디오 → 프로필에서 따로 관리해요.
      </p>

      {/*
        광고성 정보 수신 — 정보통신망법 §50. 동의도 철회도 여기서 한다(제4항: 철회는 언제든 쉬워야 한다).
        ⚠️ 예약·입금 같은 **거래 안내는 여기와 무관하다.** 그걸 같이 끄는 줄 알면 끌 사람도 안 끈다.
      */}
      <section className="mt-8 border-t border-fg/10 pt-6">
        <p className="text-sm font-medium">이벤트·혜택 소식</p>
        <form action={updateMarketingConsent} className="mt-3">
          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              name="marketing"
              defaultChecked={marketingOn}
              className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
            />
            <span className="text-sm leading-relaxed text-fg">
              이벤트·혜택 소식을 받아볼래요
              <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                예약·입금·정산 같은 <b className="text-fg/80">거래 안내는 이 설정과 상관없이</b> 보내드려요.
                끄면 광고성 소식만 멈춰요.
              </span>
            </span>
          </label>
          <button
            type="submit"
            className="mt-3 cursor-pointer rounded-full border border-fg/15 px-4 py-2 text-xs font-semibold text-fg transition-colors hover:bg-fg/5"
          >
            저장
          </button>
        </form>
        <p className="mt-2 text-xs text-faint">
          {marketingOn ? "지금은 받는 중이에요." : "지금은 받지 않고 있어요."}
        </p>
      </section>

      {/* 약관 — 회원약관 3조: 게시된 문서를 언제든 찾아볼 수 있어야 한다 */}
      <section className="mt-8 border-t border-fg/10 pt-6">
        <p className="text-sm font-medium">약관과 정책</p>
        <ul className="mt-2 flex flex-col gap-1.5 text-sm text-fg/70">
          <li><Link href="/terms" className="underline underline-offset-2">회원 이용약관</Link></li>
          <li><Link href="/terms/refund" className="underline underline-offset-2">취소·환불 정책</Link></li>
          <li><Link href="/privacy" className="underline underline-offset-2">개인정보 처리방침</Link></li>
          {me.photographer && (
            <>
              <li><Link href="/terms/photographer" className="underline underline-offset-2">작가 이용약관</Link></li>
              <li><Link href="/terms/photographer-contract" className="underline underline-offset-2">작가 입점 동의서</Link></li>
            </>
          )}
        </ul>
      </section>

      {/* 개인정보 요청 — 처리방침 6조가 약속한 "문의처".
          ⚠️ **탈퇴 위에 둔다.** 삭제만 길이 있으면 "정정하고 싶을 뿐인데" 도 탈퇴로 간다.
             열람·정정·처리정지는 계정을 지우지 않고 할 수 있다는 걸 먼저 보여준다. */}
      <section className="mt-10 border-t border-fg/10 pt-6">
        <p className="text-sm font-medium">내 개인정보</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          내 정보를 <b className="text-fg/80">열람·수정·삭제</b>하거나 <b className="text-fg/80">처리를 멈춰</b>달라고
          요청할 수 있어요. 본인 확인 뒤 처리하고 결과를 알려드려요.{" "}
          <Link href="/privacy" className="underline underline-offset-2">개인정보 처리방침</Link>
        </p>
        <form action={submitSupportRequest} className="mt-3 flex flex-col gap-2">
          <input type="hidden" name="kind" value="privacy" />
          <textarea
            name="body"
            required
            rows={3}
            maxLength={1000}
            placeholder="무엇을 요청하시나요? (예: 가입할 때 넣은 전화번호를 지워주세요)"
            aria-label="개인정보 요청 내용"
            className="w-full rounded-xl border border-fg/15 bg-bg px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-fg/35"
          />
          <button className="self-start cursor-pointer rounded-xl border border-fg/15 px-4 py-2 text-sm font-medium transition-colors hover:bg-fg/[0.04]">
            요청 보내기
          </button>
        </form>
      </section>

      {/* 회원 탈퇴 */}
      <section className="mt-10 border-t border-fg/10 pt-6">
        <p className="text-sm font-medium">회원 탈퇴</p>
        <p className="mt-1 text-xs text-muted">
          계정과 대화·예약·찜·후기 등 모든 데이터가 삭제되며 되돌릴 수 없어요. 진행 중인 문의나 예약,
          정산이 끝나지 않은 건이 있으면 마무리한 뒤에 탈퇴할 수 있어요.
        </p>
        <div className="mt-3">
          <DeleteAccount />
        </div>
      </section>
    </main>
  );
}
