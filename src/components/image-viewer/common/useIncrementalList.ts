import { useCallback, useMemo, useState } from "react";

export const DEFAULT_INCREMENTAL_PAGE_SIZE = 120;

interface IIncrementalList<T> {
  visibleItems: readonly T[];
  hasMore: boolean;
  showMore: () => void;
}

// Renders a long list a page at a time: only the first `pageSize` items, then one more page per
// showMore() (called when the user scrolls near the end). Rendering thousands of cards at once
// made big grids take seconds to show and to react to a filter click.
// The page count goes back to one page whenever `resetKey` changes (a new filter, style, sort...)
// but deliberately not when only the items' identity changes, so a background library reload
// (e.g. after "Mark as seen") doesn't collapse a grid the user has scrolled down.
export const useIncrementalList = <T>(
  items: readonly T[],
  resetKey: string,
  pageSize: number = DEFAULT_INCREMENTAL_PAGE_SIZE,
): IIncrementalList<T> => {
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [currentResetKey, setCurrentResetKey] = useState(resetKey);

  // Adjusting state while rendering (instead of in an effect) avoids a frame rendering the old
  // page count for the new list - the pattern React documents for resetting state on a prop change.
  if (currentResetKey !== resetKey) {
    setCurrentResetKey(resetKey);
    setVisibleCount(pageSize);
  }

  const visibleItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);

  const showMore = useCallback(() => {
    setVisibleCount((count) => count + pageSize);
  }, [pageSize]);

  return { visibleItems, hasMore: visibleCount < items.length, showMore };
};
