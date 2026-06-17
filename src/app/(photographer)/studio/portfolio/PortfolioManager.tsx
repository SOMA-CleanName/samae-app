"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPost } from "./actions";
import { downscaleImage } from "./downscale";
import { PortfolioUploader, type UploadPayload, type PackageOption } from "./PortfolioUploader";
import { HelpTip } from "./HelpTip";

type Status =
  | { kind: "idle" }
  | { kind: "uploading"; done: number; total: number }
  | { kind: "success"; count: number }
  | { kind: "error"; msg: string };

// 포트폴리오 추가 매니저 — 모달은 입력만 받고, 업로드는 여기서 수행한다.
// 모달을 닫아도 업로드가 계속되며 진행/완료를 우하단 토스트로 보여준다.
export function PortfolioManager({ packages }: { packages: PackageOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleHide(ms: number) {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setStatus({ kind: "idle" }), ms);
  }

  // 업로드 실행 — 모달은 즉시 닫고 백그라운드로 진행
  async function start(p: UploadPayload) {
    setOpen(false);
    setStatus({ kind: "uploading", done: 0, total: p.files.length });
    try {
      const { id: albumId } = await createPost(p.description); // 한 피드로 묶음
      for (let i = 0; i < p.files.length; i++) {
        // 업로드 전 리사이즈+JPEG 변환 (4.5MB 제한 회피 · HEIC 정규화)
        const file = await downscaleImage(p.files[i]);
        const fd = new FormData();
        fd.append("file", file);
        fd.append("album_id", albumId);
        if (p.price.trim()) fd.append("price_krw", p.price.trim());
        if (p.location.trim()) fd.append("location_text", p.location.trim());
        if (p.moods.trim()) fd.append("mood_tags", p.moods.trim());
        fd.append("visibility", p.publish ? "published" : "draft");

        const res = await fetch("/api/portfolio/upload", { method: "POST", body: fd });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? "업로드 실패");
        }
        setStatus({ kind: "uploading", done: i + 1, total: p.files.length });
      }
      setStatus({ kind: "success", count: p.files.length });
      router.refresh();
      scheduleHide(2500);
    } catch (e) {
      setStatus({ kind: "error", msg: e instanceof Error ? e.message : "업로드 실패" });
      scheduleHide(6000);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full bg-fg px-4 py-2 text-sm font-semibold text-bg hover:opacity-90"
      >
        + 추가
      </button>

      {/* 입력 모달 */}
      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 font-kr"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-base font-semibold">
                포트폴리오 추가
                <HelpTip label="포트폴리오 추가 안내">
                  하나의 촬영(같은 날·같은 콘셉트)에 해당하는 사진들만 한 게시물로 올려주세요.
                </HelpTip>
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="닫기"
                className="grid h-8 w-8 place-items-center rounded-full text-fg/50 hover:bg-fg/[0.06] hover:text-fg"
              >
                ✕
              </button>
            </div>
            <div className="mt-4">
              <PortfolioUploader onStart={start} packages={packages} />
            </div>
          </div>
        </div>
      )}

      {/* 우하단 토스트 — 진행/완료/실패 */}
      {status.kind !== "idle" && (
        <div className="fixed bottom-5 right-5 z-[60] font-kr">
          <UploadToast status={status} onClose={() => setStatus({ kind: "idle" })} />
        </div>
      )}
    </>
  );
}

function UploadToast({ status, onClose }: { status: Status; onClose: () => void }) {
  if (status.kind === "uploading") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-fg/10 bg-white px-4 py-3 shadow-lg">
        <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-fg/20 border-t-fg" />
        <span className="text-sm">
          사진 업로드 중… <strong>{status.done}/{status.total}</strong>
        </span>
      </div>
    );
  }
  if (status.kind === "success") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-50 px-4 py-3 shadow-lg">
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-500 text-xs text-white">✓</span>
        <span className="text-sm text-emerald-800">업로드 완료 · {status.count}장</span>
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
