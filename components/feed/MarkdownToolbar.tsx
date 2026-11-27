"use client";

import type { RefObject } from "react";

type Tool = { label: string; title: string; run: (t: HTMLTextAreaElement) => [string, number, number] };

/** Wraps the selection (or a placeholder word) in markers like ** **. */
const wrap = (before: string, after: string, placeholder: string) => (t: HTMLTextAreaElement): [string, number, number] => {
  const { selectionStart: a, selectionEnd: b, value } = t;
  const inner = value.slice(a, b) || placeholder;
  const next = value.slice(0, a) + before + inner + after + value.slice(b);
  return [next, a + before.length, a + before.length + inner.length];
};

/** Starts each selected line (or the current line) with a prefix like "> " or "- ". */
const prefix = (make: (i: number) => string) => (t: HTMLTextAreaElement): [string, number, number] => {
  const { selectionStart: a, selectionEnd: b, value } = t;
  const start = value.lastIndexOf("\n", a - 1) + 1;
  const endAt = value.indexOf("\n", b);
  const end = endAt === -1 ? value.length : endAt;
  const block = value.slice(start, end).split("\n").map((l, i) => make(i) + l).join("\n");
  const next = value.slice(0, start) + block + value.slice(end);
  return [next, start, start + block.length];
};

const TOOLS: Tool[] = [
  { label: "B", title: "Bold", run: wrap("**", "**", "bold") },
  { label: "I", title: "Italic", run: wrap("*", "*", "italic") },
  { label: "S", title: "Strikethrough", run: wrap("~~", "~~", "struck") },
  { label: "H", title: "Heading", run: prefix(() => "## ") },
  { label: "❝", title: "Quote", run: prefix(() => "> ") },
  { label: "•", title: "Bulleted list", run: prefix(() => "- ") },
  { label: "1.", title: "Numbered list", run: prefix((i) => `${i + 1}. `) },
  { label: "</>", title: "Code", run: wrap("`", "`", "code") },
  { label: "🔗", title: "Link", run: wrap("[", "](https://)", "link text") },
  { label: "▒", title: "Spoiler (hidden until tapped)", run: wrap("||", "||", "spoiler") },
];

/** Formatting buttons for a post box; they write Markdown into the text. */
export function MarkdownToolbar({ target, onChange }: { target: RefObject<HTMLTextAreaElement | null>; onChange: (value: string) => void }) {
  return (
    <div className="flex min-w-0 flex-1 flex-wrap gap-0.5" role="toolbar" aria-label="Formatting">
      {TOOLS.map((tool) => (
        <button
          key={tool.title}
          type="button"
          title={tool.title}
          aria-label={tool.title}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const t = target.current;
            if (!t) return;
            const [value, selStart, selEnd] = tool.run(t);
            onChange(value);
            requestAnimationFrame(() => {
              t.focus();
              t.setSelectionRange(selStart, selEnd);
            });
          }}
          className={`flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg px-1.5 text-sm text-muted hover:bg-foreground/[.07] hover:text-foreground ${
            tool.label === "B" ? "font-bold" : tool.label === "I" ? "italic" : tool.label === "S" ? "line-through" : ""
          }`}
        >
          {tool.label}
        </button>
      ))}
    </div>
  );
}
