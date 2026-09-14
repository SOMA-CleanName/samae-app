"use client";

/* eslint-disable @next/next/no-img-element */
import { useDeferredValue, useMemo, useState, useTransition } from "react";

import { cn } from "@/lib/cn";
import { PURPOSE_OPTIONS, purposeLabel, type PurposeKey } from "@/lib/photo-purpose";
import {
  filterPurposeAlbums,
  reviewAlbumOptimistically,
  reviewPhotoOptimistically,
  type AdminPurposeAlbum,
  type PurposeFilter,
} from "@/lib/photo-purpose-admin";

import {
  clearPhotoPurposeOverride,
  reviewAlbumPurpose,
  reviewPhotoPurpose,
  setAlbumPurpose,
  setAlbumPackage,
  setPhotoPurpose,
} from "./actions";

const STATE_OPTIONS: Array<{ key: PurposeFilter["state"]; label: string }> = [
  { key: "all", label: "전체" },
  { key: "unclassified", label: "미분류" },
  { key: "low-confidence", label: "저신뢰" },
  { key: "auto", label: "자동 분류" },
  { key: "reviewed", label: "검수 완료" },
  { key: "text-conflict", label: "텍스트 충돌" },
  { key: "package-unlinked", label: "패키지 미연결" },
];

function sourceLabel(source: AdminPurposeAlbum["source"]) {
  if (source === "siglip") return "SigLIP 자동 분류";
  if (source === "text") return "텍스트 자동 분류";
  if (source === "hybrid") return "텍스트+SigLIP 분류";
  if (source === "manual") return "운영자 수동 분류";
  return "분류 전";
}

