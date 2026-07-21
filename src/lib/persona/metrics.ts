// (woori-mirae `lib/report/metrics.ts` 포팅 — import 경로만 조정)
import type { IgProfile } from "@/lib/persona/types";

/**
 * 스크랩 데이터에서 "성격·미감 신호"로 해석 가능한 파생 지표를 계산한다.
 * 여기서는 단정하지 않고 **정량 신호**만 뽑는다. 해석(성격화)은 Stage1 LLM이 한다.
 */
export interface ProfileMetrics {
  sample: number; // 분석에 사용한 게시물 표본 수
  // 게시 리듬 → 성실성/계획성/꾸준함
  cadence: {
    postsPerWeek: number | null; // 표본 기준 주당 게시 빈도
    avgGapDays: number | null; // 평균 게시 간격(일)
    regularity: "규칙적" | "불규칙" | "간헐적" | null; // 간격 편차 기반
    quietStreakDays: number | null; // 가장 긴 공백(일)
  };
  // 반응/상호작용 → 관계 활발도, 소통 성향
  engagement: {
    avgLikes: number | null;
    avgComments: number | null;
    engagementRate: number | null; // 평균 좋아요 / 팔로워 (%)
    commentToLikeRatio: number | null; // 댓글/좋아요 (대화 지향도)
  };
  // 소셜 그래프 → 관계 지향성(넓게 vs 선택적)
  social: {
    followers: number;
    following: number;
    followRatio: number | null; // 팔로잉/팔로워 (>1 적극적, <<1 선택적/영향력)
  };
  // 표현 방식 → 외향/표현성/개방성
  expression: {
    avgCaptionLen: number | null; // 평균 캡션 글자수
    emojiPerPost: number | null;
    hashtagsPerPost: number | null;
    exclaimRate: number | null; // 느낌표 포함 게시물 비율(%)
    questionRate: number | null; // 물음표 포함 게시물 비율(%)
    captionlessRate: number | null; // 캡션 없는 게시물 비율(%)
  };
  // 콘텐츠 구성 → 라이프스타일, 개방성, 자기표현 방식
  content: {
    videoRate: number | null; // 영상/릴스 비율(%)
    locationRate: number | null; // 위치 태그 비율(%) → 외부활동/이동성
    themeDiversity: number | null; // 고유 해시태그 / 전체 해시태그 (0~1, 높을수록 다양)
    topThemes: string[]; // 상위 해시태그
    topPlaces: string[]; // 상위 장소
  };
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);
const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
const round1 = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);

function countEmoji(s: string): number {
  const m = s.match(/\p{Extended_Pictographic}/gu);
  return m ? m.length : 0;
}

