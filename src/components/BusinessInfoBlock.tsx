import { businessInfoLines } from "@/lib/business-info";

/**
 * 사업자 정보 블록.
 *
 * 두 자리에 붙는다 —
 *   · SiteFooter        : 끝이 있는 지면(/articles·/guide·/privacy·/spots·/trust)
 *   · SiteLinksRow      : 홈·카테고리. 무한 피드가 시작되기 직전, 사람이 닿는 마지막 자리
 *
 * 홈에도 있어야 하는 이유가 UX 가 아니라 **심사**다. PG 입점 심사는 "사이트 하단에서
 * 사업자정보가 확인되는지"를 보는데, 홈은 무한 스크롤이라 푸터에 영영 안 닿는다.
 * 유입이 가장 많은 지면에서 못 찾으면 심사에서 걸린다.
 *
 * 읽으라고 두는 게 아니라 **찾으면 있어야 하는** 정보라 가장 작게 둔다.
 */
export function BusinessInfoBlock({ className = "" }: { className?: string }) {
  const lines = businessInfoLines();
  if (lines.length === 0) return null;

  return (
    <address className={`not-italic ${className}`}>
      <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-faint">
        사업자 정보
      </h2>
      <dl className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] leading-relaxed text-faint">
        {lines.map((l) => (
          <div key={l.label} className="flex gap-1">
            <dt className="shrink-0">{l.label}</dt>
            <dd>{l.value}</dd>
          </div>
        ))}
      </dl>
    </address>
  );
}
