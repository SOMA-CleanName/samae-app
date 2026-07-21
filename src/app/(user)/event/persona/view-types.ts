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
};

export type PersonaFailure = {
  ok: false;
  reason: "private" | "empty" | "error";
  message: string;
};

export type PersonaActionResult = PersonaSuccess | PersonaFailure;
