import Link from "next/link";
import type { ReactNode } from "react";

/*
  약관·정책 페이지 공용 조각.

  /terms 가 쓰던 Article·Ol·Table 을 여기로 옮겨 작가약관·취소환불정책·수수료정책이 같은 모양으로
  그려지게 한다. 문서마다 지면을 따로 짜면 조 번호 스타일과 표 폭이 조금씩 달라지고, 그게 곧
  "어느 게 진짜냐" 는 질문이 된다.

  본문은 각 페이지가 TSX 로 직접 쓴다 — 마크다운 렌더러를 두지 않는 건 문장 하나하나가 약속이라
  변환 과정에서 의미가 바뀌는 자리를 없애기 위해서다.
*/

export function LegalPage({
  title,
  effectiveDate,
  version,
  lead,
  children,
  footer,
}: {
  title: string;
  /** 시행일. 비어 있으면 "게시 공지 후 확정" 으로 보여준다 */
  effectiveDate: string;
  version?: string;
  lead?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 font-kr">
      <Link
        href="/terms"
        className="mb-6 inline-block text-sm font-medium text-muted transition-colors hover:text-fg"
      >
        ← 약관 목록
      </Link>

      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted">
        {effectiveDate ? `시행일 ${effectiveDate}` : "시행일은 게시 공지 후 확정됩니다"}
        {version ? ` · 버전 ${version}` : ""}
      </p>
      {lead && <div className="mt-4 text-sm leading-relaxed text-fg/70">{lead}</div>}

      <div className="mt-9 space-y-8 text-sm leading-relaxed text-fg/85">{children}</div>

      {footer && (
        <div className="mt-12 border-t border-line pt-5 text-xs leading-relaxed text-faint">{footer}</div>
      )}
    </main>
  );
}

export function Article({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-base font-semibold text-fg">
        <span className="font-display italic tabular-nums text-brand">{n}</span> <span>({title})</span>
      </h2>
      {children}
    </section>
  );
}

export function P({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={className}>{children}</p>;
}

export function Ol({ children }: { children: ReactNode }) {
  return <ol className="list-decimal space-y-1.5 pl-5">{children}</ol>;
}

export function Ul({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1 pl-5">{children}</ul>;
}

export function B({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-fg">{children}</strong>;
}

/** 조문 안의 표 — 좁은 화면에서 본문이 가로로 밀리지 않게 표만 스크롤시킨다 */
export function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="mt-2.5 overflow-x-auto">
      <table className="w-full min-w-[22rem] border-collapse text-xs">
        <thead>
          <tr className="border-y border-line text-left text-muted">
            {head.map((h) => (
              <th key={h} className="py-2 pr-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]} className="border-b border-line">
              {r.map((c, i) => (
                <td key={i} className={`py-2 pr-3 align-top ${i === 0 ? "" : "tabular-nums"}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 용어 정의 표처럼 "용어 — 뜻" 을 나열할 때 */
export function Defs({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="space-y-1.5">
      {items.map(([term, body]) => (
        <div key={term} className="flex gap-2">
          <dt className="w-24 shrink-0 font-semibold text-fg">{term}</dt>
          <dd className="min-w-0 flex-1">{body}</dd>
        </div>
      ))}
    </dl>
  );
}
