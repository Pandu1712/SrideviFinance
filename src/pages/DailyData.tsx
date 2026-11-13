import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLine } from "@/contexts/LineContext";
import { db } from "@/lib/firebase";
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, where, getDocs } from "firebase/firestore";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Calendar as CalendarIcon, ChevronDown, Check, Search, X, Minus, Square, ExternalLink } from "lucide-react";

const formatToDDMMYY = (dateStr: any) => {
  if (!dateStr) return "-";
  try {
    const dObj = new Date(dateStr);
    if (!isNaN(dObj.getTime())) {
      const day = String(dObj.getDate()).padStart(2, "0");
      const month = String(dObj.getMonth() + 1).padStart(2, "0");
      const year = String(dObj.getFullYear());
      return `${day}-${month}-${year}`;
    }
  } catch (e) {}
  return String(dateStr);
};

const formatAmount = (val: number | string | undefined | null) => {
  const num = typeof val === "number" ? val : parseFloat(val as string);
  if (isNaN(num)) return "0.00";
  return num.toFixed(2);
};

const DailyData = () => {
  const navigate = useNavigate();
  const { selectedLineId, lines } = useLine();
  const { userData } = useAuth();
  
  const currentLine = lines.find(l => l.id === selectedLineId);
  const lineName = currentLine ? currentLine.name : "GENERAL";
  const linePrefix = (lineName.match(/^\d+/)?.[0] || lineName.split(" ")[0] || lineName).toUpperCase();

  // Data states
  const [postings, setPostings] = useState<any[]>([]);
  const [ledgerAccounts, setLedgerAccounts] = useState<any[]>([]);
  const [allLinePostings, setAllLinePostings] = useState<any[]>([]);
  const [linePostings, setLinePostings] = useState<any[]>([]);
  const [lineExpenses, setLineExpenses] = useState<any[]>([]);
  const [lineAccounts, setLineAccounts] = useState<any[]>([]);

  // Selection/Form states
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [postingDate, setPostingDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedPosting, setSelectedPosting] = useState<any | null>(null);
  const [targetAccount, setTargetAccount] = useState<any | null>(null);
  const [jamaVal, setJamaVal] = useState("");
  const [kharchuVal, setKharchuVal] = useState("");

  // Custom Dropdown states
  const [isAccountDropdownOpen, setIsAccountDropdownOpen] = useState(false);
  const [accountSearchTerm, setAccountSearchTerm] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const jamaInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on click outside or escape key
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsAccountDropdownOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsAccountDropdownOpen(false);
      }
    };
    if (isAccountDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isAccountDropdownOpen]);

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
      setTargetAccount((prev: any) => {
        if (prev && list.some(a => a.id === prev.id)) {
          return list.find(a => a.id === prev.id) || prev;
        }
        return list[0] || null;
      });
    });
    return () => unsubscribe();
  }, [selectedLineId]);

  // Seed default 15 accounts if ledger_accounts is empty for this line
  useEffect(() => {
    if (!selectedLineId || ledgerAccounts.length > 0) return;
    const seedDefaultAccounts = async () => {
      try {
        const q = query(collection(db, "ledger_accounts"), where("lineId", "==", selectedLineId));
        const snap = await getDocs(q);
        if (snap.empty) {
          const target15 = [
            { acNo: "0", acName: `LINE ${linePrefix} LAKSHMI DEVI A/C`, acType: "Investment", interestRateMonthly: "0", interestRateDaily: "0", date: "2026-08-01", group: "Investment", category: "Investment", lineId: selectedLineId },
            { acNo: "1", acName: `LINE ${linePrefix} OPENING BALANCE`, acType: "Investment", interestRateMonthly: "0", interestRateDaily: "0", date: "2026-08-01", group: "Investment", category: "Investment", lineId: selectedLineId },
            { acNo: "2", acName: `LINE ${linePrefix} COMMISSION`, acType: "Profit", interestRateMonthly: "0", interestRateDaily: "0", date: "2026-08-01", group: "Indirect Income", category: "Profit", lineId: selectedLineId },
            { acNo: "3", acName: `LINE ${linePrefix} COLLECTION`, acType: "Vaddi", interestRateMonthly: "0", interestRateDaily: "0", date: "2026-08-01", group: "Direct Income", category: "Vaddi", lineId: selectedLineId },
            { acNo: "4", acName: `LINE ${linePrefix} PAYMENT`, acType: "Vaddi", interestRateMonthly: "0", interestRateDaily: "0", date: "2026-08-01", group: "Direct Income", category: "Vaddi", lineId: selectedLineId },
            { acNo: "5", acName: `LINE ${linePrefix} PENALTY`, acType: "Vaddi", interestRateMonthly: "0", interestRateDaily: "0", date: "2026-08-01", group: "Direct Income", category: "Vaddi", lineId: selectedLineId },
            { acNo: "6", acName: `LINE ${linePrefix} SADAR`, acType: "Sadar", interestRateMonthly: "0", interestRateDaily: "0", date: "2026-08-01", group: "Direct Expenses", category: "Sadar", lineId: selectedLineId },
            { acNo: "7", acName: `LINE ${linePrefix} BANK`, acType: "Investment", interestRateMonthly: "0", interestRateDaily: "0", date: "2026-08-01", group: "Investment", category: "Investment", lineId: selectedLineId },
            { acNo: "8", acName: `LINE ${linePrefix} RENT`, acType: "Expenditure", interestRateMonthly: "0", interestRateDaily: "0", date: "2026-08-01", group: "Indirect Expenses", category: "Expenditure", lineId: selectedLineId },
            { acNo: "9", acName: `LINE ${linePrefix} SALARIES`, acType: "Expenditure", interestRateMonthly: "0", interestRateDaily: "0", date: "2026-08-01", group: "Indirect Expenses", category: "Expenditure", lineId: selectedLineId },
            { acNo: "10", acName: `LINE ${linePrefix} PETROL`, acType: "Expenditure", interestRateMonthly: "0", interestRateDaily: "0", date: "2026-08-01", group: "Indirect Expenses", category: "Expenditure", lineId: selectedLineId },
            { acNo: "11", acName: `LINE ${linePrefix} LESS`, acType: "Expenditure", interestRateMonthly: "0", interestRateDaily: "0", date: "2026-08-01", group: "Indirect Expenses", category: "Expenditure", lineId: selectedLineId },
            { acNo: "12", acName: `LINE ${linePrefix} EXCESS`, acType: "Vaddi", interestRateMonthly: "0", interestRateDaily: "0", date: "2026-08-01", group: "Direct Income", category: "Vaddi", lineId: selectedLineId },
            { acNo: "13", acName: `LINE ${linePrefix} RUSUMU`, acType: "Vaddi", interestRateMonthly: "0", interestRateDaily: "0", date: "2026-08-01", group: "Direct Income", category: "Vaddi", lineId: selectedLineId },
            { acNo: "14", acName: `LINE ${linePrefix} TICKETS`, acType: "Vaddi", interestRateMonthly: "0", interestRateDaily: "0", date: "2026-08-01", group: "Direct Income", category: "Vaddi", lineId: selectedLineId },
            { acNo: "15", acName: `LINE ${linePrefix} INTEREST`, acType: "Vaddi", interestRateMonthly: "0", interestRateDaily: "0", date: "2026-08-01", group: "Direct Income", category: "Vaddi", lineId: selectedLineId }
          ];
          for (const item of target15) {
            await addDoc(collection(db, "ledger_accounts"), item);
          }
        }
      } catch (e) {
        console.error("Auto-seed error in DailyData:", e);
      }
    };
    seedDefaultAccounts();
  }, [selectedLineId, ledgerAccounts.length, linePrefix]);

  // Ensure Ac 15 (Interest) exists in ledger_accounts if line already has default accounts
  useEffect(() => {
    if (!selectedLineId || ledgerAccounts.length === 0) return;
    const hasInterest = ledgerAccounts.some(a => String(a.acNo) === "15" || (a.acName && a.acName.toUpperCase().includes("INTEREST")));
    if (!hasInterest) {
      addDoc(collection(db, "ledger_accounts"), {
        acNo: "15",
        acName: `LINE ${linePrefix} INTEREST`,
        acType: "Vaddi",
        interestRateMonthly: "0",
        interestRateDaily: "0",
        date: "2026-08-01",
        group: "Direct Income",
        category: "Vaddi",
        lineId: selectedLineId
      }).catch(console.error);
    }
  }, [selectedLineId, ledgerAccounts, linePrefix]);

  // Sync manual ledger postings for selected date
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

  // Sync all manual ledger postings for the line (for opening balance calculation)
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

  // Sync line daily postings (Collections, Disbursements, Document Charges)
  useEffect(() => {
    if (!selectedLineId) return;
    const q = query(
      collection(db, "postings"),
      where("lineId", "==", selectedLineId)
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setLinePostings(list);
    });
    return () => unsubscribe();
  }, [selectedLineId]);

  // Sync line expenses
  useEffect(() => {
    if (!selectedLineId) return;
    const q = query(
      collection(db, "expenses_log"),
      where("lineId", "==", selectedLineId)
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setLineExpenses(list);
    });
    return () => unsubscribe();
  }, [selectedLineId]);

  // Sync line registered accounts (to retrieve totalAmount, interestAmount, loanAmount)
  useEffect(() => {
    if (!selectedLineId) return;
    const q = query(
      collection(db, "accounts"),
      where("lineId", "==", selectedLineId)
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setLineAccounts(list);
    });
    return () => unsubscribe();
  }, [selectedLineId]);

  // Compute live balance for each ledger account
  const accountBalances = useMemo(() => {
    const map: { [acNo: string]: number } = {};
    ledgerAccounts.forEach(acc => {
      map[acc.acNo] = 0;
    });

    // 1. Manual ledger postings
    allLinePostings.forEach(p => {
      const acc = ledgerAccounts.find(a => a.id === p.ledgerId);
      if (acc) {
        const val = (parseFloat(p.jama) || 0) - (parseFloat(p.kharchu) || 0);
        map[acc.acNo] = (map[acc.acNo] || 0) + val;
      }
    });

    // 2. Line postings
    linePostings.forEach(p => {
      if (p.payMode === 'pay_later') return;
      if (p.status === "disbursement" || p.status === "payment") {
        const acc = lineAccounts.find(a => a.id === p.accountId);
        const tot = (acc && parseFloat(acc.totalAmount) > 0) ? parseFloat(acc.totalAmount) : (p.totalAmount ? parseFloat(p.totalAmount) : (parseFloat(p.amount) || 0));
        const intAmt = (acc && parseFloat(acc.interestAmount) > 0) ? parseFloat(acc.interestAmount) : (p.interestAmount ? parseFloat(p.interestAmount) : 0);
        map["4"] = (map["4"] || 0) + tot;
        if (intAmt > 0) {
          map["15"] = (map["15"] || 0) + intAmt;
        }
      } else {
        const collAmt = (parseFloat(p.amount) || 0) + (parseFloat(p.extraAmount) || 0) + (parseFloat(p.penaltyAmount) || 0);
        map["3"] = (map["3"] || 0) + collAmt;
        if (p.documentCharge) {
          map["2"] = (map["2"] || 0) + (parseFloat(p.documentCharge) || 0);
        }
      }
    });

    // 3. Line expenses
    lineExpenses.forEach(e => {
      const amt = parseFloat(e.amount) || 0;
      const eType = (e.type || e.category || e.note || "").toUpperCase();
      if (eType.includes("PETROL") || eType.includes("FUEL")) {
        map["10"] = (map["10"] || 0) + amt;
      } else if (eType.includes("RENT")) {
        map["8"] = (map["8"] || 0) + amt;
      } else if (eType.includes("SALAR")) {
        map["9"] = (map["9"] || 0) + amt;
      } else if (eType.includes("LESS")) {
        map["11"] = (map["11"] || 0) + amt;
      } else {
        map["6"] = (map["6"] || 0) + amt;
      }
    });

    return map;
  }, [ledgerAccounts, allLinePostings, linePostings, lineExpenses, lineAccounts]);

  // Filtered ledger accounts for search in custom dropdown
  const filteredLedgerAccounts = useMemo(() => {
    if (!accountSearchTerm.trim()) return ledgerAccounts;
    const term = accountSearchTerm.toLowerCase();
    return ledgerAccounts.filter(acc => 
      (acc.acNo || "").toLowerCase().includes(term) ||
      (acc.acName || "").toLowerCase().includes(term) ||
      (acc.acType || "").toLowerCase().includes(term)
    );
  }, [ledgerAccounts, accountSearchTerm]);

  // Comprehensive breakdown of ALL daily transactions matching Image 2
  // UNIFIED: Each account appears EXACTLY ONCE. When a manual entry exists, it updates/overrides the row in-place!
  const displayPostings = useMemo(() => {
    // Helper to find account by number or keyword
    const findAcc = (no: string, keyword: string) => {
      return ledgerAccounts.find(a => String(a.acNo) === String(no)) ||
             ledgerAccounts.find(a => (a.acName || "").toUpperCase().includes(keyword.toUpperCase()));
    };

    // Dictionary of unified account rows: key = acNo
    const accountRowMap: { [acNo: string]: any } = {};

    // 1. Automatic Loan Disbursements / Payments (Ac #4 LINE PAYMENT) -> DR (Kharchu: Total Amount)
    //    and Automatic New Loan Interest (Ac #15 LINE INTEREST) -> CR (Jama: Interest Amount)
    const dayDisbursements = linePostings.filter(p => 
      (p.date === selectedDate) && 
      (p.status === "disbursement" || p.status === "payment")
    );

    let totalDayDisburseTotal = 0;
    let totalDayNewLoanInterest = 0;

    dayDisbursements.forEach(p => {
      const acc = lineAccounts.find(a => a.id === p.accountId);
      const tot = (acc && parseFloat(acc.totalAmount) > 0) ? parseFloat(acc.totalAmount) : (p.totalAmount ? parseFloat(p.totalAmount) : (parseFloat(p.amount) || 0));
      const intAmt = (acc && parseFloat(acc.interestAmount) > 0) ? parseFloat(acc.interestAmount) : (p.interestAmount ? parseFloat(p.interestAmount) : 0);
      
      totalDayDisburseTotal += tot;
      totalDayNewLoanInterest += intAmt;
    });

    // Also include any new account registered on selectedDate that might not have a separate posting record
    lineAccounts.forEach(acc => {
      if ((acc.startDate === selectedDate || acc.creationDate === selectedDate) && !dayDisbursements.some(p => p.accountId === acc.id)) {
        const tot = parseFloat(acc.totalAmount) || 0;
        const intAmt = parseFloat(acc.interestAmount) || 0;
        if (tot > 0) {
          totalDayDisburseTotal += tot;
          totalDayNewLoanInterest += intAmt;
        }
      }
    });

    if (totalDayDisburseTotal > 0) {
      const payAcc = findAcc("4", "PAYMENT");
      const no = payAcc?.acNo ? String(payAcc.acNo) : "4";
      accountRowMap[no] = {
        id: "auto-disbursement-" + selectedDate,
        ledgerId: payAcc?.id || "auto-disbursement",
        acNo: no,
        acName: payAcc?.acName || `LINE ${linePrefix} PAYMENT`,
        jama: 0,
        kharchu: totalDayDisburseTotal,
        isAuto: true,
        date: selectedDate
      };
    }

    if (totalDayNewLoanInterest > 0) {
      const interestAcc = findAcc("15", "INTEREST") || findAcc("", "INTEREST");
      const no = interestAcc?.acNo ? String(interestAcc.acNo) : "15";
      accountRowMap[no] = {
        id: "auto-interest-" + selectedDate,
        ledgerId: interestAcc?.id || "auto-interest",
        acNo: no,
        acName: interestAcc?.acName || `LINE ${linePrefix} INTEREST`,
        jama: totalDayNewLoanInterest,
        kharchu: 0,
        isAuto: true,
        date: selectedDate
      };
    }

    // 2. Automatic Commission / Document Charges (Ac #2 / #32 LINE COMMISSION) -> CR (Jama)
    const dayCharges = linePostings.filter(p => 
      (p.date === selectedDate) && 
      (p.status === "charge" || (p.documentCharge && parseFloat(p.documentCharge) > 0))
    );
    const totalDayCharges = dayCharges.reduce((sum, p) => 
      sum + (p.status === "charge" ? (parseFloat(p.amount) || 0) : 0) + (parseFloat(p.documentCharge) || 0), 0);
    if (totalDayCharges > 0) {
      const commAcc = findAcc("2", "COMMISSION") || findAcc("32", "COMMISSION");
      const no = commAcc?.acNo ? String(commAcc.acNo) : "2";
      accountRowMap[no] = {
        id: "auto-commission-" + selectedDate,
        ledgerId: commAcc?.id || "auto-commission",
        acNo: no,
        acName: commAcc?.acName || `LINE ${linePrefix} COMMISSION`,
        jama: totalDayCharges,
        kharchu: 0,
        isAuto: true,
        date: selectedDate
      };
    }

    // 3. Automatic Rusumu (Ac #13 / #33 LINE RUSUMU) -> CR (Jama)
    const dayRusumuPostings = linePostings.filter(p => 
      (p.date === selectedDate) && 
      ((p.rusumu && parseFloat(p.rusumu) > 0) || (p.status === "rusumu"))
    );
    const totalDayRusumu = dayRusumuPostings.reduce((sum, p) => 
      sum + (parseFloat(p.rusumu) || (p.status === "rusumu" ? (parseFloat(p.amount) || 0) : 0)), 0);
    if (totalDayRusumu > 0) {
      const rusumuAcc = findAcc("13", "RUSUMU") || findAcc("33", "RUSUMU");
      const no = rusumuAcc?.acNo ? String(rusumuAcc.acNo) : "13";
      accountRowMap[no] = {
        id: "auto-rusumu-" + selectedDate,
        ledgerId: rusumuAcc?.id || "auto-rusumu",
        acNo: no,
        acName: rusumuAcc?.acName || `LINE ${linePrefix} RUSUMU`,
        jama: totalDayRusumu,
        kharchu: 0,
        isAuto: true,
        date: selectedDate
      };
    }

    // 4. Automatic Customer Collections (Ac #3 LINE COLLECTION) -> CR (Jama)
    const dayCollections = linePostings.filter(p => 
      (p.date === selectedDate) && 
      (p.status === "collection" || p.status === "other" || !p.status)
    );
    
    // Separate Extra / Penalty if dedicated accounts exist, otherwise include in collection
    const excessAcc = findAcc("12", "EXCESS");
    const penaltyAcc = findAcc("5", "PENALTY");

    let pureCollection = 0;
    let excessTotal = 0;
    let penaltyTotal = 0;

    dayCollections.forEach(p => {
      const baseAmt = parseFloat(p.amount) || 0;
      const extraAmt = parseFloat(p.extraAmount) || 0;
      const penAmt = parseFloat(p.penaltyAmount) || 0;

      pureCollection += baseAmt;
      if (excessAcc && extraAmt > 0) {
        excessTotal += extraAmt;
      } else {
        pureCollection += extraAmt;
      }

      if (penaltyAcc && penAmt > 0) {
        penaltyTotal += penAmt;
      } else {
        pureCollection += penAmt;
      }
    });

    if (pureCollection > 0) {
      const collAcc = findAcc("3", "COLLECTION");
      const no = collAcc?.acNo ? String(collAcc.acNo) : "3";
      accountRowMap[no] = {
        id: "auto-collection-" + selectedDate,
        ledgerId: collAcc?.id || "auto-collection",
        acNo: no,
        acName: collAcc?.acName || `LINE ${linePrefix} COLLECTION`,
        jama: pureCollection,
        kharchu: 0,
        isAuto: true,
        date: selectedDate
      };
    }

    if (excessTotal > 0 && excessAcc) {
      const no = excessAcc.acNo ? String(excessAcc.acNo) : "12";
      accountRowMap[no] = {
        id: "auto-excess-" + selectedDate,
        ledgerId: excessAcc.id,
        acNo: no,
        acName: excessAcc.acName,
        jama: excessTotal,
        kharchu: 0,
        isAuto: true,
        date: selectedDate
      };
    }

    if (penaltyTotal > 0 && penaltyAcc) {
      const no = penaltyAcc.acNo ? String(penaltyAcc.acNo) : "5";
      accountRowMap[no] = {
        id: "auto-penalty-" + selectedDate,
        ledgerId: penaltyAcc.id,
        acNo: no,
        acName: penaltyAcc.acName,
        jama: penaltyTotal,
        kharchu: 0,
        isAuto: true,
        date: selectedDate
      };
    }

    // 5. Automatic Individual Expenses (Petrol, Sadar, Rent, Salaries, Less) -> DR (Kharchu)
    const dayExpenses = lineExpenses.filter(e => e.date === selectedDate);
    if (dayExpenses.length > 0) {
      const expGroups: { [acNo: string]: { acc: any; sum: number } } = {};

      dayExpenses.forEach(e => {
        const amt = parseFloat(e.amount) || 0;
        if (amt <= 0) return;
        const eType = (e.type || e.category || e.note || "").toUpperCase();

        let matchedAcc: any = null;
        if (eType.includes("PETROL") || eType.includes("FUEL") || eType.includes("DIESEL")) {
          matchedAcc = findAcc("10", "PETROL");
        } else if (eType.includes("RENT")) {
          matchedAcc = findAcc("8", "RENT");
        } else if (eType.includes("SALAR")) {
          matchedAcc = findAcc("9", "SALAR");
        } else if (eType.includes("LESS")) {
          matchedAcc = findAcc("11", "LESS");
        } else {
          matchedAcc = findAcc("6", "SADAR") || findAcc("8", "EXPENDITURE");
        }

        const no = matchedAcc?.acNo ? String(matchedAcc.acNo) : "6";
        if (!expGroups[no]) {
          expGroups[no] = {
            acc: matchedAcc || { acNo: no, acName: `LINE ${linePrefix} SADAR` },
            sum: 0
          };
        }
        expGroups[no].sum += amt;
      });

      Object.values(expGroups).forEach(g => {
        if (g.sum > 0) {
          const no = String(g.acc.acNo);
          accountRowMap[no] = {
            id: `auto-exp-${no}-${selectedDate}`,
            ledgerId: g.acc.id || `auto-exp-${no}`,
            acNo: no,
            acName: g.acc.acName,
            jama: 0,
            kharchu: g.sum,
            isAuto: true,
            date: selectedDate
          };
        }
      });
    }

    // 6. Manual ledger postings on selectedDate
    // When a manual entry exists, it updates / replaces the auto row for that account IN-PLACE!
    // No duplicate rows are created!
    postings.forEach(p => {
      const acc = ledgerAccounts.find(a => a.id === p.ledgerId || (p.acNo && String(a.acNo) === String(p.acNo)));
      const no = acc?.acNo ? String(acc.acNo) : (p.acNo ? String(p.acNo) : "-");
      const name = acc?.acName || p.acName || p.description || "Unknown Account";
      const j = parseFloat(p.jama) || 0;
      const k = parseFloat(p.kharchu) || 0;

      accountRowMap[no] = {
        ...p,
        id: p.id,
        manualPostingId: p.id,
        ledgerId: acc?.id || p.ledgerId,
        acNo: no,
        acName: name,
        jama: j,
        kharchu: k,
        isManual: true,
        isAuto: false,
        date: selectedDate
      };
    });

    const list = Object.values(accountRowMap);
    // Sort order: payment (4), commission (2/32), rusumu (13/33), collection (3), petrol (10), sadar (6), interest (15), etc.
    return list.sort((a, b) => (parseInt(a.acNo) || 0) - (parseInt(b.acNo) || 0));
  }, [postings, ledgerAccounts, linePostings, lineExpenses, lineAccounts, selectedDate, linePrefix]);

  // Calculate opening balance based on date comparison across all transactions strictly before selectedDate
  const openingBalance = useMemo(() => {
    let opening = 0;

    // Track which dates have manual postings for which accounts strictly before selectedDate
    const manualDaysByAc: { [acNo: string]: Set<string> } = {};
    allLinePostings.forEach(p => {
      const pDate = p.date || "";
      if (pDate >= selectedDate) return;
      const acc = ledgerAccounts.find(a => a.id === p.ledgerId || (p.acNo && String(a.acNo) === String(p.acNo)));
      const no = acc?.acNo ? String(acc.acNo) : (p.acNo ? String(p.acNo) : "");
      if (no && pDate) {
        if (!manualDaysByAc[no]) manualDaysByAc[no] = new Set();
        manualDaysByAc[no].add(pDate);
      }
      const val = (parseFloat(p.jama) || 0) - (parseFloat(p.kharchu) || 0);
      opening += val;
    });

    // Line postings (Collections + Charges + Loan Interest - Total Disbursements) for dates before selectedDate
    linePostings.forEach(p => {
      const pDate = p.date || "";
      if (pDate >= selectedDate) return;
      if (p.payMode === 'pay_later') return;

      if (p.status === "disbursement" || p.status === "payment") {
        const acc = lineAccounts.find(a => a.id === p.accountId);
        const tot = (acc && parseFloat(acc.totalAmount) > 0) ? parseFloat(acc.totalAmount) : (p.totalAmount ? parseFloat(p.totalAmount) : (parseFloat(p.amount) || 0));
        const intAmt = (acc && parseFloat(acc.interestAmount) > 0) ? parseFloat(acc.interestAmount) : (p.interestAmount ? parseFloat(p.interestAmount) : 0);
        
        // If Ac 4 has no manual posting on pDate, include outflow
        if (!manualDaysByAc["4"]?.has(pDate)) {
          opening -= tot;
        }
        // If Ac 15 has no manual posting on pDate, include inflow
        if (!manualDaysByAc["15"]?.has(pDate)) {
          opening += intAmt;
        }
      } else {
        if (!manualDaysByAc["3"]?.has(pDate)) {
          opening += (parseFloat(p.amount) || 0) + (parseFloat(p.extraAmount) || 0) + (parseFloat(p.penaltyAmount) || 0);
        }
        if (p.documentCharge && !manualDaysByAc["2"]?.has(pDate)) {
          opening += (parseFloat(p.documentCharge) || 0);
        }
      }
    });

    // Line expenses for dates before selectedDate
    lineExpenses.forEach(e => {
      const eDate = e.date || "";
      if (eDate >= selectedDate) return;
      const amt = parseFloat(e.amount) || 0;
      const eType = (e.type || e.category || e.note || "").toUpperCase();
      let no = "6";
      if (eType.includes("PETROL") || eType.includes("FUEL")) no = "10";
      else if (eType.includes("RENT")) no = "8";
      else if (eType.includes("SALAR")) no = "9";
      else if (eType.includes("LESS")) no = "11";

      if (!manualDaysByAc[no]?.has(eDate)) {
        opening -= amt;
      }
    });

    return opening;
  }, [allLinePostings, linePostings, lineExpenses, lineAccounts, ledgerAccounts, selectedDate]);

  // Selecting an account from the dropdown
  const handleSelectAccountChange = (accId: string) => {
    const acc = ledgerAccounts.find(a => a.id === accId);
    if (!acc) return;
    setTargetAccount(acc);

    // Check if an existing row or manual posting exists for this account
    const existingManual = postings.find(p => p.ledgerId === acc.id || (acc.acNo && String(p.acNo) === String(acc.acNo)));
    const existingRow = displayPostings.find(r => r.ledgerId === acc.id || (acc.acNo && String(r.acNo) === String(acc.acNo)));

    if (existingManual) {
      setSelectedPosting(existingManual);
      setJamaVal(existingManual.jama ? String(existingManual.jama) : "");
      setKharchuVal(existingManual.kharchu ? String(existingManual.kharchu) : "");
    } else if (existingRow) {
      setSelectedPosting(null);
      setJamaVal(existingRow.jama > 0 ? String(existingRow.jama) : "");
      setKharchuVal(existingRow.kharchu > 0 ? String(existingRow.kharchu) : "");
    } else {
      setSelectedPosting(null);
      setJamaVal("");
      setKharchuVal("");
    }
  };

  const handleSavePosting = useCallback(async () => {
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
      // Find all existing manual posting docs for this account on postingDate
      const existingDocs = postings.filter(p => 
        (selectedPosting && p.id === selectedPosting.id) ||
        (p.ledgerId && p.ledgerId === targetAccount.id) || 
        (targetAccount.acNo && String(p.acNo) === String(targetAccount.acNo))
      );

      if (existingDocs.length > 0) {
        // Update the primary document in DB
        const primaryDoc = existingDocs[0];
        const docRef = doc(db, "ledger_postings", primaryDoc.id);
        await updateDoc(docRef, {
          ledgerId: targetAccount.id,
          acNo: targetAccount.acNo,
          jama,
          kharchu,
          date: postingDate,
          description: "Manual Entry / Edit",
          lineId: selectedLineId || "",
          updatedAt: new Date().toISOString()
        });

        // Delete any duplicate documents for this account on this date
        if (existingDocs.length > 1) {
          for (let i = 1; i < existingDocs.length; i++) {
            await deleteDoc(doc(db, "ledger_postings", existingDocs[i].id));
          }
        }

        toast.success(`Updated ${targetAccount.acName}!`);
        setSelectedPosting({ ...primaryDoc, jama, kharchu, date: postingDate });
      } else {
        // Create new manual posting document in DB
        const payload = {
          ledgerId: targetAccount.id,
          acNo: targetAccount.acNo,
          date: postingDate,
          jama,
          kharchu,
          description: "Manual Entry / Edit",
          lineId: selectedLineId || "",
          createdAt: new Date().toISOString()
        };
        const newDocRef = await addDoc(collection(db, "ledger_postings"), payload);
        toast.success(`Saved ${targetAccount.acName}!`);
        setSelectedPosting({ id: newDocRef.id, ...payload });
      }

      setSelectedDate(postingDate);
    } catch (err) {
      console.error(err);
      toast.error("Failed to save transaction");
    }
  }, [targetAccount, jamaVal, kharchuVal, selectedPosting, postingDate, selectedLineId, postings]);

  const handleDeletePosting = useCallback(async () => {
    const existingDocs = postings.filter(p => 
      (selectedPosting && p.id === selectedPosting.id) ||
      (targetAccount && p.ledgerId === targetAccount.id) || 
      (targetAccount?.acNo && String(p.acNo) === String(targetAccount.acNo))
    );

    if (existingDocs.length === 0) {
      toast.info("No manual entry found to delete.");
      return;
    }

    try {
      for (const d of existingDocs) {
        await deleteDoc(doc(db, "ledger_postings", d.id));
      }
      toast.success("Manual entry removed. Reset to auto calculation!");
      setSelectedPosting(null);
      setJamaVal("");
      setKharchuVal("");
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete transaction");
    }
  }, [selectedPosting, targetAccount, postings]);

  const handleSelectRow = (p: any) => {
    setPostingDate(p.date || selectedDate);
    const acc = ledgerAccounts.find(a => a.id === p.ledgerId || String(a.acNo) === String(p.acNo));
    if (acc) {
      setTargetAccount(acc);
    }

    const manualDoc = postings.find(mp => 
      mp.id === p.manualPostingId ||
      mp.id === p.id ||
      (acc && mp.ledgerId === acc.id) ||
      (acc?.acNo && String(mp.acNo) === String(acc.acNo))
    );

    if (manualDoc) {
      setSelectedPosting(manualDoc);
    } else {
      setSelectedPosting(null);
    }

    setJamaVal(p.jama > 0 ? String(p.jama) : "");
    setKharchuVal(p.kharchu > 0 ? String(p.kharchu) : "");
    toast.info(`Selected ${p.acName}`);
  };

  const handleClear = useCallback(() => {
    setSelectedPosting(null);
    setJamaVal("");
    setKharchuVal("");
    if (ledgerAccounts.length > 0) {
      setTargetAccount(ledgerAccounts[0]);
    }
  }, [ledgerAccounts]);

  const handleGetDate = useCallback(() => {
    setSelectedDate(postingDate);
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    toast.success(`Loaded transactions for ${formatToDDMMYY(postingDate)}`);
  }, [postingDate]);

  const handleRefresh = useCallback(() => {
    setSelectedDate(postingDate);
    toast.success("Refreshed daily ledger data!");
  }, [postingDate]);

  // Keyboard shortcut listener for F-keys (F1, F2, F3, F5, F6, F8)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F1") {
        e.preventDefault();
        handleGetDate();
      } else if (e.key === "F2") {
        e.preventDefault();
        handleDeletePosting();
      } else if (e.key === "F3") {
        e.preventDefault();
        const j = parseFloat(jamaVal) || 0;
        const k = parseFloat(kharchuVal) || 0;
        if (targetAccount && (j > 0 || k > 0)) {
          handleSavePosting();
        } else if (jamaInputRef.current) {
          jamaInputRef.current.focus();
        }
      } else if (e.key === "F5") {
        e.preventDefault();
        handleSavePosting();
      } else if (e.key === "F6") {
        e.preventDefault();
        handleRefresh();
      } else if (e.key === "F8") {
        e.preventDefault();
        navigate("/dashboard");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleGetDate, handleDeletePosting, handleSavePosting, handleRefresh, navigate]);

  // Double-entry calculation aggregates for bottom summary footer
  const totalJama = useMemo(() => displayPostings.reduce((s, p) => s + (parseFloat(p.jama) || 0), 0), [displayPostings]);
  const totalKharchu = useMemo(() => displayPostings.reduce((s, p) => s + (parseFloat(p.kharchu) || 0), 0), [displayPostings]);

  // Legacy accounting logic matching Image 2:
  // In Image 2:
  // Opening Balance is in DR column: 3607.45
  // Row 1 totals: CR: 1047.00 | DR: 812.00
  // Row 2 cumulative: CR: 1047.00 | DR: 3607.45 + 812.00 = 4419.45
  // Row 3 closing: Closing Balance: 4419.45 - 1047.00 = 3372.45 DR
  const isOpeningDR = openingBalance < 0;
  const isOpeningCR = openingBalance >= 0;
  const openingAmt = Math.abs(openingBalance);

  const cumCR = isOpeningCR ? (openingAmt + totalJama) : totalJama;
  const cumDR = isOpeningDR ? (openingAmt + totalKharchu) : totalKharchu;

  // Net closing balance
  const netDiff = cumCR - cumDR;
  const isClosingCR = netDiff >= 0;
  const closingAmt = Math.abs(netDiff);

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 font-sans antialiased pb-10">
      
      {/* Top Header Banner */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 sm:px-6 py-3 flex justify-between items-center print:hidden">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 bg-amber-500 rounded-lg flex items-center justify-center font-serif text-slate-950 font-black text-xl shadow-lg">
            ₹
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-black tracking-tight text-white">SriDeviGroups Of Finance</h1>
            <p className="text-[10px] text-amber-500 uppercase tracking-widest font-bold">{lineName} • Enterprise Hub</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-slate-950/60 border border-slate-800/80 px-3 py-1 rounded-full text-xs font-bold text-slate-400">
          <CalendarIcon className="h-3.5 w-3.5 text-amber-500" />
          <span>DATE: {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-2 sm:p-4 md:p-6">
        
        {/* Main Retro Accounting Window matching Image 2 */}
        <div className="w-full max-w-5xl bg-[#c0c0c0] border-4 border-t-white border-l-white border-r-zinc-800 border-b-zinc-800 rounded-sm shadow-[0_10px_40px_rgba(0,0,0,0.6)] text-slate-950 flex flex-col overflow-hidden">
          
          {/* Blue Title Bar with Classic Window Controls matching Image 2 */}
          <div className="bg-[#0055d4] text-white px-3 py-1.5 flex justify-between items-center font-bold text-sm tracking-wide select-none shadow">
            <span className="font-serif tracking-wider flex items-center gap-1.5">
              <span>Daily Information Entry:</span>
              <span className="text-amber-300 text-xs font-mono ml-2 font-black">[{lineName.toUpperCase()}]</span>
            </span>
            <div className="flex items-center gap-1">
              <button type="button" className="w-5 h-5 bg-[#c0c0c0] hover:bg-white text-slate-900 border border-t-white border-l-white border-r-zinc-700 border-b-zinc-700 flex items-center justify-center text-[10px] font-bold shadow-sm">
                <Minus className="h-3 w-3" />
              </button>
              <button type="button" className="w-5 h-5 bg-[#c0c0c0] hover:bg-white text-slate-900 border border-t-white border-l-white border-r-zinc-700 border-b-zinc-700 flex items-center justify-center text-[10px] font-bold shadow-sm">
                <Square className="h-2.5 w-2.5" />
              </button>
              <button type="button" onClick={() => navigate("/dashboard")} className="w-5 h-5 bg-[#c0c0c0] hover:bg-red-500 hover:text-white text-slate-900 border border-t-white border-l-white border-r-zinc-700 border-b-zinc-700 flex items-center justify-center text-[10px] font-bold shadow-sm">
                ✕
              </button>
            </div>
          </div>

          <div className="p-2 sm:p-3 flex flex-col gap-2.5 bg-[#d4d0c8]">

            {/* TOP MAGENTA BEVEL PANEL matching Image 2 */}
            <div className="border-2 border-[#d946ef] bg-[#dcd8cf] rounded-md p-2.5 shadow-sm flex flex-col gap-2">
              
              {/* Row 1: Date & Controls */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-xs uppercase text-slate-900 tracking-wider">DATE:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date(postingDate);
                      if (!isNaN(d.getTime())) {
                        d.setDate(d.getDate() - 1);
                        const str = d.toISOString().split("T")[0];
                        setPostingDate(str);
                        setSelectedDate(str);
                      }
                    }}
                    className="bg-[#c0c0c0] hover:bg-white text-slate-900 px-2 py-0.5 border-2 border-t-white border-l-white border-r-zinc-600 border-b-zinc-600 rounded-sm text-xs font-black shadow-sm active:border-t-zinc-600 active:border-l-zinc-600 active:border-r-white active:border-b-white"
                    title="Previous Day"
                  >
                    ◀
                  </button>
                  <input
                    type="date"
                    value={postingDate}
                    onChange={e => {
                      const val = e.target.value;
                      setPostingDate(val);
                      setSelectedDate(val);
                      if (val) {
                        e.target.blur();
                      }
                    }}
                    className="bg-white text-slate-900 px-2 py-0.5 border-2 border-t-zinc-600 border-l-zinc-600 border-r-white border-b-white rounded-sm font-mono text-xs font-bold shadow-inner"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date(postingDate);
                      if (!isNaN(d.getTime())) {
                        d.setDate(d.getDate() + 1);
                        const str = d.toISOString().split("T")[0];
                        setPostingDate(str);
                        setSelectedDate(str);
                      }
                    }}
                    className="bg-[#c0c0c0] hover:bg-white text-slate-900 px-2 py-0.5 border-2 border-t-white border-l-white border-r-zinc-600 border-b-zinc-600 rounded-sm text-xs font-black shadow-sm active:border-t-zinc-600 active:border-l-zinc-600 active:border-r-white active:border-b-white"
                    title="Next Day"
                  >
                    ▶
                  </button>
                  <button
                    type="button"
                    onClick={handleGetDate}
                    className="bg-[#c0c0c0] hover:bg-white text-slate-950 px-3 py-0.5 border-2 border-t-white border-l-white border-r-zinc-700 border-b-zinc-700 rounded-sm text-xs font-black uppercase tracking-wider shadow active:border-t-zinc-700 active:border-l-zinc-700 active:border-r-white active:border-b-white"
                  >
                    GET F1
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const today = new Date().toISOString().split("T")[0];
                      setPostingDate(today);
                      setSelectedDate(today);
                    }}
                    className="bg-[#c0c0c0] hover:bg-white text-slate-800 px-2.5 py-0.5 border-2 border-t-white border-l-white border-r-zinc-600 border-b-zinc-600 rounded-sm text-[11px] font-bold shadow-sm"
                  >
                    Today
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => navigate("/accounts")}
                  className="bg-[#c0c0c0] hover:bg-white text-slate-900 px-3 py-0.5 border-2 border-t-white border-l-white border-r-zinc-600 border-b-zinc-600 rounded-sm text-xs font-bold uppercase tracking-wider shadow-sm active:border-t-zinc-600 active:border-l-zinc-600 active:border-r-white active:border-b-white"
                >
                  Add Accounts
                </button>
              </div>

              {/* Row 2: Top Quick Entry Bar with Telugu Labels matching Image 2 */}
              <div className="grid grid-cols-12 gap-2 items-end pt-1">
                
                {/* Account Selection Box */}
                <div className="col-span-12 md:col-span-6 relative" ref={dropdownRef}>
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="text-[11px] font-bold text-slate-800">Select Account:</span>
                    {targetAccount && (
                      <span className="text-[10px] font-mono font-bold text-slate-700">
                        Ac #{targetAccount.acNo} • {targetAccount.acType}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAccountDropdownOpen(prev => !prev)}
                    className="w-full bg-white text-slate-950 px-2 py-1 border-2 border-t-zinc-600 border-l-zinc-600 border-r-white border-b-white rounded-sm font-bold text-xs flex items-center justify-between shadow-inner focus:outline-none"
                  >
                    <span className="truncate">
                      {targetAccount
                        ? `${targetAccount.acNo} - ${targetAccount.acName}`
                        : "Select Ledger Account..."}
                    </span>
                    <ChevronDown className={`h-4 w-4 text-slate-700 shrink-0 ml-1 transition-transform ${isAccountDropdownOpen ? "rotate-180" : ""}`} />
                  </button>

                  {/* Dropdown Menu */}
                  {isAccountDropdownOpen && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white border-2 border-zinc-700 rounded-sm shadow-2xl z-[9999] max-h-64 flex flex-col overflow-hidden">
                      <div className="p-1.5 border-b border-zinc-300 bg-zinc-100 flex items-center gap-1">
                        <Search className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                        <input
                          type="text"
                          placeholder="Search account..."
                          value={accountSearchTerm}
                          onChange={e => setAccountSearchTerm(e.target.value)}
                          className="w-full bg-white text-slate-900 border border-zinc-300 rounded px-1.5 py-0.5 text-xs font-semibold focus:outline-none"
                          autoFocus
                          onClick={e => e.stopPropagation()}
                        />
                        {accountSearchTerm && (
                          <button type="button" onClick={() => setAccountSearchTerm("")} className="text-zinc-400 hover:text-zinc-600 p-0.5">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="overflow-y-auto max-h-52 divide-y divide-zinc-100 bg-white">
                        {filteredLedgerAccounts.map(acc => {
                          const isSelected = targetAccount?.id === acc.id;
                          return (
                            <div
                              key={acc.id}
                              onClick={() => {
                                handleSelectAccountChange(acc.id);
                                setIsAccountDropdownOpen(false);
                                setAccountSearchTerm("");
                              }}
                              className={`px-2.5 py-1.5 text-xs flex items-center justify-between cursor-pointer ${
                                isSelected ? "bg-amber-300 font-black text-slate-950" : "hover:bg-amber-100/70 font-semibold text-slate-800"
                              }`}
                            >
                              <span className="truncate">#{acc.acNo} - {acc.acName}</span>
                              <span className="text-[10px] text-zinc-600 font-mono shrink-0 ml-2 uppercase">{acc.acType}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Jama (CR) Box */}
                <div className="col-span-6 md:col-span-3">
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="text-xs font-black text-emerald-800">జమ (CR)</span>
                    <span className="text-[10px] text-slate-500 font-mono">Inflow</span>
                  </div>
                  <input
                    ref={jamaInputRef}
                    type="number"
                    step="any"
                    value={jamaVal}
                    onChange={e => setJamaVal(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-white text-slate-950 px-2 py-1 border-2 border-t-zinc-600 border-l-zinc-600 border-r-white border-b-white rounded-sm font-mono font-bold text-xs text-right shadow-inner focus:outline-none"
                  />
                </div>

                {/* Kharchu (DR) Box with Orange Header matching Image 2 */}
                <div className="col-span-6 md:col-span-3">
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="text-xs font-black text-red-800">ఖర్చు (DR)</span>
                    <span className="text-[10px] text-slate-500 font-mono">Outflow</span>
                  </div>
                  <input
                    type="number"
                    step="any"
                    value={kharchuVal}
                    onChange={e => setKharchuVal(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-[#fed7aa] text-slate-950 px-2 py-1 border-2 border-t-zinc-600 border-l-zinc-600 border-r-white border-b-white rounded-sm font-mono font-bold text-xs text-right shadow-inner focus:outline-none"
                  />
                </div>

              </div>

            </div>

            {/* CENTRAL LEDGER TABLE GRID matching Image 2 with smooth scrollbar */}
            <div className="bg-white border-2 border-t-zinc-600 border-l-zinc-600 border-r-white border-b-white rounded-sm shadow-inner flex flex-col min-h-[22rem] max-h-[28rem]">
              
              {/* Row 1: Opening Balance Row */}
              <div className="flex items-center border-b-2 border-zinc-500 bg-[#e4e4e7] font-bold text-xs">
                {/* CR Side */}
                <div className="w-[20%] py-1.5 px-3 text-right font-mono border-r border-zinc-500 text-slate-900 font-black">
                  {isOpeningCR ? formatAmount(openingAmt) : ""}
                </div>
                {/* Center Title */}
                <div className="w-[60%] py-1.5 px-3 text-center tracking-wider text-slate-900 font-serif font-black uppercase text-xs border-r border-zinc-500">
                  Opening Balance
                </div>
                {/* DR Side matching Image 2 */}
                <div className="w-[20%] py-1.5 px-3 text-right font-mono text-slate-900 font-black">
                  {isOpeningDR ? formatAmount(openingAmt) : ""}
                </div>
              </div>

              {/* Row 2: Table Columns Header matching soft slate-blue of Image 2 */}
              <div className="flex items-center border-b-2 border-zinc-600 bg-[#a3b8cc] text-slate-950 font-black text-xs select-none">
                <div className="w-[20%] py-1.5 px-3 text-right border-r border-zinc-600 tracking-wider">
                  CR
                </div>
                <div className="w-[12%] py-1.5 px-2 text-center border-r border-zinc-600 tracking-wider">
                  ACNO
                </div>
                <div className="w-[48%] py-1.5 px-3 text-left border-r border-zinc-600 tracking-wider">
                  ACNAME
                </div>
                <div className="w-[20%] py-1.5 px-3 text-right tracking-wider">
                  DR
                </div>
              </div>

              {/* Scrollable Table Body with visible vertical dividers */}
              <div 
                className="flex-1 overflow-y-auto min-h-[14rem] max-h-[18rem] overscroll-contain bg-white font-mono text-xs divide-y divide-zinc-200"
                style={{ scrollbarWidth: "thin" }}
              >
                {displayPostings.length === 0 ? (
                  <div className="py-16 text-center text-zinc-400 font-sans italic text-xs">
                    No transactions recorded on {formatToDDMMYY(selectedDate)}.
                  </div>
                ) : (
                  displayPostings.map((p, idx) => {
                    const isRowSelected = selectedPosting?.id === p.id || targetAccount?.id === p.ledgerId || String(targetAccount?.acNo) === String(p.acNo);
                    return (
                      <div
                        key={p.id || idx}
                        onClick={() => handleSelectRow(p)}
                        className={`flex items-center text-xs cursor-pointer select-none transition-colors border-b border-zinc-200 ${
                          isRowSelected
                            ? "bg-amber-100 font-bold border-l-4 border-amber-600 shadow-inner"
                            : idx % 2 === 0 ? "bg-white hover:bg-amber-50/70" : "bg-[#f8fafc] hover:bg-amber-50/70"
                        }`}
                      >
                        {/* CR Column */}
                        <div className="w-[20%] py-1 px-3 text-right border-r border-zinc-400 font-bold text-slate-900">
                          {p.jama > 0 ? formatAmount(p.jama) : "0.00"}
                        </div>
                        {/* ACNO Column */}
                        <div className="w-[12%] py-1 px-2 text-center border-r border-zinc-400 font-black text-slate-800">
                          {p.acNo}
                        </div>
                        {/* ACNAME Column */}
                        <div className="w-[48%] py-1 px-3 text-left border-r border-zinc-400 font-sans font-bold text-slate-900 truncate flex items-center gap-1.5">
                          <span className="truncate">{p.acName}</span>
                          {p.isAuto && (
                            <span className="text-[9px] bg-sky-100 text-sky-800 px-1 rounded font-mono font-bold shrink-0">
                              AUTO
                            </span>
                          )}
                          {p.isManual && (
                            <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1 rounded font-mono font-bold shrink-0">
                              MANUAL
                            </span>
                          )}
                        </div>
                        {/* DR Column */}
                        <div className="w-[20%] py-1 px-3 text-right font-bold text-slate-900">
                          {p.kharchu > 0 ? formatAmount(p.kharchu) : "0.00"}
                        </div>
                      </div>
                    );
                  })
                )}

                {/* Empty ledger grid lines filling to give authentic accounting paper appearance */}
                {displayPostings.length < 8 && Array.from({ length: 8 - displayPostings.length }).map((_, i) => (
                  <div key={`empty-${i}`} className="flex items-center text-xs border-b border-zinc-100 text-transparent select-none">
                    <div className="w-[20%] py-1 px-3 border-r border-zinc-200">-</div>
                    <div className="w-[12%] py-1 px-2 border-r border-zinc-200">-</div>
                    <div className="w-[48%] py-1 px-3 border-r border-zinc-200">-</div>
                    <div className="w-[20%] py-1 px-3">-</div>
                  </div>
                ))}
              </div>

              {/* 3-ROW SUMMARY FOOTER matching Image 2 */}
              <div className="bg-[#e2e8f0] border-t-2 border-zinc-500 font-mono text-xs font-black divide-y divide-zinc-400">
                
                {/* Footer Row 1: Daily Transaction Totals */}
                <div className="flex items-center">
                  <div className="w-[20%] py-1 px-3 text-right border-r border-zinc-500 text-slate-900">
                    {formatAmount(totalJama)}
                  </div>
                  <div className="w-[60%] py-1 px-3 border-r border-zinc-500"></div>
                  <div className="w-[20%] py-1 px-3 text-right text-slate-900">
                    {formatAmount(totalKharchu)}
                  </div>
                </div>

                {/* Footer Row 2: Cumulative Subtotals (Opening + Daily) */}
                <div className="flex items-center bg-[#d4d4d8]">
                  <div className="w-[20%] py-1 px-3 text-right border-r border-zinc-500 text-slate-950">
                    {formatAmount(cumCR)}
                  </div>
                  <div className="w-[60%] py-1 px-3 border-r border-zinc-500"></div>
                  <div className="w-[20%] py-1 px-3 text-right text-slate-950">
                    {formatAmount(cumDR)}
                  </div>
                </div>

                {/* Footer Row 3: Net Closing Balance matching Image 3 */}
                <div className="flex items-center bg-[#d4d4d8]">
                  <div className="w-[20%] py-1.5 px-3 text-right border-r border-zinc-500 text-slate-950 font-black">
                    {isClosingCR ? formatAmount(closingAmt) : ""}
                  </div>
                  <div className="w-[60%] py-1.5 px-3 text-center border-r border-zinc-500 font-serif font-black text-slate-900 uppercase tracking-widest text-xs">
                    Closing Balance
                  </div>
                  <div className="w-[20%] py-1.5 px-3 text-right text-slate-950 font-black">
                    {!isClosingCR ? formatAmount(closingAmt) : ""}
                  </div>
                </div>

              </div>

            </div>

            {/* BOTTOM MAGENTA BEVEL ACTION BAR matching Image 2 */}
            <div className="border-2 border-[#d946ef] bg-[#dcd8cf] rounded-md p-2 shadow-sm flex flex-col md:flex-row items-center justify-between gap-2.5">
              
              {/* Bottom Quick Input Area */}
              <div className="flex items-center gap-2 flex-wrap w-full md:w-auto">
                {/* Date Input */}
                <div className="flex items-center gap-1">
                  <input
                    type="date"
                    value={postingDate}
                    onChange={e => {
                      setPostingDate(e.target.value);
                      if (e.target.value) e.target.blur();
                    }}
                    className="bg-white text-slate-900 px-2 py-1 border-2 border-t-zinc-600 border-l-zinc-600 border-r-white border-b-white rounded-sm font-mono text-xs font-bold shadow-inner"
                  />
                </div>

                {/* Bottom Jama (CR) */}
                <div className="flex items-center gap-1">
                  <span className="text-xs font-black text-slate-800">జమ:</span>
                  <input
                    type="number"
                    step="any"
                    value={jamaVal}
                    onChange={e => setJamaVal(e.target.value)}
                    placeholder="0.00"
                    className="w-24 bg-white text-slate-950 px-2 py-1 border-2 border-t-zinc-600 border-l-zinc-600 border-r-white border-b-white rounded-sm font-mono font-bold text-xs text-right shadow-inner"
                  />
                </div>

                {/* Bottom Kharchu (DR) */}
                <div className="flex items-center gap-1">
                  <span className="text-xs font-black text-slate-800">ఖర్చు:</span>
                  <input
                    type="number"
                    step="any"
                    value={kharchuVal}
                    onChange={e => setKharchuVal(e.target.value)}
                    placeholder="0.00"
                    className="w-24 bg-white text-slate-950 px-2 py-1 border-2 border-t-zinc-600 border-l-zinc-600 border-r-white border-b-white rounded-sm font-mono font-bold text-xs text-right shadow-inner"
                  />
                </div>
              </div>

              {/* Action Buttons with F-keys matching Image 2 */}
              <div className="flex items-center gap-1.5 flex-wrap w-full md:w-auto justify-end">
                
                {/* Delete F2 */}
                <button
                  type="button"
                  onClick={handleDeletePosting}
                  className="px-3 py-1 bg-[#c0c0c0] hover:bg-red-200 text-slate-950 border-2 border-t-white border-l-white border-r-zinc-700 border-b-zinc-700 rounded-sm text-xs font-bold shadow active:border-t-zinc-700 active:border-l-zinc-700 active:border-r-white active:border-b-white"
                >
                  Delete <span className="font-mono text-[10px] text-zinc-600">F2</span>
                </button>

                {/* Edit F3 */}
                <button
                  type="button"
                  onClick={() => {
                    const j = parseFloat(jamaVal) || 0;
                    const k = parseFloat(kharchuVal) || 0;
                    if (targetAccount && (j > 0 || k > 0)) {
                      handleSavePosting();
                    } else if (jamaInputRef.current) {
                      jamaInputRef.current.focus();
                    }
                  }}
                  className="px-3 py-1 bg-[#c0c0c0] hover:bg-amber-200 text-slate-950 border-2 border-t-white border-l-white border-r-zinc-700 border-b-zinc-700 rounded-sm text-xs font-bold shadow active:border-t-zinc-700 active:border-l-zinc-700 active:border-r-white active:border-b-white"
                >
                  Edit <span className="font-mono text-[10px] text-zinc-600">F3</span>
                </button>

                {/* Save F5 */}
                <button
                  type="button"
                  onClick={handleSavePosting}
                  className="px-3.5 py-1 bg-[#86efac] hover:bg-[#4ade80] text-emerald-950 border-2 border-t-white border-l-white border-r-emerald-800 border-b-emerald-800 rounded-sm text-xs font-black shadow active:border-t-emerald-800 active:border-l-emerald-800 active:border-r-white active:border-b-white"
                >
                  Save <span className="font-mono text-[10px] text-emerald-900">F5</span>
                </button>

                {/* Refresh F6 */}
                <button
                  type="button"
                  onClick={handleRefresh}
                  className="px-3 py-1 bg-[#c0c0c0] hover:bg-sky-200 text-slate-950 border-2 border-t-white border-l-white border-r-zinc-700 border-b-zinc-700 rounded-sm text-xs font-bold shadow active:border-t-zinc-700 active:border-l-zinc-700 active:border-r-white active:border-b-white"
                >
                  Refresh <span className="font-mono text-[10px] text-zinc-600">F6</span>
                </button>

                {/* Main Menu F8 */}
                <button
                  type="button"
                  onClick={() => navigate("/dashboard")}
                  className="px-3 py-1 bg-[#fcd34d] hover:bg-[#fbbf24] text-amber-950 border-2 border-t-white border-l-white border-r-amber-700 border-b-amber-700 rounded-sm text-xs font-black shadow active:border-t-amber-700 active:border-l-amber-700 active:border-r-white active:border-b-white"
                >
                  Main Menu <span className="font-mono text-[10px] text-amber-900">F8</span>
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
