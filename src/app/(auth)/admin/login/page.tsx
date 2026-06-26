import { redirect } from "next/navigation";

// 관리자용 로그인 별칭 — 관리자 가드 밖에서 로그인 페이지로 보낸다.
export default function AdminLoginPage() {
  redirect("/login?next=/admin");
}
