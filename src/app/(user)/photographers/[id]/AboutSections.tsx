import Image from "next/image";
import { cn } from "@/lib/cn";
import type { AboutColumn, AboutImage, AboutSection, AboutTextStyle } from "@/lib/about-types";
import { Reveal } from "./Reveal";

// 작가 소개(무드) 탭 — 매거진 에디토리얼 렌더러 (서버 컴포넌트 + Reveal 클라이언트 연출)
// 12컬럼 비대칭 그리드: 텍스트는 좌 5칸 / 우 5칸(8부터), 이미지는 폭·높이를 서로 다르게.
// 모바일은 1단 스택이되 image_pair 만 좌·우 어긋난 콜라주를 유지한다.
// 스튜디오 편집기의 실시간 미리보기에서도 그대로 임포트해 쓴다(서버 전용 의존성 금지).
// 반응형은 뷰포트(sm:)가 아닌 컨테이너 쿼리(@2xl: = 672px) 기준 —
// 편집기 미리보기가 폭만 바꿔서 모바일/PC 레이아웃을 그대로 재현할 수 있게 한다.
export function AboutSections({ sections }: { sections: AboutSection[] }) {
  return (
    <div className="@container flex flex-col gap-10 py-5 @2xl:gap-16 @2xl:py-8">
      {sections.map((s) => (
        <Reveal key={s.id}>
          <Section section={s} />
        </Reveal>
      ))}
    </div>
  );
}

// ── 섹션별 텍스트 스타일 → 클래스 매핑 ───────────────────────
// 미지정 필드는 요소별 기본값(DEFAULT_*)을 따른다.

type TextKind = "heading" | "quote" | "body";

const SIZE_CLS: Record<TextKind, Record<"sm" | "md" | "lg", string>> = {
  heading: {
    sm: "text-[22px] @2xl:text-[32px]",
    md: "text-[27px] @2xl:text-[42px]",
    lg: "text-[32px] @2xl:text-[54px]",
  },
  quote: {
    sm: "text-lg @2xl:text-xl",
    md: "text-xl @2xl:text-2xl",
    lg: "text-2xl @2xl:text-[32px]",
  },
  body: {
    sm: "text-[15px]",
    md: "text-[17px]",
    lg: "text-[20px] @2xl:text-[24px]",
  },
};

const COLOR_CLS: Record<NonNullable<AboutTextStyle["color"]>, string> = {
  ink: "text-fg",
  soft: "text-fg/60",
  faint: "text-fg/40",
  brand: "text-brand",
};

const DEFAULT_COLOR: Record<TextKind, string> = {
  heading: "text-fg",
  quote: "text-fg",
  body: "text-fg",
};

const DEFAULT_WEIGHT: Record<TextKind, string> = {
  heading: "font-bold",
  quote: "font-medium",
  body: "font-normal",
};

function textCls(kind: TextKind, style?: AboutTextStyle) {
  return cn(
    SIZE_CLS[kind][style?.size ?? "md"],
    style?.color ? COLOR_CLS[style.color] : DEFAULT_COLOR[kind],
    style?.bold === undefined ? DEFAULT_WEIGHT[kind] : style.bold ? "font-bold" : "font-normal"
  );
}

// 정렬 — 폭이 제한된 블록(max-w-*)은 가운데/오른쪽일 때 블록 자체도 함께 이동
const ALIGN_CLS: Record<NonNullable<AboutTextStyle["align"]>, string> = {
  left: "text-left",
  center: "mx-auto text-center",
  right: "ml-auto text-right",
};

function alignCls(style: AboutTextStyle | undefined, dflt: NonNullable<AboutTextStyle["align"]>) {
  return ALIGN_CLS[style?.align ?? dflt];
}

