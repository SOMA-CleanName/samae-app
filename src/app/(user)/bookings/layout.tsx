import { redirect } from "next/navigation";

// 기존 예약 페이지 코드는 남겨두고, 현재 사용자 경로에서는 접근만 막는다.
export default function DisabledUserBookingsLayout() {
  redirect("/");
}
