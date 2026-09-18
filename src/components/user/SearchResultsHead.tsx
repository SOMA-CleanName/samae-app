/**
 * 검색 결과 머리줄.
 *
 * 이 화면엔 글자가 하나도 없었다. 사진 마흔여덟 장이 깔릴 뿐, **뭘 검색했는지도
 * 몇 장 찾았는지도** 화면에 없었다. 검색어는 검색창 안에만 있어서, 스크롤해
 * 내려가면 그마저 사라졌다.
 *
 * 장수는 **검색어에 맞는 사진만** 센다. "가을 커플스냅" 이면 커플 사진 수이고, 그 아래
 * 붙는 다른 목적의 가을 사진은 "비슷한 무드" 로 따로 적는다. 합쳐 세면 커플이 229장인데
 * "300장+" 로 적혀, 검색어에 맞는 사진이 그만큼 있는 것처럼 읽힌다.
 *
 * 머리줄은 sticky 로 붙이지 않는다 — 빨리 훑는 지면이라 위에 계속 남아 있으면
 * 사진 자리를 먹는다. 붙어 있어야 하는 건 검색창 하나면 된다.
 */
export function SearchResultsHead({
  query,
  count,
  relatedCount = 0,
  capped = false,
}: {
  query: string;
  /** 검색어에 맞는 사진 수. 아래에 붙는 비슷한 무드 사진은 뺀다. */
  count: number;
  /** 목적은 다르지만 무드가 비슷해 아래에 붙인 사진 수 */
  relatedCount?: number;
  /**
   * 결과가 상한(300장)에 걸렸는가.
   *
   * 걸렸으면 그건 "찾은 게 300장"이 아니라 "상위 300장만 가져왔다"는 뜻이다.
   * 그대로 "사진 300장"이라고 적으면 잘린 값을 실제 수인 것처럼 말하게 된다.
   */
  capped?: boolean;
}) {
  if (count === 0 && relatedCount === 0) return null;

  return (
    <div className="mx-auto mb-3 flex max-w-screen-2xl items-baseline gap-2 px-1">
      <h1 className="min-w-0 truncate text-body font-bold tracking-tight">
        <span aria-hidden className="text-faint">‘</span>
        {query}
        <span aria-hidden className="text-faint">’</span>
      </h1>
      <span className="shrink-0 text-[11px] font-semibold tabular-nums text-muted">
        사진 {count}장{capped && "+"}
        {relatedCount > 0 && <span className="font-normal"> · 아래로 비슷한 무드 {relatedCount}장</span>}
      </span>
    </div>
  );
}
