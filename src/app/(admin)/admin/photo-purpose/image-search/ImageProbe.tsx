"use client";

/**
 * 사진으로 검색 — 어드민 확인용. (docs/46)
 *
 * 사용자 화면은 앨범 흩뜨리기로 순서를 바꾸고 점수를 숨긴다. 여기서는 둘 다 걷어내
 * **점수 순서 그대로** 놓고, 사진마다 목적·무드 태그를 같이 보여준다 —
 * "이 사진을 올리면 어떤 분류의 사진이 딸려 오나" 를 눈으로 보려는 화면이다.
 */
import { useEffect, useRef, useState, useTransition } from "react";

import { firstImage, shrinkImage } from "@/lib/image-search-client";
import { purposeLabel, type PurposeKey } from "@/lib/photo-purpose";
import { probeByImage, type ImageProbeRow } from "./actions";

type State =
  | { step: "empty" }
  | { step: "error"; message: string }
  | { step: "done"; rows: ImageProbeRow[] };

export function ImageProbe() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [state, setState] = useState<State>({ step: "empty" });
  const [pending, startTransition] = useTransition();

  function accept(file: Blob | null) {
    if (!file) return;
    void (async () => {
      const shrunk = await shrinkImage(file);
      if (!shrunk) {
        setState({ step: "error", message: "이 사진은 읽지 못했습니다. JPG·PNG 로 올려주세요." });
        return;
      }
      setImage(shrunk);
      startTransition(async () => {
        const result = await probeByImage(shrunk);
        setState(result.ok ? { step: "done", rows: result.rows } : { step: "error", message: result.error });
      });
    })();
  }

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = firstImage(event.clipboardData?.items);
      if (file) accept(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const scores = state.step === "done" ? state.rows.map((row) => 1 - row.distance) : [];
  const top = scores[0] ?? 0;

  return (
    <>
      <div className="my-4 flex flex-wrap items-start gap-4">
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            accept(firstImage(event.dataTransfer?.items));
          }}
          onClick={() => fileRef.current?.click()}
          className={`flex min-h-[112px] flex-1 cursor-pointer items-center justify-center rounded-xl border border-dashed px-6 py-6 text-center text-body-sm ${
            dragging ? "border-brand bg-brand/5 text-brand" : "border-line-strong text-muted hover:text-fg"
          }`}
        >
          사진을 끌어다 놓거나 눌러서 고르세요 · 붙여넣기(⌘V)도 됩니다
        </div>
        {image && (
          // 올린 사진은 브라우저 안에만 있는 data URL 이다 — 서버에 저장하지 않는다
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="올린 사진" className="h-28 w-28 rounded-xl border border-line object-cover" />
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => accept(event.target.files?.[0] ?? null)}
        />
      </div>

      {pending && <p className="rounded-xl border border-line p-8 text-center text-muted">찾는 중…</p>}
      {!pending && state.step === "error" && (
        <p className="rounded-xl border border-line p-8 text-center text-muted">{state.message}</p>
      )}
      {!pending && state.step === "done" && state.rows.length === 0 && (
        <p className="rounded-xl border border-line p-8 text-center text-muted">결과가 없습니다.</p>
      )}
      {!pending && state.step === "done" && state.rows.length > 0 && (
        <>
          <p className="mb-3 text-body-sm">
            상위 <b className="tabular-nums">{state.rows.length}</b>장 · 1위{" "}
            <b className="tabular-nums">{top.toFixed(3)}</b> · 마지막{" "}
            <b className="tabular-nums">{scores[scores.length - 1].toFixed(3)}</b>
          </p>
          <ol className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {state.rows.map((row, i) => (
              <li key={row.id} className="overflow-hidden rounded-lg border border-line">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={row.thumb_url ?? row.src_url} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                <div className="px-1.5 py-1 text-caption">
                  <span className="flex items-baseline justify-between tabular-nums">
                    <span className="text-muted">#{i + 1}</span>
                    <b>{scores[i].toFixed(3)}</b>
                    <span className="text-muted">{Math.round((scores[i] / top) * 100)}%</span>
                  </span>
                  <p className="truncate text-muted">{row.photographer ?? "작가 없음"}</p>
                  <p className="truncate">
                    {row.purposes.length
                      ? row.purposes.map((key) => purposeLabel(key as PurposeKey)).join(" · ")
                      : <span className="text-faint">목적 없음</span>}
                  </p>
                  <p className="truncate text-muted">{row.moodTags.slice(0, 3).join(" · ")}</p>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </>
  );
}
