// 구조화데이터(JSON-LD) 삽입 — 서버 렌더 <script>. 검색엔진이 페이지 의미를 이해하게 함.
// 배열이면 노드별 개별 <script> 로 분리(검증기 호환성 ↑).
export function JsonLd({ data }: { data: object | object[] }) {
  const items = Array.isArray(data) ? data : [data];
  return (
    <>
      {items.map((d, i) => (
        <script
          key={i}
          type="application/ld+json"
          // JSON.stringify 결과만 삽입 — 서버 구성값이라 안전(</script> 이스케이프).
          dangerouslySetInnerHTML={{ __html: JSON.stringify(d).replace(/</g, "\\u003c") }}
        />
      ))}
    </>
  );
}
