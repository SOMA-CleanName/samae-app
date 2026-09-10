import Link from "next/link";
import type { ReactNode } from "react";

/**
 * 섹션 표제 — 잡지의 기사 머리.
 *
 * 지금 탐색의 섹션 머리는 "01 제목" 한 줄뿐이라 섹션끼리 구분이 약하다.
 * 브랜드색 짧은 규칙선을 위에 얹어 지면이 끊기는 자리를 눈에 보이게 만든다.
 * (/articles 본문의 h2 와 같은 장치라 두 지면의 리듬이 맞는다)
 */
export function SectionHead({
  no,
  title,
  lead,
  more,
  moreLabel = "전체 보기",
}: {
  /** 목차 번호. "01" 처럼 두 자리로 넘긴다. */
  no: string;
  title: string;
  /** 이 섹션이 뭔지 한 줄. 없으면 생략. */
  lead?: ReactNode;
  /** 우측 링크 경로. 없으면 링크를 안 그린다. */
  more?: string;
  moreLabel?: string;
}) {
  return (
    <div className="mb-4 px-1">
      <span aria-hidden className="mb-3 block h-[2px] w-8 bg-brand" />
      <div className="flex items-baseline gap-2">
        <span className="font-display text-body-sm italic tabular-nums text-brand">{no}</span>
        <h2 className="text-title font-bold tracking-tight">{title}</h2>
        {more && (
          <Link
            href={more}
            className="ml-auto shrink-0 text-xs text-muted underline underline-offset-4 transition-colors hover:text-brand"
          >
            {moreLabel}
          </Link>
        )}
      </div>
      {lead && <p className="mt-1.5 text-body-sm leading-relaxed text-muted">{lead}</p>}
    </div>
  );
}
