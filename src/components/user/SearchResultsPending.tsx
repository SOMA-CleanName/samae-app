import { MasonrySkeleton } from "./skeletons";

/** 스트리밍 중의 사진 자리. 대기 타이머는 먼저 hydrate되는 외부 Frame이 맡는다. */
export function SearchResultsPending() {
  return (
    <div role="status" aria-label="사진을 찾고 있어요" aria-busy="true">
      <span className="sr-only">사진을 찾고 있어요.</span>
      <div aria-hidden="true"><MasonrySkeleton count={12} /></div>
    </div>
  );
}
