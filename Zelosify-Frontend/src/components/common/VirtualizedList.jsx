"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { VIRTUALIZATION_THRESHOLD } from "@/utils/Hiring/hiringUtils";

/**
 * Windowed list with variable row heights (no extra dependency).
 *
 * - Up to `threshold` items: renders everything normally.
 * - Above it: only the rows in (or near) the visible area of a scroll
 *   container are mounted. Each row's real height is measured with a
 *   ResizeObserver, so cards that wrap on small screens still position
 *   correctly.
 *
 * Props:
 * - items, getKey(item), renderItem(item, index)
 * - estimateHeight: initial guess per row (px) before measuring
 * - gap: vertical space between rows (px)
 * - maxHeight: CSS height of the scroll container (virtualized mode)
 * - overscan: extra rows rendered above/below the viewport
 */
export default function VirtualizedList({
  items,
  getKey,
  renderItem,
  estimateHeight = 220,
  gap = 12,
  maxHeight = "calc(100vh - 16rem)",
  overscan = 4,
  threshold = VIRTUALIZATION_THRESHOLD,
  className = "",
  ariaLabel,
}) {
  const virtualize = items.length > threshold;

  if (!virtualize) {
    return (
      <div className={className} role="list" aria-label={ariaLabel} style={{ display: "grid", gap }}>
        {items.map((item, i) => (
          <div role="listitem" key={getKey(item)}>
            {renderItem(item, i)}
          </div>
        ))}
      </div>
    );
  }

  return (
    <WindowedList
      items={items}
      getKey={getKey}
      renderItem={renderItem}
      estimateHeight={estimateHeight}
      gap={gap}
      maxHeight={maxHeight}
      overscan={overscan}
      className={className}
      ariaLabel={ariaLabel}
    />
  );
}

function WindowedList({ items, getKey, renderItem, estimateHeight, gap, maxHeight, overscan, className, ariaLabel }) {
  const containerRef = useRef(null);
  const heightsRef = useRef(new Map());
  const [measureVersion, setMeasureVersion] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(800);
  const frameRef = useRef(0);

  // Prefix sums of row offsets (recomputed when items or measurements change).
  const { offsets, totalHeight } = useMemo(() => {
    const result = new Array(items.length);
    let y = 0;
    for (let i = 0; i < items.length; i++) {
      result[i] = y;
      y += (heightsRef.current.get(getKey(items[i])) ?? estimateHeight) + gap;
    }
    return { offsets: result, totalHeight: Math.max(0, y - gap) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, measureVersion, estimateHeight, gap, getKey]);

  // Visible range: binary search for the first row below scrollTop.
  let start = 0;
  let lo = 0;
  let hi = items.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid] < scrollTop) {
      start = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  let end = start;
  while (end < items.length - 1 && offsets[end] < scrollTop + viewportHeight) end++;
  const from = Math.max(0, start - overscan);
  const to = Math.min(items.length - 1, end + overscan);

  const onScroll = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      if (containerRef.current) setScrollTop(containerRef.current.scrollTop);
    });
  }, []);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setViewportHeight(el.clientHeight));
    ro.observe(el);
    setViewportHeight(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  const onRowResize = useCallback((key, height) => {
    if (heightsRef.current.get(key) !== height) {
      heightsRef.current.set(key, height);
      setMeasureVersion((v) => v + 1);
    }
  }, []);

  const rows = [];
  for (let i = from; i <= to; i++) {
    const item = items[i];
    const key = getKey(item);
    rows.push(
      <MeasuredRow key={key} rowKey={key} top={offsets[i]} onResize={onRowResize}>
        {renderItem(item, i)}
      </MeasuredRow>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      className={`relative overflow-y-auto overscroll-contain pr-1 ${className}`}
      style={{ height: maxHeight }}
      role="list"
      aria-label={ariaLabel}
      aria-rowcount={items.length}
      data-virtualized="true"
    >
      <div style={{ height: totalHeight, position: "relative" }}>{rows}</div>
    </div>
  );
}

function MeasuredRow({ rowKey, top, onResize, children }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const report = () => onResize(rowKey, el.offsetHeight);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rowKey, onResize]);

  return (
    <div ref={ref} role="listitem" style={{ position: "absolute", top, left: 0, right: 0 }}>
      {children}
    </div>
  );
}
