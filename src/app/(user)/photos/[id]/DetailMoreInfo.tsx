import Link from "next/link";
import { Avatar } from "@/components/ui";
import { ChevronRightIcon } from "@/components/user/icons";

// 작가 프로필 — 접지 않고 바로 보여준다.
//
// 원래는 "가격·CTA 먼저" 를 이유로 접어뒀는데, 접힌 패널은 열리지 않는다.
// 누구에게 맡기는지 확인하지 못한 채 [상담하기]를 누르게 하는 건 전환이 아니라 이탈이다.
//
// 작가의 글은 PackageInfoSection 으로 옮겼다 — 패키지 설명과 같은 이야기를 하는데
// 따로 떼어놓으면 두 번 읽게 된다.
export function DetailMoreInfo({
  photographerId,
  avatarUrl,
}: {
  photographerId: string;
  avatarUrl: string | null;
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
    </section>
  );
}
