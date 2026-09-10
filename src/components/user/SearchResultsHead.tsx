/**
 * 검색 결과 머리줄.
 *
 * 이 화면엔 글자가 하나도 없었다. 사진 마흔여덟 장이 깔릴 뿐, **뭘 검색했는지도
 * 몇 장 찾았는지도** 화면에 없었다. 검색어는 검색창 안에만 있어서, 스크롤해
 * 내려가면 그마저 사라졌다.
 *
 * 장수를 적는 데는 이유가 하나 더 있다. 검색 결과는 스크롤이 끝나면 같은 사진을
 * 다시 섞어서 되풀이한다(search-feed-loop). 그때 "찾은 건 43장"이라고 미리 말해 두면
 * 다시 나오는 사진이 오류로 안 읽힌다. 되풀이 자체를 없애는 건 이 지면 밖의 일이라
 * 여기서는 사실만 적는다.
 *
 * 머리줄은 sticky 로 붙이지 않는다 — 빨리 훑는 지면이라 위에 계속 남아 있으면
 * 사진 자리를 먹는다. 붙어 있어야 하는 건 검색창 하나면 된다.
 */
export function SearchResultsHead({
  query,
  count,
  capped = false,
}: {
  query: string;
  /** 이 검색이 가져온 사진 수. 화면에 깔리는 장수(비율 맞추느라 생기는 되풀이 포함)가 아니다. */
  count: number;
  /**
   * 결과가 상한(300장)에 걸렸는가.
   *
   * 걸렸으면 그건 "찾은 게 300장"이 아니라 "상위 300장만 가져왔다"는 뜻이다.
   * 그대로 "사진 300장"이라고 적으면 잘린 값을 실제 수인 것처럼 말하게 된다.
   */
  capped?: boolean;
}) {
  if (count === 0) return null;

  return (
    <div className="mx-auto mb-3 flex max-w-screen-2xl items-baseline gap-2 px-1">
      <h1 className="min-w-0 truncate text-body font-bold tracking-tight">
        <span aria-hidden className="text-faint">‘</span>
        {query}
        <span aria-hidden className="text-faint">’</span>
      </h1>
      <span className="shrink-0 text-[11px] font-semibold tabular-nums text-muted">
        사진 {count}장{capped && "+"}
      </span>
    </div>
  );
}
