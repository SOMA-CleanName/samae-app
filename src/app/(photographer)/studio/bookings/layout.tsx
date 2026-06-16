import { redirect } from "next/navigation";

// 작가 예약 목록 코드는 보존하되 현재는 예약 알림 흐름만 사용한다.
export default function DisabledStudioBookingsLayout() {
  redirect("/studio");
}
