"use client";

/* eslint-disable @next/next/no-img-element */
import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Highlight } from "@/lib/highlights";
import { createHighlight, updateHighlight, deleteHighlight, setHighlightOrder } from "./actions";

export type PickPhoto = { id: string; src_url: string; thumb_url: string };

// 편집 중 항목 — 포트폴리오 사진(photo_id) 또는 직접 업로드(image_url)
type EditItem = { key: string; photo_id: string | null; image_url: string | null; src: string };

// 커버 미리보기 URL — cover_url > 커버 사진 > 첫 항목
function coverOf(h: Highlight): string | null {
  if (h.cover_url) return h.cover_url;
  if (h.cover_photo_id) {
    const f = h.items.find((it) => it.photo_id === h.cover_photo_id);
    if (f) return f.thumb_url ?? f.src_url;
  }
  return h.items[0]?.thumb_url ?? h.items[0]?.src_url ?? null;
}

// ───────── 크롭 유틸 ─────────
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // 포트폴리오(스토리지 cross-origin) 이미지도 canvas 합성 가능하게
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}
// 9:16 프레임(1080×1920)에 이미지를 contain(전체 보임)으로 합성 — 흐린 배경 + 전경.
// 미리보기(object-contain + translate/scale)와 동일 좌표로 그려 "보이는 그대로" 업로드한다.
const OUT_W = 1080;
const OUT_H = 1920;
async function composeFrame(
  src: string,
  frameW: number,
  scale: number,
  tx: number,
  ty: number
): Promise<Blob | null> {
  const img = await loadImage(src);
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = OUT_W;
  canvas.height = OUT_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const R = OUT_W / frameW; // 미리보기 px → 출력 px 배율 (프레임도 9:16)

  // 흐린 배경 (cover)
  const cov = Math.max(OUT_W / iw, OUT_H / ih);
  ctx.filter = "blur(36px)";
  ctx.drawImage(img, (OUT_W - iw * cov) / 2, (OUT_H - ih * cov) / 2, iw * cov, ih * cov);
  ctx.filter = "none";
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(0, 0, OUT_W, OUT_H);

  // 전경 (contain × scale + translate)
  const cont = Math.min(OUT_W / iw, OUT_H / ih) * scale;
  const fw = iw * cont;
  const fh = ih * cont;
  ctx.drawImage(img, (OUT_W - fw) / 2 + tx * R, (OUT_H - fh) / 2 + ty * R, fw, fh);

  return new Promise((r) => canvas.toBlob((b) => r(b), "image/jpeg", 0.9));
}

