"use client";

import { useState } from "react";
import Link from "next/link";
import { ProfileSheet, type ProfileMe } from "./ProfileSheet";

/**
 * 프로필 버튼 — 홈 상단 오른쪽.
 *
 * 로그인 여부와 상관없이 **항상** 자리를 지킨다.
 *   · 로그인함  → 아바타(없으면 사람 아이콘) · 내 메뉴 시트를 연다
 *   · 안 함     → 빈 프로필 · 로그인/가입으로
 *
 * 로그인했을 때만 보이면 "여기 뭔가 있었나?" 싶게 자리가 흔들린다.
 * 비로그인에게는 이 자리가 가입 진입점이기도 하다.
 *
 * 원래 /settings 로 가는 링크였다. 시트를 여는 것으로 바꾼 건, 좌하단에 있던
 * 계정 아바타(시트를 열던 유일한 문)를 없앴기 때문이다 — 하단 알약과 겹쳐서
 * (사유는 FloatingNav 에 적어 뒀다). 그냥 지우면 로그아웃·어드민·스튜디오 진입이
 * 앱에서 통째로 사라진다. /settings 에는 닉네임·아바타·탈퇴밖에 없다.
 *
 * 화면에 떠 있는 물건을 하나 더 만들지 않는 게 요점이다. 시트는 눌러야 나오는
 * 모달이라 평소엔 아무것도 가리지 않는다.
 */
export function ProfileButton({
  loggedIn,
  avatarUrl,
  me,
}: {
  loggedIn: boolean;
  avatarUrl?: string | null;
  /** 로그인 상태일 때만. 없으면 시트를 못 열고 /settings 로 보낸다. */
  me?: ProfileMe | null;
}) {
  const [open, setOpen] = useState(false);

  // 테두리를 진한 선으로. 기본 line 은 배경과 대비가 약해 버튼이 안 보였다.
  const shell =
    "pb-btn grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-line-strong bg-surface text-fg shadow-sm transition-colors hover:border-brand hover:text-brand";

  const face =
    loggedIn && avatarUrl ? (
      // 원격 도메인이 next.config 에 없을 수 있어 next/image 대신 <img>
      // eslint-disable-next-line @next/next/no-img-element
      <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
    ) : (
      <svg
        viewBox="0 0 24 24"
        className="h-[18px] w-[18px]"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="12" cy="9" r="3.2" />
        <path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" />
      </svg>
    );

  if (!loggedIn || !me) {
    return (
      <Link
        href={loggedIn ? "/settings" : "/login"}
        aria-label={loggedIn ? "내 계정" : "로그인 / 회원가입"}
        className={shell}
      >
        {face}
      </Link>
    );
  }

  return (
    // relative — 데스크톱 팝오버가 이 버튼 바로 아래에 붙는 기준점.
    // 전에는 시트가 md:right-4 md:top-16 으로 화면 모서리에 고정돼 있었는데,
    // 이 버튼은 화면에 고정된 물건이 아니라 지면(FeedHero) 안에 있다.
    // FeedHero 는 max-w-screen-2xl 로 가운데 정렬이라 1536px 을 넘는 모니터에서는
    // 버튼이 화면 오른쪽 끝에서 (화면폭-1536)/2 만큼 안쪽으로 들어온다 —
    // 팝오버만 모서리에 남아 버튼과 따로 놀았다. 기준을 버튼으로 옮긴다.
    // (z-index 는 안 준다. position:relative 만으로는 쌓임 맥락이 안 생겨
    //  시트의 z-50 이 문서 최상위 기준으로 그대로 먹는다.)
    <span className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="내 메뉴"
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`${shell} cursor-pointer`}
      >
        {face}
      </button>
      <ProfileSheet me={me} open={open} onClose={() => setOpen(false)} />
    </span>
  );
}
