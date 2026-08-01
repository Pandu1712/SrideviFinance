import * as React from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

interface CustomDatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void; // YYYY-MM-DD
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}

export function CustomDatePicker({ 
  value, 
  onChange, 
  className, 
  placeholder = "DD-MM-YYYY", 
  disabled = false 
}: CustomDatePickerProps) {
  // Store the raw text typed by user
  const [inputValue, setInputValue] = React.useState("");
  const [isOpen, setIsOpen] = React.useState(false);

  // Sync internal text input when the parent value changes
  React.useEffect(() => {
    if (value) {
      const dateParts = value.split("-");
      if (dateParts.length === 3) {
        // Format as DD-MM-YYYY
        setInputValue(`${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`);
      }
    } else {
      setInputValue("");
    }
  }, [value]);

  // Handle typing inside textbox
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    
    // Check if this is a deletion (backspace)
    const isDeletion = text.length < inputValue.length;

    // Remove all non-digits
    const clean = text.replace(/\D/g, "");
    
    let formatted = "";
    if (clean.length > 0) {
      if (clean.length <= 2) {
        formatted = clean;
        // If they just typed 2 digits and it's NOT a deletion, append '-'
        if (clean.length === 2 && !isDeletion) {
          formatted += "-";
        }
      } else if (clean.length <= 4) {
        formatted = `${clean.slice(0, 2)}-${clean.slice(2)}`;
        // If they just typed 4 digits and it's NOT a deletion, append '-'
        if (clean.length === 4 && !isDeletion) {
          formatted += "-";
        }
      } else {
        formatted = `${clean.slice(0, 2)}-${clean.slice(2, 4)}-${clean.slice(4, 8)}`;
      }
    }

    setInputValue(formatted);

    // Parse standard formats: DD-MM-YYYY
    const dmyRegex = /^(\d{1,2})-(\d{1,2})-(\d{4})$/;
    const dmyMatch = formatted.match(dmyRegex);
    if (dmyMatch) {
      const d = parseInt(dmyMatch[1], 10);
      const m = parseInt(dmyMatch[2], 10) - 1; // months are 0-indexed in JS Date
      const y = parseInt(dmyMatch[3], 10);
      const temp = new Date(y, m, d);
      if (temp.getFullYear() === y && temp.getMonth() === m && temp.getDate() === d) {
        const year = temp.getFullYear();
        const month = String(temp.getMonth() + 1).padStart(2, "0");
        const day = String(temp.getDate()).padStart(2, "0");
        onChange(`${year}-${month}-${day}`);
      }
    }
  };

  // Format the text input nicely on blur
  const handleBlur = () => {
    if (value) {
      const dateParts = value.split("-");
      setInputValue(`${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`);
    } else {
      setInputValue("");
    }
  };

  // Convert YYYY-MM-DD to Date object for react-day-picker
  const selectedDate = value ? new Date(value) : undefined;

  return (
    <div className={cn(
      "relative flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm px-3 py-1 gap-2 focus-within:ring-1 focus-within:ring-primary/20", 
      disabled && "opacity-60 cursor-not-allowed",
      className
    )}>
      <Popover open={isOpen} onOpenChange={disabled ? undefined : setIsOpen}>
        <PopoverTrigger asChild>
          <button 
            type="button" 
            disabled={disabled}
            className="text-slate-400 hover:text-primary transition-colors focus:outline-none disabled:cursor-not-allowed"
          >
            <CalendarIcon className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 rounded-2xl border-none shadow-2xl z-[9999]" align="start">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(date) => {
              if (date) {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, "0");
                const day = String(date.getDate()).padStart(2, "0");
                onChange(`${year}-${month}-${day}`);
              }
              setIsOpen(false);
            }}
            initialFocus
          />
        </PopoverContent>
      </Popover>
      <Input
        type="text"
        disabled={disabled}
        value={inputValue}
        onChange={handleInputChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        className="border-none bg-transparent p-0 h-7 text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none w-[110px] disabled:cursor-not-allowed"
      />
    </div>
  );
}
