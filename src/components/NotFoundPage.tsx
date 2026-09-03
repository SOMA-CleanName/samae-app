import Link from "next/link";

/**
 * 404 지면.
 *
 * 이 서비스에는 404 화면이 없었다. `not-found.tsx` 가 한 장도 없어서 Next 기본값이
 * 나갔는데, (user) 레이아웃 안에서는 그게 **내비 알약만 뜨는 빈 화면**이었다.
 * 공유받은 사진 링크가 죽었을 때 사람이 보는 게 그 화면이다.
 *
 * ⚠️ noindex 를 반드시 실을 것 — 이 지면의 절반은 HTTP 404 가 아니라 200 이다.
 *
 *    loading.tsx 가 있는 라우트(/photos/[id] · /c/[slug] · /photographers/[id] ·
 *    /explore/[slug])는 Suspense 경계가 셸을 먼저 흘려보내면서 그 시점에 상태코드가
 *    200 으로 굳는다. 뒤늦게 notFound() 를 던져도 본문만 바뀐다.
 *    sitemap 에 사진 URL 만 1000개가 넘고 작가가 사진을 내리면 그 주소가 전부
 *    여기로 오므로, 상태코드로 못 막는 색인을 메타로 막는다.
 *
 *    (상태코드까지 바로잡으려면 존재 확인을 스트리밍 경계 앞 — 레이아웃이나 proxy.ts —
 *     으로 옮기거나 loading.tsx 를 빼야 한다. 스켈레톤과의 맞바꿈이라 별건으로 둔다.)
 *
 * 나갈 길을 준다. 막다른 화면에서 사람이 하는 건 뒤로가기가 아니라 이탈이다.
 */

const WAYS_OUT = [
  { href: "/explore", label: "매거진", desc: "촬영 이야기·장소·자주 묻는 것" },
  { href: "/spots", label: "촬영 장소", desc: "여기서 실제로 찍힌 사진과 함께" },
  { href: "/guide", label: "자주 묻는 것", desc: "가격·준비물·보정 범위" },
];

export function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-[70svh] max-w-xl flex-col justify-center px-5 py-16 font-kr">
      <p className="font-display text-body-sm italic tabular-nums text-brand">404</p>
      <span aria-hidden className="mt-3 block h-[2px] w-6 bg-brand" />

      <h1 className="mt-4 text-h1 font-bold tracking-tight">없는 지면이에요</h1>
      <p className="mt-2.5 text-body leading-relaxed text-muted">
        주소가 바뀌었거나, 작가가 사진을 내렸을 수 있어요.
        {/* 가장 흔한 원인을 먼저 말한다 — "오류가 발생했습니다" 보다 이게 답이 된다 */}
        <br />
        내려간 사진의 주소는 다시 살아나지 않아요.
      </p>

      <Link
        href="/"
        className="mt-7 inline-flex w-fit items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-body-sm font-bold text-white transition-opacity hover:opacity-90"
      >
        사진 보러 가기
        <span aria-hidden>→</span>
      </Link>

      <nav aria-label="다른 지면" className="mt-10 border-t border-line pt-2">
        {WAYS_OUT.map((w) => (
          <Link
            key={w.href}
            href={w.href}
            className="group flex items-baseline justify-between gap-4 border-b border-line py-3.5"
          >
            <span className="text-body font-bold tracking-tight transition-colors group-hover:text-brand">
              {w.label}
            </span>
            <span className="min-w-0 truncate text-caption text-faint">{w.desc}</span>
          </Link>
        ))}
      </nav>
    </main>
  );
}
