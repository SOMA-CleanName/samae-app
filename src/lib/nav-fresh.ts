/**
 * 하단 탭 누름 표식 — FloatingNav 가 남기고 ScrollMemory 가 읽어 소비한다.
 *
 * 값은 목적지 href. 탭 전환은 **새로 보러 가는 행위**라 최상단에서 시작해야 하는데,
 * 보던 자리 복원(ScrollMemory)과 규칙이 정반대라 "이번 이동은 탭 누름" 을 표시해 준다.
 *
 * 두 컴포넌트 어느 쪽에 두어도 상대가 import 하게 되므로 여기 따로 뺐다.
 */
export const NAV_FRESH_KEY = "samae:nav-fresh";
