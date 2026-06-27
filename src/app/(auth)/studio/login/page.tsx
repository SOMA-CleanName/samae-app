import { redirect } from "next/navigation";

// 작가용 로그인 별칭 — 작가 가드 밖에서 로그인 페이지로 보낸다.
export default function StudioLoginPage() {
  redirect("/login?next=/studio");
}
