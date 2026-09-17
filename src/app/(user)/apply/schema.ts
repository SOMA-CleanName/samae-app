import { z } from "zod";

/** 스킴이 없으면 https:// 를 붙인다 */
function normalizeUrl(raw: string): string {
  if (!raw) return raw;
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

/** 열어볼 수 있는 주소인가 — 호스트에 점이 있고 공백이 없으면 통과 */
function looksLikeUrl(value: string): boolean {
  try {
    const u = new URL(value);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    // "https://아무거나" 처럼 점 없는 호스트는 링크가 아니다
    return u.hostname.includes(".") && !/\s/.test(u.hostname);
  } catch {
    return false;
  }
}

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
  portfolioUrl: z
    .string()
    .trim()
    .min(1, "포트폴리오 링크를 입력해주세요.")
    .max(300)
    // 붙여넣기는 대개 스킴이 없다("instagram.com/…"). 사람에게 https:// 를 치라고
    // 요구하는 대신 우리가 붙인다 — 형식 때문에 반려하는 건 우리 사정이지 지원자 잘못이 아니다.
    .transform(normalizeUrl)
    // 그래도 링크가 아닌 건 막는다. 전에는 아무 글자나 통과해서(검증이 길이뿐이었다)
    // 운영자가 열 수 없는 값이 그대로 접수됐다(2026-09-17 신고).
    .refine(looksLikeUrl, "링크 형식이 아니에요. 예: instagram.com/아이디"),
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
