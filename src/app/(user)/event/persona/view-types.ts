// 클라이언트/서버 공용 결과 타입. ("use server" 파일은 async 함수만 export 가능하므로 분리)
import type { Persona } from "@/lib/persona/schema";
import type { ShootPersona } from "@/lib/persona/shoot-schema";

export type RecoPhoto = {
  id: string;
  url: string;
  /** 아래 근거 필드는 임베딩 추천일 때만 있다 — 무드 큐레이션 폴백·구버전 결과에는
   *  없을 수 있으므로 UI 는 없을 때를 조용히 생략한다 ("왜 이 사진인가" 표기용). */
  /** 0~1 유사도 (1 - 코사인거리). 실제 측정값일 때만 존재 — 지어내지 않는다 */
  similarity?: number;
  /** 이 사진을 뽑은 내 피드 사진의 0-base 인덱스 (sampleThumbs 대응) */
  seedIdx?: number;
};

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
  /**
   * login_required — 비로그인. 분석은 돌지 않는다(비용이 드는 쪽은 전부 로그인 뒤)
   * daily_cap     — 오늘 전체 분석 상한에 걸림
   * off           — 운영이 분석을 꺼둠 (PERSONA_ANALYSIS_OFF)
   */
  reason:
    | "private"
    | "empty"
    /** 스크래퍼 한도·결제 — 우리 쪽 사정. 업로드 분석으로 넘긴다 */
    | "quota"
    | "error"
    | "rate_limited"
    | "login_required"
    | "daily_cap"
    | "off";
  message: string;
};

export type PersonaActionResult = PersonaSuccess | PersonaFailure;
