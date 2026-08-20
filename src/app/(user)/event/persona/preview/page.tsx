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
  persona: {
    oneLiner: "혼자만의 리추얼로 하루를 정돈하는, 자기 세계가 단단한 사람",
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
      reason: "거리를 두되 온기를 잃지 않는 표현이 반복돼요",
    },
    loveStyle: "",
    values: [],
    lifestyle: "",
    socialTendency: "",
    evidence: [
      "창가 자연광에서 찍은 정적인 컷이 기간 내내 반복돼요",
      "인물보다 공간과 빛을 먼저 담는 프레이밍이 일관돼요",
      "채도를 낮춘 뮤트 톤이 계절이 바뀌어도 유지돼요",
    ],
  } as PersonaSuccess["persona"],
  shoot: {
    shootPersonaLabel: "창가의 빛을 모으는 조용한 필름 산책자",
    psychHook:
      "화려한 순간보다 스쳐가는 빛을 오래 들여다보는 편이죠. 그래서 당신에게는 연출된 포즈보다, 그 자리의 공기가 남는 사진이 어울려요.",
    colorPalette: ["#c8453a", "#d9a441", "#33564f", "#efece5", "#2c2320"],
    purposeKey: "personal",
    moodIds: [],
    moodReasons: [
      {
        moodTitle: "필름-빈티지",
        signal: "6장 전부 필름 그레인이 뚜렷하고 탈색된 뮤트 톤이 반복돼요",
        why: "디지털의 쨍함보다 아날로그 질감이 당신의 결과 맞아요",
      },
      {
        moodTitle: "내추럴",
        signal: "연출 소품 없이 잔디밭·창가 자연광에 의존한 컷이 이어져요",
        why: "억지 포즈 없이 있는 그대로의 순간이 가장 당신답게 남아요",
      },
    ],
    shootTypes: ["프로필", "데일리 스냅"],
    locations: ["한적한 골목", "창가가 큰 카페", "이른 아침 공원"],
  } as PersonaSuccess["shoot"],
  photos: Array.from({ length: 9 }, (_, i) => ({
    id: `p${i}`,
    url: `https://picsum.photos/seed/samae${i}/600/800`,
  })),
};

/** ?view=run&u=<아이디> — 실제 분석을 서버에서 한 번 돌려 결과를 그대로 보여준다.
 *  배선(임베딩→유사사진, 팔레트, 무드) 이 진짜로 도는지 확인하는 용도.
 *  IG_MOCK=true 면 스크래핑 없이 목업 프로필로 돈다(Apify 비용 0). */
/* eslint-disable react-hooks/purity, react-hooks/immutability --
   개발 전용 측정 라우트: 렌더 중 시간 측정과 env 스왑이 목적 그 자체다. 프로덕션에서는 404. */
async function RunOnce({ username, model }: { username: string; model?: string }) {
  const { analyzePersona } = await import("@/lib/persona/analyze");
  // 모델별 지연·품질 비교용. 개발 전용 라우트라 env 를 그 자리에서 바꿔도 안전하다.
  const prev = process.env.ANTHROPIC_MODEL;
  if (model) process.env.ANTHROPIC_MODEL = model;
  const t = Date.now();
  const r = await analyzePersona(username);
  process.env.ANTHROPIC_MODEL = prev;
  const secs = ((Date.now() - t) / 1000).toFixed(1);
  /* eslint-enable react-hooks/purity, react-hooks/immutability */
  return (
    <pre className="overflow-x-auto p-6 text-xs leading-relaxed">
      {JSON.stringify(
        {
          모델: model ?? prev,
          초: secs,
          라벨: r.shoot.shootPersonaLabel,
          팔레트: r.shoot.colorPalette,
          무드수: r.shoot.moodIds.length,
          근거: r.shoot.moodReasons.map((m) => `${m.moodTitle} ← ${m.signal}`),
          닮은사진: r.similar.length,
          거리: r.similar.slice(0, 5).map((p) => p.distance),
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
  searchParams: Promise<{ view?: string; u?: string; model?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { view, u, model } = await searchParams;
  if (view === "loading") return <PersonaLoading method="instagram" username="samae_official" />;
  if (view === "run") return <RunOnce username={u || "samae_test_user"} model={model} />;
  return <PersonaResult result={MOCK} shared />;
}
