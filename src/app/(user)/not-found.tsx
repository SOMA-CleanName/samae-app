import type { Metadata } from "next";
import { NotFoundPage } from "@/components/NotFoundPage";

/*
  (user) 그룹 전용 경계.

  루트의 not-found.tsx 만 있으면 그게 최종 수신처가 되면서 이 그룹의 레이아웃
  (하단 플로팅 내비)이 통째로 벗겨진다. 사진 링크가 죽어서 온 사람에게 내비까지
  뺏으면 나갈 길이 본문 링크뿐이다.

  ⚠️ notFound() 는 여기(/photos/[id] · /c/[slug] · /photographers/[id] ·
     /explore/[slug])에서 가장 많이 던져지는데, 그 넷은 loading.tsx 때문에
     HTTP 200 으로 나간다. 색인 차단은 상태코드가 아니라 아래 robots 가 한다.
     (배경은 components/NotFoundPage.tsx 주석에)
*/
export const metadata: Metadata = {
  title: "없는 지면",
  robots: { index: false, follow: true },
};

export default function UserNotFound() {
  return <NotFoundPage />;
}
