import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getLocalTimestamp(timezone?: string): string {
  if (!timezone) return new Date().toISOString();
  try {
    const d = new Date();
    const str = d.toLocaleString('sv-SE', { timeZone: timezone, hour12: false });
    return str.replace(' ', 'T');
  } catch {
    return new Date().toISOString();
  }
}
