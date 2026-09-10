import { activeChannels } from "@/lib/channels";

/**
 * 읽기를 마친 자리에 놓는 인스타그램 카드.
 *
 * 강제하지 않는다 — 뜨지도, 가리지도, 닫을 것도 없다.
 * 글을 끝까지 읽은 사람은 이미 "더 볼" 의향이 있는 상태라, 그 자리에 문만 열어 두면 된다.
 *
 * 주소가 비어 있으면 아무것도 안 그린다(lib/channels). 틀린 주소를 거는 것보다 낫다.
 */
export function ChannelCard() {
  const [ig] = activeChannels(["instagram"]);
  if (!ig) return null;

  return (
    <a
      href={ig.url}
      target="_blank"
      rel="noopener noreferrer"
      className="ch-card group mt-10 flex items-center gap-4 rounded-2xl border border-line bg-surface p-5 no-underline"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
        <InstagramIcon className="h-5 w-5" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-body font-bold tracking-tight text-fg">
          사매 {ig.label}
        </span>
        <span className="mt-0.5 block text-body-sm leading-relaxed text-muted">
          새로 올라온 사진과 촬영 이야기를 먼저 봅니다.
        </span>
      </span>

      <span className="flex shrink-0 items-baseline gap-1.5 text-body-sm font-semibold text-muted">
        {ig.handle && <span className="hidden sm:inline">{ig.handle}</span>}
        <span aria-hidden className="ch-arrow">
          →
        </span>
      </span>
    </a>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17" cy="7" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}