export function HighlightsManager({
  highlights,
  photos,
}: {
  highlights: Highlight[];
  photos: PickPhoto[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Highlight | "new" | null>(null);
  const [ordered, setOrdered] = useState<Highlight[]>(highlights);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const drag = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);
  const [, startTransition] = useTransition();

  // 서버 갱신(router.refresh) 후 목록 동기화
  useEffect(() => setOrdered(highlights), [highlights]);

  function reorderOver(overId: string) {
    const cur = drag.current?.id;
    if (!cur || cur === overId) return;
    setOrdered((prev) => {
      const a = [...prev];
      const fi = a.findIndex((h) => h.id === cur);
      const ti = a.findIndex((h) => h.id === overId);
      if (fi < 0 || ti < 0 || fi === ti) return prev;
      const [m] = a.splice(fi, 1);
      a.splice(ti, 0, m);
      return a;
    });
  }
  function onPointerDown(e: React.PointerEvent, id: string) {
    drag.current = { id, x: e.clientX, y: e.clientY, moved: false };
    setDraggingId(id);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || selectMode) return; // 선택 모드에선 정렬 안 함
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) d.moved = true;
    if (!d.moved) return;
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const overId = el?.closest<HTMLElement>("[data-hid]")?.dataset.hid;
    if (overId) reorderOver(overId);
  }
  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    setDraggingId(null);
    if (!d) return;
    if (selectMode) {
      toggleSelect(d.id); // 선택 모드: 탭 = 선택/해제
      return;
    }
    if (!d.moved) {
      const h = ordered.find((x) => x.id === d.id);
      if (h) setEditing(h); // 이동 없으면 탭 = 수정
      return;
    }
    const ids = ordered.map((h) => h.id);
    startTransition(async () => {
      await setHighlightOrder(ids);
      router.refresh();
    });
  }
  function cancelSelect() {
    setSelectMode(false);
    setSelected(new Set());
  }
  function toggleSelect(id: string) {
    setSelected((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }
  function removeSelected() {
    if (selected.size === 0) return;
    if (!confirm(`선택한 ${selected.size}개 하이라이트를 삭제할까요?`)) return;
    const ids = [...selected];
    startTransition(async () => {
      for (const id of ids) {
        try {
          const fd = new FormData();
          fd.set("id", id);
          await deleteHighlight(fd);
        } catch {
          /* 이미 삭제됐거나 일시 오류 — 나머지는 계속 진행 */
        }
      }
      setSelected(new Set());
      setSelectMode(false);
      router.refresh();
    });
  }

  return (
    <>
      <div className="mt-5 flex items-start justify-between gap-3">
        <p className="text-xs leading-relaxed text-fg/50">
          {selectMode
            ? "삭제할 하이라이트를 눌러 선택하세요."
            : "위 5개가 프로필에 보여요. 끌어서 순서·노출을 바꾸고(구분선 아래는 숨김), 탭하면 수정돼요."}
        </p>
        {selectMode ? (
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={cancelSelect}
              className="rounded-full border border-line-strong px-3 py-1.5 text-xs font-medium text-fg/70 hover:bg-fg/[0.04]"
            >
              취소
            </button>
            <button
              type="button"
              onClick={removeSelected}
              disabled={selected.size === 0}
              className="rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
            >
              삭제{selected.size > 0 ? ` ${selected.size}` : ""}
            </button>
          </div>
        ) : (
          ordered.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectMode(true)}
              className="shrink-0 rounded-full border border-line-strong px-3 py-1.5 text-xs font-medium text-fg/70 hover:bg-fg/[0.04]"
            >
              선택
            </button>
          )
        )}
      </div>

      <div className="mt-4 grid grid-cols-5 gap-x-3 gap-y-5">
        {ordered.map((h, i) => (
          <Fragment key={h.id}>
            {i === 5 && (
              <div className="col-span-5 my-1 flex items-center gap-2 text-[11px] text-fg/40">
                <span className="h-px flex-1 bg-fg/15" />
                숨김 · 프로필 미노출
                <span className="h-px flex-1 bg-fg/15" />
              </div>
            )}
            <HighlightCircle
              h={h}
              hidden={i >= 5}
              dragging={draggingId === h.id}
              selectMode={selectMode}
              selected={selected.has(h.id)}
              onPointerDown={(e) => onPointerDown(e, h.id)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            />
          </Fragment>
        ))}
        <AddCircle onClick={() => setEditing("new")} />
      </div>

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

// 동그라미 하이라이트 — pointer로 끌어서 정렬(데스크톱·모바일), 탭하면 수정, ×로 삭제. hidden(상위 5 밖)은 흐리게.
function HighlightCircle({
  h,
  hidden,
  dragging,
  selectMode,
  selected,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  h: Highlight;
  hidden: boolean;
  dragging: boolean;
  selectMode: boolean;
  selected: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
}) {
  const cover = coverOf(h);
  return (
    <div className="group relative flex flex-col items-center gap-1.5">
      <div
        data-hid={h.id}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={`grid aspect-square w-full touch-none select-none place-items-center overflow-hidden rounded-full bg-fg/[0.06] ring-2 ring-offset-2 ring-offset-bg transition-transform ${
          selectMode ? "cursor-pointer" : "cursor-grab"
        } ${
          selectMode && selected
            ? "ring-brand"
            : hidden
            ? "opacity-45 ring-line"
            : "ring-line-strong"
        } ${selectMode && !selected ? "opacity-60" : ""} ${dragging ? "scale-110 opacity-80 shadow-lg" : ""}`}
      >
        {cover ? (
          <img src={cover} alt="" draggable={false} className="pointer-events-none h-full w-full rounded-full object-cover" />
        ) : (
          <span className="pointer-events-none text-fg/30">＋</span>
        )}
      </div>
      <span className="w-full truncate text-center text-caption text-muted">{h.title || "하이라이트"}</span>
      {/* 선택 모드일 때만 체크 인디케이터(탭은 동그라미 본체가 처리) */}
      {selectMode && (
        <span
          className={`pointer-events-none absolute -right-0.5 -top-0.5 grid h-5 w-5 place-items-center rounded-full border text-[10px] leading-none ${
            selected ? "border-brand bg-brand text-white" : "border-fg/40 bg-white text-transparent"
          }`}
        >
          ✓
        </span>
      )}
    </div>
  );
}

// 추가 버튼 — 빈 동그라미 + 가운데 +
function AddCircle({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col items-center gap-1.5">
      <span className="grid aspect-square w-full place-items-center rounded-full border-2 border-dashed border-fg/25 text-2xl font-light text-fg/40 transition-colors hover:border-fg/45 hover:text-fg/60">
        +
      </span>
      <span className="text-caption text-fg/40">추가</span>
    </button>
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

  const [title, setTitle] = useState(highlight?.title ?? "");
  const [items, setItems] = useState<EditItem[]>(
    highlight?.items.map((it) => ({
      key: it.photo_id ?? it.image_url ?? it.id,
      photo_id: it.photo_id,
      image_url: it.image_url,
      src: it.thumb_url ?? it.src_url,
    })) ?? []
  );
  const [coverUrl, setCoverUrl] = useState<string | null>(highlight?.cover_url ?? null);
  const [coverPhotoId, setCoverPhotoId] = useState<string | null>(highlight?.cover_photo_id ?? null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null); // 직접 업로드 크롭 대상
  const coverFileRef = useRef<HTMLInputElement>(null);
  const itemFileRef = useRef<HTMLInputElement>(null);

  // 항목 드래그 정렬 (잡아서 직접 이동)
  const dragIdx = useRef<number | null>(null);
  function onItemDragStart(i: number) {
    dragIdx.current = i;
  }
  function onItemDragEnter(i: number) {
    const from = dragIdx.current;
    if (from === null || from === i) return;
    setItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(i, 0, moved);
      return next;
    });
    dragIdx.current = i;
  }
  function onItemDragEnd() {
    dragIdx.current = null;
  }
  function addUpload(url: string) {
    setItems((prev) => [...prev, { key: url, photo_id: null, image_url: url, src: url }]);
  }
  function removeItem(key: string) {
    setItems((prev) => prev.filter((it) => it.key !== key));
  }
  function move(key: string, dir: -1 | 1) {
    setItems((prev) => {
      const i = prev.findIndex((it) => it.key === key);
      const j = i + dir;
      if (i === -1 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function setCover(it: EditItem) {
    if (it.image_url) {
      setCoverUrl(it.image_url);
      setCoverPhotoId(null);
    } else {
      setCoverPhotoId(it.photo_id);
      setCoverUrl(null);
    }
  }
  const isCover = (it: EditItem) =>
    it.image_url ? coverUrl === it.image_url : !coverUrl && coverPhotoId === it.photo_id;

  // 커버 직접 올리기 (정사각 썸네일)
  async function onCoverFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setCoverUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/highlight/cover", { method: "POST", body: fd });
    const json = await res.json().catch(() => ({}));
    setCoverUploading(false);
    if (coverFileRef.current) coverFileRef.current.value = "";
    if (res.ok && json.url) {
      setCoverUrl(json.url);
      setCoverPhotoId(null);
    }
  }

  // 항목 직접 업로드 → 크롭 모달 열기
  function onItemFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setCropSrc(URL.createObjectURL(file));
    if (itemFileRef.current) itemFileRef.current.value = "";
  }

  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // 만들기/저장 — 서버액션 직접 호출 → 목록 새로고침(router.refresh) → 모달 닫기. 실패 시 사유 표시.
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (items.length === 0) {
      alert("사진을 한 장 이상 추가해주세요.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        if (isEdit) await updateHighlight(fd);
        else await createHighlight(fd);
        router.refresh();
        onClose();
      } catch (err) {
        alert("저장에 실패했어요: " + (err instanceof Error ? err.message : "알 수 없는 오류"));
      }
    });
  }

  const itemsPayload = JSON.stringify(
    items.map((it) => (it.photo_id ? { photo_id: it.photo_id } : { image_url: it.image_url }))
  );
  const coverPreview =
    coverUrl ?? items.find((it) => it.photo_id === coverPhotoId)?.src ?? items[0]?.src ?? null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 font-kr" onClick={onClose}>
      <form
        onSubmit={onSubmit}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">{isEdit ? "하이라이트 수정" : "새 하이라이트"}</h3>
          <button type="button" onClick={onClose} className="text-sm text-fg/50 hover:text-fg">
            닫기
          </button>
        </div>

        {isEdit && <input type="hidden" name="id" value={highlight!.id} />}
        <input type="hidden" name="items" value={itemsPayload} />
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
            <input ref={coverFileRef} type="file" accept="image/*" hidden onChange={(e) => onCoverFile(e.target.files)} />
            <button
              type="button"
              disabled={coverUploading}
              onClick={() => coverFileRef.current?.click()}
              className="mt-1.5 text-xs text-fg/50 underline hover:text-fg disabled:opacity-50"
            >
              {coverUploading ? "업로드 중…" : "커버 직접 올리기"}
            </button>
          </div>
        </div>

        {/* 사진 추가 — 직접 업로드(9:16 크롭) */}
        <div className="mt-5 flex items-center justify-between">
          <p className="text-sm font-medium">
            사진 <span className="text-xs font-normal text-fg/45">{items.length}장 · 9:16</span>
          </p>
          <input ref={itemFileRef} type="file" accept="image/*" hidden onChange={(e) => onItemFile(e.target.files)} />
          <button
            type="button"
            onClick={() => itemFileRef.current?.click()}
            className="rounded-full bg-fg px-3 py-1.5 text-xs font-semibold text-bg hover:opacity-90"
          >
            + 직접 업로드
          </button>
        </div>

        {/* 선택/업로드된 항목 — 순서 조정 + 커버 지정 */}
        {items.length > 0 && (
          <div className="mt-3">
            <p className="text-xs text-fg/45">끌어서 순서 변경 · 사진을 눌러 커버 지정</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {items.map((it, i) => (
                <div
                  key={it.key}
                  draggable
                  onDragStart={() => onItemDragStart(i)}
                  onDragEnter={() => onItemDragEnter(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDragEnd={onItemDragEnd}
                  className="flex cursor-move flex-col items-center gap-1"
                >
                  <button
                    type="button"
                    onClick={() => setCover(it)}
                    className={`relative h-[72px] w-[40px] overflow-hidden rounded-md ring-2 ${
                      isCover(it) ? "ring-amber-500" : "ring-fg/10"
                    }`}
                    title="커버로 지정"
                  >
                    <img src={it.src} alt="" draggable={false} className="h-full w-full object-cover" />
                    <span className="absolute left-0.5 top-0.5 rounded bg-black/55 px-1 text-[9px] font-bold text-white">
                      {i + 1}
                    </span>
                    {isCover(it) && (
                      <span className="absolute inset-x-0 bottom-0 bg-amber-500 text-center text-[8px] font-bold text-white">
                        커버
                      </span>
                    )}
                  </button>
                  <div className="flex gap-0.5">
                    <button type="button" onClick={() => move(it.key, -1)} aria-label="앞으로" className="grid h-5 w-5 place-items-center rounded border border-fg/15 text-[10px] text-fg/60 hover:bg-fg/[0.04]">←</button>
                    <button type="button" onClick={() => move(it.key, 1)} aria-label="뒤로" className="grid h-5 w-5 place-items-center rounded border border-fg/15 text-[10px] text-fg/60 hover:bg-fg/[0.04]">→</button>
                    <button type="button" onClick={() => removeItem(it.key)} aria-label="삭제" className="grid h-5 w-5 place-items-center rounded border border-fg/15 text-[10px] text-brand hover:bg-brand/[0.06]">×</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 포트폴리오에서 고르기 */}
        <p className="mt-5 text-sm font-medium">
          포트폴리오에서 고르기 <span className="text-xs font-normal text-fg/45">· 누르면 9:16으로 맞춰 추가</span>
        </p>
        {photos.length === 0 ? (
          <p className="mt-2 text-sm text-fg/45">공개된 포트폴리오 사진이 없어요.</p>
        ) : (
          <div className="mt-2 max-h-52 overflow-y-auto rounded-xl border border-fg/10 p-2">
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
              {photos.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setCropSrc(p.src_url)}
                  title="9:16으로 맞춰 추가"
                  className="relative aspect-square overflow-hidden rounded-lg ring-2 ring-transparent transition hover:ring-fg/40"
                >
                  <img src={p.thumb_url} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="mt-6 w-full rounded-full bg-fg py-3 text-sm font-semibold text-bg hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "저장 중…" : isEdit ? "저장" : "만들기"}
        </button>
      </form>

      {cropSrc && (
        <CropModal
          src={cropSrc}
          onCancel={() => setCropSrc(null)}
          onDone={(url) => {
            addUpload(url);
            setCropSrc(null);
          }}
        />
      )}
    </div>
  );
}

// ───────── 9:16 프레임 합성 모달 ─────────
// 잘라내기가 아니라 "9:16 틀에 이미지 전체를 담기" — 위아래 여백은 흐린 배경으로 채우고,
// 보이는 프레임 그대로 업로드한다. 끌어서 이동 / 슬라이더로 확대.
function CropModal({
  src,
  onCancel,
  onDone,
}: {
  src: string;
  onCancel: () => void;
  onDone: (url: string) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1); // 1 = 전체 보임(contain)
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  function onDown(e: React.PointerEvent) {
    drag.current = { x: e.clientX, y: e.clientY, tx, ty };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function onMove(e: React.PointerEvent) {
    if (!drag.current) return;
    setTx(drag.current.tx + (e.clientX - drag.current.x));
    setTy(drag.current.ty + (e.clientY - drag.current.y));
  }
  function onUp() {
    drag.current = null;
  }

  async function done() {
    const frame = frameRef.current;
    if (!frame || busy) return;
    setBusy(true);
    try {
      const blob = await composeFrame(src, frame.clientWidth, scale, tx, ty);
      if (!blob) throw new Error("이미지 처리 실패");
      const fd = new FormData();
      fd.append("file", blob, "highlight.jpg");
      const res = await fetch("/api/highlight/item", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.url) onDone(json.url);
      else alert(json.error || "업로드에 실패했어요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4 font-kr" onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm overflow-hidden rounded-2xl bg-white">
        <div className="flex items-center justify-between px-4 py-3">
          <h4 className="text-sm font-semibold">9:16에 담기</h4>
          <button type="button" onClick={onCancel} className="text-sm text-fg/50 hover:text-fg">취소</button>
        </div>

        {/* 9:16 프레임 = 업로드될 화면 그대로. 이미지 전체가 보이고 여백은 흐린 배경 */}
        <div
          ref={frameRef}
          className="relative mx-auto aspect-[9/16] h-[58vh] cursor-grab touch-none select-none overflow-hidden bg-black active:cursor-grabbing"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <img src={src} alt="" aria-hidden draggable={false} className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-50 blur-2xl" />
          <div className="pointer-events-none absolute inset-0 bg-black/[0.18]" />
          <img
            src={src}
            alt=""
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full object-contain"
            style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})` }}
          />
        </div>

        <div className="flex items-center gap-3 px-4 py-3">
          <span className="text-xs text-fg/45">확대</span>
          <input
            type="range"
            min={0.4}
            max={3}
            step={0.01}
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
            className="flex-1 accent-brand"
          />
        </div>
        <div className="px-4 pb-4">
          <button
            type="button"
            onClick={done}
            disabled={busy}
            className="w-full rounded-full bg-fg py-3 text-sm font-semibold text-bg hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "업로드 중…" : "이대로 추가"}
          </button>
        </div>
      </div>
    </div>
  );
}