function confidenceLabel(value: number | null) {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function stateTone(album: AdminPurposeAlbum) {
  if (album.purpose === null) return "border-danger/40 bg-danger-soft text-danger-ink";
  if (album.reviewed) return "border-success/40 bg-success-soft text-success-ink";
  return "border-line-strong bg-surface-2 text-muted";
}

function stateLabel(album: AdminPurposeAlbum) {
  if (album.purpose === null) return "미분류";
  if (album.reviewed) return "검수 완료";
  return "자동 분류";
}

function applyAlbumOptimistically(
  albums: AdminPurposeAlbum[],
  groupId: string,
  purpose: PurposeKey,
) {
  return albums.map((album) =>
    album.id !== groupId
      ? album
      : {
          ...album,
          purpose,
          confidence: 1,
          source: "manual" as const,
          reviewed: true,
          photos: album.photos.map((photo) =>
            photo.overridden
              ? photo
              : {
                  ...photo,
                  purpose,
                  confidence: 1,
                  source: "manual" as const,
                  reviewed: true,
                },
          ),
        },
  );
}

function applyPhotoOptimistically(
  albums: AdminPurposeAlbum[],
  groupId: string,
  photoId: string,
  purpose: PurposeKey,
) {
  return albums.map((album) => {
    if (album.id !== groupId) return album;
    const photos = album.photos.map((photo) =>
      photo.id === photoId
        ? {
            ...photo,
            purpose,
            confidence: 1,
            source: "manual" as const,
            reviewed: true,
            overridden: true,
          }
        : photo,
    );
    return {
      ...album,
      ...(album.albumId === null
        ? { purpose, confidence: 1, source: "manual" as const, reviewed: true }
        : {}),
      photos,
      overrideCount: photos.filter((photo) => photo.overridden).length,
    };
  });
}

function clearPhotoOptimistically(
  albums: AdminPurposeAlbum[],
  groupId: string,
  photoId: string,
) {
  return albums.map((album) => {
    if (album.id !== groupId) return album;
    const inherited = album.albumId === null
      ? { purpose: null, confidence: null, source: null, reviewed: false }
      : {
          purpose: album.purpose,
          confidence: album.confidence,
          source: album.source,
          reviewed: album.reviewed,
        };
    const photos = album.photos.map((photo) =>
      photo.id === photoId ? { ...photo, ...inherited, overridden: false } : photo,
    );
    return {
      ...album,
      ...(album.albumId === null ? inherited : {}),
      photos,
      overrideCount: photos.filter((photo) => photo.overridden).length,
    };
  });
}

export function PhotoPurposeWorkspace({ initialAlbums }: { initialAlbums: AdminPurposeAlbum[] }) {
  const [albums, setAlbums] = useState(initialAlbums);
  const [state, setState] = useState<PurposeFilter["state"]>("unclassified");
  const [purposeFilter, setPurposeFilter] = useState<PurposeFilter["purpose"]>("all");
  const [photographer, setPhotographer] = useState("");
  const deferredPhotographer = useDeferredValue(photographer);
  const [selectedAlbumId, setSelectedAlbumId] = useState(initialAlbums[0]?.id ?? "");
  const [selectedPhotoId, setSelectedPhotoId] = useState("");
  const [choice, setChoice] = useState<{ context: string; purpose: PurposeKey } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(
    () =>
      filterPurposeAlbums(albums, {
        state,
        purpose: purposeFilter,
        photographer: deferredPhotographer,
      }),
    [albums, deferredPhotographer, purposeFilter, state],
  );
  const selectedAlbum =
    filtered.find((album) => album.id === selectedAlbumId) ?? filtered[0] ?? null;
  const selectedPhoto = selectedAlbum
    ? selectedAlbum.photos.find((photo) => photo.id === selectedPhotoId) ?? selectedAlbum.photos[0]
    : null;
  const context = selectedAlbum && selectedPhoto ? `${selectedAlbum.id}:${selectedPhoto.id}` : "";
  const selectedPurpose =
    choice?.context === context
      ? choice.purpose
      : selectedPhoto?.overridden
        ? selectedPhoto.purpose
        : selectedAlbum?.purpose;

  const counts = useMemo(
    () =>
      new Map(
        STATE_OPTIONS.map((option) => [
          option.key,
          filterPurposeAlbums(albums, {
            state: option.key,
            purpose: "all",
            photographer: "",
          }).length,
        ]),
      ),
    [albums],
  );

  function selectAlbum(album: AdminPurposeAlbum) {
    setSelectedAlbumId(album.id);
    setSelectedPhotoId(album.photos[0]?.id ?? "");
    setError(null);
  }

  function savePortfolio() {
    if (!selectedAlbum || !selectedPhoto || !selectedPurpose) return;
    const snapshot = albums;
    const groupId = selectedAlbum.id;
    setError(null);
    setAlbums(applyAlbumOptimistically(albums, groupId, selectedPurpose));
    startTransition(async () => {
      try {
        if (selectedAlbum.albumId) {
          await setAlbumPurpose(selectedAlbum.albumId, selectedPurpose);
        } else {
          await setPhotoPurpose(selectedPhoto.id, selectedPurpose);
          setAlbums((current) =>
            applyPhotoOptimistically(current, groupId, selectedPhoto.id, selectedPurpose),
          );
        }
      } catch (caught) {
        setAlbums(snapshot);
        setError(caught instanceof Error ? caught.message : "목적을 저장하지 못했습니다.");
      }
    });
  }

  function savePhoto() {
    if (!selectedAlbum || !selectedPhoto || !selectedPurpose) return;
    const snapshot = albums;
    const groupId = selectedAlbum.id;
    setError(null);
    setAlbums(applyPhotoOptimistically(albums, groupId, selectedPhoto.id, selectedPurpose));
    startTransition(async () => {
      try {
        await setPhotoPurpose(selectedPhoto.id, selectedPurpose);
      } catch (caught) {
        setAlbums(snapshot);
        setError(caught instanceof Error ? caught.message : "사진 목적을 저장하지 못했습니다.");
      }
    });
  }

  function resetPhoto() {
    if (!selectedAlbum || !selectedPhoto) return;
    const snapshot = albums;
    const groupId = selectedAlbum.id;
    setError(null);
    setAlbums(clearPhotoOptimistically(albums, groupId, selectedPhoto.id));
    startTransition(async () => {
      try {
        await clearPhotoPurposeOverride(selectedPhoto.id);
      } catch (caught) {
        setAlbums(snapshot);
        setError(caught instanceof Error ? caught.message : "사진 예외를 해제하지 못했습니다.");
      }
    });
  }

  function reviewPortfolio() {
    if (!selectedAlbum || !selectedPhoto || !selectedAlbum.purpose) return;
    const snapshot = albums;
    const groupId = selectedAlbum.id;
    setError(null);
    setAlbums((current) => reviewAlbumOptimistically(current, groupId));
    startTransition(async () => {
      try {
        if (selectedAlbum.albumId) {
          await reviewAlbumPurpose(selectedAlbum.albumId);
        } else {
          await reviewPhotoPurpose(selectedPhoto.id);
        }
      } catch (caught) {
        setAlbums(snapshot);
        setError(caught instanceof Error ? caught.message : "포트폴리오 검수를 완료하지 못했습니다.");
      }
    });
  }

  function reviewSelectedPhoto() {
    if (!selectedAlbum || !selectedPhoto || !selectedPhoto.purpose) return;
    const snapshot = albums;
    const groupId = selectedAlbum.id;
    setError(null);
    setAlbums((current) => reviewPhotoOptimistically(current, groupId, selectedPhoto.id));
    startTransition(async () => {
      try {
        await reviewPhotoPurpose(selectedPhoto.id);
      } catch (caught) {
        setAlbums(snapshot);
        setError(caught instanceof Error ? caught.message : "사진 검수를 완료하지 못했습니다.");
      }
    });
  }

  function changePackage(packageId: string) {
    if (!selectedAlbum?.albumId) return;
    const snapshot = albums;
    const selectedPackage = selectedAlbum.availablePackages.find((item) => item.id === packageId);
    setError(null);
    setAlbums((current) =>
      current.map((album) =>
        album.id === selectedAlbum.id
          ? {
              ...album,
              packageId: selectedPackage?.id ?? null,
              packageName: selectedPackage?.name ?? null,
              packageDescription: selectedPackage?.description ?? null,
            }
          : album,
      ),
    );
    startTransition(async () => {
      try {
        await setAlbumPackage(selectedAlbum.albumId!, selectedPackage?.id ?? null);
      } catch (caught) {
        setAlbums(snapshot);
        setError(caught instanceof Error ? caught.message : "패키지를 연결하지 못했습니다.");
      }
    });
  }

  return (
    <div className="grid min-h-[680px] gap-3 xl:grid-cols-[300px_minmax(420px,1fr)_330px]">
      <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="border-b border-line p-3.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-title font-semibold">포트폴리오</h2>
            <span className="text-caption tabular-nums text-muted">{filtered.length}개</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            {STATE_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setState(option.key)}
                className={cn(
                  "rounded-lg border px-2.5 py-2 text-left text-caption font-medium transition-colors",
                  state === option.key
                    ? "border-brand bg-brand-soft text-brand-ink"
                    : "border-line bg-bg text-muted hover:border-line-strong hover:text-fg",
                )}
              >
                {option.label}
                <span className="float-right tabular-nums">{counts.get(option.key) ?? 0}</span>
              </button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <select
              value={purposeFilter}
              onChange={(event) => setPurposeFilter(event.target.value as PurposeFilter["purpose"])}
              aria-label="목적 필터"
              className="min-w-0 rounded-lg border border-line bg-bg px-2.5 py-2 text-caption outline-none focus:border-brand"
            >
              <option value="all">목적 전체</option>
              {PURPOSE_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>{option.label}</option>
              ))}
            </select>
            <input
              value={photographer}
              onChange={(event) => setPhotographer(event.target.value)}
              placeholder="작가 검색"
              aria-label="작가 이름 검색"
              className="min-w-0 rounded-lg border border-line bg-bg px-2.5 py-2 text-caption outline-none placeholder:text-faint focus:border-brand"
            />
          </div>
        </div>

        <div className="max-h-[760px] flex-1 space-y-1.5 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="m-2 rounded-xl border border-dashed border-line-strong px-4 py-10 text-center text-body-sm text-muted">
              조건에 맞는 포트폴리오가 없습니다.
            </p>
          ) : null}
          {filtered.map((album) => (
            <button
              key={album.id}
              type="button"
              onClick={() => selectAlbum(album)}
              className={cn(
                "flex w-full gap-3 rounded-xl border p-2.5 text-left transition-colors",
                selectedAlbum?.id === album.id
                  ? "border-brand bg-brand/[0.05]"
                  : "border-transparent hover:border-line hover:bg-fg/[0.025]",
              )}
            >
              <span className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                <img
                  src={album.photos[0]?.thumbUrl ?? album.photos[0]?.srcUrl}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body-sm font-semibold">{album.title}</span>
                <span className="mt-0.5 block truncate text-caption text-muted">
                  {album.photographerName} · {album.photos.length}장
                </span>
                <span className="mt-1 flex items-center gap-1.5">
                  <span className={cn("rounded-md border px-1.5 py-0.5 text-[11px] font-medium", stateTone(album))}>
                    {stateLabel(album)}
                  </span>
                  {album.purpose ? (
                    <span className="truncate text-[11px] text-muted">{purposeLabel(album.purpose)}</span>
                  ) : null}
                  {album.source && album.source !== "manual" ? (
                    <span className="truncate text-[11px] text-muted">{sourceLabel(album.source)}</span>
                  ) : null}
                  {album.overrideCount ? (
                    <span className="text-[11px] text-brand">개별 {album.overrideCount}</span>
                  ) : null}
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="min-w-0 overflow-hidden rounded-2xl border border-line bg-surface">
        {selectedAlbum ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3.5">
              <div className="min-w-0">
                <h2 className="truncate text-title font-semibold">{selectedAlbum.title}</h2>
                <p className="mt-0.5 truncate text-caption text-muted">
                  {selectedAlbum.photographerName}
                  {selectedAlbum.description ? ` · ${selectedAlbum.description}` : ""}
                </p>
              </div>
              <span className="text-caption tabular-nums text-muted">사진 {selectedAlbum.photos.length}장</span>
            </div>
            <div className="grid max-h-[760px] grid-cols-2 gap-2 overflow-y-auto p-3 sm:grid-cols-3 2xl:grid-cols-4">
              {selectedAlbum.photos.map((photo) => (
                <button
                  key={photo.id}
                  type="button"
                  onClick={() => {
                    setSelectedPhotoId(photo.id);
                    setError(null);
                  }}
                  className={cn(
                    "group relative aspect-[4/5] overflow-hidden rounded-xl bg-surface-2 ring-2 transition",
                    selectedPhoto?.id === photo.id
                      ? "ring-brand"
                      : "ring-transparent hover:ring-line-strong",
                  )}
                >
                  <img
                    src={photo.thumbUrl ?? photo.srcUrl}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                  />
                  {photo.overridden ? (
                    <span className="absolute left-2 top-2 rounded-md bg-brand px-2 py-1 text-[11px] font-semibold text-white shadow-card">
                      개별
                    </span>
                  ) : null}
                  {photo.reviewed ? (
                    <span className="absolute right-2 top-2 rounded-md bg-success px-2 py-1 text-[11px] font-semibold text-white shadow-card">
                      검수
                    </span>
                  ) : null}
                  {photo.purpose ? (
                    <span className="absolute inset-x-2 bottom-2 truncate rounded-md bg-black/65 px-2 py-1 text-left text-[11px] font-medium text-white backdrop-blur-sm">
                      {purposeLabel(photo.purpose)}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="flex min-h-[680px] items-center justify-center p-8 text-center text-body-sm text-muted">
            왼쪽에서 검토할 포트폴리오를 선택하세요.
          </div>
        )}
      </section>

      <aside className="overflow-hidden rounded-2xl border border-line bg-surface">
        {selectedAlbum && selectedPhoto ? (
          <div className="divide-y divide-line">
            <div className="p-4">
              <h2 className="text-title font-semibold">목적 분류</h2>
              <div className="mt-3 flex gap-3">
                <img
                  src={selectedPhoto.thumbUrl ?? selectedPhoto.srcUrl}
                  alt="선택한 사진"
                  className="h-20 w-20 rounded-xl object-cover"
                />
                <dl className="min-w-0 flex-1 space-y-1 text-caption">
                  <div className="flex justify-between gap-2"><dt className="text-muted">사진</dt><dd className="truncate">{selectedPhoto.id.slice(0, 8)}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-muted">신뢰도</dt><dd>{confidenceLabel(selectedAlbum.confidence)}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-muted">출처</dt><dd className="truncate">{sourceLabel(selectedAlbum.source)}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-muted">포트폴리오 검수</dt><dd>{selectedAlbum.reviewed ? "완료" : "미검수"}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-muted">선택 사진 검수</dt><dd>{selectedPhoto.reviewed ? "완료" : "미검수"}</dd></div>
                  {selectedPhoto.title ? (
                    <div className="flex justify-between gap-2"><dt className="text-muted">사진 제목</dt><dd className="truncate">{selectedPhoto.title}</dd></div>
                  ) : null}
                </dl>
              </div>
            </div>

            {selectedAlbum.albumId ? (
              <div className="p-4">
                <label className="text-body-sm font-semibold" htmlFor="purpose-package-select">
                  연결 패키지
                </label>
                <select
                  id="purpose-package-select"
                  value={selectedAlbum.packageId ?? ""}
                  onChange={(event) => changePackage(event.target.value)}
                  disabled={pending}
                  className="mt-2 w-full rounded-lg border border-line bg-bg px-3 py-2 text-caption outline-none focus:border-brand disabled:opacity-50"
                >
                  <option value="">패키지 미연결</option>
                  {selectedAlbum.availablePackages.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
                {selectedAlbum.packageDescription ? (
                  <p className="mt-2 line-clamp-3 text-caption leading-relaxed text-muted">
                    {selectedAlbum.packageDescription}
                  </p>
                ) : null}
              </div>
            ) : null}

            {selectedAlbum.evidence ? (
              <div className="p-4">
                <p className="text-body-sm font-semibold">자동 분류 근거</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(selectedAlbum.evidence.text_matches ?? []).map((match, index) => (
                    <span
                      key={`${match.source}:${match.phrase}:${index}`}
                      className="rounded-full border border-line bg-bg px-2 py-1 text-[11px] text-muted"
                    >
                      {match.source} · {match.phrase} → {purposeLabel(match.purpose)}
                    </span>
                  ))}
                </div>
                {selectedAlbum.evidence.image_purpose ? (
                  <p className="mt-2 text-caption text-muted">
                    SigLIP 후보: {purposeLabel(selectedAlbum.evidence.image_purpose)}
                    {selectedAlbum.evidence.image_confidence != null
                      ? ` · ${confidenceLabel(selectedAlbum.evidence.image_confidence)}`
                      : ""}
                  </p>
                ) : null}
                {selectedAlbum.evidence.text_conflict ? (
                  <p className="mt-2 rounded-lg bg-danger-soft px-2.5 py-2 text-caption text-danger-ink">
                    강한 텍스트 근거가 충돌해 수동 검수가 필요합니다.
                  </p>
                ) : null}
              </div>
            ) : null}

            <fieldset className="p-4" disabled={pending}>
              <legend className="text-body-sm font-semibold">사진 목적</legend>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {PURPOSE_OPTIONS.map((option) => {
                  const active = selectedPurpose === option.key;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setChoice({ context, purpose: option.key })}
                      className={cn(
                        "rounded-lg border px-3 py-2.5 text-left text-caption font-medium transition-colors",
                        active
                          ? "border-brand bg-brand-soft text-brand-ink"
                          : "border-line bg-bg text-muted hover:border-line-strong hover:text-fg",
                      )}
                    >
                      <span className={cn("mr-2 inline-block h-2.5 w-2.5 rounded-full border", active ? "border-brand bg-brand" : "border-faint")} />
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="p-4">
              <p className="text-body-sm font-semibold">검수 완료</p>
              <p className="mt-1 text-caption leading-relaxed text-muted">
                포트폴리오 검수는 포함된 모든 사진을 함께 검수 완료 처리합니다.
              </p>
              <div className="mt-3 space-y-2">
                <button
                  type="button"
                  onClick={reviewPortfolio}
                  disabled={pending || !selectedAlbum.purpose || selectedAlbum.reviewed}
                  className="w-full rounded-xl bg-fg px-4 py-3 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {selectedAlbum.reviewed ? "포트폴리오 검수 완료됨" : "포트폴리오 검수 완료"}
                </button>
                <button
                  type="button"
                  onClick={reviewSelectedPhoto}
                  disabled={pending || !selectedPhoto.purpose || selectedPhoto.reviewed}
                  className="w-full rounded-xl border border-line-strong px-4 py-3 text-body-sm font-semibold text-fg transition-colors hover:bg-fg/[0.04] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {selectedPhoto.reviewed ? "선택 사진 검수 완료됨" : "선택 사진 검수 완료"}
                </button>
              </div>
            </div>

            <div className="p-4">
              <p className="text-body-sm font-semibold">적용 방식</p>
              <p className="mt-1 text-caption leading-relaxed text-muted">
                포트폴리오 적용은 개별 예외를 제외한 모든 사진에 저장됩니다.
              </p>
              <div className="mt-3 space-y-2">
                <button
                  type="button"
                  onClick={savePortfolio}
                  disabled={pending || !selectedPurpose}
                  className="w-full rounded-xl bg-fg px-4 py-3 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {pending ? "저장 중…" : selectedAlbum.albumId ? "포트폴리오 전체에 적용" : "단독 사진에 적용"}
                </button>
                <button
                  type="button"
                  onClick={savePhoto}
                  disabled={pending || !selectedPurpose}
                  className="w-full rounded-xl bg-brand px-4 py-3 text-body-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  선택한 사진만 개별 적용
                </button>
                <button
                  type="button"
                  onClick={resetPhoto}
                  disabled={pending || !selectedPhoto.overridden}
                  className="w-full rounded-xl border border-line-strong px-4 py-3 text-body-sm font-medium text-muted transition-colors hover:bg-fg/[0.04] hover:text-fg disabled:cursor-not-allowed disabled:opacity-35"
                >
                  선택한 사진의 개별 분류 해제
                </button>
              </div>
              {error ? (
                <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-caption text-danger-ink">
                  {error}
                </p>
              ) : null}
            </div>

            <div className="p-4">
              <p className="text-body-sm font-semibold">무드 태그</p>
              <p className="mt-1 text-caption leading-relaxed text-muted">
                무드 분류는 다음 단계에서 이 작업 화면에 추가됩니다. 기존 무드 열은 변경하지 않습니다.
              </p>
            </div>
          </div>
        ) : (
          <p className="p-6 text-center text-body-sm text-muted">편집할 사진이 없습니다.</p>
        )}
      </aside>
    </div>
  );
}
