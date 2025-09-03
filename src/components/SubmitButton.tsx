"use client";

import { useFormStatus } from "react-dom";
import { ReactNode } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";

export default function SubmitButton({
  children,
  pendingLabel = "Saving…",
  className = "",
  variant,
  size,
}: {
  children: ReactNode;
  pendingLabel?: string;
  className?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      className={className}
      variant={variant}
      size={size}
      disabled={pending}
      aria-busy={pending || undefined}
    >
      {pending ? pendingLabel : children}
    </Button>
  );
}
