type InterestSimilarEntryProps = {
  collapsed: boolean;
  loading: boolean;
  onClick: () => void;
};

export function InterestSimilarEntry({
  collapsed,
  loading,
  onClick,
}: InterestSimilarEntryProps) {
  return (
    <button
      type="button"
      aria-label="관심사진과 비슷한 사진 보기"
      aria-busy={loading}
      onClick={onClick}
      className={`pointer-events-auto fixed right-0 top-[38%] z-[63] flex h-14 min-w-14 cursor-pointer items-center overflow-hidden rounded-l-2xl border border-r-0 border-white/20 bg-black/90 text-white shadow-pop backdrop-blur-md transition-[width] duration-300 motion-reduce:transition-none ${
        collapsed ? "w-14" : "w-48"
      }`}
    >
      <span
        className="ml-2 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand"
        aria-hidden="true"
      >
        {loading ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white motion-reduce:animate-none" />
        ) : (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 3l1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3z" strokeLinejoin="round" />
            <path d="M18.5 16l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span
        className={`ml-2 whitespace-nowrap text-left text-xs font-bold leading-snug transition-[opacity,transform] duration-150 motion-reduce:transition-none ${
          collapsed ? "translate-x-2 opacity-0" : "translate-x-0 opacity-100"
        }`}
      >
        관심사진과
        <br />
        비슷한 사진 보기
      </span>
      <span
        className={`ml-auto mr-3 text-lg transition-opacity duration-150 motion-reduce:transition-none ${
          collapsed ? "opacity-0" : "opacity-100"
        }`}
        aria-hidden="true"
      >
        ›
      </span>
    </button>
  );
}
