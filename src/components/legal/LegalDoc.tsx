import Link from "next/link";
import type { ReactNode } from "react";

/*
  약관·정책 페이지 공용 조각.

  /terms 가 쓰던 Article·Ol·Table 을 여기로 옮겨 회원약관·작가약관·취소환불정책·입점동의서가 같은 모양으로
  그려지게 한다. 문서마다 지면을 따로 짜면 조 번호 스타일과 표 폭이 조금씩 달라지고, 그게 곧
  "어느 게 진짜냐" 는 질문이 된다.

  본문은 각 페이지가 TSX 로 직접 쓴다 — 마크다운 렌더러를 두지 않는 건 문장 하나하나가 약속이라
  변환 과정에서 의미가 바뀌는 자리를 없애기 위해서다.

  ── 조판 (2026-09-18) ───────────────────────────────────────────
  약관은 **끝까지 읽혀야 하는 글**이다(입점 동의 화면은 바닥까지 내려야 동의가 열린다).
  그런데 한 줄이 길고 항이 촘촘히 붙어 있어서 어디서 항이 끊기는지가 잘 안 보였다.

  · 줄 간격을 leading-relaxed(1.625) → leading-7(1.75) 로. 한글 약관은 조사·어미가 길어
    영문 기준 행간이면 줄이 엉킨다.
  · `break-keep`(word-break: keep-all) — 한글은 기본값이면 **낱말 한가운데서 줄이 끊긴다.**
    좁은 화면에서 표 첫 칸이 "항/목", "채/널" 로 쪼개졌다(390px 실측). 띄어쓰기에서만 끊게 한다.
  · 항(li) 사이를 1.5 → 3 으로 벌린다. 항이 곧 인용 단위라 경계가 보여야 한다.
  · 조(Article) 사이를 8 → 10 으로. 제목이 앞 조의 꼬리에 붙어 보이던 것.
  · 조 안의 블록(문단·목록·표)은 Article 이 space-y-3 으로 자동 간격을 준다.
    → **각 블록에 mt-* 를 따로 붙이지 말 것.** space-y 가 우선순위에서 이겨 무시된다.
       더 벌려야 하면 `!mt-*` 로 명시한다(SubHead 가 그렇게 한다).
*/

/**
 * 약관 본문을 감싸는 조판 — **공개 지면과 동의 화면이 같은 값을 써야 한다.**
 *
 * ⚠️ 전에는 이 값이 LegalPage 안에만 있었다. 그래서 동의 화면(DocReader)이 같은 본문을
 *    그릴 때 **조 사이 간격이 통째로 없었다** — 제3조 제목이 앞 조의 마지막 줄에 붙어
 *    어디서 조가 바뀌는지 안 보였다(2026-09-18 실측). 하필 바닥까지 읽어야 동의가 열리는
 *    화면이라 가장 잘 읽혀야 할 자리였다. 상수로 빼서 두 곳이 갈라지지 않게 한다.
 */
export const LEGAL_BODY = "space-y-10 break-keep text-sm leading-7 text-fg/85";

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
    <main className="mx-auto max-w-2xl break-keep px-5 py-10 font-kr">
      <Link
        href="/terms"
        className="mb-6 inline-block text-sm font-medium text-muted transition-colors hover:text-fg"
      >
        ← 약관 목록
      </Link>

      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="mt-2.5 text-sm text-muted">
        {effectiveDate ? `시행일 ${effectiveDate}` : "시행일은 게시 공지 후 확정됩니다"}
        {version ? ` · 버전 ${version}` : ""}
      </p>
      {lead && (
        <div className="mt-5 border-l-2 border-line-strong pl-4 text-sm leading-7 text-fg/70">{lead}</div>
      )}

      <div className={`mt-10 ${LEGAL_BODY}`}>{children}</div>

      {footer && (
        <div className="mt-14 border-t border-line pt-5 text-xs leading-6 text-faint">{footer}</div>
      )}
    </main>
  );
}

