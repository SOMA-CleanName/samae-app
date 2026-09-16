import { z } from "zod";

// 작가 신청 입력 검증 — 서버 액션과 /dev/flow(샌드박스)가 **같은 것**을 쓴다.
//
// actions.ts 안에 있던 걸 꺼냈다. 거기는 "use server" 라 비동기 함수 말고는 내보낼 수
// 없어서 클라이언트가 가져다 쓸 수 없었다. 샌드박스가 검증을 따로 적으면 "여기선
// 통과하는데 실제로는 막히는" 차이가 생기고, 그 차이는 QA 로 안 잡힌다.

export type ApplyLeadState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

export const ApplySchema = z.object({
  displayName: z.string().trim().min(1, "작가명을 입력해주세요.").max(40),
  portfolioUrl: z.string().trim().min(1, "포트폴리오 링크를 입력해주세요.").max(300),
  phone: z.string().trim().min(1, "전화번호를 입력해주세요.").max(30),
  bio: z.string().trim().max(500).optional(),
});

/** FormData → 검증 결과. 실패하면 필드별 메시지를 그대로 돌려준다. */
export function parseApplyForm(formData: FormData) {
  return ApplySchema.safeParse({
    displayName: formData.get("displayName"),
    portfolioUrl: formData.get("portfolioUrl"),
    phone: formData.get("phone"),
    bio: formData.get("bio") ?? "",
  });
}

/** zod 이슈 → 필드별 에러 맵 */
export function applyFieldErrors(
  issues: { path: PropertyKey[]; message: string }[]
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) out[String(issue.path[0])] = issue.message;
  return out;
}
