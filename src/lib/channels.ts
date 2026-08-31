/**
 * 사매 공식 채널.
 *
 * ⚠️ 여기 적힌 것은 **사매의 채널**이지 작가에게 연락하는 길이 아니다.
 *    이 서비스는 작가↔고객이 외부 채널로 옮겨 가는 걸 적극적으로 막는다
 *    (lib/moderation.ts 가 채팅에서 카톡·인스타 언급을 차단하고,
 *     lib/platform-policy.ts 가 "외부 채널로 옮기자는 요청에는 응하지 않는다"고 못 박는다).
 *    그래서 화면에 걸 때는 **'사매' 채널임이 드러나는 자리에만** 둔다 —
 *    문의·채팅 근처에는 두지 않는다. 거기 있으면 "작가랑 카톡으로 얘기하면 되나"가 된다.
 *
 * 배치 (2026-09-01 결정)
 *   · 인스타그램 — 지면 푸터 + 아티클/가이드를 다 읽은 자리
 *   · 카카오톡   — 푸터에만
 *   뜨는 넛지는 안 만든다. 홈에는 이미 취향 테스트 넛지가 하단에 뜨고 있어 서로 방해한다.
 */

export type Channel = {
  key: "instagram" | "kakao";
  label: string;
  /** 화면에 보이는 짧은 이름 (@핸들 등). 없으면 label 만 쓴다. */
  handle?: string;
  url: string;
};

/**
 * ⚠️ URL 은 정훈 확인 필요 — 코드 어디에도 없어서 비워 뒀다.
 *    비어 있으면 링크가 아예 안 그려진다(아래 activeChannels). 틀린 주소를 거는 것보다 낫다.
 */
export const CHANNELS: Channel[] = [
  {
    key: "instagram",
    label: "인스타그램",
    handle: "",
    url: "",
  },
  {
    key: "kakao",
    label: "카카오톡 채널",
    url: "",
  },
];

/** 주소가 채워진 채널만. 비어 있으면 그 자리는 통째로 안 그린다. */
export function activeChannels(keys?: Channel["key"][]): Channel[] {
  return CHANNELS.filter(
    (c) => c.url.trim().length > 0 && (!keys || keys.includes(c.key))
  );
}
