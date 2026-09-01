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
    <>
      {/* 작가 홈 — 누구에게 맡기는지 먼저 확인.
          섹션 껍데기(제목·구획선·간격)는 호출부의 DetailSection 이 맡는다. */}
      <Link
        href={`/photographers/${photographerId}`}
        className="group flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 transition-colors hover:bg-surface-2"
      >
        <Avatar src={avatarUrl} name="사진작가" size="md" />
        {/* 한 문장으로. "이 촬영을 진행하는" / "작가 홈 가기" 로 갈라 두 줄이었는데,
            한 문장이 중간에서 끊겨 두 개의 다른 말처럼 읽혔다. */}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-semibold text-fg">
            이 촬영을 진행하는 작가
          </span>
          <span className="mt-0.5 block text-[11px] text-muted">프로필과 다른 작업 보기</span>
        </span>
        <ChevronRightIcon className="h-4 w-4 shrink-0 text-faint transition-transform group-hover:translate-x-0.5" />
      </Link>
    </>
  );
}
