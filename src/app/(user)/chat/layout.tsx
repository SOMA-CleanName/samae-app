import { redirect } from "next/navigation";

// 채팅 기능은 보존하되 현재 서비스 흐름에서는 직접 접근을 막는다.
export default function DisabledUserChatLayout() {
  redirect("/");
}
