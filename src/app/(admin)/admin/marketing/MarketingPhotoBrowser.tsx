"use client";

/* eslint-disable @next/next/no-img-element */

// 거르기 + 격자. 서버가 한 번에 내려준 목록을 화면에서 줄여 나간다.
//
// 서버 필터를 안 쓴 이유: 1,800장이 1MB 남짓이라 한 번에 받는 게 조건 바꿀 때마다
// 왕복하는 것보다 빠르다. 조건을 이리저리 돌려 보는 게 이 화면의 용도라 응답 속도가 곧 쓸모다.
//
// 판정은 여기서 하지 않는다 — lib/marketing-photos 의 함수를 부른다.

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import {
  EMPTY_FILTER,
  PURPOSE_LABELS,
  blockedReason,
  filterMarketingPhotos,
  isMarketingUsable,
  tallyByPhotographer,
  topMoods,
  type MarketingFilter,
  type MarketingPhoto,
} from "@/lib/marketing-photos";

const CONSENT_TABS: { key: MarketingFilter["consent"]; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "usable", label: "사용 가능" },
  { key: "blocked", label: "사용 불가" },
];

export function MarketingPhotoBrowser({ photos }: { photos: MarketingPhoto[] }) {
  const [f, setF] = useState<MarketingFilter>(EMPTY_FILTER);
  const [zoom, setZoom] = useState<MarketingPhoto | null>(null);

  const set = (patch: Partial<MarketingFilter>) => setF((prev) => ({ ...prev, ...patch }));
  const toggle = (key: "purposes" | "moods", v: string) =>
    setF((prev) => ({
      ...prev,
      [key]: prev[key].includes(v) ? prev[key].filter((x) => x !== v) : [...prev[key], v],
    }));

  const photographers = useMemo(() => tallyByPhotographer(photos), [photos]);
  const moods = useMemo(() => topMoods(photos), [photos]);
  const shown = useMemo(() => filterMarketingPhotos(photos, f), [photos, f]);
  const usableCount = useMemo(() => shown.filter(isMarketingUsable).length, [shown]);

  const dirty =
    f.consent !== "all" ||
    f.photographerId !== null ||
    f.purposes.length > 0 ||
    f.moods.length > 0 ||
    f.query !== "" ||
    !f.includeHidden;

  return (
    <div className="mt-5">
      {/* 동의 — 이 화면의 주된 축이라 가장 크게 */}
      <div className="flex flex-wrap items-center gap-1.5">
        {CONSENT_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => set({ consent: t.key })}
            className={cn(
              "cursor-pointer rounded-lg border px-3.5 py-2 text-body-sm font-semibold transition-colors",
              f.consent === t.key ? "border-fg bg-fg text-bg" : "border-line hover:bg-fg/[0.05]"
            )}
          >
            {t.label}
          </button>
        ))}
        <span className="ml-auto text-body-sm text-muted">
          <b className="font-semibold text-fg">{shown.length.toLocaleString()}</b>장
          {f.consent === "all" && shown.length > 0 && (
            <span className="text-faint"> · 사용 가능 {usableCount.toLocaleString()}</span>
          )}
        </span>
      </div>

      {/* 작가 */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={f.photographerId ?? ""}
          onChange={(e) => set({ photographerId: e.target.value || null })}
          className="cursor-pointer rounded-lg border border-line bg-bg px-3 py-2 text-body-sm"
        >
          <option value="">작가 전체 ({photographers.length}명)</option>
          {photographers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — 가능 {p.usable} / 불가 {p.blocked}
            </option>
          ))}
        </select>

        <input
          value={f.query}
          onChange={(e) => set({ query: e.target.value })}
          placeholder="앨범·작가·무드 검색"
          className="min-w-[180px] flex-1 rounded-lg border border-line bg-bg px-3 py-2 text-body-sm"
        />

        <label className="flex cursor-pointer items-center gap-1.5 text-caption text-muted">
          <input
            type="checkbox"
            checked={f.includeHidden}
            onChange={(e) => set({ includeHidden: e.target.checked })}
            className="cursor-pointer"
          />
          내린 사진 포함
        </label>

        {dirty && (
          <button
            type="button"
            onClick={() => setF(EMPTY_FILTER)}
            className="cursor-pointer text-caption text-faint underline transition-colors hover:text-fg"
          >
            조건 지우기
          </button>
        )}
      </div>

      {/* 용도 */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="text-caption text-faint">용도</span>
        {Object.entries(PURPOSE_LABELS).map(([key, label]) => (
          <Chip key={key} on={f.purposes.includes(key)} onClick={() => toggle("purposes", key)}>
            {label}
          </Chip>
        ))}
      </div>

      {/* 무드 — 자동 분류 어휘라 종류가 정해져 있다(작가 자유 입력 무드는 검색으로) */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-caption text-faint">무드</span>
        {moods.map((m) => (
          <Chip key={m} on={f.moods.includes(m)} onClick={() => toggle("moods", m)}>
            {m}
          </Chip>
        ))}
      </div>

      {/* 격자 */}
      {shown.length === 0 ? (
        <p className="mt-8 text-center text-body-sm text-muted">조건에 맞는 사진이 없어요.</p>
      ) : (
        <ul className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {shown.map((p) => {
            const usable = isMarketingUsable(p);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setZoom(p)}
                  title={blockedReason(p) ?? "사용 가능"}
                  className={cn(
                    "relative block aspect-[3/4] w-full cursor-zoom-in overflow-hidden rounded-xl bg-fg/[0.05] ring-2 transition-opacity hover:opacity-90",
                    usable ? "ring-success-ink/50" : "ring-danger-ink/50"
                  )}
                >
                  <img
                    src={p.thumbUrl ?? p.srcUrl}
                    alt={p.albumTitle ?? ""}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                  {!usable && (
                    <span className="absolute inset-x-0 bottom-0 bg-danger-ink/85 px-1.5 py-1 text-center text-caption font-semibold text-white">
                      사용 불가
                    </span>
                  )}
                  {p.feedHidden && (
                    <span className="absolute left-1 top-1 rounded bg-fg/70 px-1.5 py-0.5 text-caption text-bg">
                      내림
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {zoom && <Detail photo={zoom} onClose={() => setZoom(null)} />}
    </div>
  );
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-full border px-2.5 py-1 text-caption transition-colors",
        on ? "border-fg bg-fg font-semibold text-bg" : "border-line hover:bg-fg/[0.05]"
      )}
    >
      {children}
    </button>
  );
}

/** 크게 보기 — 왜 못 쓰는지, 어느 앨범인지가 여기서 드러나야 작가에게 요청할 수 있다 */
function Detail({ photo, onClose }: { photo: MarketingPhoto; onClose: () => void }) {
  const reason = blockedReason(photo);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="사진 정보"
      onClick={onClose}
      className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center overflow-y-auto bg-fg/70 p-5 backdrop-blur-sm"
    >
      <figure className="my-auto max-w-lg" onClick={(e) => e.stopPropagation()}>
        <img
          src={photo.srcUrl}
          alt={photo.albumTitle ?? ""}
          className="max-h-[70vh] w-auto rounded-xl shadow-pop"
        />
        <figcaption className="mt-3 rounded-xl bg-bg p-3 text-body-sm">
          <p className="font-semibold">
            {photo.photographerName}
            {photo.albumTitle && <span className="font-normal text-muted"> · {photo.albumTitle}</span>}
          </p>
          <p className={cn("mt-1 font-semibold", reason ? "text-danger-ink" : "text-success-ink")}>
            {reason ? `사용 불가 — ${reason}` : "사용 가능"}
          </p>
          <p className="mt-1.5 text-caption text-faint">
            {[
              photo.purpose ? PURPOSE_LABELS[photo.purpose] ?? photo.purpose : null,
              photo.feedHidden ? "피드에서 내림" : null,
              ...photo.autoMoodTags,
              ...photo.moodTags,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </figcaption>
      </figure>
    </div>
  );
}
