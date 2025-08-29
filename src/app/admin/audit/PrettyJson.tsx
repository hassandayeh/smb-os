"use client";

import { useMemo, useState } from "react";

export default function PrettyJson({ value }: { value: unknown }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const text = useMemo(() => {
    try {
      const obj = typeof value === "string" ? JSON.parse(value) : value;
      return JSON.stringify(obj, null, 2);
    } catch {
      return String(value ?? "");
    }
  }, [value]);

  async function copy() {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback: create a temporary textarea
        const el = document.createElement("textarea");
        el.value = text;
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // swallow; no-op if denied
    }
  }

  return (
    <div className="rounded-lg border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <span className="text-sm font-medium">metaJson</span>
        <div className="flex items-center gap-3">
          <button onClick={copy} className="text-sm underline">
            {copied ? "Copied!" : "Copy"}
          </button>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-sm underline"
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>
      <pre
        className={`max-w-full overflow-auto p-3 text-xs ${
          expanded ? "max-h-[60vh]" : "max-h-40"
        }`}
      >
        {text || "—"}
      </pre>
    </div>
  );
}
