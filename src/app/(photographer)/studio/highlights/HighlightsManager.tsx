"use client";

/* eslint-disable @next/next/no-img-element */
import { useRef, useState } from "react";
import type { Highlight } from "@/lib/highlights";
import { createHighlight, updateHighlight, deleteHighlight, reorderHighlight } from "./actions";

export type PickPhoto = { id: string; src_url: string; thumb_url: string };

// 커버 미리보기 URL — cover_url > 커버 사진 > 첫 항목
function coverOf(h: Highlight): string | null {
  if (h.cover_url) return h.cover_url;
  if (h.cover_photo_id) {
    const f = h.items.find((it) => it.photo_id === h.cover_photo_id);
    if (f) return f.thumb_url ?? f.src_url;
  }
  return h.items[0]?.thumb_url ?? h.items[0]?.src_url ?? null;
}

export function HighlightsManager({
  highlights,
  photos,
}: {
  highlights: Highlight[];
  photos: PickPhoto[];
}) {
  const [editing, setEditing] = useState<Highlight | "new" | null>(null);

  return (
    <>
      <div className="mt-6">
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="rounded-full bg-fg px-4 py-2 text-sm font-semibold text-bg hover:opacity-90"
        >
          + 새 하이라이트
        </button>
      </div>

      {highlights.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-fg/20 py-14 text-center">
          <p className="text-sm text-fg/55">아직 하이라이트가 없어요.</p>
          <p className="mt-1 text-xs text-fg/40">공개한 포트폴리오 사진으로 첫 컬렉션을 만들어보세요.</p>
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {highlights.map((h, i) => {
            const cover = coverOf(h);
            return (
              <li
                key={h.id}
                className="flex items-center gap-3 rounded-xl border border-fg/10 p-3"
              >
                <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-fg/[0.06] ring-2 ring-fg/10">
                  {cover ? (
                    <img src={cover} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-fg/30">+</span>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{h.title || "제목 없음"}</p>
                  <p className="text-xs text-fg/45">{h.items.length}장</p>
                </div>

                {/* 순서 이동 */}
                <div className="flex items-center gap-1">
                  {i > 0 && (
                    <ReorderBtn id={h.id} dir="up" label="↑" />
                  )}
                  {i < highlights.length - 1 && (
                    <ReorderBtn id={h.id} dir="down" label="↓" />
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setEditing(h)}
                  className="rounded-full border border-fg/20 px-3 py-1.5 text-xs text-fg/70 hover:bg-fg/[0.04]"
                >
                  수정
                </button>
                <form
                  action={deleteHighlight}
                  onSubmit={(e) => {
                    if (!confirm(`'${h.title || "제목 없음"}' 하이라이트를 삭제할까요?`)) e.preventDefault();
                  }}
                >
                  <input type="hidden" name="id" value={h.id} />
                  <button className="rounded-full px-3 py-1.5 text-xs text-brand hover:bg-brand/[0.06]">
                    삭제
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <HighlightEditor
          highlight={editing === "new" ? null : editing}
          photos={photos}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function ReorderBtn({ id, dir, label }: { id: string; dir: "up" | "down"; label: string }) {
  return (
    <form action={reorderHighlight}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="dir" value={dir} />
      <button
        aria-label={dir === "up" ? "위로" : "아래로"}
        className="grid h-7 w-7 place-items-center rounded-full border border-fg/15 text-xs text-fg/60 hover:bg-fg/[0.04]"
      >
        {label}
      </button>
    </form>
  );
}

// ───────── 생성/수정 모달 ─────────
function HighlightEditor({
  highlight,
  photos,
  onClose,
}: {
  highlight: Highlight | null;
  photos: PickPhoto[];
  onClose: () => void;
}) {
  const isEdit = !!highlight;
  const photoById = new Map(photos.map((p) => [p.id, p]));

  const [title, setTitle] = useState(highlight?.title ?? "");
  const [selected, setSelected] = useState<string[]>(highlight?.items.map((it) => it.photo_id) ?? []);
  const [coverUrl, setCoverUrl] = useState<string | null>(highlight?.cover_url ?? null);
  const [coverPhotoId, setCoverPhotoId] = useState<string | null>(highlight?.cover_photo_id ?? null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }
  function move(id: string, dir: -1 | 1) {
    setSelected((prev) => {
      const i = prev.indexOf(id);
      const j = i + dir;
      if (i === -1 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function onCoverFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/highlight/cover", { method: "POST", body: fd });
    const json = await res.json().catch(() => ({}));
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    if (res.ok && json.url) {
      setCoverUrl(json.url);
      setCoverPhotoId(null);
    }
  }

  // 커버 미리보기
  const coverPreview =
    coverUrl ??
    (coverPhotoId ? photoById.get(coverPhotoId)?.thumb_url ?? null : null) ??
    (selected[0] ? photoById.get(selected[0])?.thumb_url ?? null : null);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 font-kr" onClick={onClose}>
      <form
        action={isEdit ? updateHighlight : createHighlight}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          if (selected.length === 0) {
            e.preventDefault();
            alert("사진을 한 장 이상 선택해주세요.");
          }
        }}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">{isEdit ? "하이라이트 수정" : "새 하이라이트"}</h3>
          <button type="button" onClick={onClose} className="text-sm text-fg/50 hover:text-fg">
            닫기
          </button>
        </div>

        {isEdit && <input type="hidden" name="id" value={highlight!.id} />}
        <input type="hidden" name="photo_ids" value={selected.join(",")} />
        <input type="hidden" name="cover_url" value={coverUrl ?? ""} />
        <input type="hidden" name="cover_photo_id" value={coverUrl ? "" : coverPhotoId ?? ""} />

        {/* 커버 + 제목 */}
        <div className="mt-4 flex items-center gap-3">
          <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-fg/[0.06] ring-2 ring-fg/10">
            {coverPreview ? (
              <img src={coverPreview} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-fg/30 text-xs">커버</span>
            )}
          </span>
          <div className="flex-1">
            <input
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={30}
              placeholder="제목 (예: 웨딩, 프로필)"
              className="w-full rounded-lg border border-fg/15 bg-white px-3 py-2 text-sm outline-none focus:border-fg/40"
            />
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onCoverFile(e.target.files)} />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="mt-1.5 text-xs text-fg/50 underline hover:text-fg disabled:opacity-50"
            >
              {uploading ? "업로드 중…" : "커버 직접 올리기"}
            </button>
          </div>
        </div>

        {/* 사진 선택 — 탭하면 선택/해제, 선택 순서대로 스토리 노출 */}
        <p className="mt-5 text-sm font-medium">
          사진 선택 <span className="text-xs font-normal text-fg/45">{selected.length}장</span>
        </p>
        {photos.length === 0 ? (
          <p className="mt-2 text-sm text-fg/45">공개된 포트폴리오 사진이 없어요. 먼저 사진을 공개해주세요.</p>
        ) : (
          <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-5">
            {photos.map((p) => {
              const order = selected.indexOf(p.id);
              const on = order >= 0;
              return (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => toggle(p.id)}
                  className={`relative aspect-square overflow-hidden rounded-lg ring-2 ${
                    on ? "ring-fg" : "ring-transparent"
                  }`}
                >
                  <img src={p.thumb_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                  {on && (
                    <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-fg text-[10px] font-bold text-bg">
                      {order + 1}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* 선택 순서 조정 + 커버 지정 */}
        {selected.length > 0 && (
          <div className="mt-4">
            <p className="text-xs text-fg/45">노출 순서 · 사진을 눌러 커버로 지정</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {selected.map((id, i) => {
                const p = photoById.get(id);
                if (!p) return null;
                const isCover = !coverUrl && coverPhotoId === id;
                return (
                  <div key={id} className="flex flex-col items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setCoverPhotoId(id);
                        setCoverUrl(null);
                      }}
                      className={`relative h-14 w-14 overflow-hidden rounded-lg ring-2 ${
                        isCover ? "ring-amber-500" : "ring-fg/10"
                      }`}
                      title="커버로 지정"
                    >
                      <img src={p.thumb_url} alt="" className="h-full w-full object-cover" />
                      {isCover && (
                        <span className="absolute inset-x-0 bottom-0 bg-amber-500 text-center text-[9px] font-bold text-white">
                          커버
                        </span>
                      )}
                    </button>
                    <div className="flex gap-0.5">
                      <button type="button" onClick={() => move(id, -1)} aria-label="앞으로" className="grid h-5 w-5 place-items-center rounded border border-fg/15 text-[10px] text-fg/60 hover:bg-fg/[0.04]">←</button>
                      <button type="button" onClick={() => move(id, 1)} aria-label="뒤로" className="grid h-5 w-5 place-items-center rounded border border-fg/15 text-[10px] text-fg/60 hover:bg-fg/[0.04]">→</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <button
          type="submit"
          className="mt-6 w-full rounded-full bg-fg py-3 text-sm font-semibold text-bg hover:opacity-90"
        >
          {isEdit ? "저장" : "만들기"}
        </button>
      </form>
    </div>
  );
}
