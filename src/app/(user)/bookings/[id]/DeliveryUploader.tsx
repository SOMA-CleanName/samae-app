"use client";

/* eslint-disable @next/next/no-img-element */
import { useRef, useState } from "react";
import { deliverFinals, redeliverNotify, removeDeliveryAsset } from "@/app/actions/payments";
import type { DeliveryAsset } from "@/lib/deliveries";

const IMG_RE = /\.(jpe?g|png|gif|webp|avif|heic|heif|bmp|tiff?)$/i;

// 작가 보정본 전달/관리 — 앱 내 업로드(비공개 버킷) + 외부 링크 + 파일 교체.
//  · delivered=false: 전달 전(shot) → [보정본 전달 완료]
//  · delivered=true : 완료 후(completed) 잘못 전달 대처 → 파일 교체 + [재전달 알림]
export function DeliveryUploader({
  bookingId,
  initialAssets,
  initialLink,
  delivered = false,
}: {
  bookingId: string;
  initialAssets: DeliveryAsset[];
  initialLink: string;
  delivered?: boolean;
}) {
  const [assets, setAssets] = useState<DeliveryAsset[]>(initialAssets);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);

  // 전달 제출 가드 — 사진 파일도 외부 링크도 없으면 막고 안내(req2)
  function onDeliverSubmit(e: React.FormEvent<HTMLFormElement>) {
    const link = linkRef.current?.value.trim() ?? "";
    if (assets.length === 0 && !link) {
      e.preventDefault();
      setError("보정본 사진을 올리거나 외부 전달 링크를 입력해주세요.");
    }
  }

  // 여러 파일 순차 업로드 — 라우트가 전체 목록을 반환
  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    for (const f of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("bookingId", bookingId);
      const res = await fetch("/api/delivery/upload", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "업로드에 실패했어요.");
        break;
      }
      if (json.assets) setAssets(json.assets);
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  // 잘못 올린 파일 삭제 — 액션이 갱신된 목록을 반환
  async function onRemove(path: string) {
    setBusy(true);
    setError(null);
    try {
      const next = await removeDeliveryAsset(bookingId, path);
      setAssets(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제에 실패했어요.");
    }
    setBusy(false);
  }

  return (
    <div className="rounded-xl border border-fg/10 p-5">
      <p className="text-sm font-semibold">{delivered ? "보정본 관리 (재전달)" : "보정본 전달"}</p>
      <p className="mt-1 text-xs text-fg/55">
        {delivered
          ? "잘못 전달했다면 파일을 교체한 뒤 고객에게 다시 알릴 수 있어요."
          : "사진 파일을 올려 앱 안에서 전달하거나, 대용량은 외부 링크로 보낼 수 있어요."}
      </p>

      {/* 업로드된 파일 미리보기(썸네일) + 개별 삭제 (req3) */}
      {assets.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {assets.map((a) => (
            <div
              key={a.path}
              className="group relative aspect-square overflow-hidden rounded-lg bg-fg/[0.05]"
            >
              {a.preview && IMG_RE.test(a.name) ? (
                <img src={a.preview} alt={a.name} loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center px-2 text-center text-[10px] text-fg/55">
                  {a.name}
                </div>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => onRemove(a.path)}
                aria-label="파일 삭제"
                className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/55 text-[10px] text-white opacity-0 transition group-hover:opacity-100 disabled:opacity-50"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        multiple
        hidden
        accept="image/*,.zip"
        onChange={(e) => onFiles(e.target.files)}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        className="mt-3 w-full rounded-xl border border-fg/20 py-2.5 text-sm font-medium text-fg/70 hover:bg-fg/[0.04] disabled:opacity-50"
      >
        {busy ? "처리 중…" : assets.length > 0 ? "파일 더 올리기" : "사진 파일 올리기"}
      </button>
      {error && <p className="mt-2 text-xs text-brand">{error}</p>}

      <form
        action={delivered ? redeliverNotify : deliverFinals}
        onSubmit={onDeliverSubmit}
        className="mt-4 flex flex-col gap-2"
      >
        <input type="hidden" name="id" value={bookingId} />
        <input
          ref={linkRef}
          name="externalLink"
          type="url"
          defaultValue={initialLink}
          placeholder="외부 전달 링크 (선택 · 예: 구글드라이브)"
          className="w-full rounded-xl border border-fg/15 bg-white px-3 py-2 text-sm outline-none focus:border-fg/40"
        />
        <button
          disabled={busy}
          className="w-full rounded-xl bg-fg py-3 text-sm font-semibold text-bg hover:opacity-90 disabled:opacity-50"
        >
          {delivered ? "고객에게 재전달 알림" : "보정본 전달 완료"}
        </button>
      </form>
    </div>
  );
}
