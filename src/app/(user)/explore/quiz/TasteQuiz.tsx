"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { mpTrack } from "@/lib/mixpanel";
import { PURPOSE_OPTIONS } from "@/lib/taste-purposes";
import type { QuizDeckPhoto, TasteCat } from "@/lib/explore-db";
import { loadQuizDeck, finishTaste, applyTasteV2 } from "./actions";

const THRESHOLD = 90; // 스와이프 확정 거리(px)
const RESULT_KEY = "samae:taste-result"; // 결과 저장 키(사진 상세→뒤로 시 결과 복원용)
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

type Step = "purpose" | "swipe" | "result";
type ResultState = { purposeKey: string; moods: TasteCat[]; photos: QuizDeckPhoto[] };

// 취향 테스트 v2 — 1단계: 촬영 목적(고정 3개) 선택 / 2단계: 그 목적의 사진 틴더 스와이프.
// 좋아요한 사진들이 속한 무드 카테고리로 취향 산출 → 큐레이션. (작가 mood_tags 미사용)
export function TasteQuiz() {
  const [step, setStep] = useState<Step>("purpose");
  const [purposeKey, setPurposeKey] = useState<string>("");
  const [deck, setDeck] = useState<QuizDeckPhoto[]>([]);
  const [i, setI] = useState(0);
  const [liked, setLiked] = useState<QuizDeckPhoto[]>([]);
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const [flung, setFlung] = useState<{ index: number; dir: "like" | "pass" } | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);
  const [pending, startT] = useTransition();
  const startRef = useRef({ x: 0, y: 0 });
  const resultScrollRef = useRef<HTMLDivElement>(null);

  // 사진 상세 갔다 뒤로 오면 저장된 결과 복원 → 결과 화면으로(result 있으면 결과 렌더).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(RESULT_KEY);
      // 마운트 후 복원해야 함 — lazy init 은 SSR(서버=null) 과 클라 불일치(hydration) 유발.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setResult(JSON.parse(raw));
    } catch {
      /* 무시 */
    }
  }, []);

  useEffect(() => {
    if (!result) return;
    try {
      sessionStorage.removeItem("samae:scroll:/explore");
      sessionStorage.removeItem("samae:scroll-anchor:/explore");
    } catch {
      /* 무시 */
    }
  }, [result]);

  function startSwipe(key: string) {
    setPurposeKey(key);
    startT(async () => {
      const d = await loadQuizDeck(key);
      setDeck(d);
      setI(0);
      setLiked([]);
      setFlung(null);
      setDrag({ x: 0, y: 0, active: false });
      setStep("swipe");
    });
  }

  function finish(likedArr: QuizDeckPhoto[]) {
    startT(async () => {
      const res = await finishTaste(
        purposeKey,
        likedArr.map((p) => p.id)
      );
      const r: ResultState = { purposeKey, moods: res.moods, photos: res.photos };
      setResult(r);
      setStep("result");
      try {
        sessionStorage.setItem(RESULT_KEY, JSON.stringify(r));
      } catch {
        /* 무시 */
      }
      mpTrack("Complete Taste Quiz", {
        purpose: purposeKey,
        moods: res.moods.map((m) => m.title),
        liked: likedArr.length,
        swiped: deck.length,
      });
    });
  }

  const decide = (dir: "like" | "pass") => {
    if (flung || i >= deck.length) return;
    const nextLiked = dir === "like" ? [...liked, deck[i]] : liked;
    if (dir === "like") setLiked(nextLiked);
    setFlung({ index: i, dir });
    setDrag({ x: 0, y: 0, active: false });
    const nextI = i + 1;
    setI(nextI);
    window.setTimeout(() => {
      setFlung(null);
      if (nextI >= deck.length) finish(nextLiked);
    }, 300);
  };

  function reset() {
    try {
      sessionStorage.removeItem(RESULT_KEY);
    } catch {
      /* 무시 */
    }
    setResult(null);
    setDeck([]);
    setI(0);
    setLiked([]);
    setDrag({ x: 0, y: 0, active: false });
    setFlung(null);
    setPurposeKey("");
    setStep("purpose");
  }

  // ── 결과 ── (result 가 있으면 단계와 무관하게 결과 렌더)
  if (result) {
    return (
      <div ref={resultScrollRef} className="min-h-0 flex-1 overflow-y-auto pt-4 pb-8">
        {result.moods.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {result.moods.map((m) => (
              <span
                key={m.id}
                className="rounded-full bg-brand-soft px-2.5 py-0.5 text-body-sm font-semibold text-brand-ink"
              >
                {m.title}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-body-sm text-muted">
            좋아요한 사진이 적어서 무드를 못 잡았어요. 다시 해볼까요?
          </p>
        )}

        <div className="mt-6 flex items-center gap-2.5">
          <h2 className="text-xl font-bold tracking-tight">이런 스냅 어때요?</h2>
        </div>
        {result.photos.length > 0 ? (
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            {result.photos.map((p) => (
              <Link
                key={p.id}
                href={`/photos/${p.id}`}
                className="group relative aspect-[3/4] overflow-hidden bg-fg/[0.06]"
              >
                <Image
                  src={p.url}
                  alt=""
                  fill
                  sizes="(max-width: 640px) 50vw, 215px"
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                />
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-body-sm text-muted">딱 맞는 스냅이 아직 적어요. 다시 해볼까요?</p>
        )}

        <div className="mt-8 flex flex-col items-center gap-3">
          <button
            id="taste-cta"
            type="button"
            disabled={pending}
            onClick={() => {
              startT(async () => {
                await applyTasteV2(
                  result.purposeKey,
                  result.moods.map((m) => m.id)
                );
                try {
                  Object.keys(sessionStorage)
                    .filter((k) => k.startsWith("samae:gallery-session:"))
                    .forEach((k) => sessionStorage.removeItem(k));
                } catch {
                  /* 무시 */
                }
                window.location.href = "/?nocat=1";
              });
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand px-8 py-2 text-body font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            내 취향 사진 더 보러가기
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={reset}
            className="rounded-full border border-line-strong px-5 py-2 text-body-sm font-semibold text-fg transition-colors hover:bg-fg/[0.04]"
          >
            다시 하기
          </button>
        </div>
      </div>
    );
  }

  // ── 대기(덱 로드/분석) ──
  if (pending && step !== "purpose") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-fg/20 border-t-fg" />
        <p className="mt-3 text-body-sm text-muted">
          {step === "swipe" ? "취향 분석 중…" : "사진 준비 중…"}
        </p>
      </div>
    );
  }

  // ── 1단계: 목적 선택 (고정 3개) ──
  if (step === "purpose") {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pt-6">
        <div className="w-full max-w-[440px] self-center text-center">
          <p className="font-display text-body-sm italic text-brand">30초 취향 테스트</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">어떤 스냅을 찾으세요?</h1>
          <p className="mt-1.5 text-body-sm text-muted">하나를 골라주세요.</p>
        </div>

        <div className="mx-auto mt-6 flex w-full max-w-[440px] flex-col gap-3 px-1 pb-8">
          {PURPOSE_OPTIONS.map((p) => (
            <button
              key={p.key}
              type="button"
              disabled={pending}
              onClick={() => startSwipe(p.key)}
              className="group flex items-center justify-between gap-3 rounded-2xl border border-line-strong bg-surface px-5 py-4 text-left transition-colors hover:border-brand/50 hover:bg-brand-soft/40 disabled:opacity-50"
            >
              <span className="min-w-0">
                <span className="block text-title font-bold text-fg">{p.label}</span>
                <span className="mt-0.5 block text-body-sm text-muted">{p.subtext}</span>
              </span>
              <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-faint transition-colors group-hover:text-brand" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── 2단계: 스와이프 덱 ──
  if (deck.length < 4) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <p className="text-body-sm text-muted">이 목적에 쓸 사진이 아직 부족해요.</p>
        <button
          type="button"
          onClick={reset}
          className="rounded-full border border-line-strong px-5 py-2 text-body-sm font-semibold text-fg hover:bg-fg/[0.04]"
        >
          목적 다시 고르기
        </button>
      </div>
    );
  }

  const idxs = [...new Set([flung?.index ?? -1, i, i + 1])].filter(
    (k) => k >= 0 && k < deck.length
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center pt-4">
      <div className="w-full max-w-[340px] shrink-0 text-center">
        <p className="font-display text-body-sm italic text-brand">어떤 무드가 끌리나요?</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">끌리면 오른쪽, 아니면 왼쪽</h1>
        <p className="mt-1.5 text-body-sm text-muted">
          카드를 밀거나 아래 버튼으로 골라주세요.
          <br />
          다 넘기면 취향에 맞는 스냅을 모아줄게요.
        </p>
      </div>

      <div className="relative mt-4 min-h-0 w-full max-w-[340px] flex-1 select-none">
        {idxs.map((idx) => {
          const photo = deck[idx];
          const isFlung = flung?.index === idx;
          const isFront = !isFlung && idx === i;

          let transform: string;
          let transition: string;
          let opacity = 1;
          if (isFlung) {
            const off = flung!.dir === "like" ? 1 : -1;
            transform = `translateX(${off * 640}px) rotate(${off * 20}deg)`;
            transition = "transform 300ms ease-out, opacity 300ms";
            opacity = 0;
          } else if (isFront) {
            transform = drag.active
              ? `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x * 0.05}deg)`
              : "translate(0px, 0px) rotate(0deg)";
            transition = drag.active ? "none" : "transform 260ms ease-out";
          } else {
            transform = "scale(0.93) translateY(10px)";
            transition = "transform 260ms ease-out, opacity 260ms";
            opacity = 0.7;
          }

          const likeAmt = isFront ? clamp01(drag.x / THRESHOLD) : 0;
          const passAmt = isFront ? clamp01(-drag.x / THRESHOLD) : 0;

          return (
            <div
              key={photo.id}
              onPointerDown={
                isFront
                  ? (e) => {
                      startRef.current = { x: e.clientX, y: e.clientY };
                      setDrag({ x: 0, y: 0, active: true });
                      e.currentTarget.setPointerCapture(e.pointerId);
                    }
                  : undefined
              }
              onPointerMove={
                isFront
                  ? (e) => {
                      if (!drag.active) return;
                      setDrag({
                        x: e.clientX - startRef.current.x,
                        y: e.clientY - startRef.current.y,
                        active: true,
                      });
                    }
                  : undefined
              }
              onPointerUp={
                isFront
                  ? () => {
                      if (!drag.active) return;
                      if (drag.x > THRESHOLD) decide("like");
                      else if (drag.x < -THRESHOLD) decide("pass");
                      else setDrag({ x: 0, y: 0, active: false });
                    }
                  : undefined
              }
              style={{
                transform,
                transition,
                opacity,
                zIndex: isFlung ? 30 : isFront ? 20 : 10,
                touchAction: isFront ? "none" : undefined,
              }}
              className={
                "absolute inset-0 overflow-hidden rounded-3xl bg-fg/[0.06] " +
                (isFront ? "cursor-grab shadow-pop active:cursor-grabbing" : "shadow-card")
              }
            >
              <Image src={photo.url} alt="" fill priority={isFront} quality={88} sizes="340px" className="object-cover" draggable={false} />

              {isFront && (
                <>
                  <span
                    style={{ opacity: likeAmt }}
                    className="absolute left-4 top-4 rotate-[-12deg] rounded-lg border-2 border-success px-3 py-1 text-lg font-extrabold tracking-wide text-success"
                  >
                    좋아요
                  </span>
                  <span
                    style={{ opacity: passAmt }}
                    className="absolute right-4 top-4 rotate-[12deg] rounded-lg border-2 border-danger px-3 py-1 text-lg font-extrabold tracking-wide text-danger"
                  >
                    패스
                  </span>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex shrink-0 items-center gap-6">
        <button
          type="button"
          onClick={() => decide("pass")}
          aria-label="패스"
          className="grid h-14 w-14 place-items-center rounded-full border border-line-strong bg-surface text-danger shadow-card transition-transform hover:scale-105 active:scale-95"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => decide("like")}
          aria-label="좋아요"
          className="grid h-14 w-14 place-items-center rounded-full bg-brand text-white shadow-pop transition-transform hover:scale-105 active:scale-95"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
            <path d="M12 20.3l-1.45-1.32C5.4 14.24 2 11.16 2 7.5 2 4.42 4.42 2 7.5 2c1.74 0 3.41.81 4.5 2.09C13.09 2.81 14.76 2 16.5 2 19.58 2 22 4.42 22 7.5c0 3.66-3.4 6.74-8.55 11.49L12 20.3z" />
          </svg>
        </button>
      </div>

      <div className="mt-4 flex w-full max-w-[340px] shrink-0 flex-col items-center gap-2 pb-4">
        <div className="h-1 w-full overflow-hidden rounded-full bg-fg/10">
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-300"
            style={{ width: `${(i / deck.length) * 100}%` }}
          />
        </div>
        <p className="text-caption text-faint">
          <b className="text-brand">{liked.length}</b> 좋아요 · {i}/{deck.length}
        </p>
      </div>
    </div>
  );
}
