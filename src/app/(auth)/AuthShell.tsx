import Link from "next/link";
import type { ReactNode } from "react";
import { fetchAuthBackdropPhotos } from "@/lib/auth-backdrop";

/**
 * 로그인·가입 공용 지면.
 *
 * 전에는 흰 화면 한가운데 폼 하나였다. 깔끔하긴 했지만 어느 서비스의 로그인이어도
 * 말이 되는 화면이라, 사진작가를 만나러 온 사람에게 아무것도 말해 주지 않았다.
 *
 * 그래서 **사진을 먼저 보여준다.** 실제로 우리 서비스에 올라와 있는 사진들이
 * 세 줄로 아주 느리게 흐르고, 폼은 그 위에 종이 한 장처럼 얹힌다.
 *   · 모바일 — 위쪽이 사진, 아래쪽 폼 카드가 사진을 조금 덮으며 올라온다
 *   · 데스크탑 — 왼쪽 폼 / 오른쪽 사진 벽
 *
 * 흐름은 순수 CSS 애니메이션이다. JS 가 스크롤을 만지지 않으니 어디서도 싸울 일이 없고,
 * reduced-motion 이면 그냥 멈춘 사진 벽이 된다.
 */
export async function AuthShell({
  title,
  lead,
  children,
  footer,
}: {
  title: string;
  lead: string;
  children: ReactNode;
  /** 폼 아래 한 줄(로그인↔가입 전환 등) */
  footer?: ReactNode;
}) {
  const photos = await fetchAuthBackdropPhotos(18);
  const per = Math.max(1, Math.ceil(photos.length / 3));
  const columns = [photos.slice(0, per), photos.slice(per, per * 2), photos.slice(per * 2)].filter(
    (c) => c.length > 0
  );
  const hasArt = photos.length >= 3;

  return (
    <main className="relative flex min-h-[100svh] flex-1 flex-col font-kr lg:flex-row">
      {/* ── 사진 벽 ───────────────────────────────────────── */}
      {hasArt && (
        <div className="relative h-[42svh] shrink-0 overflow-hidden bg-surface-2 lg:order-2 lg:h-auto lg:min-h-[100svh] lg:flex-1">
          <div className="absolute inset-0 flex gap-2 p-2 lg:gap-3 lg:p-3">
            {columns.map((col, ci) => (
              <div key={ci} className="relative flex-1 overflow-hidden">
                {/* 같은 목록을 두 번 깔고 절반만큼 밀어 이음매 없이 돈다 */}
                <div
                  className={`auth-col auth-col-${ci} flex flex-col gap-2 lg:gap-3`}
                  aria-hidden
                >
                  {[...col, ...col].map((url, k) => (
                    // 원격 도메인이 next.config 에 없을 수 있어 next/image 대신 <img>
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={`${ci}-${k}`}
                      src={url}
                      alt=""
                      loading={k < 2 ? undefined : "lazy"}
                      className="w-full shrink-0 rounded-lg object-cover"
                      style={{ aspectRatio: "3 / 4" }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* 폼 쪽으로 사진이 사라지는 자리 — 모바일은 아래로, 데스크탑은 왼쪽으로 */}
          <div aria-hidden className="auth-fade pointer-events-none absolute inset-0" />
        </div>
      )}

      {/* ── 폼 ────────────────────────────────────────────── */}
      <div
        className={[
          "relative z-10 flex flex-1 flex-col justify-center bg-bg px-6 pb-12 pt-9",
          hasArt ? "-mt-6 rounded-t-[28px]" : "",
          "lg:order-1 lg:mt-0 lg:w-[46%] lg:max-w-[580px] lg:flex-none lg:rounded-none lg:px-14 lg:py-16",
        ].join(" ")}
      >
        <div className="mx-auto w-full max-w-sm">
          {/*
            나가는 문. 사진 위에 떠 있는 동그란 버튼 대신 폼 안에 한 줄로 뒀다.
            history.back() 은 안 쓴다 — 로그인은 검색·외부 링크로 바로 들어오는 일이 잦아
            사람마다 다른 데로 가 버린다. 홈은 어디서 들어왔든 같은 곳이다.
          */}
          <Link
            href="/"
            className="ed-back group -ml-1 mb-5 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-faint transition-colors hover:text-brand"
          >
            <span aria-hidden className="ed-back-arrow">
              ←
            </span>
            사진 보러 가기
          </Link>

          <Link
            href="/"
            className="block font-display text-2xl italic leading-none text-brand transition-opacity hover:opacity-80"
          >
            samae
          </Link>

          <h1 className="mt-6 text-[clamp(1.5rem,6vw,2rem)] font-extrabold leading-[1.2] tracking-[-0.035em]">
            {title}
          </h1>
          <p className="mt-2.5 text-body-sm leading-relaxed text-muted">{lead}</p>

          <div className="mt-8">{children}</div>

          {footer && <div className="mt-6">{footer}</div>}
        </div>
      </div>
    </main>
  );
}
