import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a date to DD-MM-YYYY format
 * @param date - Date object or date string
 * @param separator - Separator character (default: '-')
 * @returns Formatted date string in DD-MM-YYYY format
 */
export function formatDate(date: Date | string, separator: string = '-'): string {
  if (!date) return '';
  if (typeof date === 'string') {
    const cleanDate = date.trim().split('T')[0];
    const parts = cleanDate.split('-');
    if (parts.length === 3 && parts[0].length === 4 && parts[1].length === 2 && parts[2].length === 2) {
      return `${parts[2]}${separator}${parts[1]}${separator}${parts[0]}`;
    }
  }
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return String(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}${separator}${month}${separator}${year}`;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Capitalizes the first letter of each word in a string.
 * @param str - Input string
 * @returns String with each word capitalized
 */
export function capitalizeWords(str: string): string {
  if (!str) return str;
  return str.replace(/\b\w/g, (char) => char.toUpperCase());
}


