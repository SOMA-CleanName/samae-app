import { ApplyLeadForm } from "./ApplyLeadForm";
import { ApplySubmitted } from "./ApplySubmitted";
import type { ApplyLeadState } from "./schema";

// /apply 의 두 지면 본문 — 실제 라우트와 /dev/flow(샌드박스)가 **같은 것**을 그린다.
//
// page.tsx 안에 JSX 로 있던 걸 꺼냈다. 샌드박스가 이 마크업을 베껴 적고 있었는데,
// 베낀 건 원본이 바뀌어도 안 따라온다 — **어긋난 쪽을 QA 하게 된다.**

/**
 * 승인 대기 — 신청해 둔 사람이 `/apply` 를 다시 열었을 때.
 *
 * ⚠️ **제출 직후 화면과 같은 것을 쓴다.** 전에는 둘이 달랐다 — 제출 직후엔 초록 배너,
 *    다시 열면 노란 카드. 같은 상태인데 두 번 다르게 보였다.
 *
 * 승인 전에는 스튜디오가 열리지 않는다(작가 행이 없어 프로필 탭에 [스튜디오]가 안 생긴다).
 * 그래서 이 지면이 뜨는 경우는 이 하나뿐이다.
 */
export function ApplyPendingBody({
  displayName,
  kakaoChannelUrl,
}: {
  displayName: string;
  kakaoChannelUrl: string;
}) {
  return (
    <main className="mx-auto max-w-lg px-5 py-12 font-kr">
      <p className="text-label uppercase tracking-wide text-brand">작가 신청</p>
      <ApplySubmitted displayName={displayName} kakaoChannelUrl={kakaoChannelUrl} />
    </main>
  );
}

/** 신청 폼 지면 */
export function ApplyFormBody({
  kakaoChannelUrl,
  defaultName,
  defaultPhone,
  action,
  children,
}: {
  kakaoChannelUrl: string;
  /** 가입 때 받아 둔 번호 — 다시 입력시키지 않는다 */
  defaultName?: string;
  defaultPhone?: string;
  /** 샌드박스가 저장을 localStorage 로 돌릴 때만 넘긴다 */
  action?: (prev: ApplyLeadState, formData: FormData) => Promise<ApplyLeadState>;
  /** 실제 라우트가 넣는 진입 트래킹(MpTrackOnce) — 샌드박스는 넣지 않는다 */
  children?: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-lg px-5 py-12 font-kr">
      {children}
      <p className="text-label uppercase tracking-wide text-brand">작가 신청</p>
      <h1 className="mt-2.5 text-h1 font-bold tracking-tight">신청서를 작성해 주세요</h1>
      <p className="mt-3 text-body leading-relaxed text-muted">
        운영자 검토 후 작가로 등록되면 사진이 지면에 노출되고 의뢰를 받을 수 있어요.
      </p>
      <ApplyLeadForm
        kakaoChannelUrl={kakaoChannelUrl}
        defaultName={defaultName}
        defaultPhone={defaultPhone}
        action={action}
      />
    </main>
  );
}
