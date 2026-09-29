import "server-only";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import type { TermEdit, TermsBundle } from "@/lib/mood-terms";

// 다른 세 번들과 같은 이유로 저장소에 커밋된 파일에서 읽는다 — out/ 은 Git 제외라
// 계산한 PC 에만 있고, 그대로 읽으면 다른 데서 화면이 빈다 (§9-6).
const EMBED = path.join(process.cwd(), "scripts", "embed");
const BUNDLE = path.join(EMBED, "mood-terms-bundle.json");
// 사람이 고친 기록도 커밋되는 자리에 둔다. out/ 에 두면 고친 PC 에만 남아서,
// 한쪽에서 1차로 고치고 다른 PC 에서 최종 검수하는 흐름이 끊긴다.
const EDITS = path.join(EMBED, "mood-edits", "term-edits.jsonl");

let cache: { at: number; bundle: TermsBundle } | null = null;

/** 번들은 스크립트가 통째로 다시 쓴다(bake·apply). 파일이 바뀌면 서버를 안 껐다 켜도 새로 읽는다. */
export async function loadTermsBundle(): Promise<TermsBundle> {
  const at = (await stat(BUNDLE)).mtimeMs;
  if (cache?.at !== at) cache = { at, bundle: JSON.parse(await readFile(BUNDLE, "utf8")) as TermsBundle };
  return cache.bundle;
}

export async function loadTermEdits(): Promise<TermEdit[]> {
  try {
    return (await readFile(EDITS, "utf8"))
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as TermEdit);
  } catch {
    return [];   // 아직 아무것도 고치지 않은 상태
  }
}

/** 한 줄씩 덧붙인다. 되돌리기도 새 줄로 남겨 무엇을 언제 왜 바꿨는지가 사라지지 않는다. */
export async function appendTermEdit(edit: TermEdit) {
  await mkdir(path.dirname(EDITS), { recursive: true });
  const existing = await loadTermEdits();
  await writeFile(EDITS, [...existing, edit].map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
}
