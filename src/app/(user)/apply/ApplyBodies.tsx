import Link from "next/link";
import { ApplyLeadForm } from "./ApplyLeadForm";
import type { ApplyLeadState } from "./schema";

// /apply 의 두 지면 본문 — 실제 라우트와 /dev/flow(샌드박스)가 **같은 것**을 그린다.
//
// page.tsx 안에 JSX 로 있던 걸 꺼냈다. 샌드박스가 이 마크업을 베껴 적고 있었는데,
// 베낀 건 원본이 바뀌어도 안 따라온다 — **어긋난 쪽을 QA 하게 된다.**

/** 승인 대기 — 처리 전(new·contacted) 신청이 있을 때 */
export function ApplyPendingBody({ displayName }: { displayName: string }) {
  return (
    <main className="mx-auto max-w-lg px-3.5 py-10 font-kr sm:px-5">
      <h1 className="text-2xl font-semibold">작가 신청</h1>
      <div className="mt-6 rounded-2xl border border-warning/20 bg-warning-soft p-6">
        <p className="text-base font-semibold">승인 대기 중이에요</p>
        <p className="mt-1.5 text-sm text-fg/65">
          운영자 검토 후 안내드려요. 보통 영업일 기준 1~2일 소요됩니다.
        </p>
        <p className="mt-3 text-xs text-faint">신청 작가명: {displayName}</p>
      </div>
      <Link href="/" className="mt-6 inline-block text-sm text-muted hover:text-fg">
        ← 홈으로
      </Link>
    </main>
  );
}

/** 신청 폼 지면 */
export function ApplyFormBody({
  kakaoChannelUrl,
  action,
  children,
}: {
  kakaoChannelUrl: string;
  /** 샌드박스가 저장을 localStorage 로 돌릴 때만 넘긴다 */
  action?: (prev: ApplyLeadState, formData: FormData) => Promise<ApplyLeadState>;
  /** 실제 라우트가 넣는 진입 트래킹(MpTrackOnce) — 샌드박스는 넣지 않는다 */
  children?: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-lg px-3.5 py-10 font-kr sm:px-5">
      {children}
      <h1 className="text-2xl font-semibold">작가 신청</h1>
      <p className="mt-2 text-sm text-fg/60">
        아래 정보를 남기고 신청하면, 운영자 검토 후 작가로 등록돼 사진이 지면에 노출되고 의뢰를 받을 수 있어요.
      </p>
      <ApplyLeadForm kakaoChannelUrl={kakaoChannelUrl} action={action} />
    </main>
  );
}
