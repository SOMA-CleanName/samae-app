"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useRef, useState } from "react";
import { TagInput } from "./TagInput";
import { HelpTip } from "./HelpTip";
import { SortableGrid, SortableItem } from "@/components/ui/SortableGrid";

// 가격 선택지로 쓰는 작가 패키지 (활성 패키지만)
export type PackageOption = { id: string; name: string; price_krw: number };

// 업로드에 필요한 입력 묶음 — 실제 업로드는 PortfolioManager가 수행(모달 닫혀도 계속).
export type UploadPayload = {
  files: File[];
  description: string;
  price: string;
  location: string;
  moods: string;
  publish: boolean;
};

const fmt = new Intl.NumberFormat("ko-KR");

// 포트폴리오 입력 폼 — 드롭존 + 미리보기 + 공통 정보. 제출 시 onStart로 넘긴다.
export function PortfolioUploader({
  onStart,
  packages,
}: {
  onStart: (p: UploadPayload) => void;
  packages: PackageOption[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [location, setLocation] = useState("");
  const [moodTags, setMoodTags] = useState<string[]>([]);
  const [publish, setPublish] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 미리보기 URL — files 에서 파생(useMemo). 이전 URL 은 정리 effect 에서 revoke.
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  function addFiles(list: FileList | null) {
    const imgs = Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));
    if (imgs.length) setFiles((prev) => [...prev, ...imgs]);
  }
  function removeAt(i: number) {
    setFiles((prev) => prev.filter((_, idx) => idx !== i));
  }
  function reorderFiles(ids: string[]) {
    setFiles((prev) => {
      const byKey = new Map(prev.map((file) => [fileKey(file), file]));
      return ids.map((id) => byKey.get(id)).filter((file): file is File => !!file);
    });
  }
  function makeCover(i: number) {
    setFiles((prev) => [
      ...prev.filter((_, idx) => idx === i),
      ...prev.filter((_, idx) => idx !== i),
    ]);
  }

  function submit() {
    if (files.length === 0) {
      setError("사진을 1장 이상 선택하세요.");
      return;
    }
    onStart({ files, description, price, location, moods: moodTags.join(", "), publish });
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {/* 사진 선택 영역 */}
      {files.length === 0 ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            addFiles(e.dataTransfer.files);
          }}
          className={`flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed py-12 transition-colors ${
            dragOver ? "border-fg/50 bg-fg/[0.04]" : "border-fg/20 hover:border-fg/35 hover:bg-fg/[0.02]"
          }`}
        >
          <span className="grid h-12 w-12 place-items-center rounded-full bg-fg/[0.06] text-2xl">📷</span>
          <span className="text-sm font-medium">사진을 끌어다 놓거나 클릭해 선택</span>
          <span className="text-xs text-fg/55">JPG·PNG · 장당 15MB 이하 · 여러 장 = 한 피드</span>
        </button>
      ) : (
        <>
          <SortableGrid
            ids={files.map(fileKey)}
            onReorder={reorderFiles}
            disabled={files.length < 2}
            className="grid grid-cols-4 gap-2 sm:grid-cols-5"
            append={
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="grid aspect-square place-items-center rounded-lg border border-dashed border-fg/25 text-xl text-fg/40 hover:border-fg/40 hover:text-fg/60"
              >
                +
              </button>
            }
          >
            {(id) => {
              const i = files.findIndex((file) => fileKey(file) === id);
              const src = previews[i];
              if (i < 0 || !src) return null;
              const isCover = i === 0;
              return (
                <SortableItem
                  key={id}
                  id={id}
                  className={`group relative aspect-square overflow-hidden rounded-lg bg-fg/[0.06] ${
                    files.length > 1 ? "cursor-grab touch-manipulation select-none active:cursor-grabbing" : ""
                  }`}
                >
                  {({ isDragging }) => (
                    <div className={isDragging ? "h-full shadow-2xl ring-2 ring-fg/30" : "h-full"}>
                      <img src={src} alt="" draggable={false} className="pointer-events-none h-full w-full select-none object-cover" />
                      <div
                        onPointerDown={(e) => e.stopPropagation()}
                        className="absolute left-1.5 top-1.5 flex flex-col items-start gap-1"
                      >
                        {isCover ? (
                          <span className="rounded-full bg-fg px-2 py-0.5 text-[10px] font-semibold text-bg shadow">
                            대표
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => makeCover(i)}
                            className="rounded-full bg-surface/90 px-2 py-0.5 text-[10px] font-semibold text-fg opacity-0 shadow transition-opacity hover:bg-surface group-hover:opacity-100"
                          >
                            대표로
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => removeAt(i)}
                        aria-label="제거"
                        className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </SortableItem>
              );
            }}
          </SortableGrid>
          <p className="mt-2 text-xs text-fg/50">
            {files.length}장 선택됨{files.length > 1 ? " · 첫 번째 사진이 대표예요" : ""}
          </p>
        </>
      )}

      {/* 공통 정보 — 항상 노출 */}
      <div className="mt-4 flex flex-col gap-3 border-t border-fg/10 pt-4">
        <label className="flex flex-col gap-1 text-xs text-fg/60">
          설명
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="이 촬영에 대한 설명을 적어주세요."
            className="resize-none rounded-lg border border-fg/15 bg-surface px-3 py-2 text-sm text-fg outline-none placeholder:text-fg/45 focus:border-fg/40"
          />
        </label>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs text-fg/60">
            <span className="flex items-center gap-1">
              가격
              <HelpTip label="가격 안내">
                패키지로 등록한 가격 중에서만 선택할 수 있어요. ‘가격 미표시’는 가급적 피하고 가격을 함께 보여주세요.
              </HelpTip>
            </span>
            {packages.length > 0 ? (
              <select
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="h-[38px] rounded-lg border border-fg/15 bg-surface px-3 text-sm text-fg outline-none focus:border-fg/40"
              >
                <option value="">가격 미표시</option>
                {packages.map((pk) => (
                  <option key={pk.id} value={String(pk.price_krw)}>
                    {pk.name} · ₩{fmt.format(pk.price_krw)}
                  </option>
                ))}
              </select>
            ) : (
              <a
                href="/studio/packages"
                className="flex h-[38px] items-center gap-1 whitespace-nowrap rounded-lg border border-dashed border-fg/25 px-3 text-sm text-fg/60 hover:border-fg/40 hover:text-fg"
              >
                패키지를 먼저 등록하세요 <span aria-hidden>→</span>
              </a>
            )}
          </label>
          <label className="flex flex-col gap-1 text-xs text-fg/60">
            <span className="flex items-center gap-1">
              장소
              <HelpTip label="장소 안내">
                정확한 장소가 아니어도 괜찮아요. 작가님이 자유롭게 적어주세요.
              </HelpTip>
            </span>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={120}
              placeholder="예: 성수동 카페, 골목 어귀"
              className="rounded-lg border border-fg/15 bg-surface px-3 py-2 text-sm text-fg outline-none placeholder:text-fg/45 focus:border-fg/40"
            />
          </label>
        </div>
        <div className="flex flex-col gap-1 text-xs text-fg/60">
          <span className="flex items-center gap-1">
            태그
            <HelpTip label="태그 안내">
              촬영 목적 태그(예: 웨딩 스냅, 데이트 스냅)는 1~2개만 적어주세요. 나머지는 자유롭게 적되, 모델의 성별·나이 같은 정보는 빼주세요. 최대 5개예요.
            </HelpTip>
          </span>
          <TagInput onChange={setMoodTags} max={5} placeholder="예: 감성 (Enter)" />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={publish}
              onChange={(e) => setPublish(e.target.checked)}
              className="h-4 w-4 rounded border-fg/30"
            />
            올리면서 바로 공개 (끄면 비공개 저장)
          </label>
          <HelpTip label="공개 안내" placement="top">
            체크하면 메인 탐색 탭과 작가 프로필 포트폴리오에 바로 표시돼요.
          </HelpTip>
        </div>

        {error && <p className="text-xs text-brand">{error}</p>}

        <button
          type="button"
          disabled={files.length === 0}
          onClick={submit}
          className="rounded-full bg-fg py-3 text-sm font-semibold text-bg hover:opacity-90 disabled:opacity-50"
        >
          {files.length > 0 ? `${files.length}장 올리기` : "사진을 선택하세요"}
        </button>
      </div>
    </div>
  );
}

function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}
