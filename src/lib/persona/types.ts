// 인스타 스크래퍼 출력(Apify 등)을 정규화한 내부 타입.
// (woori-mirae `lib/instagram/types.ts` 포팅 — 커플 전용 입력 타입은 제외하고
//  samae 이벤트용 단일 계정 입력으로 재구성)
// 실제 Apify 필드명은 액터마다 다를 수 있어 scrape.ts의 normalize에서 흡수한다.

export interface IgPost {
  caption: string;
  likes: number;
  comments: number;
  timestamp: string; // ISO
  type: "image" | "video" | "carousel" | "unknown";
  imageUrl?: string; // 대표 이미지 (비전 분석용)
  location?: string;
  hashtags: string[];
}

export interface IgProfile {
  username: string;
  fullName?: string;
  bio?: string;
  profilePicUrl?: string;
  followers: number;
  following: number;
  postsCount: number;
  isPrivate: boolean;
  isVerified: boolean;
  posts: IgPost[]; // 최근 게시물 표본
  scrapedAt: string; // ISO
  source: "apify" | "mock";
}

// 이벤트 입력 — 촬영 페르소나는 본인 공개계정 1개만 분석 (기획서 §6-1).
export interface PersonaRequest {
  username: string;
}
