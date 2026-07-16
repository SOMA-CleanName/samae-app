// 상단 라이브 뱃지 — "지금 N명 보는 중". 정적 표시(실시간 변동 없음).
// 현재는 플레이스홀더 수치. 실제 접속자와 연결하려면 presence/analytics 필요.
export function LiveViewers({ base = 100 }: { base?: number }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-caption font-semibold text-brand-ink">
      <span className="h-1.5 w-1.5 rounded-full bg-brand" />
      지금 <span className="tabular-nums">{base.toLocaleString("en-US")}</span>명 보는 중
    </span>
  );
}
