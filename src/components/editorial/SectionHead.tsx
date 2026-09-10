import Link from "next/link";
import type { ReactNode } from "react";

/**
 * 섹션 표제 — 잡지의 기사 머리.
 *
 * 처음엔 위에 브랜드색 규칙선 + "01 제목" 번호 조합이었다. 매거진 지면이
 * 러닝헤드까지 번호를 들고 다니니 목차도 아닌데 숫자가 과했고, 규칙선은
 * 제목보다 먼저 눈에 걸렸다. 지금은 **제목 밑 강조선(형광펜 밑줄 느낌)**
 * 하나로 줄인다 — 끊기는 자리는 여전히 보이고, 읽는 순서는 제목이 먼저다.
 * (/articles 본문의 h2 와 같은 장치라 두 지면의 리듬이 맞는다)
 */
export function SectionHead({
  no,
  title,
  lead,
  more,
  moreLabel = "전체 보기",
}: {
  /** 목차 번호("01"). 번호가 의미 있는 지면(spots 상세의 목차)만 넘긴다. */
  no?: string;
  title: string;
  /** 이 섹션이 뭔지 한 줄. 없으면 생략. */
  lead?: ReactNode;
  /** 우측 링크 경로. 없으면 링크를 안 그린다. */
  more?: string;
  moreLabel?: string;
}) {
  return (
    <div className="mb-4 px-1">
      <div className="flex items-baseline gap-2">
        {no && (
          <span className="font-display text-body-sm italic tabular-nums text-brand">{no}</span>
        )}
        <h2 className="border-b-[3px] border-brand pb-1 text-title font-bold tracking-tight">
          {title}
        </h2>
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
