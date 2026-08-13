"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface DragOffset {
  x: number;
  y: number;
}

/**
 * Lets a floating element be dragged out of the way and remembers where the
 * reader put it.
 *
 * The assistant launcher sits over the page, and on a narrow screen it lands on
 * top of whatever the reader is trying to finish. Rather than guess a corner
 * that is always free — there isn't one — let them move it.
 *
 * Two details make this behave: the offset is clamped to the viewport on every
 * move and again on resize, so the control can never be dragged off-screen and
 * lost; and a drag that travelled more than a few pixels suppresses the click
 * that the browser fires afterwards, so moving the button does not also open
 * the panel.
 */
export function useDraggable(storageKey: string) {
  // Read straight from storage on first render rather than in an effect, so
  // the control never visibly jumps from the default corner to where the
  // reader left it. The element carries suppressHydrationWarning because this
  // value only exists in the browser.
  const [offset, setOffset] = useState<DragOffset>(() => {
    if (typeof window === "undefined") return { x: 0, y: 0 };
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as DragOffset;
        if (Number.isFinite(parsed?.x) && Number.isFinite(parsed?.y)) {
          return parsed;
        }
      }
    } catch {
      // A malformed or blocked localStorage is not worth failing over.
    }
    return { x: 0, y: 0 };
  });
  const [dragging, setDragging] = useState(false);

  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<{
    px: number;
    py: number;
    ox: number;
    oy: number;
  } | null>(null);
  const moved = useRef(false);

  const clamp = useCallback(
    (next: DragOffset): DragOffset => {
      const el = ref.current;
      if (!el) return next;

      const rect = el.getBoundingClientRect();
      // Where the element sits with no offset applied.
      const baseLeft = rect.left - offset.x;
      const baseTop = rect.top - offset.y;
      const margin = 8;

      return {
        x: Math.min(
          window.innerWidth - rect.width - margin - baseLeft,
          Math.max(margin - baseLeft, next.x),
        ),
        y: Math.min(
          window.innerHeight - rect.height - margin - baseTop,
          Math.max(margin - baseTop, next.y),
        ),
      };
    },
    [offset.x, offset.y],
  );

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: PointerEvent) => {
      const s = start.current;
      if (!s) return;

      const dx = e.clientX - s.px;
      const dy = e.clientY - s.py;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved.current = true;

      setOffset(clamp({ x: s.ox + dx, y: s.oy + dy }));
    };

    const onUp = () => {
      setDragging(false);
      start.current = null;
      setOffset((current) => {
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(current));
        } catch {
          // Ignore storage failures; the position simply will not persist.
        }
        return current;
      });
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragging, clamp, storageKey]);

  // A rotated phone can leave the control outside the new viewport.
  useEffect(() => {
    const onResize = () => setOffset((current) => clamp(current));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clamp]);

  const onPointerDown = (e: React.PointerEvent) => {
    moved.current = false;
    start.current = {
      px: e.clientX,
      py: e.clientY,
      ox: offset.x,
      oy: offset.y,
    };
    setDragging(true);
  };

  /** True when the pointer travelled far enough that this was a drag. */
  const consumeDrag = () => {
    const wasDrag = moved.current;
    moved.current = false;
    return wasDrag;
  };

  return { ref, offset, dragging, onPointerDown, consumeDrag };
}
