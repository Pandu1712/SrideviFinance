import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLine } from "@/contexts/LineContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { db } from "@/lib/firebase";
import { collection, getDocs, getDoc, query, where, DocumentData, addDoc, serverTimestamp, doc, updateDoc, increment, runTransaction, deleteDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { Wallet, TrendingUp, IndianRupee, Search, RefreshCw, ArrowLeft, Edit3, Navigation, PhoneCall, Phone, Check, ChevronRight, User, Banknote, CreditCard, CheckCircle2, ChevronDown, Calendar, X, Zap, Trash2, Printer, Scale, ShieldCheck, FileSpreadsheet, AlertCircle } from "lucide-react";
import { formatCurrency, formatDate, formatCurrencyPDF, playSuccessSound } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from "@/components/ui/alert-dialog";
import { generateRepaymentSchedule, getGoogleMapsUrl } from "@/lib/loanUtils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { logActivity } from "@/lib/audit";
import { exportToExcel } from "@/lib/excel";

const DailyCollection = () => {
  const navigate = useNavigate();
  const { userData } = useAuth();
  const { lines, selectedLineId } = useLine();
  const { t } = useLanguage();
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [records, setRecords] = useState<DocumentData[]>([]);
  const [expense, setExpense] = useState("0");
  const [manualInflow, setManualInflow] = useState("0");
  const [openingBalance, setOpeningBalance] = useState("0");
  const [disbursedToday, setDisbursedToday] = useState(0);
  const [docChargesToday, setDocChargesToday] = useState(0);
  const [isSavingSummary, setIsSavingSummary] = useState(false);
  const [customers, setCustomers] = useState<DocumentData[]>([]);
  const [postings, setPostings] = useState<Record<string, Record<string, any>>>({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  const [activeCustomer, setActiveCustomer] = useState<any>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [villageFilter, setVillageFilter] = useState("all");
  
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{custId: string, date: string, custName: string, amount: number, accountNo: string} | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMode, setPayMode] = useState("cash");
  const [digiPayer, setDigiPayer] = useState("");
  const [lateFee, setLateFee] = useState("");
  const [note, setNote] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().split("T")[0]);

  // Edit Posting States
  const [editPostingOpen, setEditPostingOpen] = useState(false);
  const [selectedEditPosting, setSelectedEditPosting] = useState<any>(null);
  const [editPostDate, setEditPostDate] = useState("");
  const [editPostAmount, setEditPostAmount] = useState("");

  // Admin Override States
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [adminCustomerSearch, setAdminCustomerSearch] = useState("");
  const [allAccounts, setAllAccounts] = useState<any[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  // Duplicate Check Dialog
  const [showDuplicateAlert, setShowDuplicateAlert] = useState(false);
  const [pendingDuplicateAction, setPendingDuplicateAction] = useState<(() => void) | null>(null);

  // Clear cached accounts when line changes to prevent leakage
  useEffect(() => {
    setAllAccounts([]);
    setAdminCustomerSearch("");
    setSelectedAdminCustomer(null);
  }, [selectedLineId]);
  const [selectedAdminCustomer, setSelectedAdminCustomer] = useState<any>(null);

  // Bulk Date Change States
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [batchNewDate, setBatchNewDate] = useState(new Date().toISOString().split("T")[0]);
  const [isBulkMoving, setIsBulkMoving] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
   
  // Agent Expense States
  const [isAddingExpense, setIsAddingExpense] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseNote, setExpenseNote] = useState("");
  const [expenseType, setExpenseType] = useState<"inflow" | "outflow">("outflow");
  const [totalCollectionToday, setTotalCollectionToday] = useState(0);
  const [dailyExpenseLogs, setDailyExpenseLogs] = useState<any[]>([]);
  const [showExpenseDetails, setShowExpenseDetails] = useState(false);
  const [editingExpense, setEditingExpense] = useState<any>(null);
  const [editInput, setEditInput] = useState({ amount: "", note: "" });


  const gridDates = Array.from({ length: 5 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (4 - i));
    return d.toISOString().split("T")[0];
  });

  const fetchDataForGrid = async () => {
    if (!selectedLineId) {
      setCustomers([]);
      setPostings({});
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      const targetLine = selectedLineId;
      const custQuery = query(collection(db, "accounts"), where("lineId", "==", targetLine));
      const custSnap = await getDocs(custQuery);
      const custData = custSnap.docs
        .map(d => ({ id: d.id, ...d.data() as any }))
        .filter(c => c.status !== "deleted");
      setCustomers(custData);
      
      const minDate = gridDates[0];
      const postQuery = query(collection(db, "postings"), where("lineId", "==", targetLine), where("date", ">=", minDate));
      const postSnap = await getDocs(postQuery);
      const postMap = {};
      
      postSnap.forEach(d => {
        const data = d.data();
        if (!postMap[data.accountId]) postMap[data.accountId] = {};
        postMap[data.accountId][data.date] = data;
      });
      setPostings(postMap);

      // Calculate total collection for today (Agent View)
      let dailyTotal = 0;
      const todayStr = new Date().toISOString().split("T")[0];
      postSnap.forEach(d => {
        const data = d.data();
        if (data.date === todayStr && data.collectedById === userData.uid) {
          dailyTotal += (data.amount || 0);
        }
      });
      setTotalCollectionToday(dailyTotal);

      // Fetch Expenses for Agent View
      let expLogQ = query(collection(db, "expenses_log"), where("date", "==", date), where("lineId", "==", targetLine));
      if (userData.role === 'agent') {
        expLogQ = query(expLogQ, where("collectedById", "==", userData.uid));
      }
      
      const expLogSnap = await getDocs(expLogQ);
      const logs = expLogSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setDailyExpenseLogs(logs);
      
      // Calculate personal total for agent
      const personalTotal = logs.reduce((acc, log: any) => acc + (log.amount || 0), 0);
      setExpense(String(personalTotal));
    } catch (err) {
      console.error("Grid Sync Error:", err);
      toast.error("Sync Error. Please Check Internet.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePosting = async (posting: DocumentData) => {
    if (userData?.role !== "super_admin") return;
    if (!window.confirm(`Are you sure you want to delete this payment of ${formatCurrency(posting.amount)}? The member's balance will be REVERSED (increased).`)) return;

    setLoading(true);
    try {
      const accountRef = doc(db, "accounts", posting.accountId);
      const postingRef = doc(db, "postings", posting.id);

      await runTransaction(db, async (transaction) => {
        const accDoc = await transaction.get(accountRef);
        if (!accDoc.exists()) throw new Error("Account not found");

        const accData = accDoc.data();
        const postingAmount = posting.amount || 0;
        const principalAmount = posting.principal || (postingAmount - (posting.lateFee || 0));
        
        // Reversal logic
        const newPaid = (accData.paid || 0) - postingAmount;
        const newBalance = (accData.balance || 0) + principalAmount;
        const newStatus = newBalance > 0 ? "active" : "completed";

        transaction.update(accountRef, {
          paid: newPaid,
          balance: newBalance,
          status: newStatus
        });

        transaction.delete(postingRef);
      });

      toast.success("Transaction deleted and balance reconciled.");
      
      if (userData) {
        logActivity(
          userData.uid,
          userData.name,
          userData.role,
          "POSTING_DELETE",
          `Deleted payment of ${formatCurrency(posting.amount)} for ${posting.memberName} (${posting.accountNo})`,
          selectedLineId
        );
      }
      
      handleSearch(); // Refresh admin records
    } catch (err: any) {
      console.error("Delete Posting Error:", err);
      toast.error("Failed to delete transaction: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!userData) return;
    if (userData?.role === "agent") {
      fetchDataForGrid();
      return;
    }
    setLoading(true);
    try {
      if (!selectedLineId) {
        setRecords([]);
        setLoading(false);
        return;
      }

      // Fetch postings for this date and line
      const q = query(collection(db, "postings"), where("date", "==", date), where("lineId", "==", selectedLineId));
      const snap = await getDocs(q);
      const list: DocumentData[] = [];
      
      snap.forEach(d => {
        const data = d.data();
        const matchesLine = true; // Already filtered by query
        const matchesAdmin = userData.role === "admin" 
          ? (data.adminId === userData.uid || data.collectedById === userData.uid) 
          : true;
        const isCollection = data.status?.toLowerCase() === 'collection' || 
                           data.status?.toLowerCase() === 'penalty' ||
                           data.status?.toLowerCase() === 'extra_collection' ||
                           data.status?.toLowerCase() === 'extra_transfer_out';
        
        if (matchesLine && matchesAdmin && isCollection) {
          list.push({ id: d.id, ...data });
        }
      });
      setRecords(list);

      // Fetch Disbursals and Doc Charges for the day
      const accQ = query(collection(db, "accounts"), where("lineId", "==", selectedLineId));
      const accSnap = await getDocs(accQ);
      let totalDisbursed = 0;
      let totalDocCharges = 0;
      accSnap.docs.forEach(d => {
        const acc = d.data();
        if (acc.createdAt && acc.createdAt.startsWith(date)) {
          totalDisbursed += (acc.loanAmount || 0);
          totalDocCharges += (acc.documentCharge || 0);
        }
      });
      setDisbursedToday(totalDisbursed);
      setDocChargesToday(totalDocCharges);

      // Fetch Expenses and Opening Balance for the day
      const expQ = query(collection(db, "day_summaries"), where("date", "==", date), where("lineId", "==", selectedLineId));
      const expSnap = await getDocs(expQ);
      if (!expSnap.empty) {
        const summ = expSnap.docs[0].data();
        setExpense(String(summ.expenses || 0));
        setManualInflow(String(summ.manualInflows || 0));
        setOpeningBalance(String(summ.openingBalance || 0));
      } else {
        setExpense("0");
        setManualInflow("0");
        setOpeningBalance("0");
      }

      // Fetch Individual Expense Logs for the registry
      let expLogQ = query(collection(db, "expenses_log"), where("date", "==", date), where("lineId", "==", selectedLineId));
      
      const expLogSnap = await getDocs(expLogQ);
      const logs = expLogSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setDailyExpenseLogs(logs);

    } catch (err) {
      console.error(err);
      toast.error("Search failed");
    } finally {
      setLoading(false);
    }
  };

  const handleAddExpense = async () => {
    if (!expenseAmount || isNaN(parseFloat(expenseAmount)) || !selectedLineId) return;
    setIsSavingSummary(true);
    try {
      const amount = parseFloat(expenseAmount);
      const lineId = selectedLineId;
      const todayStr = date;
      
      // 1. Log for audit and separate breakdown
      await addDoc(collection(db, "expenses_log"), {
        amount,
        type: expenseType,
        note: expenseNote || (expenseType === "inflow" ? "Manual Inflow" : "Operational Expense (Daily Collection)"),
        date: todayStr,
        lineId,
        userName: userData?.name,
        userRole: userData?.role,
        collectedById: userData?.uid,
        timestamp: new Date().toISOString()
      });

      // 2. Update aggregate in day_summaries
      const docId = `${todayStr}_${lineId}`;
      const summaryRef = doc(db, "day_summaries", docId);
      
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(summaryRef);
        if (!snap.exists()) {
          transaction.set(summaryRef, {
            expenses: expenseType === "outflow" ? amount : 0,
            manualInflows: expenseType === "inflow" ? amount : 0,
            openingBalance: 0,
            date: todayStr,
            lineId
          });
        } else {
          const currentExp = snap.data().expenses || 0;
          const currentInflow = snap.data().manualInflows || 0;
          transaction.update(summaryRef, {
            expenses: expenseType === "outflow" ? currentExp + amount : currentExp,
            manualInflows: expenseType === "inflow" ? currentInflow + amount : currentInflow
          });
        }
      });

      toast.success(expenseType === "inflow" ? "Inflow recorded successfully" : "Expense recorded successfully");
      setIsAddingExpense(false);
      setExpenseAmount("");
      setExpenseNote("");
      setExpenseType("outflow");
      
      if (userData) {
        logActivity(
          userData.uid,
          userData.name,
          userData.role,
          "POSTING_CREATE",
          `Recorded ${expenseType}: ₹${amount} (${expenseNote || 'No note'})`,
          selectedLineId
        );
      }
      
      handleSearch(); // Refresh financial totals
    } catch (err) {
      console.error("Add expense error:", err);
      toast.error("Failed to record expense");
    } finally {
      setIsSavingSummary(false);
    }
  };

  const handleUpdateExpense = async () => {
    if (!editingExpense || !editInput.amount || isNaN(parseFloat(editInput.amount))) return;
    try {
      const newAmount = parseFloat(editInput.amount);
      const oldAmount = editingExpense.amount || 0;
      const diff = newAmount - oldAmount;
      const lineId = editingExpense.lineId || 'global';
      const txType = editingExpense.type || 'outflow';
      
      const { doc, updateDoc, getDoc } = await import("firebase/firestore");
      
      await updateDoc(doc(db, "expenses_log", editingExpense.id), {
        amount: newAmount,
        note: editInput.note
      });

      const summaryId = `${editingExpense.date || date}_${lineId}`;
      const summaryRef = doc(db, "day_summaries", summaryId);
      const summSnap = await getDoc(summaryRef);
      
      if (summSnap.exists()) {
        const updateData: any = {};
        if (txType === 'inflow') {
          updateData.manualInflows = (summSnap.data().manualInflows || 0) + diff;
        } else {
          updateData.expenses = (summSnap.data().expenses || 0) + diff;
        }
        await updateDoc(summaryRef, updateData);
      }

      if (userData) {
        logActivity(userData.uid, userData.name, userData.role, "EXPENSE_UPDATE", `Updated ${txType} from ${formatCurrency(oldAmount)} to ${formatCurrency(newAmount)}: ${editInput.note}`, lineId);
      }

      toast.success("Transaction Updated");
      
      // Update local state list
      setDailyExpenseLogs(prev => prev.map(l => l.id === editingExpense.id ? { ...l, amount: newAmount, note: editInput.note } : l));
      
      // Update total expense/inflow state
      if (txType === 'inflow') {
        setManualInflow(prev => String(Math.max(0, parseFloat(prev || "0") + diff)));
      } else {
        setExpense(prev => String(Math.max(0, parseFloat(prev || "0") + diff)));
      }

      setEditingExpense(null);
    } catch (err) {
      console.error("Update expense error:", err);
      toast.error("Update failed");
    }
  };

  const handleDeleteExpense = async (log: any) => {
    if (!window.confirm("Are you sure you want to delete this record?")) return;
    try {
      const lineId = log.lineId || 'global';
      const txType = log.type || 'outflow';
      const amount = log.amount || 0;
      const { doc, deleteDoc, updateDoc, getDoc } = await import("firebase/firestore");

      await deleteDoc(doc(db, "expenses_log", log.id));

      const summaryId = `${log.date || date}_${lineId}`;
      const summaryRef = doc(db, "day_summaries", summaryId);
      const summSnap = await getDoc(summaryRef);
      
      if (summSnap.exists()) {
        const updateData: any = {};
        if (txType === 'inflow') {
          updateData.manualInflows = Math.max(0, (summSnap.data().manualInflows || 0) - amount);
        } else {
          updateData.expenses = Math.max(0, (summSnap.data().expenses || 0) - amount);
        }
        await updateDoc(summaryRef, updateData);
      }

      if (userData) {
        logActivity(userData.uid, userData.name, userData.role, "EXPENSE_DELETE", `Deleted ${txType} of ${formatCurrency(amount)}: ${log.note}`, lineId);
      }

      toast.success("Record Deleted");

      // Update local state list
      setDailyExpenseLogs(prev => prev.filter(l => l.id !== log.id));
      
      // Update total expense/inflow state
      if (txType === 'inflow') {
        setManualInflow(prev => String(Math.max(0, parseFloat(prev || "0") - amount)));
      } else {
        setExpense(prev => String(Math.max(0, parseFloat(prev || "0") - amount)));
      }
    } catch (err) {
      console.error("Delete expense error:", err);
      toast.error("Deletion failed");
    }
  };

  const handleSaveSummary = async () => {
    if (!selectedLineId) return;
    setIsSavingSummary(true);
    try {
      const q = query(collection(db, "day_summaries"), where("date", "==", date), where("lineId", "==", selectedLineId));
      const snap = await getDocs(q);
      
      const expenseValue = parseFloat(expense) || 0;
      const openingValue = parseFloat(openingBalance) || 0;
      const inflowValue = parseFloat(manualInflow) || 0;
      
      if (!snap.empty) {
        await updateDoc(doc(db, "day_summaries", snap.docs[0].id), {
          expenses: expenseValue,
          manualInflows: inflowValue,
          openingBalance: openingValue,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, "day_summaries"), {
          date,
          lineId: selectedLineId,
          expenses: expenseValue,
          manualInflows: inflowValue,
          openingBalance: openingValue,
          createdAt: serverTimestamp()
        });
      }
      toast.success("Financial summary updated");

      if (userData) {
        logActivity(
          userData.uid,
          userData.name,
          userData.role,
          "EXPENSE_UPDATE",
          `Updated operational expenses to ${formatCurrency(expenseValue)} for date ${date}`,
          selectedLineId
        );
      }
    } catch (err) {
      toast.error("Failed to save summary");
    } finally {
      setIsSavingSummary(false);
    }
  };

  useEffect(() => {
    if (userData) {
       handleSearch();
    }
  }, [date, userData, selectedLineId]);

  const handleExportPDF = () => {
    if (records.length === 0) {
      toast.error("No data to export");
      return;
    }
    
    const doc = new jsPDF();
    const activeLineName = lines.find(l => l.id === selectedLineId)?.name || "Master Portfolio";
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // 1. Premium Header
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, pageWidth, 45, 'F');
    
    doc.setFontSize(24);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.text("SRI DEVI FINANCE HUB", 14, 25);
    
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.setFont("helvetica", "normal");
    doc.text("PREMIUM FINANCIAL AUDIT & RECOVERY LEDGER", 14, 32);
    
    // Header Right Info
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.text(`DATE: ${formatDate(date).toUpperCase()}`, pageWidth - 14, 22, { align: 'right' });
    doc.text(`TERRITORY: ${activeLineName.toUpperCase()}`, pageWidth - 14, 28, { align: 'right' });
    doc.text(`GENERATED: ${new Date().toLocaleString().toUpperCase()}`, pageWidth - 14, 34, { align: 'right' });

    // 2. Executive Summary Cards (Visual Representation)
    doc.setFillColor(248, 250, 252); // slate-50
    doc.roundedRect(14, 52, 60, 25, 3, 3, 'F');
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(7);
    doc.text("TOTAL RECOVERY", 18, 60);
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(14);
    doc.text(formatCurrency(total), 18, 70);

    doc.setFillColor(248, 250, 252);
    doc.roundedRect(pageWidth / 2 - 30, 52, 60, 25, 3, 3, 'F');
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(7);
    doc.text("OPERATIONAL EXPENSES", pageWidth / 2 - 26, 60);
    doc.setTextColor(225, 29, 72); // rose-600
    doc.setFontSize(14);
    doc.text(`-${formatCurrency(parseFloat(expense))}`, pageWidth / 2 - 26, 70);

    doc.setFillColor(248, 250, 252);
    doc.roundedRect(pageWidth - 74, 52, 60, 25, 3, 3, 'F');
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(7);
    doc.text("NET CASH FLOW", pageWidth - 70, 60);
    doc.setTextColor(5, 150, 105); // emerald-600
    doc.setFontSize(14);
    doc.text(formatCurrencyPDF(total - parseFloat(expense)), pageWidth - 70, 70);

    // 3. Transactions Table
    const tableColumn = ["ID", "MEMBER NAME", "ACCOUNT NO", "CREDIT (Rs.)", "MODE", "COLLECTED BY"];
    const tableRows = records.map((r, i) => [
      `#${String(i+1).padStart(2, '0')}`,
      `${r.memberName.toUpperCase()}${r.nameTelugu ? ` (${r.nameTelugu})` : ''}`,
      r.accountNo,
      formatCurrencyPDF(r.amount),
      r.payMode.toUpperCase(),
      `${r.collectedByName.toUpperCase()} (${r.collectedByRole === 'super_admin' ? 'ADMIN' : 'AGENT'})`
    ]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 85,
      theme: 'striped',
      headStyles: { 
        fillColor: [15, 23, 42], 
        textColor: [255, 255, 255], 
        fontSize: 8,
        fontStyle: 'bold',
        cellPadding: 4
      },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      styles: { 
        fontSize: 8, 
        cellPadding: 4,
        textColor: [51, 65, 85],
        lineColor: [226, 232, 240],
        lineWidth: 0.1
      },
      columnStyles: {
        3: { halign: 'right', fontStyle: 'bold', textColor: [5, 150, 105] }, // Credit column
        0: { halign: 'center' }
      },
      margin: { left: 14, right: 14 }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 20;

    // 4. Verification Footer
    if (finalY < doc.internal.pageSize.getHeight() - 40) {
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.5);
      doc.line(14, finalY, 70, finalY);
      doc.line(pageWidth - 70, finalY, pageWidth - 14, finalY);
      
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text("FIELD AGENT SIGNATURE", 14, finalY + 5);
      doc.text("AUTHORIZING OFFICER", pageWidth - 14, finalY + 5, { align: 'right' });
      
      doc.setFontSize(6);
      doc.setTextColor(203, 213, 225);
      doc.text("THIS IS A COMPUTER GENERATED REPORT SECURED BY SRI DEVI FINANCE HUB AUDIT PROTOCOLS.", pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });
    }

    doc.save(`Ledger_${activeLineName}_${date}.pdf`);
    toast.success("Premium Audit Ledger Exported");
  };

  const handleExportExcel = () => {
    if (records.length === 0) {
      toast.error("No data to export");
      return;
    }
    
    const data = records.map((r, i) => ({
      "Sl No": i + 1,
      "Member Name": r.memberName,
      "Telugu Name": r.nameTelugu || "",
      "Account No": r.accountNo,
      "Recovery Amount": r.amount || 0,
      "Principal Component": r.principal || 0,
      "Late Fee": r.lateFee || 0,
      "Payment Mode": (r.payMode || "").toUpperCase(),
      "Collected By": r.collectedByName,
      "Role": (r.collectedByRole === 'super_admin' ? 'Admin' : 'Agent'),
      "Date": formatDate(r.date)
    }));

    exportToExcel(data, `Daily_Recovery_${date}`, "Recovery Ledger");
    toast.success("Operational Ledger Exported as Excel");
  };



  const handleCellClick = (customer: any, dateStr: string) => {
    const existing = postings[customer.id]?.[dateStr];
    setActiveCustomer(customer);
    setSelectedCell({
      custId: customer.id,
      date: dateStr,
      custName: customer.memberName || customer.name || "Unknown",
      accountNo: customer.accountNo,
      amount: existing?.amount || Math.min(customer.installmentAmount, customer.balance) || 0
    });
    setPayAmount(String(existing?.amount || Math.min(customer.installmentAmount, customer.balance) || ""));
    setPayMode(existing?.payMode || "cash");
    setDigiPayer(existing?.digiPayer || "");
    setLateFee(existing?.lateFee || "");
    setNote(existing?.note || "");
    setPayDate(dateStr);
    setPayDialogOpen(true);
  };

  const submitPayment = async (overrideAmount?: number) => {
    if (!checkPermission(userData, "canPostPayment")) {
      toast.error("You do not have permission to post collections.");
      return;
    }
    const targetCell = selectedCell || (activeCustomer ? {
      custId: activeCustomer.id,
      date: payDate,
      custName: activeCustomer.memberName || activeCustomer.name || "Unknown",
      accountNo: activeCustomer.accountNo,
      amount: activeCustomer.installmentAmount || 0
    } : null);

    if (!targetCell) return;
      const amountNum = overrideAmount || parseFloat(payAmount);
      const lateFeeNum = parseFloat(lateFee) || 0;
      const principalAmount = amountNum - lateFeeNum;

      if (isNaN(amountNum) || amountNum < 0) {
        toast.error("Invalid Amount");
        return;
      }

      setSubmitting(true);
      try {
        const todayDateStr = targetCell.date;
        
        // 1. Query postings collection
        const duplicateQuery = query(
          collection(db, "postings"),
          where("accountId", "==", targetCell.custId),
          where("date", "==", todayDateStr)
        );
        const duplicateSnap = await getDocs(duplicateQuery);
        
        // 2. Fetch fresh account data
        const freshAccDoc = await getDoc(doc(db, "accounts", targetCell.custId));
        const freshAccData = freshAccDoc.exists() ? freshAccDoc.data() : null;
        
        const serverLastPostingDate = freshAccData?.lastPostingDate;
        const isAlreadyPaidLocally = postings[targetCell.custId]?.[todayDateStr];

        const hasPostingToday = !duplicateSnap.empty || 
                                isAlreadyPaidLocally || 
                                serverLastPostingDate === todayDateStr;

        if (hasPostingToday) {
          setPendingDuplicateAction(() => async () => {
            setSubmitting(true);
            try {
              const isVerified = userData?.role === 'super_admin' || userData?.role === 'admin';

              const postingData = {
                accountId: targetCell.custId,
                accountNo: targetCell.accountNo,
                memberName: targetCell.custName,
                nameTelugu: activeCustomer?.nameTelugu || "",
                amount: amountNum,
                principal: principalAmount,
                lateFee: lateFeeNum,
                digiPayer: payMode === 'online' ? digiPayer : '',
                date: targetCell.date,
                payMode: payMode,
                note: payMode === 'online' ? (note || "") : "",
                agentId: userData?.uid,
                adminId: activeCustomer?.adminId || "",
                lineId: selectedLineId || activeCustomer?.lineId || "default",
                timestamp: serverTimestamp(),
                createdAt: new Date().toISOString(),
                status: 'collection',
                collectedById: userData?.uid,
                collectedByName: userData?.name || 'Unknown Agent',
                collectedByRole: userData?.role || 'agent',
                verified: isVerified
              };

              await addDoc(collection(db, "postings"), postingData);
              
              if (isVerified) {
                const accountRef = doc(db, "accounts", targetCell.custId);
                
                await updateDoc(accountRef, {
                  paid: increment(amountNum),
                  balance: increment(-principalAmount),
                  lastPostingDate: targetCell.date
                });

                if (activeCustomer && activeCustomer.id === targetCell.custId) {
                  setActiveCustomer((prev: any) => ({
                    ...prev,
                    paid: (prev.paid || 0) + amountNum,
                    balance: (prev.balance || 0) - principalAmount
                  }));
                }

                setCustomers(prev => prev.map(c => 
                  c.id === targetCell.custId 
                    ? { ...c, paid: (c.paid || 0) + amountNum, balance: (c.balance || 0) - principalAmount } 
                    : c
                ));
              }

              playSuccessSound();
              toast.success(`Success ₹${amountNum}`);
              setPayDialogOpen(false);
              setDigiPayer("");
              setLateFee("");
              setNote("");
              setPostings(prev => ({
                ...prev,
                [targetCell.custId]: { ...(prev[targetCell.custId] || {}), [targetCell.date]: postingData }
              }));
            } catch (err) {
              console.error(err);
              toast.error("Failed to post payment");
            } finally {
              setSubmitting(false);
            }
          });
          setShowDuplicateAlert(true);
          setSubmitting(false);
          return;
        }

        const isVerified = userData?.role === 'super_admin' || userData?.role === 'admin';

        const postingData = {
          accountId: targetCell.custId,
          accountNo: targetCell.accountNo,
          memberName: targetCell.custName,
          nameTelugu: activeCustomer?.nameTelugu || "",
          amount: amountNum,
          principal: principalAmount,
          lateFee: lateFeeNum,
          digiPayer: payMode === 'online' ? digiPayer : '',
          date: targetCell.date,
          payMode: payMode,
          note: payMode === 'online' ? (note || "") : "",
          agentId: userData?.uid,
          adminId: activeCustomer?.adminId || "",
          lineId: selectedLineId || activeCustomer?.lineId || "default",
          timestamp: serverTimestamp(),
          createdAt: new Date().toISOString(),
          status: 'collection',
          collectedById: userData?.uid,
          collectedByName: userData?.name || 'Unknown Agent',
          collectedByRole: userData?.role || 'agent',
          verified: isVerified
        };

        await addDoc(collection(db, "postings"), postingData);
        
        if (isVerified) {
          const accountRef = doc(db, "accounts", targetCell.custId);
          
          // Logic: Paid increases by total recovery, Balance decreases only by principal
          await updateDoc(accountRef, {
            paid: increment(amountNum),
            balance: increment(-principalAmount),
            lastPostingDate: targetCell.date
          });

          if (activeCustomer && activeCustomer.id === targetCell.custId) {
            setActiveCustomer((prev: any) => ({
              ...prev,
              paid: (prev.paid || 0) + amountNum,
              balance: (prev.balance || 0) - principalAmount
            }));
          }

          setCustomers(prev => prev.map(c => 
            c.id === targetCell.custId 
              ? { ...c, paid: (c.paid || 0) + amountNum, balance: (c.balance || 0) - principalAmount } 
              : c
          ));
        }

        playSuccessSound();
        toast.success(`Success ₹${amountNum}`);
        setPayDialogOpen(false);
        setDigiPayer("");
        setLateFee("");
        setNote("");
        setPostings(prev => ({
          ...prev,
          [targetCell.custId]: { ...(prev[targetCell.custId] || {}), [targetCell.date]: postingData }
        }));
    } catch (err) {
      console.error(err);
      toast.error("Recovery failed to sync");
    } finally { setSubmitting(false); }
  };

  const openOverrideModal = async () => {
    setOverrideModalOpen(true);
    setAdminCustomerSearch("");
    setLoadingAccounts(true);
    try {
      const snap = await getDocs(query(collection(db, "accounts"), where("status", "==", "active"), where("lineId", "==", selectedLineId)));
      setAllAccounts(snap.docs.map(d => ({id: d.id, ...d.data()})));
    } catch (err) {
      toast.error("Failed to fetch accounts");
    } finally { setLoadingAccounts(false); }
  };

  const adminSubmitOverride = async () => {
    if (!selectedAdminCustomer) return;
    const amountNum = parseFloat(payAmount);
    const lateFeeNum = parseFloat(lateFee) || 0;
    const principalAmount = amountNum - lateFeeNum;

    if (isNaN(amountNum) || amountNum < 0) {
      toast.error("Invalid Amount");
      return;
    }

    setSubmitting(true);
    try {
      const todayDateStr = payDate;

      const duplicateQuery = query(
        collection(db, "postings"),
        where("accountId", "==", selectedAdminCustomer.id),
        where("date", "==", todayDateStr)
      );
      const duplicateSnap = await getDocs(duplicateQuery);

      // Fetch fresh account data for admin override
      const freshAccDoc = await getDoc(doc(db, "accounts", selectedAdminCustomer.id));
      const freshAccData = freshAccDoc.exists() ? freshAccDoc.data() : null;

      const serverLastPostingDate = freshAccData?.lastPostingDate;
      const localLastPostingDate = selectedAdminCustomer.lastPostingDate;

      const hasPostingToday = !duplicateSnap.empty || 
                              serverLastPostingDate === todayDateStr || 
                              localLastPostingDate === todayDateStr;

      if (hasPostingToday) {
        setPendingDuplicateAction(() => async () => {
          setSubmitting(true);
          try {
            const postingData = {
              accountId: selectedAdminCustomer.id,
              accountNo: selectedAdminCustomer.accountNo,
              memberName: selectedAdminCustomer.memberName || selectedAdminCustomer.name,
              amount: amountNum,
              principal: principalAmount,
              lateFee: lateFeeNum,
              digiPayer: payMode === 'online' ? digiPayer : '',
              date: payDate,
              payMode: payMode,
              note: payMode === 'online' ? (note || "") : "",
              agentId: selectedAdminCustomer.agentId || userData?.uid || "",
              adminId: userData?.uid || "",
              lineId: selectedAdminCustomer.lineId || "default",
              timestamp: serverTimestamp(),
              status: 'collection',
              collectedByName: userData?.name || 'Admin',
              collectedByRole: 'super_admin',
              verified: true
            };

            await addDoc(collection(db, "postings"), postingData);
            
            const accountRef = doc(db, "accounts", selectedAdminCustomer.id);
            await updateDoc(accountRef, {
              paid: increment(amountNum),
              balance: increment(-principalAmount),
              status: ((selectedAdminCustomer.balance || 0) - principalAmount) > 0 ? "active" : "completed",
              lastPostingDate: payDate
            });

            playSuccessSound();
            toast.success(`Success ₹${amountNum} for ${selectedAdminCustomer.memberName}`);
            setOverrideModalOpen(false);
            fetchDataForGrid();
          } catch (err) {
            console.error(err);
            toast.error("Failed to post override");
          } finally {
            setSubmitting(false);
          }
        });
        setShowDuplicateAlert(true);
        setSubmitting(false);
        return;
      }

      const postingData = {
        accountId: selectedAdminCustomer.id,
        accountNo: selectedAdminCustomer.accountNo,
        memberName: selectedAdminCustomer.memberName || selectedAdminCustomer.name,
        amount: amountNum,
        principal: principalAmount,
        lateFee: lateFeeNum,
        digiPayer: payMode === 'online' ? digiPayer : '',
        date: payDate,
        payMode: payMode,
        note: payMode === 'online' ? (note || "") : "",
        agentId: selectedAdminCustomer.agentId || userData?.uid || "",
        adminId: userData?.uid || "",
        lineId: selectedAdminCustomer.lineId || "default",
        timestamp: serverTimestamp(),
        status: 'collection',
        collectedByName: userData?.name || 'Admin',
        collectedByRole: 'super_admin',
        verified: true
      };

      await addDoc(collection(db, "postings"), postingData);
      
      const accountRef = doc(db, "accounts", selectedAdminCustomer.id);
      await updateDoc(accountRef, {
        paid: increment(amountNum),
        balance: increment(-principalAmount),
        status: ((selectedAdminCustomer.balance || 0) - principalAmount) > 0 ? "active" : "completed",
        lastPostingDate: payDate
      });

      playSuccessSound();
      toast.success(`Success ₹${amountNum} for ${selectedAdminCustomer.memberName}`);
      setOverrideModalOpen(false);
      setSelectedAdminCustomer(null);
      setPayAmount("");
      setLateFee("");
      setDigiPayer("");
      setNote("");
      handleSearch(); // Refresh admin list
    } catch (err) {
      toast.error("Failed to manual post");
      setSubmitting(false);
    }
  };

  const uniqueVillages = Array.from(new Set(customers.map(c => c.village).filter(Boolean)));
  const filteredCustomers = customers.filter(c => {
    const matchesSearch = (c.memberName || c.name || "").toLowerCase().includes(searchQuery.toLowerCase()) || 
           (c.accountNo || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesVillage = villageFilter === "all" || c.village === villageFilter;
    return matchesSearch && matchesVillage;
  });

  const totalTarget = filteredCustomers.reduce((acc, c) => acc + (c.totalAmount || 0), 0);
  const totalRecovered = filteredCustomers.reduce((acc, c) => acc + (c.paid || 0), 0);

  if (userData?.role === "agent") {
    return (
      <div className="flex flex-col h-screen bg-[#F5F7FB] dark:bg-[#080B11] text-foreground overflow-hidden">
        {/* PhonePe Header */}
        <div className="bg-[#5f259f] px-6 pt-6 pb-6 shrink-0 shadow-lg relative z-20">
           <div className="max-w-4xl mx-auto">
             <div className="flex items-center justify-between mb-6 relative z-10">
                <div className="flex items-center gap-3">
                   <button onClick={() => navigate('/dashboard')} className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center text-white border border-white/30 backdrop-blur-sm active:scale-95 transition-all">
                      <ArrowLeft size={18} />
                   </button>
                   <div>
                      <h1 className="text-lg font-black text-white leading-none tracking-tight">Recovery Matrix</h1>
                      <p className="text-[9px] font-bold text-white/60 uppercase tracking-widest mt-1">Operative Agent Mode</p>
                   </div>
                </div>
                <button onClick={fetchDataForGrid} className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center text-white active:bg-white/20 transition-all">
                   <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                </button>
             </div>
             
             <div className="relative z-10 space-y-3">
                <div className="relative">
                   <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#5f259f]">
                     <Search size={18} />
                   </div>
                   <input 
                      type="text" 
                      placeholder="Search Member or Account ID..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full h-12 rounded-2xl bg-white pl-12 pr-4 text-sm font-bold text-slate-700 placeholder:text-slate-300 shadow-xl focus:outline-none"
                   />
                </div>
                 
                 {/* Recovery Tracker Header */}
                 <div className="grid grid-cols-2 gap-3 pt-2">
                    <div className="bg-white/10 backdrop-blur-md rounded-[1.5rem] p-4 border border-white/20">
                       <p className="text-[8px] font-black text-white/50 uppercase tracking-widest mb-1">Today's Recovery</p>
                       <h3 className="text-xl font-black text-white italic tracking-tighter">₹{totalCollectionToday}</h3>
                    </div>
                    <div className="bg-white/10 backdrop-blur-md rounded-[1.5rem] p-4 border border-white/20">
                       <p className="text-[8px] font-black text-white/50 uppercase tracking-widest mb-1">Total Expenses</p>
                       <h3 className="text-xl font-black text-rose-300 italic tracking-tighter">₹{expense}</h3>
                    </div>
                 </div>

                {uniqueVillages.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                    <button 
                      onClick={() => setVillageFilter("all")} 
                      className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${villageFilter === "all" ? 'bg-white text-[#5f259f] shadow-md' : 'bg-white/10 text-white border border-white/20'}`}
                    >
                      All Villages
                    </button>
                    {uniqueVillages.map((v: any) => (
                      <button 
                        key={v}
                        onClick={() => setVillageFilter(v)}
                        className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${villageFilter === v ? 'bg-white text-[#5f259f] shadow-md' : 'bg-white/10 text-white border border-white/20'}`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                )}
             </div>
           </div>
        </div>

        {/* Recovery Matrix List */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
           <div className="max-w-4xl mx-auto w-full space-y-3">
             {loading ? (
               <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <div className="h-10 w-10 border-4 border-[#5f259f] border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-[10px] font-black text-[#5f259f] uppercase tracking-widest">Auditing Portfolio...</p>
               </div>
             ) : filteredCustomers.map((c, idx) => (
               <motion.div 
                 key={c.id} 
                 initial={{ opacity: 0, y: 10 }}
                 animate={{ opacity: 1, y: 0 }}
                 onClick={() => { setActiveCustomer(c); setDetailModalOpen(true); }}
                 className="bg-white dark:bg-slate-900 rounded-[2rem] p-4 shadow-sm border border-slate-100 dark:border-slate-800 active:scale-[0.98] transition-all"
               >
                  <div className="flex items-start justify-between mb-4">
                     <div className="flex items-center gap-3 min-w-0">
                        <div className="h-12 w-12 rounded-2xl bg-[#5f259f]/5 flex items-center justify-center text-[#5f259f] text-[11px] font-black border border-[#5f259f]/10 shrink-0 uppercase">
                           {c.accountNo}
                        </div>
                        <div className="min-w-0">
                           <h3 className="text-[14px] font-black text-slate-900 dark:text-white tracking-tighter leading-none uppercase truncate">{c.memberName || c.name}</h3>
                           <p className="text-[9px] font-bold text-slate-400 mt-1.5 uppercase tracking-tighter">{c.village || 'No Village'}</p>
                        </div>
                     </div>
                     <div className="text-right shrink-0">
                        <p className="text-[8px] font-black text-slate-400 uppercase mb-1">{t("outstanding")}</p>
                        <h4 className="text-[16px] font-black text-rose-500 italic tracking-tighter leading-none">₹{c.balance || 0}</h4>
                     </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                     <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-3 border border-slate-100 dark:border-slate-800">
                        <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1">{t("totalDebt")}</p>
                        <p className="text-xs font-black text-slate-700 dark:text-slate-300">₹{c.totalAmount || 0}</p>
                     </div>
                     <div className="bg-emerald-50 rounded-2xl p-3 border border-emerald-100">
                        <p className="text-[7px] font-black text-emerald-400 uppercase tracking-widest mb-1">{t("recovered")}</p>
                        <p className="text-xs font-black text-emerald-600">₹{c.paid || 0}</p>
                     </div>
                  </div>

                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1.5 px-1">
                       <p className="text-[8px] font-black text-slate-400 uppercase">{t("repaymentVelocity")}</p>
                       <p className="text-[9px] font-black text-[#5f259f] italic">{Math.min(100, Math.round(((c.paid || 0) / (c.totalAmount || 1)) * 100))}%</p>
                    </div>
                    <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-200/50 dark:border-slate-700/50">
                       <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, ((c.paid || 0) / (c.totalAmount || 1)) * 100)}%` }} className="h-full bg-gradient-to-r from-[#5f259f] to-[#a855f7] rounded-full" />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-50 dark:border-slate-800">
                     <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                        {gridDates.map(d => {
                          const post = postings[c.id]?.[d];
                          const isToday = d === new Date().toISOString().split("T")[0];
                          const isSuperAdminCollected = post?.collectedByRole === 'super_admin';
                          return (
                            <div key={d} className={`h-7 w-7 rounded-lg flex items-center justify-center text-[7px] font-black border transition-all ${isSuperAdminCollected ? 'bg-indigo-500 border-indigo-400 text-white' : post ? 'bg-emerald-500 border-emerald-400 text-white' : isToday ? 'bg-amber-50 border-amber-300 text-amber-600' : 'bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-800 text-slate-200 dark:text-slate-600'}`}>
                               {isSuperAdminCollected ? <Zap size={8} /> : d.slice(8, 10)}
                            </div>
                          );
                        })}
                     </div>
                     <ChevronRight size={14} className="text-slate-300" />
                  </div>
               </motion.div>
             ))}
             
             {filteredCustomers.length === 0 && !loading && (
               <div className="py-20 text-center space-y-4 opacity-30">
                  <Search size={48} className="mx-auto" />
                  <p className="text-sm font-black uppercase tracking-widest">No Members Found</p>
               </div>
             )}

             <div className="mt-8 space-y-4 pb-20">
                <div className="h-[1px] bg-slate-200 w-full" />
                <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 space-y-4">
                  <div className="flex items-center justify-between">
                     <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-rose-50 flex items-center justify-center text-rose-500">
                           <Banknote size={18} />
                        </div>
                        <div>
                           <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-900 leading-none">Operational Expenses</h3>
                           <p className="text-[8px] font-bold text-slate-400 uppercase mt-1">Audit Ledger Entry</p>
                        </div>
                     </div>
                     <div className="text-right flex flex-col items-end">
                        <div className="flex items-center gap-2">
                           <button 
                             onClick={() => setShowExpenseDetails(true)} 
                             className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
                           >
                             <Search size={14} className="text-slate-400" />
                           </button>
                           <h4 className="text-[14px] font-black text-rose-500 italic tracking-tighter">₹{expense}</h4>
                        </div>
                        <p className="text-[7px] font-bold text-slate-400 uppercase">Today's Total</p>
                     </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button 
                      onClick={() => setIsAddingExpense(true)}
                      className="flex-1 h-12 rounded-2xl bg-rose-500 text-white font-black uppercase tracking-widest text-[10px] shadow-lg shadow-rose-100 flex items-center justify-center gap-2"
                    >
                      <Zap size={14} className="fill-white" /> Add New
                    </Button>
                    <Button 
                      variant="outline"
                      onClick={() => setShowExpenseDetails(true)}
                      className="w-12 h-12 rounded-2xl border-slate-100 bg-white text-slate-400 flex items-center justify-center shadow-sm"
                    >
                      <FileSpreadsheet size={18} />
                    </Button>
                  </div>

                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tight text-center leading-relaxed px-4 italic opacity-60">
                    Expenses are logged individually for transparency and audit compliance.
                  </p>
                </div>
             </div>
           </div>
        </div>

        <AnimatePresence>
          {detailModalOpen && activeCustomer && (
            <div className="fixed inset-0 z-[10000] flex items-center justify-center p-0 md:p-6 lg:p-12 overflow-hidden">
               <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDetailModalOpen(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-xl" />
               <motion.div 
                 initial={{ y: "20%", opacity: 0, scale: 0.95 }} 
                 animate={{ y: 0, opacity: 1, scale: 1 }} 
                 exit={{ y: "20%", opacity: 0, scale: 0.95 }} 
                 transition={{ type: "spring", damping: 30, stiffness: 300 }} 
                 className="relative w-full max-w-5xl h-full md:h-[85vh] bg-slate-50 md:rounded-[2.5rem] overflow-hidden shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] flex flex-col md:flex-row"
               >
                 {/* Close Button Desktop */}
                 <button onClick={() => setDetailModalOpen(false)} className="absolute top-6 right-6 z-30 h-10 w-10 rounded-full bg-white/20 backdrop-blur-md border border-white/30 text-white md:text-slate-400 md:bg-slate-200/50 md:border-slate-300/50 flex items-center justify-center hover:scale-110 transition-transform">
                    <X size={20} />
                 </button>

                 {/* LEFT PANEL: Account Insights */}
                 <div className="w-full md:w-[40%] bg-[#5f259f] p-8 md:p-10 text-white flex flex-col relative overflow-hidden">
                    {/* Decorative Background Elements */}
                    <div className="absolute -top-24 -right-24 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
                    <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-accent/20 rounded-full blur-3xl" />
                    
                    <div className="relative z-10 flex flex-col h-full">
                       <div className="mb-8">
                          <Badge className="bg-white/20 backdrop-blur-md border-white/30 text-white font-black text-[9px] uppercase tracking-[0.2em] px-3 py-1 mb-4">Account Portfolio</Badge>
                          <h2 className="text-4xl font-black tracking-tighter leading-none mb-2">{activeCustomer.memberName || activeCustomer.name}</h2>
                          <p className="text-white/60 font-bold uppercase text-[10px] tracking-widest">{activeCustomer.accountNo} • {activeCustomer.village}</p>
                          
                          <div className="flex gap-2 mt-6">
                             <a href={`tel:${activeCustomer.phone}`} className="flex-1 h-10 bg-white/10 backdrop-blur-md rounded-xl border border-white/20 flex items-center justify-center gap-2 text-[10px] font-black uppercase hover:bg-white/20 transition-all">
                                <Phone size={14} className="text-emerald-400" /> Call
                             </a>
                             <button onClick={() => activeCustomer.customerLocation && window.open(getGoogleMapsUrl(activeCustomer.customerLocation), '_blank')} className="flex-1 h-10 bg-white/10 backdrop-blur-md rounded-xl border border-white/20 flex items-center justify-center gap-2 text-[10px] font-black uppercase hover:bg-white/20 transition-all">
                                <Navigation size={14} className="text-blue-400" /> Maps
                             </button>
                          </div>
                       </div>

                       <div className="space-y-6 mt-auto">
                          <div className="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl">
                             <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mb-4">Principal Value</p>
                             <div className="flex items-baseline gap-2">
                                <span className="text-3xl font-black tracking-tighter">₹{activeCustomer.totalAmount}</span>
                                <span className="text-[10px] font-bold text-white/40 italic">Total Debt</span>
                             </div>
                             
                             <div className="mt-8 pt-6 border-t border-white/5 grid grid-cols-2 gap-4">
                                <div>
                                   <p className="text-[8px] font-black uppercase text-white/30 mb-1">Recovered</p>
                                   <p className="text-lg font-black text-emerald-400">₹{activeCustomer.paid}</p>
                                </div>
                                <div>
                                   <p className="text-[8px] font-black uppercase text-white/30 mb-1">Outstanding</p>
                                   <p className="text-lg font-black text-rose-400">₹{activeCustomer.balance}</p>
                                </div>
                             </div>
                          </div>

                          <div className="px-2">
                             <div className="flex items-center justify-between mb-3">
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60">Payment Velocity</p>
                                <span className="text-xs font-black italic">{Math.min(100, Math.round(((activeCustomer.paid || 0) / (activeCustomer.totalAmount || 1)) * 100))}%</span>
                             </div>
                             <div className="h-3 w-full bg-white/10 rounded-full overflow-hidden border border-white/5 p-0.5 shadow-inner">
                                <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, ((activeCustomer.paid || 0) / (activeCustomer.totalAmount || 1)) * 100)}%` }} className="h-full bg-gradient-to-r from-accent to-emerald-400 rounded-full shadow-[0_0_12px_rgba(245,158,11,0.5)]" />
                             </div>
                          </div>
                       </div>
                    </div>
                 </div>

                 {/* RIGHT PANEL: Repayment Matrix */}
                 <div className="w-full md:w-[60%] flex flex-col h-full overflow-hidden">
                    <div className="p-8 md:p-10 flex-1 overflow-y-auto no-scrollbar pb-32">
                       <div className="flex items-center justify-between mb-8">
                          <p className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">Repayment Matrix</p>
                          <div className="flex items-center gap-2 text-[9px] font-bold text-slate-400 uppercase">
                             <span className="w-2 h-2 rounded-full bg-[#5f259f]" /> Suggested Schedule
                          </div>
                       </div>
                       
                       <div className="space-y-3">
                          {activeCustomer.initialPaid > 0 && (
                             <div className="flex items-center gap-4 p-5 rounded-3xl border bg-white border-emerald-100 shadow-sm transition-all hover:shadow-md group">
                                <div className="h-12 w-12 shrink-0 rounded-2xl bg-emerald-500 text-white flex items-center justify-center font-black text-[10px] shadow-lg shadow-emerald-100 group-hover:scale-105 transition-transform">
                                   <CheckCircle2 size={18} />
                                </div>
                                <div className="flex-1">
                                   <p className="text-lg font-black text-slate-900 leading-none">₹{activeCustomer.initialPaid}</p>
                                   <p className="text-[8px] font-bold text-slate-400 uppercase mt-1.5 tracking-widest">Opening Balance / Initial Paid</p>
                                </div>
                                <div className="text-right">
                                   <Badge className="bg-emerald-50 text-emerald-600 border-emerald-200 font-black text-[8px] uppercase tracking-tighter">INITIALIZED</Badge>
                                </div>
                             </div>
                          )}

                          {generateRepaymentSchedule(activeCustomer.startDate, activeCustomer.paymentFrequency || 'daily', activeCustomer.totalAmount || 0, activeCustomer.installmentAmount || 0).map((d, i) => {
                             const post = postings[activeCustomer.id]?.[d];
                             const isToday = d === new Date().toISOString().split("T")[0];
                             const isSettled = (activeCustomer.balance || 0) <= 0;

                             return (
                                <motion.div 
                                  key={d} 
                                  initial={{ opacity: 0, y: 10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ delay: i * 0.05 }}
                                  onClick={() => !post && !isSettled && handleCellClick(activeCustomer, d)} 
                                  className={`flex items-center gap-4 p-5 rounded-3xl border transition-all cursor-pointer ${post?.collectedByRole === 'super_admin' ? 'bg-indigo-50/50 border-indigo-100 shadow-sm' : post ? 'bg-white border-slate-100' : isToday && !isSettled ? 'bg-white border-[#5f259f] shadow-lg ring-1 ring-[#5f259f]/20' : 'bg-white border-slate-100 hover:border-slate-300 shadow-sm'}`}
                                >
                                   <div className={`h-12 w-12 shrink-0 rounded-2xl flex items-center justify-center font-black text-xs ${post?.collectedByRole === 'super_admin' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-100' : post ? 'bg-slate-100 text-slate-400' : isToday && !isSettled ? 'bg-[#5f259f] text-white shadow-lg shadow-[#5f259f]/20 animate-pulse' : 'bg-slate-50 text-slate-400'}`}>
                                      {post?.collectedByRole === 'super_admin' ? <Zap size={18} /> : post ? <Check size={18} className="text-emerald-500" /> : d.slice(8, 10)}
                                   </div>
                                   <div className="flex-1">
                                      <div className="flex items-center gap-2">
                                         <p className="text-lg font-black text-slate-900 leading-none">₹{post ? post.amount : activeCustomer.installmentAmount}</p>
                                         {!post && <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">(Suggested)</span>}
                                      </div>
                                      <p className="text-[8px] font-bold text-slate-400 uppercase mt-1.5 tracking-widest">{formatDate(d)} • PLAN #{i + 1}</p>
                                   </div>
                                   <div className="text-right">
                                      {post ? (
                                         post.collectedByRole === 'super_admin' ? (
                                            <Badge className="bg-indigo-50 text-indigo-500 border-indigo-100 font-black text-[8px] uppercase tracking-tighter">ADMIN RECEIVED</Badge>
                                         ) : (
                                            <div className="flex flex-col items-end">
                                              <Badge className="bg-emerald-50 text-emerald-600 border-emerald-100 font-black text-[8px] uppercase tracking-tighter">SETTLED</Badge>
                                              <p className="text-[7px] font-bold text-slate-300 mt-1 uppercase">By {post.collectedByName}</p>
                                            </div>
                                         )
                                      ) : isSettled ? (
                                         <Badge className="bg-slate-50 text-slate-400 border-slate-100 font-black text-[8px] uppercase">CLOSED</Badge>
                                      ) : (
                                         <div className={`px-4 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest ${isToday ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'}`}>
                                            {isToday ? 'COLLECT NOW' : 'SCHEDULED'}
                                         </div>
                                      )}
                                   </div>
                                </motion.div>
                             );
                          })}
                       </div>
                    </div>

                    {/* Action Bar */}
                    <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent shrink-0 z-20">
                       <Button 
                         disabled={(activeCustomer.balance || 0) <= 0}
                         onClick={() => { setPayAmount(String(Math.min(activeCustomer.installmentAmount, activeCustomer.balance))); setPayDialogOpen(true); }} 
                         className="w-full h-16 bg-[#5f259f] disabled:bg-slate-300 disabled:shadow-none text-white font-black rounded-3xl uppercase tracking-widest text-sm shadow-[0_20px_40px_-12px_rgba(95,37,159,0.5)] active:scale-95 transition-all hover:bg-[#4a1d7d]"
                       >
                         {(activeCustomer.balance || 0) <= 0 ? 'Account Fully Settled' : 'Open Collection Terminal'}
                       </Button>
                    </div>
                 </div>
               </motion.div>
            </div>
          )}
        </AnimatePresence>


        <AnimatePresence>
          {payDialogOpen && (
            <div className="fixed inset-0 z-[20000] flex items-end justify-center px-4 pb-0">
               <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setPayDialogOpen(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
               <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 30, stiffness: 300 }} className="relative w-full max-w-md bg-white rounded-t-[3rem] shadow-2xl overflow-hidden pb-10">
                  <div className="h-1.5 w-12 bg-slate-200 rounded-full mx-auto mt-4 mb-6" />
                  <div className="px-6 space-y-6">
                     <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                           <div className="h-10 w-10 rounded-xl bg-[#5f259f] flex items-center justify-center shadow-lg"><IndianRupee className="text-white h-5 w-5" /></div>
                           <div>
                              <h4 className="text-base font-black italic uppercase text-slate-900 leading-none">Security Entry</h4>
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Audit Logic Terminal</p>
                           </div>
                        </div>
                        <button onClick={() => setPayDialogOpen(false)} className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 active:scale-95"><X size={18} /></button>
                     </div>
                     <div className="space-y-6">
                         <div className="text-center py-2">
                            <p className="text-[9px] font-black uppercase text-slate-400 tracking-[0.4em] mb-4">RECOVERY AMOUNT</p>
                            <input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="bg-transparent border-none text-4xl font-black text-[#5f259f] focus:outline-none w-full text-center tracking-tighter tabular-nums" />
                         </div>

                         <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                              <Label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Entry Date</Label>
                              <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} disabled={!checkPermission(userData, 'canChangeDate')} className="w-full h-12 rounded-xl bg-slate-50 border border-slate-100 px-3 text-[11px] font-black text-slate-700 focus:outline-none uppercase" />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Mode</Label>
                              <div className="flex gap-1.5">
                                 <button onClick={() => setPayMode('cash')} className={`flex-1 h-12 rounded-xl flex items-center justify-center gap-1.5 border transition-all ${payMode === 'cash' ? 'bg-[#5f259f] border-[#5f259f] text-white shadow-md' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
                                    <Banknote size={14} /> <span className="text-[9px] font-black italic">CASH</span>
                                 </button>
                                 <button onClick={() => setPayMode('online')} className={`flex-1 h-12 rounded-xl flex items-center justify-center gap-1.5 border transition-all ${payMode === 'online' ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
                                    <CreditCard size={14} /> <span className="text-[9px] font-black italic">DIGI</span>
                                 </button>
                              </div>
                            </div>
                         </div>

                         <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                              <Label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Late Charges</Label>
                              <input 
                                 type="number" 
                                 placeholder="₹0"
                                 value={lateFee} 
                                 onChange={(e) => setLateFee(e.target.value)} 
                                 className="w-full h-12 rounded-xl bg-orange-50 border border-orange-100 px-3 text-[11px] font-black text-orange-600 focus:outline-none" 
                              />
                            </div>
                            <AnimatePresence>
                              {payMode === 'online' && (
                                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-1.5">
                                  <Label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Receiver Name</Label>
                                  <input 
                                     type="text" 
                                     placeholder="Enter Digital ID..."
                                     value={digiPayer} 
                                     onChange={(e) => setDigiPayer(e.target.value)} 
                                     className="w-full h-12 rounded-xl bg-indigo-50 border border-indigo-100 px-3 text-[11px] font-black text-indigo-600 focus:outline-none uppercase" 
                                  />
                                </motion.div>
                              )}
                            </AnimatePresence>
                         </div>

                         <AnimatePresence>
                           {payMode === 'online' && (
                             <motion.div 
                               initial={{ opacity: 0, y: -5 }} 
                               animate={{ opacity: 1, y: 0 }} 
                               exit={{ opacity: 0, y: -5 }} 
                               className="space-y-1.5"
                             >
                               <Label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Note / Reference (Optional)</Label>
                               <input 
                                  type="text" 
                                  placeholder="Enter transaction ref, bank name or note..."
                                  value={note} 
                                  onChange={(e) => setNote(e.target.value)} 
                                  className="w-full h-12 rounded-xl bg-slate-50 border border-slate-100 px-3 text-[11px] font-bold text-slate-900 focus:outline-none" 
                               />
                             </motion.div>
                           )}
                         </AnimatePresence>
                         
                         <Button onClick={() => submitPayment()} disabled={submitting} className="w-full h-14 rounded-2xl bg-slate-900 text-white text-base font-black italic uppercase shadow-[0_15px_30px_rgba(0,0,0,0.2)] active:scale-95 transition-all flex items-center justify-center gap-3">
                            Confirm Recovery <Zap size={20} className="text-amber-400 fill-amber-400" />
                         </Button>
                      </div>
                  </div>
               </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Admin View - Using Number() for precision
  const total = records.reduce((acc, r) => acc + (Number(r.amount) || 0) + (Number(r.penaltyAmount) || 0) + (Number(r.extraAmount) || 0), 0);
  const cashTotal = records.filter(r => r.payMode === 'cash').reduce((acc, r) => acc + (Number(r.amount) || 0) + (Number(r.penaltyAmount) || 0) + (Number(r.extraAmount) || 0), 0);
  const onlineTotal = records.filter(r => r.payMode !== 'cash').reduce((acc, r) => acc + (Number(r.amount) || 0) + (Number(r.penaltyAmount) || 0) + (Number(r.extraAmount) || 0), 0);

  const handleEditPosting = (posting: any) => {
    setSelectedEditPosting(posting);
    setEditPostDate(posting.date);
    setEditPostAmount(String(posting.amount));
    setEditPostingOpen(true);
  };

  const saveEditPosting = async () => {
    if (!selectedEditPosting || !editPostDate || !editPostAmount) return;
    try {
      const postingRef = doc(db, "postings", selectedEditPosting.id);
      const updates = {
        date: editPostDate,
        amount: parseFloat(editPostAmount)
      };
      await updateDoc(postingRef, updates);
      toast.success("Entry revised successfully");
      setRecords(prev => prev.map(p => p.id === selectedEditPosting.id ? { ...p, ...updates } : p));
      setEditPostingOpen(false);
    } catch (err) {
      toast.error("Correction failed");
    }
  };

  const handleBulkMove = async () => {
    if (!records.length) {
      toast.error("No records found to move");
      return;
    }
    setIsBulkMoving(true);
    const toastId = toast.loading(`Moving ${records.length} transactions...`);
    try {
      const batchPromises = records.map(async (r) => {
        const postingRef = doc(db, "postings", r.id);
        return updateDoc(postingRef, { date: batchNewDate });
      });

      await Promise.all(batchPromises);
      
      toast.success(`Successfully moved ${records.length} transactions to ${batchNewDate}`, { id: toastId });
      
      if (userData) {
        logActivity(
          userData.uid,
          userData.name,
          userData.role,
          "BATCH_DATE_CHANGE",
          `Moved ${records.length} transactions from ${date} to ${batchNewDate}`,
          selectedLineId
        );
      }

      setBulkMoveOpen(false);
      // Important: Delay refresh slightly to allow Firestore propagation
      setTimeout(() => {
        handleSearch();
      }, 500);
    } catch (err: any) {
      console.error("Bulk Move Error:", err);
      toast.error(`Failed to move: ${err.message || "Unknown error"}`, { id: toastId });
    } finally {
      setIsBulkMoving(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!records.length) {
      toast.error("No records found to delete");
      return;
    }
    
    setIsBulkDeleting(true);
    const toastId = toast.loading(`Deleting ${records.length} transactions without affecting balances...`);
    try {
      const batchPromises = records.map(async (r) => {
        const postingRef = doc(db, "postings", r.id);
        return deleteDoc(postingRef);
      });

      await Promise.all(batchPromises);
      
      toast.success(`Successfully deleted ${records.length} transactions for ${date}`, { id: toastId });
      
      if (userData) {
        logActivity(
          userData.uid,
          userData.name,
          userData.role,
          "BATCH_POSTING_DELETE",
          `Bulk deleted ${records.length} transactions for date ${date} WITHOUT reversing balances`,
          selectedLineId
        );
      }

      setBulkDeleteOpen(false);
      setTimeout(() => {
        handleSearch();
      }, 500);
    } catch (err: any) {
      console.error("Bulk Delete Error:", err);
      toast.error(`Failed to delete: ${err.message || "Unknown error"}`, { id: toastId });
    } finally {
      setIsBulkDeleting(false);
    }
  };


  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-slate-900 flex items-center justify-center shadow-lg"><Wallet className="text-white h-6 w-6" /></div>
          <div><h1 className="text-3xl font-extrabold tracking-tight text-[#5f259f] uppercase italic">Recovery Intelligence</h1><p className="text-muted-foreground font-medium">Global session auditing matrix.</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-4 md:mt-0">
          {(userData?.role === "super_admin" || userData?.role === "admin" || userData?.role === "partner") && (
             <>
               <Button 
                 onClick={() => setBulkMoveOpen(true)} 
                 disabled={records.length === 0}
                 className="bg-amber-500 hover:bg-amber-600 text-white shadow-lg h-11 px-6 font-bold uppercase tracking-widest text-[10px]"
               >
                 <Calendar className="mr-2 h-4 w-4" /> Bulk Move
               </Button>
               <Button 
                 onClick={() => setBulkDeleteOpen(true)} 
                 disabled={records.length === 0}
                 className="bg-rose-500 hover:bg-rose-600 text-white shadow-lg h-11 px-6 font-bold uppercase tracking-widest text-[10px]"
               >
                 <Trash2 className="mr-2 h-4 w-4" /> Bulk Delete
               </Button>
               <Button onClick={openOverrideModal} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg h-11 px-6 font-bold uppercase tracking-widest text-[10px]"><Zap size={14} className="mr-2" /> Manual Override</Button>
             </>

          )}
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-11 w-44 glass-card border-none shadow-sm font-bold text-[#5f259f]" />
          <Button onClick={handleSearch} className="bg-[#5f259f] hover:bg-[#4a1c7c] text-white h-11 px-6 shadow-lg font-bold" disabled={loading}>{loading ? "Syncing..." : "Sync Matrix"}</Button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="glass-card bg-[#0F172A] text-white border-none shadow-xl"><CardContent className="p-6"><p className="text-xs font-bold uppercase tracking-widest opacity-70 italic">Aggregated Recovery</p><h2 className="text-4xl font-black mt-2 italic">{formatCurrency(total)}</h2></CardContent></Card>
        <Card className="glass-card border-none shadow-md"><CardContent className="p-6"><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Cash (Vault Status)</p><h2 className="text-3xl font-black text-emerald-600 mt-2">{formatCurrency(cashTotal)}</h2></CardContent></Card>
        <Card className="glass-card border-none shadow-md"><CardContent className="p-6"><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Digital (Gateway Status)</p><h2 className="text-3xl font-black text-indigo-600 mt-2">{formatCurrency(onlineTotal)}</h2></CardContent></Card>
      </div>
      <Card className="glass-card border-none shadow-2xl overflow-hidden rounded-3xl">
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="p-5 text-[10px] uppercase font-black text-slate-500">ID</th>
                <th className="p-5 text-[10px] uppercase font-black text-slate-500">Member Info</th>
                <th className="p-5 text-[10px] uppercase font-black text-slate-500 text-right">Credit</th>
                <th className="p-5 text-[10px] uppercase font-black text-slate-500 text-right">A/C Balance</th>
                <th className="p-5 text-[10px] uppercase font-black text-slate-500 text-right">Late Fee</th>
                <th className="p-5 text-[10px] uppercase font-black text-slate-500">Mode</th>
                <th className="p-5 text-[10px] uppercase font-black text-slate-500">Collected By</th>
                <th className="p-5 text-[10px] uppercase font-black text-slate-500">Verify ID</th>
                <th className="p-5 text-[10px] uppercase font-black text-slate-500 text-center">Audit</th>
                {userData?.role === "super_admin" && (
                  <>
                    <th className="p-5 text-[10px] uppercase font-black text-slate-500 text-right">Edit</th>
                    <th className="p-5 text-[10px] uppercase font-black text-slate-500 text-right">Delete</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => (
                <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                  <td className="p-5 text-xs font-black text-slate-400">#{String(i+1).padStart(2,'0')}</td>
                  <td className="p-5">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-slate-900 uppercase italic">{r.memberName}</span>
                        {r.nameTelugu && (
                          <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded italic">
                            {r.nameTelugu}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-bold text-primary uppercase">{r.accountNo}</span>
                    </div>
                  </td>
                  <td className="p-5 text-right font-black text-emerald-600 italic text-lg">{formatCurrency(r.amount)}</td>
                  <td className="p-5 text-right font-black text-rose-500 text-sm">
                    {formatCurrency(customers.find(c => c.id === r.accountId)?.balance || 0)}
                  </td>
                  <td className="p-5 text-right font-black text-orange-500 italic text-sm">{formatCurrency(r.lateFee || 0)}</td>
                  <td className="p-5">
                    <div className="flex flex-col gap-1">
                      <Badge className="bg-slate-100 text-slate-600 border-none font-black text-[9px] uppercase tracking-widest w-max">{r.payMode}</Badge>
                      {r.note && (
                        <span className="text-[9px] font-medium text-slate-500 max-w-[120px] truncate" title={r.note}>
                          {r.note}
                        </span>
                      )}
                    </div>
                  </td>
                   <td className="p-5">
                      <div className="flex flex-col">
                        <span className="text-[11px] font-black text-slate-800 uppercase leading-none">{r.collectedByName || 'System'}</span>
                        <span className={`text-[8px] font-bold uppercase mt-1 ${r.collectedByRole === 'super_admin' ? 'text-indigo-500' : 'text-emerald-500'}`}>
                          {r.collectedByRole === 'super_admin' ? 'Admin' : 'Agent'}
                        </span>
                      </div>
                   </td>
                   <td className="p-5"><span className="text-[10px] font-black text-indigo-500 uppercase tracking-tighter">{r.digiPayer || '—'}</span></td>
                  <td className="p-5 text-center">
                    <Badge variant="outline" className="text-slate-400 text-[9px] font-black uppercase whitespace-nowrap">
                      {(r.collectedByRole || 'Agent').replace('_', ' ')} {r.status}
                    </Badge>
                  </td>
                  {(userData?.role === "super_admin" || userData?.role === "admin" || userData?.role === "partner") && (
                    <>
                      <td className="p-5 text-right">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-slate-400 hover:text-blue-500 hover:bg-blue-50/50"
                          onClick={() => handleEditPosting(r)}
                        >
                          <Edit3 size={14} />
                        </Button>
                      </td>
                      <td className="p-5 text-right">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-slate-400 hover:text-destructive hover:bg-destructive/5"
                          onClick={() => handleDeletePosting(r)}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      
      {/* Day-End Account Summary (Point 7.2) */}
      {(userData?.role === "super_admin" || userData?.role === "admin" || userData?.role === "partner") && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
           <Card className="glass-card border-none shadow-2xl bg-[#0F172A] text-white rounded-3xl overflow-hidden">
              <CardHeader className="border-b border-white/5 bg-white/5">
                <CardTitle className="text-xl font-black italic uppercase tracking-tight flex items-center gap-2">
                   <Scale className="text-amber-500" /> End of Day Settlement
                </CardTitle>
              </CardHeader>
              <CardContent className="p-8 space-y-6">
                 <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-1">
                       <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Agent Collection</p>
                       <p className="text-2xl font-black text-emerald-400">{formatCurrency(records.filter(r => r.collectedByRole !== 'super_admin' && r.collectedByRole !== 'admin').reduce((acc, r) => acc + (Number(r.amount) || 0) + (Number(r.penaltyAmount) || 0) + (Number(r.extraAmount) || 0), 0))}</p>
                    </div>
                    <div className="space-y-1">
                       <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Admin Collection</p>
                       <p className="text-2xl font-black text-indigo-400">{formatCurrency(records.filter(r => r.collectedByRole === 'super_admin' || r.collectedByRole === 'admin').reduce((acc, r) => acc + (Number(r.amount) || 0) + (Number(r.penaltyAmount) || 0) + (Number(r.extraAmount) || 0), 0))}</p>
                    </div>
                 </div>

                 <div className="h-[1px] bg-white/5 w-full" />

                 <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-1">
                       <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Payments Given (Disbursed)</p>
                       <p className="text-2xl font-black text-rose-400">-{formatCurrency(disbursedToday)}</p>
                    </div>
                    <div className="space-y-1">
                       <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Document Charges</p>
                       <p className="text-2xl font-black text-amber-400">+{formatCurrency(docChargesToday)}</p>
                    </div>
                 </div>

                 <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-1">
                       <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Opening Balance</p>
                       <p className="text-2xl font-black text-slate-300">{formatCurrency(parseFloat(openingBalance) || 0)}</p>
                    </div>
                    <div className="space-y-1">
                       <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Other Inflows</p>
                       <p className="text-2xl font-black text-emerald-400">+{formatCurrency(parseFloat(manualInflow) || 0)}</p>
                    </div>
                 </div>

                 <div className="h-[1px] bg-white/5 w-full" />

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div className="space-y-2">
                        <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Operational Expenses</p>
                        <div className="relative group">
                           <Banknote size={16} className="absolute left-4 top-3.5 text-slate-500 group-focus-within:text-amber-500 transition-colors" />
                           <Input 
                             type="number"
                             value={expense}
                             onChange={(e) => setExpense(e.target.value)}
                             className="bg-white/5 border-white/10 h-12 pl-12 rounded-2xl font-black text-lg text-white focus:ring-amber-500/20"
                             placeholder="0"
                           />
                        </div>
                     </div>
                     <div className="space-y-2">
                        <div className="flex items-center justify-between">
                           <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Other Inflows</p>
                           <Button 
                             variant="ghost" 
                             size="sm" 
                             onClick={handleSaveSummary} 
                             disabled={isSavingSummary}
                             className="h-7 text-[9px] font-black uppercase tracking-tighter text-amber-500 hover:bg-amber-500/10"
                           >
                              {isSavingSummary ? "Saving..." : "Update Summary"}
                           </Button>
                        </div>
                        <div className="relative group">
                           <TrendingUp size={16} className="absolute left-4 top-3.5 text-slate-500 group-focus-within:text-emerald-500 transition-colors" />
                           <Input 
                             type="number"
                             value={manualInflow}
                             onChange={(e) => setManualInflow(e.target.value)}
                             className="bg-white/5 border-white/10 h-12 pl-12 rounded-2xl font-black text-lg text-white focus:ring-emerald-500/20"
                             placeholder="0"
                           />
                        </div>
                     </div>
                  </div>

                 <div className="pt-4 mt-4 border-t border-white/10">
                    <div className="flex items-center justify-between">
                       <h3 className="text-lg font-black uppercase italic text-slate-300">Final Net Balance</h3>
                       <div className="text-right">
                           <p className={`text-4xl font-black italic ${((parseFloat(openingBalance) || 0) + records.reduce((acc, r) => acc + (r.amount || 0) + (r.penaltyAmount || 0) + (r.extraAmount || 0), 0) + docChargesToday + (parseFloat(manualInflow) || 0)) - (disbursedToday + (parseFloat(expense) || 0)) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {formatCurrency(((parseFloat(openingBalance) || 0) + records.reduce((acc, r) => acc + (r.amount || 0) + (r.penaltyAmount || 0) + (r.extraAmount || 0), 0) + docChargesToday + (parseFloat(manualInflow) || 0)) - (disbursedToday + (parseFloat(expense) || 0)))}
                           </p>
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mt-1">Settlement Figure for {formatDate(date)}</p>
                       </div>
                    </div>
                 </div>
              </CardContent>
           </Card>

           <Card className="glass-card border-none shadow-2xl bg-white rounded-3xl overflow-hidden flex flex-col items-center justify-center p-12 text-center space-y-6">
              <div className="h-20 w-20 rounded-[2.5rem] bg-slate-900 flex items-center justify-center text-white shadow-2xl mb-2">
                 <ShieldCheck size={40} className="text-emerald-400" />
              </div>
              <h2 className="text-3xl font-black italic uppercase tracking-tighter text-slate-900">Audit Complete?</h2>
              <p className="text-slate-500 font-medium max-w-sm">Once all postings are verified and expenses are logged, this day's operative cycle is considered closed. Ensure all manual overrides match physical records.</p>
              <div className="flex gap-4 w-full pt-4">
                 <Button onClick={handleExportPDF} variant="outline" className="flex-1 h-12 rounded-2xl font-black uppercase text-[10px] tracking-widest border-slate-200">Export PDF</Button>
                 <Button onClick={handleExportExcel} variant="outline" className="flex-1 h-12 rounded-2xl font-black uppercase text-[10px] tracking-widest border-emerald-200 text-emerald-600 hover:bg-emerald-50">Export Excel</Button>
              </div>
           </Card>
        </motion.div>
      )}
        
        {/* Administrator Manual Override Modal */}
        <AnimatePresence>
          {overrideModalOpen && (
            <div className="fixed inset-0 z-[20000] flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOverrideModalOpen(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
              <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="relative bg-white rounded-3xl shadow-2xl p-6 md:p-8 w-full max-w-lg z-10 max-h-[90vh] overflow-y-auto no-scrollbar">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600"><Zap size={20} /></div>
                    <div>
                      <h3 className="font-black text-xl italic uppercase tracking-tight text-slate-900">Manual Override</h3>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Admin Collection Gateway</p>
                    </div>
                  </div>
                  <button onClick={() => setOverrideModalOpen(false)} className="text-slate-400 hover:bg-slate-100 p-2 rounded-full transition-all"><X size={20} /></button>
                </div>
                
                <div className="space-y-6">
                  {/* Customer Search */}
                  {!selectedAdminCustomer ? (
                    <div className="space-y-4">
                      <div className="relative">
                        <Search className="absolute left-3 top-3.5 text-slate-400 h-5 w-5" />
                        <Input 
                          placeholder="Search Members..." 
                          value={adminCustomerSearch}
                          onChange={(e) => setAdminCustomerSearch(e.target.value)}
                          className="pl-10 h-12 rounded-xl text-sm font-bold bg-slate-50 border-slate-200"
                        />
                      </div>
                      <div className="space-y-2 max-h-60 overflow-y-auto no-scrollbar pr-2">
                         {loadingAccounts ? (
                           <div className="flex justify-center p-4"><div className="animate-spin h-5 w-5 border-2 border-indigo-600 border-t-transparent rounded-full" /></div>
                         ) : 
                           allAccounts.filter(c => 
                             (c.memberName?.toLowerCase().includes(adminCustomerSearch.toLowerCase()) || 
                              c.accountNo?.toLowerCase().includes(adminCustomerSearch.toLowerCase()))
                           ).slice(0, 50).map(c => (
                             <div 
                               key={c.id} 
                               onClick={() => {
                                 setSelectedAdminCustomer(c);
                                 setPayAmount(String(c.installmentAmount || ''));
                               }} 
                               className="p-3 rounded-xl bg-white border border-slate-100 shadow-sm flex justify-between items-center cursor-pointer hover:border-indigo-300 hover:shadow-md transition-all"
                             >
                               <div>
                                 <h4 className="font-black text-sm text-slate-900 uppercase">{c.memberName || c.name}</h4>
                                 <p className="text-[10px] font-bold text-slate-500">ACC: {c.accountNo} • LINE: {lines.find((l:any) => l.id === c.lineId)?.name || c.lineId}</p>
                               </div>
                               <Badge className="bg-emerald-50 text-emerald-600 border-none">₹{c.balance}</Badge>
                             </div>
                           ))
                         }
                      </div>
                    </div>
                  ) : (
                    // Payment Form
                    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-5">
                      <div className="p-4 bg-slate-50 rounded-2xl flex justify-between items-center border border-slate-100">
                        <div>
                           <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Selected Member</p>
                           <h4 className="font-black text-lg text-slate-900 leading-none uppercase">{selectedAdminCustomer.memberName}</h4>
                           <p className="text-xs font-bold text-indigo-500 mt-1">{selectedAdminCustomer.accountNo}</p>
                        </div>
                        <button onClick={() => setSelectedAdminCustomer(null)} className="text-xs font-bold text-rose-500 underline uppercase">Change</button>
                      </div>

                      <div className="space-y-4">
                        <div className="text-center bg-indigo-50 p-4 rounded-2xl border border-indigo-100">
                          <p className="text-[9px] font-black uppercase text-indigo-400 tracking-[0.2em] mb-2">RECOVERY AMOUNT</p>
                          <input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="bg-transparent border-none text-4xl font-black text-indigo-700 focus:outline-none w-full text-center tabular-nums" />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label className="text-[9px] font-black uppercase text-slate-500">Date</Label>
                            <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} disabled={!checkPermission(userData, 'canChangeDate')} className="h-11 rounded-xl bg-slate-50 uppercase text-xs font-bold" />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[9px] font-black uppercase text-slate-500">Mode</Label>
                            <div className="flex gap-2">
                               <button onClick={() => setPayMode('cash')} className={`flex-1 h-11 rounded-xl flex items-center justify-center gap-1.5 border transition-all ${payMode === 'cash' ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-slate-50 border-slate-100 text-slate-500'}`}>
                                  <Banknote size={14} /> <span className="text-[9px] font-black">CASH</span>
                               </button>
                               <button onClick={() => setPayMode('online')} className={`flex-1 h-11 rounded-xl flex items-center justify-center gap-1.5 border transition-all ${payMode === 'online' ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-slate-50 border-slate-100 text-slate-500'}`}>
                                  <CreditCard size={14} /> <span className="text-[9px] font-black">DIGI</span>
                               </button>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label className="text-[9px] font-black uppercase text-slate-500">Late Fee</Label>
                            <Input type="number" placeholder="₹0" value={lateFee} onChange={(e) => setLateFee(e.target.value)} className="h-11 rounded-xl bg-orange-50 border-orange-100 text-orange-600 font-bold" />
                          </div>
                          {payMode === 'online' && (
                            <div className="space-y-1.5">
                              <Label className="text-[9px] font-black uppercase text-slate-500">Receiver Name</Label>
                              <Input type="text" placeholder="Digital ID" value={digiPayer} onChange={(e) => setDigiPayer(e.target.value)} className="h-11 rounded-xl bg-indigo-50 border-indigo-100 text-indigo-600 font-bold uppercase" />
                            </div>
                          )}
                        </div>

                        {payMode === 'online' && (
                          <div className="space-y-1.5">
                            <Label className="text-[9px] font-black uppercase text-slate-500">Note / Reference (Optional)</Label>
                            <Input 
                              type="text" 
                              placeholder="Enter transaction ref, bank name or note..." 
                              value={note} 
                              onChange={(e) => setNote(e.target.value)} 
                              className="h-11 rounded-xl bg-slate-50 border-slate-100 text-slate-700 font-bold text-slate-900" 
                            />
                          </div>
                        )}

                        <Button disabled={submitting} onClick={adminSubmitOverride} className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xl shadow-indigo-600/20 font-black uppercase tracking-widest text-sm flex items-center gap-2">
                          {submitting ? <RefreshCw className="animate-spin h-5 w-5" /> : <><CheckCircle2 size={18} /> CONFIRM OVERRIDE</>}
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      <Dialog open={editPostingOpen} onOpenChange={setEditPostingOpen}>
        <DialogContent className="sm:max-w-[425px] glass-card border-none shadow-2xl p-0 overflow-hidden">
          <div className="bg-slate-900 p-6 text-white">
            <DialogTitle className="text-xl font-black italic uppercase tracking-tight flex items-center gap-2">
              <Edit3 size={20} className="text-amber-400" />
              Manual Correction
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs mt-1">
              Modifying transaction for {selectedEditPosting?.memberName}
            </DialogDescription>
          </div>
          <div className="p-6 space-y-5">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Corrected Amount</Label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input 
                  type="number" 
                  value={editPostAmount} 
                  onChange={e => setEditPostAmount(e.target.value)} 
                  className="pl-9 h-12 finance-input font-black text-lg" 
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Adjusted Date</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input 
                  type="date" 
                  value={editPostDate} 
                  onChange={e => setEditPostDate(e.target.value)} 
                  className="pl-9 h-12 finance-input font-bold" 
                />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setEditPostingOpen(false)} className="flex-1 h-12 rounded-xl font-bold uppercase tracking-widest text-xs border-slate-200">
                Cancel
              </Button>
              <Button onClick={saveEditPosting} className="flex-1 h-12 rounded-xl bg-slate-900 text-white font-bold uppercase tracking-widest text-xs shadow-lg hover:bg-slate-800">
                Confirm Revision
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkMoveOpen} onOpenChange={setBulkMoveOpen}>
        <DialogContent className="sm:max-w-[425px] glass-card border-none shadow-2xl p-0 overflow-hidden text-slate-900">
          <div className="bg-amber-500 p-6 text-white">
            <DialogTitle className="text-xl font-black italic uppercase tracking-tight flex items-center gap-2 text-white">
              <Calendar size={20} className="text-white" />
              Batch Date Change
            </DialogTitle>
            <DialogDescription className="text-white/80 text-xs mt-1">
              Moving {records.length} transactions from {formatDate(date)}
            </DialogDescription>
          </div>
          <div className="p-6 space-y-6">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Destination Date</Label>
              <div className="relative text-slate-900">
                <Calendar className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input 
                  type="date" 
                  value={batchNewDate} 
                  onChange={e => setBatchNewDate(e.target.value)} 
                  className="pl-9 h-12 finance-input font-bold text-slate-900" 
                />
              </div>
            </div>
            
            <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100">
              <p className="text-[10px] font-bold text-amber-700 uppercase tracking-tight leading-relaxed">
                Warning: This action will move all recovery entries listed on the current page to the new selected date. This affects daily reports and ledger history.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setBulkMoveOpen(false)} className="flex-1 h-12 rounded-xl font-bold uppercase tracking-widest text-xs border-slate-200">
                Cancel
              </Button>
              <Button 
                onClick={handleBulkMove} 
                disabled={isBulkMoving}
                className="flex-1 h-12 rounded-xl bg-amber-600 text-white font-bold uppercase tracking-widest text-xs shadow-lg hover:bg-amber-700"
              >
                {isBulkMoving ? "Moving..." : "Confirm Move"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isAddingExpense} onOpenChange={setIsAddingExpense}>
        <DialogContent className="sm:max-w-[425px] glass-card border-none shadow-2xl p-0 overflow-hidden">
          <div className={`${expenseType === "inflow" ? "bg-emerald-500" : "bg-rose-500"} p-6 text-white transition-colors duration-300`}>
            <DialogTitle className="text-xl font-black italic uppercase tracking-tight flex items-center gap-2 text-white">
              <Banknote size={20} className="text-white" />
              Transaction Entry
            </DialogTitle>
            <DialogDescription className="text-white/80 text-xs mt-1">
              Add operational costs or other inflows for {lines.find(l => l.id === (userData?.role === 'agent' ? selectedLineId : selectedLineId))?.name || 'this line'}
            </DialogDescription>
          </div>
          <div className="p-6 space-y-4">
            <div className="space-y-2 text-slate-900">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Transaction Type</Label>
              <select
                value={expenseType}
                onChange={e => setExpenseType(e.target.value as any)}
                className="w-full h-12 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-700 dark:text-white outline-none shadow-sm focus:border-accent"
              >
                <option value="outflow">Outflow / Expense</option>
                <option value="inflow">Inflow / Other Payment</option>
              </select>
            </div>

            <div className="space-y-2 text-slate-900">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Amount</Label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input 
                  type="number" 
                  value={expenseAmount} 
                  onChange={e => setExpenseAmount(e.target.value)} 
                  placeholder="0.00"
                  className="pl-9 h-12 finance-input font-black text-lg text-slate-900 dark:text-white" 
                />
              </div>
            </div>
            
            <div className="space-y-2 text-slate-900">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Reason / Note</Label>
              <Input 
                type="text" 
                value={expenseNote} 
                onChange={e => setExpenseNote(e.target.value)} 
                placeholder={expenseType === "inflow" ? "Received from..., other source, etc." : "Fuel, maintenance, etc."}
                className="h-12 finance-input font-bold text-slate-900 dark:text-white" 
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setIsAddingExpense(false)} className="flex-1 h-12 rounded-xl font-bold uppercase tracking-widest text-xs border-slate-200 dark:border-slate-800">
                Cancel
              </Button>
              <Button 
                onClick={handleAddExpense} 
                disabled={isSavingSummary}
                className={`flex-1 h-12 rounded-xl text-white font-bold uppercase tracking-widest text-xs shadow-lg transition-colors duration-300 ${
                  expenseType === "inflow" 
                    ? "bg-emerald-600 hover:bg-emerald-700" 
                    : "bg-rose-600 hover:bg-rose-700"
                }`}
              >
                {isSavingSummary ? "Syncing..." : expenseType === "inflow" ? "Add Inflow" : "Add Expense"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={showExpenseDetails} onOpenChange={setShowExpenseDetails}>
        <DialogContent className="max-w-[90vw] sm:max-w-2xl bg-white dark:bg-slate-900 rounded-3xl border-none shadow-2xl p-0 overflow-hidden">
          <div className="bg-slate-900 p-6 text-white border-b border-slate-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 mb-1">Daily Audit</p>
                <h2 className="text-xl font-black italic tracking-tighter uppercase">Transaction Registry</h2>
              </div>
              <div className="flex gap-4">
                <div className="text-right">
                  <p className="text-sm font-black text-rose-450 italic">-{formatCurrency(parseFloat(expense || "0"))}</p>
                  <p className="text-[7px] font-black uppercase tracking-widest text-slate-500">Outflows</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-emerald-450 italic">+{formatCurrency(parseFloat(manualInflow || "0"))}</p>
                  <p className="text-[7px] font-black uppercase tracking-widest text-slate-500">Inflows</p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="p-6">
            <div className="max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    <th className="pb-3 text-[9px] font-black uppercase tracking-widest text-slate-400">Time</th>
                    <th className="pb-3 text-[9px] font-black uppercase tracking-widest text-slate-400">Entry</th>
                    <th className="pb-3 text-[9px] font-black uppercase tracking-widest text-slate-400 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-850">
                  {(() => {
                    const sortedLogs = [...dailyExpenseLogs].sort((a, b) => {
                      const timeA = a.timestamp || a.createdAt || "";
                      const timeB = b.timestamp || b.createdAt || "";
                      return timeA.localeCompare(timeB);
                    });
                    let running = 0;
                    const displayLogs = sortedLogs.map(log => {
                      const amt = log.amount || 0;
                      if (log.type === "inflow") {
                        running += amt;
                      } else {
                        running -= amt;
                      }
                      return { ...log, runningBalance: running };
                    }).reverse();

                    if (displayLogs.length === 0) {
                      return (
                        <tr>
                          <td colSpan={3} className="py-10 text-center text-slate-400 italic text-[10px] font-black uppercase tracking-widest">
                            No telemetry found
                          </td>
                        </tr>
                      );
                    }

                    return displayLogs.map((log, i) => (
                      <tr key={log.id || i} className="group hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                        {editingExpense?.id === log.id ? (
                          <td colSpan={3} className="py-3 px-2">
                            <div className="space-y-2">
                              <div className="flex gap-2">
                                <Input 
                                  type="text"
                                  inputMode="decimal"
                                  value={editInput.amount}
                                  onChange={e => setEditInput(p => ({ ...p, amount: e.target.value }))}
                                  className="h-8 w-24 text-xs font-bold bg-white dark:bg-slate-800"
                                  placeholder="Amount"
                                />
                                <Input 
                                  value={editInput.note}
                                  onChange={e => setEditInput(p => ({ ...p, note: e.target.value }))}
                                  className="h-8 flex-1 text-xs font-bold bg-white dark:bg-slate-800"
                                  placeholder="Note"
                                />
                              </div>
                              <div className="flex justify-end gap-2">
                                <Button onClick={() => setEditingExpense(null)} variant="ghost" size="sm" className="h-7 text-[9px] uppercase">Cancel</Button>
                                <Button onClick={handleUpdateExpense} size="sm" className="h-7 bg-emerald-500 hover:bg-emerald-600 text-white text-[9px] uppercase font-black">Update</Button>
                              </div>
                            </div>
                          </td>
                        ) : (
                          <>
                            <td className="py-3 text-[9px] font-bold text-slate-400">
                               {log.timestamp ? new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                            </td>
                            <td className="py-3">
                               <div className="flex items-center gap-1.5 flex-wrap">
                                 <p className="text-[11px] font-black text-slate-800 dark:text-slate-100 uppercase leading-tight">{log.note || 'Expense'}</p>
                                 <span className={`text-[6px] px-1 py-0.5 rounded font-black uppercase leading-none ${log.type === "inflow" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400" : "bg-rose-50 text-rose-600 dark:bg-rose-950/20 dark:text-rose-450"}`}>
                                   {log.type === "inflow" ? "Inflow" : "Outflow"}
                                 </span>
                               </div>
                               <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter mt-0.5">By {log.userName || log.collectedByName || 'System'}</p>
                            </td>
                            <td className="py-3 text-right">
                               <div className="flex items-center gap-2 justify-end">
                                 {(userData?.role === 'super_admin' || userData?.role === 'admin' || log.collectedById === userData?.uid) && (
                                   <div className="flex items-center gap-0.5 mr-1">
                                     <Button 
                                       variant="ghost" 
                                       size="icon" 
                                       className="h-6 w-6 text-slate-400 hover:text-indigo-600 hover:bg-slate-100/50"
                                       onClick={() => {
                                         setEditingExpense(log);
                                         setEditInput({ amount: String(log.amount), note: log.note });
                                       }}
                                     >
                                       <Edit3 size={11} />
                                     </Button>
                                     <Button 
                                       variant="ghost" 
                                       size="icon" 
                                       className="h-6 w-6 text-slate-400 hover:text-rose-600 hover:bg-slate-100/50"
                                       onClick={() => handleDeleteExpense(log)}
                                     >
                                       <Trash2 size={11} />
                                     </Button>
                                   </div>
                                 )}
                                 <div>
                                   <span className={`text-[11px] font-black italic ${log.type === "inflow" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`}>
                                     {log.type === "inflow" ? "+" : "-"}{formatCurrency(log.amount)}
                                   </span>
                                   <span className="text-[9px] font-black text-slate-450 dark:text-slate-500 block text-right mt-0.5">
                                     Bal: {log.runningBalance >= 0 ? "+" : ""}{formatCurrency(log.runningBalance)}
                                   </span>
                                 </div>
                               </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
            
            <div className="mt-6 flex justify-end">
              <Button 
                onClick={() => setShowExpenseDetails(false)}
                className="bg-slate-900 text-white font-black text-[9px] uppercase tracking-widest px-6 rounded-xl h-10 shadow-xl"
              >
                Close Audit
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Duplicate Posting Alert Dialog */}
      <AlertDialog open={showDuplicateAlert} onOpenChange={setShowDuplicateAlert}>
        <AlertDialogContent className="border-rose-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center text-rose-600 gap-2">
              <AlertCircle className="h-6 w-6" />
              Duplicate Posting Detected!
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-600 font-medium pt-2">
              A payment has <strong className="text-slate-900">already been recorded</strong> on this date.<br/><br/>
              Are you sure you want to post <strong className="text-rose-600">another payment</strong> for the exact same day?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel className="font-bold">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-rose-600 hover:bg-rose-700 font-bold"
              onClick={() => {
                if (pendingDuplicateAction) {
                  pendingDuplicateAction();
                  setPendingDuplicateAction(null);
                }
              }}
            >
              Yes, Post Again
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Alert Dialog */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent className="border-rose-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center text-rose-600 gap-2">
              <AlertCircle className="h-6 w-6" />
              Bulk Delete (No Balance Change)
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-600 font-medium pt-2">
              Are you sure you want to permanently delete all <strong>{records.length}</strong> postings for <strong>{date}</strong>?<br/><br/>
              This will <strong className="text-rose-600">ONLY remove the logs</strong> and WILL NOT reverse or affect the current account balances or total profit calculations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel disabled={isBulkDeleting} className="font-bold">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-rose-600 hover:bg-rose-700 font-bold"
              disabled={isBulkDeleting}
              onClick={() => {
                handleBulkDelete();
              }}
            >
              {isBulkDeleting ? "Deleting..." : "Yes, Delete Only Logs"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </motion.div>
  );
};

export default DailyCollection;
