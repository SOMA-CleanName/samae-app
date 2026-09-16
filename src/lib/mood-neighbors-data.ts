import "server-only";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { Edit, NeighborBundle } from "@/lib/mood-neighbors";

// 그래프는 저장소에 커밋된 번들에서 읽는다. 원본 산출물은 out/ (Git 제외) 이라
// 그대로 읽으면 다른 PC 에서 화면이 빈다 — 검수 화면(§9-6)과 같은 방식이다.
const EMBED = path.join(process.cwd(), "scripts", "embed");
const BUNDLE = path.join(EMBED, "mood-neighbors-bundle.json");
// 사람이 손댄 간선은 자동 생성분과 섞지 않는다. 그래프를 다시 만들어도
// 이 파일이 남아 그대로 다시 덮인다 (§9-5 에서 사람 결정이 날아갔던 일).
const EDITS = path.join(EMBED, "out", "mood-vocabulary", "neighbor-edits.jsonl");

let cache: NeighborBundle | null = null;

/** 번들은 1MB 안팎이다. 요청마다 파싱하지 않도록 프로세스에 한 번만 올린다. */
export async function loadNeighborBundle(): Promise<NeighborBundle> {
  if (!cache) cache = JSON.parse(await readFile(BUNDLE, "utf8")) as NeighborBundle;
  return cache;
}

export async function loadEdits(): Promise<Edit[]> {
  try {
    return (await readFile(EDITS, "utf8"))
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as Edit);
  } catch {
    return [];   // 아직 아무것도 고치지 않은 상태
  }
}

/** 한 줄씩 덧붙인다. 되돌리기도 새 줄로 남겨 무엇을 언제 왜 바꿨는지가 사라지지 않는다. */
export async function appendEdit(edit: Edit) {
  await mkdir(path.dirname(EDITS), { recursive: true });
  const existing = await loadEdits();
  await writeFile(EDITS, [...existing, edit].map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
}
