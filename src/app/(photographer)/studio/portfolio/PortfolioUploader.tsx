"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";

// 업로드에 필요한 입력 묶음 — 실제 업로드는 PortfolioManager가 수행(모달 닫혀도 계속).
export type UploadPayload = {
  files: File[];
  description: string;
  price: string;
  location: string;
  moods: string;
  publish: boolean;
};

// 포트폴리오 입력 폼 — 드롭존 + 미리보기 + 공통 정보. 제출 시 onStart로 넘긴다.
export function PortfolioUploader({ onStart }: { onStart: (p: UploadPayload) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [location, setLocation] = useState("");
  const [moods, setMoods] = useState("");
  const [publish, setPublish] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  function addFiles(list: FileList | null) {
    const imgs = Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));
    if (imgs.length) setFiles((prev) => [...prev, ...imgs]);
  }
  function removeAt(i: number) {
    setFiles((prev) => prev.filter((_, idx) => idx !== i));
  }

  function submit() {
    if (files.length === 0) {
      setError("사진을 1장 이상 선택하세요.");
      return;
    }
    onStart({ files, description, price, location, moods, publish });
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
          <span className="grid h-12 w-12 place-items-center rounded-full bg-fg/[0.06] text-2xl">🖼</span>
          <span className="text-sm font-medium">사진을 끌어다 놓거나 클릭해 선택</span>
          <span className="text-xs text-fg/45">JPG·PNG · 장당 15MB 이하 · 여러 장 = 한 피드</span>
        </button>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
            {previews.map((src, i) => (
              <div key={src} className="group relative aspect-square overflow-hidden rounded-lg bg-fg/[0.06]">
                <img src={src} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  aria-label="제거"
                  className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="grid aspect-square place-items-center rounded-lg border border-dashed border-fg/25 text-xl text-fg/40 hover:border-fg/40 hover:text-fg/60"
            >
              +
            </button>
          </div>
          <p className="mt-2 text-xs text-fg/50">
            {files.length}장 선택됨{files.length > 1 ? " · 하나의 피드로 묶여요" : ""}
          </p>
        </>
      )}

      {/* 공통 정보 — 항상 노출 */}
      <div className="mt-4 flex flex-col gap-3 border-t border-fg/10 pt-4">
        <label className="flex flex-col gap-1 text-xs text-fg/55">
          설명 (선택)
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="이 촬영에 대한 설명을 적어주세요. (컨셉·장소·후기 등)"
            className="resize-none rounded-lg border border-fg/15 bg-white px-3 py-2 text-sm text-fg outline-none focus:border-fg/40"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs text-fg/55">
            가격 (원, 선택)
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              type="number"
              min={0}
              step={1000}
              placeholder="예: 50000"
              className="rounded-lg border border-fg/15 bg-white px-3 py-2 text-sm text-fg outline-none focus:border-fg/40"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-fg/55">
            장소 (선택)
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={120}
              placeholder="예: 성수동 카페"
              className="rounded-lg border border-fg/15 bg-white px-3 py-2 text-sm text-fg outline-none focus:border-fg/40"
            />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-xs text-fg/55">
          무드 태그 (쉼표, 선택)
          <input
            value={moods}
            onChange={(e) => setMoods(e.target.value)}
            placeholder="예: 감성, 흑백"
            className="rounded-lg border border-fg/15 bg-white px-3 py-2 text-sm text-fg outline-none focus:border-fg/40"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={publish}
            onChange={(e) => setPublish(e.target.checked)}
            className="h-4 w-4 rounded border-fg/30"
          />
          올리면서 바로 공개 (끄면 비공개 저장)
        </label>

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
