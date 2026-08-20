"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { downscaleImage } from "@/lib/downscale";
import { mpTrack, mpRegister } from "@/lib/mixpanel";
import { Button, Input } from "@/components/ui";
import { runPersonaAnalysis, analyzeFromImages, lookupInstagramProfile } from "./actions";
import type { LookupResult } from "@/lib/persona/lookup";
import type { PersonaActionResult, PersonaSuccess } from "./view-types";
import PersonaResult from "./PersonaResult";
import { PersonaLoading } from "./PersonaLoading";

type Failure = Exclude<PersonaActionResult, { ok: true }>;

// 686,071,938 처럼 긴 숫자는 카드에서 잘린다 — 6.9억/1.2만 식으로 줄인다
const compact = new Intl.NumberFormat("ko", { notation: "compact", maximumFractionDigits: 1 });

async function fileToBase64(file: File): Promise<{ mediaType: string; data: string }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return { mediaType: file.type || "image/jpeg", data: btoa(binary) };
}

export default function PersonaExperience({ defaultUsername = "" }: { defaultUsername?: string }) {
  const [username, setUsername] = useState(defaultUsername);
  const [result, setResult] = useState<PersonaSuccess | null>(null);
  const [error, setError] = useState<Failure | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [pending, start] = useTransition();
  const [method, setMethod] = useState<"instagram" | "upload">("instagram");
  const [empty, setEmpty] = useState(false); // 빈 입력으로 제출했을 때의 인라인 에러
  const [preview, setPreview] = useState<LookupResult | null>(null); // 입력 중 프로필 확인 카드
  const [filePreviews, setFilePreviews] = useState<string[]>([]); // 업로드 선택 미리보기 (objectURL)
  const [looking, setLooking] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lookupSeq = useRef(0); // 늦게 도착한 이전 조회가 최신 결과를 덮지 않게

  // 타이핑이 멈추면(600ms) 계정을 미리 조회해 확인 카드를 띄운다.
  // 오타·비공개를 분석 전에 걸러 Apify+LLM 비용과 30초 대기를 아끼는 게 목적.
  // 파일 선택 시 미리보기 objectURL 을 함께 갱신 (이전 URL 은 해제 — 누수 방지)
  function selectFiles(list: FileList | null) {
    const next = Array.from(list ?? []).slice(0, 5);
    setFiles(next);
    setFilePreviews((prev) => {
      prev.forEach((u) => URL.revokeObjectURL(u));
      return next.map((f) => URL.createObjectURL(f));
    });
  }

  const handle = username.replace(/^@/, "").trim();
  useEffect(() => {
    const seq = ++lookupSeq.current;
    if (handle.length < 3 || pending) {
      // 짧아지면 기존 카드·스피너를 정리 (동기 setState 를 피해 마이크로태스크로)
      queueMicrotask(() => {
        if (seq === lookupSeq.current) {
          setPreview(null);
          setLooking(false);
        }
      });
      return;
    }
    const t = window.setTimeout(async () => {
      if (seq !== lookupSeq.current) return;
      setPreview(null);
      setLooking(true);
      try {
        const res = await lookupInstagramProfile(handle);
        if (seq !== lookupSeq.current) return; // 그 사이 더 타이핑함
        setPreview(res);
      } catch {
        if (seq === lookupSeq.current) setPreview({ status: "unavailable" });
      } finally {
        if (seq === lookupSeq.current) setLooking(false);
      }
    }, 600);
    return () => window.clearTimeout(t);
  }, [handle, pending]);

  // 인스타 아이디는 PII 라 전송하지 않는다 — 경로(method)와 결과 특성만 남긴다.
  function run(m: "instagram" | "upload", work: () => Promise<PersonaActionResult>) {
    setError(null);
    setMethod(m);
    mpTrack("Start Persona Analysis", { method: m });
    const startedAt = Date.now();
    start(async () => {
      const res = await work();
      const duration_ms = Date.now() - startedAt;
      if (res.ok) {
        mpTrack("Complete Persona Analysis", {
          method: m,
          duration_ms,
          purpose_key: res.shoot.purposeKey,
          mood_count: res.shoot.moodIds.length,
          photo_count: res.photos.length,
        });
        // 이후 모든 이벤트에 페르소나 귀속을 첨부 — 북극성 지표(분석 완료 → 작가 문의)를
        // 다른 페이지에서 발화하는 'Submit Inquiry' 와 이어붙이기 위한 슈퍼 프로퍼티.
        mpRegister({ persona_completed: true, persona_purpose: res.shoot.purposeKey });
        setResult(res);
      } else {
        mpTrack("Fail Persona Analysis", { method: m, duration_ms, reason: res.reason });
        setError(res);
      }
    });
  }

  function submitUsername(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    if (!username.trim()) {
      // 비활성 버튼 대신 인라인 에러 + 포커스 이동
      setEmpty(true);
      inputRef.current?.focus();
      return;
    }
    // 확인 카드가 이미 결론을 낸 경우 서버(Apify)를 태우지 않는다.
    // 미존재 → 인라인 경고가 떠 있음. 비공개 → 업로드 안내 카드가 떠 있음.
    if (preview?.status === "not_found") {
      inputRef.current?.focus();
      return;
    }
    if (preview?.status === "found" && preview.profile.isPrivate) {
      fileRef.current?.click();
      return;
    }
    run("instagram", () => runPersonaAnalysis(username));
  }

  function submitImages() {
    if (files.length === 0 || pending) return;
    run("upload", async () => {
      const resized = await Promise.all(files.slice(0, 5).map((f) => downscaleImage(f, 1280)));
      const images = await Promise.all(resized.map(fileToBase64));
      return analyzeFromImages(images);
    });
  }

  if (result)
    return (
      <PersonaResult
        result={result}
        onRestart={() => {
          setResult(null);
          setUsername("");
          setFiles([]);
          setError(null);
        }}
      />
    );

  if (pending)
    return <PersonaLoading method={method} username={username.replace(/^@/, "").trim()} />;

  const canFallback = error && (error.reason === "private" || error.reason === "empty");

  return (
    // 셸의 <main> 이 이미 pb-28(7rem)을 갖고 있다 — 100dvh 면 그만큼 넘쳐 스크롤이 생긴다.
    <div className="mx-auto flex min-h-[calc(100dvh-7rem)] w-full max-w-md flex-col justify-center px-6 py-12 font-kr">
      <header>
        <p className="font-display text-body-sm italic text-brand">samae · 촬영 페르소나</p>
        {/* 한글에 font-display(Fraunces)를 씌우면 합성 이탤릭이라 지저분하다.
            사매 규칙: 한글 제목은 볼드 산세리프, Fraunces italic 은 'samae' 로고와 짧은 강조에만. */}
        <h1 className="mt-3 text-balance text-[2rem] font-extrabold leading-[1.25] tracking-tight sm:text-[2.4rem]">
          당신의 피드엔 이미
          <br />
          <span className="text-brand">당신의 무드</span>가 있어요.
        </h1>
        <p className="mt-4 text-pretty text-body leading-relaxed text-muted">
          아이디만 넣어 보세요.
          <br />
          피드의 색·빛·구도를 읽어 어울리는 촬영 무드와 닮은 사진을 찾아드려요.
        </p>
      </header>

      <form onSubmit={submitUsername} className="mt-8 space-y-3">
        <label htmlFor="persona-username" className="sr-only">
          인스타그램 아이디
        </label>
        <Input
          ref={inputRef}
          id="persona-username"
          name="instagram_username"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            if (empty) setEmpty(false);
          }}
          placeholder="instagram_id"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="go"
          leftIcon={<span aria-hidden>@</span>}
          invalid={empty || error?.reason === "error" || undefined}
          aria-describedby={empty ? "persona-username-error" : undefined}
        />
        {empty && (
          <p id="persona-username-error" className="text-caption text-danger">
            인스타 아이디를 입력해 주세요.
          </p>
        )}

        {/* ── 계정 확인 카드 ──
            타이핑이 멈추면 해당 계정의 프로필을 미리 보여준다.
            · 공개 계정 → 카드를 탭하면 바로 분석 시작 ("이 계정 맞지?" 확인)
            · 비공개    → 스크래핑이 어차피 실패하므로 여기서 업로드 경로로 안내
            · 미존재    → 오타 안내 (Apify 호출 0)
            · 조회불가(차단 등) → 카드 없이 기존 흐름 그대로 (조회는 편의 기능) */}
        {looking && (
          <p className="flex items-center gap-2 text-caption text-muted" aria-live="polite">
            <span className="h-3 w-3 animate-spin rounded-full border border-line-strong border-t-brand" aria-hidden />
            계정 확인 중…
          </p>
        )}
        {!looking && preview?.status === "found" && !preview.profile.isPrivate && (
          <button
            type="button"
            // 카드가 보여주는 바로 그 계정으로 분석한다 — 입력창을 더 타이핑한 뒤
            // 스테일 카드를 탭해도 카드에 보이는 계정이 분석되도록 (submit 이 아니라 명시 값)
            onClick={() => {
              const u = preview.profile.username;
              setUsername(u);
              run("instagram", () => runPersonaAnalysis(u));
            }}
            className="flex w-full cursor-pointer items-center gap-3 rounded-2xl border-2 border-brand bg-surface p-3 text-left shadow-card transition-colors hover:bg-brand-soft/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            aria-label={`${preview.profile.username} 계정으로 분석 시작`}
          >
            {preview.profile.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview.profile.avatar}
                alt=""
                width={44}
                height={44}
                className="h-11 w-11 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-2 text-title font-bold text-muted" aria-hidden>
                @
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body-sm font-semibold">
                {preview.profile.fullName || preview.profile.username}
                {preview.profile.isVerified && <span className="ml-1 text-info" aria-label="인증됨">✓</span>}
              </span>
              <span className="block truncate text-caption text-muted">
                @{preview.profile.username} · 게시물 {compact.format(preview.profile.posts)} · 팔로워{" "}
                {compact.format(preview.profile.followers)}
              </span>
            </span>
            <span className="shrink-0 rounded-full bg-brand px-3.5 py-1.5 text-caption font-semibold text-white">
              이 계정으로 →
            </span>
          </button>
        )}
        {!looking && preview?.status === "found" && preview.profile.isPrivate && (
          <div className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-center gap-3">
              {preview.profile.avatar && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview.profile.avatar}
                  alt=""
                  width={40}
                  height={40}
                  className="h-10 w-10 shrink-0 rounded-full object-cover"
                />
              )}
              <p className="text-body-sm">
                <span className="font-semibold">@{preview.profile.username}</span>
                <span className="text-muted"> — 비공개 계정이라 피드를 읽을 수 없어요.</span>
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="md"
              fullWidth
              className="mt-3"
              onClick={() => fileRef.current?.click()}
            >
              사진 3~5장 직접 올려서 분석하기
            </Button>
          </div>
        )}
        {!looking && preview?.status === "not_found" && (
          <p className="text-caption text-danger" role="alert">
            @{handle} 계정을 찾지 못했어요. 아이디를 확인해 주세요.
          </p>
        )}

        {/* 빈 입력이라고 버튼을 비활성화하면 '왜 안 눌리는지' 알 방법이 없다.
            항상 누를 수 있게 두고, 누르면 이유를 말해준다.
            단, 공개 계정 확인 카드가 떠 있을 때는 숨긴다 — 카드와 이 버튼이 같은 일을 해서
            "뭘 눌러야 하지?" 를 만들기 때문. 그때는 카드가 유일한 CTA 다 (Enter 도 동작). */}
        {!(preview?.status === "found" && !preview.profile.isPrivate && !looking) && (
          <Button type="submit" variant="brand" size="lg" fullWidth>
            내 촬영 페르소나 알아보기
          </Button>
        )}
      </form>

      {/* 숨김 파일 입력 — 에러 fallback 과 '비공개 계정' 확인 카드 둘 다 이걸 연다 */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        aria-label="분석할 사진 선택 (최대 5장)"
        onChange={(e) => selectFiles(e.target.files)}
        className="sr-only"
      />
      {files.length > 0 && (
        <div className="mt-4 space-y-2.5 rounded-xl border border-line bg-surface p-4">
          {/* 어떤 사진이 올라갔는지 눈으로 확인 — 텍스트 카운트만으론 잘못 고른 걸 모른다 */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
            {filePreviews.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={src}
                alt={`선택한 사진 ${i + 1}`}
                width={56}
                height={56}
                className="h-14 w-14 shrink-0 rounded-lg object-cover"
              />
            ))}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              aria-label="사진 다시 고르기"
              className="grid h-14 w-14 shrink-0 cursor-pointer place-items-center rounded-lg border border-dashed border-line-strong text-muted transition-colors hover:border-brand hover:text-brand"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-5 w-5" aria-hidden>
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </div>
          <Button type="button" variant="brand" size="md" fullWidth onClick={submitImages}>
            사진 {files.length}장으로 분석하기
          </Button>
          <p className="text-caption text-muted">올린 사진은 분석에만 쓰고 저장하지 않아요.</p>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-line bg-surface p-4"
        >
          <p className="text-body-sm text-fg">{error.message}</p>

          {/* 비공개/게시물 없음 → 사진 직접 업로드 fallback */}
          {canFallback && (
            <div className="mt-3 space-y-2.5 border-t border-line pt-3">
              <Button
                type="button"
                variant="secondary"
                size="md"
                fullWidth
                onClick={() => fileRef.current?.click()}
              >
                {files.length > 0 ? `사진 ${files.length}장 선택됨 · 바꾸기` : "내 사진 3~5장 올리기"}
              </Button>
            </div>
          )}
        </div>
      )}

      <p className="mt-8 text-caption leading-relaxed text-muted">
        본인 공개 인스타 정보를 촬영 취향 분석 목적으로만 사용해요.
        <br />
        팔로워·타인 게시물은 수집하지 않아요.
      </p>
    </div>
  );
}