export function computeMetrics(p: IgProfile): ProfileMetrics {
  const posts = p.posts;
  const n = posts.length;

  // ── 게시 리듬 (timestamp 파싱) ──
  const times = posts
    .map((x) => Date.parse(x.timestamp))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  let postsPerWeek: number | null = null;
  let avgGapDays: number | null = null;
  let regularity: ProfileMetrics["cadence"]["regularity"] = null;
  let quietStreakDays: number | null = null;
  if (times.length >= 2) {
    const gapsDays = [];
    for (let i = 1; i < times.length; i++) gapsDays.push((times[i] - times[i - 1]) / 86400000);
    const spanDays = (times[times.length - 1] - times[0]) / 86400000;
    avgGapDays = round1(avg(gapsDays));
    postsPerWeek = spanDays > 0 ? round1((times.length / spanDays) * 7) : null;
    quietStreakDays = Math.round(Math.max(...gapsDays));
    // 변동계수(표준편차/평균)로 규칙성 판단
    const mean = avg(gapsDays)!;
    const variance = avg(gapsDays.map((g) => (g - mean) ** 2))!;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
    regularity = cv < 0.6 ? "규칙적" : cv < 1.2 ? "불규칙" : "간헐적";
  }

  // ── 반응 ──
  const likes = posts.map((x) => x.likes).filter((v) => v > 0);
  const comments = posts.map((x) => x.comments).filter((v) => v >= 0);
  const avgLikes = round1(avg(likes));
  const avgComments = round1(avg(comments));
  const engagementRate = avgLikes != null && p.followers > 0 ? round1((avgLikes / p.followers) * 100) : null;
  const commentToLikeRatio =
    avgLikes != null && avgLikes > 0 && avgComments != null ? round1((avgComments / avgLikes) * 100) : null;

  // ── 표현 ──
  const caps = posts.map((x) => x.caption ?? "");
  const avgCaptionLen = round1(avg(caps.map((c) => c.replace(/\s+/g, " ").trim().length)));
  const emojiPerPost = round1(avg(caps.map(countEmoji)));
  const hashtagsPerPost = round1(avg(posts.map((x) => x.hashtags.length)));
  const exclaimRate = pct(caps.filter((c) => c.includes("!")).length, n);
  const questionRate = pct(caps.filter((c) => c.includes("?")).length, n);
  const captionlessRate = pct(caps.filter((c) => c.trim().length === 0).length, n);

  // ── 콘텐츠 ──
  const videoRate = pct(posts.filter((x) => x.type === "video").length, n);
  const locationRate = pct(posts.filter((x) => x.location).length, n);
  const allTags = posts.flatMap((x) => x.hashtags.map((h) => h.toLowerCase()));
  const uniqTags = new Set(allTags);
  const themeDiversity = allTags.length ? round1(uniqTags.size / allTags.length) : null;

  const topThemes = topN(allTags, 8);
  const topPlaces = topN(
    posts.map((x) => x.location).filter((l): l is string => !!l),
    5
  );

  return {
    sample: n,
    cadence: { postsPerWeek, avgGapDays, regularity, quietStreakDays },
    engagement: { avgLikes, avgComments, engagementRate, commentToLikeRatio },
    social: {
      followers: p.followers,
      following: p.following,
      followRatio: p.followers > 0 ? round1(p.following / p.followers) : null,
    },
    expression: { avgCaptionLen, emojiPerPost, hashtagsPerPost, exclaimRate, questionRate, captionlessRate },
    content: { videoRate, locationRate, themeDiversity, topThemes, topPlaces },
  };
}

function topN(items: string[], k: number): string[] {
  const c = new Map<string, number>();
  for (const it of items) c.set(it, (c.get(it) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map(([v]) => v);
}

/** 지표를 LLM 프롬프트용 텍스트로 포맷 (해석 힌트 포함, 단 단정은 금지) */
export function formatMetrics(m: ProfileMetrics): string {
  const L: string[] = [];
  const or = (v: unknown, unit = "") => (v == null ? "데이터 부족" : `${v}${unit}`);

  L.push(`- 게시 리듬: 주당 ${or(m.cadence.postsPerWeek, "회")}, 평균 간격 ${or(m.cadence.avgGapDays, "일")}, 규칙성 ${or(m.cadence.regularity)}, 최장 공백 ${or(m.cadence.quietStreakDays, "일")}`);
  L.push(`- 반응: 평균 좋아요 ${or(m.engagement.avgLikes)}, 평균 댓글 ${or(m.engagement.avgComments)}, 참여율 ${or(m.engagement.engagementRate, "%")}, 댓글/좋아요 ${or(m.engagement.commentToLikeRatio, "%")}`);
  L.push(`- 소셜: 팔로워 ${m.social.followers.toLocaleString()}, 팔로잉 ${m.social.following.toLocaleString()}, 팔로잉/팔로워 비 ${or(m.social.followRatio)}`);
  L.push(`- 표현: 평균 캡션 ${or(m.expression.avgCaptionLen, "자")}, 이모지/글 ${or(m.expression.emojiPerPost, "개")}, 해시태그/글 ${or(m.expression.hashtagsPerPost, "개")}, 느낌표글 ${or(m.expression.exclaimRate, "%")}, 물음표글 ${or(m.expression.questionRate, "%")}, 무캡션 ${or(m.expression.captionlessRate, "%")}`);
  L.push(`- 콘텐츠: 영상비율 ${or(m.content.videoRate, "%")}, 위치태그 ${or(m.content.locationRate, "%")}, 주제다양성 ${or(m.content.themeDiversity)} (1에 가까울수록 다양)`);
  if (m.content.topThemes.length) L.push(`- 자주 쓰는 태그: ${m.content.topThemes.map((t) => `#${t}`).join(", ")}`);
  if (m.content.topPlaces.length) L.push(`- 자주 가는 장소: ${m.content.topPlaces.join(", ")}`);
  return L.join("\n");
}
