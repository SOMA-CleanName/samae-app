"use client";

import { useRef, useState, useTransition } from "react";
import { downscaleImage } from "@/lib/downscale";
import { runPersonaAnalysis, analyzeFromImages } from "./actions";
import type { PersonaActionResult, PersonaSuccess } from "./view-types";
import PersonaResult from "./PersonaResult";

const DISPLAY = { fontFamily: "var(--font-display)" } as const;

const LOADING_PHRASES = [
  "피드의 톤을 읽는 중…",
  "색과 빛의 결을 살피는 중…",
  "당신의 무드를 그려보는 중…",
  "어울리는 사진을 고르는 중…",
];

type Failure = Exclude<PersonaActionResult, { ok: true }>;

async function fileToBase64(file: File): Promise<{ mediaType: string; data: string }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return { mediaType: file.type || "image/jpeg", data: btoa(binary) };
}

export default function PersonaExperience() {
  const [username, setUsername] = useState("");
  const [result, setResult] = useState<PersonaSuccess | null>(null);
  const [error, setError] = useState<Failure | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [pending, start] = useTransition();
  const [phrase, setPhrase] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  function run(work: () => Promise<PersonaActionResult>) {
    setError(null);
    const iv = setInterval(() => setPhrase((p) => (p + 1) % LOADING_PHRASES.length), 1800);
    start(async () => {
      const res = await work();
      clearInterval(iv);
      if (res.ok) setResult(res);
      else setError(res);
    });
  }

  function submitUsername(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || pending) return;
    run(() => runPersonaAnalysis(username));
  }

  function submitImages() {
    if (files.length === 0 || pending) return;
    run(async () => {
      const resized = await Promise.all(files.slice(0, 5).map((f) => downscaleImage(f, 1280)));
      const images = await Promise.all(resized.map(fileToBase64));
      return analyzeFromImages(images);
    });
  }

  if (result) return <PersonaResult result={result} onRestart={() => { setResult(null); setUsername(""); setFiles([]); setError(null); }} />;

  const canFallback = error && (error.reason === "private" || error.reason === "empty");

  return (
    <div
      className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-6 py-16 text-center"
      style={{ background: "radial-gradient(120% 80% at 50% 0%, #241a18 0%, #141210 55%, #0c0b0a 100%)", color: "#f3f1ec" }}
    >
      <div aria-hidden className="pointer-events-none absolute -top-32 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full opacity-40 blur-3xl" style={{ background: "#ff3d2e" }} />

      {pending ? (
        <div className="relative z-10 flex flex-col items-center gap-6">
          <div className="h-14 w-14 animate-spin rounded-full border-2 border-white/15 border-t-[#ff3d2e]" />
          <p className="text-lg text-white/80" style={DISPLAY}>{LOADING_PHRASES[phrase]}</p>
          <p className="text-xs text-white/35">
            {username.trim() ? `@${username.replace(/^@/, "")} 의 미감을 분석하고 있어요` : "올린 사진의 미감을 분석하고 있어요"}
          </p>
        </div>
      ) : (
        <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-8">
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-[0.3em] text-[#ff8d80]">samae · 촬영 페르소나</p>
            <h1 className="text-balance text-4xl leading-[1.12] sm:text-5xl" style={DISPLAY}>
              인스타는 남의 사진,
              <br />
              <span style={{ color: "#ff3d2e" }}>samae는 네 사진.</span>
            </h1>
            <p className="text-pretty text-sm text-white/55">
              공개 인스타 아이디를 넣으면 미감을 읽어
              <br />
              나에게 어울리는 촬영 무드와 사진을 찾아드려요.
            </p>
          </div>

          <form onSubmit={submitUsername} className="w-full space-y-3">
            <div className="flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 focus-within:border-[#ff3d2e]/60">
              <span className="text-white/40">@</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="instagram_id"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="w-full bg-transparent text-white placeholder:text-white/30 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={!username.trim()}
              className="w-full rounded-2xl px-4 py-3.5 font-semibold text-white transition disabled:opacity-40"
              style={{ background: "#ff3d2e" }}
            >
              내 촬영 페르소나 알아보기
            </button>
          </form>

          {error && (
            <div className="w-full space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm text-white/70">{error.message}</p>

              {/* 비공개/게시물 없음 → 사진 직접 업로드 fallback */}
              {canFallback && (
                <div className="space-y-3 border-t border-white/10 pt-3">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 5))}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="w-full rounded-xl border border-white/15 px-4 py-2.5 text-sm text-white/80 transition hover:bg-white/5"
                  >
                    {files.length > 0 ? `사진 ${files.length}장 선택됨 · 바꾸기` : "내 사진 3~5장 올리기"}
                  </button>
                  {files.length > 0 && (
                    <button
                      type="button"
                      onClick={submitImages}
                      className="w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition"
                      style={{ background: "#ff3d2e" }}
                    >
                      이 사진들로 분석하기
                    </button>
                  )}
                  <p className="text-[11px] text-white/30">올린 사진은 분석에만 쓰고 저장하지 않아요.</p>
                </div>
              )}
            </div>
          )}

          <p className="text-[11px] leading-relaxed text-white/30">
            본인 공개 인스타 정보를 촬영 취향 분석 목적으로만 사용해요.
            <br />
            팔로워·타인 게시물은 수집하지 않아요.
          </p>
        </div>
      )}
    </div>
  );
}
