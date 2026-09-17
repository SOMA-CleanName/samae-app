"use client";

export function MoodAxisSelect({ axis, axes }: { axis: string; axes: readonly string[] }) {
  return (
    <select
      name="axis"
      defaultValue={axis}
      aria-label="무드 축"
      className="rounded-xl border border-line bg-bg px-3 py-2"
      onChange={(event) => event.currentTarget.form?.requestSubmit()}
    >
      <option value="">모든 축</option>
      {axes.map((value) => (
        <option key={value} value={value}>{value === "unassigned" ? "판단 보류" : value === "general" ? "일반 어휘" : value}</option>
      ))}
    </select>
  );
}
