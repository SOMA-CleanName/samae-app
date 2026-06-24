"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { setCategoryAdPhotos } from "./actions";
import type { AdCandidatePhoto } from "@/lib/categories";
import { SITE_URL } from "@/lib/site";

// 카테고리 광고 소재 채택 — 매칭 사진 썸네일에서 광고로 쓸 사진을 고르고(A/B 다중),
// 저장하면 각 사진별 광고 URL(/?ad=<id>&cat=<slug>)을 복사해 메타 광고에 쓴다.
export function CategoryAdPicker({
  categoryId,
  slug,
  candidates,
  adopted,
}: {
  categoryId: string;
  slug: string;
  candidates: AdCandidatePhoto[];
  adopted: string[];
}) {
  const [selected, setSelected] = useState<string[]>(adopted);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const adUrl = (id: string) => `${SITE_URL}/?ad=${id}&cat=${encodeURIComponent(slug)}`;

  return (
    <form action={setCategoryAdPhotos} className="mt-3">
      <input type="hidden" name="id" value={categoryId} />
      <input type="hidden" name="photoIds" value={selected.join(",")} />

      <div className="flex items-center justify-between gap-2">
        <p className="text-caption text-muted">
          광고 소재로 쓸 사진 선택 (선택 <b className="text-fg">{selected.length}</b>장)
        </p>
        <SaveButton />
      </div>

      {candidates.length === 0 ? (
        <p className="mt-2 text-caption text-faint">매칭되는 공개 사진이 없어요.</p>
      ) : (
        <div className="mt-2 grid grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-8">
          {candidates.map((p) => {
            const on = selected.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                aria-pressed={on}
                className={`relative aspect-square overflow-hidden rounded-md ring-offset-2 ring-offset-surface transition-all ${
                  on ? "ring-2 ring-brand" : "ring-1 ring-line hover:ring-line-strong"
                }`}
              >
                <img
                  src={p.thumb_url ?? p.src_url}
                  alt=""
                  loading="lazy"
                  className={`h-full w-full object-cover transition-opacity ${on ? "" : "opacity-90"}`}
                />
                {on && (
                  <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* 채택된 사진별 광고 URL (저장 후 메타 광고 도착 URL로 사용) */}
      {selected.length > 0 && (
        <div className="mt-3 rounded-lg border border-line bg-surface-2 p-2.5">
          <p className="text-caption font-semibold text-fg">광고 URL (저장 후 사용)</p>
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {selected.map((id) => (
              <li key={id} className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-fg/[0.06] px-2 py-1 text-[11px] text-fg/80">
                  {adUrl(id)}
                </code>
                <CopyButton text={adUrl(id)} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="shrink-0 cursor-pointer rounded-lg bg-fg px-3 py-1.5 text-caption font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {pending ? "저장 중…" : "채택 저장"}
    </button>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* 클립보드 권한 없으면 무시 */
        }
      }}
      className="shrink-0 cursor-pointer rounded-md border border-line-strong px-2 py-1 text-[11px] font-medium text-muted transition-colors hover:bg-fg/[0.04]"
    >
      {copied ? "복사됨" : "복사"}
    </button>
  );
}
