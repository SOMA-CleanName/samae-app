"use client";

import { useState, useTransition } from "react";
import { runPersonaAnalysis } from "./actions";
import type { PersonaActionResult, PersonaSuccess } from "./view-types";
import PersonaResult from "./PersonaResult";

const DISPLAY = { fontFamily: "var(--font-display)" } as const;

const LOADING_PHRASES = [
  "피드의 톤을 읽는 중…",
  "색과 빛의 결을 살피는 중…",
  "당신의 무드를 그려보는 중…",
  "어울리는 사진을 고르는 중…",
];

export default function PersonaExperience() {
  const [username, setUsername] = useState("");
  const [result, setResult] = useState<PersonaSuccess | null>(null);
  const [error, setError] = useState<Exclude<PersonaActionResult, { ok: true }> | null>(null);
  const [pending, start] = useTransition();
  const [phrase, setPhrase] = useState(0);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || pending) return;
    setError(null);
    // 로딩 문구 순환
    const iv = setInterval(() => setPhrase((p) => (p + 1) % LOADING_PHRASES.length), 1800);
    start(async () => {
      const res = await runPersonaAnalysis(username);
      clearInterval(iv);
      if (res.ok) setResult(res);
      else setError(res);
    });
  }

  if (result) return <PersonaResult result={result} onRestart={() => { setResult(null); setUsername(""); }} />;

  return (
    <div
      className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-6 py-16 text-center"
      style={{ background: "radial-gradient(120% 80% at 50% 0%, #241a18 0%, #141210 55%, #0c0b0a 100%)", color: "#f3f1ec" }}
    >
      {/* 배경 광채 */}
      <div aria-hidden className="pointer-events-none absolute -top-32 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full opacity-40 blur-3xl" style={{ background: "#ff3d2e" }} />

      {pending ? (
        <div className="relative z-10 flex flex-col items-center gap-6">
          <div className="h-14 w-14 animate-spin rounded-full border-2 border-white/15 border-t-[#ff3d2e]" />
          <p className="text-lg text-white/80" style={DISPLAY}>{LOADING_PHRASES[phrase]}</p>
          <p className="text-xs text-white/35">@{username.replace(/^@/, "")} 의 미감을 분석하고 있어요</p>
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

          <form onSubmit={submit} className="w-full space-y-3">
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
            <div className="w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
              {error.message}
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
