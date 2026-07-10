"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { setCategoryAdPhotos } from "./actions";
import type { AdCandidatePhoto } from "@/lib/categories";
import { SITE_URL } from "@/lib/site";

// 카테고리 광고 소재 채택 — 매칭 사진 썸네일에서 광고로 쓸 사진을 고르고(A/B 다중),
// 저장하면 각 사진별 광고 URL(/c/<slug>?ad=<id>)을 복사해 메타 광고에 쓴다.
// 맨 앞(★대표) 사진은 광고 URL 없이 /c/<slug> 로 그냥 들어와도 온보딩에서 강조되는 대표 이미지.
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
  const byId = new Map(candidates.map((c) => [c.id, c]));

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // 맨 앞으로 옮기면 그 사진이 이 카테고리 대표(온보딩 강조)가 된다.
  const setRepresentative = (id: string) =>
    setSelected((prev) => [id, ...prev.filter((x) => x !== id)]);

  const adUrl = (id: string) => `${SITE_URL}/c/${encodeURIComponent(slug)}?ad=${id}`;

  return (
    <form action={setCategoryAdPhotos} className="mt-3">
      <input type="hidden" name="id" value={categoryId} />
      <input type="hidden" name="photoIds" value={selected.join(",")} />

      <div className="flex items-center justify-between gap-2">
        <p className="text-caption text-muted">
          광고 소재로 쓸 사진 선택 · 후보 {candidates.length}장 중 선택{" "}
          <b className="text-fg">{selected.length}</b>장
        </p>
        <SaveButton />
      </div>

      {candidates.length === 0 ? (
        <p className="mt-2 text-caption text-faint">매칭되는 공개 사진이 없어요.</p>
      ) : (
        <div className="mt-2 grid max-h-[60vh] grid-cols-4 gap-1.5 overflow-y-auto rounded-lg border border-line p-1.5 sm:grid-cols-6 md:grid-cols-8">
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

      {/* 채택된 사진 — 맨 앞(★대표)이 온보딩 강조 이미지, 각 사진별 광고 URL은 저장 후 사용 */}
      {selected.length > 0 && (
        <div className="mt-3 rounded-lg border border-line bg-surface-2 p-2.5">
          <p className="text-caption font-semibold text-fg">
            채택한 광고 소재 · <span className="text-brand">★ 대표</span>가{" "}
            <code className="rounded bg-fg/[0.06] px-1 text-[11px]">/c/{slug}</code> 진입 시 온보딩 강조 이미지
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {selected.map((id, i) => {
              const p = byId.get(id);
              const rep = i === 0;
              return (
                <li key={id} className="flex items-center gap-2">
                  {p && (
                    <img
                      src={p.thumb_url ?? p.src_url}
                      alt=""
                      className={`h-10 w-10 shrink-0 rounded object-cover ${rep ? "ring-2 ring-brand" : "ring-1 ring-line"}`}
                    />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    {rep ? (
                      <span className="inline-flex w-fit items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold text-white">
                        ★ 대표 · 온보딩 강조
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setRepresentative(id)}
                        className="w-fit cursor-pointer rounded-full border border-line-strong px-2 py-0.5 text-[11px] font-medium text-muted transition-colors hover:bg-fg/[0.04]"
                      >
                        대표로 지정
                      </button>
                    )}
                    <code className="min-w-0 truncate rounded bg-fg/[0.06] px-2 py-1 text-[11px] text-fg/80">
                      {adUrl(id)}
                    </code>
                  </div>
                  <CopyButton text={adUrl(id)} />
                </li>
              );
            })}
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
