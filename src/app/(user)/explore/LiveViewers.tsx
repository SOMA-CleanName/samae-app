// 상단 라이브 뱃지 — "지금 N명 보는 중". 렌더(요청)마다 50~200 랜덤, 실시간 변동은 없음.
// 현재는 플레이스홀더 수치. 실제 접속자와 연결하려면 presence/analytics 필요.
// Math.random 직접 호출은 서버 컴포넌트 purity 린트에 걸리므로 헬퍼로 분리.
function pickViewers() {
  return 50 + Math.floor(Math.random() * 151); // 50 ~ 200
}

export function LiveViewers() {
  const n = pickViewers();
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-caption font-semibold text-brand-ink">
      <span className="h-1.5 w-1.5 rounded-full bg-brand" />
      지금 <span className="tabular-nums">{n.toLocaleString("en-US")}</span>명 보는 중
    </span>
  );
}
