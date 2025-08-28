import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * cn: merge Tailwind class strings safely.
 * - clsx: handles conditional classes
 * - tailwind-merge: resolves conflicting Tailwind classes
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
