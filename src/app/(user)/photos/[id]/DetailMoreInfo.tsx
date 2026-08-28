import Link from "next/link";
import { Avatar } from "@/components/ui";
import { ChevronRightIcon } from "@/components/user/icons";

// 작가 프로필·작가 글 — 접지 않고 바로 보여준다.
//
// 원래는 "가격·CTA 먼저" 를 이유로 접어뒀는데, 접힌 패널은 열리지 않는다.
// 누구에게 맡기는지 확인하지 못한 채 [상담하기]를 누르게 하는 건 전환이 아니라 이탈이다.
// (패키지 정보는 PackageInfoSection 이 담당 — 여기서 중복 노출 금지)
//
// 상태가 없어져 서버 컴포넌트로 내려왔다.
export function DetailMoreInfo({
  photographerId,
  avatarUrl,
  caption,
}: {
  photographerId: string;
  avatarUrl: string | null;
  caption: string | null;
}) {
  return (
    <section className="mt-5">
      <h2 className="mb-2.5 text-base font-semibold text-fg">작가 정보</h2>

      {/* 작가 홈 — 누구에게 맡기는지 먼저 확인 */}
      <Link
        href={`/photographers/${photographerId}`}
        className="group flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 transition-colors hover:bg-surface-2"
      >
        <Avatar src={avatarUrl} name="사진작가" size="md" />
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] text-muted">이 촬영을 진행하는</span>
          <span className="mt-0.5 block truncate text-body font-semibold text-fg">작가 홈 가기</span>
        </span>
        <ChevronRightIcon className="h-4 w-4 shrink-0 text-faint transition-transform group-hover:translate-x-0.5" />
      </Link>

      {caption && (
        <div className="mt-2.5 rounded-2xl border border-line bg-surface p-4">
          {/* 패키지 설명은 위 섹션으로 갔다 — 여기 글은 이 사진에 대한 작가의 코멘트 */}
          <p className="text-[11px] font-medium text-brand">작가의 글</p>
          <p className="mt-2 whitespace-pre-wrap text-body leading-relaxed text-fg/80">{caption}</p>
        </div>
      )}
    </section>
  );
}
