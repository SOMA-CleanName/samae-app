"use client";

import Link from "next/link";
import type { PersonaSuccess } from "./view-types";

const DISPLAY = { fontFamily: "var(--font-display)" } as const;

const BIG5_LABEL: Record<string, string> = {
  openness: "개방성",
  conscientiousness: "성실성",
  extraversion: "외향성",
  agreeableness: "우호성",
  emotionalStability: "정서안정",
};

function shareHref(r: PersonaSuccess): string {
  const params = new URLSearchParams({
    label: r.shoot.shootPersonaLabel,
    palette: r.shoot.colorPalette.slice(0, 5).join(","),
  });
  return `/event/persona/share?${params.toString()}`;
}

export default function PersonaResult({
  result,
  onRestart,
}: {
  result: PersonaSuccess;
  onRestart: () => void;
}) {
  const { persona, shoot, photos } = result;
  const palette = shoot.colorPalette.length ? shoot.colorPalette : ["#ff3d2e", "#241a18", "#f3f1ec"];

  return (
    <div className="min-h-[100dvh]" style={{ background: "#0c0b0a", color: "#f3f1ec" }}>
      {/* ── 히어로 ── */}
      <section
        className="relative overflow-hidden px-6 pb-14 pt-20 text-center"
        style={{ background: `radial-gradient(120% 90% at 50% 0%, ${palette[0]}22 0%, #141210 55%, #0c0b0a 100%)` }}
      >
        <p className="text-xs font-medium uppercase tracking-[0.3em] text-[#ff8d80]">MY 촬영 페르소나</p>
        <h1 className="mx-auto mt-4 max-w-lg text-balance text-4xl leading-[1.14] sm:text-5xl" style={DISPLAY}>
          {shoot.shootPersonaLabel}
        </h1>

        {/* 컬러 팔레트 */}
        <div className="mt-6 flex items-center justify-center gap-2">
          {palette.slice(0, 5).map((c, i) => (
            <span
              key={i}
              className="h-7 w-7 rounded-full ring-1 ring-white/15"
              style={{ background: c }}
              title={c}
            />
          ))}
        </div>

        {/* 심리 후킹 */}
        <p className="mx-auto mt-8 max-w-md text-pretty text-[15px] leading-relaxed text-white/70">
          {shoot.psychHook}
        </p>
      </section>

      {/* ── 당신은 이런 사람 (심리) ── */}
      <section className="mx-auto max-w-lg px-6 py-12">
        <h2 className="text-xs font-medium uppercase tracking-[0.25em] text-white/40">당신은 이런 사람</h2>
        <p className="mt-3 text-xl leading-snug text-white/90" style={DISPLAY}>
          {persona.oneLiner}
        </p>

        {/* Big5 미니 바 */}
        <div className="mt-6 space-y-2.5">
          {Object.entries(persona.bigFive).map(([k, v]) => (
            <div key={k} className="flex items-center gap-3">
              <span className="w-14 shrink-0 text-xs text-white/50">{BIG5_LABEL[k] ?? k}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full" style={{ width: `${v.score}%`, background: "#ff3d2e" }} />
              </div>
              <span className="w-7 shrink-0 text-right text-[11px] tabular-nums text-white/40">{v.score}</span>
            </div>
          ))}
        </div>

        {/* 애착 · 근거 */}
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm text-white/80">
            <span className="font-semibold text-[#ff8d80]">{persona.attachment.label}</span> · {persona.attachment.reason}
          </p>
          <ul className="mt-3 space-y-1.5">
            {persona.evidence.slice(0, 4).map((e, i) => (
              <li key={i} className="text-[13px] leading-relaxed text-white/55">— {e}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── 왜 이 무드인지 ── */}
      {shoot.moodReasons.length > 0 && (
        <section className="mx-auto max-w-lg px-6 pb-12">
          <h2 className="text-xs font-medium uppercase tracking-[0.25em] text-white/40">왜 이 무드가 어울릴까</h2>
          <div className="mt-4 space-y-3">
            {shoot.moodReasons.map((m, i) => (
              <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-sm font-semibold text-white/90" style={DISPLAY}>{m.moodTitle}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-white/55">
                  <span className="text-white/40">{m.signal}</span> → {m.why}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── 어울리는 사진 ── */}
      {photos.length > 0 && (
        <section className="mx-auto max-w-lg px-6 pb-12">
          <h2 className="text-xs font-medium uppercase tracking-[0.25em] text-white/40">너한테 어울리는 사진</h2>
          <div className="mt-4 grid grid-cols-3 gap-1.5">
            {photos.map((p) => (
              <Link key={p.id} href={`/photos/${p.id}`} className="group relative aspect-[3/4] overflow-hidden rounded-lg bg-white/5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
              </Link>
            ))}
          </div>
          {shoot.locations.length > 0 && (
            <p className="mt-4 text-center text-[13px] text-white/45">
              어울리는 로케이션 · {shoot.locations.slice(0, 3).join(" · ")}
            </p>
          )}
        </section>
      )}

      {/* ── 전환 CTA ── */}
      <section className="mx-auto max-w-lg space-y-3 px-6 pb-20">
        <Link
          href="/"
          className="block w-full rounded-2xl px-4 py-3.5 text-center font-semibold text-white transition"
          style={{ background: "#ff3d2e" }}
        >
          이 무드로 사진 더 보기
        </Link>
        <a
          href={shareHref(result)}
          target="_blank"
          rel="noopener"
          className="block w-full rounded-2xl border border-white/15 px-4 py-3.5 text-center font-medium text-white/80 transition hover:bg-white/5"
        >
          결과 공유 카드 만들기
        </a>
        <button
          onClick={onRestart}
          className="block w-full px-4 py-2 text-center text-sm text-white/40 transition hover:text-white/70"
        >
          다른 아이디로 다시 하기
        </button>
      </section>
    </div>
  );
}
