"use client";

/* eslint-disable @next/next/no-img-element */
import { Fragment, useDeferredValue, useMemo, useState, useTransition } from "react";

import { cn } from "@/lib/cn";
import {
  detailLabel,
  detailPurpose,
  detailsFor,
  GENDER_OPTIONS,
  genderFor,
  genderLabel,
  PURPOSE_DETAILS,
  PURPOSE_OPTIONS,
  purposeChipLabel,
  purposeLabel,
  toggleDetail,
  togglePurpose,
  type PurposeGender,
  type PurposeKey,
} from "@/lib/photo-purpose";
import {
  filterPurposeAlbums,
  formatPurposePrice,
  summarizePurposeCounts,
  applyAlbumPurposes,
  applyPhotoPurposes,
  clearPhotoPurposes,
  reviewAlbumOptimistically,
  reviewPhotoOptimistically,
  type AdminPurposeAlbum,
  type PurposeFilter,
} from "@/lib/photo-purpose-admin";

import {
  clearPhotoPurposeOverride,
  reviewAlbumPurpose,
  reviewPhotoPurpose,
  setAlbumPurposes,
  setAlbumPackage,
  setPhotoPurposes,
} from "./actions";

const STATE_OPTIONS: Array<{ key: PurposeFilter["state"]; label: string }> = [
  { key: "all", label: "전체" },
  { key: "unclassified", label: "미분류" },
  { key: "low-confidence", label: "저신뢰" },
  { key: "auto", label: "자동 분류" },
  { key: "unreviewed", label: "검수 미완료" },
  { key: "reviewed", label: "검수 완료" },
  { key: "text-conflict", label: "텍스트 충돌" },
  { key: "package-linked", label: "상품 지정" },
  { key: "package-unlinked", label: "상품 미지정" },
];

/** 칩 이름 — "개인·여성 (프로필)", "행사 (만삭·가족)". 세부분류는 그 목적 것만 괄호에. */
function chipLabel(purpose: PurposeKey, gender: PurposeGender | null, details: readonly string[]) {
  const own = details.filter((detail) => detailPurpose(detail) === purpose).map(detailLabel);
  const base = purposeChipLabel(purpose, gender);
  return own.length ? `${base} (${own.join("·")})` : base;
}

const countFormatter = new Intl.NumberFormat("ko-KR");

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
  if (album.purposes.length === 0) return "border-danger/40 bg-danger-soft text-danger-ink";
  if (album.reviewed) return "border-success/40 bg-success-soft text-success-ink";
  return "border-line-strong bg-surface-2 text-muted";
}

function stateLabel(album: AdminPurposeAlbum) {
  if (album.purposes.length === 0) return "미분류";
  if (album.reviewed) return "검수 완료";
  return "자동 분류";
}

