"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HomeIcon, MagazineIcon, ClipboardIcon, CameraIcon } from "@/components/user/icons";
import { homeNavMode, searchSessionStorageKeys } from "@/lib/search-navigation";
import { type ProfileMe } from "./ProfileSheet";
import { useNavReveal } from "./NavReveal";

const EXPLORE_HINT_DURATION_MS = 3_000;

// 하단 플로팅 내비 — 기존 하단바/레일 대체.
// 가운데: 문의/스튜디오/홈/매거진 알약. 우측 하단: 장바구니(FloatingCart).
// 계정은 여기 없다 — 홈 상단 ProfileButton 이 맡는다(아래 주석 참고).
// 상세페이지 등에선 스크롤로 노출(forced) — 기본은 항상 보임.
export function FloatingNav({
  me,
  hasInquiries = false,
  unreadCount = 0,
  studioUnread = 0,
}: {
  me: ProfileMe | null;
  hasInquiries?: boolean;
  /** 내가 고객인 방의 안읽음 — '문의' 탭 배지 */
  unreadCount?: number;
  /** 내가 작가인 방의 안읽음 — '스튜디오' 탭 배지 */
  studioUnread?: number;
}) {
  const pathname = usePathname();
  const [previewExplore, setPreviewExplore] = useState(false);
  const [exploreHintVisible, setExploreHintVisible] = useState(false);
  const { forced } = useNavReveal();

  useEffect(() => {
    let resetTimer: number | null = null;
    let hintTimer: number | null = null;
    const previewTasteTestNavigation = () => {
      setPreviewExplore(true);
      if (resetTimer !== null) window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(() => setPreviewExplore(false), 900);
    };
    const showExploreHint = () => {
      if (hintTimer !== null) window.clearTimeout(hintTimer);
      setExploreHintVisible(true);
      hintTimer = window.setTimeout(
        () => setExploreHintVisible(false),
        EXPLORE_HINT_DURATION_MS
      );
    };
    window.addEventListener("samae:taste-test-navigation", previewTasteTestNavigation);
    window.addEventListener("samae:taste-test-dismissed", showExploreHint);
    return () => {
      window.removeEventListener("samae:taste-test-navigation", previewTasteTestNavigation);
      window.removeEventListener("samae:taste-test-dismissed", showExploreHint);
      if (resetTimer !== null) window.clearTimeout(resetTimer);
      if (hintTimer !== null) window.clearTimeout(hintTimer);
    };
  }, []);

  // 홈 = 메인 피드(카테고리 컨텍스트는 쿠키로 복원), 매거진 = /explore
  const homeActive = !previewExplore && (pathname === "/" || pathname.startsWith("/c/"));
  const exploreActive = previewExplore || pathname.startsWith("/explore");
  const inquiriesActive = pathname.startsWith("/my-inquiries");
  const studioActive = pathname.startsWith("/studio");

  // 탭 목록 — 조건부 노출이 둘(문의·스튜디오)이라 인덱스를 손으로 세면 반드시 어긋난다.
  // 배열이 곧 순서이자 인덱스다.
  const tabs: {
    key: string;
    href: string;
    label: string;
    icon: React.ReactNode;
    active: boolean;
    badge?: number;
    attention?: boolean;
    onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  }[] = [];

  if (hasInquiries)
    tabs.push({
      key: "inquiries",
      href: "/my-inquiries",
      label: "문의",
      icon: <ClipboardIcon className="h-5 w-5" />,
      active: inquiriesActive,
      badge: unreadCount,
    });

  // 작가에게는 스튜디오가 홈보다 자주 가는 곳이다 — 매번 프로필 시트를 거치게 하지 않는다
  if (me?.isPhotographer)
    tabs.push({
      key: "studio",
      href: "/studio",
      label: "스튜디오",
      icon: <CameraIcon className="h-5 w-5" />,
      active: studioActive,
      badge: studioUnread,
    });

  tabs.push({
    key: "home",
    href: "/",
    label: "홈",
    icon: <HomeIcon className="h-5 w-5" />,
    active: homeActive,
    onClick: (e) => {
      const currentQuery = new URL(window.location.href).searchParams.get("q");
      const mode = homeNavMode(pathname, currentQuery);

      // 검색 결과(/?q=)에서 홈을 누르면 q 를 뗀 기본 홈을 최상단부터 새로 연다.
      // homeActive 만 보면 검색 결과도 '홈'이라 그 자리에서 리로드돼 검색을 못 빠져나온다.
      if (mode === "leave-search") {
        e.preventDefault();
        try {
          searchSessionStorageKeys(pathname, currentQuery).forEach((key) =>
            sessionStorage.removeItem(key)
          );
          sessionStorage.removeItem("samae:scroll:/");
          sessionStorage.removeItem("samae:scroll-anchor:/");
        } catch {
          /* 스토리지 접근 불가 시 무시 */
        }
        window.location.assign("/");
        return;
      }

      // 이미 홈(또는 카테고리 컨텍스트)에서 다시 누르면 취향 피드 새로고침.
      // 피드 캐시를 비우고 리로드 → 서버가 새 시드로 취향순 피드를 다시 내려줌 + 최상단.
      if (mode === "refresh-home") {
        e.preventDefault();
        try {
          Object.keys(sessionStorage)
            .filter((k) => k.startsWith("samae:gallery-session:"))
            .forEach((k) => sessionStorage.removeItem(k));
          sessionStorage.removeItem(`samae:scroll:${pathname}`);
        } catch {
          /* 스토리지 접근 불가 시 무시 */
        }
        window.location.reload();
      }
    },
  });

  // '탐색' 이었다. 이름도 아이콘도 이 지면이 하는 일과 달랐다 —
  // /explore 는 아티클·화보·촬영 장소·자주 묻는 것이 실린 매거진이고(마스트헤드가 STORIES),
  // 사진을 '찾는' 일(검색·무드·취향 테스트·전체 피드)은 전부 홈이 한다.
  // 돋보기 아이콘은 특히 거짓말이었다 — 진짜 검색창은 홈 상단에 있다.
  tabs.push({
    key: "explore",
    href: "/explore",
    label: "매거진",
    icon: <MagazineIcon className="h-5 w-5" />,
    active: exploreActive,
    attention: exploreHintVisible,
  });

  const activeNavIndex = tabs.findIndex((t) => t.active);
  const indicatorIndex = Math.max(activeNavIndex, 0);

  // 탭 폭 — 4개가 되면 5.5rem 씩으로는 좁은 화면에서 넘친다(4×5.5=22rem).
  // '스튜디오' 는 네 글자라 가장 넓다 — 12px 기준 44px + 아이콘 20 + 간격 4 + 좌우 여백 12 = 80px.
  // 5.25rem(84px)이면 넘치지 않고, 탭 4개여도 전체 356px 라 일반적인 폰 폭에 들어간다.
  //
  // ⚠️ 이 좁힘은 폰 폭 때문이지 디자인이 아니다. 데스크톱에서까지 84px·11px 로 두면
  //    화면은 1500px 인데 알약만 356px 로 쪼그라들어 눌러야 할 것처럼 안 보인다.
  //    그래서 폭을 인라인 style 이 아니라 CSS 변수로 넘긴다 — 인라인이면 미디어쿼리가
  //    못 이긴다. 표시기 이동은 자기 폭의 %라서 값이 바뀌어도 따라온다(아래 translate3d).
  const compact = tabs.length >= 4;
  const tabWVar = compact
    ? "[--nav-tab-w:5.25rem] sm:[--nav-tab-w:6.25rem]"
    : "[--nav-tab-w:5.5rem] sm:[--nav-tab-w:6.5rem]";
  // 힌트 말풍선 꼬리 계산용 — 폰 기준값이면 된다(말풍선은 폰에서만 뜬다)
  const tabStep = (compact ? 5.25 : 5.5) + 0.25; // gap-1
  // 탐색 힌트 말풍선 꼬리 — 마지막 탭 중심을 가리킨다
  const hintArrowRight = ((tabs.length - 1) / 2) * tabStep + 1;

  // 문의·채팅 같은 풀스크린 몰입 플로우에선 내비를 아예 렌더하지 않음 — 전환·애니메이션 중
  // 그 위(z-50)로 잠깐 새어 보이던 문제 방지.
  if (
    pathname.startsWith("/inquiry") ||
    pathname.startsWith("/chat") ||
    pathname.startsWith("/explore/quiz")
  )
    return null;

  // 상세(/photos/[id])에선 기본 숨김 + 스크롤로만 노출(forced===true). 그 외엔 기본 보임.
  // usePathname 으로 판단해 라우트가 바뀌는 즉시(로딩 스켈레톤 단계부터) 사라진다.
  const onDetail = pathname.startsWith("/photos/");
  const visible = onDetail ? forced === true : forced ?? true;
  // 아래에서 위로 올라오는 슬라이드 (숨김 시 화면 아래로)
  const revealStyle = {
    // translate3d + will-change 로 별도 합성 레이어 승격 → iOS 사파리가 스크롤 중에도
    // 트랜지션을 컴포지터에서 재생(메인스레드 지연으로 '띡' 나타나던 문제 완화).
    transform: visible ? "translate3d(0,0,0)" : "translate3d(0,180%,0)",
    opacity: visible ? 1 : 0,
    // 숨김 시 히트영역 제거 — translate 로 시각만 사라지고 레이아웃 박스는 원위치에 남아
    // 그 자리(하단) 터치가 막히던 문제 방지.
    pointerEvents: visible ? "auto" : "none",
    willChange: "transform, opacity",
    transition: "transform 320ms cubic-bezier(.4,0,.2,1), opacity 260ms ease",
  } as React.CSSProperties;

  return (
    <>
      {exploreHintVisible ? (
        <div
          role="status"
          aria-live="polite"
          className="samae-explore-hint pointer-events-none fixed bottom-20 right-2.5 z-[41] w-max rounded-lg border border-line-strong bg-surface/95 px-3.5 py-2.5 text-right shadow-pop backdrop-blur-xl"
          style={{ maxWidth: "min(18rem, calc(100vw - 1.25rem))" }}
        >
          <p className="text-caption font-semibold leading-relaxed text-fg">
            매거진 탭에{" "}
            <strong className="font-bold text-brand">무료 취향 테스트가 준비</strong>
            되어 있어요.
            <br />
            <span className="font-normal text-muted">천천히 둘러보세요.</span>
          </p>
          <span
            aria-hidden
            className="absolute -bottom-1.5 h-3 w-3 rotate-45 border-b border-r border-line-strong bg-surface"
            style={{
              right: `clamp(1.5rem, calc(50vw - ${hintArrowRight}rem), calc(100% - 1.5rem))`,
            }}
          />
        </div>
      ) : null}

      {/* 가운데 홈/탐색 pill — 바깥 nav 의 레이아웃 박스도 숨김 시 터치 통과시킴 */}
      <nav
        // ⚠️ 이 속성을 지우지 말 것. ScrollTopButton 이 알약의 실제 폭을 재서
        //    그 오른쪽에 '맨 위로' 를 세운다. 없으면 querySelector 가 빈손으로 돌아와
        //    버튼이 영영 hidden 상태로 남는다(에러는 안 난다 — 그래서 더 안 보인다).
        data-floating-nav
        className="fixed bottom-5 left-1/2 z-40 -translate-x-1/2"
        style={{ pointerEvents: visible ? "auto" : "none" }}
      >
        <div style={revealStyle}>
          <div
            className={`relative flex items-center gap-1 rounded-full bg-bg/95 p-1 shadow-lg ring-1 ring-line backdrop-blur ${tabWVar}`}
          >
            <span
              aria-hidden
              className="absolute bottom-1 left-1 top-1 w-[var(--nav-tab-w)] rounded-full bg-brand shadow-sm transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
              style={{
                opacity: activeNavIndex >= 0 ? 1 : 0,
                transform: `translate3d(calc(${indicatorIndex * 100}% + ${indicatorIndex * 0.25}rem), 0, 0)`,
                willChange: "transform, opacity",
              }}
            />
            {tabs.map((t) => (
              <NavPill
                key={t.key}
                href={t.href}
                label={t.label}
                active={t.active}
                icon={t.icon}
                badge={t.badge}
                attention={t.attention}
                compact={compact}
                onClick={t.onClick}
              />
            ))}
          </div>
        </div>
      </nav>

      {/*
        좌하단에 계정 아바타가 있었다. 뺐다 — 알약은 화면 가운데 고정이고 폭이 탭 수를
        따라 늘어나서 로그인한 사람은 예외 없이 둘이 겹쳤다:

          탭 3개 = 280px → 390px 화면에서 왼쪽 55px 부터 → 아바타(20~60px)와 5px 겹침
          탭 4개 = 356px → 왼쪽 17px 부터 → 아바타를 통째로 덮음

        로그인하면 '문의' 탭이 항상 켜지고((user)/layout), 아바타도 로그인해야 뜬다.
        그래서 아바타가 그려지는 모든 경우가 최소 3탭이라 안 겹치는 조합이 없었다.
        폭 조절로 피할 수 있는 문제도 아니다 — 라벨 달린 4탭과 좌하단 아바타는
        폰 폭에서 산술적으로 공존이 안 된다(알약이 228px 이하여야 하는데 아이콘 전용 크기).

        계정 진입은 홈 상단 ProfileButton 이 맡는다. 화면에 떠 있는 물건을 하나 더
        만드는 대신, 이미 있던 자리에 시트를 붙였다.
        me 는 남는다 — '스튜디오' 탭 노출 판단에 쓴다.
      */}

      <style jsx global>{`
        @keyframes samae-explore-hint-rise {
          0% {
            opacity: 0;
            transform: translate3d(0, 12px, 0) scale(0.96);
          }
          16%, 78% {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1);
          }
          100% {
            opacity: 0;
            transform: translate3d(0, -5px, 0) scale(0.98);
          }
        }

        @keyframes samae-explore-tab-glow {
          0%, 42%, 100% {
            background-color: transparent;
            box-shadow: 0 0 0 0 rgba(255, 61, 46, 0);
          }
          20%, 68% {
            background-color: rgba(255, 61, 46, 0.12);
            box-shadow:
              0 0 0 3px rgba(255, 61, 46, 0.26),
              0 0 18px 5px rgba(255, 61, 46, 0.42);
          }
        }

        .samae-explore-hint {
          animation: samae-explore-hint-rise 3000ms cubic-bezier(0.22, 1, 0.36, 1) both;
          will-change: transform, opacity;
        }

        .samae-explore-tab-attention {
          animation: samae-explore-tab-glow 3000ms ease-in-out both;
          will-change: box-shadow, background-color;
        }

        @media (prefers-reduced-motion: reduce) {
          .samae-explore-hint,
          .samae-explore-tab-attention {
            animation: none;
          }
        }
      `}</style>
    </>
  );
}

