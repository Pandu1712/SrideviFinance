import React, { createContext, useContext, useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { useAuth } from "./AuthContext";


interface Line {
  id: string;
  name: string;
  number: string;
  createdAt: string;
}

interface LineContextType {
  selectedLineId: string | null; // null means 'Full Dashboard'
  setSelectedLineId: (id: string | null) => void;
  lines: Line[];
  loadingLines: boolean;
  hasSelectedOnce: boolean;
}

const LineContext = createContext<LineContextType | null>(null);

export const useLine = () => {
  const ctx = useContext(LineContext);
  if (!ctx) throw new Error("useLine must be used within LineProvider");
  return ctx;
};

export const LineProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedLineId, setSelectedLineIdState] = useState<string | null>(
    localStorage.getItem("selectedLineId") || null
  );
  const [lines, setLines] = useState<Line[]>([]);
  const [loadingLines, setLoadingLines] = useState(true);
  const [hasSelectedOnce, setHasSelectedOnce] = useState(!!localStorage.getItem("lineSelectedOnce"));

  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      setLines([]);
      setLoadingLines(false);
      return;
    }

    const q = query(collection(db, "lines"), orderBy("name"));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Line));
      setLines(list);
      setLoadingLines(false);
    }, (error) => {
      console.error("Line fetch failed:", error);
      setLoadingLines(false);
    });
    return unsub;
  }, [user]);


  const setSelectedLineId = (id: string | null) => {
    setSelectedLineIdState(id);
    localStorage.setItem("lineSelectedOnce", "true");
    setHasSelectedOnce(true);
    if (id) {
      localStorage.setItem("selectedLineId", id);
    } else {
      localStorage.removeItem("selectedLineId");
    }
  };

  return (
    <LineContext.Provider value={{ selectedLineId, setSelectedLineId, lines, loadingLines, hasSelectedOnce }}>
      {children}
    </LineContext.Provider>
  );
};