function Section({ section: s }: { section: AboutSection }) {
  switch (s.type) {
    case "heading":
      return (
        <h2
          className={cn(
            "max-w-[17em] whitespace-pre-line leading-[1.24] tracking-[-0.02em]",
            textCls("heading", s.content.style),
            alignCls(s.content.style, "left")
          )}
        >
          {s.content.text}
        </h2>
      );

    case "text":
      return (
        <p
          className={cn(
            "max-w-prose whitespace-pre-line leading-[2.1]",
            textCls("body", s.content.style),
            alignCls(s.content.style, "left")
          )}
        >
          {s.content.text}
        </p>
      );

    case "text_columns":
      return (
        <div className="grid gap-10 @2xl:grid-cols-12 @2xl:gap-y-0">
          <div className="@2xl:col-span-5">
            <Column col={s.content.left} />
          </div>
          <div className="@2xl:col-span-5 @2xl:col-start-8">
            <Column col={s.content.right} />
          </div>
        </div>
      );

    case "quote":
      return (
        <blockquote className={cn("max-w-xl", alignCls(s.content.style, "center"))}>
          <QuoteMark />
          <p
            className={cn(
              "whitespace-pre-line leading-[1.7] tracking-[-0.01em]",
              textCls("quote", s.content.style)
            )}
          >
            {s.content.text}
          </p>
        </blockquote>
      );

    case "image_full": {
      const img = s.content.image;
      const portrait = !!img?.width && !!img?.height && img.width < img.height;
      return (
        <figure className={cn(portrait && "@2xl:px-[16.66%]")}>
          <SectionImage image={img} sizes="(max-width: 768px) 100vw, 768px" />
          {s.content.caption?.trim() && (
            <figcaption className="mt-3 text-center text-caption tracking-wide text-faint">
              {s.content.caption}
            </figcaption>
          )}
        </figure>
      );
    }

    case "image_pair": {
      const [a, b] = s.content.images ?? [null, null];
      // 좌 큰 장 / 우 작은 장을 아래로 끌어내린 지그재그 — 모바일에서도 좌우 어긋남 유지
      return (
        <div className="@2xl:grid @2xl:grid-cols-12">
          <div className="w-4/5 @2xl:col-span-5 @2xl:w-full">
            <SectionImage image={a} sizes="(max-width: 768px) 80vw, 320px" />
          </div>
          <div className="ml-auto mt-[-12%] w-4/5 @2xl:col-span-4 @2xl:col-start-8 @2xl:ml-0 @2xl:mt-[45%] @2xl:w-full">
            <Reveal delay={150}>
              <SectionImage image={b} sizes="(max-width: 768px) 80vw, 260px" />
            </Reveal>
          </div>
        </div>
      );
    }

    case "image_text": {
      const imageFirst = s.content.imageSide !== "right";
      return (
        <div className="grid gap-8 @2xl:grid-cols-12 @2xl:items-center">
          <div className={cn("@2xl:col-span-5", !imageFirst && "@2xl:order-2 @2xl:col-start-8")}>
            <SectionImage image={s.content.image} sizes="(max-width: 768px) 100vw, 380px" />
          </div>
          <p
            className={cn(
              "whitespace-pre-line leading-[2]",
              textCls("body", s.content.style),
              alignCls(s.content.style, "left"),
              imageFirst ? "@2xl:col-span-5 @2xl:col-start-8" : "@2xl:order-1 @2xl:col-span-5"
            )}
          >
            {s.content.text}
          </p>
        </div>
      );
    }
  }
}

// 단락·인용구는 크기·굵기·행간 완전 동일 — 인용구는 왼쪽 세로 바 장식만 다르다.
function Column({ col }: { col: AboutColumn }) {
  if (!col?.text?.trim()) return null;
  const body = (
    <p
      className={cn(
        "max-w-prose whitespace-pre-line leading-[2.1]",
        textCls("body", col.style),
        alignCls(col.style, "left")
      )}
    >
      {col.text}
    </p>
  );
  if (col.kind === "quote") {
    return <blockquote className="border-l-[3px] border-fg pl-5 @2xl:pl-6">{body}</blockquote>;
  }
  return body;
}

// Fraunces 이탤릭 큰따옴표 — 라틴 세리프 + 한글 산세리프의 에디토리얼 대비
function QuoteMark() {
  return (
    <span
      aria-hidden
      className="mb-1 block font-display text-6xl italic leading-none text-fg/20 @2xl:text-7xl"
    >
      “
    </span>
  );
}

function SectionImage({ image, sizes }: { image: AboutImage | null; sizes: string }) {
  if (!image?.url) return null;
  const ratio = image.width && image.height ? image.width / image.height : 4 / 5;
  return (
    <div
      className="relative w-full overflow-hidden bg-fg/[0.04]"
      style={{ aspectRatio: ratio }}
    >
      <Image src={image.url} alt="" fill sizes={sizes} quality={90} className="object-cover" />
    </div>
  );
}
