import { HomeSkeleton } from "@/components/user/skeletons";

// 홈 로딩 — 사진 격자만 깔면 렌더되는 순간 위의 다섯 층(로고·검색·배너·바로가기·무드)이
// 한꺼번에 끼어들어 화면이 통째로 밀린다. 층 순서를 그대로 맞춘다.
export default function Loading() {
  return <HomeSkeleton />;
}
