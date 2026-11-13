import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { scrollToTop } from "@/lib/utils";

export default function ScrollToTop() {
  const { pathname, search, key } = useLocation();

  useEffect(() => {
    // Instant scroll to top on any route or parameter change
    scrollToTop("instant");

    // Double-check on next animation frame and after small timeout for async/animated components
    const r1 = requestAnimationFrame(() => scrollToTop("instant"));
    const t1 = setTimeout(() => scrollToTop("instant"), 50);
    const t2 = setTimeout(() => scrollToTop("instant"), 150);

    return () => {
      cancelAnimationFrame(r1);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [pathname, search, key]);

  return null;
}

