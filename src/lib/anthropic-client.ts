/**
 * 모델 클라이언트 공통 옵션.
 *
 * identity-linked API 키는 요청마다 워크스페이스를 지정해야 한다 — 헤더가 없으면
 * 400 으로 떨어지고, 봇은 매 턴 에러 문구만 뱉는다(원인이 화면에 안 드러나 찾기 어렵다).
 * 일반 워크스페이스 키를 쓰면 이 값은 비워두면 되고, 그때는 헤더를 붙이지 않는다.
 *
 * 여기 따로 둔 이유는 하나다: inquiry-bot-room 은 server-only 를 끌고 오므로,
 * 이 옵션 하나 쓰겠다고 그걸 import 하면 순수 로직 테스트가 같이 막힌다.
 */
export function anthropicClientOptions() {
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  return workspaceId
    ? { clientOptions: { defaultHeaders: { "anthropic-workspace-id": workspaceId } } }
    : {};
}
