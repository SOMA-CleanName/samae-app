// 페르소나 무드 매핑 평가 하네스 — "정답이 있는" 테스트.
//
// 아이디어: 우리 DB 사진은 이미 무드가 태깅돼 있다. 특정 무드의 사진 N장을
// "이 사람의 인스타 피드"인 척 넣고 Stage2 가 그 무드를 되찾아내는지 본다.
// 정답을 아니까 적중률이 숫자로 나온다. (docs/22 §7 — 증상 없는 처방은 하지 않는다)
//
// 비교군:
//   BEFORE = Stage1 이 앞에서 자른 3장만 봄 + Stage2 는 사진을 아예 못 봄 (0077 이전 동작)
//   AFTER  = Stage1 이 등간격 9장 + Stage2 가 같은 표본 6장 (현재 동작)
//
// 실행:
//   npx tsx --conditions=react-server --env-file=.env --env-file=.env.local \
//     scripts/persona-eval.mts [무드수] [계정당사진수]
//
// 주의: Anthropic 호출이 무드당 3회 발생한다(Stage1×2 + Stage2×2 중 공유분 제외). 비용 감안할 것.

import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "../src/lib/supabase/admin";
import { resolveExplorePhotoIds } from "../src/lib/target-categories";
import { fetchImageBlocks } from "../src/lib/persona/images";
import { generateCombinedPersona } from "../src/lib/persona/combined";
import { buildProfileText } from "../src/lib/persona/psychology";
import { computeMetrics, formatMetrics } from "../src/lib/persona/metrics";
import type { IgProfile, IgPost } from "../src/lib/persona/types";

