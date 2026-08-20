// 프로필 텍스트 조립 — LLM 프롬프트에 넣을 인스타 데이터 요약.
//
// (역사) 원래 이 파일은 Stage1 심리 프로파일 LLM 호출을 담고 있었다.
// 2026-08-20 에 Stage1+Stage2 를 combined.ts 의 병합 호출 하나로 합치면서
// (같은 사진을 두 번 업로드하던 낭비 제거 — 61s → 15.7s) 호출부는 사라지고
// 프롬프트 텍스트 조립만 남았다. 심리 해석 지침은 combined.ts 의 SYSTEM 에 있다.
import "server-only";
import type { IgProfile } from "@/lib/persona/types";

/** 프로필 + 지표 + 게시물 목록을 LLM 프롬프트용 텍스트로 조립.
 *  병합 호출(combined.ts)과 이 파일이 같은 텍스트를 써야 하므로 여기서 한 번만 만든다. */
export function buildProfileText(profile: IgProfile, metricsText: string): string {
  return [
    `# @${profile.username} 프로파일링`,
    profile.fullName ? `- 이름: ${profile.fullName}` : "",
    profile.bio ? `- 자기소개(bio): ${profile.bio}` : "",
    "",
    "## 정량 지표 (성격 신호로 해석할 것)",
    metricsText,
    "",
    `## 최근 게시물 ${profile.posts.length}개 (내용·어조·맥락 분석용)`,
    ...profile.posts.map((post, i) => {
      const cap = (post.caption || "(캡션 없음)").replace(/\s+/g, " ").slice(0, 180);
      const meta = [post.type, post.location, `♥${post.likes}`, `💬${post.comments}`].filter(Boolean).join(" · ");
      return `${i + 1}. [${meta}] ${cap}`;
    }),
  ]
    .filter(Boolean)
    .join("\n");
}
