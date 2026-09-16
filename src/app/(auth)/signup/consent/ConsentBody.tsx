import { ConsentForm } from "./ConsentForm";

// 약관 동의 지면 본문 — 실제 라우트와 /dev/flow(샌드박스)가 **같은 것**을 그린다.
// page.tsx 안에 JSX 로 있던 걸 꺼냈다. 샌드박스가 베껴 적고 있었는데, 베낀 건 원본이
// 바뀌어도 안 따라온다 — 어긋난 쪽을 QA 하게 된다.
export function ConsentBody({
  next,
  termsVersion,
  displayName,
  action,
}: {
  next: string;
  termsVersion: string;
  displayName?: string | null;
  /** 샌드박스가 저장을 localStorage 로 돌릴 때만 넘긴다 */
  action?: (formData: FormData) => Promise<void>;
}) {
  return (
    <main className="mx-auto max-w-sm px-5 py-12 font-kr">
      <h1 className="text-2xl font-bold tracking-tight">약관에 동의해 주세요</h1>
      <p className="mt-2 text-sm text-muted">
        {displayName ? `${displayName}님, ` : ""}사매를 이용하려면 아래 두 문서에 동의가 필요해요.
        본문은 링크에서 읽을 수 있어요.
      </p>
      <ConsentForm next={next} termsVersion={termsVersion} action={action} />
      {/* ⚠️ 여기에 **다른 데로 가는 길을 두지 않는다.** 전에는 "홈으로 돌아가기" 가 있었는데,
          동의를 안 한 채로 빠져나가는 문이 된다. 동의 없이는 어차피 아무것도 못 하므로
          그 링크는 사용자를 도와주지 않고 흐름만 끊는다(2026-09-16 신고).
          본문은 ConsentForm 의 링크가 **읽기 전용 새 탭**으로 연다. */}
      <p className="mt-6 text-xs leading-relaxed text-faint">
        동의하지 않으면 가입을 진행할 수 없어요.
      </p>
    </main>
  );
}
