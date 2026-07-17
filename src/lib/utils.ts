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

export function playSuccessSound() {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    const playBell = (frequency: number, startTime: number, duration: number, volume: number) => {
      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      osc.type = "triangle";
      osc.frequency.setValueAtTime(frequency, startTime);
      osc.frequency.exponentialRampToValueAtTime(frequency * 1.015, startTime + 0.05);

      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.015);
      gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      
      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    const now = audioCtx.currentTime;
    
    // Ascending arpeggio chime (PhonePe/Paytm style)
    playBell(1046.50, now, 0.35, 0.08);        // C6
    playBell(1318.51, now + 0.06, 0.35, 0.08); // E6
    playBell(1567.98, now + 0.12, 0.35, 0.08); // G6
    playBell(2093.00, now + 0.18, 0.55, 0.12); // C7
    
  } catch (error) {
    console.warn("Web Audio API not supported or blocked:", error);
  }
}

export function checkPermission(userData: any, permissionKey: string): boolean {
  if (!userData) return false;
  
  if (userData.role === "super_admin" || userData.role === "admin") {
    return true;
  }
  
  if (userData.permissions && userData.permissions[permissionKey] !== undefined) {
    return !!userData.permissions[permissionKey];
  }
  
  switch (permissionKey) {
    case "canPostPayment":
      return true;
    case "canChangeDate":
      return false;
    case "canCreateAccount":
      return true;
    case "canEditAccount":
      return userData.role === "partner";
    default:
      return false;
  }
}

export function isMenuAllowed(path: string, userData: any, defaultRoles: string[]): boolean {
  if (!userData) return false;
  
  if (userData.role === "super_admin" || userData.role === "admin") {
    return defaultRoles.includes(userData.role);
  }
  
  if (userData.permissions?.allowedMenus) {
    return userData.permissions.allowedMenus.includes(path);
  }
  
  return defaultRoles.includes(userData.role);
}



