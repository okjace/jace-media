"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode, type TouchEvent as ReactTouchEvent } from "react";
import { createPortal } from "react-dom";

export type MenuItem =
  | { label: string; icon?: string; onSelect: () => void; danger?: boolean; href?: undefined }
  | { label: string; icon?: string; href: string; newTab?: boolean; danger?: boolean; onSelect?: undefined }
  | "divider";

/** The menu itself, at a point on the screen (kept inside the window). */
export function MenuAt({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ left: Math.max(8, Math.min(x, window.innerWidth - r.width - 8)), top: Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) });
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !el.contains(e.target as Node)) onClose();
    };
    const t = setTimeout(() => {
      document.addEventListener("mousedown", close);
      document.addEventListener("touchstart", close);
      document.addEventListener("keydown", close);
      window.addEventListener("scroll", onClose, { passive: true });
      window.addEventListener("resize", onClose);
    }, 0);
    el.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
      document.removeEventListener("keydown", close);
      window.removeEventListener("scroll", onClose);
      window.removeEventListener("resize", onClose);
    };
  }, [x, y, onClose]);

  return createPortal(
    <div
      ref={box}
      role="menu"
      style={{ left: pos.left, top: pos.top }}
      className="fixed z-[300] min-w-56 overflow-hidden rounded-xl border border-line bg-panel py-1 text-sm shadow-2xl shadow-black/40"
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) =>
        item === "divider" ? (
          <div key={i} className="my-1 border-t border-line" />
        ) : item.href ? (
          <a
            key={i}
            role="menuitem"
            href={item.href}
            target={item.newTab ? "_blank" : undefined}
            rel={item.newTab ? "noopener noreferrer" : undefined}
            onClick={onClose}
            className={`flex w-full items-center gap-3 px-4 py-2 text-left outline-none hover:bg-foreground/[.06] focus:bg-foreground/[.06] ${item.danger ? "text-danger" : ""}`}
          >
            <span className="w-4 text-center" aria-hidden="true">{item.icon}</span>
            {item.label}
          </a>
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              item.onSelect?.();
            }}
            className={`flex w-full items-center gap-3 px-4 py-2 text-left outline-none hover:bg-foreground/[.06] focus:bg-foreground/[.06] ${item.danger ? "text-danger hover:bg-danger/10" : ""}`}
          >
            <span className="w-4 text-center" aria-hidden="true">{item.icon}</span>
            {item.label}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}

/**
 * Right-click (or press and hold on a phone) to open a menu where you are.
 * Returns props to spread on the element, and the menu to render.
 */
export function useContextMenu(items: () => MenuItem[]) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const hold = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  const close = useCallback(() => setAt(null), []);

  const onContextMenu = (e: ReactMouseEvent) => {
    // Inside the video player, its own controls take over.
    if ((e.target as HTMLElement).closest("[data-no-menu], input, textarea")) return;
    e.preventDefault();
    setAt({ x: e.clientX, y: e.clientY });
  };
  const onTouchStart = (e: ReactTouchEvent) => {
    if ((e.target as HTMLElement).closest("[data-no-menu], input, textarea")) return;
    const t = e.touches[0];
    hold.current = { x: t.clientX, y: t.clientY, timer: setTimeout(() => setAt({ x: t.clientX, y: t.clientY }), 550) };
  };
  const cancelHold = (e?: ReactTouchEvent) => {
    if (!hold.current) return;
    if (e && e.type === "touchmove") {
      const t = e.touches[0];
      if (Math.abs(t.clientX - hold.current.x) < 10 && Math.abs(t.clientY - hold.current.y) < 10) return;
    }
    clearTimeout(hold.current.timer);
    hold.current = null;
  };

  return {
    props: { onContextMenu, onTouchStart, onTouchMove: cancelHold, onTouchEnd: () => cancelHold(), onTouchCancel: () => cancelHold() },
    menu: at ? <MenuAt x={at.x} y={at.y} items={items()} onClose={close} /> : null,
    open: (x: number, y: number) => setAt({ x, y }),
  };
}

/** Copies text, with a fallback for older browsers. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function ContextArea({ items, children, className }: { items: () => MenuItem[]; children: ReactNode; className?: string }) {
  const { props, menu } = useContextMenu(items);
  return (
    <div {...props} className={className}>
      {children}
      {menu}
    </div>
  );
}
