// 작가를 부르는 방식 — 서버(목록·헤더)와 클라이언트(말풍선·시뮬레이터)가 같은 규칙을 봐야 해서
// server-only 가 붙지 않은 별도 파일에 둔다. (bot-identity.ts 와 같은 이유)

/**
 * 작가는 이름만이 아니라 역할까지 붙여 부른다 — "김재즈" 보다 "김재즈 작가" 가
 * 누구와 이야기하고 있는지 한 번에 읽힌다. 이미 '작가' 로 끝나는 이름은 그대로 둔다.
 */
export function photographerLabel(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (!n) return "작가";
  return n.endsWith("작가") ? n : `${n} 작가`;
}
