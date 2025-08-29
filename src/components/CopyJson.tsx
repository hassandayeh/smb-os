"use client";

import { useState } from "react";

export default function CopyJson({ text, targetId }: { text: string; targetId?: string }) {
  const [msg, setMsg] = useState("Copies the JSON below to clipboard");

  async function handleCopy() {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setMsg("Copied!");
      setTimeout(() => setMsg("Copies the JSON below to clipboard"), 1500);
    } catch {
      setMsg("Copy failed");
      setTimeout(() => setMsg("Copies the JSON below to clipboard"), 1500);
    }
  }

  return (
    <div className="mb-3 flex items-center gap-2">
      <button
        type="button"
        onClick={handleCopy}
        className="rounded-md bg-black px-3 py-1.5 text-white text-sm hover:opacity-90"
        aria-describedby={targetId ? `${targetId}-hint` : undefined}
      >
        Copy JSON
      </button>
      <span id={targetId ? `${targetId}-hint` : undefined} className="text-xs text-gray-500">
        {msg}
      </span>
    </div>
  );
}
