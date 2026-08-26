"use server";

import { cookies } from "next/headers";

export type MemoResult = { ok: boolean; status: number; body: string } | null;

// dev 전용 — 카카오 "나에게 보내기"(메모) 실험 발송.
// 실제 알림 문안과 최대한 비슷하게 보내서 수신 느낌(푸시 여부·표시 형태)을 확인한다.
export async function sendTestMemo(_prev: MemoResult, formData: FormData): Promise<MemoResult> {
  if (process.env.NODE_ENV === "production") return { ok: false, status: 403, body: "dev 전용" };

  const token = (await cookies()).get("kakao_pt_dev")?.value;
  if (!token)
    return { ok: false, status: 401, body: "카카오 토큰 없음 — 먼저 '메시지 권한 포함 재로그인'을 눌러주세요." };

  const chatUrl = String(formData.get("chatUrl") || "https://samae.co.kr");
  const template = {
    object_type: "text",
    text:
      "📷 모글 작가님이 답장을 남겼어요.\n\n“안녕하세요! 문의 주신 필름 스냅, 다음 주 토요일 오후로 가능해요. 채팅방에서 자세히 안내드릴게요.”",
    link: { web_url: chatUrl, mobile_web_url: chatUrl },
    button_title: "답장 확인하기",
  };

  const res = await fetch("https://kapi.kakao.com/v2/api/talk/memo/default/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
    body: new URLSearchParams({ template_object: JSON.stringify(template) }),
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}