function NavPill({
  href,
  label,
  active,
  attention = false,
  icon,
  badge = 0,
  compact = false,
  onClick,
}: {
  href: string;
  label: string;
  active: boolean;
  attention?: boolean;
  icon: React.ReactNode;
  /** 0 이면 안 그린다 */
  badge?: number;
  /** 탭이 넷일 때 — 폰에서 글자를 줄여 라벨이 넘치지 않게 */
  compact?: boolean;
  onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <Link
      href={href}
      scroll={false} // 탭 전환 시 최상단 강제 스크롤 방지 — 위치 복원은 ScrollMemory 가 담당
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      aria-label={badge > 0 ? `${label} — 안읽음 ${badge}개` : undefined}
      className={[
        // 탭 균등 너비 — 라벨 길이 달라도 같은 크기.
        // 폭은 부모가 --nav-tab-w 로 준다(표시기와 같은 값이어야 어긋나지 않는다).
        "relative z-10 flex w-[var(--nav-tab-w)] shrink-0 items-center justify-center gap-1 rounded-full py-2 font-semibold transition-colors duration-300 sm:gap-1.5 sm:py-2.5",
        compact ? "px-1.5 text-xs sm:text-sm" : "px-2 text-sm",
        active ? "text-white" : "text-fg/65 hover:text-brand",
        attention ? "samae-explore-tab-attention text-brand" : "",
      ].join(" ")}
    >
      {icon}
      {label}
      {/* 안읽음 배지 — pill 바깥 위쪽 모서리. 안에 넣으면 라벨이 밀려 탭 너비가 흔들린다.
          99를 넘으면 자릿수만 늘어날 뿐 판단은 달라지지 않으므로 99+ 로 자른다 */}
      {badge > 0 && (
        <span
          aria-hidden
          className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold leading-none text-white ring-2 ring-bg"
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}
