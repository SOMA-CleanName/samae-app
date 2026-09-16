import Link from "next/link";
import { Avatar } from "@/components/ui";
import { BackButton } from "@/app/(user)/chat/[conversationId]/BackButton";

// 채팅방의 껍데기 — 고정 높이 컬럼 + 헤더.
//
// 뷰포트 전체를 채우는 고정 높이 컬럼을 쓴다. 채팅방은 모바일 하단 탭바가 숨겨지므로(몰입형)
// 풀 dvh 를 쓰고 부모의 pb-24 만 상쇄한다. 내부에서 메시지 리스트만 스크롤해서,
// 진입할 때 윈도우가 통째로 밀리지 않는다.
//
// 페이지에서 떼어낸 이유는 하나다: QA 샌드박스(/dev/chat)가 **같은 껍데기**를 써야 해서다.
// 베껴 두면 실제와 다른 좌표를 QA 하게 된다.

export function ChatShell({
  title,
  titleAvatar,
  /** 고객이 보는 방이면 작가 프로필로 — 작가가 보는 방이면 null */
  headerHref,
  /** 헤더 오른쪽 (촬영 안내·예약 제안) */
  headerActions,
  /** 헤더 바로 아래 배너 (전화번호 동의 등) */
  banner,
  children,
}: {
  title: string;
  titleAvatar?: string | null;
  headerHref?: string | null;
  headerActions?: React.ReactNode;
  banner?: React.ReactNode;
  children: React.ReactNode;
}) {
  const name = (
    <>
      <Avatar src={titleAvatar ?? undefined} name={title} size="sm" />
      <span className="truncate text-title font-semibold">{title}</span>
    </>
  );

  return (
    <main className="font-kr">
      <div className="mx-auto flex h-dvh max-w-2xl flex-col -mb-24 md:mb-0">
        <header className="flex shrink-0 items-center gap-2 border-b border-line px-2 py-2 sm:px-3">
          <BackButton />

          {/* 아바타 + 이름 (고객이면 작가 프로필로 이동) */}
          {headerHref ? (
            <Link href={headerHref} className="flex min-w-0 items-center gap-2.5">
              {name}
            </Link>
          ) : (
            <span className="flex min-w-0 items-center gap-2.5">{name}</span>
          )}

          <div className="ml-auto flex shrink-0 items-center gap-1">{headerActions}</div>
        </header>

        {/* 번호가 없으면 이 방의 알림이 한 통도 안 나간다(dispatchNotify 가 no_phone 으로 스킵).
            헤더 바로 아래 — 대화를 가리지 않으면서 처음 눈에 걸리는 자리 */}
        {banner}

        {children}
      </div>
    </main>
  );
}
