// 촬영 장소 데이터 — /spots 지면의 원본.
//
// 원본은 samae-marketing 의 factory/spots-data.mjs (인스타 카드뉴스용) 다.
// 카드뉴스에만 쓰고 웹으로 안 내보내고 있어서 여기로 옮겨 왔다.
//
// ⚠️ published 는 **팩트체크가 끝난 곳만** true 다.
//    검증 안 된 정보를 웹에 올리면 SEO 가 아니라 리스크다. 스레드·카드뉴스는
//    틀리면 지우면 되지만 웹은 색인되고, 장소 정보는 틀리면 사람을 헛걸음시킨다.
//    지금 켜진 건 3곳(을지로·경복궁·덕수궁) — 원본에서 verified:true 이던 것들이다.
//    나머지 7곳은 구역·개방시간·상권 현황 확인 뒤 정훈이 켠다.
//
// ⚠️ 날짜가 박힌 정보는 웹에 쓰지 않는다.
//    원본 팁에 "추석 당일(9/25) 무료" 같은 그 해에만 맞는 문장이 있었다.
//    카드뉴스는 그 주에만 보이지만 웹은 계속 남아 있으므로 걷어냈다.

export type Spot = {
  /** URL 조각. 한글 대신 영문 — 디코딩 사고가 날 자리를 안 만든다. */
  slug: string;
  name: string;
  /** 자치구 */
  area: string;
  address: string;
  /** 가장 가까운 역·출구. 원본에 없으면 null — 지어내지 않는다. */
  station: string | null;
  desc: string;
  tip: string;
  /**
   * photos.location_text 매칭 키워드.
   *
   * photos.region 은 전 건이 비어 있어(2026-08-31 확인) 쓸 수 없다.
   * 작가가 자유 텍스트로 적는 location_text 만 실제 데이터가 있다.
   */
  keywords: string[];
  published: boolean;
  /** 무엇으로 검증했는지. 끄고 켤 때 판단 근거가 된다. */
  source: string;
};