export function PhotoPurposeWorkspace({
  initialAlbums,
  multiplePurposesReady = true,
  genderReady = false,
  detailsReady = false,
}: {
  initialAlbums: AdminPurposeAlbum[];
  multiplePurposesReady?: boolean;
  /** 성별 칸(0132)이 DB 에 있나. 없으면 성별 선택·필터를 숨긴다. */
  genderReady?: boolean;
  /** 세부분류 칸(0133)이 DB 에 있나. */
  detailsReady?: boolean;
}) {
  const [albums, setAlbums] = useState(initialAlbums);
  const [previousInitialAlbums, setPreviousInitialAlbums] = useState(initialAlbums);
  const [state, setState] = useState<PurposeFilter["state"]>("unclassified");
  const [purposeFilter, setPurposeFilter] = useState<PurposeFilter["purpose"]>("all");
  const [genderFilter, setGenderFilter] = useState<PurposeGender | null>(null);
  const [detailFilter, setDetailFilter] = useState<string | null>(null);
  const [photographer, setPhotographer] = useState("");
  const deferredPhotographer = useDeferredValue(photographer);
  const [selectedAlbumId, setSelectedAlbumId] = useState(initialAlbums[0]?.id ?? "");
  const [selectedPhotoId, setSelectedPhotoId] = useState("");
  const [choice, setChoice] = useState<{
    context: string; purposes: PurposeKey[]; gender: PurposeGender | null; details: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // 새 서버 데이터는 반영하되 현재 필터와 선택은 유지한다.
  if (initialAlbums !== previousInitialAlbums) {
    setPreviousInitialAlbums(initialAlbums);
    setAlbums(initialAlbums);
  }

  const filtered = useMemo(
    () =>
      filterPurposeAlbums(albums, {
        state,
        purpose: purposeFilter,
        gender: genderFilter,
        detail: detailFilter,
        photographer: deferredPhotographer,
      }),
    [albums, deferredPhotographer, detailFilter, genderFilter, purposeFilter, state],
  );
  const selectedAlbum =
    filtered.find((album) => album.id === selectedAlbumId) ?? filtered[0] ?? null;
  const selectedPhoto = selectedAlbum
    ? selectedAlbum.photos.find((photo) => photo.id === selectedPhotoId) ?? selectedAlbum.photos[0]
    : null;
  const selectedPhotoPrice = formatPurposePrice(selectedPhoto?.priceKrw);
  const context = selectedAlbum && selectedPhoto ? `${selectedAlbum.id}:${selectedPhoto.id}` : "";
  const selectedPurposes =
    choice?.context === context
      ? choice.purposes
      : selectedPhoto?.overridden
        ? selectedPhoto.purposes
        : selectedAlbum?.purposes ?? [];
  const savedPurposes = selectedPhoto?.overridden ? selectedPhoto.purposes : selectedAlbum?.purposes ?? [];
  const savedGender = (selectedPhoto?.overridden ? selectedPhoto.gender : selectedAlbum?.gender) ?? null;
  // 성별은 개인 목적이 있을 때만 산다 — 개인을 끄면 고른 성별도 함께 사라진다.
  const selectedGender = genderFor(selectedPurposes, choice?.context === context ? choice.gender : savedGender);
  const savedDetails = (selectedPhoto?.overridden ? selectedPhoto.details : selectedAlbum?.details) ?? [];
  // 세부분류도 목적이 있을 때만 — 목적을 끄면 그 목적의 세부분류가 함께 사라진다.
  const selectedDetails = detailsFor(selectedPurposes, choice?.context === context ? choice.details : savedDetails);
  const savedDetailsKept = detailsFor(savedPurposes, savedDetails);
  const hasUnappliedChanges = selectedPurposes.length !== savedPurposes.length ||
    selectedPurposes.some((purpose, index) => purpose !== savedPurposes[index]) ||
    (genderReady && selectedGender !== genderFor(savedPurposes, savedGender)) ||
    (detailsReady && (selectedDetails.length !== savedDetailsKept.length ||
      selectedDetails.some((detail) => !savedDetailsKept.includes(detail))));
  const genderToSave = genderReady ? selectedGender : undefined;
  const detailsToSave = detailsReady ? selectedDetails : undefined;
  const pick = (purposes: PurposeKey[], gender: PurposeGender | null, details: string[]) =>
    setChoice({ context, purposes, gender, details });
  // 목적은 검수했는데 성별·세부분류가 자동 초안인 포트폴리오 — 검수 버튼이 초안 확정을 맡는다.
  const genderDraft = genderReady && !!selectedAlbum?.gender && selectedAlbum.genderSource === "auto";
  const detailsDraft = detailsReady && !!selectedAlbum?.details.length && selectedAlbum.detailsSource === "auto";
  const draftLabel = [
    genderDraft && selectedAlbum?.gender ? genderLabel(selectedAlbum.gender) : null,
    ...(detailsDraft && selectedAlbum ? selectedAlbum.details.map(detailLabel) : []),
  ].filter(Boolean).join("·");
  const cannotApply = pending || selectedPurposes.length === 0 || (!multiplePurposesReady && selectedPurposes.length > 1);
  const selectedEvidence = selectedPhoto?.overridden ? selectedPhoto.evidence : selectedAlbum?.evidence;

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

  const purposeCounts = useMemo(() => summarizePurposeCounts(albums), [albums]);

  function selectAlbum(album: AdminPurposeAlbum) {
    setSelectedAlbumId(album.id);
    setSelectedPhotoId(album.photos[0]?.id ?? "");
    setError(null);
  }

  function savePortfolio() {
    if (!selectedAlbum || !selectedPhoto || cannotApply) return;
    const snapshot = albums;
    const groupId = selectedAlbum.id;
    setError(null);
    setAlbums(applyAlbumPurposes(albums, groupId, selectedPurposes, genderToSave, detailsToSave));
    startTransition(async () => {
      try {
        if (selectedAlbum.albumId) {
          await setAlbumPurposes(selectedAlbum.albumId, selectedPurposes, genderToSave, detailsToSave);
        } else {
          await setPhotoPurposes(selectedPhoto.id, selectedPurposes, genderToSave, detailsToSave);
          setAlbums((current) =>
            applyPhotoPurposes(current, groupId, selectedPhoto.id, selectedPurposes, genderToSave, detailsToSave),
          );
        }
      } catch (caught) {
        setAlbums(snapshot);
        setError(caught instanceof Error ? caught.message : "목적을 저장하지 못했습니다.");
      }
    });
  }

  function savePhoto() {
    if (!selectedAlbum || !selectedPhoto || cannotApply) return;
    const snapshot = albums;
    const groupId = selectedAlbum.id;
    setError(null);
    setAlbums(applyPhotoPurposes(albums, groupId, selectedPhoto.id, selectedPurposes, genderToSave, detailsToSave));
    startTransition(async () => {
      try {
        await setPhotoPurposes(selectedPhoto.id, selectedPurposes, genderToSave, detailsToSave);
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
    setAlbums(clearPhotoPurposes(albums, groupId, selectedPhoto.id));
    startTransition(async () => {
      try {
        await clearPhotoPurposeOverride(selectedPhoto.id);
        setChoice(null);
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
    // 자동 초안 성별은 포트폴리오 검수와 함께 확정한다.
    const confirmGender = genderReady && selectedAlbum.genderSource === "auto" ? selectedAlbum.gender : null;
    const confirmDetails = detailsReady && selectedAlbum.detailsSource === "auto" && selectedAlbum.details.length
      ? selectedAlbum.details : null;
    setError(null);
    setAlbums((current) => reviewAlbumOptimistically(current, groupId));
    startTransition(async () => {
      try {
        if (selectedAlbum.albumId) {
          await reviewAlbumPurpose(selectedAlbum.albumId, confirmGender, confirmDetails);
        } else {
          await reviewPhotoPurpose(selectedPhoto.id, confirmGender, confirmDetails);
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
    if (!selectedAlbum?.albumId || selectedAlbum.packageSource === "photographer") return;
    const snapshot = albums;
    const selectedPackage = selectedAlbum.availablePackages.find((item) => item.id === packageId);
    setError(null);
    setAlbums((current) =>
      current.map((album) =>
        album.id === selectedAlbum.id
          ? {
              ...album,
              packageId: selectedPackage?.id ?? null,
              packageSource: selectedPackage ? "admin" : null,
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
                  option.key === "package-linked" && "col-start-1",
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
              value={detailFilter ? `detail:${detailFilter}` : genderFilter ? `personal:${genderFilter}` : purposeFilter}
              onChange={(event) => {
                // "personal:female" 은 개인 아래 성별, "detail:event.maternity" 는 세부분류
                const value = event.target.value;
                if (value.startsWith("detail:")) {
                  const detail = value.slice("detail:".length);
                  setPurposeFilter(detailPurpose(detail) ?? "all");
                  setGenderFilter(null);
                  setDetailFilter(detail);
                  return;
                }
                const [purpose, gender] = value.split(":");
                setPurposeFilter(purpose as PurposeFilter["purpose"]);
                setGenderFilter(gender === "female" || gender === "male" ? gender : null);
                setDetailFilter(null);
              }}
              aria-label="목적 필터"
              className="min-w-0 rounded-lg border border-line bg-bg px-2.5 py-2 text-caption outline-none focus:border-brand"
            >
              <option value="all">목적 전체</option>
              {PURPOSE_OPTIONS.map((option) => (
                <Fragment key={option.key}>
                  <option value={option.key}>{option.label}</option>
                  {option.key === "personal" && genderReady
                    ? GENDER_OPTIONS.map((gender) => (
                        <option key={gender.key} value={`personal:${gender.key}`}>
                          {"\u00a0\u00a0"}└ {option.label}·{gender.label}
                        </option>
                      ))
                    : null}
                  {detailsReady
                    ? PURPOSE_DETAILS[option.key].map((detail) => (
                        <option key={detail.value} value={`detail:${detail.value}`}>
                          {"\u00a0\u00a0"}└ {detail.label}
                        </option>
                      ))
                    : null}
                </Fragment>
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
                  {album.purposes.length ? (
                    <span className="truncate text-[11px] text-muted">{album.purposes.map((p) => chipLabel(p, album.gender, album.details)).join(" · ")}</span>
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

        <section className="border-t border-line px-3.5 py-3" aria-label="목적별 집계">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-body-sm font-semibold">목적별 집계</h3>
            <span className="text-[11px] text-muted">전체 공개 사진 기준</span>
          </div>
          <table className="mt-2 w-full text-caption">
            <caption className="sr-only">목적별 포트폴리오 개수와 사진 장수</caption>
            <thead className="text-[11px] text-muted">
              <tr>
                <th scope="col" className="py-1.5 text-left font-medium">목적</th>
                <th scope="col" className="py-1.5 text-right font-medium">포트폴리오</th>
                <th scope="col" className="py-1.5 text-right font-medium">사진</th>
              </tr>
            </thead>
            <tbody>
              {purposeCounts.purposes.map((item) => (
                <Fragment key={item.purpose}>
                  <tr className="border-t border-line">
                    <th scope="row" className="py-1.5 text-left font-medium text-muted">
                      {purposeLabel(item.purpose)}
                    </th>
                    <td className="py-1.5 text-right tabular-nums">{countFormatter.format(item.portfolioCount)}개</td>
                    <td className="py-1.5 text-right tabular-nums">{countFormatter.format(item.photoCount)}장</td>
                  </tr>
                  {detailsReady
                    ? purposeCounts.details
                        .filter((row) => detailPurpose(row.detail) === item.purpose && (row.portfolioCount || row.photoCount))
                        .map((row) => (
                          <tr key={row.detail} className="text-[11px] text-muted">
                            <th scope="row" className="py-1 pl-3 text-left font-normal">· {detailLabel(row.detail)}</th>
                            <td className="py-1 text-right tabular-nums">{countFormatter.format(row.portfolioCount)}개</td>
                            <td className="py-1 text-right tabular-nums">{countFormatter.format(row.photoCount)}장</td>
                          </tr>
                        ))
                    : null}
                  {item.purpose === "personal" && genderReady
                    ? purposeCounts.genders.map((row) => (
                        <tr key={row.gender} className="text-[11px] text-muted">
                          <th scope="row" className="py-1 pl-3 text-left font-normal">└ {genderLabel(row.gender)}</th>
                          <td className="py-1 text-right tabular-nums">{countFormatter.format(row.portfolioCount)}개</td>
                          <td className="py-1 text-right tabular-nums">{countFormatter.format(row.photoCount)}장</td>
                        </tr>
                      ))
                    : null}
                </Fragment>
              ))}
            </tbody>
            <tfoot className="border-t border-line-strong font-semibold">
              <tr>
                <th scope="row" className="pt-2 text-left">전체</th>
                <td className="pt-2 text-right tabular-nums">{countFormatter.format(purposeCounts.portfolioCount)}개</td>
                <td className="pt-2 text-right tabular-nums">{countFormatter.format(purposeCounts.photoCount)}장</td>
              </tr>
            </tfoot>
          </table>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            포트폴리오와 사진에 지정한 목적을 각각 셉니다. 복수 목적은 각각 집계하며, 전체는 중복을 제외합니다.
          </p>
        </section>
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
                  {photo.purposes.length ? (
                    <span className="absolute inset-x-2 bottom-2 flex flex-wrap gap-1 text-left text-[11px] font-medium text-white">
                      {photo.purposes.map((purpose) => (
                        <span key={purpose} className="rounded-md bg-black/65 px-2 py-1 backdrop-blur-sm">{chipLabel(purpose, photo.gender, photo.details)}</span>
                      ))}
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
                  <div className="flex justify-between gap-2"><dt className="text-muted">신뢰도</dt><dd>{confidenceLabel(selectedPhoto.confidence)}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-muted">출처</dt><dd className="truncate">{sourceLabel(selectedPhoto.source)}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-muted">포트폴리오 검수</dt><dd>{selectedAlbum.reviewed ? "완료" : "미검수"}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-muted">선택 사진 검수</dt><dd>{selectedPhoto.reviewed ? "완료" : "미검수"}</dd></div>
                  {genderReady && selectedPhoto.purposes.includes("personal") ? (
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted">성별</dt>
                      <dd>
                        {selectedPhoto.gender ? genderLabel(selectedPhoto.gender) : "미지정"}
                        {selectedPhoto.genderSource === "auto" ? " · 자동 초안" : ""}
                      </dd>
                    </div>
                  ) : null}
                  {detailsReady && selectedPhoto.purposes.length ? (
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted">세부분류</dt>
                      <dd className="truncate">
                        {selectedPhoto.details.length ? selectedPhoto.details.map(detailLabel).join("·") : "미지정"}
                        {selectedPhoto.detailsSource === "auto" ? " · 자동 초안" : ""}
                      </dd>
                    </div>
                  ) : null}
                  {selectedPhoto.title ? (
                    <div className="flex justify-between gap-2"><dt className="text-muted">사진 제목</dt><dd className="truncate">{selectedPhoto.title}</dd></div>
                  ) : null}
                </dl>
              </div>
            </div>

            {selectedAlbum.albumId ? (
              <div className="p-4">
                <label className="text-body-sm font-semibold" htmlFor="purpose-package-select">
                  포트폴리오 패키지
                </label>
                <p className="mt-1 text-caption text-muted">
                  작가 등록 패키지 {countFormatter.format(selectedAlbum.availablePackages.length)}개
                </p>
                <p className="mt-1 text-caption text-muted">
                  {selectedAlbum.packageSource === "photographer"
                    ? "작가 지정 · 작가가 직접 선택한 패키지를 사용합니다."
                    : selectedAlbum.packageSource === "admin"
                      ? "관리자 지정 · 작가에게 표시되지 않습니다."
                      : "관리자 지정은 작가에게 표시되지 않습니다."}
                </p>
                <select
                  id="purpose-package-select"
                  value={selectedAlbum.packageId ?? ""}
                  onChange={(event) => changePackage(event.target.value)}
                  disabled={pending || selectedAlbum.packageSource === "photographer"}
                  className="mt-2 w-full rounded-lg border border-line bg-bg px-3 py-2 text-caption outline-none focus:border-brand disabled:opacity-50"
                >
                  <option value="">포트폴리오 상품 미지정</option>
                  {selectedAlbum.availablePackages.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {formatPurposePrice(item.priceKrw) ?? "가격 확인 필요"}
                    </option>
                  ))}
                </select>
                {selectedAlbum.packageSource !== "photographer" ? (
                  <p className="mt-2 text-caption leading-relaxed text-muted">
                    작가가 직접 패키지를 선택하면 그 값으로 대체됩니다.
                  </p>
                ) : null}
                {!selectedAlbum.packageId && selectedPhotoPrice !== null ? (
                  <div className="mt-2 space-y-1 text-caption leading-relaxed text-muted">
                    <p className="font-medium text-fg">
                      기존 선택 가격 · {selectedPhotoPrice}
                    </p>
                    <p>저장된 가격을 참고해 이 포트폴리오의 상품을 지정해주세요.</p>
                  </div>
                ) : null}
                {selectedAlbum.packageDescription ? (
                  <p className="mt-2 line-clamp-3 text-caption leading-relaxed text-muted">
                    {selectedAlbum.packageDescription}
                  </p>
                ) : null}
              </div>
            ) : null}

            {selectedEvidence ? (
              <div className="p-4">
                <p className="text-body-sm font-semibold">자동 분류 근거</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(selectedEvidence.text_matches ?? []).map((match, index) => (
                    <span
                      key={`${match.source}:${match.phrase}:${index}`}
                      className="rounded-full border border-line bg-bg px-2 py-1 text-[11px] text-muted"
                    >
                      {match.source} · {match.phrase} → {purposeLabel(match.purpose)}
                    </span>
                  ))}
                </div>
                {selectedEvidence.image_purpose ? (
                  <p className="mt-2 text-caption text-muted">
                    SigLIP 후보: {purposeLabel(selectedEvidence.image_purpose)}
                    {selectedEvidence.image_confidence != null
                      ? ` · ${confidenceLabel(selectedEvidence.image_confidence)}`
                      : ""}
                  </p>
                ) : null}
                {selectedEvidence.text_conflict ? (
                  <p className="mt-2 rounded-lg bg-danger-soft px-2.5 py-2 text-caption text-danger-ink">
                    강한 텍스트 근거가 충돌해 수동 검수가 필요합니다.
                  </p>
                ) : null}
              </div>
            ) : null}

            <fieldset className="p-4" disabled={pending}>
              <legend className="text-body-sm font-semibold">사진 목적 · 여러 개 선택</legend>
              <p className="mt-1 text-caption leading-relaxed text-muted">해당하는 목적을 모두 고른 뒤 아래 적용 버튼으로 저장하세요.</p>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {PURPOSE_OPTIONS.map((option) => {
                  const active = selectedPurposes.includes(option.key);
                  return (
                    <button
                      key={option.key}
                      type="button"
                      role="checkbox"
                      aria-checked={active}
                      onClick={() => {
                        pick(togglePurpose(selectedPurposes, option.key), selectedGender, selectedDetails);
                        setError(null);
                      }}
                      className={cn(
                        "rounded-lg border px-3 py-2.5 text-left text-caption font-medium transition-colors",
                        active
                          ? "border-brand bg-brand-soft text-brand-ink"
                          : "border-line bg-bg text-muted hover:border-line-strong hover:text-fg",
                      )}
                    >
                      <span className={cn("mr-2 inline-block h-2.5 w-2.5 rounded-sm border", active ? "border-brand bg-brand" : "border-faint")} />
                      {option.label}
                    </button>
                  );
                })}
              </div>
              {selectedPurposes
                .filter((purpose) => (detailsReady && PURPOSE_DETAILS[purpose].length) || (purpose === "personal" && genderReady))
                .map((purpose) => (
                  <div key={purpose} className="mt-3 rounded-lg border border-line bg-bg p-2.5">
                    <p className="text-caption font-semibold">{purposeLabel(purpose)} · 세부</p>
                    {detailsReady ? (
                      <>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-muted">여러 개 고를 수 있습니다.</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {PURPOSE_DETAILS[purpose].map((detail) => {
                            const active = selectedDetails.includes(detail.value);
                            return (
                              <button
                                key={detail.value}
                                type="button"
                                role="checkbox"
                                aria-checked={active}
                                onClick={() => {
                                  pick(selectedPurposes, selectedGender, toggleDetail(selectedDetails, detail.value));
                                  setError(null);
                                }}
                                className={cn(
                                  "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                                  active
                                    ? "border-brand bg-brand-soft text-brand-ink"
                                    : "border-line bg-surface text-muted hover:border-line-strong hover:text-fg",
                                )}
                              >
                                {detail.label}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    ) : null}
                    {purpose === "personal" && genderReady ? (
                      <>
                        <p id="purpose-gender-label" className="mt-2.5 text-[11px] font-semibold">성별</p>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                          개인 목적에만 붙습니다. 검색에서 “여자”·“남자” 를 가르는 데 씁니다.
                        </p>
                        <div role="radiogroup" aria-labelledby="purpose-gender-label" className="mt-2 grid grid-cols-2 gap-1.5">
                          {GENDER_OPTIONS.map((option) => {
                            const active = selectedGender === option.key;
                            return (
                              <button
                                key={option.key}
                                type="button"
                                role="radio"
                                aria-checked={active}
                                onClick={() => {
                                  // 다시 누르면 지정 해제
                                  pick(selectedPurposes, active ? null : option.key, selectedDetails);
                                  setError(null);
                                }}
                                className={cn(
                                  "rounded-lg border px-3 py-2 text-left text-caption font-medium transition-colors",
                                  active
                                    ? "border-brand bg-brand-soft text-brand-ink"
                                    : "border-line bg-surface text-muted hover:border-line-strong hover:text-fg",
                                )}
                              >
                                <span className={cn("mr-2 inline-block h-2.5 w-2.5 rounded-full border", active ? "border-brand bg-brand" : "border-faint")} />
                                {option.label}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    ) : null}
                  </div>
                ))}
            </fieldset>

            <div className="p-4">
              <p className="text-body-sm font-semibold">선택한 목적 적용</p>
              <p role="status" className={cn("mt-1 text-caption", hasUnappliedChanges ? "text-brand" : "text-muted")}>
                {pending ? "저장 중…" : selectedPurposes.length ? `${selectedPurposes.map((p) => chipLabel(p, selectedGender, selectedDetails)).join(" · ")}${hasUnappliedChanges ? " — 아직 적용하지 않았어요" : ""}` : "목적을 한 개 이상 선택해주세요."}
              </p>
              {!multiplePurposesReady ? (
                <p role="alert" className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-caption text-danger-ink">
                  여러 목적을 저장하려면 DB 업데이트가 필요합니다. 기존 단일 목적은 계속 적용할 수 있습니다.
                </p>
              ) : null}
              <p className="mt-1 text-caption leading-relaxed text-muted">
                포트폴리오 적용은 개별 예외를 제외한 모든 사진에 저장됩니다.
              </p>
              <div className="mt-3 space-y-2">
                <button
                  type="button"
                  onClick={savePortfolio}
                  disabled={cannotApply}
                  className="w-full rounded-xl bg-fg px-4 py-3 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {pending ? "저장 중…" : selectedAlbum.albumId ? "포트폴리오 전체에 적용" : "단독 사진에 적용"}
                </button>
                <button
                  type="button"
                  onClick={savePhoto}
                  disabled={cannotApply}
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
              <p className="text-body-sm font-semibold">검수 완료</p>
              <p className="mt-1 text-caption leading-relaxed text-muted">
                포트폴리오 검수는 포함된 모든 사진을 함께 검수 완료 처리합니다.
              </p>
              <div className="mt-3 space-y-2">
                <button
                  type="button"
                  onClick={reviewPortfolio}
                  disabled={pending || !selectedAlbum.purpose || (selectedAlbum.reviewed && !genderDraft && !detailsDraft)}
                  className="w-full rounded-xl bg-fg px-4 py-3 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {selectedAlbum.reviewed
                    ? genderDraft || detailsDraft ? `초안 확정 — ${draftLabel}` : "포트폴리오 검수 완료됨"
                    : "포트폴리오 검수 완료"}
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
