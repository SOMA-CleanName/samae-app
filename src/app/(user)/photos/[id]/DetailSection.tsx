import type { ReactNode } from "react";

/**
 * 사진 상세의 섹션 한 덩어리.
 *
 * 우측 정보 칼럼이 블록마다 제각각이었다.
 *   · 간격  — mt-5 / mt-6 / mt-5 / mt-8 이 섞여 있어 어디서 이야기가 끊기는지 안 보였다
 *   · 제목  — 어떤 건 h2(text-base), 어떤 건 카드 안 작은 라벨. 같은 급인데 규격이 달랐다
 *   · 경계  — 패키지 카드만 테두리가 있고 나머지는 그냥 이어졌다
 *
 * 한 규격으로 묶는다. 위에 가는 구획선을 하나 그어 "여기서 다른 이야기가 시작된다"를
 * 눈에 보이게 하고, 간격과 제목 크기를 통일한다.
 * (CTA·패키지 카드는 이 규격 밖이다 — 카드 자체가 이미 경계다)
 */
export function DetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-7 border-t border-line pt-6">
      <h2 className="mb-3 text-body font-bold tracking-tight text-fg">{title}</h2>
      {children}
    </section>
  );
}
