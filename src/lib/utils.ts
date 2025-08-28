import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** cn: merge Tailwind class names safely */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
