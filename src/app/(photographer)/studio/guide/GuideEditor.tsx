"use client";

import { useRef, useState } from "react";
import { downscaleImage } from "@/lib/downscale";
import type { GuideImage } from "@/lib/guide-images";
import {
  addGuideImage,
  removeGuideImage,
  reorderGuideImages,
  updateGuideImage,
} from "./actions";

type Row = GuideImage & { published: boolean };

// 안내 이미지 편집기 — 업로드는 /api/guide/upload(리사이즈·썸네일) 후 서버 액션으로 행 생성.
// 정렬은 위/아래 버튼만 둔다(장수가 적고 모바일에서 드래그가 불편해서).
export function GuideEditor({ initialImages }: { initialImages: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initialImages);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onPick(file: File) {
    setError(null);
    setUploading(true);
    try {
      const small = await downscaleImage(file);
      const fd = new FormData();
      fd.append("file", small);
      const res = await fetch("/api/guide/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "업로드에 실패했어요.");

      const { id } = await addGuideImage({
        imageUrl: json.url,
        thumbUrl: json.thumbUrl,
        width: json.width,
        height: json.height,
      });
      setRows((prev) => [
        ...prev,
        {
          id,
          image_url: json.url,
          thumb_url: json.thumbUrl ?? null,
          width: json.width ?? null,
          height: json.height ?? null,
          caption: "",
          sort_order: prev.length,
          published: true,
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드에 실패했어요.");
    } finally {
      setUploading(false);
    }
  }

  function patch(id: string, next: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...next } : r)));
  }

  async function onSaveCaption(row: Row) {
    setError(null);
    try {
      await updateGuideImage(row.id, { caption: row.caption });
    } catch (e) {
      setError(e instanceof Error ? e.message : "설명 저장에 실패했어요.");
    }
  }

  async function onTogglePublished(row: Row) {
    const next = !row.published;
    patch(row.id, { published: next });
    try {
      await updateGuideImage(row.id, { published: next });
    } catch (e) {
      patch(row.id, { published: row.published }); // 실패하면 되돌린다
      setError(e instanceof Error ? e.message : "공개 설정에 실패했어요.");
    }
  }

  async function onDelete(id: string) {
    const before = rows;
    setRows((prev) => prev.filter((r) => r.id !== id));
    try {
      await removeGuideImage(id);
    } catch (e) {
      setRows(before);
      setError(e instanceof Error ? e.message : "삭제에 실패했어요.");
    }
  }

  function onMove(index: number, dir: -1 | 1) {
    const to = index + dir;
    if (to < 0 || to >= rows.length) return;
    const next = [...rows];
    [next[index], next[to]] = [next[to], next[index]];
    setRows(next);
    void reorderGuideImages(next.map((r) => r.id)).catch(() =>
      setError("순서 저장에 실패했어요.")
    );
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

      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-caption text-faint">{rows.length}장 등록됨</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="cursor-pointer rounded-full bg-fg px-4 py-2 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {uploading ? "업로드 중…" : "이미지 추가"}
        </button>
      </div>

      {error && (
        <p className="mb-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-body-sm text-danger">
          {error}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-10 text-center text-body-sm text-muted">
          아직 안내 이미지가 없어요. 위 &lsquo;이미지 추가&rsquo;로 첫 장을 올려보세요.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row, i) => (
            <li
              key={row.id}
              className="flex gap-3 rounded-2xl border border-line bg-surface p-3"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- 편집 미리보기: 업로드 썸네일 그대로 */}
              <img
                src={row.thumb_url ?? row.image_url}
                alt=""
                className="h-24 w-20 shrink-0 rounded-lg object-cover"
              />

              <div className="min-w-0 flex-1">
                <input
                  value={row.caption}
                  maxLength={200}
                  onChange={(e) => patch(row.id, { caption: e.target.value })}
                  onBlur={() => void onSaveCaption(row)}
                  placeholder="설명 (선택) — 뷰어 아래에 보여요"
                  className="w-full rounded-lg border border-fg/15 bg-bg px-3 py-2 text-body-sm outline-none focus:border-fg/40"
                />

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void onTogglePublished(row)}
                    className={`cursor-pointer rounded-full px-3 py-1 text-caption font-medium transition-colors ${
                      row.published
                        ? "bg-fg/[0.08] text-fg hover:bg-fg/[0.12]"
                        : "bg-fg/[0.04] text-fg/45 hover:bg-fg/[0.08]"
                    }`}
                  >
                    {row.published ? "공개" : "비공개"}
                  </button>

                  <button
                    type="button"
                    onClick={() => onMove(i, -1)}
                    disabled={i === 0}
                    aria-label="위로"
                    className="cursor-pointer rounded-full border border-line px-2.5 py-1 text-caption text-fg/65 hover:bg-surface-2 disabled:opacity-35"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => onMove(i, 1)}
                    disabled={i === rows.length - 1}
                    aria-label="아래로"
                    className="cursor-pointer rounded-full border border-line px-2.5 py-1 text-caption text-fg/65 hover:bg-surface-2 disabled:opacity-35"
                  >
                    ↓
                  </button>

                  <button
                    type="button"
                    onClick={() => void onDelete(row.id)}
                    className="ml-auto cursor-pointer rounded-full px-3 py-1 text-caption text-danger hover:bg-danger-soft"
                  >
                    삭제
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
