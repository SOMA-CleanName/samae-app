import { purposeLabel, routeLabel, type SearchInterpretation } from "@/lib/search-interpretation";

// 검색어 해석을 칩으로 — 어떤 길로 찾았나 · 목적 · 잡힌 무드 가족 · 모자라 채운 무드.
// 검색어 순위 · 최근 검색 · 시뮬레이터가 같이 쓴다(훅 없음 — 서버 · 클라이언트 어디서든).

const ROUTE_TONE: Record<string, string> = {
  "무드 가족 · 정확": "bg-success-soft text-success-ink",
  "큰 무드 · 애매": "bg-warning-soft text-warning-ink",
};

export function RouteBadge({ label }: { label: string }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        ROUTE_TONE[label] ?? "bg-fg/[0.06] text-muted"
      }`}
    >
      {label}
    </span>
  );
}

export function InterpretationChips({
  interpretation: i,
  showRoute = true,
}: {
  interpretation: SearchInterpretation;
  showRoute?: boolean;
}) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {showRoute && <RouteBadge label={routeLabel(i)} />}
      {i.purposes.map((p) => (
        <span key={`p-${p}`} className="rounded-full border border-line-strong px-2 py-0.5 text-[11px] text-muted">
          목적 {purposeLabel(p)}
        </span>
      ))}
      {i.moodFamilies.map((m) => (
        <span key={`m-${m}`} className="rounded-full bg-fg px-2 py-0.5 text-[11px] font-medium text-bg">
          {m}
        </span>
      ))}
      {i.moodFilled.length > 0 && (
        <span className="text-[11px] text-faint">+ 채움 {i.moodFilled.join(" · ")}</span>
      )}
      {!i.moodFamilies.length && i.moodText && (
        <span className="text-[11px] text-faint">무드 글자 「{i.moodText}」</span>
      )}
    </span>
  );
}
