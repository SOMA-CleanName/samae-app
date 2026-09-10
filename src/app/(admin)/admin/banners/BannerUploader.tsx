"use client";

import { useRef, useState } from "react";
import { downscaleImage } from "@/lib/downscale";

type Uploaded = { url: string; thumbUrl: string; width: number | null; height: number | null };

// 배너 이미지 선택 → /api/banner/upload 로 즉시 업로드 → 결과를 hidden 으로 폼에 실어보낸다.
// (Vercel 함수 본문 한계가 있어 업로드 전 클라이언트에서 2000px 로 줄인다.)
export function BannerUploader() {
  const [img, setImg] = useState<Uploaded | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const small = await downscaleImage(file, 2000, 0.85);
      const fd = new FormData();
      fd.append("file", small);
      const res = await fetch("/api/banner/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "업로드에 실패했어요.");
      setImg(json as Uploaded);
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드에 실패했어요.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void pick(f);
        }}
      />

      {img ? (
        <div className="overflow-hidden rounded-xl border border-line">
          {/* 실제 노출 비율(모바일 16:9)로 미리보기 — 잘림을 여기서 바로 확인 */}
          {/* eslint-disable-next-line @next/next/no-img-element -- 외부 Storage 프리뷰, 최적화 불필요 */}
          <img src={img.thumbUrl} alt="배너 미리보기" className="aspect-[16/9] w-full object-cover" />
        </div>
      ) : (
        <div className="flex aspect-[16/9] w-full items-center justify-center rounded-xl border border-dashed border-line text-caption text-muted">
          권장 2000×1125 (16:9 가로형)
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="cursor-pointer rounded-lg border border-line px-3 py-1.5 text-caption font-semibold transition-colors hover:bg-fg/[0.05] disabled:opacity-50"
        >
          {busy ? "업로드 중…" : img ? "이미지 변경" : "이미지 선택"}
        </button>
        {error && <span className="text-caption text-danger">{error}</span>}
      </div>

      {/* 서버 액션으로 넘길 업로드 결과 */}
      <input type="hidden" name="image_url" value={img?.url ?? ""} />
      <input type="hidden" name="thumb_url" value={img?.thumbUrl ?? ""} />
      <input type="hidden" name="width" value={img?.width ?? ""} />
      <input type="hidden" name="height" value={img?.height ?? ""} />
    </div>
  );
}
