"use client";

// 채팅방이 **바깥으로 나가는 통로** 를 한 곳에 모은 것.
//
// ChatRoom 은 DB 쓰기(메시지·읽음), 실시간 구독, Mixpanel, 예약 서버 액션을 직접 부른다.
// 그래서 QA 로 한 번 돌 때마다 진짜 메시지가 쌓이고 이벤트가 박힌다 — 로컬이 운영
// Supabase 를 그대로 보고 Mixpanel 에는 dev 게이트가 없다(app/dev/_flow/store.ts 참고).
//
// 여기 모아 두면 샌드박스가 **이 객체 하나만** 갈아 끼우면 된다. 기본값은 진짜 함수들이라
// 실제 방의 동작은 한 글자도 달라지지 않는다.

import { sendMessage, markRead, sendPortfolioPhoto } from "../actions";
import { sendBotTurn } from "../bot-actions";
import { acceptBooking, rejectBooking, cancelBooking } from "@/app/actions/bookings";
import { mpTrack } from "@/lib/mixpanel";

export type ChatIO = {
  markRead: typeof markRead;
  sendMessage: typeof sendMessage;
  sendBotTurn: typeof sendBotTurn;
  sendPortfolioPhoto: typeof sendPortfolioPhoto;
  track: (event: string, props?: Record<string, unknown>) => void;
  acceptBooking: (formData: FormData) => void | Promise<void>;
  rejectBooking: (formData: FormData) => void | Promise<void>;
  cancelBooking: (formData: FormData) => void | Promise<void>;
  /** Realtime 을 붙일 것인가. 샌드박스는 구독할 방이 없다 */
  realtime: boolean;
};

export const REAL_CHAT_IO: ChatIO = {
  markRead,
  sendMessage,
  sendBotTurn,
  sendPortfolioPhoto,
  track: mpTrack,
  acceptBooking,
  rejectBooking,
  cancelBooking,
  realtime: true,
};
