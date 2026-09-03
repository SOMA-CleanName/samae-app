// 이 사진을 찍은 패키지 정보 — CTA 바로 아래, 접지 않고 펼친 상태로 노출한다.
// (사진↔패키지 FK 가 없어 page.tsx 의 '가격 근접' 매칭 결과를 그대로 받는다)
//
// ── 껍데기 정리
// 한 카드 안에 여섯 덩어리가 같은 무게로 쌓여 있었다. 게다가 같은 급의 사실
// (촬영 시간 · 보정본 · 촬영 위치)이 서로 다른 모양이었다 —
// 시간·보정본은 맨 텍스트 한 줄, 위치는 회색 상자, 협의 안내는 브랜드색 상자.
// 상자가 카드 안에 또 겹치니 어디부터 어디까지가 한 이야기인지 안 보였다.
//
//   · 사실 셋을 한 덩어리 정의 목록으로 — 같은 급이면 같은 모양이어야 한다
//   · 협의 안내는 상자가 아니라 카드 바닥 띠로 — 카드 속 카드를 없앤다
// 담긴 내용과 문구는 그대로다.
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
  const specs = [
    duration && { label: "촬영 시간", value: duration },
    editedCount != null && { label: "보정본", value: `${editedCount}장` },
    location && { label: "촬영 위치", value: location },
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="p-4">
        <p className="text-[11px] font-medium text-brand">이 사진을 찍은 패키지 정보</p>

        <div className="mt-1 flex items-end justify-between gap-3">
          <p className="min-w-0 truncate text-body font-semibold text-fg">
            {name ?? "촬영 패키지"}
          </p>
          <p className="shrink-0 text-title font-bold tracking-tight text-fg">
            {price != null ? `₩${price.toLocaleString("ko-KR")}` : "가격 · 장소 협의"}
          </p>
        </div>

        {/* 사실 — 라벨 왼쪽, 값 오른쪽. 줄마다 가는 선을 그어 훑어 읽히게 한다. */}
        {specs.length > 0 && (
          <dl className="mt-3 border-t border-line">
            {specs.map((s) => (
              <div
                key={s.label}
                className="flex items-baseline justify-between gap-3 border-b border-line py-2"
              >
                <dt className="shrink-0 text-body-sm text-muted">{s.label}</dt>
                <dd className="min-w-0 truncate text-body-sm font-semibold text-fg">
                  {s.value}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {/* 작가의 글은 사진 위 오버레이로 갔다 (CaptionOverlay) — 여기는 패키지 설명만 */}
        {description && (
          <p className="mt-3 whitespace-pre-wrap text-body-sm leading-relaxed text-muted">
            {description}
          </p>
        )}
      </div>

      {/* 협의 가능하다는 사실을 여기서 못 박아야 '가격이 안 맞아서' 이탈하지 않는다.
          카드 안에 또 상자를 만들지 않고 바닥 띠로 둔다 — 이 카드의 각주다. */}
      <p className="border-t border-line bg-brand-soft px-4 py-3 text-body-sm leading-relaxed text-brand-ink">
        패키지 제공 내용(시간, 장소 등)은 작가님과 상담하며 협의할 수 있어요.
      </p>
    </section>
  );
}
