import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.ComponentProps<"input"> {
  validation?: "phone" | "name" | "amount" | "aadhaar" | "pincode" | "number" | "text" | "none";
}

const cleanPhoneValue = (raw: string): string => {
  let digits = raw.replace(/\D/g, "");
  // If someone pasted an Indian number with 91 or 0 prefix
  if (digits.length === 12 && digits.startsWith("91")) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  return digits.slice(0, 10);
};

const sanitizeValue = (raw: string, type: string): string => {
  if (!raw) return raw;
  switch (type) {
    case "phone":
      return cleanPhoneValue(raw);
    case "aadhaar":
      return raw.replace(/\D/g, "").slice(0, 12);
    case "pincode":
      return raw.replace(/\D/g, "").slice(0, 6);
    case "number":
      return raw.replace(/\D/g, "");
    case "name":
      // English letters, spaces, dots, hyphens, apostrophes, parentheses, and Telugu unicode range (\u0C00-\u0C7F)
      return raw.replace(/[^a-zA-Z\s.()'\u0C00-\u0C7F-]/g, "");
    case "amount": {
      let cleaned = raw.replace(/[^0-9.]/g, "");
      const parts = cleaned.split(".");
      if (parts.length > 2) {
        cleaned = parts[0] + "." + parts.slice(1).join("");
      }
      return cleaned;
    }
    default:
      return raw;
  }
};

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, onClick, onChange, onKeyDown, onPaste, validation, name, placeholder, inputMode, maxLength, ...props }, ref) => {
    // Infer validation type automatically from name, placeholder, type if not specified
    const inferredValidation = React.useMemo(() => {
      if (validation) return validation;

      const n = (name || "").toLowerCase();
      const p = (placeholder || "").toLowerCase();

      // Explicit non-text/special types to skip
      if (
        type === "email" ||
        type === "password" ||
        type === "date" ||
        type === "file" ||
        type === "checkbox" ||
        type === "radio" ||
        type === "hidden"
      ) {
        return "none";
      }

      // Skip search, addresses, locations, notes, URLs, descriptions
      if (
        n.includes("search") ||
        p.includes("search") ||
        n.includes("address") ||
        n.includes("location") ||
        n.includes("note") ||
        n.includes("desc") ||
        n.includes("url") ||
        n.includes("occupation") ||
        n.includes("doc")
      ) {
        return "none";
      }

      // Phone detection
      if (
        type === "tel" ||
        n.includes("phone") ||
        n.includes("mobile") ||
        p.includes("10-digit") ||
        p.includes("mobile") ||
        p.includes("phone")
      ) {
        return "phone";
      }

      // Aadhaar detection
      if (n.includes("aadhaar") || n.includes("aadhar") || p.includes("aadhaar") || p.includes("aadhar")) {
        return "aadhaar";
      }

      // Pincode detection
      if (n.includes("pincode") || p.includes("pincode") || n.includes("pin_code")) {
        return "pincode";
      }

      // Account number detection
      if (n === "accountno" || n === "account_no") {
        return "number";
      }

      // Name fields detection
      const isNameField =
        n === "name" ||
        n === "nametelugu" ||
        n === "fatherhusbandname" ||
        n === "fatherhusbandnametelugu" ||
        n === "guarantorname" ||
        n === "nomineename" ||
        n === "mandalam" ||
        n === "district" ||
        n === "postoffice" ||
        n === "village";
      if (isNameField) return "name";

      // Amount / Currency detection
      if (
        n.includes("amount") ||
        n.includes("charge") ||
        n.includes("balance") ||
        n.includes("interest") ||
        n.includes("principal") ||
        inputMode === "decimal"
      ) {
        return "amount";
      }

      return "none";
    }, [validation, name, placeholder, type, inputMode]);

    // Handle date picker clicks
    const handleClick = (e: React.MouseEvent<HTMLInputElement>) => {
      if (type === "date" && !props.readOnly && !props.disabled) {
        try {
          e.currentTarget.showPicker?.();
        } catch {}
      }
      onClick?.(e);
    };

    // Live keydown intercept to prevent typing invalid characters
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Allow control keys (Backspace, Tab, Delete, Arrow keys, Enter, shortcuts)
      if (
        e.key === "Backspace" ||
        e.key === "Tab" ||
        e.key === "Delete" ||
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === "ArrowUp" ||
        e.key === "ArrowDown" ||
        e.key === "Home" ||
        e.key === "End" ||
        e.key === "Enter" ||
        e.ctrlKey ||
        e.metaKey
      ) {
        onKeyDown?.(e);
        return;
      }

      if (
        inferredValidation === "phone" ||
        inferredValidation === "aadhaar" ||
        inferredValidation === "pincode" ||
        inferredValidation === "number"
      ) {
        // Block non-digits
        if (!/^[0-9]$/.test(e.key)) {
          e.preventDefault();
          return;
        }

        // Limit maximum length on keypress
        const max =
          maxLength ??
          (inferredValidation === "phone" ? 10 : inferredValidation === "aadhaar" ? 12 : inferredValidation === "pincode" ? 6 : undefined);

        if (max && e.currentTarget.value.length >= max) {
          const selStart = e.currentTarget.selectionStart ?? 0;
          const selEnd = e.currentTarget.selectionEnd ?? 0;
          if (selStart === selEnd) {
            e.preventDefault();
            return;
          }
        }
      } else if (inferredValidation === "name") {
        // Block digits and unwanted symbols
        if (/^[0-9!@#$%^&*_+={}\[\]:;"'<>?\/\\~`]$/.test(e.key)) {
          e.preventDefault();
          return;
        }
      } else if (inferredValidation === "amount") {
        // Allow digits and single decimal dot
        if (e.key === ".") {
          if (e.currentTarget.value.includes(".")) {
            e.preventDefault();
            return;
          }
        } else if (!/^[0-9]$/.test(e.key)) {
          e.preventDefault();
          return;
        }
      }

      onKeyDown?.(e);
    };

    // Live change intercept to sanitize paste / autocomplete / mobile inputs
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (inferredValidation !== "none") {
        const original = e.target.value;
        const sanitized = sanitizeValue(original, inferredValidation);
        if (original !== sanitized) {
          e.target.value = sanitized;
        }
      }
      onChange?.(e);
    };

    // Live paste intercept
    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
      onPaste?.(e);
      if (inferredValidation !== "none") {
        const text = e.clipboardData.getData("text");
        const sanitized = sanitizeValue(text, inferredValidation);
        if (text !== sanitized) {
          e.preventDefault();
          const target = e.currentTarget;
          const start = target.selectionStart ?? 0;
          const end = target.selectionEnd ?? 0;
          const currentVal = target.value;
          const newVal = sanitizeValue(
            currentVal.substring(0, start) + sanitized + currentVal.substring(end),
            inferredValidation
          );
          target.value = newVal;
          // Trigger change event for react-hook-form
          const event = new Event("input", { bubbles: true });
          target.dispatchEvent(event);
        }
      }
    };

    // Effective inputMode & maxLength
    const effectiveInputMode =
      inputMode ??
      (inferredValidation === "phone" || inferredValidation === "aadhaar" || inferredValidation === "pincode" || inferredValidation === "number"
        ? "numeric"
        : inferredValidation === "amount"
        ? "decimal"
        : inferredValidation === "name"
        ? "text"
        : undefined);

    const effectiveMaxLength =
      maxLength ??
      (inferredValidation === "phone" ? 10 : inferredValidation === "aadhaar" ? 12 : inferredValidation === "pincode" ? 6 : undefined);

    return (
      <input
        type={type}
        name={name}
        placeholder={placeholder}
        inputMode={effectiveInputMode}
        maxLength={effectiveMaxLength}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          type === "date" && "cursor-pointer [&::-webkit-calendar-picker-indicator]:cursor-pointer",
          className,
        )}
        ref={ref}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onChange={handleChange}
        onPaste={handlePaste}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
