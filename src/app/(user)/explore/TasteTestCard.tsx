import Link from "next/link";

// 취향 테스트 진입 카드 — /explore/quiz 로 이동. 개인화 훅.
export function TasteTestCard() {
  return (
    <Link
      href="/explore/quiz"
      className="group relative block overflow-hidden rounded-2xl border border-line bg-surface p-5 shadow-card transition-colors hover:bg-surface-2"
    >
      <p className="font-display text-body-sm italic text-brand">30초면 끝</p>
      <h3 className="mt-2 text-xl font-extrabold leading-tight tracking-tight [text-wrap:balance]">
        네 취향 스냅만
        <br />
        모아서 보여줄게
      </h3>
      <p className="mt-2.5 max-w-[92%] text-body-sm leading-relaxed text-muted">
        사진 몇 장만 골라주면, 너한테 딱 맞는 작가와 무드를 추려서 피드를 새로 짜줘요.
      </p>
      <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand px-5 py-3 text-body-sm font-semibold text-white transition-opacity group-hover:opacity-90">
        취향 테스트 시작
        <span aria-hidden>→</span>
      </span>
    </Link>
  );
}
