// 조건부 className 결합기 — 의존성 없는 경량 구현.
// 뒤에 오는 className이 항상 마지막에 붙으므로 호출부에서 덮어쓰기 가능.
export type ClassValue =
  | string
  | number
  | null
  | false
  | undefined
  | ClassValue[];

export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];
  for (const it of inputs) {
    if (!it) continue;
    if (Array.isArray(it)) {
      const inner = cn(...it);
      if (inner) out.push(inner);
    } else {
      out.push(String(it));
    }
  }
  return out.join(" ");
}
