// (user) 영역 페이지 전환 모션 — template 은 네비게이션마다 재마운트되어
// page-enter 애니메이션(페이드 + 살짝 위로)이 매번 재생된다.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
