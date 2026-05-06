import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | string | undefined | null) {
  if (amount === undefined || amount === null) return "₹0";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(num || 0);
}

export function formatCurrencyPDF(amount: number | string | undefined | null) {
  if (amount === undefined || amount === null) return "Rs 0";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  const val = Math.round(num || 0);
  const formatted = val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `Rs ${formatted}`;
}

export function formatDate(date: any) {
  if (!date) return "-";
  
  try {
    let d: Date;
    // Handle Firebase Timestamp
    if (typeof date.toDate === 'function') {
      d = date.toDate();
    } 
    // Handle Date object
    else if (date instanceof Date) {
      d = date;
    } 
    // Handle string or number
    else {
      d = new Date(date);
    }

    // Safety check for invalid dates
    if (isNaN(d.getTime())) return "-";

    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(d);
  } catch (err) {
    console.error("Date formatting error:", err);
    return "-";
  }
}

export function formatPercent(value: number) {
  return `${value}%`;
}
