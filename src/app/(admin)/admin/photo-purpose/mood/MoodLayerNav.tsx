"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";

/**
 * 무드 어휘의 층 · 갈래 이동 — 어드민 둘째 줄 (docs/40 §16-1 · §17-3 · §17-5, 사람 결정 2026-09-29).
 *
 * 층은 아래서 위로 쌓인다 — **뎁스 하나에 칸 하나**다(사람 요청 2026-09-29, D1·D2 처럼 묶어 놓지 않는다):
 * D0 낱말 → D1 검색어 → D2 묶음 → D3 무리 → 이웃 그래프 → D4 가족 → D5 큰 무드. (사진마다 붙인 D4 · D5 는 첫 줄 「사진 태그」, docs/47)
 * 한 화면이 두 뎁스를 담을 때는 `view` 로 가른다(`/terms?view=terms` 는 D1, 맨 주소는 D2 · `/families/photo?view=big` 은 D5).
 * **갈래가 둘이고 유래가 다르다** — 사전 전체는 우리말샘 97만 표제어를 전처리로 줄인 쪽이고, 사진 뼈대는 그게 너무 커서
 * 사진에 쓸 말만 1,133개로 다시 시작한 쪽이다. 같은 층에서 갈래만 바꿀 수 있게 오른쪽에 갈래 단추를 둔다.
 * 갈래는 주소로 안다(/photo 로 끝나거나 view=photo). 그 갈래에 없는 층은 점선으로 흐리게 두고 있는 쪽으로 보낸다.
 */
type Track = "photo" | "dict";
type Layer = { key: string; label: string; step: string; photo?: string; dict?: string };

const M = "/admin/photo-purpose/mood";
const LAYERS: Layer[] = [
  { key: "words", label: "낱말", step: "D0", photo: `${M}?view=photo`, dict: M },
  { key: "terms", label: "검색어", step: "D1", photo: `${M}/terms/photo?view=terms`, dict: `${M}/terms?view=terms` },
  { key: "groups", label: "묶음", step: "D2", photo: `${M}/terms/photo`, dict: `${M}/terms` },
  { key: "clusters", label: "무리", step: "D3", photo: `${M}/cluster/photo`, dict: `${M}/cluster` },
  { key: "neighbors", label: "이웃 그래프", step: "", photo: `${M}/neighbors/photo`, dict: `${M}/neighbors` },
  { key: "families", label: "가족", step: "D4", photo: `${M}/families/photo` },
  { key: "moods", label: "큰 무드", step: "D5", photo: `${M}/families/photo?view=big` },
  { key: "review", label: "무드 검수", step: "", dict: `${M}/review` },
];

const TRACKS: { key: Track; label: string; note: string }[] = [
  { key: "photo", label: "사진 뼈대", note: "사진에 실제로 쓸 말만 1,133개로 다시 시작한 갈래 — 지금 쌓는 것이 이쪽입니다. 큰 무드까지 서 있습니다." },
  { key: "dict", label: "사전 전체", note: "우리말샘 97만 표제어를 전처리로 7.3만까지 줄인 갈래 — 검색어 4.7만을 다 판정하려니 토큰이 너무 들어 무리(D3)에서 멈췄습니다." },
];

/** 지금 어느 층인가 — 주소가 가장 깊게 맞는 것 하나. 한 화면이 두 뎁스를 담는 곳은 view 로 가른다. 낱말은 /mood 자체라 맨 뒤에서 본다. */
function currentLayer(pathname: string, view: string | null) {
  if (pathname.startsWith(`${M}/families`)) return view === "big" ? "moods" : "families";
  if (pathname.startsWith(`${M}/cluster`)) return "clusters";
  if (pathname.startsWith(`${M}/neighbors`)) return "neighbors";
  if (pathname.startsWith(`${M}/review`)) return "review";
  if (pathname.startsWith(`${M}/terms`)) return view === "terms" ? "terms" : "groups";
  return "words";
}

export function MoodLayerNav() {
  const pathname = usePathname();
  const params = useSearchParams();
  const view = params.get("view");
  // 주소가 /photo 로 끝나거나 view=photo 면 사진 뼈대다. includes 로 보면 안 된다 — 밑동이 /photo-purpose 라 다 걸린다
  const track: Track = pathname.endsWith("/photo") || view === "photo" ? "photo" : "dict";
  const here = currentLayer(pathname, view);
  const hereLayer = LAYERS.find((l) => l.key === here);
  const other: Track = track === "photo" ? "dict" : "photo";

  return (
    <div className="mb-6 border-b border-border pb-3 pt-3">
      <nav aria-label="무드 층" className="flex flex-wrap items-center gap-1.5">
        {LAYERS.map((layer) => {
          const only = !layer[track];                     // 이 갈래에는 없는 층 — 있는 쪽으로 보낸다
          const active = here === layer.key;
          return (
            <Link
              key={layer.key}
              href={layer[track] ?? layer[other]!}
              aria-current={active ? "page" : undefined}
              title={only ? `${other === "photo" ? "사진 뼈대" : "사전 전체"} 갈래에만 있습니다` : undefined}
              className={cn(
                "rounded-xl border px-3.5 py-2 text-body-sm transition-colors",
                active ? "border-brand bg-brand/10 font-semibold text-brand"
                  : only ? "border-dashed border-line text-muted/60 hover:text-fg"
                    : "border-line text-muted hover:border-fg/40 hover:text-fg",
              )}
            >
              {layer.step && <span className="mr-1.5 text-caption tabular-nums opacity-60">{layer.step}</span>}
              {layer.label}
            </Link>
          );
        })}

        {/* 갈래 — 같은 층에 머문 채 사진 뼈대와 사전 전체를 오간다 */}
        <div className="ml-auto flex items-center gap-1 rounded-xl border border-line p-1" role="group" aria-label="갈래">
          {TRACKS.map((t) => (
            <Link
              key={t.key}
              href={hereLayer?.[t.key] ?? LAYERS.find((l) => l[t.key])![t.key]!}
              aria-current={track === t.key ? "true" : undefined}
              className={cn("rounded-lg px-3 py-1.5 text-caption transition-colors",
                track === t.key ? "bg-fg font-semibold text-bg" : "text-muted hover:text-fg")}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </nav>
      <p className="mt-2 text-caption text-muted">
        <b className="text-fg">{TRACKS.find((t) => t.key === track)!.label}</b> — {TRACKS.find((t) => t.key === track)!.note}
      </p>
    </div>
  );
}
