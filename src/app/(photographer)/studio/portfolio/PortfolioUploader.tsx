"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPost } from "./actions";

// 포트폴리오 업로더 — 인스타식 단일 흐름. 1장이든 여러 장이든 똑같이 선택해 올린다.
// 같이 올린 사진은 하나의 "피드"로 묶여, 프로필 그리드엔 대표 1장만 보이고 클릭 시 스와이프.
export function PortfolioUploader() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);

  // 공통 입력값 (선택)
  const [price, setPrice] = useState("");
  const [location, setLocation] = useState("");
  const [moods, setMoods] = useState("");
  const [publish, setPublish] = useState(true);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setFiles([]);
    setPrice("");
    setLocation("");
    setMoods("");
    setPublish(true);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function onUpload() {
    if (files.length === 0) {
      setError("사진을 1장 이상 선택하세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // 이번 업로드를 하나의 게시물로 묶음
      const { id: albumId } = await createPost();
      for (let i = 0; i < files.length; i++) {
        setProgress(`업로드 중… ${i + 1}/${files.length}`);
        const fd = new FormData();
        fd.append("file", files[i]);
        fd.append("album_id", albumId);
        if (price.trim()) fd.append("price_krw", price.trim());
        if (location.trim()) fd.append("location_text", location.trim());
        if (moods.trim()) fd.append("mood_tags", moods.trim());
        fd.append("visibility", publish ? "published" : "draft");

        const res = await fetch("/api/portfolio/upload", { method: "POST", body: fd });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? "업로드 실패");
        }
      }
      reset();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드 실패");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-fg/25 p-5">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
      />

      {/* 사진 선택 */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="rounded-full bg-fg px-5 py-2.5 text-sm font-semibold text-bg hover:opacity-90 disabled:opacity-50"
        >
          사진 선택
        </button>
        <span className="text-sm text-fg/55">
          {files.length > 0
            ? `${files.length}장 선택됨${files.length > 1 ? " · 하나의 피드로 묶여요" : ""}`
            : "JPG·PNG, 장당 15MB 이하"}
        </span>
      </div>

      {/* 공통 정보 (선택) — 사진 골랐을 때만 노출 */}
      {files.length > 0 && (
        <div className="mt-4 flex flex-col gap-3 border-t border-fg/10 pt-4">
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
              placeholder="예: 감성, 흑백 (비우면 작가 기본값)"
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
            disabled={busy}
            onClick={onUpload}
            className="rounded-full bg-fg px-5 py-2.5 text-sm font-semibold text-bg hover:opacity-90 disabled:opacity-50"
          >
            {busy ? progress ?? "업로드 중…" : `${files.length}장 올리기`}
          </button>
        </div>
      )}

      {error && files.length === 0 && <p className="mt-2 text-xs text-brand">{error}</p>}
    </div>
  );
}
