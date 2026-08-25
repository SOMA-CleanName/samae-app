// 개발 전용 프리뷰 — 결과/로딩 화면을 Apify·LLM 호출 없이 눈으로 확인한다.
// UI 를 반복해서 다듬을 때 매번 실분석을 돌리면 건당 비용이 나가므로 목업으로 본다.
// 프로덕션에서는 404. (NODE_ENV 는 빌드타임 상수라 번들에서도 제거된다)
import { notFound } from "next/navigation";
import PersonaResult from "../PersonaResult";
import { PersonaLoading } from "../PersonaLoading";
import type { PersonaSuccess } from "../view-types";

export const dynamic = "force-dynamic";

const MOCK: PersonaSuccess = {
  ok: true,
  username: "preview",
  profilePicUrl: null,
  shareId: "preview",
  // v3 카피 스펙(combined.ts)과 같은 길이·톤으로 쓴다 — 이 목업이 곧 데모 얼굴이다.
  persona: {
    oneLiner: "고요한 순간을 골라내는 사람",
    bigFive: {
      openness: { score: 78, note: "" },
      conscientiousness: { score: 64, note: "" },
      extraversion: { score: 41, note: "" },
      agreeableness: { score: 59, note: "" },
      emotionalStability: { score: 52, note: "" },
    },
    attachment: {
      style: "secure",
      label: "안정 애착",
      reason: "거리를 두면서도 온기를 잃지 않아요",
    },
    loveStyle: "",
    values: [],
    lifestyle: "",
    socialTendency: "",
    evidence: [
      "창가 자연광의 정적인 컷이 반복돼요",
      "인물보다 공간과 빛을 먼저 담아요",
      "뮤트 톤이 계절이 바뀌어도 유지돼요",
    ],
  } as PersonaSuccess["persona"],
  shoot: {
    shootPersonaLabel: "빛을 모으는 필름 산책자",
    keywords: ["새벽빛", "기록", "여백"],
    psychHook:
      "당신은 빛이 머무는 자리를 알아보는 사람이에요. 사진은 그 시선을 남기는 가장 조용한 방법이고요.",
    colorPalette: ["#c8453a", "#d9a441", "#33564f", "#efece5", "#2c2320"],
    purposeKey: "personal",
    moodIds: [],
    moodReasons: [
      {
        moodTitle: "필름-빈티지",
        signal: "필름 그레인과 빛바랜 뮤트 톤",
        why: "아날로그 질감이 이미 익숙해서 필름 무드가 자연스러워요",
        photoIndexes: [1, 3],
      },
      {
        moodTitle: "내추럴",
        signal: "연출 없는 자연광과 넉넉한 여백",
        why: "꾸미지 않은 순간을 담아와서 내추럴 무드가 어울려요",
        photoIndexes: [2, 5],
      },
    ],
    paletteReason: "창가 노을과 원목 가구에서 반복된 색이에요",
    shootTypes: ["프로필", "데일리 스냅"],
    locations: ["한적한 골목", "창가가 큰 카페", "이른 아침 공원"],
  } as PersonaSuccess["shoot"],
  // 근거 필드까지 실데이터 형태 그대로 — "왜 이 사진인가"가 데모에서 보여야 한다.
  // (유사도는 실제 파이프라인의 1-코사인거리 범위인 0.6~0.9 대로)
  photos: Array.from({ length: 9 }, (_, i) => ({
    id: `p${i}`,
    url: `https://picsum.photos/seed/samae${i}/600/800`,
    moodTags: i % 3 === 0 ? ["필름", "자연광"] : i % 3 === 1 ? ["내추럴"] : undefined,
    similarity: 0.88 - i * 0.03,
    seedIdx: i % 6,
  })),
  // 분석 표본 썸네일 — 무드 카드 근거·"내 이 사진과 닮아서" 칩에 쓰인다
  sampleThumbs: Array.from({ length: 6 }, (_, i) => `https://picsum.photos/seed/myfeed${i}/200/200`),
};

/** ?view=run&u=<아이디> — 실제 분석을 서버에서 한 번 돌려 결과를 그대로 보여준다.
 *  배선(임베딩→유사사진, 팔레트, 무드) 이 진짜로 도는지 확인하는 용도.
 *  &mock=1 이면 스크래핑만 목업(Apify 비용 0) — LLM 은 실제로 호출돼 카피 품질을 검증한다. */
/* eslint-disable react-hooks/purity, react-hooks/immutability --
   개발 전용 측정 라우트: 렌더 중 시간 측정과 env 스왑이 목적 그 자체다. 프로덕션에서는 404. */
async function RunOnce({ username, model, mock }: { username: string; model?: string; mock?: boolean }) {
  const { analyzePersona } = await import("@/lib/persona/analyze");
  // 모델·스크래핑 스위치. 개발 전용 라우트라 env 를 그 자리에서 바꿔도 안전하다.
  // (undefined 를 다시 대입하면 문자열 "undefined" 가 되므로 delete 로 복원)
  const prevModel = process.env.ANTHROPIC_MODEL;
  const prevMock = process.env.IG_MOCK;
  if (model) process.env.ANTHROPIC_MODEL = model;
  if (mock) process.env.IG_MOCK = "true";
  const t = Date.now();
  let r;
  try {
    r = await analyzePersona(username);
  } finally {
    if (prevModel === undefined) delete process.env.ANTHROPIC_MODEL;
    else process.env.ANTHROPIC_MODEL = prevModel;
    if (prevMock === undefined) delete process.env.IG_MOCK;
    else process.env.IG_MOCK = prevMock;
  }
  const secs = ((Date.now() - t) / 1000).toFixed(1);
  /* eslint-enable react-hooks/purity, react-hooks/immutability */
  return (
    <pre className="overflow-x-auto p-6 text-xs leading-relaxed">
      {JSON.stringify(
        {
          모델: model ?? prevModel,
          초: secs,
          // 카피 필드 전부 — v3 글자수·형식 제한이 실제로 지켜지는지 본다
          라벨: r.shoot.shootPersonaLabel,
          키워드: r.shoot.keywords,
          훅: r.shoot.psychHook,
          한줄: r.persona.oneLiner,
          애착: `${r.persona.attachment.label} — ${r.persona.attachment.reason}`,
          판단근거: r.persona.evidence,
          무드: r.shoot.moodReasons.map((m) => `${m.moodTitle} · ${m.signal} → ${m.why}`),
          로케이션: r.shoot.locations,
          팔레트: r.shoot.colorPalette,
          팔레트근거: r.shoot.paletteReason,
          닮은사진: r.similar.length,
          // 추천 근거 배선 확인 — 거리(→유사도)·무드태그·씨앗 인덱스가 실제로 흐르는지
          추천근거: r.similar
            .slice(0, 3)
            .map((p) => ({ 거리: p.distance, 태그: p.mood_tags?.slice(0, 2) ?? null, 씨앗: p.seedIdx ?? null })),
        },
        null,
        2
      )}
    </pre>
  );
}

export default async function PersonaPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; u?: string; model?: string; mock?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { view, u, model, mock } = await searchParams;
  if (view === "loading") return <PersonaLoading method="instagram" username="samae_official" />;
  if (view === "run")
    return <RunOnce username={u || "samae_test_user"} model={model} mock={mock === "1"} />;
  return <PersonaResult result={MOCK} shared />;
}
