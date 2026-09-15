import type { ReactNode } from "react";
import { PhotoClassificationNav } from "./PhotoClassificationNav";

export default function PhotoClassificationLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto max-w-[1500px] px-4 py-7 sm:px-5">
      <h1 className="text-h1 font-semibold">사진 목적&amp;무드</h1>
      <PhotoClassificationNav />
      {children}
    </main>
  );
}
