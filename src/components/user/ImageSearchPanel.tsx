"use client";

/**
 * 사진으로 검색 패널 — 검색창 카메라 버튼을 누르면 바로 아래에 펼쳐진다. (docs/46 §1, §3)
 *
 * 넣는 방법 셋을 모두 받는다: 끌어다 놓기 · 파일 고르기 · 붙여넣기(Ctrl+V).
 * 사진은 여기서 512px 로 줄여 이 탭에만 두고, 결과 화면(/search/image)이 그걸로 검색한다 —
 * 원본은 서버에 올라가지 않는다.
 */
import { useEffect, useRef, useState } from "react";

import { firstImage } from "@/lib/image-search-client";
import { useImageSearchUpload } from "@/lib/use-image-search-upload";
import { XIcon } from "./icons";

export function ImageSearchPanel({ onClose }: { onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const { accept, busy, error } = useImageSearchUpload();

  // 패널이 열려 있는 동안만 — 붙여넣기를 받고, Esc·바깥 클릭으로 닫는다
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = firstImage(event.clipboardData?.items);
      if (file) {
        event.preventDefault();
        void accept(file);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      // 카메라 버튼은 스스로 여닫는다 — 여기서 먼저 닫으면 다시 열려 영영 안 닫힌다
      if (target?.closest?.("[data-image-search-toggle]")) return;
      if (!boxRef.current?.contains(target)) onClose();
    };
    window.addEventListener("paste", onPaste);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [accept, onClose]);

  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-label="사진으로 검색"
      className="absolute left-0 right-0 top-full z-40 mt-2 rounded-xl border border-line bg-surface p-4 shadow-lg"
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="text-body-sm font-semibold">사진으로 검색</p>
        <button type="button" aria-label="닫기" onClick={onClose} className="text-muted hover:text-fg">
          <XIcon className="h-4 w-4" />
        </button>
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void accept(firstImage(event.dataTransfer?.items));
        }}
        className={`rounded-lg border border-dashed px-4 py-6 text-center transition-colors ${
          dragging ? "border-brand bg-brand/5" : "border-line-strong"
        }`}
      >
        {busy ? (
          <p className="text-body-sm text-muted">사진을 읽고 있어요…</p>
        ) : (
          <>
            <p className="text-body-sm text-muted">
              사진을 여기로 끌어다 놓거나 <span className="hidden sm:inline">붙여넣어 주세요</span>
            </p>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="mt-3 rounded-full bg-fg px-4 py-2 text-caption font-semibold text-bg"
            >
              사진 고르기
            </button>
          </>
        )}
      </div>

      <p className="mt-2 text-caption text-faint">
        올린 사진은 저장하지 않아요. 비슷한 분위기를 찾는 데만 써요.
      </p>
      {error && <p className="mt-2 text-caption text-danger">{error}</p>}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => void accept(event.target.files?.[0] ?? null)}
      />
    </div>
  );
}
