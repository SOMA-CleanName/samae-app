import { redirect } from "next/navigation";

// 작가 채팅 코드는 보존하되 사이드 UI와 직접 접근을 함께 닫는다.
export default function DisabledStudioChatLayout() {
  redirect("/studio");
}
