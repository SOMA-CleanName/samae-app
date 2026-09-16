import "server-only";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { TermEdit, TermsBundle } from "@/lib/mood-terms";

// 다른 세 번들과 같은 이유로 저장소에 커밋된 파일에서 읽는다 — out/ 은 Git 제외라
// 계산한 PC 에만 있고, 그대로 읽으면 다른 데서 화면이 빈다 (§9-6).
const EMBED = path.join(process.cwd(), "scripts", "embed");
const BUNDLE = path.join(EMBED, "mood-terms-bundle.json");
const EDITS = path.join(EMBED, "out", "mood-vocabulary", "term-edits.jsonl");

let cache: TermsBundle | null = null;

export async function loadTermsBundle(): Promise<TermsBundle> {
  if (!cache) cache = JSON.parse(await readFile(BUNDLE, "utf8")) as TermsBundle;
  return cache;
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