export const SPOTS: Spot[] = [
  {
    slug: "euljiro",
    name: "을지로 인쇄 골목",
    area: "중구",
    address: "서울 중구 을지로3가 · 세운상가 뒤편 골목",
    station: null,
    desc: "1968년 세운상가와 함께 선 골목. 반세기 멈춘 시간이 그대로 배경이 된다.",
    tip: "오후 4시 사광이 골목 안쪽까지 들어올 때가 골든타임.",
    keywords: ["을지로"],
    published: true,
    source: "카드뉴스 P4 팩트체크 (서울시·경향신문)",
  },
  {
    slug: "gyeongbokgung",
    name: "경복궁",
    area: "종로구",
    address: "서울 종로구 사직로 161",
    station: "3호선 경복궁역 5번 출구",
    desc: "단청과 기와의 짙은 색 위에서 한복의 밝은 색이 살아난다. 돌바닥이 반사판 역할까지 한다.",
    tip: "한복을 갖춰 입으면 입장료가 면제된다. 다만 인정 기준이 따로 있으니 방문 전 궁능유적본부 공지를 확인할 것.",
    keywords: ["경복궁"],
    published: true,
    source: "카드뉴스 P5 팩트체크 (궁능유적본부)",
  },
  {
    slug: "deoksugung-doldam",
    name: "덕수궁 돌담길",
    area: "중구",
    address: "서울 중구 세종대로 99 일대",
    station: "1·2호선 시청역 2번 출구",
    desc: "은행이 노랗게 덮이는 한두 주가 있다. 그 주가 1년 중 제일 예쁘다.",
    tip: "물드는 시기는 해마다 다르다. 단풍 절정 예보가 나온 뒤 그 주를 잡는 편이 안전하다.",
    keywords: ["덕수궁", "정동"],
    published: true,
    source: "카드뉴스 P8 팩트체크",
  },

  // ── 아래부터 팩트체크 대기 ──────────────────────────────
  {
    slug: "seoulforest",
    name: "서울숲",
    area: "성동구",
    address: "서울 성동구 뚝섬로 273",
    station: "수인분당선 서울숲역 3번 출구",
    desc: "도심에서 초록을 배경으로 쓸 수 있는 가장 넓은 선택지.",
    tip: "해질녘, 나무 사이로 들어오는 노을 역광이 핵심 구간.",
    keywords: ["서울숲"],
    published: false,
    source: "⚠️ 팩트체크 필요 (구역·개방시간)",
  },
  {
    slug: "seongsu",
    name: "성수 연무장길 일대",
    area: "성동구",
    address: "서울 성동구 연무장길 일대",
    station: "2호선 성수역 3번 출구",
    desc: "붉은 벽돌과 낮은 간판. 걷기만 해도 되는 코스라 데이트와 촬영이 동시에 된다.",
    tip: "주말 오후는 인파가 많다. 평일 늦은 오후가 촬영엔 낫다.",
    keywords: ["성수", "연무장"],
    published: false,
    source: "⚠️ 팩트체크 필요 (거리명·상권 현황)",
  },
  {
    slug: "huam",
    name: "후암동 계단길",
    area: "용산구",
    address: "서울 용산구 후암동 · 남산 소월길 아래",
    station: null,
    desc: "남산 아래 낮은 지붕들. 가로등이 켜지는 순간이 하루의 클라이맥스.",
    tip: "계단 아래에서 위로 올려다보는 각도. 해질녘 자판기 불빛을 활용한다.",
    keywords: ["후암"],
    published: false,
    source: "⚠️ 팩트체크 필요 (촬영 후보지 문서 기반)",
  },
  {
    slug: "ikseon",
    name: "익선동 한옥거리",
    area: "종로구",
    address: "서울 종로구 익선동",
    station: "1·3·5호선 종로3가역 4번 출구",
    desc: "좁은 골목 양옆으로 개조 한옥. 처마 그림자가 사진의 절반을 해준다.",
    tip: "이른 오전이 한산하고, 한옥 처마 그림자가 예쁜 시간이다.",
    keywords: ["익선"],
    published: false,
    source: "⚠️ 팩트체크 필요 (상권 현황)",
  },
  {
    slug: "mullae",
    name: "문래창작촌",
    area: "영등포구",
    address: "서울 영등포구 도림로128가길 일대",
    station: "2호선 문래역 7번 출구",
    desc: "철공소와 예술가 작업실이 섞인 골목. 녹슨 질감이 배경이 된다.",
    tip: "철공소 셔터가 내려간 주말 오후가 촬영 골든타임.",
    keywords: ["문래"],
    published: false,
    source: "⚠️ 팩트체크 필요 (촬영 가능 구역)",
  },
  {
    slug: "nodeul",
    name: "노들섬",
    area: "용산구",
    address: "서울 용산구 양녕로 445",
    station: "9호선 노들역 2번 출구",
    desc: "한강 위의 섬. 노을과 도시 스카이라인을 한 프레임에 담는다.",
    tip: "해질녘 잔디마당 서쪽 — 한강 반영이 배경이 되는 시간.",
    keywords: ["노들"],
    published: false,
    source: "⚠️ 팩트체크 필요 (개방시간)",
  },
  {
    slug: "haebang",
    name: "해방촌 신흥시장",
    area: "용산구",
    address: "서울 용산구 신흥로 일대",
    station: "6호선 녹사평역 2번 출구",
    desc: "노포 간판과 네온이 겹치는 오래된 시장. 밤이 더 예쁜 동네.",
    tip: "해 진 직후 블루아워 — 네온과 하늘색이 같이 사는 20분.",
    keywords: ["해방촌", "신흥시장"],
    published: false,
    source: "⚠️ 팩트체크 필요 (상권 현황)",
  },
];

export const PUBLISHED_SPOTS = SPOTS.filter((s) => s.published);

export function findSpot(slug: string): Spot | null {
  return PUBLISHED_SPOTS.find((s) => s.slug === slug) ?? null;
}
