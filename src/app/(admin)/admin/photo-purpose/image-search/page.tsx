import { ImageProbe } from "./ImageProbe";

export const dynamic = "force-dynamic";

/**
 * 사진으로 검색 (어드민) — 사용자 화면과 같은 경로로 찾되, 순서를 흩뜨리지 않고 점수 그대로 본다.
 * 사진마다 목적·무드 태그를 같이 보여줘 분류 작업과 이어 보게 한다(docs/42).
 */
export default function AdminImageSearchPage() {
  return (
    <section aria-labelledby="image-search-heading">
      <h2 id="image-search-heading" className="text-h2 font-semibold">사진으로 검색</h2>
      <p className="mt-1 text-body-sm text-muted">
        사진을 올리면 SigLIP 이 고른 사진을 <b className="text-fg">유사도 순서 그대로</b> 보여줍니다. 점수는 코사인 유사도입니다.
        사진마다 지금 붙어 있는 <b className="text-fg">목적·무드 태그</b>를 같이 적었습니다.
        올린 사진은 저장하지 않습니다. 비공개·피드에서 내린 사진은 검색과 같게 결과에서 빠집니다.
      </p>
      <ImageProbe />
    </section>
  );
}
