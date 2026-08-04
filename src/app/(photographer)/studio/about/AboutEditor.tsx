"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { downscaleImage } from "@/lib/downscale";
import { SortableGrid, SortableItem } from "@/components/ui/SortableGrid";
import { Spinner } from "@/components/ui";
import {
  sectionHasContent,
  type AboutColumn,
  type AboutImage,
  type AboutSection,
  type AboutSectionType,
  type AboutTextStyle,
} from "@/lib/about-types";
import { AboutSections } from "@/app/(user)/photographers/[id]/AboutSections";
import { createSection, deleteSection, reorderSections, updateSection } from "./actions";

const TYPE_LABEL: Record<AboutSectionType, string> = {
  heading: "큰 제목",
  text: "1단 텍스트",
  text_columns: "2단 텍스트",
  quote: "인용구",
  image_full: "큰 이미지",
  image_pair: "이미지 2장 · 지그재그",
  image_text: "이미지 + 텍스트",
};

// 소개(무드) 페이지 편집기 — 섹션 카드 리스트(드래그 정렬) + 템플릿 픽커.
// 텍스트는 카드별 저장 버튼, 이미지·정렬·삭제는 즉시 저장.
export function AboutEditor({
  initialSections,
  previewHref,
}: {
  initialSections: AboutSection[];
  previewHref: string;
}) {
  const [sections, setSections] = useState<AboutSection[]>(initialSections);
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(initialSections.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("mobile");
  const [sheetOpen, setSheetOpen] = useState(false); // 모바일 미리보기 바텀시트

  function patch(id: string, content: AboutSection["content"], opts?: { save?: boolean }) {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? ({ ...s, content } as AboutSection) : s))
    );
    if (opts?.save) {
      const type = sections.find((s) => s.id === id)?.type;
      if (type) void save(id, type, content);
    } else {
      setDirtyIds((prev) => new Set(prev).add(id));
    }
  }

  async function save(id: string, type: AboutSectionType, content: AboutSection["content"]) {
    setError(null);
    try {
      await updateSection(id, type, content);
      setDirtyIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장에 실패했어요.");
    }
  }

  async function onAdd(type: AboutSectionType) {
    setError(null);
    setPickerOpen(false);
    try {
      const { id } = await createSection(type);
      // 서버 기본 content 와 동일한 빈 섹션을 로컬에 추가
      const empty = emptyContent(type);
      setSections((prev) => [
        ...prev,
        { id, type, content: empty, sort_order: prev.length } as AboutSection,
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "섹션 추가에 실패했어요.");
    }
  }

  async function onDelete(id: string) {
    setSections((prev) => prev.filter((s) => s.id !== id));
    try {
      await deleteSection(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제에 실패했어요.");
    }
  }

  function onReorder(ids: string[]) {
    setSections((prev) =>
      ids
        .map((id) => prev.find((s) => s.id === id))
        .filter((s): s is AboutSection => !!s)
    );
    void reorderSections(ids).catch(() => setError("순서 저장에 실패했어요."));
  }

  const visible = sections.filter(sectionHasContent);

  return (
    <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
      {/* ── 좌: 편집 ── */}
      <div>
      {/* 상단 액션 — 공개 페이지 이동 + 모바일 미리보기(PC 는 우측 패널이 있어 숨김) */}
      <div className="mb-3 flex items-center justify-end gap-2">
        <Link
          href={previewHref}
          target="_blank"
          className="rounded-full border border-line px-3.5 py-1.5 text-body-sm text-fg hover:bg-surface-2"
        >
          소개 페이지 가기 ↗
        </Link>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="cursor-pointer rounded-full border border-line px-3.5 py-1.5 text-body-sm text-fg hover:bg-surface-2 lg:hidden"
        >
          미리보기
        </button>
      </div>
      {error && (
        <p className="mb-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-body-sm text-danger">{error}</p>
      )}

      {sections.length === 0 && !pickerOpen && (
        <p className="rounded-2xl border border-dashed border-line px-4 py-10 text-center text-body-sm text-muted">
          아직 섹션이 없어요. 아래에서 첫 섹션을 추가해보세요.
        </p>
      )}

      <SortableGrid
        ids={sections.map((s) => s.id)}
        onReorder={onReorder}
        vertical
        className="flex flex-col gap-3"
      >
        {(id) => {
          const s = sections.find((x) => x.id === id);
          if (!s) return null;
          return (
            <SortableItem key={id} id={id}>
              {({ isDragging }) => (
                <SectionCard
                  section={s}
                  dirty={dirtyIds.has(id)}
                  dragging={isDragging}
                  onChange={(content, opts) => patch(id, content, opts)}
                  onSave={() => save(id, s.type, s.content)}
                  onDelete={() => onDelete(id)}
                />
              )}
            </SortableItem>
          );
        }}
      </SortableGrid>

      {/* 섹션 추가 */}
      <div className="mt-4">
        {pickerOpen ? (
          <div className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-center justify-between">
              <p className="text-body-sm font-semibold">어떤 섹션을 추가할까요?</p>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="cursor-pointer text-body-sm text-muted hover:text-fg"
              >
                닫기
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {(Object.keys(TYPE_LABEL) as AboutSectionType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => void onAdd(t)}
                  className="group cursor-pointer rounded-xl border border-line p-3 text-left transition-colors hover:border-fg/30 hover:bg-surface-2"
                >
                  <TypeThumb type={t} />
                  <p className="mt-2 text-caption font-medium text-fg">{TYPE_LABEL[t]}</p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="w-full cursor-pointer rounded-2xl border border-dashed border-line-strong py-3.5 text-body-sm font-medium text-muted transition-colors hover:border-fg/40 hover:text-fg"
          >
            + 섹션 추가
          </button>
        )}
      </div>
      </div>

      {/* ── 우: 실시간 미리보기 (PC 전용) — 공개 페이지 렌더러를 그대로 사용 ── */}
      <div className="hidden lg:sticky lg:top-6 lg:block">
        <div className="overflow-hidden rounded-2xl border border-line bg-bg">
          <div className="flex items-center gap-2 border-b border-line px-5 py-2">
            <span className="h-2 w-2 rounded-full bg-brand" />
            <span className="text-caption font-medium text-muted">미리보기</span>
            <div className="ml-auto flex gap-1">
              {(["mobile", "pc"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPreviewMode(m)}
                  className={cn(
                    "cursor-pointer rounded-full px-3 py-1 text-caption transition-colors",
                    previewMode === m
                      ? "bg-fg font-semibold text-bg"
                      : "text-muted hover:bg-fg/[0.06] hover:text-fg"
                  )}
                >
                  {m === "mobile" ? "모바일" : "PC"}
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-[calc(100vh-8.5rem)] overflow-y-auto px-4">
            {visible.length > 0 ? (
              <PreviewViewport mode={previewMode}>
                <AboutSections sections={visible} />
              </PreviewViewport>
            ) : (
              <p className="py-20 text-center text-body-sm text-faint">
                섹션에 내용을 채우면 여기에 바로 나타나요
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── 모바일 미리보기 바텀시트 ── */}
      <div
        onClick={() => setSheetOpen(false)}
        className={cn(
          "fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 lg:hidden",
          sheetOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      />
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 flex max-h-[80dvh] flex-col rounded-t-2xl border-t border-line bg-bg shadow-pop transition-transform duration-300 lg:hidden",
          sheetOpen ? "translate-y-0" : "translate-y-full"
        )}
      >
        <div className="flex items-center gap-2 border-b border-line px-5 py-3">
          <span className="h-2 w-2 rounded-full bg-brand" />
          <span className="text-body-sm font-medium">미리보기</span>
          <button
            type="button"
            onClick={() => setSheetOpen(false)}
            className="ml-auto cursor-pointer rounded-full px-3 py-1 text-body-sm text-muted hover:bg-fg/[0.06] hover:text-fg"
          >
            닫기
          </button>
        </div>
        <div className="overflow-y-auto px-4">
          {visible.length > 0 ? (
            <PreviewViewport mode="mobile">
              <AboutSections sections={visible} />
            </PreviewViewport>
          ) : (
            <p className="py-16 text-center text-body-sm text-faint">
              섹션에 내용을 채우면 여기에 바로 나타나요
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 미리보기 뷰포트 — 공개 페이지의 실제 콘텐츠 폭으로 렌더 후 패널 폭에 맞게 축소 ──
// PC: 공개 프로필 main max-w-6xl(1120) − 프로필 사이드 288 − gap 40 = 탭 콘텐츠 792px.
// 모바일: 폰 기준 390px. 렌더러가 컨테이너 쿼리 기반이라 폭만 바꾸면 레이아웃이 재현된다.
// zoom 은 내부 레이아웃(줄바꿈 포함)을 지정 폭 기준으로 계산한 뒤 통째로 축소하므로
// 실제 화면과 동일한 비율·줄바꿈이 유지된다.
type PreviewMode = "mobile" | "pc";
const PREVIEW_WIDTH: Record<PreviewMode, number> = { pc: 792, mobile: 390 };

function PreviewViewport({ mode, children }: { mode: PreviewMode; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const width = PREVIEW_WIDTH[mode];

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setScale(Math.min(1, entry.contentRect.width / width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  return (
    <div ref={ref} className={cn(mode === "mobile" && "flex justify-center")}>
      <div
        style={{ width, zoom: scale }}
        className={cn(mode === "mobile" && "border-x border-line px-2.5")}
      >
        {children}
      </div>
    </div>
  );
}

function emptyContent(type: AboutSectionType): AboutSection["content"] {
  switch (type) {
    case "heading":
    case "text":
      return { text: "" };
    case "text_columns":
      return { left: { kind: "text", text: "" }, right: { kind: "quote", text: "" } };
    case "quote":
      return { text: "" };
    case "image_full":
      return { image: null, caption: "" };
    case "image_pair":
      return { images: [null, null] };
    case "image_text":
      return { image: null, text: "", imageSide: "left" };
  }
}

// ── 섹션 카드 ────────────────────────────────────────────────

function SectionCard({
  section: s,
  dirty,
  dragging,
  onChange,
  onSave,
  onDelete,
}: {
  section: AboutSection;
  dirty: boolean;
  dragging: boolean;
  onChange: (content: AboutSection["content"], opts?: { save?: boolean }) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, startSave] = useTransition();

  return (
    <div
      className={cn(
        "rounded-2xl border border-line bg-surface transition-shadow",
        dragging && "shadow-pop opacity-90"
      )}
    >
      {/* 헤더 = 드래그 존 */}
      <div className="flex cursor-grab items-center gap-2 px-4 pt-3 active:cursor-grabbing">
        <GripIcon className="h-4 w-4 shrink-0 text-faint" />
        <span className="text-caption font-semibold uppercase tracking-wide text-muted">
          {TYPE_LABEL[s.type]}
        </span>
        <div
          className="ml-auto flex items-center gap-2"
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {dirty && (
            <button
              type="button"
              onClick={() => startSave(onSave)}
              disabled={saving}
              className="cursor-pointer rounded-full bg-fg px-3 py-1 text-caption font-semibold text-bg hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "저장 중…" : "저장"}
            </button>
          )}
          {confirmDelete ? (
            <span className="flex items-center gap-1.5 text-caption">
              <button
                type="button"
                onClick={onDelete}
                className="cursor-pointer font-semibold text-danger"
              >
                삭제
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="cursor-pointer text-muted"
              >
                취소
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              aria-label="섹션 삭제"
              className="cursor-pointer text-faint transition-colors hover:text-danger"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* 본문 = 편집 영역 — 드래그(포인터)와 키보드 정렬 센서(스페이스/엔터)가
          입력을 가로채지 않도록 이벤트 전파 차단 */}
      <div
        className="px-4 pb-4 pt-2.5"
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {STYLABLE_TYPES.has(s.type) && (
          <StyleBar
            value={(s.content as { style?: AboutTextStyle }).style}
            defaultBold={s.type === "heading"}
            defaultAlign={s.type === "quote" ? "center" : "left"}
            onChange={(style) =>
              onChange({ ...s.content, style } as AboutSection["content"])
            }
          />
        )}
        <SectionFields section={s} onChange={onChange} />
      </div>
    </div>
  );
}

// ── 텍스트 스타일 툴바 (크기 · 색 · 굵기) ────────────────────

// 섹션 공통 스타일 툴바를 붙일 타입 — 내부 칸이 나뉘는 타입(2단 텍스트·이미지+텍스트)은
// 칸마다 개별 툴바를 붙이므로 여기서 제외
const STYLABLE_TYPES = new Set<AboutSectionType>(["heading", "text", "quote"]);

const STYLE_COLOR_OPTIONS: {
  key: NonNullable<AboutTextStyle["color"]>;
  label: string;
  dot: string;
}[] = [
  { key: "ink", label: "진하게", dot: "bg-fg" },
  { key: "soft", label: "연하게", dot: "bg-fg/50" },
  { key: "faint", label: "흐리게", dot: "bg-fg/25" },
  { key: "brand", label: "포인트 컬러", dot: "bg-brand" },
];

function StyleBar({
  value,
  defaultBold,
  defaultAlign = "left",
  onChange,
}: {
  value?: AboutTextStyle;
  defaultBold: boolean;
  defaultAlign?: NonNullable<AboutTextStyle["align"]>;
  onChange: (style: AboutTextStyle | undefined) => void;
}) {
  const v = value ?? {};
  // 기본값과 같은 선택은 저장하지 않는다 — 미지정 = 섹션 기본 스타일
  function set(patch: Partial<AboutTextStyle>) {
    const next: AboutTextStyle = { ...v, ...patch };
    (Object.keys(next) as (keyof AboutTextStyle)[]).forEach((k) => {
      if (next[k] === undefined) delete next[k];
    });
    onChange(Object.keys(next).length ? next : undefined);
  }
  const size = v.size ?? "md";
  const boldOn = v.bold ?? defaultBold;
  const align = v.align ?? defaultAlign;

  return (
    <div className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg bg-fg/[0.04] px-2.5 py-1.5">
      {/* 좁은 화면에선 [크기·정렬] / [색·굵기] 그룹 단위로 줄바꿈 */}
      <div className="flex items-center gap-3">
      {/* 크기 */}
      <div className="flex items-center gap-0.5">
        {(["sm", "md", "lg"] as const).map((sz) => (
          <button
            key={sz}
            type="button"
            title={sz === "sm" ? "작게" : sz === "md" ? "보통" : "크게"}
            onClick={() => set({ size: sz === "md" ? undefined : sz })}
            className={cn(
              "grid h-6 w-6 cursor-pointer place-items-center rounded-md transition-colors",
              size === sz ? "bg-fg text-bg" : "text-muted hover:text-fg"
            )}
          >
            <span
              className={cn(
                "leading-none",
                sz === "sm" ? "text-[10px]" : sz === "md" ? "text-[12px]" : "text-[14px]"
              )}
            >
              가
            </span>
          </button>
        ))}
      </div>

      <span className="h-3.5 w-px bg-line" />

      {/* 정렬 */}
      <div className="flex items-center gap-0.5">
        {(["left", "center", "right"] as const).map((a) => (
          <button
            key={a}
            type="button"
            title={a === "left" ? "왼쪽 정렬" : a === "center" ? "가운데 정렬" : "오른쪽 정렬"}
            onClick={() => set({ align: a === defaultAlign ? undefined : a })}
            className={cn(
              "grid h-6 w-6 cursor-pointer place-items-center rounded-md transition-colors",
              align === a ? "bg-fg text-bg" : "text-muted hover:text-fg"
            )}
          >
            <AlignIcon variant={a} className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
      </div>

      <div className="flex items-center gap-3">
      {/* 색 — 같은 색을 다시 누르면 기본으로 */}
      <div className="flex items-center gap-0.5">
        {STYLE_COLOR_OPTIONS.map(({ key, label, dot }) => (
          <button
            key={key}
            type="button"
            title={label}
            onClick={() => set({ color: v.color === key ? undefined : key })}
            className={cn(
              "grid h-6 w-6 cursor-pointer place-items-center rounded-md transition-colors hover:bg-fg/[0.07]",
              v.color === key && "bg-fg/[0.08] ring-1 ring-inset ring-fg/30"
            )}
          >
            <span className={cn("h-3.5 w-3.5 rounded-full", dot)} />
          </button>
        ))}
      </div>

      <span className="h-3.5 w-px bg-line" />

      {/* 굵기 */}
      <button
        type="button"
        title="굵게"
        onClick={() => {
          const next = !boldOn;
          set({ bold: next === defaultBold ? undefined : next });
        }}
        className={cn(
          "grid h-6 w-6 cursor-pointer place-items-center rounded-md text-[12px] font-bold transition-colors",
          boldOn ? "bg-fg text-bg" : "text-muted hover:text-fg"
        )}
      >
        B
      </button>
      </div>
    </div>
  );
}

function SectionFields({
  section: s,
  onChange,
}: {
  section: AboutSection;
  onChange: (content: AboutSection["content"], opts?: { save?: boolean }) => void;
}) {
  switch (s.type) {
    case "heading":
      return (
        <AutoTextarea
          value={s.content.text}
          onChange={(text) => onChange({ ...s.content, text })}
          placeholder={"페이지를 여는 큰 제목\n(줄바꿈 가능)"}
          className="text-lg font-bold leading-snug"
          rows={2}
          maxLength={200}
        />
      );

    case "text":
      return (
        <AutoTextarea
          value={s.content.text}
          onChange={(text) => onChange({ ...s.content, text })}
          placeholder="자유롭게 이야기를 적어주세요"
          rows={4}
          maxLength={2000}
        />
      );

    case "quote":
      return (
        <AutoTextarea
          value={s.content.text}
          onChange={(text) => onChange({ ...s.content, text })}
          placeholder="마음에 새겨둔 한 문장"
          className="font-medium"
          rows={2}
          maxLength={500}
        />
      );

    case "text_columns":
      return (
        <SwapPair
          labels={["왼쪽", "오른쪽"]}
          className="grid-cols-1 sm:grid-cols-2"
          onSwap={() =>
            onChange(
              { ...s.content, left: s.content.right, right: s.content.left },
              { save: true }
            )
          }
        >
          <ColumnField col={s.content.left} onChange={(left) => onChange({ ...s.content, left })} />
          <ColumnField
            col={s.content.right}
            onChange={(right) => onChange({ ...s.content, right })}
          />
        </SwapPair>
      );

    case "image_full":
      return (
        <div className="flex flex-col gap-2.5">
          <ImageField
            image={s.content.image}
            aspectHint="가로로 넓은 사진이 잘 어울려요"
            onChange={(image) => onChange({ ...s.content, image }, { save: true })}
          />
          <input
            value={s.content.caption}
            onChange={(e) => onChange({ ...s.content, caption: e.target.value })}
            placeholder="캡션 (선택)"
            maxLength={200}
            className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-body-sm outline-none placeholder:text-faint focus:border-fg/40"
          />
        </div>
      );

    case "image_pair": {
      const [a, b] = s.content.images ?? [null, null];
      return (
        <SwapPair
          labels={["왼쪽 · 크게", "오른쪽 · 아래로 어긋나게"]}
          className="grid-cols-2"
          onSwap={() => onChange({ images: [b, a] }, { save: true })}
        >
          <ImageField image={a} onChange={(img) => onChange({ images: [img, b] }, { save: true })} />
          <ImageField image={b} onChange={(img) => onChange({ images: [a, img] }, { save: true })} />
        </SwapPair>
      );
    }

    case "image_text": {
      // 실제 섹션과 같은 좌우 배치 — 반쪽을 드래그해 사진/텍스트 자리를 바꾼다
      const imageFirst = s.content.imageSide !== "right";
      const imageNode = (
        <ImageField
          key="img"
          image={s.content.image}
          aspectHint="세로 사진 추천"
          onChange={(image) => onChange({ ...s.content, image }, { save: true })}
        />
      );
      const textNode = (
        <div key="txt" className="flex flex-col gap-1.5">
          <StyleBar
            value={s.content.style}
            defaultBold={false}
            onChange={(style) => onChange({ ...s.content, style })}
          />
          <AutoTextarea
            value={s.content.text}
            onChange={(text) => onChange({ ...s.content, text })}
            placeholder="사진 옆에 흐르는 이야기"
            rows={5}
            maxLength={2000}
          />
        </div>
      );
      return (
        <SwapPair
          labels={imageFirst ? ["사진", "텍스트"] : ["텍스트", "사진"]}
          className="grid-cols-1 sm:grid-cols-2"
          onSwap={() =>
            onChange({ ...s.content, imageSide: imageFirst ? "right" : "left" }, { save: true })
          }
        >
          {imageFirst ? [imageNode, textNode] : [textNode, imageNode]}
        </SwapPair>
      );
    }
  }
}

// ── 좌우 반쪽 드래그 스왑 — 섹션 안의 두 칸을 바깥 섹션처럼 끌어서 자리를 바꾼다 ──
const PAIR_IDS = ["0", "1"];

function SwapPair({
  labels,
  className,
  onSwap,
  children,
}: {
  labels: [string, string];
  className?: string;
  onSwap: () => void;
  children: React.ReactNode[];
}) {
  return (
    <SortableGrid
      ids={PAIR_IDS}
      onReorder={(ids) => {
        if (ids[0] !== "0") onSwap();
      }}
      className={cn("grid gap-3", className)}
    >
      {(id) => {
        const i = id === "0" ? 0 : 1;
        return (
          <SortableItem key={id} id={id} instantDrop>
            {({ isDragging }) => (
              <div className={cn("flex h-full flex-col", isDragging && "opacity-90")}>
                <div className="flex cursor-grab items-center gap-1.5 pb-1.5 active:cursor-grabbing">
                  <GripIcon className="h-3.5 w-3.5 shrink-0 text-faint" />
                  <span className="text-caption text-faint">{labels[i]}</span>
                </div>
                {/* 편집 영역 — 안쪽 드래그 센서가 입력을 가로채지 않게 차단 */}
                <div
                  className="flex-1"
                  onPointerDown={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  {children[i]}
                </div>
              </div>
            )}
          </SortableItem>
        );
      }}
    </SortableGrid>
  );
}

function ColumnField({
  col,
  onChange,
}: {
  col: AboutColumn;
  onChange: (col: AboutColumn) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <StyleBar
        value={col.style}
        defaultBold={false}
        onChange={(style) => onChange({ ...col, style })}
      />
      <div className="flex items-center justify-end">
        <div className="flex gap-1">
          {(["text", "quote"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => onChange({ ...col, kind: k })}
              className={cn(
                "cursor-pointer rounded-full px-2 py-0.5 text-caption transition-colors",
                col.kind === k ? "bg-fg font-semibold text-bg" : "bg-fg/[0.06] text-muted hover:text-fg"
              )}
            >
              {k === "text" ? "단락" : "인용구"}
            </button>
          ))}
        </div>
      </div>
      <AutoTextarea
        value={col.text}
        onChange={(text) => onChange({ ...col, text })}
        placeholder={col.kind === "quote" ? "강조할 문장" : "이야기를 적어주세요"}
        rows={4}
        maxLength={2000}
      />
    </div>
  );
}

// ── 이미지 업로드 필드 ────────────────────────────────────────

function ImageField({
  image,
  aspectHint,
  onChange,
}: {
  image: AboutImage | null;
  aspectHint?: string;
  onChange: (image: AboutImage | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onPick(file: File) {
    setErr(null);
    setUploading(true);
    try {
      const small = await downscaleImage(file);
      const fd = new FormData();
      fd.append("file", small);
      const res = await fetch("/api/about/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "업로드에 실패했어요.");
      onChange(json as AboutImage);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "업로드에 실패했어요.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onPick(f);
          e.target.value = "";
        }}
      />
      {image?.url ? (
        <div className="group relative overflow-hidden rounded-xl bg-fg/[0.04]">
          {/* eslint-disable-next-line @next/next/no-img-element -- 편집 미리보기: 업로드 썸네일 그대로 */}
          <img
            src={image.thumbUrl ?? image.url}
            alt=""
            className="max-h-64 w-full object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1.5 bg-gradient-to-t from-black/50 to-transparent p-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="cursor-pointer rounded-full bg-white/90 px-2.5 py-1 text-caption font-medium text-black hover:bg-white disabled:opacity-50"
            >
              {uploading ? "업로드 중…" : "교체"}
            </button>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="cursor-pointer rounded-full bg-white/90 px-2.5 py-1 text-caption font-medium text-danger hover:bg-white"
            >
              지우기
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex aspect-[4/3] w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong text-muted transition-colors hover:border-fg/40 hover:text-fg disabled:opacity-60"
        >
          {uploading ? (
            <Spinner className="h-5 w-5" />
          ) : (
            <>
              <span className="text-xl leading-none">＋</span>
              <span className="text-caption">{aspectHint ?? "사진 올리기"}</span>
            </>
          )}
        </button>
      )}
      {err && <p className="mt-1 text-caption text-danger">{err}</p>}
    </div>
  );
}

// ── 자동 높이 텍스트영역 ─────────────────────────────────────

function AutoTextarea({
  value,
  onChange,
  placeholder,
  rows = 3,
  maxLength,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  className?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      maxLength={maxLength}
      className={cn(
        "w-full resize-y rounded-lg border border-line bg-bg px-3 py-2 text-body-sm leading-relaxed outline-none placeholder:text-faint focus:border-fg/40",
        className
      )}
    />
  );
}

// ── 템플릿 미니 프리뷰 (CSS 스케치) ──────────────────────────

function TypeThumb({ type }: { type: AboutSectionType }) {
  const bar = "rounded-[2px] bg-fg/20";
  const box = "rounded-[3px] bg-fg/15";
  return (
    <div className="flex h-14 flex-col justify-center gap-1 rounded-lg bg-fg/[0.04] p-2.5 transition-colors group-hover:bg-fg/[0.07]">
      {type === "heading" && (
        <>
          <div className={cn(bar, "h-2 w-4/5 bg-fg/35")} />
          <div className={cn(bar, "h-2 w-3/5 bg-fg/35")} />
        </>
      )}
      {type === "text" && (
        <>
          <div className={cn(bar, "h-1 w-full")} />
          <div className={cn(bar, "h-1 w-full")} />
          <div className={cn(bar, "h-1 w-3/5")} />
        </>
      )}
      {type === "text_columns" && (
        <div className="flex gap-2">
          <div className="flex flex-1 flex-col gap-1">
            <div className={cn(bar, "h-1 w-full")} />
            <div className={cn(bar, "h-1 w-full")} />
            <div className={cn(bar, "h-1 w-2/3")} />
          </div>
          <div className="flex flex-1 flex-col gap-1 pt-1.5">
            <div className={cn(bar, "h-1 w-full")} />
            <div className={cn(bar, "h-1 w-1/2")} />
          </div>
        </div>
      )}
      {type === "quote" && (
        <div className="flex gap-1.5 px-2">
          <div className="w-0.5 self-stretch rounded bg-fg/40" />
          <div className="flex flex-1 flex-col justify-center gap-1">
            <div className={cn(bar, "h-1.5 w-full")} />
            <div className={cn(bar, "h-1.5 w-2/3")} />
          </div>
        </div>
      )}
      {type === "image_full" && <div className={cn(box, "h-full w-full")} />}
      {type === "image_pair" && (
        <div className="flex h-full gap-2">
          <div className={cn(box, "mb-2 w-1/2")} />
          <div className={cn(box, "mt-2 w-1/2")} />
        </div>
      )}
      {type === "image_text" && (
        <div className="flex h-full items-center gap-2">
          <div className={cn(box, "h-full w-1/2")} />
          <div className="flex flex-1 flex-col gap-1">
            <div className={cn(bar, "h-1 w-full")} />
            <div className={cn(bar, "h-1 w-full")} />
            <div className={cn(bar, "h-1 w-1/2")} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── 아이콘 ───────────────────────────────────────────────────

function AlignIcon({
  variant,
  className,
}: {
  variant: "left" | "center" | "right";
  className?: string;
}) {
  const d =
    variant === "left"
      ? "M2 4h12M2 8h8M2 12h10"
      : variant === "center"
        ? "M2 4h12M4 8h8M3 12h10"
        : "M2 4h12M6 8h8M4 12h10";
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className={className} aria-hidden>
      <path d={d} strokeLinecap="round" />
    </svg>
  );
}

function GripIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden>
      <circle cx="5.5" cy="4" r="1.2" />
      <circle cx="10.5" cy="4" r="1.2" />
      <circle cx="5.5" cy="8" r="1.2" />
      <circle cx="10.5" cy="8" r="1.2" />
      <circle cx="5.5" cy="12" r="1.2" />
      <circle cx="10.5" cy="12" r="1.2" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" className={className} aria-hidden>
      <path d="M2.5 4.5h11M6.5 2.5h3M5.5 4.5l.5 9h4l.5-9M6.8 7v4M9.2 7v4" strokeLinecap="round" />
    </svg>
  );
}
