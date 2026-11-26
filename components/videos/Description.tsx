"use client";

import { useState } from "react";

/** The description box under a video: a few lines, with "more" to expand. */
export function Description({ meta, text }: { meta: string; text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 280 || text.split("\n").length > 4;
  return (
    <div className="rounded-xl bg-foreground/[.06] p-3 text-sm">
      <p className="font-medium">{meta}</p>
      {text ? (
        <p className={`mt-1 whitespace-pre-wrap break-words ${open || !long ? "" : "line-clamp-4"}`}>{text}</p>
      ) : (
        <p className="mt-1 text-muted">No description.</p>
      )}
      {long && (
        <button type="button" onClick={() => setOpen(!open)} className="mt-1 font-medium">
          {open ? "Show less" : "…more"}
        </button>
      )}
    </div>
  );
}
