"use client";

/* eslint-disable @next/next/no-img-element */
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeAvatar } from "./actions";

// 아바타 업로드 — 미리보기 + 업로드 후 새 URL 반영
export function AvatarUploader({
  initialUrl,
  fallback,
}: {
  initialUrl: string | null;
  fallback: string;
}) {
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, startRemove] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  // 기본 프사(이니셜)로 되돌리기
  function onRemove() {
    setError(null);
    startRemove(async () => {
      try {
        await removeAvatar();
        setUrl(null);
        router.refresh();
      } catch {
        setError("기본 사진으로 되돌리지 못했어요.");
      }
    });
  }

  async function onFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/account/avatar", { method: "POST", body: fd });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    if (!res.ok) {
      setError(json.error || "업로드에 실패했어요.");
      return;
    }
    setUrl(json.url);
    router.refresh(); // 헤더 아바타 등 갱신
  }

  return (
    <div className="flex items-center gap-4">
      <span className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full bg-fg text-2xl font-bold text-bg">
        {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : fallback}
      </span>
      <div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => onFile(e.target.files)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy || removing}
            onClick={() => fileRef.current?.click()}
            className="rounded-full border border-fg/20 px-4 py-2 text-sm font-medium text-fg/70 hover:bg-fg/[0.04] disabled:opacity-50"
          >
            {busy ? "업로드 중…" : "사진 변경"}
          </button>
          {url && (
            <button
              type="button"
              disabled={busy || removing}
              onClick={onRemove}
              className="rounded-full px-3 py-2 text-sm text-fg/50 hover:text-brand disabled:opacity-50"
            >
              {removing ? "되돌리는 중…" : "기본 사진으로"}
            </button>
          )}
        </div>
        {error && <p className="mt-1.5 text-xs text-brand">{error}</p>}
      </div>
    </div>
  );
}
