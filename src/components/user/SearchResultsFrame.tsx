"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { PHOTO_SEARCH_TIMEOUT_MS } from "@/lib/photo-search-state";
import { SearchUnavailable } from "./SearchUnavailable";

const SearchResolvedContext = createContext<(() => void) | null>(null);

/** Suspense 바깥에서 먼저 hydrate되어, 서버 스트림이 멈춰도 타이머가 시작된다. */
export function SearchResultsFrame({ query, children }: { query: string; children: ReactNode }) {
  const [resolved, setResolved] = useState(false);
  const [expired, setExpired] = useState(false);
  const markResolved = useCallback(() => setResolved(true), []);
  useEffect(() => {
    if (resolved) return;
    const timer = setTimeout(() => setExpired(true), PHOTO_SEARCH_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [resolved]);

  return (
    <SearchResolvedContext.Provider value={markResolved}>
      {expired ? <SearchUnavailable query={query} /> : children}
    </SearchResolvedContext.Provider>
  );
}

/** 결과 경계가 실제로 준비됐을 때 외부 타이머를 해제한다. */
export function SearchResultsResolved({ children }: { children: ReactNode }) {
  const markResolved = useContext(SearchResolvedContext);
  useEffect(() => { markResolved?.(); }, [markResolved]);
  return children;
}
