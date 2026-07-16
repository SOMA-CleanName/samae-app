import Link from "next/link";
import { listDiverseQuizPhotos } from "@/lib/explore-db";
import { MpTrackOnce } from "@/components/MpTrackOnce";
import { TasteQuiz } from "./TasteQuiz";

export const dynamic = "force-dynamic";

// 취향 테스트 — 다양한 공개 사진 중 마음에 드는 것을 골라 취향(mood_tags)을 산출하고,
// 맞춤 스냅을 큐레이션해 보여준다. (개인화 진입점)
export default async function TasteQuizPage() {
  // 태그 다양성 최대화한 사진 (틴더식 스와이프 덱) — 게시물당 1장, 다 넘기면 결과
  const photos = await listDiverseQuizPhotos(10);

  return (
    <section className="fixed inset-0 z-30 flex flex-col overflow-hidden bg-bg px-2.5 pt-3 font-kr sm:px-4 sm:pt-4">
      <MpTrackOnce event="View Taste Quiz" />
      <div className="flex shrink-0 items-center gap-2.5">
        <Link
          href="/explore"
          aria-label="탐색으로 돌아가기"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-fg shadow-card transition-colors hover:bg-surface-2"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
            <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <h1 className="text-lg font-bold tracking-tight">원하는 무드 탐색하기</h1>
      </div>
      {photos.length >= 6 ? (
        <TasteQuiz photos={photos} />
      ) : (
        <p className="py-20 text-center text-body-sm text-muted">
          아직 취향 테스트에 쓸 사진이 부족해요. 곧 준비할게요.
        </p>
      )}
    </section>
  );
}
