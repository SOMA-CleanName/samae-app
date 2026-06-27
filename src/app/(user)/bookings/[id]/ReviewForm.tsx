"use client";

import { useState } from "react";
import { submitReview } from "@/app/actions/reviews";

// 후기 작성 폼 — 별점(1~5) + 텍스트. 기존 후기가 있으면 프리필(수정).
export function ReviewForm({
  bookingId,
  initialRating = 0,
  initialBody = "",
}: {
  bookingId: string;
  initialRating?: number;
  initialBody?: string;
}) {
  const [rating, setRating] = useState(initialRating);
  const [hover, setHover] = useState(0);

  return (
    <form action={submitReview} className="mt-4 rounded-xl border border-fg/10 p-5">
      <p className="text-sm font-semibold">{initialRating ? "후기 수정" : "촬영은 어떠셨나요?"}</p>
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="rating" value={rating} />

      {/* 별점 */}
      <div className="mt-2 flex gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            onMouseEnter={() => setHover(n)}
            aria-label={`${n}점`}
            className={`text-2xl leading-none transition-colors ${
              n <= (hover || rating) ? "text-warning" : "text-fg/20"
            }`}
          >
            ★
          </button>
        ))}
      </div>

      <textarea
        name="body"
        defaultValue={initialBody}
        rows={3}
        placeholder="작가님과의 촬영 경험을 남겨주세요. (선택)"
        className="mt-3 w-full resize-none rounded-lg border border-fg/15 bg-transparent px-3 py-2 text-sm"
      />

      <button
        type="submit"
        className="mt-3 w-full rounded-full bg-fg py-2.5 text-sm font-semibold text-bg hover:opacity-90"
      >
        {initialRating ? "후기 수정" : "후기 등록"}
      </button>
    </form>
  );
}
