import Link from "next/link";

// 취향 테스트 진입 카드 — /explore/quiz 로 이동. 개인화 훅.
export function TasteTestCard() {
  return (
    <Link
      href="/explore/quiz"
      className="group relative block overflow-hidden rounded-2xl border border-line bg-surface p-5 shadow-card transition-colors hover:bg-surface-2"
    >
      <p className="font-display text-body-sm italic text-brand">30초면 끝</p>
      <h3 className="mt-2 text-xl font-extrabold leading-[1.4] tracking-normal [text-wrap:balance]">
        당신의 <span className="text-brand">무드</span>를 담은 스냅만
        <br />
        골라 보여드릴게요.
      </h3>
      <p className="mt-2.5 max-w-[92%] text-body-sm leading-relaxed text-muted">
        사진 10장만 고르시면, 당신에게 작가와 무드를 맞춘 피드가 제공돼요.
      </p>
      <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand px-5 py-1.5 text-body-sm font-semibold text-white transition-opacity group-hover:opacity-90">
        취향 테스트 시작
        <span aria-hidden>→</span>
      </span>
    </Link>
  );
}
