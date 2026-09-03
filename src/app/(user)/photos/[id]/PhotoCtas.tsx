// 사진 상세의 CTA — [촬영 문의하기] 한 줄.
//
// ⚠️ dev 판은 **2트랙**이다 — [작가 상담하기](→ /chat/start) 와 [촬영 예약하기](→ /inquiry).
//    이 브랜치에는 /chat/start 가 없다. 채팅 상주 모델은 리드 판매를 폐지하는 작업과
//    한 덩어리라 PG 계약 전에는 못 가져온다(그걸 배포하면 수익 경로가 사라진다).
//    그래서 상담 트랙을 걷어내고 **예약 = 문의 폼** 한 줄만 남긴다.
//    본배포 때 dev 판을 그대로 되살릴 것 — 여기 말고 dev 쪽이 원본이다.
//
//    함께 뺀 것: TrustLink(→ /trust 지면이 이 브랜치에 없다) · LoginGateDialog
//    (상담 트랙 전용 게이트였다. 문의 폼은 끝까지 채운 뒤 마지막에 로그인을 받는다).
//
// 서버 컴포넌트로 충분해졌다 — 상담 게이트가 빠지면서 클라이언트 상태가 없다.

import { Button } from "@/components/ui";

export function PhotoCtas({
  photographerId,
  photoId,
}: {
  photographerId: string;
  photoId: string;
}) {
  return (
    <div className="mt-4 flex flex-col gap-2">
      <Button
        href={ctaHref("/inquiry", photographerId, photoId)}
        variant="brand"
        size="lg"
        fullWidth
        style={{ borderRadius: "16px" }}
        data-track="cta:inquiry"
        data-quote-lead=""
      >
        촬영 문의하기
      </Button>
    </div>
  );
}

function ctaHref(path: string, photographerId: string, photoId: string) {
  const params = new URLSearchParams({ photographerId, photoId });
  return `${path}?${params.toString()}`;
}
