import { cn } from "@/lib/cn";
import { fmt } from "./_data";

// 분석 대시보드 공용 프레젠테이션 컴포넌트

export function Stat({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-2xl border p-4", accent ? "border-brand/30 bg-brand/[0.04]" : "border-line bg-surface")}>
      <p className={cn("text-h2 font-semibold tabular-nums", accent ? "text-brand" : "text-fg")}>{value}</p>
      <p className="mt-0.5 text-caption font-medium text-fg">{label}</p>
      {hint && <p className="text-[11px] text-faint">{hint}</p>}
    </div>
  );
}

export function RankCard({ title, rows, total }: { title: string; rows: [string, number][]; total: number }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <h3 className="text-body-sm font-semibold text-fg">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-3 text-caption text-faint">데이터 없음</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map(([k, n]) => {
            const pct = total > 0 ? Math.round((n / total) * 100) : 0;
            return (
              <li key={k}>
                <div className="flex items-center justify-between gap-3 text-caption">
                  <span className="min-w-0 flex-1 truncate text-fg">{k}</span>
                  <span className="shrink-0 text-muted">
                    <b className="text-fg tabular-nums">{fmt.format(n)}</b> · {pct}%
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-fg/[0.06]">
                  <div className="h-full rounded-full bg-fg/30" style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function PageHeading({ title, caption }: { title: string; caption?: string }) {
  return (
    <div className="mb-4 mt-7">
      <h2 className="text-h2 font-semibold text-fg">{title}</h2>
      {caption && <p className="mt-1 text-body-sm text-muted">{caption}</p>}
    </div>
  );
}

export function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-line-strong bg-surface px-4 py-10 text-center text-caption text-faint">
      {children}
    </p>
  );
}
