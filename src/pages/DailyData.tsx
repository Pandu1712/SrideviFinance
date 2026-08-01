import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLine } from "@/contexts/LineContext";
import { db } from "@/lib/firebase";
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, where } from "firebase/firestore";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { BookOpen, Calendar as CalendarIcon, ArrowLeftRight, Trash2, Edit2, PlayCircle, Plus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const formatToDDMMYY = (dateStr: any) => {
  if (!dateStr) return "-";
  try {
    const dObj = new Date(dateStr);
    if (!isNaN(dObj.getTime())) {
      const day = String(dObj.getDate()).padStart(2, "0");
      const month = String(dObj.getMonth() + 1).padStart(2, "0");
      const year = String(dObj.getFullYear()).slice(2);
      return `${day}-${month}-${year}`;
    }
  } catch (e) {}
  return String(dateStr);
};

const DailyData = () => {
  const navigate = useNavigate();
  const { selectedLineId, lines } = useLine();
  const { userData } = useAuth();
  
  const currentLine = lines.find(l => l.id === selectedLineId);
  const lineName = currentLine ? currentLine.name : "GENERAL";

  // Data states
  const [postings, setPostings] = useState<any[]>([]);
  const [ledgerAccounts, setLedgerAccounts] = useState<any[]>([]);
  const [allLinePostings, setAllLinePostings] = useState<any[]>([]);

  // Selection/Form states
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [postingDate, setPostingDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedPosting, setSelectedPosting] = useState<any | null>(null);
  const [targetAccount, setTargetAccount] = useState<any | null>(null);
  const [jamaVal, setJamaVal] = useState("");
  const [kharchuVal, setKharchuVal] = useState("");

  // Fetch accounts of line
  useEffect(() => {
    if (!selectedLineId) return;
    const q = query(
      collection(db, "ledger_accounts"),
      where("lineId", "==", selectedLineId)
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      list.sort((a, b) => (parseInt(a.acNo) || 0) - (parseInt(b.acNo) || 0));
      setLedgerAccounts(list);
      if (list.length > 0 && !targetAccount) {
        setTargetAccount(list[0]);
      }
    });
    return () => unsubscribe();
  }, [selectedLineId]);

  // Sync postings for selected date
  useEffect(() => {
    if (!selectedLineId || !selectedDate) return;
    const q = query(
      collection(db, "ledger_postings"),
      where("lineId", "==", selectedLineId),
      where("date", "==", selectedDate)
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setPostings(list);
    });
    return () => unsubscribe();
  }, [selectedLineId, selectedDate]);

  // Sync all postings for cash balance calculation
  useEffect(() => {
    if (!selectedLineId) return;
    const q = query(
      collection(db, "ledger_postings"),
      where("lineId", "==", selectedLineId)
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setAllLinePostings(list);
    });
    return () => unsubscribe();
  }, [selectedLineId]);

  // Calculate opening/closing balances based on date comparison
  const { openingBalance, closingBalance } = useMemo(() => {
    let opening = 0;
    let closing = 0;

    allLinePostings.forEach(p => {
      const pDate = p.date || "";
      const pJama = parseFloat(p.jama) || 0;
      const pKharchu = parseFloat(p.kharchu) || 0;
      const val = pJama - pKharchu;

      if (pDate < selectedDate) {
        opening += val;
      }
      if (pDate <= selectedDate) {
        closing += val;
      }
    });

    return { openingBalance: opening, closingBalance: closing };
  }, [allLinePostings, selectedDate]);

  // Merge postings with account details
  const displayPostings = useMemo(() => {
    return postings.map(p => {
      const acc = ledgerAccounts.find(a => a.id === p.ledgerId);
      return {
        ...p,
        acNo: acc?.acNo || "-",
        acName: acc?.acName || "Unknown Account"
      };
    }).sort((a, b) => (parseInt(a.acNo) || 0) - (parseInt(b.acNo) || 0));
  }, [postings, ledgerAccounts]);

  const handleSavePosting = async () => {
    if (!targetAccount) {
      toast.error("Please select a ledger account first.");
      return;
    }
    const jama = parseFloat(jamaVal) || 0;
    const kharchu = parseFloat(kharchuVal) || 0;
    if (jama <= 0 && kharchu <= 0) {
      toast.error("Please enter a valid Jama or Kharchu amount.");
      return;
    }

    try {
      if (selectedPosting) {
        // Update existing posting
        const docRef = doc(db, "ledger_postings", selectedPosting.id);
        await updateDoc(docRef, {
          ledgerId: targetAccount.id,
          jama,
          kharchu,
          date: postingDate
        });
        toast.success("Transaction updated successfully!");
        setSelectedPosting(null);
      } else {
        // Create new posting
        const payload = {
          ledgerId: targetAccount.id,
          date: postingDate,
          jama,
          kharchu,
          description: "Manual Entry",
          lineId: selectedLineId || ""
        };
        await addDoc(collection(db, "ledger_postings"), payload);
        toast.success("Transaction saved successfully!");
      }
      setJamaVal("");
      setKharchuVal("");
    } catch (err) {
      toast.error("Failed to save transaction");
    }
  };

  const handleDeletePosting = async () => {
    if (!selectedPosting) return;
    try {
      await deleteDoc(doc(db, "ledger_postings", selectedPosting.id));
      toast.success("Transaction deleted!");
      setSelectedPosting(null);
      setJamaVal("");
      setKharchuVal("");
    } catch (err) {
      toast.error("Failed to delete transaction");
    }
  };

  const handleSelectRow = (p: any) => {
    setSelectedPosting(p);
    setPostingDate(p.date || selectedDate);
    setJamaVal(p.jama ? p.jama.toString() : "");
    setKharchuVal(p.kharchu ? p.kharchu.toString() : "");
    const acc = ledgerAccounts.find(a => a.id === p.ledgerId);
    if (acc) {
      setTargetAccount(acc);
    }
  };

  const handleClear = () => {
    setSelectedPosting(null);
    setJamaVal("");
    setKharchuVal("");
    if (ledgerAccounts.length > 0) {
      setTargetAccount(ledgerAccounts[0]);
    }
  };

  const handleGetDate = () => {
    setSelectedDate(postingDate);
    toast.success(`Loaded transactions for ${formatToDDMMYY(postingDate)}`);
  };

  // Double-entry calculation aggregates for bottom summary footer
  const totalJama = useMemo(() => displayPostings.reduce((s, p) => s + (parseFloat(p.jama) || 0), 0), [displayPostings]);
  const totalKharchu = useMemo(() => displayPostings.reduce((s, p) => s + (parseFloat(p.kharchu) || 0), 0), [displayPostings]);

  const cumCR = useMemo(() => (openingBalance >= 0 ? openingBalance : 0) + totalJama, [openingBalance, totalJama]);
  const cumDR = useMemo(() => (openingBalance < 0 ? Math.abs(openingBalance) : 0) + totalKharchu, [openingBalance, totalKharchu]);
  const netDiff = useMemo(() => cumCR - cumDR, [cumCR, cumDR]);

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 font-sans antialiased pb-12">
      
      {/* Header Banner */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex justify-between items-center print:hidden">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-amber-500 rounded-lg flex items-center justify-center font-serif text-slate-950 font-black text-xl shadow-lg">
            ₹
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight text-white">SriDeviGroups Of Finance</h1>
            <p className="text-[10px] text-amber-500 uppercase tracking-widest font-bold">Enterprise Hub</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-slate-950/60 border border-slate-800/80 px-4 py-1.5 rounded-full text-xs font-bold text-slate-400">
          <CalendarIcon className="h-3.5 w-3.5 text-amber-500" />
          <span>DATE: {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-2 sm:p-6">
        
        {/* Retro monitor style cabinet */}
        <div className="w-full max-w-5xl bg-[#091515] border-[6px] border-double border-amber-500/80 rounded-[2.5rem] p-4 sm:p-6 shadow-[0_0_50px_rgba(245,158,11,0.15)] relative overflow-hidden flex flex-col min-h-[38rem]">
          
          {/* Corner symbols */}
          <div className="absolute top-4 left-4 text-amber-500/30 text-xl font-serif">卐</div>
          <div className="absolute top-4 right-4 text-amber-500/30 text-xl font-serif">卐</div>
          <div className="absolute bottom-4 left-4 text-amber-500/30 text-xl font-serif">卐</div>
          <div className="absolute bottom-4 right-4 text-amber-500/30 text-xl font-serif">卐</div>

          {/* Title Header */}
          <div className="text-center mb-4 border-b border-amber-500/20 pb-2 flex justify-between items-center px-4">
            <h2 className="text-lg sm:text-xl font-bold tracking-widest text-amber-500 font-serif animate-pulse">
              {lineName.toUpperCase()} DAILY DATA ENTRY
            </h2>
            <span className="text-[10px] text-slate-500 tracking-wider">Sri Devi Groups</span>
          </div>

          {/* Date Selector Row */}
          <div className="bg-zinc-300 border-2 border-t-white border-l-white border-r-zinc-600 border-b-zinc-600 p-3 rounded-md shadow-md mb-4 flex flex-wrap items-center justify-between gap-3 text-slate-900 font-bold">
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wider text-slate-800">DATE:</span>
              <input
                type="date"
                value={postingDate}
                onChange={e => setPostingDate(e.target.value)}
                className="bg-white px-2 py-1 border-2 border-t-zinc-600 border-l-zinc-600 border-r-white border-b-white rounded font-mono text-xs"
              />
              <button
                type="button"
                onClick={handleGetDate}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 px-3 py-1 border-2 border-t-white border-l-white border-r-amber-700 border-b-amber-700 rounded text-xs uppercase tracking-wider shadow"
              >
                GET
              </button>
            </div>
            
            <button
              type="button"
              onClick={() => navigate("/accounts")}
              className="bg-zinc-200 hover:bg-zinc-100 text-slate-800 px-3 py-1 border-2 border-t-white border-l-white border-r-zinc-500 border-b-zinc-500 rounded text-xs uppercase tracking-wider"
            >
              Add Accounts
            </button>
          </div>

          {/* Two Section Layout: Top Table, Bottom Form */}
          <div className="flex-1 flex flex-col gap-4 text-slate-950 font-sans text-xs">
            
            {/* Table Panel */}
            <div className="flex-1 bg-zinc-300 border-2 border-t-white border-l-white border-r-zinc-600 border-b-zinc-600 p-3 sm:p-4 rounded-md shadow-2xl flex flex-col justify-between h-[20rem]">
              
              {/* Central Grid */}
              <div className="flex-1 bg-white border border-zinc-400 rounded-sm overflow-hidden flex flex-col h-full">
                
                {/* Headers */}
                <div className="bg-zinc-100 border-b border-zinc-300 grid grid-cols-12 px-2 py-1.5 font-bold text-[10px] text-slate-600 text-center">
                  <span className="col-span-3">CR</span>
                  <span className="col-span-2">ACNO</span>
                  <span className="col-span-4">ACNAME</span>
                  <span className="col-span-3">DR</span>
                </div>

                {/* Table Scrollable Body */}
                <div className="flex-1 overflow-y-auto custom-scrollbar font-mono text-[10px]">
                  
                  {/* Row 1: Opening Balance Row */}
                  <div className="grid grid-cols-12 px-2 py-2 text-center border-b border-zinc-300 bg-zinc-100 font-black">
                    <span className="col-span-3 text-slate-900">{openingBalance >= 0 ? `₹${openingBalance.toFixed(2)}` : "-"}</span>
                    <span className="col-span-6 text-center text-slate-800 tracking-wider">Opening Balance</span>
                    <span className="col-span-3 text-slate-900">{openingBalance < 0 ? `₹${Math.abs(openingBalance).toFixed(2)}` : "-"}</span>
                  </div>

                  {/* Transaction Rows */}
                  {displayPostings.length === 0 ? (
                    <p className="text-slate-400 text-center py-10 italic">No manual entries on this date</p>
                  ) : (
                    displayPostings.map((p, idx) => (
                      <div
                        key={idx}
                        onClick={() => handleSelectRow(p)}
                        className={`grid grid-cols-12 px-2 py-1.5 text-center border-b border-zinc-100 hover:bg-zinc-200 cursor-pointer select-none transition-colors ${
                          selectedPosting?.id === p.id ? "bg-amber-100 font-black border-l-4 border-amber-500" : ""
                        }`}
                      >
                        <span className="col-span-3 text-emerald-700 font-bold">{p.jama > 0 ? `₹${p.jama}` : "-"}</span>
                        <span className="col-span-2 font-black text-slate-600">{p.acNo}</span>
                        <span className="col-span-4 truncate text-left font-sans">{p.acName}</span>
                        <span className="col-span-3 text-red-700 font-bold">{p.kharchu > 0 ? `₹${p.kharchu}` : "-"}</span>
                      </div>
                    ))
                  )}

                </div>

                {/* Double Entry Summary Footer Blocks matching legacy screenshots */}
                <div className="bg-zinc-100 border-t border-zinc-300 font-mono text-[10px] font-bold text-slate-700 divide-y divide-zinc-200">
                  
                  {/* Row 1: Transaction Total */}
                  <div className="grid grid-cols-12 px-2 py-1.5 text-center">
                    <span className="col-span-3 text-emerald-700">{totalJama > 0 ? `₹${totalJama.toFixed(2)}` : "-"}</span>
                    <span className="col-span-6 text-slate-500 uppercase tracking-widest text-[9px] text-center">Transaction Total</span>
                    <span className="col-span-3 text-red-700">{totalKharchu > 0 ? `₹${totalKharchu.toFixed(2)}` : "-"}</span>
                  </div>

                  {/* Row 2: Cumulative Subtotal */}
                  <div className="grid grid-cols-12 px-2 py-1.5 text-center bg-zinc-200/40">
                    <span className="col-span-3 text-slate-900">{cumCR > 0 ? `₹${cumCR.toFixed(2)}` : "-"}</span>
                    <span className="col-span-6 text-slate-500 uppercase tracking-widest text-[9px] text-center">Cumulative Subtotal</span>
                    <span className="col-span-3 text-slate-900">{cumDR > 0 ? `₹${cumDR.toFixed(2)}` : "-"}</span>
                  </div>

                  {/* Row 3: Closing Balance Row (Splits cash dynamically to CR or DR column) */}
                  <div className="grid grid-cols-12 px-2 py-2 text-center bg-amber-50 font-black border-t border-zinc-300">
                    <span className="col-span-3 text-emerald-700">{netDiff >= 0 ? `₹${netDiff.toFixed(2)}` : "-"}</span>
                    <span className="col-span-6 text-center text-slate-800 tracking-wider">Closing Balance</span>
                    <span className="col-span-3 text-red-700">{netDiff < 0 ? `₹${Math.abs(netDiff).toFixed(2)}` : "-"}</span>
                  </div>

                </div>

              </div>

            </div>

            {/* Bottom Form and Bevel Buttons Controls */}
            <div className="bg-zinc-300 border-2 border-t-white border-l-white border-r-zinc-600 border-b-zinc-600 p-3 sm:p-4 rounded-md shadow-2xl flex flex-col md:flex-row gap-4 items-center justify-between">
              
              {/* Form Input fields */}
              <div className="w-full md:flex-1 grid grid-cols-1 sm:grid-cols-4 gap-3 items-center">
                
                <div className="flex flex-col gap-1 col-span-2">
                  <Label className="font-bold text-slate-800">Select Ledger Account</Label>
                  <select
                    value={targetAccount?.id || ""}
                    onChange={e => {
                      const acc = ledgerAccounts.find(a => a.id === e.target.value);
                      if (acc) setTargetAccount(acc);
                    }}
                    className="w-full bg-white px-2 py-1 border-2 border-t-zinc-600 border-l-zinc-600 border-r-white border-b-white rounded font-bold text-xs"
                  >
                    {ledgerAccounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.acNo} - {acc.acName} ({acc.acType})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <Label className="font-bold text-slate-800 text-center">JAMA (CR)</Label>
                  <input
                    type="number"
                    value={jamaVal}
                    onChange={e => setJamaVal(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-white px-2 py-1 border-2 border-t-zinc-600 border-l-zinc-600 border-r-white border-b-white rounded font-mono font-bold text-xs text-center focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <Label className="font-bold text-slate-800 text-center">KHARCHU (DR)</Label>
                  <input
                    type="number"
                    value={kharchuVal}
                    onChange={e => setKharchuVal(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-white px-2 py-1 border-2 border-t-zinc-600 border-l-zinc-600 border-r-white border-b-white rounded font-mono font-bold text-xs text-center focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>

              </div>

              {/* Action Buttons list (Bevel details) */}
              <div className="flex flex-wrap md:flex-nowrap gap-1.5 w-full md:w-auto pt-2 md:pt-0">
                <button
                  type="button"
                  onClick={handleSavePosting}
                  className="flex-1 md:flex-none px-4 py-2 bg-[#a7f3d0] hover:bg-[#86efac] text-emerald-950 border-2 border-t-white border-l-white border-r-zinc-600 border-b-zinc-600 font-bold uppercase text-[10px] tracking-wider shadow shadow-inner active:border-t-zinc-600 active:border-l-zinc-600 active:border-r-white active:border-b-white transition-all whitespace-nowrap"
                >
                  {selectedPosting ? "SAVE / UPDATE" : "SAVE"}
                </button>

                {selectedPosting && (
                  <button
                    type="button"
                    onClick={handleDeletePosting}
                    className="flex-1 md:flex-none px-4 py-2 bg-red-200 hover:bg-red-300 text-red-950 border-2 border-t-white border-l-white border-r-zinc-600 border-b-zinc-600 font-bold uppercase text-[10px] tracking-wider active:border-t-zinc-600 active:border-l-zinc-600 active:border-r-white active:border-b-white transition-all"
                  >
                    DELETE
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleClear}
                  className="flex-1 md:flex-none px-4 py-2 bg-zinc-300 hover:bg-zinc-200 text-slate-800 border-2 border-t-white border-l-white border-r-zinc-600 border-b-zinc-600 font-bold uppercase text-[10px] tracking-wider active:border-t-zinc-600 active:border-l-zinc-600 active:border-r-white active:border-b-white transition-all"
                >
                  CLEAR
                </button>

                <button
                  type="button"
                  onClick={() => navigate("/dashboard")}
                  className="flex-1 md:flex-none px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 border-2 border-t-white border-l-white border-r-amber-700 border-b-amber-700 font-bold uppercase text-[10px] tracking-wider active:border-t-amber-700 active:border-l-amber-700 active:border-r-white active:border-b-white transition-all"
                >
                  MAIN MENU
                </button>
              </div>

            </div>

          </div>

        </div>

      </div>

    </div>
  );
};

export default DailyData;
