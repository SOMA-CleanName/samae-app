"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

// 포트폴리오 업로더 — 선택한 이미지들을 순차 업로드 후 새로고침
export function PortfolioUploader() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    const list = Array.from(files);

    for (let i = 0; i < list.length; i++) {
      setProgress(`업로드 중… ${i + 1}/${list.length}`);
      const fd = new FormData();
      fd.append("file", list[i]);
      const res = await fetch("/api/portfolio/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "업로드 실패");
        break;
      }
    }

    setBusy(false);
    setProgress(null);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-dashed border-fg/25 p-6 text-center">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => onFiles(e.target.files)}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="rounded-full bg-fg px-5 py-2.5 text-sm font-semibold text-bg hover:opacity-90 disabled:opacity-50"
      >
        {busy ? progress ?? "업로드 중…" : "사진 추가"}
      </button>
      <p className="mt-2 text-xs text-fg/45">
        JPG·PNG 등 이미지, 장당 15MB 이하. 업로드 후 비공개 상태로 저장돼요.
      </p>
      {error && <p className="mt-2 text-xs text-brand">{error}</p>}
    </div>
  );
}
