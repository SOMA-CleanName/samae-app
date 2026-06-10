import { toggleFavorite } from "@/app/(user)/actions";

// 사진 좋아요 토글 + 좋아요 수 (하트 옆 숫자). 관심 작가와 별개 기능.
// 서버 액션 폼이라 비로그인 시 toggleFavorite 내부에서 로그인으로 유도.
export function PhotoLikeButton({
  photoId,
  liked,
  count,
}: {
  photoId: string;
  liked: boolean;
  count: number;
}) {
  return (
    <form action={toggleFavorite} className="inline-flex items-center gap-2">
      <input type="hidden" name="targetType" value="photo" />
      <input type="hidden" name="targetId" value={photoId} />
      <input type="hidden" name="path" value={`/photos/${photoId}`} />
      {/* 비로그인 → 로그인 복귀 후 이 좋아요를 자동 적용 */}
      <input type="hidden" name="next" value={`/photos/${photoId}?like=1`} />
      <button
        type="submit"
        aria-pressed={liked}
        aria-label={liked ? "좋아요 취소" : "좋아요"}
        className={`grid h-10 w-10 place-items-center rounded-full border text-lg transition-colors ${
          liked
            ? "border-brand bg-brand/[0.08] text-brand"
            : "border-fg/15 text-fg/55 hover:bg-fg/[0.04]"
        }`}
      >
        {liked ? "♥" : "♡"}
      </button>
      <span className="text-sm text-fg/60">
        <strong className="text-fg">{count}</strong>
      </span>
    </form>
  );
}
