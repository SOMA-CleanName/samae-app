import Link from "next/link";
import { listPurposeCategories } from "@/lib/explore-db";
import { MpTrackOnce } from "@/components/MpTrackOnce";
import { TasteQuiz } from "./TasteQuiz";

export const dynamic = "force-dynamic";

// 취향 테스트 v2 — 1단계: 촬영 목적(카테고리) 선택 / 2단계: 그 목적 사진 스와이프 →
// 좋아요한 사진의 무드 카테고리로 취향 산출 → 홈 피드 개인화. (개인화 진입점)
export default async function TasteQuizPage() {
  const purposeCategories = await listPurposeCategories();

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
        <h1 className="text-lg font-bold tracking-tight">내 취향 찾기</h1>
      </div>
      <TasteQuiz purposeCategories={purposeCategories} />
    </section>
  );
}
