import Link from "next/link";
import type { ReactNode } from "react";

/*
  약관·정책 페이지 공용 조각.

  /terms 가 쓰던 Article·Ol·Table 을 여기로 옮겨 회원약관·작가약관·취소환불정책·입점동의서가 같은 모양으로
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

/**
 * 조(條) 대신 항목으로 번호를 매기는 문서의 절 제목 — 입점 동의서가 그렇다.
 * Article 은 제목을 괄호로 감싸는데("제1조 (목적)"), 항목 문서는 괄호 없이 "1 작가 정보" 로 읽힌다.
 */
export function Section({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-base font-semibold text-fg">
        <span className="font-display italic tabular-nums text-brand">{n}</span> <span>{title}</span>
      </h2>
      {children}
    </section>
  );
}

/**
 * 동의 화면이 실제로 받는 체크 항목을 **읽기 전용으로** 보여주는 목록.
 *
 * 입점 동의서는 "읽는 글" 이면서 동시에 "동의 화면이 무엇을 묻는지" 의 정본이다. 그 항목을
 * 평범한 글머리표로 그리면, 전문을 읽는 작가는 자기가 무엇에 체크하게 되는지 알 수 없다.
 * 실제 입력은 AgreeGate 의 폼이 받는다 — 여기 네모는 장식이 아니라 그 폼의 미리보기다.
 */
export function Checks({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mt-2 space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2.5">
          <span
            aria-hidden
            className="mt-[3px] h-3.5 w-3.5 shrink-0 rounded-[3px] border border-line-strong"
          />
          <span className="min-w-0 flex-1">{it}</span>
        </li>
      ))}
    </ul>
  );
}

export function P({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={className}>{children}</p>;
}

/**
 * 조문 안의 항 목록.
 *
 * `start` — 정본에 항 번호가 비어 있을 때 **번호를 당기지 않고** 그 자리를 비워 두기 위한 것.
 * 약관의 항 번호는 다른 문서가 인용하는 주소라서, 빠진 항을 조용히 메우면 인용이 어긋난다.
 */
export function Ol({ children, start }: { children: ReactNode; start?: number }) {
  return (
    <ol start={start} className="list-decimal space-y-1.5 pl-5">
      {children}
    </ol>
  );
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