/** 조 제목 + 본문. 본문 블록(문단·목록·표) 사이 간격은 여기서 준다 */
export function Article({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-base font-semibold leading-7 text-fg">
        <span className="font-display italic tabular-nums text-brand">{n}</span> <span>({title})</span>
      </h2>
      <div className="space-y-3">{children}</div>
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
      <h2 className="mb-3 text-base font-semibold leading-7 text-fg">
        <span className="font-display italic tabular-nums text-brand">{n}</span> <span>{title}</span>
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

/** 조 안의 작은 제목 (표 앞머리 등). 앞 블록과 확실히 떼려고 간격을 명시한다 */
export function SubHead({ children }: { children: ReactNode }) {
  return <p className="!mt-7 font-semibold text-fg">{children}</p>;
}

export function P({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={className}>{children}</p>;
}

/**
 * 조문 안의 항 목록.
 *
 * `sub` — 항 아래의 호(號). 한 번 더 들여쓰고 글자를 죽여서, 같은 숫자라도 항과 구별되게 한다.
 *         (작가약관 15조 1항처럼 항 안에 호가 매달리는 자리)
 */
export function Ol({ children, sub = false }: { children: ReactNode; sub?: boolean }) {
  return (
    <ol
      className={
        sub
          ? "mt-2.5 list-decimal space-y-2 pl-5 text-fg/75 marker:text-faint"
          : "list-decimal space-y-3 pl-5 marker:tabular-nums marker:text-muted"
      }
    >
      {children}
    </ol>
  );
}

/** 항 안에서 조건·범위를 나열할 때. 항 본문에 매달리므로 위쪽을 조금 띄운다 */
export function Ul({ children }: { children: ReactNode }) {
  return <ul className="mt-2.5 list-disc space-y-2 pl-5 marker:text-faint">{children}</ul>;
}

/**
 * 번호도 점도 없이 항목만 나열할 때 — 줄표로 연다.
 *
 * ⚠️ 전에는 네모(☐)를 그렸다. 입점 동의서가 정본에서 체크박스 꼴이라 그대로 옮긴 건데,
 *    **우리 동의 화면은 항목별로 체크를 받지 않는다.** 문서 전체를 읽고 한 번에 동의한다.
 *    화면에 없는 체크칸을 글에 그려 두면 "이건 따로 고르는 건가" 를 만든다.
 */
export function Items({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3">
          <span aria-hidden className="shrink-0 text-faint">
            —
          </span>
          <span className="min-w-0 flex-1">{it}</span>
        </li>
      ))}
    </ul>
  );
}

export function B({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-fg">{children}</strong>;
}

/**
 * 조문 안의 표 — 좁은 화면에서 본문이 가로로 밀리지 않게 표만 스크롤시킨다.
 *
 * 숫자 칸만 tabular-nums 를 준다. 전에는 첫 칸 빼고 전부 걸어서, 글이 든 칸(홍보 사용 범위의
 * '내용' 처럼)까지 숫자 폭으로 벌어졌다.
 *
 * 표 머리와 숫자 칸은 줄바꿈을 막는다 — 좁은 화면에서 "위약/금", "100/%" 로 끊겼다(390px 실측).
 * break-keep 은 띄어쓰기가 있어야 듣는데 이것들은 붙어 있는 낱말이라 안 듣는다.
 * 그래서 표가 넓어지면 감싸개(overflow-x-auto)가 가로로 밀어 준다 — 그러라고 둔 것이다.
 */
export function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  const numeric = (s: string) => /^[\d.,%\s원~-]+$/.test(s);
  return (
    <div className="mt-2.5 overflow-x-auto">
      <table className="w-full min-w-[20rem] border-collapse text-[0.8125rem] leading-6">
        <thead>
          <tr className="border-y border-line text-left text-muted">
            {head.map((h) => (
              <th key={h} className="whitespace-nowrap py-2.5 pr-4 font-medium last:pr-0">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]} className="border-b border-line align-top">
              {r.map((c, i) => (
                <td
                  key={i}
                  className={`py-2.5 pr-4 last:pr-0 ${numeric(c) ? "whitespace-nowrap tabular-nums" : ""}`}
                >
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

/**
 * 용어 정의처럼 "말 — 뜻" 을 나열할 때.
 *
 * 좁은 화면에서는 위아래로 쌓는다. 전에는 6rem 고정 칸에 말을 넣었는데
 * "사업자등록번호" 같은 긴 말이 두 줄로 접히면서 뜻과 높이가 어긋났다.
 */
export function Defs({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="space-y-3">
      {items.map(([term, body]) => (
        <div key={term} className="sm:flex sm:gap-4">
          <dt className="font-semibold text-fg sm:w-32 sm:shrink-0">{term}</dt>
          <dd className="min-w-0 flex-1 text-fg/75">{body}</dd>
        </div>
      ))}
    </dl>
  );
}
