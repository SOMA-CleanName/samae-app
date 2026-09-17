/*
  SEO·공유(OG)·sitemap 용 정식 도메인.
  (NEXT_PUBLIC_SITE_URL 은 로컬에서 localhost 라서 canonical/sitemap 에 쓰면 안 됨)

  🔴 **2026-09-17: apex 로 박혀 있었는데 사이트는 www 로 서빙된다.**

      https://samae.ai/…      →  308  →  https://www.samae.ai/…
      https://www.samae.ai/…  →  200

  그래서 이런 일이 벌어지고 있었다 —
    · sitemap 의 **1078개 URL 이 전부 리다이렉트**였다. 서치콘솔이 "리다이렉션이 있는
      페이지" 로 분류하고 색인에서 뺀다. 색인해 달라고 제출한 목록이 통째로 그렇다
    · 홈의 canonical 이 `https://samae.ai` 인데 실제로 열린 주소는 `www.…` 였다.
      "이 페이지의 정본은 다른 주소" 라고 스스로 말하는 셈이라 신호가 갈린다
    · robots 의 `host` 도 apex 를 가리켜 리다이렉트 방향과 반대로 선언돼 있었다

  **www 를 정본으로 맞춘다.** 리다이렉트 방향을 뒤집는 대신 이쪽을 고치는 이유는,
  www 가 이미 밖에 나가 있는 주소이기 때문이다 — 카카오 개발자 콘솔의 간편가입 약관
  URL(`https://www.samae.ai/terms`, docs/36 §6)이 그걸로 등록돼 심사를 통과했다.
  apex 를 정본으로 바꾸면 그 등록들이 전부 리다이렉트를 타게 된다.

  ⚠️ 바꾸려면 **Vercel 도메인 설정의 리다이렉트 방향과 반드시 같이** 움직여야 한다.
     한쪽만 바꾸면 지금과 똑같은 어긋남이 반대로 생긴다.
*/
export const SITE_URL = "https://www.samae.ai";
export const SITE_NAME = "samae";
// 한글 검색(사매) 노출을 위해 제목·설명에 한/영 브랜드명을 병기.
export const SITE_TITLE = "samae 사매 — 취향에 맞는 사진작가 매칭";
export const SITE_DESCRIPTION =
  "마음에 든 사진의 작가에게 바로 촬영 문의. 사진작가 탐색·상담·예약·보정본 수령까지 samae(사매) 한 곳에서.";
