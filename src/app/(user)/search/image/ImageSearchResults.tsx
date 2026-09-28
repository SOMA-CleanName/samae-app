"use client";

/**
 * 사진으로 검색 — 결과 화면. (docs/42 §3)
 *
 * 검색할 사진은 이 탭(sessionStorage)에만 있다. 주소에는 사진이 없으므로 **링크를 공유해도 결과는 안 열린다**.
 * 같은 탭에서 새로고침·뒤로 가기는 된다(사진이 그대로 있으니 다시 검색한다).
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import type { GalleryPhoto } from "@/lib/discovery";
import { ExploreGallery } from "@/components/user/ExploreGallery";
import { EmptyState } from "@/components/ui";
import { CameraIcon, XIcon } from "@/components/user/icons";
import { forgetSearchImage, readSearchImage, subscribeSearchImage } from "@/lib/image-search-client";
import { imageSearchKey } from "@/lib/image-search-core";

/** 결과는 **어느 사진의 결과인지**(image)를 같이 들고 있는다 — 사진을 바꿔 다시 검색했는데
 *  앞 사진 결과가 그대로 보이면 안 된다. */
type State =
  | { step: "loading" }
  | { step: "unavailable"; image: string }                 // 맥미니가 안 받는다
  | { step: "done"; image: string; photos: GalleryPhoto[]; capped: boolean };

export function ImageSearchResults({ likedIds, loggedIn }: { likedIds: string[]; loggedIn: boolean }) {
  const router = useRouter();
  // 검색할 사진은 이 탭의 sessionStorage 에 있다 — 리액트 바깥의 값이라 구독해서 읽는다(서버에서는 없다).
  const image = useSyncExternalStore(subscribeSearchImage, readSearchImage, () => null);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>({ step: "loading" });

  useEffect(() => {
    if (!image) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/search/image", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ image }),
        });
        if (cancelled) return;
        if (!res.ok) {
          setState({ step: "unavailable", image });
          return;
        }
        const json = (await res.json()) as { photos?: GalleryPhoto[]; capped?: boolean };
        if (cancelled) return;
        setState({ step: "done", image, photos: json.photos ?? [], capped: !!json.capped });
      } catch {
        if (!cancelled) setState({ step: "unavailable", image });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [image, attempt]);

  function stop() {
    forgetSearchImage();
    router.push("/");
  }

  // 탭을 새로 열었거나 사진이 사라졌다 — 다시 올려야 한다
  if (!image) {
    return (
      <EmptyState
        icon={<CameraIcon className="h-10 w-10" />}
        title="검색할 사진이 없어요"
        description="검색창의 카메라 버튼을 눌러 사진을 다시 올려 주세요."
        action={<Link href="/" className="rounded-full bg-fg px-4 py-2 text-caption font-semibold text-bg">전체 둘러보기</Link>}
      />
    );
  }

  // 앞 사진의 결과는 보여주지 않는다 — 사진을 바꾼 순간부터 다시 "찾는 중" 이다
  const view: State = state.step !== "loading" && state.image !== image ? { step: "loading" } : state;

  return (
    <>
      <div className="mx-auto mb-3 flex max-w-screen-2xl items-center gap-3 px-1">
        {image && (
          // 올린 사진 — 브라우저 안에만 있는 data URL 이라 next/image 를 쓰지 않는다
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="검색에 올린 사진" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-body font-bold tracking-tight">이 사진과 비슷한 사진</h1>
          <p className="text-caption text-muted">
            {view.step === "loading" && "찾는 중이에요…"}
            {view.step === "unavailable" && "사진 검색을 잠시 쓸 수 없어요."}
            {/* 장수는 적지 않는다 — 300장 상한에 걸린 수라 "몇 장 있다" 는 뜻이 아니다(2026-09-28) */}
            {view.step === "done" && view.photos.length === 0 && "비슷한 사진을 찾지 못했어요."}
          </p>
        </div>
        <button
          type="button"
          onClick={stop}
          className="flex shrink-0 items-center gap-1 rounded-full border border-line px-3 py-1.5 text-caption text-muted hover:text-fg"
        >
          <XIcon className="h-3.5 w-3.5" />
          사진 검색 끝내기
        </button>
      </div>

      {view.step === "unavailable" && (
        <EmptyState
          icon={<CameraIcon className="h-10 w-10" />}
          title="사진 검색을 잠시 쓸 수 없어요"
          description="조금 뒤에 다시 시도해 주세요."
          action={
            <button
              type="button"
              onClick={() => {
                setState({ step: "loading" });
                setAttempt((n) => n + 1);
              }}
              className="rounded-full bg-fg px-4 py-2 text-caption font-semibold text-bg"
            >
              다시 시도
            </button>
          }
        />
      )}
      {view.step === "done" && view.photos.length > 0 && (
        <ExploreGallery
          photos={view.photos}
          likedIds={likedIds}
          loggedIn={loggedIn}
          // 사진마다 다른 자리에 저장한다 — 안 가르면 사진을 바꿔도 앞 결과가 되살아난다
          sessionScope={`image-search:${imageSearchKey(image)}`}
        />
      )}
      {view.step === "done" && view.photos.length === 0 && (
        <EmptyState
          icon={<CameraIcon className="h-10 w-10" />}
          title="비슷한 사진을 찾지 못했어요"
          description="다른 사진으로 다시 해 보세요."
        />
      )}
    </>
  );
}
