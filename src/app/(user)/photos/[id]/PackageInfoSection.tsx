import { MapPinIcon } from "@/components/user/icons";

// 이 사진을 찍은 패키지 정보 — CTA 바로 아래, 접지 않고 펼친 상태로 노출한다.
// (사진↔패키지 FK 가 없어 page.tsx 의 '가격 근접' 매칭 결과를 그대로 받는다)
export function PackageInfoSection({
  name,
  description,
  price,
  duration,
  editedCount,
  location,
}: {
  name: string | null;
  description: string | null;
  price: number | null;
  duration: string | null;
  editedCount: number | null;
  location: string | null;
}) {
  return (
    <section className="mt-5 rounded-2xl border border-line bg-surface p-4">
      <p className="text-[11px] font-medium text-brand">이 사진을 찍은 패키지 정보</p>

      <div className="mt-1 flex items-end justify-between gap-3">
        <p className="min-w-0 truncate text-body font-semibold text-fg">{name ?? "촬영 패키지"}</p>
        <p className="shrink-0 text-title font-bold tracking-tight text-fg">
          {price != null ? `₩${price.toLocaleString("ko-KR")}` : "가격 · 장소 협의"}
        </p>
      </div>

      {(duration || editedCount != null) && (
        <p className="mt-2 text-body-sm font-medium text-fg/80">
          {[duration && `촬영 ${duration}`, editedCount != null && `보정본 ${editedCount}장`]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}

      {location && (
        <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-fg/[0.05] px-3 py-2.5 text-body-sm font-medium text-fg">
          <MapPinIcon className="h-4 w-4 shrink-0 text-muted" />
          <span className="min-w-0 truncate">촬영 위치 · {location}</span>
        </p>
      )}

      {/* 작가의 글은 사진 위 오버레이로 갔다 (CaptionOverlay) — 여기는 패키지 설명만 */}
      {description && (
        <p className="mt-3 whitespace-pre-wrap border-t border-line pt-3 text-body-sm leading-relaxed text-muted">
          {description}
        </p>
      )}

      {/* 협의 가능하다는 사실을 여기서 못 박아야 '가격이 안 맞아서' 이탈하지 않는다 */}
      <p className="mt-3 rounded-lg border border-brand/20 bg-brand/[0.07] px-3 py-2.5 text-body-sm leading-relaxed text-fg/80">
        패키지 제공 내용(시간, 장소 등)은 작가님과 상담하며 협의할 수 있어요.
      </p>
    </section>
  );
}
