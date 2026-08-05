"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { clearAlbumMoodRequests } from "./actions";
import type { AlbumMoodRequest } from "@/lib/target-categories";

// 작가가 '+ 직접 입력'으로 남긴 희망 무드 — 처리 대기 목록.
// 요청은 카테고리를 만들지 않으므로, 운영자가 보고 판단해 기존 무드에 담아주거나
// 새 무드를 만든 뒤 '처리 완료'로 목록에서 내린다.
export function MoodRequestList({ requests }: { requests: AlbumMoodRequest[] }) {
  const [items, setItems] = useState(requests);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  if (items.length === 0) return null;

  function resolve(albumId: string) {
    setBusy(albumId);
    startTransition(async () => {
      try {
        await clearAlbumMoodRequests(albumId);
        setItems((prev) => prev.filter((r) => r.albumId !== albumId));
      } finally {
        setBusy(null);
      }
    });
  }

  return (
    <section className="mb-6 rounded-xl border border-brand/25 bg-brand/[0.04] p-4">
      <h2 className="text-body-sm font-semibold text-fg">
        작가 요청 무드 <span className="text-brand">{items.length}건</span>
      </h2>
      <p className="mt-0.5 text-caption text-muted">
        목록에 없는 무드를 작가가 직접 적어 보낸 거예요. 기존 무드에 담아주거나 새로 만든 뒤
        ‘처리 완료’를 눌러 내려주세요.
      </p>

      <ul className="mt-3 flex flex-col gap-2">
        {items.map((r) => (
          <li
            key={r.albumId}
            className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg bg-surface px-3 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-body-sm font-medium text-fg">
                {r.title ?? "제목 없는 포트폴리오"}
                {r.photographer && (
                  <span className="ml-1.5 text-caption font-normal text-muted">
                    · {r.photographer}
                  </span>
                )}
                {r.adConsent && <span className="ml-1.5 text-caption text-success">· 광고 동의</span>}
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {r.moods.map((m) => (
                  <span
                    key={m}
                    className="rounded-full border border-dashed border-brand/50 bg-brand/[0.06] px-2 py-0.5 text-[11px] font-medium text-brand"
                  >
                    {m}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link
                href={`/admin/explore/assign?album=${r.albumId}`}
                className="rounded-full border border-line-strong px-3 py-1 text-caption font-medium text-fg transition-colors hover:bg-fg/[0.04]"
              >
                담으러 가기
              </Link>
              <button
                type="button"
                onClick={() => resolve(r.albumId)}
                disabled={pending && busy === r.albumId}
                className="rounded-full bg-fg px-3 py-1 text-caption font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {pending && busy === r.albumId ? "처리 중…" : "처리 완료"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
