"use client";

import { useFormStatus } from "react-dom";
import { ReactNode } from "react";

export default function SubmitButton({
  children,
  pendingLabel = "Saving…",
  className = "",
}: {
  children: ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-md bg-black px-4 py-2 text-white hover:opacity-90 disabled:opacity-60 ${className}`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
