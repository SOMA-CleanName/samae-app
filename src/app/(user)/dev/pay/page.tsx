import type { Metadata } from "next";
import { PaySandbox } from "@/app/dev/_qa/PaySandbox";
import { daysAgo, shootInDays } from "@/app/dev/_qa/fixtures";

// 결제 게이트 샌드박스 — 실제 `/bookings/[id]` 의 입금 구간을 그대로 본다.
//
// **`(user)` 레이아웃 안에 산다.** 실제 예약 상세가 그 레이아웃(하단 내비 + main pb-28)에
// 속해 있기 때문이다. 루트에 두면 껍데기가 달라지고, 그러면 실제와 다른 화면을 QA 하게 된다.
// (온보딩 샌드박스에서 같은 이유로 라우트를 둘로 갈랐다 — docs/36 참고)
//
// 프로덕션에서는 proxy.ts 의 blockDevRoutes 가 404 로 막는다.

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function DevPayPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>;
}) {
  const { stage } = await searchParams;
  // 날짜는 여기서 만들어 넘긴다 — 클라이언트 렌더 중 new Date() 는 순수성 규칙에 걸리고,
  // useEffect 로 미루면 첫 프레임이 비어 실제 화면과 다르게 보인다.
  return (
    <PaySandbox
      stage={stage ?? "late"}
      lateShootAt={shootInDays(3)}
      normalShootAt={shootInDays(20)}
      now={daysAgo(0)}
    />
  );
}
