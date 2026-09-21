"use client";

// 안내 이미지 양식 — 고르면 그 자리에서 결과가 바뀐다.
//
// 고르기와 미리보기를 한 화면에 둔 이유: 저장해야만 볼 수 있으면 조합을 비교할 수가
// 없다. 템플릿 6 × 배경지 6 을 눈으로 견줘야 하는 일이라, 누르는 즉시 그림이 다시
// 그려지는 게 이 화면의 전부다.
//
// 미리보기는 **저장하지 않는다.** 고른 값은 쿼리로 라우트에 실려 가고, [적용] 을
// 눌러야 DB 에 들어간다.

import { useCallback, useEffect, useState } from "react";
import { TEMPLATES, BACKDROPS, FONTS, type GuideStyle } from "@/lib/guide-style";
import { saveGuideStyle, uploadGuideBackdrop } from "./actions";

type SheetInfo = { sheet: number; label: string; cards: number };

export function GuideStylePanel({
  photographerId,
  initial,
}: {
  photographerId: string;
  initial: GuideStyle;
}) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<GuideStyle>(initial);
  const [sheets, setSheets] = useState<SheetInfo[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"load" | "save" | "upload" | null>(null);
  // 같은 URL 이면 브라우저가 옛 그림을 물고 있다 — 고를 때마다 바꿔 캐시를 깬다
  const [stamp, setStamp] = useState(0);
  // 크게 볼 장 — 미리보기는 240px 라 글자를 못 읽는다
  const [zoom, setZoom] = useState<SheetInfo | null>(null);

  const dirty =
    style.template !== initial.template ||
    style.backdrop !== initial.backdrop ||
    style.font !== initial.font ||
    style.backdropUrl !== initial.backdropUrl;

  const loadSheets = useCallback(async () => {
    setBusy("load");
    setError(null);
    try {
      const res = await fetch(`/api/admin/guide-card?pid=${photographerId}`, { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { sheets: SheetInfo[] };
      setSheets(data.sheets);
      if (data.sheets.length === 0) setError("저장된 카드가 없어요. [KB 저장] 을 먼저 눌러주세요.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "미리보기를 만들지 못했어요.");
    } finally {
      setBusy(null);
    }
  }, [photographerId]);

  // 확대해서 보는 중에는 Esc 로 닫는다 — 오버레이를 정확히 누르지 않아도 되게
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoom(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  /** 고른 값이 바뀔 때마다 이미지 URL 이 바뀌어 자동으로 다시 그려진다 */
  const pick = (next: Partial<GuideStyle>) => {
    setStyle((s) => ({ ...s, ...next }));
    setStamp((n) => n + 1);
    setMsg(null);
  };

  const imgSrc = (sheet: number) => {
    const q = new URLSearchParams({
      pid: photographerId,
      sheet: String(sheet),
      template: style.template,
      backdrop: style.backdrop,
      font: style.font,
      t: String(stamp),
    });
    if (style.backdropUrl) q.set("backdropUrl", style.backdropUrl);
    return `/api/admin/guide-card?${q.toString()}`;
  };

  const apply = async () => {
    setBusy("save");
    const r = await saveGuideStyle(photographerId, style);
    setMsg(
      r.ok
        ? { ok: true, text: "이 양식으로 저장했어요." }
        : { ok: false, text: r.error ?? "저장하지 못했어요." }
    );
    setBusy(null);
  };

  const onFile = async (file: File | null) => {
    if (!file) return;
    setBusy("upload");
    setMsg(null);
    const fd = new FormData();
    fd.set("photographerId", photographerId);
    fd.set("file", file);
    const r = await uploadGuideBackdrop(fd);
    if (r.ok && r.url) pick({ backdropUrl: r.url });
    else setMsg({ ok: false, text: r.error ?? "올리지 못했어요." });
    setBusy(null);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          // 여는 순간 불러온다. effect 로 미루면 한 번 더 그려지기만 하고 얻는 게 없다.
          setOpen(true);
          if (sheets === null) void loadSheets();
        }}
        className="cursor-pointer rounded-lg border border-line px-4 py-2 text-body-sm font-semibold text-muted transition-colors hover:bg-fg/[0.05]"
      >
        양식 고르기·미리보기
      </button>
    );
  }

  return (
    <div className="mt-3 w-full rounded-2xl border border-line bg-bg p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-body-sm font-semibold">안내 이미지 양식</p>
        <span className="text-caption text-faint">
          고르면 아래 미리보기가 바로 바뀌어요 · 아직 고객에게 보이지 않습니다
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="ml-auto text-caption text-faint transition-colors hover:text-fg"
        >
          닫기
        </button>
      </div>

      {/* 템플릿 */}
      <p className="mt-4 text-caption text-muted">템플릿</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {TEMPLATES.map((t) => {
          const on = style.template === t.key;
          return (
            <button
              key={t.key}
              type="button"
              title={t.hint}
              onClick={() => pick({ template: t.key })}
              className={
                "cursor-pointer rounded-lg border px-3 py-1.5 text-caption transition-colors " +
                (on ? "border-fg bg-fg font-semibold text-bg" : "border-line hover:bg-fg/[0.05]")
              }
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-caption text-faint">
        {TEMPLATES.find((t) => t.key === style.template)?.hint}
      </p>

      {/* 글씨체 */}
      <p className="mt-4 text-caption text-muted">글씨체</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {FONTS.map((f) => {
          const on = style.font === f.key;
          return (
            <button
              key={f.key}
              type="button"
              title={f.hint}
              onClick={() => pick({ font: f.key })}
              className={
                "cursor-pointer rounded-lg border px-3 py-1.5 text-caption transition-colors " +
                (on ? "border-fg bg-fg font-semibold text-bg" : "border-line hover:bg-fg/[0.05]")
              }
            >
              {f.label}
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-caption text-faint">{FONTS.find((f) => f.key === style.font)?.hint}</p>

      {/* 배경지 — 칩에 실제 그라데이션을 칠해 고르는 것과 나오는 것을 맞춘다 */}
      <p className="mt-4 text-caption text-muted">배경지</p>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {BACKDROPS.map((b) => {
          const on = !style.backdropUrl && style.backdrop === b.key;
          return (
            <button
              key={b.key}
              type="button"
              onClick={() => pick({ backdrop: b.key, backdropUrl: null })}
              className={
                "cursor-pointer rounded-lg border p-1 transition-colors " +
                (on ? "border-fg" : "border-line hover:border-line-strong")
              }
            >
              <span className="block h-9 w-14 rounded" style={{ background: b.background }} aria-hidden />
              <span className="mt-1 block text-center text-caption">{b.label}</span>
            </button>
          );
        })}

        {/* 배경 사진 */}
        <label
          className={
            "flex cursor-pointer flex-col items-center rounded-lg border p-1 transition-colors " +
            (style.backdropUrl ? "border-fg" : "border-line hover:border-line-strong")
          }
        >
          {style.backdropUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={style.backdropUrl} alt="" className="h-9 w-14 rounded object-cover" />
          ) : (
            <span className="grid h-9 w-14 place-items-center rounded border border-dashed border-line text-caption text-faint">
              +
            </span>
          )}
          <span className="mt-1 block text-center text-caption">
            {busy === "upload" ? "올리는 중" : "사진"}
          </span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={busy === "upload"}
            onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>
      {style.backdropUrl && (
        <p className="mt-1 text-caption text-faint">
          사진 위에는 <b className="text-muted">반투명 종이를 한 겹 덮습니다</b> — 어떤 사진이든 글이
          읽히도록.{" "}
          <button
            type="button"
            onClick={() => pick({ backdropUrl: null })}
            className="cursor-pointer underline transition-colors hover:text-fg"
          >
            사진 빼기
          </button>
        </p>
      )}

      {/* 적용 */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void apply()}
          disabled={busy === "save" || !dirty}
          className="cursor-pointer rounded-lg bg-fg px-4 py-2 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy === "save" ? "저장 중…" : "이 양식으로 저장"}
        </button>
        {dirty && busy !== "save" && (
          <span className="text-caption text-muted">고른 양식이 아직 저장되지 않았어요.</span>
        )}
        {msg && (
          <span className={"text-caption " + (msg.ok ? "text-success-ink" : "text-danger-ink")}>
            {msg.text}
          </span>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-caption text-danger-ink">{error}</p>
      )}

      {/* 미리보기 — 스와이프 뷰어에서 넘겨 보는 순서 그대로 */}
      {sheets && sheets.length > 0 && (
        <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
          {sheets.map((s) => (
            <figure key={s.sheet} className="shrink-0">
              <button
                type="button"
                onClick={() => setZoom(s)}
                title="크게 보기"
                className="block cursor-zoom-in"
              >
                {/* key 에 stamp 를 넣어 양식이 바뀌면 img 를 새로 만든다 */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={`${s.sheet}-${stamp}`}
                  src={imgSrc(s.sheet)}
                  alt={s.label}
                  className="w-[240px] rounded-xl border border-line bg-surface transition-opacity hover:opacity-90"
                />
              </button>
              <figcaption className="mt-1 text-caption text-muted">
                {s.sheet}. {s.label} <span className="text-faint">· 카드 {s.cards}장</span>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {busy === "load" && <p className="mt-3 text-caption text-muted">미리보기를 그리는 중…</p>}

      {zoom && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${zoom.label} 크게 보기`}
          onClick={() => setZoom(null)}
          className="fixed inset-0 z-50 flex cursor-zoom-out items-start justify-center overflow-y-auto bg-fg/70 p-6 backdrop-blur-sm"
        >
          <figure className="my-auto" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imgSrc(zoom.sheet)}
              alt={zoom.label}
              className="max-h-[calc(100vh-6rem)] w-auto rounded-xl shadow-pop"
            />
            <figcaption className="mt-2 text-center text-caption text-bg">
              {zoom.sheet}. {zoom.label} · 카드 {zoom.cards}장 — 아무 데나 누르면 닫혀요
            </figcaption>
          </figure>
        </div>
      )}
    </div>
  );
}
