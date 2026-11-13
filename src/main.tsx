import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Global enhancement: ensure clicking anywhere on a date input or calendar icon triggers showPicker()
if (typeof window !== "undefined") {
  window.addEventListener(
    "click",
    (e) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // 1. Direct click on date input
      if (target instanceof HTMLInputElement && target.type === "date") {
        if (!target.readOnly && !target.disabled) {
          try {
            target.showPicker?.();
          } catch {}
        }
        return;
      }

      // 2. Click on a calendar icon or wrapper associated with a date input
      const container = target.closest(".relative, .group");
      if (container) {
        const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement | null;
        if (dateInput && !dateInput.readOnly && !dateInput.disabled) {
          try {
            dateInput.showPicker?.();
          } catch {}
        }
      }
    },
    true
  );
}

createRoot(document.getElementById("root")!).render(<App />);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.log('SW registration failed: ', err);
    });
  });
}
