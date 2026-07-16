"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { mpTrack } from "@/lib/mixpanel";
import { curateByTaste, saveTaste, type CuratedPhoto } from "./actions";

type QuizPhoto = { id: string; url: string; tags: string[] };
const THRESHOLD = 90; // 스와이프 확정 거리(px)
const RESULT_KEY = "samae:taste-result"; // 결과 저장 키(사진 상세→뒤로 시 결과 복원용)
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

// 취향 테스트 — 틴더식 스와이프. 오른쪽=좋다, 왼쪽=싫다. 덱을 다 넘기면 좋아요한 사진들의
// mood_tags 로 취향 산출 → 큐레이션. 카드는 id 로 key 해 "뒤 카드가 앞으로" 자연스럽게 올라온다.
export function TasteQuiz({ photos }: { photos: QuizPhoto[] }) {
  const [i, setI] = useState(0);
  const [liked, setLiked] = useState<QuizPhoto[]>([]);
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const [flung, setFlung] = useState<{ index: number; dir: "like" | "pass" } | null>(null);
  const [result, setResult] = useState<{ tags: string[]; photos: CuratedPhoto[] } | null>(null);
  const [pending, startT] = useTransition();
  const startRef = useRef({ x: 0, y: 0 });
  const resultScrollRef = useRef<HTMLDivElement>(null); // 결과 화면 스크롤 컨테이너

  // 사진 상세를 보고 뒤로 오면 저장된 결과를 복원 → '이런 스냅 어때요?' 화면으로 돌아온다.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(RESULT_KEY);
      if (raw) setResult(JSON.parse(raw));
    } catch {
      /* 무시 */
    }
  }, []);

  // 테스트를 끝내면(결과) 탐색 스크롤 저장값을 지운다 →
  // 결과에서 뒤로가기(또는 사진→뒤로)로 탐색으로 돌아가면 최상단에서 시작.
  useEffect(() => {
    if (!result) return;
    try {
      sessionStorage.removeItem("samae:scroll:/explore");
      sessionStorage.removeItem("samae:scroll-anchor:/explore");
    } catch {
      /* 스토리지 접근 불가 시 무시 */
    }
  }, [result]);

  const topTagsOf = (arr: QuizPhoto[]) => {
    const counts = new Map<string, number>();
    for (const p of arr) for (const t of p.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 4);
  };

  const finish = (likedArr: QuizPhoto[]) => {
    const tags = topTagsOf(likedArr);
    startT(async () => {
      // 큐레이션만 미리 보여주고, 취향 적용(saveTaste)은 '홈에서 내 취향 보기'를 눌러야만 한다.
      // → 결과에서 그냥 뒤로 나가면 취향이 적용되지 않음.
      const res = await curateByTaste(tags);
      const r = { tags, photos: res };
      setResult(r);
      // 결과 저장 — 결과에서 사진을 눌러 상세로 갔다가 뒤로 오면 이 결과를 복원한다.
      try {
        sessionStorage.setItem(RESULT_KEY, JSON.stringify(r));
      } catch {
        /* 무시 */
      }
      mpTrack("Complete Taste Quiz", { tags, liked: likedArr.length, swiped: photos.length });
    });
  };

  const decide = (dir: "like" | "pass") => {
    if (flung || i >= photos.length) return;
    const nextLiked = dir === "like" ? [...liked, photos[i]] : liked;
    if (dir === "like") setLiked(nextLiked);
    setFlung({ index: i, dir });
    setDrag({ x: 0, y: 0, active: false });
    const nextI = i + 1;
    setI(nextI);
    window.setTimeout(() => {
      setFlung(null);
      if (nextI >= photos.length) finish(nextLiked);
    }, 300);
  };

  const reset = () => {
    try {
      sessionStorage.removeItem(RESULT_KEY); // 다시 탐색 → 저장 결과 폐기, 덱부터 새로
    } catch {
      /* 무시 */
    }
    setI(0);
    setLiked([]);
    setDrag({ x: 0, y: 0, active: false });
    setFlung(null);
    setResult(null);
  };

  // ── 결과 ──
  if (result) {
    return (
      <div ref={resultScrollRef} className="min-h-0 flex-1 overflow-y-auto pt-4 pb-8">
        {result.tags.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {result.tags.map((t) => (
              <span key={t} className="rounded-full bg-brand-soft px-2 py-0.5 text-body-sm font-semibold text-brand-ink">
                #{t}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-body-sm text-muted">좋아요한 사진이 적어서 취향을 못 잡았어요. 다시 해볼까요?</p>
        )}

        <div className="mt-6 flex items-center gap-2.5">
          <h2 className="text-xl font-bold tracking-tight">이런 스냅 어때요?</h2>
          <button
            type="button"
            onClick={() => {
              const el = resultScrollRef.current;
              if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
            }}
            className="inline-flex shrink-0 items-center gap-1 self-end rounded-full bg-brand px-3.5 py-0.5 text-body-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            제 무드입니다
            <span aria-hidden>→</span>
          </button>
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
          <p className="mt-3 text-body-sm text-muted">딱 맞는 스냅이 아직 적어요. 다른 취향으로 다시 해볼까요?</p>
        )}

        <div className="mt-8 flex flex-col items-center gap-3">
          <button
            id="taste-cta"
            type="button"
            disabled={pending}
            onClick={() => {
              // 이 버튼을 눌러야만 취향을 실제로 적용(saveTaste)하고 홈으로.
              // 홈 피드 캐시를 비워 새 취향순 피드가 실제로 반영되게 + 풀 로드.
              // ?nocat=1 → proxy 가 카테고리 컨텍스트(쿠키) 해제 = 전체 보기로 전환.
              // (광고로 /c/<slug> 진입해 컨텍스트가 남아있어도 취향 전체 피드로 넘어감)
              startT(async () => {
                await saveTaste(result.tags);
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
            내 무드 다시 탐색하기
          </button>
        </div>
      </div>
    );
  }

  // 큐레이션 대기
  if (pending) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-fg/20 border-t-fg" />
        <p className="mt-3 text-body-sm text-muted">취향 분석 중…</p>
      </div>
    );
  }

  // ── 스와이프 덱 ──
  // 렌더 대상: 날아가는 카드(직전) + 앞(i) + 뒤(i+1). id 로 key 해 역할만 바뀌며 자연스럽게 전환.
  const idxs = [...new Set([flung?.index ?? -1, i, i + 1])].filter(
    (k) => k >= 0 && k < photos.length
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center pt-4">
      <div className="w-full max-w-[340px] shrink-0 text-center">
        <p className="font-display text-body-sm italic text-brand">30초 취향 테스트</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">끌리면 오른쪽, 아니면 왼쪽</h1>
        <p className="mt-1.5 text-body-sm text-muted">
          카드를 밀거나 아래 버튼으로 골라주세요.
          <br />
          다 넘기면 취향에 맞는 스냅을 모아줄게요.
        </p>
      </div>

      {/* 덱 — 남는 높이에 맞춰 유연하게(스크롤 없이 한 화면에) */}
      <div className="relative mt-4 min-h-0 w-full max-w-[340px] flex-1 select-none">
        {idxs.map((idx) => {
          const photo = photos[idx];
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

      {/* 버튼 */}
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

      {/* 진행 — 다 넘기면 자동 결과 */}
      <div className="mt-4 flex w-full max-w-[340px] shrink-0 flex-col items-center gap-2 pb-4">
        <div className="h-1 w-full overflow-hidden rounded-full bg-fg/10">
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-300"
            style={{ width: `${(i / photos.length) * 100}%` }}
          />
        </div>
        <p className="text-caption text-faint">
          <b className="text-brand">{liked.length}</b> 좋아요 · {i}/{photos.length}
        </p>
      </div>
    </div>
  );
}
