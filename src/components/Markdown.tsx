import Link from "next/link";
import type { ReactNode } from "react";

// 마크다운 렌더러 — **React 엘리먼트로 직접 만든다.**
//
// 왜 라이브러리를 안 쓰나:
//   marked/remark 계열은 HTML 문자열을 뱉어서 dangerouslySetInnerHTML 로 꽂아야 하고,
//   그러면 살균(sanitize) 라이브러리가 하나 더 필요하다. 운영자만 쓰는 글이라도
//   계정이 털리면 그대로 XSS 다. 엘리먼트로 만들면 그 경로 자체가 없다.
//
// 지원 범위(의도적으로 좁게):
//   # ## ###  ·  문단  ·  **굵게** *기울임* `코드`  ·  [링크](url)  ·  ![대체텍스트](url)
//   - 목록 / 1. 목록  ·  > 인용  ·  ---  ·  ``` 코드블록 ```
// 표·각주·HTML 은 지원하지 않는다. 필요해지면 그때 넓힌다.

/** 내부 경로(/…) 또는 https 만 통과. 그 외(javascript:, data: 등)는 링크를 걸지 않는다. */
function safeHref(raw: string): string | null {
  const v = raw.trim();
  if (v.startsWith("/") && !v.startsWith("//")) return v;
  if (/^https:\/\/[^\s]+$/i.test(v)) return v;
  return null;
}

/** 인라인 문법 — 이미지 → 링크 → 굵게 → 기울임 → 코드 순으로 자른다. */
function inline(text: string, keyPrefix = ""): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(!?)\[([^\]]*)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyPrefix}i${i++}`;
    if (m[3] !== undefined) {
      const href = safeHref(m[3]);
      const label = m[2];
      if (m[1] === "!") {
        // 이미지 — 원격 도메인이 next.config 에 없을 수 있어 next/image 대신 <img> 를 쓴다.
        out.push(
          href ? (
            // eslint-disable-next-line @next/next/no-img-element
            // 본문 이미지는 글 칼럼보다 넓게 빠져나온다(breakout).
            // 잡지에서 사진이 판면을 넘어가는 그 리듬이고, 스크롤에 리듬이 생긴다.
            <img
              key={key}
              src={href}
              alt={label}
              loading="lazy"
              className="ed-unveil my-9 max-h-[76vh] w-full rounded-2xl object-cover md:-ml-16 md:w-[calc(100%+8rem)] md:max-w-none"
            />
          ) : (
            <span key={key}>{label}</span>
          )
        );
      } else if (!href) {
        out.push(<span key={key}>{label}</span>);
      } else if (href.startsWith("/")) {
        out.push(
          <Link key={key} href={href} className="underline underline-offset-2 hover:opacity-70">
            {label}
          </Link>
        );
      } else {
        out.push(
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:opacity-70"
          >
            {label}
          </a>
        );
      }
    } else if (m[4] !== undefined) {
      out.push(<strong key={key} className="font-semibold">{m[4]}</strong>);
    } else if (m[5] !== undefined) {
      out.push(<em key={key}>{m[5]}</em>);
    } else if (m[6] !== undefined) {
      out.push(
        <code key={key} className="rounded bg-fg/[0.07] px-1 py-0.5 text-[0.92em]">
          {m[6]}
        </code>
      );
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let quote: string[] = [];
  let code: { lang: string; lines: string[] } | null = null;
  let k = 0;

  const flushPara = () => {
    if (para.length === 0) return;
    blocks.push(
      <p key={`p${k++}`} className="my-4 leading-[1.85] text-fg/85">
        {inline(para.join(" "), `p${k}`)}
      </p>
    );
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(
      <Tag
        key={`l${k++}`}
        className={`my-5 space-y-2 pl-5 leading-[1.8] text-fg/85 marker:font-semibold marker:text-brand ${
          list.ordered ? "list-decimal" : "list-disc"
        }`}
      >
        {list.items.map((it, idx) => (
          <li key={idx}>{inline(it, `l${k}_${idx}`)}</li>
        ))}
      </Tag>
    );
    list = null;
  };
  const flushQuote = () => {
    if (quote.length === 0) return;
    blocks.push(
      <blockquote
        key={`q${k++}`}
        className="my-9 border-y border-line py-6 text-[1.18em] font-medium leading-[1.65] tracking-[-0.015em]"
      >
        {inline(quote.join(" "), `q${k}`)}
      </blockquote>
    );
    quote = [];
  };
  const flushAll = () => {
    flushPara();
    flushList();
    flushQuote();
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    // 코드블록은 안쪽 문법을 해석하지 않는다
    if (code) {
      if (/^```/.test(line.trim())) {
        blocks.push(
          <pre
            key={`c${k++}`}
            className="my-5 overflow-x-auto rounded-xl bg-fg/[0.06] p-4 text-[13px] leading-relaxed"
          >
            <code>{code.lines.join("\n")}</code>
          </pre>
        );
        code = null;
      } else {
        code.lines.push(raw);
      }
      continue;
    }
    if (/^```/.test(line.trim())) {
      flushAll();
      code = { lang: line.trim().slice(3), lines: [] };
      continue;
    }

    if (line.trim() === "") { flushAll(); continue; }

    if (/^---+$/.test(line.trim())) {
      flushAll();
      blocks.push(<hr key={`h${k++}`} className="my-12 border-line" />);
      continue;
    }

    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      flushAll();
      const level = h[1].length;
      const cls =
        level === 1
          ? "mt-14 mb-4 text-[1.6em] font-extrabold leading-snug tracking-[-0.03em]"
          : level === 2
            ? "mt-12 mb-3 text-[1.32em] font-extrabold leading-snug tracking-[-0.025em]"
            : "mt-9 mb-2 text-[1.08em] font-bold tracking-[-0.015em]";
      const Tag = (["h2", "h3", "h4"] as const)[level - 1]; // 본문 h1 은 페이지 제목이 이미 씀
      // 매거진 리듬 — 상위 제목 위에 짧은 브랜드 규칙선을 둬서 절이 바뀌는 걸 눈으로 알린다.
      blocks.push(
        <Tag key={`t${k++}`} className={cls}>
          {level <= 2 && (
            <span aria-hidden className="mb-3 block h-[2px] w-8 bg-brand" />
          )}
          {inline(h[2], `t${k}`)}
        </Tag>
      );
      continue;
    }

    const q = /^>\s?(.*)$/.exec(line);
    if (q) { flushPara(); flushList(); quote.push(q[1]); continue; }
    flushQuote();

    const ul = /^[-*]\s+(.*)$/.exec(line);
    const ol = /^\d+[.)]\s+(.*)$/.exec(line);
    if (ul || ol) {
      flushPara();
      const ordered = !!ol;
      if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [] }; }
      list.items.push((ul ? ul[1] : ol![1]));
      continue;
    }
    flushList();

    para.push(line.trim());
  }
  flushAll();
  if (code) {
    // 닫히지 않은 코드블록 — 원문을 잃지 않게 그대로 내보낸다
    blocks.push(
      <pre key={`c${k++}`} className="my-5 overflow-x-auto rounded-xl bg-fg/[0.06] p-4 text-[13px]">
        <code>{code.lines.join("\n")}</code>
      </pre>
    );
  }

  return <div className="text-[15.5px]">{blocks}</div>;
}
