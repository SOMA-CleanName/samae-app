import { ConsentForm } from "./ConsentForm";

// 약관 동의 지면 본문 — 실제 라우트와 /dev/flow(샌드박스)가 **같은 것**을 그린다.
// page.tsx 안에 JSX 로 있던 걸 꺼냈다. 샌드박스가 베껴 적고 있었는데, 베낀 건 원본이
// 바뀌어도 안 따라온다 — 어긋난 쪽을 QA 하게 된다.
//
// ⚠️ 이 화면은 **두 사람**이 본다. 가입 중인 사람과, 약관 개정으로 재동의가 필요해진
//    기존 회원이다. 전에는 문구가 하나뿐이라 기존 회원에게도 "가입을 진행할 수 없어요"
//    라고 말했고, 동의를 거부하면 나갈 길도 없었다(2026-09-17 점검).
export function ConsentBody({
  next,
  termsVersion,
  displayName,
  revisit = false,
  action,
}: {
  next: string;
  termsVersion: string;
  displayName?: string | null;
  /** 이미 한 번 동의한 회원의 재동의인가 — 가입 중이면 false */
  revisit?: boolean;
  /** 샌드박스가 저장을 localStorage 로 돌릴 때만 넘긴다 */
  action?: (formData: FormData) => Promise<void>;
}) {
  return (
    <main className="mx-auto max-w-sm px-5 py-12 font-kr">
      <h1 className="text-2xl font-bold tracking-tight">
        {revisit ? "약관이 개정됐어요" : "약관에 동의해 주세요"}
      </h1>
      <p className="mt-2 text-sm text-muted">
        {displayName ? `${displayName}님, ` : ""}
        {revisit
          ? "서비스 이용약관과 개인정보 처리방침이 새로 확정됐어요. 바뀐 내용을 확인하고 다시 동의해 주셔야 계속 이용하실 수 있어요."
          : "사매를 이용하려면 아래 두 문서에 동의가 필요해요. 본문은 링크에서 읽을 수 있어요."}
      </p>
      <ConsentForm next={next} termsVersion={termsVersion} action={action} />

      {/* ⚠️ 가입 중인 사람에게는 **다른 데로 가는 길을 두지 않는다.** 전에는 "홈으로
          돌아가기" 가 있었는데, 동의를 안 한 채로 빠져나가는 문이 된다(2026-09-16 신고).
          본문은 ConsentForm 의 링크가 **읽기 전용 새 탭**으로 연다.

          재동의는 다르다. 이미 회원인 사람에게는 거부할 자유가 있고, 회원약관 부칙이
          "동의하지 않는 회원은 이용계약을 해지할 수 있다" 고 약속했다. 그 길을 막으면
          약관이 약속한 것을 화면이 부정하게 된다. */}
      {revisit ? (
        <p className="mt-6 text-xs leading-relaxed text-faint">
          동의하지 않으면 사매를 계속 이용하실 수 없어요. 이용을 끝내시려면{" "}
          <a href="/settings" className="underline underline-offset-2 hover:text-muted">
            설정에서 탈퇴
          </a>
          하실 수 있고, 진행 중인 예약이 있으면 그 예약이 끝난 뒤에 탈퇴가 가능해요.
        </p>
      ) : (
        <p className="mt-6 text-xs leading-relaxed text-faint">
          동의하지 않으면 가입을 진행할 수 없어요.
        </p>
      )}
    </main>
  );
}
