"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import type { DeliveryDownload } from "@/lib/deliveries";

// 전달된 보정본 뷰어 — 썸네일 그리드(컴팩트) + 라이트박스 슬라이드 + 실제 저장.
//  · req10: 그리드 미리보기 → 클릭 시 크게 보기·좌우 슬라이드. 그리드가 길어져
//           후기가 너무 밀리지 않도록 최대 높이를 두고 스크롤 처리.
//  · req11: 브라우저에 뜨고 끝나지 않게 blob 으로 실제 저장(개별/전체 분리).
const IMG_RE = /\.(jpe?g|png|gif|webp|avif|heic|heif|bmp|tiff?)$/i;

export function DeliveryGallery({
  items,
  externalLink,
  expiresAt,
}: {
  items: DeliveryDownload[];
  externalLink: string | null;
  expiresAt: string | null;
}) {
  const images = items.filter((i) => IMG_RE.test(i.name));
  const files = items.filter((i) => !IMG_RE.test(i.name));
  const [viewer, setViewer] = useState<number | null>(null);
  const [savingAll, setSavingAll] = useState(false);

  // 크로스 오리진 서명 URL을 blob 으로 받아 강제 저장
  async function saveOne(item: DeliveryDownload) {
    try {
      const res = await fetch(item.url);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = item.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // 실패 시 새 탭으로라도 열어줌(최후 수단)
      window.open(item.url, "_blank", "noopener");
    }
  }

  // 전체 저장 — 순차 다운로드(브라우저 동시 다운로드 차단 회피)
  async function saveAll() {
    setSavingAll(true);
    for (const it of items) await saveOne(it);
    setSavingAll(false);
  }

  // 라이트박스 키보드 네비게이션
  useEffect(() => {
    if (viewer === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setViewer(null);
      else if (e.key === "ArrowRight") setViewer((v) => (v === null ? v : (v + 1) % images.length));
      else if (e.key === "ArrowLeft")
        setViewer((v) => (v === null ? v : (v - 1 + images.length) % images.length));
    }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [viewer, images.length]);

  return (
    <section className="mt-6 rounded-xl border border-fg/10 p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">
          📸 전달된 보정본
          {images.length > 0 && <span className="ml-1 text-fg/45">{images.length}장</span>}
        </p>
        {items.length > 0 && (
          <button
            type="button"
            onClick={saveAll}
            disabled={savingAll}
            className="shrink-0 rounded-full bg-fg px-3 py-1.5 text-xs font-semibold text-bg hover:opacity-90 disabled:opacity-50"
          >
            {savingAll ? "저장 중…" : "전체 저장 ↓"}
          </button>
        )}
      </div>

      {/* 이미지 썸네일 그리드 — 길어지면 스크롤(후기 위치 보존) */}
      {images.length > 0 && (
        <div className="mt-3 grid max-h-72 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
          {images.map((img, i) => (
            <div key={img.url} className="group relative aspect-square overflow-hidden rounded-lg bg-fg/[0.05]">
              <button
                type="button"
                onClick={() => setViewer(i)}
                className="block h-full w-full"
                aria-label={`${img.name} 크게 보기`}
              >
                <img
                  src={img.url}
                  alt={img.name}
                  loading="lazy"
                  className="h-full w-full object-cover transition group-hover:opacity-90"
                />
              </button>
              {/* 개별 저장 */}
              <button
                type="button"
                onClick={() => saveOne(img)}
                aria-label="이 사진 저장"
                className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/55 text-xs text-white opacity-0 transition group-hover:opacity-100"
              >
                ↓
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 비이미지 파일(zip 등) — 저장 칩 */}
      {files.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {files.map((f) => (
            <li key={f.url}>
              <button
                type="button"
                onClick={() => saveOne(f)}
                className="flex w-full items-center justify-between gap-3 rounded-lg bg-fg/[0.04] px-3 py-2 text-sm hover:bg-fg/[0.07]"
              >
                <span className="truncate">{f.name}</span>
                <span className="shrink-0 text-xs text-fg/50">저장 ↓</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {externalLink && (
        <a
          href={externalLink}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block text-sm text-fg/60 underline hover:text-fg"
        >
          외부 전달 링크 열기 ↗
        </a>
      )}

      {expiresAt && (
        <p className="mt-3 text-[11px] text-fg/45">
          다운로드 링크는 보안을 위해 일정 시간이 지나면 만료돼요. 만료 시 새로고침하면 다시
          생성됩니다. 파일 보관은 {new Date(expiresAt).toLocaleDateString("ko-KR")}까지 권장돼요.
        </p>
      )}

      {/* 라이트박스 */}
      {viewer !== null && images[viewer] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={() => setViewer(null)}
          role="dialog"
          aria-modal="true"
        >
          {/* 닫기 */}
          <button
            type="button"
            onClick={() => setViewer(null)}
            aria-label="닫기"
            className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-xl text-white hover:bg-white/20"
          >
            ✕
          </button>

          {/* 이전 */}
          {images.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setViewer((v) => (v === null ? v : (v - 1 + images.length) % images.length));
              }}
              aria-label="이전"
              className="absolute left-3 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-2xl text-white hover:bg-white/20"
            >
              ‹
            </button>
          )}

          <figure className="flex max-h-[88svh] max-w-[92vw] flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <img
              src={images[viewer].url}
              alt={images[viewer].name}
              className="max-h-[80svh] max-w-[92vw] rounded-lg object-contain"
            />
            <figcaption className="mt-3 flex items-center gap-4 text-xs text-white/80">
              <span>
                {viewer + 1} / {images.length}
              </span>
              <span className="max-w-[40vw] truncate">{images[viewer].name}</span>
              <button
                type="button"
                onClick={() => saveOne(images[viewer])}
                className="rounded-full bg-white/15 px-3 py-1 font-medium text-white hover:bg-white/25"
              >
                저장 ↓
              </button>
            </figcaption>
          </figure>

          {/* 다음 */}
          {images.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setViewer((v) => (v === null ? v : (v + 1) % images.length));
              }}
              aria-label="다음"
              className="absolute right-3 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-2xl text-white hover:bg-white/20"
            >
              ›
            </button>
          )}
        </div>
      )}
    </section>
  );
}
