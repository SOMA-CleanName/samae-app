import Link from "next/link";

export type IndexEntry = {
  /** 같은 페이지 안 섹션이면 "#sec-taste", 다른 지면이면 "/spots" */
  href: string;
  label: string;
  /** 오른쪽 끝 보조 정보 — 개수·상태 같은 사실만. */
  note?: string;
};

/**
 * 목차 — 잡지 앞장의 CONTENTS.
 *
 * 얇은 가로줄 위에 번호·제목·화살표만 놓는다(Design Hotels ROOMS 패턴).
 * 호버하면 줄이 브랜드색으로 차오르고 제목이 살짝 밀린다 — CSS 만으로 돈다.
 *
 * 같은 페이지 섹션(#)은 <a> 로 둔다. next/link 로 해시만 이동시키면
 * 라우터가 개입해 scroll-mt 계산이 어긋난다.
 */
export function IndexList({ entries }: { entries: IndexEntry[] }) {
  return (
    <nav aria-label="목차">
      <ul className="border-t border-line">
        {entries.map((e, i) => {
          const inner = (
            <>
              <span className="ed-idx-num font-display text-body-sm italic tabular-nums text-faint">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="ed-idx-label min-w-0 flex-1 truncate text-body font-semibold tracking-tight">
                {e.label}
              </span>
              {e.note && (
                <span className="shrink-0 text-[11px] tabular-nums text-muted">{e.note}</span>
              )}
              <span className="ed-idx-arrow shrink-0 text-body-sm text-faint">↗</span>
            </>
          );
          const cls = "ed-idx-row flex items-center gap-3 py-3.5";

          return (
            <li key={e.href} className="border-b border-line">
              {e.href.startsWith("#") ? (
                <a href={e.href} className={cls}>
                  {inner}
                </a>
              ) : (
                <Link href={e.href} className={cls}>
                  {inner}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
