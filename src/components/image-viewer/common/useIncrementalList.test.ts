// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DEFAULT_INCREMENTAL_PAGE_SIZE, useIncrementalList } from "./useIncrementalList";

const range = (count: number) => Array.from({ length: count }, (_, index) => index);

describe("useIncrementalList", () => {
  it("shows one page, then one more per showMore", () => {
    const items = range(250);
    const { result } = renderHook(() => useIncrementalList(items, "a", 100));

    expect(result.current.visibleItems).toHaveLength(100);
    expect(result.current.hasMore).toBe(true);

    act(() => {
      result.current.showMore();
    });
    expect(result.current.visibleItems).toHaveLength(200);

    act(() => {
      result.current.showMore();
    });
    expect(result.current.visibleItems).toHaveLength(250);
    expect(result.current.hasMore).toBe(false);
  });

  it("uses the default page size", () => {
    const { result } = renderHook(() => useIncrementalList(range(500), "a"));

    expect(result.current.visibleItems).toHaveLength(DEFAULT_INCREMENTAL_PAGE_SIZE);
  });

  it("goes back to the first page when the reset key changes", () => {
    const items = range(250);
    const { result, rerender } = renderHook(
      ({ resetKey }) => useIncrementalList(items, resetKey, 100),
      { initialProps: { resetKey: "a" } },
    );

    act(() => {
      result.current.showMore();
    });
    expect(result.current.visibleItems).toHaveLength(200);

    rerender({ resetKey: "b" });
    expect(result.current.visibleItems).toHaveLength(100);
  });

  it("keeps the page count when only the items change", () => {
    const { result, rerender } = renderHook(({ items }) => useIncrementalList(items, "a", 100), {
      initialProps: { items: range(250) },
    });

    act(() => {
      result.current.showMore();
    });
    rerender({ items: range(250).map((value) => value + 1) });

    expect(result.current.visibleItems).toHaveLength(200);
    expect(result.current.visibleItems[0]).toBe(1);
  });
});
