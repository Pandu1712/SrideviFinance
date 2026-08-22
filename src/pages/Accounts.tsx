import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLine } from "@/contexts/LineContext";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ShieldAlert, KeyRound, ArrowRightLeft, BookOpen, Calendar as CalendarIcon, UserPlus, Info, Printer, Download, FileSpreadsheet } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc, getDocs, where } from "firebase/firestore";
import { formatDate } from "@/lib/utils";

const formatToDDMMYY = (dateStr: any) => {
  if (!dateStr) return "-";
  try {
    if (dateStr && typeof dateStr.toDate === "function") {
      const dObj = dateStr.toDate();
      const day = String(dObj.getDate()).padStart(2, "0");
      const month = String(dObj.getMonth() + 1).padStart(2, "0");
      const year = String(dObj.getFullYear()).slice(2);
      return `${day}-${month}-${year}`;
    }
    if (typeof dateStr === "string") {
      const parts = dateStr.split("-");
      if (parts.length === 3 && parts[0].length === 4) {
        return `${parts[2]}-${parts[1]}-${parts[0].slice(2)}`;
      }
    }
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

// Module-scoped set to track checked lines during session to prevent double seeding in strict mode
const checkedLinesForSession = new Set<string>();

const Accounts = () => {
  const navigate = useNavigate();
  const { selectedLineId, lines } = useLine();
  const currentLine = lines.find(l => l.id === selectedLineId);
  const lineName = currentLine ? currentLine.name : "GENERAL";
  
  // Views
  const [activeView, setActiveView] = useState<"menu" | "new-account" | "posting" | "investor-finance" | "trial-balance">("menu");

  // Dialog States
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // General Ledger Form States
  const [acNo, setAcNo] = useState("");
  const [acName, setAcName] = useState("");
  const [acType, setAcType] = useState("Investment");
  const [interestRateMonthly, setInterestRateMonthly] = useState("0");
  const [interestRateDaily, setInterestRateDaily] = useState("0");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [group, setGroup] = useState("Direct Income");
  const [category, setCategory] = useState("Investment");

  // Database Ledger States
  const [ledgerAccounts, setLedgerAccounts] = useState<any[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<any | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);

  // Posting View States
  const [postingDate, setPostingDate] = useState(new Date().toISOString().split("T")[0]);
  const [jamaVal, setJamaVal] = useState("");
  const [kharchuVal, setKharchuVal] = useState("");
  const [selectedLedger, setSelectedLedger] = useState<any | null>(null);
  const [descriptionVal, setDescriptionVal] = useState("Manual Entry");
  const [interestFree, setInterestFree] = useState(false);
  
  // Dynamic aggregations from main collections
  const [aggregatedPostings, setAggregatedPostings] = useState<any[]>([]);
  const [manualLedgerPostings, setManualLedgerPostings] = useState<any[]>([]);
  const [selectedManualEntry, setSelectedManualEntry] = useState<any | null>(null);
  const [selectedAggregatedDate, setSelectedAggregatedDate] = useState<string | null>(null);

  // Investor Finance States
  const calculateDays = (transDateStr: string, asOfDateStr: string) => {
    if (!transDateStr || !asOfDateStr) return 0;
    try {
      const dTrans = new Date(transDateStr);
      const dAsOf = new Date(asOfDateStr);
      if (isNaN(dTrans.getTime()) || isNaN(dAsOf.getTime())) return 0;
      
      const diffTime = dAsOf.getTime() - dTrans.getTime();
      if (diffTime < 0) return 0;
      
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
      return diffDays;
    } catch (e) {
      return 0;
    }
  };

  const investorAccountsOnly = useMemo(() => {
    return ledgerAccounts.filter(acc => 
      (acc.acType || "").toLowerCase() === "investment" ||
      (acc.category || "").toLowerCase() === "investment"
    );
  }, [ledgerAccounts]);

  const [selectedInvestorAcc, setSelectedInvestorAcc] = useState<any | null>(null);
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split("T")[0]);
  const [allLineLedgerPostings, setAllLineLedgerPostings] = useState<any[]>([]);

  // Sync all manual postings for the current operational line
  useEffect(() => {
    if (!selectedLineId) {
      setAllLineLedgerPostings([]);
      return;
    }
    const q = query(
      collection(db, "ledger_postings"),
      where("lineId", "==", selectedLineId)
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      list.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
      setAllLineLedgerPostings(list);
    });
    return () => unsubscribe();
  }, [selectedLineId]);

  // Compute investor postings in memory
  const investorPostings = useMemo(() => {
    const investorIds = new Set(investorAccountsOnly.map(a => a.id));
    const list = allLineLedgerPostings.filter(p => investorIds.has(p.ledgerId));
    if (!selectedInvestorAcc) {
      return list;
    }
    return list.filter(p => p.ledgerId === selectedInvestorAcc.id);
  }, [allLineLedgerPostings, investorAccountsOnly, selectedInvestorAcc]);
  const [allLineCustomers, setAllLineCustomers] = useState<any[]>([]);
  const [allLineDailyPostings, setAllLineDailyPostings] = useState<any[]>([]);
  const [allLineExpenses, setAllLineExpenses] = useState<any[]>([]);

  // Sync Customer accounts, Daily postings, and Expense logs for Trial Balance calculations
  useEffect(() => {
    if (activeView !== "trial-balance" || !selectedLineId) return;

    // Sync Customer accounts
    const qCust = query(
      collection(db, "accounts"),
      where("lineId", "==", selectedLineId)
    );
    const unsubCust = onSnapshot(qCust, (snap) => {
      setAllLineCustomers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
    });

    // Sync Daily collections/disbursements/charges postings
    const qPost = query(
      collection(db, "postings"),
      where("lineId", "==", selectedLineId)
    );
    const unsubPost = onSnapshot(qPost, (snap) => {
      setAllLineDailyPostings(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
    });

    // Sync Expense log entries
    const qExp = query(
      collection(db, "expenses_log"),
      where("lineId", "==", selectedLineId)
    );
    const unsubExp = onSnapshot(qExp, (snap) => {
      setAllLineExpenses(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
    });

    return () => {
      unsubCust();
      unsubPost();
      unsubExp();
    };
  }, [activeView, selectedLineId]);

  // Compute double-entry Trial Balance rows in memory
  const trialBalanceRows = useMemo(() => {
    const rows: { name: string; group: string; debit: number; credit: number }[] = [];
    
    // Track cash in hand calculations
    let totalCashInflow = 0;
    let totalCashOutflow = 0;

    // A. Operational: Customer Loan Portfolio (Asset)
    let outstandingLoanTotal = 0;
    allLineCustomers.forEach(c => {
      const totalAmount = parseFloat(c.totalAmount) || 0;
      const initialPaid = parseFloat(c.initialPaid) || 0;
      
      const cPostings = allLineDailyPostings.filter(p => p.accountId === c.id && (p.status === "collection" || p.status === "other") && p.verified !== false);
      const postPaid = cPostings.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
      
      const paid = initialPaid + postPaid;
      const outstanding = Math.max(0, totalAmount - paid);
      outstandingLoanTotal += outstanding;

      // Cash flow: initialPaid is Cash Inflow
      totalCashInflow += initialPaid;
    });

    if (outstandingLoanTotal > 0) {
      rows.push({
        name: "CUSTOMER LOANS RECEIVABLE PORTFOLIO",
        group: "Asset / Receivable",
        debit: outstandingLoanTotal,
        credit: 0
      });
    }

    // B. Operational: Interest Income (Vaddi)
    let totalRealizedInterest = 0;
    allLineCustomers.forEach(c => {
      const total = parseFloat(c.totalAmount) || 0;
      const interest = parseFloat(c.interestAmount) || 0;
      const initialPaid = parseFloat(c.initialPaid) || 0;
      const cPostings = allLineDailyPostings.filter(p => p.accountId === c.id && (p.status === "collection" || p.status === "other") && p.verified !== false);
      const postPaid = cPostings.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
      const paid = initialPaid + postPaid;
      const interestPortion = total > 0 ? (paid / total) * interest : 0;
      totalRealizedInterest += interestPortion;
    });

    if (totalRealizedInterest > 0) {
      rows.push({
        name: "INTEREST RECEIVED ON LOANS (VADDI)",
        group: "Direct Income",
        debit: 0,
        credit: totalRealizedInterest
      });
    }

    // C. Operational: Commission & Document Charges (Income)
    let totalDocCharges = 0;
    allLineCustomers.forEach(c => {
      totalDocCharges += parseFloat(c.documentCharge || "0");
      totalDocCharges += parseFloat(c.commission || "0");
    });
    // Cash flow: doc charges and commission are cash inflow
    totalCashInflow += totalDocCharges;

    if (totalDocCharges > 0) {
      rows.push({
        name: "COMMISSION & DOCUMENT CHARGES INCOME",
        group: "Direct Income",
        debit: 0,
        credit: totalDocCharges
      });
    }

    // D. Operational: Penalty Received (Income)
    let totalPenalties = 0;
    allLineDailyPostings.forEach(p => {
      if ((p.status || "").toLowerCase() === "collection" || (p.status || "").toLowerCase() === "other") {
        totalPenalties += parseFloat(p.penaltyAmount || "0");
      }
      if ((p.status || "").toLowerCase() === "penalty") {
        totalPenalties += parseFloat(p.amount || "0");
      }
    });
    // Cash flow: penalty is cash inflow
    totalCashInflow += totalPenalties;

    if (totalPenalties > 0) {
      rows.push({
        name: "PENALTY RECEIVED",
        group: "Indirect Income",
        debit: 0,
        credit: totalPenalties
      });
    }

    // E. Daily Collections Cash Inflow
    allLineDailyPostings.forEach(p => {
      const amt = parseFloat(p.amount) || 0;
      const status = (p.status || "").toLowerCase();
      if (p.verified !== false) {
        if (status === "collection" || status === "other") {
          totalCashInflow += amt;
        } else if (status === "disbursement" || status === "payment") {
          totalCashOutflow += amt;
        }
      }
    });

    // F. Expenses (Sadar & General Expense Logs)
    let totalExpenses = 0;
    allLineExpenses.forEach(e => {
      totalExpenses += parseFloat(e.amount) || 0;
    });
    // Cash flow: expenses are cash outflow
    totalCashOutflow += totalExpenses;

    // G. General Ledger Accounts (Investment, expenditure, bank, chits, etc.)
    ledgerAccounts.forEach(acc => {
      const code = String(acc.acNo);
      if (["2", "3", "5", "6"].includes(code)) return;

      const accPostings = allLineLedgerPostings.filter(p => p.ledgerId === acc.id);
      const isInv = (acc.acType || "").toLowerCase() === "investment" || (acc.category || "").toLowerCase() === "investment";
      
      let totJ = 0;
      let totK = 0;
      let totIJ = 0;
      let totIK = 0;
      
      const dailyRate = parseFloat(acc.interestRateDaily) || 0.05;

      accPostings.forEach(p => {
        const jama = parseFloat(p.jama) || 0;
        const kharchu = parseFloat(p.kharchu) || 0;
        
        totJ += jama;
        totK += kharchu;
        
        if (isInv && !p.interestFree) {
          const days = calculateDays(p.date, asOfDate);
          totIJ += jama > 0 ? jama * (dailyRate / 100) * days : 0;
          totIK += kharchu > 0 ? kharchu * (dailyRate / 100) * days : 0;
        }
      });

      // Cash flow: Investment JAMA is cash inflow, Investment KHARCHU is cash outflow
      totalCashInflow += totJ;
      totalCashOutflow += totK;

      const netBalance = (totJ + totIJ) - (totK + totIK);
      if (Math.abs(netBalance) > 0.01) {
        if (netBalance > 0) {
          rows.push({
            name: `${acc.acNo} - ${acc.acName}`,
            group: acc.group || "Investment",
            debit: 0,
            credit: netBalance
          });
        } else {
          rows.push({
            name: `${acc.acNo} - ${acc.acName}`,
            group: acc.group || "Direct Expenses",
            debit: Math.abs(netBalance),
            credit: 0
          });
        }
      }
    });

    if (totalExpenses > 0) {
      rows.push({
        name: "OFFICE EXPENDITURES (EXPENSES)",
        group: "Direct Expenses",
        debit: totalExpenses,
        credit: 0
      });
    }

    // H. Cash In Hand (Difference of inflow and outflow)
    const cashInHand = totalCashInflow - totalCashOutflow;
    if (Math.abs(cashInHand) > 0.01) {
      if (cashInHand > 0) {
        rows.push({
          name: "CASH IN HAND",
          group: "Asset / Cash",
          debit: cashInHand,
          credit: 0
        });
      } else {
        rows.push({
          name: "CASH IN HAND (OVERDRAFT)",
          group: "Asset / Cash",
          debit: 0,
          credit: Math.abs(cashInHand)
        });
      }
    }

    return rows;
  }, [allLineCustomers, allLineDailyPostings, allLineExpenses, ledgerAccounts, allLineLedgerPostings, asOfDate]);
  // Sync general ledger accounts from Firestore for the active line
  useEffect(() => {
    if (!selectedLineId) return;

    const q = query(
      collection(db, "ledger_accounts"),
      where("lineId", "==", selectedLineId)
    );
    
    const unsubscribe = onSnapshot(q, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      // Sort by numerical acNo
      list.sort((a, b) => {
        const numA = parseInt(a.acNo, 10);
        const numB = parseInt(b.acNo, 10);
        if (isNaN(numA) || isNaN(numB)) return a.acNo.localeCompare(b.acNo);
        return numA - numB;
      });
      setLedgerAccounts(list);
    });
    return () => unsubscribe();
  }, [selectedLineId]);

  // Safe check & seed the 15 default ledger accounts once if empty or incomplete for this line (session-locked)
  useEffect(() => {
    if (!selectedLineId || checkedLinesForSession.has(selectedLineId) || isSeeding) return;
    
    const checkAndSeed = async () => {
      checkedLinesForSession.add(selectedLineId);
      setIsSeeding(true);
      try {
        const q = query(
          collection(db, "ledger_accounts"),
          where("lineId", "==", selectedLineId)
        );
        const snap = await getDocs(q);
        const docsList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        
        const linePrefix = (lineName.match(/^\d+/)?.[0] || lineName.split(" ")[0] || lineName).toUpperCase();
        
        const target15 = [
          { acNo: "0", acName: `LINE 3 LAKSHMI DEVI A/C`, acType: "Investment", interestRateMonthly: "0", interestRateDaily: "0", date: "2026-08-01", group: "Investment", category: "Investment", lineId: selectedLineId },
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
          { acNo: "14", acName: `LINE ${linePrefix} TICKETS`, acType: "Vaddi", interestRateMonthly: "0", interestRateDaily: "0", date: "2026-08-01", group: "Direct Income", category: "Vaddi", lineId: selectedLineId }
        ];

        // 1. Purge any accounts that do not strictly match the target 15 codes and names
        for (const docObj of docsList) {
          const targetItem = target15.find(t => t.acNo === docObj.acNo);
          if (!targetItem || docObj.acName !== targetItem.acName) {
            await deleteDoc(doc(db, "ledger_accounts", docObj.id));
          }
        }

        // 2. Insert any of the 15 default accounts that are missing
        const postPurgeSnap = await getDocs(query(collection(db, "ledger_accounts"), where("lineId", "==", selectedLineId)));
        const postPurgeCodes = new Set(postPurgeSnap.docs.map(d => d.data().acNo));
        
        for (const item of target15) {
          if (!postPurgeCodes.has(item.acNo)) {
            await addDoc(collection(db, "ledger_accounts"), item);
          }
        }
        
      } catch (e) {
        console.error("Seeding error:", e);
      } finally {
        setIsSeeding(false);
      }
    };

    checkAndSeed();
  }, [selectedLineId, lineName]);

  // Clean duplicates and sanitize entries (Run once per selected line change)
  useEffect(() => {
    if (!selectedLineId || ledgerAccounts.length === 0) return;

    const deduplicateAndPurge = async () => {
      const seen = new Set<string>();
      for (const acc of ledgerAccounts) {
        const name = acc.acName || "";
        if (seen.has(acc.acNo) || name.startsWith("LINE LINE")) {
          try {
            await deleteDoc(doc(db, "ledger_accounts", acc.id));
          } catch (e) {
            console.error("Deduplication error:", e);
          }
        } else {
          seen.add(acc.acNo);
        }
      }
    };
    deduplicateAndPurge();
  }, [selectedLineId, ledgerAccounts]);

  // Aggregate daily postings dynamically inside the posting view
  useEffect(() => {
    if (activeView !== "posting" || !selectedLineId || !selectedLedger) {
      setAggregatedPostings([]);
      setSelectedAggregatedDate(null);
      return;
    }

    const q = query(
      collection(db, "postings"),
      where("lineId", "==", selectedLineId)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const postingsList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      
      const acNo = selectedLedger.acNo;
      
      let filtered: any[] = [];
      let mode: "commission" | "collection" | "payment" | "none" = "none";
      
      if (acNo === "2" || acNo === 2) {
        mode = "commission";
        filtered = postingsList.filter(p => p.status === "charge" || (p.documentCharge && parseFloat(p.documentCharge) > 0));
      } else if (acNo === "3" || acNo === 3) {
        mode = "collection";
        filtered = postingsList.filter(p => p.status === "collection" || p.status === "other");
      } else if (acNo === "4" || acNo === 4) {
        mode = "payment";
        filtered = postingsList.filter(p => p.status === "disbursement" || p.status === "payment");
      }

      const groupMap: { [date: string]: { date: string; amount: number; type: string } } = {};
      
      filtered.forEach(p => {
        const d = p.date || new Date().toISOString().split("T")[0];
        let amt = 0;
        
        if (mode === "commission") {
          if (p.status === "charge") {
            amt += parseFloat(p.amount) || 0;
          }
          if (p.documentCharge) {
            amt += parseFloat(p.documentCharge) || 0;
          }
        } else if (mode === "collection") {
          amt += parseFloat(p.amount) || 0;
          if (p.extraAmount) amt += parseFloat(p.extraAmount) || 0;
          if (p.penaltyAmount) amt += parseFloat(p.penaltyAmount) || 0;
        } else if (mode === "payment") {
          amt += parseFloat(p.amount) || 0;
        }
        
        if (amt > 0) {
          if (!groupMap[d]) {
            groupMap[d] = { 
              date: d, 
              amount: 0, 
              type: mode.toUpperCase()
            };
          }
          groupMap[d].amount += amt;
        }
      });

      const sortedAggregated = Object.values(groupMap).sort((a, b) => b.date.localeCompare(a.date));
      setAggregatedPostings(sortedAggregated);
    });

    return () => unsubscribe();
  }, [activeView, selectedLineId, selectedLedger]);

  // Sync manual ledger postings
  useEffect(() => {
    if (activeView !== "posting" || !selectedLedger) {
      setManualLedgerPostings([]);
      return;
    }

    const q = query(
      collection(db, "ledger_postings"),
      where("ledgerId", "==", selectedLedger.id)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      list.sort((a, b) => b.date.localeCompare(a.date));
      setManualLedgerPostings(list);
    });

    return () => unsubscribe();
  }, [activeView, selectedLedger]);

  const handleSendPosting = async () => {
    if (!selectedLedger) {
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
      if (selectedManualEntry) {
        // UPDATE Existing Manual Entry
        const docRef = doc(db, "ledger_postings", selectedManualEntry.id);
        await updateDoc(docRef, {
          date: postingDate,
          jama,
          kharchu,
          description: descriptionVal,
          interestFree
        });
        toast.success("Manual posting updated successfully!");
        setSelectedManualEntry(null);
        setSelectedAggregatedDate(null);
      } else {
        // CREATE/SAVE New Manual Entry or Override
        const payload = {
          ledgerId: selectedLedger.id,
          date: postingDate,
          jama,
          kharchu,
          description: descriptionVal,
          interestFree,
          lineId: selectedLineId || ""
        };

        await addDoc(collection(db, "ledger_postings"), payload);
        toast.success("Manual posting saved successfully!");
        setSelectedAggregatedDate(null);
      }
      setJamaVal("");
      setKharchuVal("");
      setDescriptionVal("Manual Entry");
      setInterestFree(false);
    } catch (err) {
      toast.error("Failed to save manual posting entry");
    }
  };

  const handleDeletePosting = async () => {
    if (!selectedManualEntry) return;
    try {
      await deleteDoc(doc(db, "ledger_postings", selectedManualEntry.id));
      toast.success("Manual posting entry deleted!");
      setSelectedManualEntry(null);
      setSelectedAggregatedDate(null);
      setJamaVal("");
      setKharchuVal("");
    } catch (err) {
      toast.error("Failed to delete entry");
    }
  };

  const handleComingSoon = (title: string) => {
    setModalTitle(title);
    setModalOpen(true);
  };

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || !confirmPassword) {
      toast.error("Please fill in all fields");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    toast.success("Password updated successfully!");
    setPasswordOpen(false);
    setNewPassword("");
    setConfirmPassword("");
  };

  // Form CRUD operations
  const handleEditSave = async () => {
    if (!acNo || !acName) {
      toast.error("Account Number and Account Name are required");
      return;
    }

    const payload = {
      acNo,
      acName: acName.toUpperCase(),
      acType,
      interestRateMonthly,
      interestRateDaily,
      date,
      group,
      category,
      lineId: selectedLineId || ""
    };

    try {
      if (selectedAccount) {
        // Update existing account
        const docRef = doc(db, "ledger_accounts", selectedAccount.id);
        await updateDoc(docRef, payload);
        toast.success("Ledger account updated successfully!");
      } else {
        // Double check for duplicate code number
        const exists = ledgerAccounts.some(acc => acc.acNo === acNo);
        if (exists) {
          toast.error(`Account number ${acNo} already exists!`);
          return;
        }
        // Create new account
        await addDoc(collection(db, "ledger_accounts"), payload);
        toast.success("Ledger account created successfully!");
      }
      handleCancel();
    } catch (err) {
      toast.error("Failed to save ledger account");
    }
  };

  const handleDelete = async () => {
    if (!selectedAccount) {
      toast.error("No account selected for deletion");
      return;
    }
    if (!window.confirm(`Are you sure you want to delete ${selectedAccount.acName}?`)) {
      return;
    }
    try {
      const docRef = doc(db, "ledger_accounts", selectedAccount.id);
      await deleteDoc(docRef);
      toast.success("Ledger account deleted successfully");
      handleCancel();
    } catch (err) {
      toast.error("Failed to delete ledger account");
    }
  };

  const handleCancel = () => {
    setSelectedAccount(null);
    setAcNo("");
    setAcName("");
    setAcType("Investment");
    setInterestRateMonthly("0");
    setInterestRateDaily("0");
    setDate(new Date().toISOString().split("T")[0]);
    setGroup("Direct Income");
    setCategory("Investment");
  };

  const handleSelectAccount = (acc: any) => {
    setSelectedAccount(acc);
    setAcNo(acc.acNo || "");
    setAcName(acc.acName || "");
    setAcType(acc.acType || "Investment");
    setInterestRateMonthly(acc.interestRateMonthly || "0");
    setInterestRateDaily(acc.interestRateDaily || "0");
    setDate(acc.date || new Date().toISOString().split("T")[0]);
    setGroup(acc.group || "Direct Income");
    setCategory(acc.category || "Investment");
  };

  // Menu Configs
  const menuButtons = [
    { label: "New Account", action: () => setActiveView("new-account") },
    { label: "Posting", action: () => {
        setActiveView("posting");
        if (ledgerAccounts.length > 0) {
          setSelectedLedger(ledgerAccounts[0]);
        }
      }
    },
    { label: "Account display", action: () => navigate("/ledger") },
    { label: "Interest Calculator", action: () => navigate("/calculator") },
    { label: "Investor's Account (Finance Type)", action: () => {
        setActiveView("investor-finance");
        setSelectedInvestorAcc(null);
      }
    },
    { label: "Investor's Account (Bank Type)", action: () => handleComingSoon("Investor's Account (Bank Type)") },
    { label: "DV Interests", action: () => handleComingSoon("DV Interests") },
    { label: "Chit Account", action: () => handleComingSoon("Chit Account") },
    { label: "Trial Balance", action: () => setActiveView("trial-balance") },
    { label: "Posting Details", action: () => navigate("/posting-search") },
    { label: "Shift to Finance", action: () => navigate("/shift-accounts") },
    { label: "Change Password", action: () => setPasswordOpen(true) },
    { label: "Line List", action: () => navigate("/select-line") },
    { label: "Exit", action: () => navigate("/dashboard") },
  ];

  // Filtering Logic
  const filteredAccounts = categoryFilter
    ? ledgerAccounts.filter(acc => 
        acc.acType.toLowerCase() === categoryFilter.toLowerCase() ||
        acc.category.toLowerCase() === categoryFilter.toLowerCase()
      )
    : ledgerAccounts;

  const finalAggregatedPostings = useMemo(() => {
    const map: { [date: string]: { date: string; amount: number; type: string } } = {};
    
    aggregatedPostings.forEach(p => {
      map[p.date] = { ...p, amount: parseFloat(p.amount) || 0 };
    });
    
    manualLedgerPostings.forEach(m => {
      const d = m.date;
      const jVal = parseFloat(m.jama) || 0;
      const kVal = parseFloat(m.kharchu) || 0;
      const amt = jVal > 0 ? jVal : kVal;
      
      let typeStr = "MANUAL";
      if (selectedLedger) {
        const nameUpper = (selectedLedger.acName || "").toUpperCase();
        if (nameUpper.includes("COMMISSION")) {
          typeStr = "COMMISSION";
        } else if (nameUpper.includes("COLLECTION")) {
          typeStr = "COLLECTION";
        } else if (nameUpper.includes("PAYMENT")) {
          typeStr = "PAYMENT";
        }
      }
      
      if (kVal > 0) {
        typeStr = "PAYMENT";
      } else if (jVal > 0 && typeStr === "MANUAL") {
        typeStr = "COLLECTION";
      }
      
      map[d] = {
        date: d,
        amount: amt,
        type: typeStr
      };
    });
    
    return Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
  }, [aggregatedPostings, manualLedgerPostings, selectedLedger]);

  const { totalJama, totalKharchu } = useMemo(() => {
    let jama = 0;
    let kharchu = 0;
    finalAggregatedPostings.forEach(p => {
      const val = parseFloat(p.amount as any) || 0;
      if (p.type === "PAYMENT") {
        kharchu += val;
      } else {
        jama += val;
      }
    });
    return { totalJama: jama, totalKharchu: kharchu };
  }, [finalAggregatedPostings]);

  const currentBalance = totalJama - totalKharchu;

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-slate-900/40 p-2 sm:p-6">
      <AnimatePresence mode="wait">
        {activeView === "menu" && (
          /* Outer Shell resembling traditional monitor layout - Main Menu */
          <motion.div
            key="menu-view"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="w-full max-w-5xl bg-[#091515] border-[6px] border-double border-amber-500/80 rounded-[2.5rem] p-6 sm:p-10 shadow-[0_0_50px_rgba(245,158,11,0.15)] relative overflow-hidden flex flex-col"
          >
            {/* Decorative corner accents */}
            <div className="absolute top-4 left-4 text-amber-500/30 text-2xl select-none font-serif">卐</div>
            <div className="absolute top-4 right-4 text-amber-500/30 text-2xl select-none font-serif">卐</div>
            <div className="absolute bottom-4 left-4 text-amber-500/30 text-2xl select-none font-serif">卐</div>
            <div className="absolute bottom-4 right-4 text-amber-500/30 text-2xl select-none font-serif">卐</div>

            {/* Portal Title Header */}
            <div className="text-center mb-8 border-b-2 border-amber-500/30 pb-4 relative">
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-[0.25em] text-amber-500 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] font-serif">
                {lineName.toUpperCase()}
              </h2>
              <div className="absolute left-1/2 -bottom-[5px] -translate-x-1/2 w-24 h-[10px] bg-[#091515] flex items-center justify-center">
                <span className="text-[10px] font-black tracking-widest text-amber-500/60 uppercase">Portal</span>
              </div>
            </div>

            {/* Dynamic Dual Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center flex-1">
              
              {/* Ganesha Panel Card */}
              <div className="flex flex-col items-center justify-center p-4 border-4 border-double border-amber-500/70 rounded-2xl bg-emerald-950/20 backdrop-blur-sm relative group overflow-hidden h-[30rem] sm:h-[35rem] shadow-inner">
                <div className="absolute inset-0 bg-gradient-to-t from-emerald-950/30 via-transparent to-transparent pointer-events-none" />
                
                {/* Top Swastikas */}
                <div className="absolute top-4 left-4 text-amber-500/70 text-lg font-serif">卐</div>
                <div className="absolute top-4 right-4 text-amber-500/70 text-lg font-serif">卐</div>

                {/* Glowing Aura Effect */}
                <div className="absolute w-64 h-64 rounded-full bg-amber-500/10 blur-[80px] -translate-y-6 group-hover:bg-amber-500/20 transition-all duration-1000" />
                
                {/* Ganesha SVG Artwork */}
                <svg
                  viewBox="0 0 100 100"
                  className="w-48 h-48 sm:w-60 sm:h-60 text-amber-500/90 filter drop-shadow-[0_4px_12px_rgba(245,158,11,0.3)] transition-transform duration-700 group-hover:scale-105"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {/* Crown (Mukut) */}
                  <path d="M42 22 L50 8 L58 22 Z" fill="currentColor" fillOpacity="0.1" />
                  <path d="M40 22 H60 M43 18 H57 M46 14 H54" strokeWidth="2" />
                  
                  {/* Ears */}
                  <path d="M35 32 C20 28 25 55 35 48" strokeWidth="1.8" />
                  <path d="M65 32 C80 28 75 55 65 48" strokeWidth="1.8" />

                  {/* Head & Eyes */}
                  <circle cx="50" cy="30" r="12" fill="currentColor" fillOpacity="0.05" />
                  <path d="M46 32 C48 31 49 31 50 32 M54 32 C52 31 51 31 50 32" strokeWidth="1.5" />
                  {/* Tilak */}
                  <path d="M50 20 V28 M48 22 H52" strokeWidth="2" stroke="red" />

                  {/* Trunk (Vakratunda) */}
                  <path d="M50 38 C50 44 44 48 44 54 C44 60 54 62 56 56 C57 53 54 50 50 48" strokeWidth="2" />

                  {/* Modak on Hand */}
                  <circle cx="58" cy="54" r="3" fill="currentColor" />
                  
                  {/* Lotus Base */}
                  <path d="M30 75 C35 70 45 70 50 75 C55 70 65 70 70 75 C60 85 40 85 30 75 Z" fill="currentColor" fillOpacity="0.15" />
                  <path d="M25 78 C35 76 45 76 50 80 C55 76 65 76 75 78 M35 81 C45 83 55 83 65 81" />
                </svg>

                {/* Sub-label */}
                <p className="mt-8 text-amber-500 font-bold uppercase tracking-[0.3em] text-xs text-center drop-shadow-md font-serif">
                  {lineName}
                </p>
              </div>

              {/* Accounts Operational Buttons */}
              <div className="flex flex-col gap-2 max-h-[30rem] sm:max-h-[35rem] overflow-y-auto pr-2 custom-scrollbar">
                {menuButtons.map((btn, idx) => (
                  <motion.button
                    key={idx}
                    whileHover={{ scale: 1.015, x: 2 }}
                    whileTap={{ scale: 0.985 }}
                    onClick={btn.action}
                    className="w-full bg-[#18FFFF] hover:bg-[#84FFFF] text-slate-900 font-extrabold text-sm uppercase tracking-wider border border-cyan-400 py-3 rounded-lg shadow-[0_4px_12px_rgba(24,255,255,0.15)] hover:shadow-[0_6px_20px_rgba(24,255,255,0.3)] transition-all duration-200 text-center"
                  >
                    {btn.label}
                  </motion.button>
                ))}
              </div>

            </div>
          </motion.div>
        )}
        
        {activeView === "new-account" && (
          /* Outer Shell resembling traditional monitor layout - Retro New Account Form */
          <motion.div
            key="form-view"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="w-full max-w-5xl bg-[#091515] border-[6px] border-double border-amber-500/80 rounded-[2.5rem] p-4 sm:p-8 shadow-[0_0_50px_rgba(245,158,11,0.15)] relative overflow-hidden flex flex-col"
          >
            {/* Corner symbols */}
            <div className="absolute top-4 left-4 text-amber-500/30 text-xl font-serif">卐</div>
            <div className="absolute top-4 right-4 text-amber-500/30 text-xl font-serif">卐</div>
            <div className="absolute bottom-4 left-4 text-amber-500/30 text-xl font-serif">卐</div>
            <div className="absolute bottom-4 right-4 text-amber-500/30 text-xl font-serif">卐</div>

            {/* Title Bar */}
            <div className="text-center mb-6 border-b border-amber-500/20 pb-3 flex justify-between items-center px-4">
              <h2 className="text-xl sm:text-2xl font-bold tracking-widest text-amber-500 font-serif">
                {lineName.toUpperCase()} LEDGER CREATOR
              </h2>
              <span className="text-[10px] text-slate-500 tracking-wider">TOTAL LEDGERS: {ledgerAccounts.length}</span>
            </div>

            {/* Main Terminal Frame */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch flex-1">
              
              {/* Left sidebar menu links */}
              <div className="lg:col-span-3 flex lg:flex-col flex-wrap gap-2 justify-start border-r border-amber-500/10 pr-2">
                <span className="text-[9px] font-black uppercase text-amber-500/40 tracking-widest mb-1 hidden lg:block">Category Filter</span>
                {[
                  "Investment",
                  "Expenditure",
                  "Chits",
                  "Sadar",
                  "Vaddi",
                  "Profit",
                  "Aara"
                ].map((menuItem) => (
                  <button
                    key={menuItem}
                    type="button"
                    onClick={() => setCategoryFilter(categoryFilter === menuItem ? null : menuItem)}
                    className={`text-left text-sm font-black uppercase py-1.5 px-3 rounded transition-all w-full text-[13px] ${
                      categoryFilter === menuItem 
                        ? "bg-[#18FFFF] text-slate-900 border border-cyan-400 font-black" 
                        : "text-[#18FFFF] hover:text-white hover:bg-slate-800/40"
                    }`}
                  >
                    {menuItem}
                  </button>
                ))}
                {categoryFilter && (
                  <button
                    type="button"
                    onClick={() => setCategoryFilter(null)}
                    className="text-left text-xs font-black text-rose-400 hover:text-rose-300 py-1.5 px-3 uppercase tracking-tighter"
                  >
                    Clear Filter
                  </button>
                )}
              </div>

              {/* Center Form Card */}
              <div className="lg:col-span-5 bg-zinc-300 border-2 border-t-white border-l-white border-r-zinc-600 border-b-zinc-600 p-4 sm:p-6 rounded-md shadow-2xl flex flex-col justify-between text-slate-950 font-sans">
                
                {/* Simulated window header bar */}
                <div className="bg-gradient-to-r from-orange-500 to-amber-600 px-3 py-1.5 rounded-sm flex items-center justify-between text-white font-bold text-xs tracking-wider mb-4 border border-b-amber-700 border-r-amber-700">
                  <span>LEDGER REGISTRATION PROFILE</span>
                  <span className="text-[9px]">***</span>
                </div>

                <div className="space-y-3">
                  {/* Row 1: Ac. No. & Ac. Type */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs font-bold text-slate-800">Ac. No.</Label>
                      <input
                        type="text"
                        value={acNo}
                        onChange={e => setAcNo(e.target.value)}
                        placeholder="e.g. 7"
                        className="w-full bg-white text-slate-950 px-2 py-1 border border-zinc-400 rounded-sm text-xs font-mono font-bold focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs font-bold text-slate-800">Ac. Type</Label>
                      <select
                        value={acType}
                        onChange={e => setAcType(e.target.value)}
                        className="w-full bg-white text-slate-950 px-2 py-1 border border-zinc-400 rounded-sm text-xs font-bold focus:outline-none focus:ring-1 focus:ring-amber-500"
                      >
                        {[
                          "Investment", "Expenditure", "Chits", "Sadar", "Vaddi", "Profit", "Aara"
                        ].map(typeOpt => (
                          <option key={typeOpt} value={typeOpt}>{typeOpt}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Row 2: Ac. Name */}
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-slate-800">Ac. Name</Label>
                    <input
                      type="text"
                      value={acName}
                      onChange={e => setAcName(e.target.value)}
                      placeholder="e.g. CUSTOM GENERAL LEDGER"
                      className="w-full bg-white text-slate-950 px-2 py-1 border border-zinc-400 rounded-sm text-xs font-bold focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>

                  {/* Row 3: Interest Rates */}
                  <div className="grid grid-cols-2 gap-2 border-y border-zinc-400/30 py-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold text-slate-700 block">Monthly Interest (%)</Label>
                      <input
                        type="text"
                        value={interestRateMonthly}
                        onChange={e => setInterestRateMonthly(e.target.value)}
                        className="w-full bg-white text-slate-950 px-2 py-1 border border-zinc-400 rounded-sm text-xs font-bold"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold text-slate-700 block">Daily Interest (%)</Label>
                      <input
                        type="text"
                        value={interestRateDaily}
                        onChange={e => setInterestRateDaily(e.target.value)}
                        className="w-full bg-white text-slate-950 px-2 py-1 border border-zinc-400 rounded-sm text-xs font-bold"
                      />
                    </div>
                  </div>

                  {/* Row 4: Date & Group */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs font-bold text-slate-800">Date</Label>
                      <div className="flex gap-1">
                        <input
                          type="date"
                          value={date}
                          onChange={e => setDate(e.target.value)}
                          className="flex-1 bg-white text-slate-950 px-2 py-1 border border-zinc-400 rounded-sm text-xs font-bold"
                        />
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => toast.success(`Paid date updated to: ${date}`)}
                          className="bg-zinc-400 hover:bg-zinc-500 text-slate-900 border border-zinc-500 font-bold text-[9px] h-7 px-2 rounded-sm"
                        >
                          Add Paid
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-bold text-slate-800">Group</Label>
                      <select
                        value={group}
                        onChange={e => setGroup(e.target.value)}
                        className="w-full bg-white text-slate-950 px-2 py-1 border border-zinc-400 rounded-sm text-xs font-bold"
                      >
                        {[
                          "Direct Income", "Capital", "Direct Expenses", "Indirect Expenses", "Indirect Income", "Investment"
                        ].map(gOpt => (
                          <option key={gOpt} value={gOpt}>{gOpt}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Row 5: Category */}
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-slate-800">Category</Label>
                    <select
                      value={category}
                      onChange={e => setCategory(e.target.value)}
                      className="w-full bg-white text-slate-950 px-2 py-1 border border-zinc-400 rounded-sm text-xs font-bold"
                    >
                      {["Investment", "Expenditure", "Chits", "Sadar", "Vaddi", "Profit", "Aara"].map(cOpt => (
                        <option key={cOpt} value={cOpt}>{cOpt}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Bevel Buttons */}
                <div className="flex gap-2 pt-6 border-t border-zinc-400/40 mt-4">
                  <button
                    type="button"
                    onClick={handleEditSave}
                    className="flex-1 bg-zinc-300 hover:bg-zinc-200 text-slate-900 py-2 border-2 border-t-white border-l-white border-r-zinc-600 border-b-zinc-600 font-bold uppercase tracking-wider text-[10px] sm:text-xs shadow-sm active:border-zinc-600 active:border-t-zinc-600 active:border-l-zinc-600 active:border-r-white active:border-b-white transition-all"
                  >
                    {selectedAccount ? "EDIT" : "CREATE"}
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={!selectedAccount}
                    className="flex-1 bg-zinc-300 hover:bg-rose-100 text-rose-700 py-2 border-2 border-t-white border-l-white border-r-zinc-600 border-b-zinc-600 font-bold uppercase tracking-wider text-[10px] sm:text-xs shadow-sm disabled:opacity-40 disabled:text-slate-400 active:border-zinc-600 active:border-t-zinc-600 active:border-l-zinc-600 active:border-r-white active:border-b-white transition-all"
                  >
                    DELETE
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="flex-1 bg-zinc-300 hover:bg-zinc-200 text-slate-850 py-2 border-2 border-t-white border-l-white border-r-zinc-600 border-b-zinc-600 font-bold uppercase tracking-wider text-[10px] sm:text-xs shadow-sm active:border-zinc-600 active:border-t-zinc-600 active:border-l-zinc-600 active:border-r-white active:border-b-white transition-all"
                  >
                    CANCEL
                  </button>
                </div>

              </div>

              {/* Right Side Ledgers List box */}
              <div className="lg:col-span-4 flex flex-col items-stretch justify-start border-l border-amber-500/10 pl-2 max-h-[30rem] lg:max-h-full">
                <div className="bg-slate-900 border-2 border-t-zinc-600 border-l-zinc-600 border-r-zinc-400 border-b-zinc-400 rounded p-3 flex flex-col h-full">
                  <Label className="text-[10px] font-black uppercase text-amber-500 tracking-widest mb-2 pb-1 border-b border-amber-500/20 block">
                    TOTAL LEDGERS ({filteredAccounts.length})
                  </Label>
                  <div className="bg-white rounded border border-zinc-400 overflow-y-auto flex-1 h-[22rem] custom-scrollbar">
                    {filteredAccounts.length === 0 ? (
                      <p className="p-4 text-xs italic text-slate-400 text-center font-mono">No ledgers in list</p>
                    ) : (
                      filteredAccounts.map((acc) => (
                        <div
                          key={acc.id}
                          onClick={() => handleSelectAccount(acc)}
                          className={`flex items-center justify-between p-2 text-xs font-mono border-b border-zinc-100 cursor-pointer select-none transition-all ${
                            selectedAccount?.id === acc.id
                              ? "bg-amber-100 text-amber-900 font-bold"
                              : "text-slate-900 hover:bg-slate-100"
                          }`}
                        >
                          <span className="w-8 font-black text-slate-500 pr-1">{acc.acNo}</span>
                          <span className="flex-1 truncate">{acc.acName}</span>
                          <span className="text-[9px] bg-slate-100 text-slate-600 px-1 rounded uppercase tracking-tighter ml-1">
                            {acc.acType}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

            </div>

            {/* Bottom Navigation Buttons */}
            <div className="flex gap-4 justify-center items-center border-t border-amber-500/20 pt-4 mt-6 print:hidden">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/ledger")}
                className="bg-slate-800 text-[#18FFFF] border border-cyan-400/40 hover:bg-slate-700/60 text-xs font-bold uppercase tracking-wider h-10 px-6"
              >
                Account Display
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/daily-posting")}
                className="bg-slate-800 text-[#18FFFF] border border-cyan-400/40 hover:bg-slate-700/60 text-xs font-bold uppercase tracking-wider h-10 px-6"
              >
                Posting
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  handleCancel();
                  setActiveView("menu");
                }}
                className="bg-[#18FFFF] text-slate-900 hover:bg-[#84FFFF] font-bold text-xs uppercase tracking-wider h-10 px-8 shadow"
              >
                Main Menu
              </Button>
            </div>

          </motion.div>
        )}

        {activeView === "posting" && (
          /* Outer Shell resembling traditional monitor layout - Retro Posting View */
          <motion.div
            key="posting-view"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="w-full max-w-6xl bg-[#091515] border-[6px] border-double border-amber-500/80 rounded-[2.5rem] p-4 sm:p-6 shadow-[0_0_50px_rgba(245,158,11,0.15)] relative overflow-hidden flex flex-col min-h-[38rem]"
          >
            {/* Corner symbols */}
            <div className="absolute top-4 left-4 text-amber-500/30 text-xl font-serif">卐</div>
            <div className="absolute top-4 right-4 text-amber-500/30 text-xl font-serif">卐</div>
            <div className="absolute bottom-4 left-4 text-amber-500/30 text-xl font-serif">卐</div>
            <div className="absolute bottom-4 right-4 text-amber-500/30 text-xl font-serif">卐</div>

            {/* Title Bar */}
            <div className="text-center mb-4 border-b border-amber-500/20 pb-2 flex justify-between items-center px-4">
              <h2 className="text-lg sm:text-xl font-bold tracking-widest text-amber-500 font-serif animate-pulse">
                {lineName.toUpperCase()} LEDGER POSTING
              </h2>
              <span className="text-[10px] text-slate-500 tracking-wider">Sri Devi Groups</span>
            </div>

            {/* Three-Column Retro Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch flex-1 text-slate-950 font-sans text-xs">
              
              {/* Left Column: Transaction Input & Manual Postings Grid */}
              <div className="lg:col-span-6 bg-zinc-300 border-2 border-t-white border-l-white border-r-zinc-600 border-b-zinc-600 p-3 sm:p-4 rounded-md shadow-2xl flex flex-col justify-between">
                
                {/* Header with Balance */}
                <div className="bg-[#5c0e0e] text-[#f87171] font-mono text-center px-3 py-1.5 border border-red-950 rounded font-black text-xs shadow-inner mb-3 flex justify-between items-center">
                  <span>Accounts</span>
                  <span>CUR. BALANCE: {currentBalance >= 0 ? "CR" : "DR"} {Math.abs(currentBalance).toFixed(2)}</span>
                </div>

                {/* Form fields */}
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <Label className="text-right font-bold text-slate-800 pr-2">Date</Label>
                    <input
                      type="date"
                      value={postingDate}
                      onChange={e => setPostingDate(e.target.value)}
                      className="col-span-2 bg-white px-2 py-1 border-2 border-t-zinc-600 border-l-zinc-600 border-r-white border-b-white rounded-sm font-bold text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2 items-center">
                    <Label className="text-right font-bold text-slate-800 pr-2">Ledger Ac.</Label>
                    <div className="col-span-2 flex gap-1 font-bold">
                      <span className="bg-zinc-200 border-2 border-t-zinc-600 border-l-zinc-600 border-r-white border-b-white px-2 py-1 rounded-sm text-center font-mono w-10 text-slate-700">
                        {selectedLedger?.acNo || "0"}
                      </span>
                      <span className="bg-zinc-200 border-2 border-t-zinc-600 border-l-zinc-600 border-r-white border-b-white px-2 py-1 rounded-sm flex-1 text-slate-800">
                        {selectedLedger?.acName || "No Ledger Selected"}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 items-center">
                    <Label className="text-right font-bold text-slate-800 pr-2">Description</Label>
                    <input
                      type="text"
                      value={descriptionVal}
                      onChange={e => setDescriptionVal(e.target.value)}
                      placeholder="e.g. AR VADAKAM"
                      className="col-span-2 bg-white px-2 py-1 border border-zinc-400 rounded-sm font-bold text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2 items-center">
                    <Label className="text-right font-bold text-slate-800 pr-2">No Interest</Label>
                    <div className="col-span-2 flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={interestFree}
                        onChange={e => setInterestFree(e.target.checked)}
                        className="h-4 w-4 rounded border-zinc-400 text-amber-500 focus:ring-amber-500 cursor-pointer"
                        id="interestFreeCheck"
                      />
                      <label htmlFor="interestFreeCheck" className="text-slate-600 font-bold text-[11px] cursor-pointer">
                        Mark as interest-free entry
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 border-t border-zinc-400/30 pt-2">
                    <div className="space-y-1">
                      <Label className="font-bold text-slate-800 block text-center">JAMA (Inflow/CR)</Label>
                      <input
                        type="number"
                        value={jamaVal}
                        onChange={e => setJamaVal(e.target.value)}
                        placeholder="0.00"
                        className="w-full bg-white px-2 py-1 border-2 border-t-zinc-600 border-l-zinc-600 border-r-white border-b-white rounded-sm font-mono font-bold text-xs text-center focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="font-bold text-slate-800 block text-center">KHARCHU (Outflow/DR)</Label>
                      <input
                        type="number"
                        value={kharchuVal}
                        onChange={e => setKharchuVal(e.target.value)}
                        placeholder="0.00"
                        className="w-full bg-white px-2 py-1 border-2 border-t-zinc-600 border-l-zinc-600 border-r-white border-b-white rounded-sm font-mono font-bold text-xs text-center focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Opening Balance Bar */}
                <div className="bg-zinc-200 border-2 border-t-zinc-600 border-l-zinc-600 border-r-white border-b-white px-3 py-1.5 rounded-sm font-mono font-bold flex justify-between items-center my-3 text-slate-700">
                  <span>Opening Balance:</span>
                  <span className="text-slate-900 font-extrabold">₹{selectedLedger?.acNo === "1" ? currentBalance.toFixed(2) : "1264.21"}</span>
                </div>

                {/* Left side Grid: Manual Ledger Postings */}
                <div className="flex-1 bg-white border border-zinc-400 rounded-sm overflow-hidden flex flex-col h-[10rem]">
                  <div className="bg-zinc-100 border-b border-zinc-300 grid grid-cols-4 px-2 py-1 font-bold text-[10px] text-slate-600 text-center">
                    <span>DATE</span>
                    <span>DESCRIPTION</span>
                    <span>JAMA</span>
                    <span>KHARCHU</span>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar font-mono text-[10px]">
                    {manualLedgerPostings.length === 0 ? (
                      <p className="text-slate-400 text-center py-6 italic">No manual entries added</p>
                    ) : (
                      manualLedgerPostings.map((p, idx) => (
                        <div 
                          key={idx} 
                          onClick={() => {
                            setSelectedManualEntry(p);
                            setPostingDate(p.date);
                            setJamaVal(p.jama ? p.jama.toString() : "");
                            setKharchuVal(p.kharchu ? p.kharchu.toString() : "");
                            setDescriptionVal(p.description || "Manual Entry");
                            setInterestFree(!!p.interestFree);
                          }}
                          className={`grid grid-cols-4 px-2 py-1.5 text-center border-b border-zinc-100 hover:bg-zinc-150 cursor-pointer transition-colors ${
                            selectedManualEntry?.id === p.id ? "bg-amber-100 font-bold" : ""
                          }`}
                        >
                          <span>{formatToDDMMYY(p.date)}</span>
                          <span className="truncate">{p.description}</span>
                          <span className="text-emerald-700 font-bold">{p.jama > 0 ? `₹${p.jama}` : "-"}</span>
                          <span className="text-red-700 font-bold">{p.kharchu > 0 ? `₹${p.kharchu}` : "-"}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Subtotals at bottom of left card */}
                <div className="border-t border-zinc-400/40 pt-2 mt-2 font-mono font-black text-[10px] text-slate-700 space-y-1">
                  <div className="flex justify-between">
                    <span>Sending Total:</span>
                    <span>₹{manualLedgerPostings.reduce((sum, p) => sum + (p.jama || 0), 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-t border-dashed border-zinc-300 pt-1 text-slate-950 text-xs">
                    <span>Overall Balance:</span>
                    <span>₹{currentBalance.toFixed(2)}</span>
                  </div>
                </div>

              </div>

              {/* Middle Column: Daily aggregated postings list & Control Buttons */}
              <div className="lg:col-span-3 bg-zinc-300 border-2 border-t-white border-l-white border-r-zinc-600 border-b-zinc-600 p-3 rounded-md shadow-2xl flex flex-col justify-between">
                
                {/* Yellow aggregation table */}
                <div className="flex-1 bg-yellow-50 border-2 border-t-zinc-600 border-l-zinc-600 border-r-white border-b-white rounded-sm overflow-hidden flex flex-col h-[18rem]">
                  <div className="bg-amber-100 border-b border-amber-200 grid grid-cols-4 px-1 py-1.5 font-black text-[9px] text-amber-800 text-center">
                    <span>DT</span>
                    <span>DESC</span>
                    <span>DR.</span>
                    <span>CR.</span>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar font-mono text-[9px]">
                    {finalAggregatedPostings.length === 0 ? (
                      <p className="text-amber-600/60 text-center py-10 italic">No aggregated daily data</p>
                    ) : (
                      finalAggregatedPostings.map((p, idx) => {
                        const isOutflow = p.type === "PAYMENT";
                        const isSelected = selectedAggregatedDate === p.date;
                        return (
                          <div 
                            key={idx} 
                            onClick={() => {
                              setSelectedAggregatedDate(p.date);
                              const existingManual = manualLedgerPostings.find(m => m.date === p.date);
                              if (existingManual) {
                                setSelectedManualEntry(existingManual);
                                setPostingDate(existingManual.date);
                                setJamaVal(existingManual.jama ? existingManual.jama.toString() : "");
                                setKharchuVal(existingManual.kharchu ? existingManual.kharchu.toString() : "");
                                setDescriptionVal(existingManual.description || "Manual Entry");
                                setInterestFree(!!existingManual.interestFree);
                              } else {
                                setSelectedManualEntry(null);
                                setPostingDate(p.date);
                                setJamaVal(isOutflow ? "" : (p.amount || 0).toString());
                                setKharchuVal(isOutflow ? (p.amount || 0).toString() : "");
                                setDescriptionVal("Manual Entry");
                                setInterestFree(false);
                              }
                            }}
                            className={`grid grid-cols-4 px-1 py-1 text-center border-b border-amber-100 hover:bg-amber-200 cursor-pointer transition-colors ${
                              isSelected ? "bg-amber-200 font-bold border-l-4 border-amber-600" : ""
                            }`}
                          >
                            <span className="truncate">{formatToDDMMYY(p.date)}</span>
                            <span className="font-bold text-amber-800 truncate">{p.type === "COMMISSION" ? "కమిషన్" : p.type === "COLLECTION" ? "కలెక్షన్" : "పేమెంట్"}</span>
                            <span className="font-bold text-red-700">{isOutflow ? `₹${(p.amount || 0).toFixed(0)}` : "0.00"}</span>
                            <span className="font-bold text-emerald-700">{!isOutflow ? `₹${(p.amount || 0).toFixed(0)}` : "0.00"}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                  
                  {/* Total and Closing Balance Recessed displays */}
                  <div className="bg-amber-100 border-t border-amber-200 p-2 font-mono font-bold text-[9px] text-amber-900 space-y-1">
                    <div className="flex justify-between items-center bg-[#008080] text-white px-2 py-0.5 rounded">
                      <span>Total Balance:</span>
                      <span>₹{finalAggregatedPostings.reduce((sum, p) => sum + p.amount, 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center bg-[#008080] text-white px-2 py-0.5 rounded">
                      <span>Closing Balance:</span>
                      <span>₹{currentBalance.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Right/Middle bevel buttons column */}
                <div className="flex flex-col gap-1.5 pt-3">
                  <button
                    type="button"
                    onClick={handleSendPosting}
                    className="w-full bg-[#a7f3d0] hover:bg-[#86efac] text-emerald-950 py-2 border-2 border-t-white border-l-white border-r-zinc-600 border-b-zinc-600 font-bold uppercase text-[9px] tracking-wider shadow-sm active:border-t-zinc-600 active:border-l-zinc-600 active:border-r-white active:border-b-white transition-all"
                  >
                    {(selectedManualEntry || selectedAggregatedDate) ? "SAVE / UPDATE" : "SEND / CREATE"}
                  </button>
                  
                  {selectedManualEntry && (
                    <button
                      type="button"
                      onClick={handleDeletePosting}
                      className="w-full bg-red-200 hover:bg-red-300 text-red-950 py-1.5 border-2 border-t-white border-l-white border-r-zinc-600 border-b-zinc-600 font-bold uppercase text-[9px] tracking-wider active:border-t-zinc-600 active:border-l-zinc-600 active:border-r-white active:border-b-white transition-all animate-bounce"
                    >
                      DELETE ENTRY
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => { setJamaVal(""); setKharchuVal(""); setSelectedManualEntry(null); setSelectedAggregatedDate(null); setDescriptionVal("Manual Entry"); setInterestFree(false); }}
                    className="w-full bg-zinc-300 hover:bg-zinc-200 text-slate-900 py-1.5 border-2 border-t-white border-l-white border-r-zinc-600 border-b-zinc-600 font-bold uppercase text-[9px] tracking-wider active:border-t-zinc-600 active:border-l-zinc-600 active:border-r-white active:border-b-white transition-all"
                  >
                    CLEAR
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveView("new-account")}
                    className="w-full bg-zinc-300 hover:bg-zinc-200 text-slate-900 py-1.5 border-2 border-t-white border-l-white border-r-zinc-600 border-b-zinc-600 font-bold uppercase text-[9px] tracking-wider active:border-t-zinc-600 active:border-l-zinc-600 active:border-r-white active:border-b-white transition-all"
                  >
                    NEW ACCOUNT CREATOR
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveView("menu")}
                    className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 py-2 border-2 border-t-white border-l-white border-r-amber-700 border-b-amber-700 font-bold uppercase text-[9px] tracking-wider active:border-t-amber-700 active:border-l-amber-700 active:border-r-white active:border-b-white transition-all"
                  >
                    MAIN MENU
                  </button>
                </div>

              </div>

              {/* Right Column: Ledger selection listbox */}
              <div className="lg:col-span-3 bg-zinc-300 border-2 border-t-white border-l-white border-r-zinc-600 border-b-zinc-600 p-3 rounded-md shadow-2xl flex flex-col justify-between">
                <span className="text-[10px] font-black uppercase text-slate-800 tracking-widest mb-1.5 pb-1 border-b border-zinc-400">SELECT LEDGER</span>
                
                {/* Scrollable listbox */}
                <div className="flex-1 bg-white border border-zinc-400 overflow-y-auto h-[24rem] custom-scrollbar">
                  {ledgerAccounts.map((acc, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedLedger(acc)}
                      className={`w-full text-left px-2 py-2 text-[10px] border-b border-zinc-200 transition-colors flex items-center justify-between font-mono font-bold ${
                        selectedLedger?.id === acc.id 
                          ? "bg-[#000080] text-white font-extrabold" 
                          : "text-slate-900 hover:bg-zinc-200"
                      }`}
                    >
                      <span className="w-5 pr-1">{acc.acNo}</span>
                      <span className="flex-1 truncate uppercase pr-1">{acc.acName}</span>
                      <span className={`text-[8px] px-1 py-0.25 rounded-sm uppercase tracking-wide border ${
                        selectedLedger?.id === acc.id
                          ? "bg-[#0000a0] text-white border-white/20"
                          : "bg-slate-100 text-slate-600 border-zinc-300"
                      }`}>
                        {acc.acType}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

            </div>
          </motion.div>
        )}

        {activeView === "investor-finance" && (
          <motion.div
            key="investor-finance-view"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="w-full max-w-6xl bg-[#091515] border-[6px] border-double border-amber-500/80 rounded-[2.5rem] p-4 sm:p-6 shadow-[0_0_50px_rgba(245,158,11,0.15)] relative overflow-hidden flex flex-col min-h-[38rem]"
          >
            {/* Corner symbols */}
            <div className="absolute top-4 left-4 text-amber-500/30 text-xl font-serif">卐</div>
            <div className="absolute top-4 right-4 text-amber-500/30 text-xl font-serif">卐</div>
            <div className="absolute bottom-4 left-4 text-amber-500/30 text-xl font-serif">卐</div>
            <div className="absolute bottom-4 right-4 text-amber-500/30 text-xl font-serif">卐</div>

            {/* Title Header */}
            <div className="text-center mb-4 border-b border-amber-500/20 pb-2 flex justify-between items-center px-4">
              <h2 className="text-lg sm:text-xl font-bold tracking-widest text-amber-500 font-serif animate-pulse">
                {lineName.toUpperCase()} INVESTOR ACCOUNT (FINANCE)
              </h2>
              <span className="text-[10px] text-slate-500 tracking-wider">Sri Devi Groups</span>
            </div>

            {/* Controls Bar */}
            <div className="bg-zinc-300 border-2 border-t-white border-l-white border-r-zinc-600 border-b-zinc-600 p-3 rounded-md shadow-md mb-4 flex flex-wrap items-center justify-between gap-3 text-slate-900 font-bold text-xs">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="uppercase tracking-wider">Account:</span>
                  <select
                    value={selectedInvestorAcc?.id || ""}
                    onChange={e => {
                      if (e.target.value === "") {
                        setSelectedInvestorAcc(null);
                      } else {
                        const acc = ledgerAccounts.find(a => a.id === e.target.value);
                        if (acc) setSelectedInvestorAcc(acc);
                      }
                    }}
                    className="bg-white px-2 py-1 border-2 border-t-zinc-600 border-l-zinc-600 border-r-white border-b-white rounded font-mono font-bold w-20 text-center"
                  >
                    <option value="">ALL</option>
                    {investorAccountsOnly.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.acNo}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  <span>Name:</span>
                  <span className="bg-zinc-200 border-2 border-t-zinc-600 border-l-zinc-600 border-r-white border-b-white px-3 py-1 rounded">
                    {selectedInvestorAcc ? selectedInvestorAcc.acName : "ALL INVESTORS"}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="bg-emerald-650 hover:bg-emerald-500 text-white px-3 py-1 border-2 border-t-white border-l-white border-r-emerald-800 border-b-emerald-800 rounded font-bold uppercase tracking-wider text-[10px]"
                >
                  Print
                </button>
                <input
                  type="date"
                  value={asOfDate}
                  onChange={e => setAsOfDate(e.target.value)}
                  className="bg-white px-2 py-1 border-2 border-t-zinc-600 border-l-zinc-600 border-r-white border-b-white rounded font-mono font-bold text-xs"
                />
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const q = query(
                        collection(db, "ledger_postings"),
                        where("lineId", "==", selectedLineId)
                      );
                      const snap = await getDocs(q);
                      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
                      list.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
                      setAllLineLedgerPostings(list);
                      toast.success("Statement refreshed successfully!");
                    } catch (e) {
                      toast.error("Failed to refresh postings");
                    }
                  }}
                  className="bg-emerald-650 hover:bg-emerald-500 text-white px-3 py-1 border-2 border-t-white border-l-white border-r-emerald-800 border-b-emerald-800 rounded font-bold uppercase tracking-wider text-[10px]"
                >
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={() => setActiveView("menu")}
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 px-3 py-1 border-2 border-t-white border-l-white border-r-amber-700 border-b-amber-700 rounded font-bold uppercase tracking-wider text-[10px]"
                >
                  Main Menu
                </button>
                {selectedInvestorAcc ? (
                  <span className="text-[#FFC107] font-serif font-black text-sm px-2 drop-shadow-md min-w-[20px] text-center">
                    {selectedInvestorAcc.acNo}
                  </span>
                ) : (
                  <span className="text-[#FFC107] font-serif font-black text-[10px] px-2 drop-shadow-md min-w-[20px] text-center uppercase">
                    ALL
                  </span>
                )}
              </div>
            </div>

            {/* Calculations and Layout Grid */}
            <div className="flex-1 flex flex-col gap-4 text-slate-950 font-sans text-xs">
              
              {/* Statement List Grid Panel */}
              <div className="flex-1 bg-zinc-300 border-2 border-t-white border-l-white border-r-zinc-600 border-b-zinc-600 p-3 sm:p-4 rounded-md shadow-2xl flex flex-col justify-between min-h-[16rem]">
                
                <div className="flex-1 bg-yellow-50 border-2 border-t-zinc-600 border-l-zinc-600 border-r-white border-b-white rounded-sm overflow-hidden flex flex-col">
                  
                  {/* Grid Headers */}
                  <div className="bg-amber-100 border-b border-amber-200 grid grid-cols-12 px-2 py-1.5 font-black text-[10px] text-amber-800 text-center">
                    <span className="col-span-2">DT</span>
                    <span className="col-span-3">DETAILS</span>
                    <span className="col-span-1">DAY</span>
                    <span className="col-span-2 text-right">JAMA</span>
                    <span className="col-span-2 text-right">INT JAMA</span>
                    <span className="col-span-2 text-right">KHARCHU</span>
                    <span className="col-span-2 text-right">INT KHAR</span>
                  </div>

                  {/* Scrollable list */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar font-mono text-[10px] divide-y divide-amber-100 bg-[#FCF8E3]">
                    {(() => {
                      const dailyRate = parseFloat(selectedInvestorAcc?.interestRateDaily) || 0.05;
                      
                      const rows = investorPostings.map(p => {
                        const days = calculateDays(p.date, asOfDate);
                        const jama = parseFloat(p.jama) || 0;
                        const kharchu = parseFloat(p.kharchu) || 0;
                        const isFree = !!p.interestFree;
                        const intJama = (jama > 0 && !isFree) ? jama * (dailyRate / 100) * days : 0;
                        const intKhar = (kharchu > 0 && !isFree) ? kharchu * (dailyRate / 100) * days : 0;
                        return { ...p, days, intJama, intKhar, jama, kharchu };
                      });

                      if (rows.length === 0) {
                        return <p className="text-amber-800/60 text-center py-10 italic">No transactions found for this investor</p>;
                      }

                      return rows.map((r, idx) => (
                        <div key={idx} className="grid grid-cols-12 px-2 py-2 text-center hover:bg-amber-100 transition-colors">
                          <span className="col-span-2 font-black text-amber-900">{formatToDDMMYY(r.date)}</span>
                          <span className="col-span-3 truncate text-left font-sans pl-1">{r.description || "--"}</span>
                          <span className="col-span-1 text-slate-700 font-bold">{r.days}</span>
                          <span className="col-span-2 text-right text-emerald-800 font-bold pr-1">{r.jama > 0 ? `₹${r.jama.toFixed(2)}` : "-"}</span>
                          <span className="col-span-2 text-right text-emerald-600 font-bold pr-1">{r.intJama > 0 ? `₹${r.intJama.toFixed(2)}` : "-"}</span>
                          <span className="col-span-2 text-right text-red-800 font-bold pr-1">{r.kharchu > 0 ? `₹${r.kharchu.toFixed(2)}` : "-"}</span>
                          <span className="col-span-2 text-right text-red-600 font-bold pr-1">{r.intKhar > 0 ? `₹${r.intKhar.toFixed(2)}` : "-"}</span>
                        </div>
                      ));
                    })()}
                  </div>

                  {/* Calculations Aggregate Display at Grid Bottom */}
                  {(() => {
                    const dailyRate = parseFloat(selectedInvestorAcc?.interestRateDaily) || 0.05;
                    let totJ = 0;
                    let totIJ = 0;
                    let totK = 0;
                    let totIK = 0;

                    investorPostings.forEach(p => {
                      const days = calculateDays(p.date, asOfDate);
                      const jama = parseFloat(p.jama) || 0;
                      const kharchu = parseFloat(p.kharchu) || 0;
                      const isFree = !!p.interestFree;
                      totJ += jama;
                      totIJ += (jama > 0 && !isFree) ? jama * (dailyRate / 100) * days : 0;
                      totK += kharchu;
                      totIK += (kharchu > 0 && !isFree) ? kharchu * (dailyRate / 100) * days : 0;
                    });

                    const principalBalance = totJ - totK;
                    const interestBalance = totIJ - totIK;
                    const netTotal = principalBalance + interestBalance;

                    return (
                      <div className="bg-amber-100 border-t border-amber-200 p-3 font-mono font-bold text-[10px] text-amber-900 space-y-2">
                        {/* Summary Row */}
                        <div className="grid grid-cols-12 text-center text-[9px] uppercase tracking-tighter">
                          <span className="col-span-5 text-left font-black">TOTALS:</span>
                          <span className="col-span-1"></span>
                          <span className="col-span-2 text-right text-emerald-800">₹{totJ.toFixed(2)}</span>
                          <span className="col-span-2 text-right text-emerald-600">₹{totIJ.toFixed(2)}</span>
                          <span className="col-span-2 text-right text-red-800">₹{totK.toFixed(2)}</span>
                          <span className="col-span-2 text-right text-red-600">₹{totIK.toFixed(2)}</span>
                        </div>

                        {/* Calculated Balance Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 border-t border-amber-200/50 pt-2 text-xs">
                          <div className="bg-[#cc0000] text-white px-3 py-1.5 rounded flex justify-between items-center shadow-inner">
                            <span>Principal Balance:</span>
                            <span className="font-extrabold">₹{principalBalance.toFixed(2)}</span>
                          </div>
                          <div className="bg-[#cc0000] text-white px-3 py-1.5 rounded flex justify-between items-center shadow-inner">
                            <span>Interest Accrued:</span>
                            <span className="font-extrabold">₹{interestBalance.toFixed(2)}</span>
                          </div>
                          <div className="bg-[#008080] text-white px-3 py-1.5 rounded flex justify-between items-center shadow-md">
                            <span>Predicate Plus Interest:</span>
                            <span className="font-extrabold text-amber-300">₹{netTotal.toFixed(2)}</span>
                          </div>
                        </div>

                      </div>
                    );
                  })()}

                </div>

              </div>

            </div>

          </motion.div>
        )}

        {activeView === "trial-balance" && (
          <motion.div
            key="trial-balance-view"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="w-full max-w-6xl bg-[#091515] border-[6px] border-double border-emerald-500/85 rounded-[2.5rem] p-4 sm:p-6 shadow-[0_0_50px_rgba(16,185,129,0.15)] relative overflow-hidden flex flex-col min-h-[38rem]"
          >
            {/* Corner symbols */}
            <div className="absolute top-4 left-4 text-emerald-500/30 text-xl font-serif">卐</div>
            <div className="absolute top-4 right-4 text-emerald-500/30 text-xl font-serif">卐</div>
            <div className="absolute bottom-4 left-4 text-emerald-500/30 text-xl font-serif">卐</div>
            <div className="absolute bottom-4 right-4 text-emerald-500/30 text-xl font-serif">卐</div>

            {/* Title Header */}
            <div className="text-center mb-4 border-b border-emerald-500/20 pb-2 flex justify-between items-center px-4">
              <h2 className="text-lg sm:text-xl font-bold tracking-widest text-emerald-500 font-serif animate-pulse">
                {lineName.toUpperCase()} REAL-TIME TRIAL BALANCE
              </h2>
              <span className="text-[10px] text-slate-500 tracking-wider">Sri Devi Groups</span>
            </div>

            {/* Controls Bar */}
            <div className="bg-zinc-300 border-2 border-t-white border-l-white border-r-zinc-600 border-b-zinc-600 p-3 rounded-md shadow-md mb-4 flex flex-wrap items-center justify-between gap-3 text-slate-900 font-bold text-xs">
              <div className="flex items-center gap-2">
                <span>AS-OF DATE:</span>
                <input
                  type="date"
                  value={asOfDate}
                  onChange={e => setAsOfDate(e.target.value)}
                  className="bg-white px-2 py-1 border-2 border-t-zinc-600 border-l-zinc-600 border-r-white border-b-white rounded font-mono font-bold text-xs"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="bg-emerald-650 hover:bg-emerald-500 text-white px-4 py-1 border-2 border-t-white border-l-white border-r-emerald-800 border-b-emerald-800 rounded font-bold uppercase tracking-wider text-[10px]"
                >
                  Print
                </button>
                <button
                  type="button"
                  onClick={() => setActiveView("menu")}
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 py-1 border-2 border-t-white border-l-white border-r-amber-700 border-b-amber-700 rounded font-bold uppercase tracking-wider text-[10px]"
                >
                  Main Menu
                </button>
              </div>
            </div>

            {/* Table layout */}
            <div className="flex-1 bg-zinc-300 border-2 border-t-white border-l-white border-r-zinc-600 border-b-zinc-600 p-3 sm:p-4 rounded-md shadow-2xl flex flex-col justify-between min-h-[22rem]">
              <div className="flex-1 bg-[#E8F8F5] border-2 border-t-zinc-600 border-l-zinc-600 border-r-white border-b-white rounded-sm overflow-hidden flex flex-col">
                {/* Headers */}
                <div className="bg-emerald-100 border-b border-emerald-200 grid grid-cols-12 px-3 py-2 font-black text-[10px] text-emerald-800 text-center uppercase tracking-wider">
                  <span className="col-span-1">S.No</span>
                  <span className="col-span-5 text-left">Account Particulars</span>
                  <span className="col-span-2">Group</span>
                  <span className="col-span-2 text-right">Debit (DR)</span>
                  <span className="col-span-2 text-right">Credit (CR)</span>
                </div>

                {/* Grid Rows */}
                <div className="flex-1 overflow-y-auto custom-scrollbar font-mono text-[10px] divide-y divide-emerald-100 bg-[#F4FBF9]">
                  {trialBalanceRows.map((r, idx) => (
                    <div key={idx} className="grid grid-cols-12 px-3 py-2.5 text-center hover:bg-emerald-50 transition-colors">
                      <span className="col-span-1 text-slate-500 font-bold">{idx + 1}</span>
                      <span className="col-span-5 text-left font-black text-slate-850 truncate">{r.name}</span>
                      <span className="col-span-2 text-slate-600 font-bold uppercase text-[9px] truncate">{r.group}</span>
                      <span className="col-span-2 text-right text-red-700 font-extrabold pr-2">
                        {r.debit > 0 ? `₹${r.debit.toFixed(2)}` : "-"}
                      </span>
                      <span className="col-span-2 text-right text-emerald-700 font-extrabold pr-2">
                        {r.credit > 0 ? `₹${r.credit.toFixed(2)}` : "-"}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Footer calculation aggregates */}
                {(() => {
                  const totalDebits = trialBalanceRows.reduce((sum, r) => sum + r.debit, 0);
                  const totalCredits = trialBalanceRows.reduce((sum, r) => sum + r.credit, 0);
                  const diff = Math.abs(totalDebits - totalCredits);
                  const isBalanced = diff < 1;

                  return (
                    <div className="bg-emerald-100 border-t border-emerald-200 p-3 font-mono font-bold text-xs text-emerald-900 space-y-3">
                      {/* Sum Row */}
                      <div className="grid grid-cols-12 text-center text-[10px] uppercase font-black tracking-wider">
                        <span className="col-span-8 text-left pl-2">GRAND TOTALS:</span>
                        <span className="col-span-2 text-right text-red-700 pr-2">₹{totalDebits.toFixed(2)}</span>
                        <span className="col-span-2 text-right text-emerald-700 pr-2">₹{totalCredits.toFixed(2)}</span>
                      </div>

                      {/* Status indicator bar */}
                      <div className={`p-2 rounded text-center text-white text-[11px] font-black uppercase tracking-widest shadow-md transition-all ${
                        isBalanced ? "bg-emerald-700 animate-pulse" : "bg-amber-600"
                      }`}>
                        {isBalanced 
                          ? "✓ TRIAL BALANCE BALANCED PERFECTLY" 
                          : `⚠ TRIAL BALANCE UNBALANCED (DIFFERENCE: ₹${diff.toFixed(2)})`
                        }
                      </div>
                    </div>
                  );
                })()}

              </div>
            </div>

          </motion.div>
        )}
      </AnimatePresence>

      {/* Under Construction Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md bg-slate-950 border border-slate-800 text-slate-100">
          <DialogTitle className="flex items-center gap-2 text-amber-500 font-serif">
            <ShieldAlert className="h-5 w-5" /> Module Under Construction
          </DialogTitle>
          <DialogDescription className="text-slate-400 pt-2">
            The sub-page for <strong className="text-white">{modalTitle}</strong> is currently being developed according to operational specifications. It will be available shortly.
          </DialogDescription>
          <div className="flex justify-end pt-4">
            <Button onClick={() => setModalOpen(false)} className="bg-amber-500 text-slate-950 font-bold hover:bg-amber-400">
              Understood
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Password Reset Modal */}
      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent className="sm:max-w-md bg-slate-950 border border-slate-800 text-slate-100">
          <DialogTitle className="flex items-center gap-2 text-cyan-400">
            <KeyRound className="h-5 w-5" /> Change Account Password
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Specify your new security credential to protect your access profile.
          </DialogDescription>
          <form onSubmit={handlePasswordChange} className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label className="text-xs uppercase font-bold tracking-widest text-slate-400">New Password</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="bg-slate-900 border-slate-800 focus:ring-cyan-500 focus:border-cyan-500"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase font-bold tracking-widest text-slate-400">Confirm Password</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="bg-slate-900 border-slate-800 focus:ring-cyan-500 focus:border-cyan-500"
              />
            </div>
            <div className="flex gap-2 pt-2 justify-end">
              <Button type="button" variant="ghost" onClick={() => setPasswordOpen(false)} className="hover:bg-slate-900 text-slate-400 hover:text-white">
                Cancel
              </Button>
              <Button type="submit" className="bg-cyan-500 text-slate-950 font-bold hover:bg-cyan-400">
                Save Password
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Accounts;
