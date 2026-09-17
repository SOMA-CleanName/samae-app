// 카카오 채널을 **앱으로** 연다.
//
// 전에는 채널 주소(pf.kakao.com)를 `target="_blank"` 로 열었다. 그러면 브라우저 새 탭이
// 하나 뜨고, 거기서 카카오톡으로 넘어갔다가 돌아오면 **원래 탭이 사라져 있다**
// (2026-09-17 신고: "아까 그 탭이 사라져있어"). 작가 신청을 막 끝낸 화면이 그렇게 날아간다.
//
// 앱 스킴으로 **같은 탭에서** 이동하면 다르다. 브라우저는 그 자리에 남고 카카오톡이
// 위로 올라올 뿐이라, 돌아오면 보던 화면이 그대로 있다.
//
// ⚠️ 데스크톱과 앱 미설치 기기에서는 스킴이 아무 일도 하지 않는다. 그래서 웹 주소로
//    떨어질 길을 남긴다 — 열렸는지 직접 알 방법이 없으므로, 짧게 기다렸다가 화면이
//    아직 살아 있으면(= 앱으로 안 넘어갔으면) 웹으로 보낸다.

/** `http://pf.kakao.com/_xiYxlXX/chat` → `_xiYxlXX` */
export function kakaoChannelId(url: string): string | null {
  const m = url.match(/pf\.kakao\.com\/([^/?#]+)/);
  return m?.[1] ?? null;
}

/**
 * 채널 채팅을 앱에서 여는 스킴. 채널 ID 를 못 읽으면 null —
 * 그때는 호출부가 웹 주소를 그대로 쓴다.
 */
export function kakaoChannelAppUrl(url: string): string | null {
  const id = kakaoChannelId(url);
  return id ? `kakaoplus://plusfriend/chat/${id}` : null;
}

/**
 * 채널로 이동. 앱이 있으면 앱이, 없으면 웹이 열린다.
 *
 * 새 탭을 쓰지 않는다 — 그게 이 함수가 존재하는 이유다.
 */
export function openKakaoChannel(url: string): void {
  const app = kakaoChannelAppUrl(url);
  if (!app) {
    window.location.href = url;
    return;
  }

  // 앱으로 넘어가면 이 탭은 숨겨지고 타이머가 늦게 돌거나 아예 안 돈다.
  // 1초 뒤에도 화면이 보이는 상태라면 앱이 없다고 보고 웹으로 보낸다.
  const fallback = window.setTimeout(() => {
    if (!document.hidden) window.location.href = url;
  }, 1000);

  const cancel = () => {
    if (document.hidden) window.clearTimeout(fallback);
  };
  document.addEventListener("visibilitychange", cancel, { once: true });

  window.location.href = app;
}
