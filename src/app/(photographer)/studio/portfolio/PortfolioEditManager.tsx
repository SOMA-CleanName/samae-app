"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updateFeedMeta, deletePhoto } from "./actions";

export type EditPhoto = {
  id: string;
  thumb_url: string | null;
  src_url: string;
  album_id: string | null;
  price_krw: number | null;
  location_text: string | null;
  mood_tags: string[];
  visibility: string;
};

type Status =
  | { kind: "idle" }
  | { kind: "working"; label: string }
  | { kind: "success"; label: string }
  | { kind: "error"; msg: string };

// 포트폴리오 편집 매니저 — 묶음(피드) 사진을 한 모달에서 함께 수정.
// 모든 작업(교체·삭제·추가·저장)을 토스트로 보여주며, 모달을 닫아도 진행은 이어진다.
export function PortfolioEditManager({
  photos,
  descriptions,
}: {
  photos: EditPhoto[];
  descriptions: Record<string, string | null>;
}) {
  const router = useRouter();
  const [target, setTarget] = useState<{ anchorId: string; albumId: string | null } | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLInputElement>(null);
  const [replaceId, setReplaceId] = useState<string | null>(null);

  // 편집 트리거 수신
  useEffect(() => {
    function onEdit(e: Event) {
      const d = (e as CustomEvent).detail as { photoId: string; albumId: string | null };
      setTarget({ anchorId: d.photoId, albumId: d.albumId });
    }
    window.addEventListener("samae:edit", onEdit);
    return () => window.removeEventListener("samae:edit", onEdit);
  }, []);

  function scheduleHide(ms: number) {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setStatus({ kind: "idle" }), ms);
  }

  // 현재 피드 사진들 — props에서 매 렌더 계산해 작업 후 자동 동기화
  const feed = target
    ? target.albumId
      ? photos.filter((p) => p.album_id === target.albumId)
      : photos.filter((p) => p.id === target.anchorId)
    : [];
  const anchor = feed.find((p) => p.id === target?.anchorId) ?? feed[0];
  const albumId = target?.albumId ?? null;
  const description = albumId ? descriptions[albumId] ?? null : null;

  // 피드가 비면(다 삭제) 모달 닫기
  useEffect(() => {
    if (target && feed.length === 0) setTarget(null);
  }, [target, feed.length]);

  async function onReplaceFile(files: FileList | null) {
    const file = files?.[0];
    const pid = replaceId;
    if (replaceRef.current) replaceRef.current.value = "";
    setReplaceId(null);
    if (!file || !pid) return;
    setStatus({ kind: "working", label: "사진 교체 중…" });
    const fd = new FormData();
    fd.append("photoId", pid);
    fd.append("file", file);
    const res = await fetch("/api/portfolio/replace", { method: "POST", body: fd });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus({ kind: "error", msg: j.error || "교체 실패" });
      scheduleHide(6000);
      return;
    }
    setStatus({ kind: "success", label: "사진을 교체했어요" });
    router.refresh();
    scheduleHide(2500);
  }

  async function onAddFiles(files: FileList | null) {
    const arr = Array.from(files ?? []).filter((f) => f.type.startsWith("image/"));
    if (addRef.current) addRef.current.value = "";
    if (arr.length === 0 || !albumId) return;
    for (let i = 0; i < arr.length; i++) {
      setStatus({ kind: "working", label: `사진 추가 중… ${i + 1}/${arr.length}` });
      const fd = new FormData();
      fd.append("file", arr[i]);
      fd.append("album_id", albumId);
      fd.append("visibility", anchor?.visibility === "published" ? "published" : "draft");
      const res = await fetch("/api/portfolio/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setStatus({ kind: "error", msg: j.error || "추가 실패" });
        scheduleHide(6000);
        return;
      }
    }
    setStatus({ kind: "success", label: "사진을 추가했어요" });
    router.refresh();
    scheduleHide(2500);
  }

  async function onDelete(photoId: string) {
    setStatus({ kind: "working", label: "사진 삭제 중…" });
    const fd = new FormData();
    fd.append("id", photoId);
    try {
      await deletePhoto(fd);
    } catch (e) {
      setStatus({ kind: "error", msg: e instanceof Error ? e.message : "삭제 실패" });
      scheduleHide(6000);
      return;
    }
    setStatus({ kind: "success", label: "사진을 삭제했어요" });
    router.refresh();
    scheduleHide(2000);
  }

  async function onSave(formData: FormData) {
    formData.set("photo_ids", feed.map((p) => p.id).join(","));
    if (albumId) formData.set("album_id", albumId);
    setTarget(null); // 닫아도 토스트로 진행
    setStatus({ kind: "working", label: "저장 중…" });
    try {
      await updateFeedMeta(formData);
    } catch (e) {
      setStatus({ kind: "error", msg: e instanceof Error ? e.message : "저장 실패" });
      scheduleHide(6000);
      return;
    }
    setStatus({ kind: "success", label: "저장했어요" });
    router.refresh();
    scheduleHide(2000);
  }

  return (
    <>
      {/* 공용 파일 입력 (교체/추가) */}
      <input ref={replaceRef} type="file" accept="image/*" hidden onChange={(e) => onReplaceFile(e.target.files)} />
      <input ref={addRef} type="file" accept="image/*" multiple hidden onChange={(e) => onAddFiles(e.target.files)} />

      {target && anchor && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 font-kr"
          onClick={() => setTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">
                사진 편집 {feed.length > 1 && <span className="text-sm font-normal text-fg/50">· 피드 {feed.length}장</span>}
              </h3>
              <button
                type="button"
                onClick={() => setTarget(null)}
                aria-label="닫기"
                className="grid h-8 w-8 place-items-center rounded-full text-fg/50 hover:bg-fg/[0.06] hover:text-fg"
              >
                ✕
              </button>
            </div>

            {/* 피드 사진들 — 각 교체/삭제 + 추가 */}
            <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-5">
              {feed.map((p) => (
                <div key={p.id} className="group relative aspect-square overflow-hidden rounded-lg bg-fg/[0.06]">
                  <img src={p.thumb_url ?? p.src_url} alt="" className="h-full w-full object-cover" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => {
                        setReplaceId(p.id);
                        replaceRef.current?.click();
                      }}
                      className="rounded bg-white/90 px-2 py-0.5 text-[10px] font-medium text-fg hover:bg-white"
                    >
                      교체
                    </button>
                    {feed.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onDelete(p.id)}
                        className="rounded bg-brand/90 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-brand"
                      >
                        삭제
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {albumId && (
                <button
                  type="button"
                  onClick={() => addRef.current?.click()}
                  className="grid aspect-square place-items-center rounded-lg border border-dashed border-fg/25 text-xl text-fg/40 hover:border-fg/40 hover:text-fg/60"
                >
                  +
                </button>
              )}
            </div>

            {/* 공유 정보 — 피드 전체에 적용 */}
            <form key={anchor.id} action={onSave} className="mt-4 flex flex-col gap-3 border-t border-fg/10 pt-4">
              {albumId && (
                <label className="flex flex-col gap-1 text-xs text-fg/55">
                  설명 (피드 공유)
                  <textarea
                    name="description"
                    rows={3}
                    maxLength={1000}
                    defaultValue={description ?? ""}
                    placeholder="이 촬영에 대한 설명"
                    className="resize-none rounded-lg border border-fg/15 px-3 py-2 text-sm outline-none focus:border-fg/40"
                  />
                </label>
              )}
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-xs text-fg/55">
                  가격 (원)
                  <input
                    name="price_krw"
                    type="number"
                    min={0}
                    step={1000}
                    defaultValue={anchor.price_krw ?? ""}
                    placeholder="예: 50000"
                    className="rounded-lg border border-fg/15 px-3 py-2 text-sm outline-none focus:border-fg/40"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-fg/55">
                  장소
                  <input
                    name="location_text"
                    type="text"
                    maxLength={120}
                    defaultValue={anchor.location_text ?? ""}
                    placeholder="예: 성수동 카페"
                    className="rounded-lg border border-fg/15 px-3 py-2 text-sm outline-none focus:border-fg/40"
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1 text-xs text-fg/55">
                무드 태그 (쉼표)
                <input
                  name="mood_tags"
                  type="text"
                  defaultValue={anchor.mood_tags.join(", ")}
                  placeholder="예: 감성, 흑백"
                  className="rounded-lg border border-fg/15 px-3 py-2 text-sm outline-none focus:border-fg/40"
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="visibility"
                  value="published"
                  defaultChecked={anchor.visibility === "published"}
                  className="h-4 w-4 rounded border-fg/30"
                />
                탐색에 공개
              </label>
              {feed.length > 1 && (
                <p className="text-xs text-fg/45">가격·장소·무드·공개는 피드 {feed.length}장 전체에 적용돼요.</p>
              )}

              <div className="mt-1 flex gap-2">
                <button
                  type="button"
                  onClick={() => setTarget(null)}
                  className="flex-1 rounded-full border border-fg/20 py-2.5 text-sm font-medium text-fg/70 hover:bg-fg/[0.04]"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-full bg-fg py-2.5 text-sm font-semibold text-bg hover:opacity-90"
                >
                  저장
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 우하단 토스트 */}
      {status.kind !== "idle" && (
        <div className="fixed bottom-5 right-5 z-[60] font-kr">
          <EditToast status={status} onClose={() => setStatus({ kind: "idle" })} />
        </div>
      )}
    </>
  );
}

function EditToast({ status, onClose }: { status: Status; onClose: () => void }) {
  if (status.kind === "working") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-fg/10 bg-white px-4 py-3 shadow-lg">
        <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-fg/20 border-t-fg" />
        <span className="text-sm">{status.label}</span>
      </div>
    );
  }
  if (status.kind === "success") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-50 px-4 py-3 shadow-lg">
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-500 text-xs text-white">✓</span>
        <span className="text-sm text-emerald-800">{status.label}</span>
      </div>
    );
  }
  if (status.kind === "error") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-brand/30 bg-brand/[0.06] px-4 py-3 shadow-lg">
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand text-xs text-white">!</span>
        <span className="text-sm text-brand">{status.msg}</span>
        <button type="button" onClick={onClose} aria-label="닫기" className="ml-1 text-fg/40 hover:text-fg">
          ✕
        </button>
      </div>
    );
  }
  return null;
}
