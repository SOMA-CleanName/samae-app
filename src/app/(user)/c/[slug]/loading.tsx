import { HomeSkeleton } from "@/components/user/skeletons";

// 카테고리 지면은 홈과 같은 층 구조다(page.tsx 주석 참고) — 스켈레톤도 같아야 한다.
// 예전엔 사진 격자만 깔리는 MasonrySkeleton 이었다. 그러면 로딩 중엔 사진으로 꽉 찼다가
// 렌더되는 순간 로고·검색·배너·바로가기·무드 다섯 층이 한꺼번에 끼어들며 화면이 통째로 밀린다.
export default function Loading() {
  return <HomeSkeleton />;
}
