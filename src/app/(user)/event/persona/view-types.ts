// 클라이언트/서버 공용 결과 타입. ("use server" 파일은 async 함수만 export 가능하므로 분리)
import type { Persona } from "@/lib/persona/schema";
import type { ShootPersona } from "@/lib/persona/shoot-schema";

export type RecoPhoto = { id: string; url: string };

export type PersonaSuccess = {
  ok: true;
  username: string;
  profilePicUrl: string | null;
  persona: Persona;
  shoot: ShootPersona;
  photos: RecoPhoto[];
  /** 공유 링크 id — 저장에 실패하면 null (공유 버튼만 감춘다) */
  shareId: string | null;
  /** 분석에 쓴 내 피드 사진 썸네일(data URL, 1-base 로 photoIndexes 와 대응). 공유 화면엔 없다. */
  sampleThumbs?: string[];
};

export type PersonaFailure = {
  ok: false;
  reason: "private" | "empty" | "error" | "rate_limited";
  message: string;
};

export type PersonaActionResult = PersonaSuccess | PersonaFailure;