const MOOD_N = Number(process.argv[2] ?? 4); // 평가할 무드 수
const PHOTO_N = Number(process.argv[3] ?? 9); // 계정당 사진 수
// 비교할 모델들 (쉼표 구분). 같은 사진·같은 프롬프트로 돌려 모델 차이만 남긴다.
const MODELS = (process.argv[4] ?? process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const admin = createAdminClient();
const client = new Anthropic();

// 캡션은 일부러 무드 힌트가 없는 중립문으로 둔다.
// 텍스트에 힌트가 있으면 "사진을 봐서 맞힌 건지 글을 읽고 맞힌 건지" 구분이 안 된다.
const NEUTRAL_CAPTIONS = [
  "오늘", "기록", "。", "", "다녀왔어요", "좋았다", "ㅎㅎ", "-", "잘 지내요", "요즘",
  "남겨둠", "여기", "그날", "짧게", "다시 보니", "문득", "가끔", "고마웠어요", "또", "안녕",
];

function fakeProfile(username: string, urls: string[]): IgProfile {
  const posts: IgPost[] = urls.map((imageUrl, i) => ({
    caption: NEUTRAL_CAPTIONS[i % NEUTRAL_CAPTIONS.length],
    likes: 40 + ((i * 17) % 60),
    comments: 1 + (i % 5),
    // 최근 → 과거 순으로 3일 간격 (게시 리듬 지표가 극단값이 되지 않게)
    timestamp: new Date(Date.UTC(2026, 6, 30 - i * 3)).toISOString(),
    type: "image",
    imageUrl,
    hashtags: [],
  }));
  return {
    username,
    followers: 820,
    following: 410,
    postsCount: posts.length,
    isPrivate: false,
    isVerified: false,
    posts,
    scrapedAt: new Date(Date.UTC(2026, 7, 19)).toISOString(),
    source: "mock",
  };
}

async function main() {
  // 1) 공개 무드 카탈로그 — Stage2 가 고를 수 있는 선택지 전체
  const { data: moodRows } = await admin
    .from("explore_categories")
    .select("id, title")
    .eq("published", true)
    .eq("kind", "mood")
    .order("sort", { ascending: true });
  const moods = (moodRows ?? []).map((r) => ({ id: r.id as string, title: r.title as string }));
  if (moods.length < 2) {
    console.error(`❌ 공개 무드가 ${moods.length}개뿐이라 평가 의미가 없습니다.`);
    process.exit(1);
  }
  console.log(`🎨 무드 카탈로그 ${moods.length}개: ${moods.map((m) => m.title).join(", ")}\n`);

  // 2) 각 무드의 "배타적" 사진만 남긴다.
  // 사진 1장은 여러 무드에 동시에 속할 수 있다. 실측(2026-08-19)해 보니
  // 필름-빈티지와 내추럴의 앞 9장이 9/9 동일했다 — 이대로면 정답 라벨이 배타적이지 않아
  // 적중률이 부풀려진다. 다른 무드에 하나도 안 걸린 사진만 정답으로 인정한다.
  const byMood = new Map<string, string[]>();
  for (const m of moods) byMood.set(m.id, await resolveExplorePhotoIds(m.id));
  const shared = new Set<string>();
  const seen = new Set<string>();
  for (const ids of byMood.values())
    for (const id of ids) (seen.has(id) ? shared : seen).add(id);

  // 앞에서부터 자르면 같은 앨범(= 같은 촬영·같은 작가) 사진만 뽑혀 지나치게 일관된 표본이 된다.
  // 실제 개인 피드처럼 여러 앨범이 섞이도록 목록 전체에서 등간격으로 뽑는다.
  const pick = <T,>(arr: T[], k: number): T[] =>
    arr.length <= k ? arr : Array.from({ length: k }, (_, i) => arr[Math.round((i * (arr.length - 1)) / (k - 1))]);

  const cases: Array<{ mood: { id: string; title: string }; urls: string[] }> = [];
  for (const mood of moods) {
    if (cases.length >= MOOD_N) break;
    const exclusive = (byMood.get(mood.id) ?? []).filter((id) => !shared.has(id));
    if (exclusive.length < PHOTO_N) {
      console.log(`⏭️  ${mood.title} — 배타적 사진 ${exclusive.length}장뿐이라 제외`);
      continue;
    }
    const chosen = pick(exclusive, PHOTO_N);
    const { data: photos } = await admin
      .from("photos")
      .select("id, src_url, thumb_url")
      .in("id", chosen)
      .eq("visibility", "published");
    const urls = (photos ?? [])
      .map((p) => (p.src_url as string) ?? (p.thumb_url as string))
      .filter(Boolean);
    if (urls.length >= PHOTO_N) cases.push({ mood, urls: urls.slice(0, PHOTO_N) });
  }
  if (cases.length === 0) {
    console.error("❌ 사진이 충분한 무드가 없습니다. PHOTO_N 을 낮춰보세요.");
    process.exit(1);
  }

  const metricsOf = (p: IgProfile) => formatMetrics(computeMetrics(p));

  // 적중률만으로는 부족하다 — moodIds 는 5개 중 3개까지 고를 수 있어 찍어도 잘 맞는다.
  // 더 중요한 건 "무엇을 근거로 골랐나"다. moodReasons.signal 은 사용자에게 그대로 보이는 문장이라,
  // 캡션 길이·게시 간격 같은 텍스트 지표를 인용하면 바넘식 헛소리로 읽힌다.
  // (이 평가에서 캡션은 전부 무의미한 더미다 — 그걸 근거로 든다면 그건 노이즈에 반응한 것)
  const TEXT_METRIC = /캡션|이모지|해시태그|참여율|무캡션|게시 (리듬|간격)|\d+일 간격|팔로/;
  // 사진을 실제로 봤을 때만 쓸 수 있는 시각 어휘. 값싼 모델이 "사진을 보는 척"만 하는지 가려낸다.
  const VISUAL = /색온도|채도|계조|그레인|하이키|로우키|역광|자연광|톤|명암|대비|흑백|빛바[랜램]|무채색|따뜻|차가/;

  const stats = new Map<string, { hit: number; noise: number; visual: number; signals: number; ms: number }>();
  for (const m of MODELS) stats.set(m, { hit: 0, noise: 0, visual: 0, signals: 0, ms: 0 });

  for (const { mood, urls } of cases) {
    const profile = fakeProfile(`eval_${mood.title}`, urls);
    console.log("━".repeat(72));
    console.log(`🎯 정답 무드: ${mood.title}  (사진 ${urls.length}장)`);

    // 사진은 한 번만 받아 모든 모델이 같은 표본을 본다 (모델 차이만 남기기 위해)
    const imgs = await fetchImageBlocks(profile, PHOTO_N);

    for (const m of MODELS) {
      const t0 = performance.now();
      // 앱과 동일한 경로 — 병합 호출 (combined.ts)
      const { shoot } = await generateCombinedPersona(
        client,
        m,
        buildProfileText(profile, metricsOf(profile)),
        imgs,
        moods
      );
      const ms = performance.now() - t0;

      const s = stats.get(m)!;
      const hit = shoot.moodIds.includes(mood.id);
      if (hit) s.hit++;
      s.noise += shoot.moodReasons.filter((r) => TEXT_METRIC.test(r.signal)).length;
      s.visual += shoot.moodReasons.filter((r) => VISUAL.test(r.signal)).length;
      s.signals += shoot.moodReasons.length;
      s.ms += ms;

      const titles = shoot.moodIds.map((id) => moods.find((x) => x.id === id)?.title ?? "?").join(", ");
      console.log(`\n  ${m.padEnd(26)} ${hit ? "✅" : "❌"}  ${titles || "(없음)"}   ${(ms / 1000).toFixed(1)}s`);
      console.log(`  ${" ".repeat(26)}    라벨: ${shoot.shootPersonaLabel}`);
      for (const r of shoot.moodReasons)
        console.log(`  ${" ".repeat(26)}  ${TEXT_METRIC.test(r.signal) ? "⚠️" : "·"} ${r.moodTitle} ← ${r.signal.slice(0, 110)}`);
    }
    console.log();
  }

  console.log("━".repeat(72));
  console.log(`\n📊 모델 비교 (${cases.length}건)\n`);
  console.log(
    `   ${"모델".padEnd(26)} ${"적중".padEnd(6)} ${"시각근거".padEnd(9)} ${"노이즈".padEnd(8)} 평균시간`
  );
  for (const m of MODELS) {
    const s = stats.get(m)!;
    console.log(
      `   ${m.padEnd(26)} ${`${s.hit}/${cases.length}`.padEnd(6)} ` +
        `${`${s.visual}/${s.signals}`.padEnd(9)} ${`${s.noise}/${s.signals}`.padEnd(8)} ` +
        `${(s.ms / cases.length / 1000).toFixed(1)}s`
    );
  }
  console.log(`\n   적중=정답 무드를 골랐나 · 시각근거=사진을 봐야 쓸 수 있는 어휘(높을수록 좋음)`);
  console.log(`   노이즈=더미 캡션·게시 지표를 근거로 듦(낮을수록 좋음)`);
}

main().catch((e) => {
  console.error("평가 실패:", e);
  process.exit(1);
});
