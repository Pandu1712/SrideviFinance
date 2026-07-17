import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLine } from "@/contexts/LineContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, getDoc, query, where, doc, updateDoc, DocumentData, runTransaction, orderBy, onSnapshot } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Search, FileText, CheckCircle2, Wallet, Calendar, CreditCard, ArrowRight, User, IndianRupee, Users, Filter, Zap, Printer, Phone, MapPin, AlertCircle, Edit, Settings, Eye, EyeOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatCurrency, formatDate, cn, playSuccessSound, checkPermission } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { logActivity } from "@/lib/audit";
import DailyReconciliation from "@/components/DailyReconciliation";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
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

const cleanAccountNo = (accNo: string) => {
  if (!accNo) return "";
  return accNo.split("_deleted")[0];
};

const DailyPosting = () => {
  const { userData } = useAuth();
  const { selectedLineId } = useLine();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [accountInfo, setAccountInfo] = useState<DocumentData | null>(null);
  const [assignedMembers, setAssignedMembers] = useState<DocumentData[]>([]);
  const [fetchingMembers, setFetchingMembers] = useState(false);
  const [villageFilter, setVillageFilter] = useState("all");
  const [timelineFilter, setTimelineFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [modalSearchQuery, setModalSearchQuery] = useState("");
  
  const toggleAccountUnhide = async (accountId: string, newUnhidden: boolean) => {
    try {
      await updateDoc(doc(db, "accounts", accountId), { unhidden: newUnhidden });
      setAssignedMembers(prev => prev.map(m => m.id === accountId ? { ...m, unhidden: newUnhidden } : m));
      toast.success(newUnhidden ? "Account is now visible in Posting" : "Account is now hidden from Posting");
    } catch (err: any) {
      toast.error("Failed to update visibility: " + err.message);
    }
  };

  const [availableVillages, setAvailableVillages] = useState<string[]>([]);
  const [todayPostings, setTodayPostings] = useState<Set<string>>(new Set());
  const [mobileView, setMobileView] = useState<"list" | "form">("list");
  const [form, setForm] = useState({ 
    accountNo: "", 
    date: new Date().toISOString().split("T")[0], 
    amount: "", 
    status: "collection", 
    payMode: "cash",
    penaltyAmount: "",
    note: ""
  });
  const [showDuplicateAlert, setShowDuplicateAlert] = useState(false);
  const [lastPostedAmount, setLastPostedAmount] = useState<number | null>(null);

  // Fetch accounts in line
  useEffect(() => {
    const loadAssignedMembers = async () => {
      if (!userData) return;
      setFetchingMembers(true);
      try {
        let q;
        if (selectedLineId) {
          q = query(collection(db, "accounts"), where("lineId", "==", selectedLineId));
        } else {
          setAssignedMembers([]);
          setFetchingMembers(false);
          return;
        }
        const snap = await getDocs(q);
        const membersList = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
        membersList.sort((a: any, b: any) => {
          const numA = parseInt(a.accountNo, 10);
          const numB = parseInt(b.accountNo, 10);
          if (!isNaN(numA) && !isNaN(numB)) {
            return numA - numB;
          }
          return (a.accountNo || "").localeCompare(b.accountNo || "");
        });
        setAssignedMembers(membersList);
      } catch (err) {
        console.error("Load members error:", err);
      } finally {
        setFetchingMembers(false);
      }
    };
    loadAssignedMembers();
  }, [userData, selectedLineId]);

  // Fetch available villages for the selected line
  useEffect(() => {
    const fetchLineVillages = async () => {
      if (!selectedLineId) {
        setAvailableVillages([]);
        return;
      }
      try {
        const q = query(collection(db, "villages"), where("lineId", "==", selectedLineId));
        const snap = await getDocs(q);
        const vils = snap.docs.map(d => d.data().name).sort();
        setAvailableVillages(vils);
      } catch (err) {
        console.error("Fetch villages error:", err);
      }
    };
    fetchLineVillages();
  }, [selectedLineId]);

  // Fetch today's postings to highlight paid accounts
  useEffect(() => {
    if (!selectedLineId || !form.date) return;
    
    const q = query(
      collection(db, "postings"), 
      where("date", "==", form.date)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const postedIds = new Set(
        snap.docs
          .filter(d => d.data().lineId === selectedLineId)
          .map(d => d.data().accountId)
      );
      setTodayPostings(postedIds);
    }, (err) => {
      console.error("Load today postings error:", err);
    });

    return () => unsubscribe();
  }, [selectedLineId, form.date]);

  const selectMember = (member: DocumentData) => {
    setAccountInfo(member);
    setForm(prev => ({ ...prev, accountNo: member.accountNo, amount: String(member.installmentAmount || "") }));
    
    if (todayPostings.has(member.id)) {
      toast.error(`ALERT: A payment has already been recorded for ${member.name} today!`, { duration: 5000, icon: '🚨' });
    } else {
      toast.info(`Selected: ${member.name}`);
    }
    
    // Switch view on mobile to form
    if (window.innerWidth < 1024) {
      setMobileView("form");
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };


  const handleChange = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  const profileRef = useRef<HTMLDivElement>(null);

  const fetchAccount = async () => {
    if (!form.accountNo) {
      toast.error("Please enter an account number");
      return;
    }
    setSearching(true);
    try {
      let q;
      // Role-based account access
      if (selectedLineId) {
        q = query(collection(db, "accounts"), where("accountNo", "==", form.accountNo), where("lineId", "==", selectedLineId));
      } else {
        toast.error("Please select a line first from the sidebar");
        setSearching(false);
        return;
      }
      
      const snap = await getDocs(q);
      if (snap.empty) {
        toast.error("Account not found or access denied");
        setAccountInfo(null);
        return;
      }
      const d = snap.docs[0];
      const accountData = { id: d.id, ...(d.data() as any) };
      if (accountData.status === "deleted") {
        toast.error("Account not found or access denied");
        setAccountInfo(null);
        return;
      }
      setAccountInfo(accountData);
      setForm(prev => ({ ...prev, amount: String(accountData.installmentAmount || "") }));
      
      if (todayPostings.has(accountData.id)) {
        toast.error(`ALERT: A payment has already been recorded for ${accountData.name} today!`, { duration: 5000, icon: '🚨' });
      } else {
        toast.success("Account loaded successfully");
      }
      
      // Scroll to top on mobile
      if (window.innerWidth < 1024) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (err) {
      console.error(err);
      toast.error("Error fetching account database");
    } finally {
      setSearching(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkPermission(userData, "canPostPayment")) {
      toast.error("You do not have permission to post collections.");
      return;
    }
    if (!accountInfo || (!form.amount && !form.penaltyAmount)) {
      toast.error("Please select an account and enter an amount");
      return;
    }
    
    setLoading(true);
    try {
      if (accountInfo.balance <= 0) {
        const proceed = window.confirm(`This account (${accountInfo.accountNo}) is fully paid. Do you still want to enter this posting?`);
        if (!proceed) {
          setLoading(false);
          return;
        }
      }

      const postingAmount = parseFloat(form.amount) || 0;
      const penaltyAmount = parseFloat(form.penaltyAmount) || 0;
      const totalCollection = postingAmount + penaltyAmount;

      if (totalCollection <= 0) {
        toast.error("Total amount must be greater than 0");
        setLoading(false);
        return;
      }

      // FORCED DUPLICATE CHECK: Verify if this account already has a posting today
      const todayDateStr = form.date;
      
      // 1. Query the postings collection directly
      const duplicateQuery = query(
        collection(db, "postings"),
        where("accountId", "==", accountInfo.id),
        where("date", "==", todayDateStr)
      );
      const duplicateSnap = await getDocs(duplicateQuery);
      
      // 2. Fetch fresh account data to check the lastPostingDate flag
      const freshAccDoc = await getDoc(doc(db, "accounts", accountInfo.id));
      const freshAccData = freshAccDoc.exists() ? freshAccDoc.data() : null;
      
      const serverLastPostingDate = freshAccData?.lastPostingDate;
      const localLastPostingDate = accountInfo.lastPostingDate;
      
      const hasPostingToday = !duplicateSnap.empty || 
                              serverLastPostingDate === todayDateStr || 
                              localLastPostingDate === todayDateStr;

      if (hasPostingToday) {
        setShowDuplicateAlert(true);
        setLoading(false);
        return;
      }

      await executePosting(totalCollection, postingAmount, penaltyAmount);
    } catch (err: any) {
      toast.error(err.message || "Failed");
      setLoading(false);
    }
  };

  const executePosting = async (totalCollection: number, postingAmount: number, penaltyAmount: number) => {
    setLoading(true);
    try {
      const accountRef = doc(db, "accounts", accountInfo!.id);

      await runTransaction(db, async (transaction) => {
        const accDoc = await transaction.get(accountRef);
        if (!accDoc.exists()) throw new Error("Account does not exist!");

        const accData = accDoc.data();
        const isVerified = userData?.role !== 'agent';
        
        const postingRef = doc(collection(db, "postings"));
        transaction.set(postingRef, {
          accountId: accountInfo.id,
          accountNo: form.accountNo,
          date: form.date,
          amount: postingAmount,
          penaltyAmount: penaltyAmount,
          status: form.status,
          payMode: form.payMode,
          note: (form.payMode === 'bank' || form.payMode === 'upi') ? (form.note || "") : "",
          lineId: accountInfo.lineId,
          adminId: accountInfo.adminId || "",
          memberName: accountInfo.name,
          nameTelugu: accountInfo.nameTelugu || "",
          collectedByRole: userData?.role,
          collectedById: userData?.uid,
          collectedByName: userData?.name,
          verified: isVerified,
          createdAt: new Date().toISOString(),
        });

        if (isVerified) {
          const newPaid = (accData.paid || 0) + postingAmount;
          const newBalance = (accData.totalAmount || 0) - newPaid;
          const newStatus = newBalance <= 0 ? "completed" : "active";

          transaction.update(accountRef, {
            paid: newPaid,
            balance: Math.max(0, newBalance),
            status: newStatus,
            unhidden: newStatus === 'completed' ? false : (accData.unhidden || false),
            lastPostingDate: form.date,
            lastCollectedByName: userData?.name,
            lastCollectedByRole: userData?.role
          });
        }
      });

      setLastPostedAmount(totalCollection);

      if (userData) {
        logActivity(
          userData.uid,
          userData.name,
          userData.role,
          "POSTING_CREATE",
          `Submitted ${formatCurrency(totalCollection)} ${penaltyAmount > 0 ? `(Inc. ${formatCurrency(penaltyAmount)} Penalty)` : ''} from ${accountInfo.name} (#${accountInfo.accountNo}) ${userData.role === 'agent' ? '(Pending Approval)' : ''}`
        );
      }

      playSuccessSound();
      if (userData?.role === 'agent') {
        toast.success("Collection submitted! Awaiting admin approval.");
      } else {
        toast.success("Posted and finalized successfully");
      }

      setAccountInfo(prev => {
        if (!prev) return null;
        const addAmount = userData?.role !== 'agent' ? postingAmount : 0;
        const newPaid = (prev.paid || 0) + addAmount;
        const newBalance = Math.max(0, (prev.totalAmount || 0) - newPaid);
        const newStatus = newBalance <= 0 ? "completed" : prev.status;
        return { 
          ...prev, 
          lastPostingDate: form.date,
          paid: newPaid, 
          balance: newBalance,
          status: newStatus,
          unhidden: newStatus === 'completed' ? false : (prev.unhidden || false)
        };
      });

      if (userData?.role !== 'agent') {
        setAssignedMembers(prev => prev.map(m => {
          if (m.id === accountInfo.id) {
            const newPaid = (m.paid || 0) + postingAmount;
            const newBalance = Math.max(0, (m.totalAmount || 0) - newPaid);
            const newStatus = newBalance <= 0 ? "completed" : m.status;
            return {
              ...m,
              paid: newPaid,
              balance: newBalance,
              status: newStatus,
              unhidden: newStatus === 'completed' ? false : (m.unhidden || false),
              lastPostingDate: form.date
            };
          }
          return m;
        }));
      }

      setForm(prev => ({ 
        ...prev, 
        amount: "", 
        penaltyAmount: "" 
      }));
      
      setTodayPostings(prev => new Set([...Array.from(prev), accountInfo.id]));

    } catch (err: any) {
      toast.error(err.message || "Failed");
    } finally {
      setLoading(false);
    }
  };

  const handleExportReceipt = () => {
    if (!accountInfo || !lastPostedAmount) {
      toast.error("No recent transaction found");
      return;
    }

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: [100, 150]
    });

    const pageWidth = doc.internal.pageSize.getWidth();

    // Header
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageWidth, 25, 'F');
    
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.text("SRI DEVI FINANCE", pageWidth / 2, 12, { align: "center" });
    
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text("OFFICIAL PAYMENT RECEIPT", pageWidth / 2, 18, { align: "center" });

    // Body
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(8);
    doc.text(`Receipt No: #${Math.floor(1000 + Math.random() * 9000)}`, 10, 35);
    doc.text(`Date: ${formatDate(form.date)}`, pageWidth - 10, 35, { align: "right" });

    doc.setDrawColor(241, 245, 249);
    doc.line(10, 38, pageWidth - 10, 38);

    doc.setFont("helvetica", "bold");
    doc.text("MEMBER DETAILS", 10, 45);
    doc.setFont("helvetica", "normal");
    doc.text(`Name: ${accountInfo.name.toUpperCase()}`, 10, 50);
    doc.text(`Account: ${accountInfo.accountNo}`, 10, 54);
    doc.text(`Village: ${accountInfo.village || 'N/A'}`, 10, 58);

    // Amount Section
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(10, 65, pageWidth - 20, 20, 2, 2, 'F');
    
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text("AMOUNT COLLECTED", pageWidth / 2, 72, { align: "center" });
    
    doc.setFontSize(16);
    doc.setTextColor(5, 150, 105);
    doc.text(formatCurrency(lastPostedAmount), pageWidth / 2, 80, { align: "center" });

    // Summary Table
    autoTable(doc, {
      body: [
        ["TOTAL LOAN", formatCurrency(accountInfo.totalAmount)],
        ["PREVIOUS PAID", formatCurrency(accountInfo.paid - (userData?.role === 'agent' ? 0 : lastPostedAmount))],
        ["CURRENT BALANCE", formatCurrency(accountInfo.balance)]
      ],
      startY: 90,
      theme: 'plain',
      styles: { fontSize: 7, cellPadding: 2 },
      columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 15;
    
    doc.setFontSize(7);
    doc.setTextColor(15, 23, 42);
    doc.text("AUTHORISED SIGNATORY", pageWidth - 10, finalY, { align: "right" });
    
    doc.setFontSize(6);
    doc.setTextColor(148, 163, 184);
    doc.text("Thank you for your prompt payment.", pageWidth / 2, 140, { align: "center" });
    doc.text("This is an electronically generated receipt.", pageWidth / 2, 144, { align: "center" });

    doc.save(`Receipt_${accountInfo.accountNo}.pdf`);
    toast.success("Professional Receipt Downloaded");
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 pb-20 lg:pb-0"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-premium-gradient flex items-center justify-center shadow-lg transform rotate-3">
            <Zap className="text-white h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-primary">Operative Terminal</h1>
            <p className="text-muted-foreground font-medium uppercase text-[10px] tracking-widest flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Live Collection Gateway
            </p>
          </div>
        </div>

        {/* Mobile View Toggle */}
        <div className="flex lg:hidden bg-slate-100 p-1 rounded-xl w-full sm:w-auto">
          <button 
            onClick={() => setMobileView("list")}
            className={cn(
              "flex-1 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
              mobileView === "list" ? "bg-white text-primary shadow-sm" : "text-slate-400"
            )}
          >
            Member Portfolio
          </button>
          <button 
            onClick={() => setMobileView("form")}
            className={cn(
              "flex-1 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
              mobileView === "form" ? "bg-white text-primary shadow-sm" : "text-slate-400"
            )}
          >
            Entry Portal
          </button>
        </div>
      </div>


      <div className="grid grid-cols-1 lg:grid-cols-7 gap-6">
        <AnimatePresence mode="wait">
          <>
            {/* Entry Portal - Conditional on Mobile */}
            <motion.div
              key="posting-form"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className={cn(
                "lg:col-span-4 space-y-6",
                mobileView === "list" ? "hidden lg:block" : "block"
              )}
            >
                <Card className="glass-card border-none shadow-2xl overflow-hidden">
                  <CardHeader className="bg-slate-900 text-white py-4">
                    <CardTitle className="text-sm font-black flex items-center gap-2 uppercase tracking-[0.2em]">
                      <CreditCard className="h-4 w-4 text-accent" />
                      Entry Portal
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    <form onSubmit={handleSubmit} className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t("accountNo")}</Label>
                          <div className="relative">
                            <Input 
                              value={form.accountNo} 
                              onChange={e => handleChange("accountNo", e.target.value)} 
                              onBlur={() => fetchAccount()}
                              placeholder="ACC-000" 
                              className="h-11 pl-4 pr-12 text-lg font-black finance-input" 
                            />
                            <Button 
                              type="button"
                              size="icon" 
                              onClick={() => fetchAccount()}
                              className="absolute right-1 top-1 h-9 w-9 bg-primary text-primary-foreground rounded-lg"
                            >
                              <Search size={16} />
                            </Button>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t("date")}</Label>
                          <div className="relative group">
                            <Calendar className="absolute left-3 top-3 h-4 w-4 text-slate-400 group-hover:text-primary transition-colors z-10" />
                            <Input 
                              type="date" 
                              value={form.date} 
                              onChange={e => handleChange("date", e.target.value)} 
                              className="absolute inset-0 opacity-0 cursor-pointer z-20"
                              disabled={!checkPermission(userData, 'canChangeDate')}
                            />
                            <div className="pl-9 h-11 finance-input flex items-center text-[11px] font-black text-slate-700 bg-white border border-slate-200 rounded-xl">
                              {(() => {
                                const [y, m, d] = form.date.split('-');
                                return `${d}/${m}/${y}`;
                              })()}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t("amount")} (₹)</Label>
                          <Input 
                            type="text" 
                            inputMode="decimal"
                            value={form.amount} 
                            onChange={e => handleChange("amount", e.target.value)} 
                            placeholder="0.00" 
                            className="h-11 text-lg font-black finance-input border-accent/20 focus:border-accent" 
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Category</Label>
                          <Select value={form.status} onValueChange={v => handleChange("status", v)}>
                            <SelectTrigger className="h-11 finance-input font-bold"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="collection">Standard Collection</SelectItem>
                              <SelectItem value="penalty">Fine / Penalty</SelectItem>
                              <SelectItem value="other">Other Fees</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {form.status === 'penalty' && (
                        <motion.div 
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="space-y-1.5 bg-rose-50 p-4 rounded-xl border border-rose-100"
                        >
                          <Label className="text-[10px] font-black uppercase tracking-widest text-rose-500">Extra Penalty Amount (₹)</Label>
                          <Input 
                            type="text" 
                            inputMode="decimal"
                            value={form.penaltyAmount} 
                            onChange={e => handleChange("penaltyAmount", e.target.value)} 
                            placeholder="Enter penalty..." 
                            className="h-11 text-lg font-black bg-white border-rose-200 focus:border-rose-500 focus:ring-rose-200" 
                          />
                          <p className="text-[9px] font-bold text-rose-400 italic">Note: This amount is recorded as an additional fee.</p>
                        </motion.div>
                      )}

                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Payment Mode</Label>
                        <Select value={form.payMode} onValueChange={v => handleChange("payMode", v)}>
                          <SelectTrigger className="h-11 finance-input font-bold"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cash">Cash</SelectItem>
                            <SelectItem value="bank">Bank</SelectItem>
                            <SelectItem value="upi">UPI</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {(form.payMode === 'bank' || form.payMode === 'upi') && (
                        <motion.div 
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="space-y-1.5"
                        >
                          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t("note")} / Reference (Optional)</Label>
                          <Input 
                            type="text" 
                            value={form.note} 
                            onChange={e => handleChange("note", e.target.value)} 
                            placeholder="Enter transaction ref, bank name or note..." 
                            className="h-11 bg-white border-slate-200 focus-visible:ring-accent font-medium text-slate-900" 
                          />
                        </motion.div>
                      )}

                      <Button 
                        type="submit" 
                        className="w-full h-16 md:h-14 bg-primary text-primary-foreground font-black uppercase tracking-widest shadow-2xl hover:opacity-90 transition-all active-scale" 
                        disabled={loading || !accountInfo}
                      >
                        {loading ? t("loading") : t("submit")}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Portfolio - Conditional on Mobile */}
              <motion.div
                key="portfolio"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className={cn(
                  "lg:col-span-3",
                  mobileView === "form" ? "hidden lg:block" : "block"
                )}
              >
                <Card className="glass-card h-[calc(100vh-250px)] overflow-hidden flex flex-col border-none shadow-2xl transition-all">
                  <CardHeader className="border-b border-border/40 bg-slate-50/50 dark:bg-slate-900/20 py-4 flex flex-col gap-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <CardTitle className="text-sm font-black flex items-center gap-2 text-primary uppercase tracking-[0.2em]">
                        <Users className="h-4 w-4 text-accent" />
                        Portfolio
                      </CardTitle>
                      <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
                        <Select value={timelineFilter} onValueChange={setTimelineFilter}>
                          <SelectTrigger className="h-8 w-20 sm:w-24 text-[10px] font-black uppercase tracking-widest border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm">
                            <SelectValue placeholder="Freq" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Freq</SelectItem>
                            <SelectItem value="daily">Daily Only</SelectItem>
                            <SelectItem value="weekly">Weekly Only</SelectItem>
                            <SelectItem value="monthly">Monthly Only</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select value={villageFilter} onValueChange={setVillageFilter}>
                          <SelectTrigger className="h-8 w-24 sm:w-28 text-[10px] font-black uppercase tracking-widest border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm">
                            <SelectValue placeholder="Village" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Villages</SelectItem>
                            {availableVillages.map(v => (
                              <SelectItem key={v} value={v}>{v}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setModalSearchQuery("");
                            setShowSettingsModal(true);
                          }}
                          className="h-8 w-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-300 hover:text-slate-600 dark:hover:text-white shadow-sm transition-all shrink-0"
                          title="Manage Hidden Completed Accounts"
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                      <Input
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search subscriber by Name, ID..."
                        className="pl-8.5 h-8.5 text-xs border-slate-200/60 rounded-xl focus-visible:ring-accent w-full"
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="p-0 flex-1 overflow-hidden">
                    <ScrollArea className="h-full">
                      <div className="p-3 space-y-2">
                        {fetchingMembers ? (
                          <div className="p-5 text-center text-xs text-muted-foreground animate-pulse">Syncing members...</div>
                        ) : assignedMembers
                            .filter(m => {
                              const matchesVillage = villageFilter === 'all' || m.village === villageFilter;
                              const matchesFreq = timelineFilter === 'all' || m.paymentFrequency === timelineFilter;
                              const matchesSearch = !searchQuery || 
                                m.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                m.accountNo?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                (m.nameTelugu && m.nameTelugu.toLowerCase().includes(searchQuery.toLowerCase()));
                              
                              const isCompleted = m.status === 'completed' || Number(m.balance) <= 0;
                              // Automatically hide completed accounts unless explicitly unhidden
                              const matchesCompletion = !isCompleted || m.unhidden === true;
                              
                              return matchesVillage && matchesFreq && matchesSearch && matchesCompletion;
                            })
                            .map((m) => (
                          <div 
                            key={m.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => selectMember(m)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                selectMember(m);
                              }
                            }}
                            className={cn(
                              "w-full text-left p-3 rounded-2xl border border-transparent transition-all group cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent/50",
                              accountInfo?.id === m.id 
                                ? "bg-accent text-accent-foreground shadow-lg shadow-accent/20" 
                                : (m.status === 'completed' || m.balance <= 0)
                                  ? "bg-rose-50 border-rose-100 opacity-80"
                                  : todayPostings.has(m.id)
                                    ? "bg-emerald-50 border-emerald-100" 
                                    : "hover:bg-slate-50 hover:border-slate-100"
                            )}
                          >
                             <div className="flex items-center justify-between gap-2 w-full">
                               <div className="flex items-center gap-3 min-w-0">
                                 <div className={cn(
                                   "h-10 w-10 shrink-0 rounded-xl flex items-center justify-center text-[11px] font-black transition-all shadow-sm",
                                   accountInfo?.id === m.id ? "bg-white text-accent" : 
                                   (m.status === 'completed' || m.balance <= 0) ? "bg-rose-500 text-white" :
                                   todayPostings.has(m.id) ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-600 group-hover:bg-white"
                                 )}>
                                   {m.accountNo}
                                 </div>
                                 <div className="min-w-0">
                                   <p className={cn("text-[13px] sm:text-[14px] font-black truncate uppercase tracking-tighter", accountInfo?.id === m.id ? "text-white" : (m.status === 'completed' || m.balance <= 0) ? "text-rose-700 line-through decoration-rose-300" : todayPostings.has(m.id) ? "text-emerald-700" : "text-primary")}>
                                     {m.name}
                                   </p>
                                   <div className="flex items-center gap-1.5 mt-0.5 overflow-hidden">
                                     {m.nameTelugu && (
                                       <span className={cn("text-[9px] sm:text-[10px] font-black truncate", accountInfo?.id === m.id ? "text-white/90" : "text-slate-600")}>
                                         {m.nameTelugu}
                                       </span>
                                     )}
                                     <span className={cn("text-[8px] sm:text-[9px] font-bold opacity-60 shrink-0", accountInfo?.id === m.id ? "text-white" : "text-slate-400")}>
                                       #{m.accountNo}
                                     </span>
                                     {m.village && (
                                       <span className={cn("text-[8px] sm:text-[9px] font-bold opacity-40 uppercase truncate", accountInfo?.id === m.id ? "text-white" : "text-slate-400")}>
                                         • {m.village}
                                       </span>
                                     )}
                                   </div>
                                 </div>
                               </div>
                               <div className="flex items-center gap-2 shrink-0 ml-auto transition-all">
                                  {m.phone && (
                                    <a 
                                      href={`tel:${m.phone}`} 
                                      onClick={e => e.stopPropagation()} 
                                      className={cn(
                                        "h-10 w-10 rounded-xl flex items-center justify-center transition-all shadow-sm border",
                                        accountInfo?.id === m.id 
                                          ? "bg-white/20 text-white border-white/30" 
                                          : "bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-500 hover:text-white active-scale"
                                      )}
                                      title="Call Member"
                                    >
                                      <Phone size={16} />
                                    </a>
                                  )}
                                  {(m.customerLocation || m.village) && (
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const loc = m.customerLocation;
                                        const query = loc || m.village;
                                        if (loc && loc.startsWith('http')) {
                                           window.open(loc, '_blank');
                                        } else {
                                           window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, '_blank');
                                        }
                                      }}
                                      className={cn(
                                        "h-10 w-10 rounded-xl flex items-center justify-center transition-all shadow-sm border",
                                        accountInfo?.id === m.id 
                                          ? "bg-white/20 text-white border-white/30" 
                                          : "bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-500 hover:text-white active-scale"
                                      )}
                                      title="Get Directions"
                                    >
                                      <MapPin size={16} />
                                    </button>
                                  )}
                                  {(m.status === 'completed' || Number(m.balance) <= 0) && (
                                    <button 
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        await toggleAccountUnhide(m.id, false);
                                      }}
                                      className={cn(
                                        "h-10 w-10 rounded-xl flex items-center justify-center transition-all shadow-sm border",
                                        accountInfo?.id === m.id 
                                          ? "bg-white/20 text-white border-white/30" 
                                          : "bg-rose-50 text-rose-600 border-rose-100 hover:bg-rose-500 hover:text-white active-scale"
                                      )}
                                      title="Hide Account"
                                    >
                                      <EyeOff size={16} />
                                    </button>
                                  )}
                                  <ArrowRight size={14} className={cn("ml-1", accountInfo?.id === m.id ? "text-white" : "text-slate-300")} />
                               </div>
                             </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </motion.div>
            </>
        </AnimatePresence>

        <div className="lg:col-span-3" ref={profileRef}>
          <AnimatePresence mode="wait">
            {accountInfo ? (
              <motion.div
                key="account-info"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <Card className="glass-card overflow-hidden">
                  <CardHeader className="border-b border-primary/10 bg-accent/5 flex flex-row items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2 text-primary">
                      <FileText className="h-5 w-5 text-accent" />
                      Verified Account Profile
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      {checkPermission(userData, "canEditAccount") && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-lg hover:bg-slate-100 hover:text-primary text-slate-400"
                          onClick={() => navigate(`/accounts/edit/${accountInfo.id}`)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      )}
                      <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${accountInfo.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {accountInfo.status}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="grid grid-cols-2 divide-x divide-primary/10">
                      <div className="p-6 space-y-5">
                        <div className="space-y-1">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Subscriber Name</p>
                          <p className="text-xl font-black text-primary leading-tight">
                            {accountInfo.name}
                            {accountInfo.nameTelugu && (
                              <span className="block text-xs font-bold text-accent mt-1 italic">{accountInfo.nameTelugu}</span>
                            )}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Village / Area</p>
                          <p className="text-sm font-semibold text-slate-600">{accountInfo.village || 'Not specified'}</p>
                        </div>
                        <div className="pt-4 border-t border-primary/5">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Total Amount to Pay</p>
                          <p className="text-3xl font-black text-[#0F172A] tracking-tighter">{formatCurrency(accountInfo.totalAmount)}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4 pt-2">
                          <div className="space-y-1">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Inst. Amt</p>
                            <p className="text-sm font-black text-accent">{formatCurrency(accountInfo.installmentAmount)}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Plan</p>
                            <p className="text-[10px] font-black uppercase text-slate-400">{accountInfo.paymentFrequency}</p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="p-6 bg-slate-50/50 space-y-6">
                        <div className="space-y-5">
                          <div className="bg-white p-4 rounded-2xl shadow-sm border border-primary/5 space-y-4">
                            <div className="flex justify-between items-center">
                              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Total Paid</p>
                              <p className="text-lg font-black text-emerald-600">{formatCurrency(accountInfo.paid)}</p>
                            </div>
                            <div className="pt-3 border-t border-slate-50 flex justify-between items-center">
                              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Outstanding</p>
                              <p className="text-2xl font-black text-rose-600 tracking-tighter">{formatCurrency(accountInfo.balance)}</p>
                            </div>
                          </div>
                          
                          <div className="space-y-2 bg-white/50 p-3 rounded-xl border border-dashed border-slate-200">
                            <p className="text-[7px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">Last Payment Activity</p>
                        <div className="flex items-center gap-3">
                           <div className="h-8 w-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-500"><Calendar size={14} /></div>
                           <div>
                              <p className="text-sm font-black text-slate-800 leading-none">{accountInfo.lastPostingDate ? formatDate(accountInfo.lastPostingDate) : "Initial Entry"}</p>
                              {accountInfo.lastCollectedByName && (
                                <p className="text-[8px] font-bold text-slate-400 uppercase mt-1">
                                  By {accountInfo.lastCollectedByName} ({accountInfo.lastCollectedByRole === 'super_admin' ? 'Admin' : 'Agent'})
                                </p>
                              )}
                           </div>
                        </div>
                          </div>
                          
                          <div className="space-y-2 pt-2">
                            <div className="h-2.5 w-full bg-slate-200 rounded-full overflow-hidden">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min(100, ((accountInfo.totalAmount - accountInfo.balance) / (accountInfo.totalAmount || 1)) * 100)}%` }}
                                className="h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]"
                              />
                            </div>
                            <p className="text-[10px] text-right text-muted-foreground font-black uppercase tracking-widest">
                              {Math.round(((accountInfo.totalAmount - accountInfo.balance) / (accountInfo.totalAmount || 1)) * 100)}% Recovered
                            </p>
                          </div>

                          {accountInfo.customerLocation && (
                            <div className="pt-2">
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="w-full h-10 border-accent/30 text-accent font-black text-[10px] uppercase tracking-widest gap-2 bg-accent/5 hover:bg-accent hover:text-white transition-all"
                                onClick={() => {
                                  const url = accountInfo.customerLocation;
                                  if (url.startsWith('http')) {
                                    window.open(url, '_blank');
                                  } else {
                                    toast.info("Location: " + url);
                                  }
                                }}
                              >
                                <Zap className="h-3 w-3" />
                                Get Directions
                              </Button>
                            </div>
                          )}
                        </div>

                        <div className="pt-2 border-t border-primary/10 flex items-center justify-between text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            <span>{accountInfo.accountNo}</span>
                          </div>
                          <span>Est. {formatDate(accountInfo.startDate)}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ) : (
              <motion.div
                key="no-account"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="h-full flex flex-col items-center justify-center p-12 border-2 border-dashed border-primary/10 rounded-xl bg-primary/5 text-center space-y-4"
              >
                <div className="h-20 w-20 rounded-full bg-white flex items-center justify-center shadow-inner">
                  <Search className="h-10 w-10 text-primary/20" />
                </div>
                <div className="max-w-xs">
                  <h3 className="text-lg font-bold text-primary">No Account Selected</h3>
                  <p className="text-sm text-muted-foreground">Enter an account number and click search to view profile and post payments.</p>
                </div>
                <ArrowRight className="h-6 w-6 text-primary/20 animate-bounce" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="pt-10 border-t border-slate-100 mt-10">
        <DailyReconciliation targetDate={form.date} />
      </div>

      {/* Duplicate Posting Alert Dialog */}
      <AlertDialog open={showDuplicateAlert} onOpenChange={setShowDuplicateAlert}>
        <AlertDialogContent className="border-rose-200">
          <AlertDialogHeader>
            <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 mb-2">
              <Calendar size={24} />
            </div>
            <AlertDialogTitle className="text-xl font-black">Duplicate Posting Detected</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-600 font-medium">
              A collection has already been recorded for <strong>{accountInfo?.name}</strong> on this date ({formatDate(form.date)}).
              <br /><br />
              Are you sure you want to add another posting for the same day?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-3">
            <AlertDialogCancel className="rounded-xl border-slate-200 font-bold">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                const p = parseFloat(form.amount) || 0;
                const pen = parseFloat(form.penaltyAmount) || 0;
                executePosting(p + pen, p, pen);
              }}
              className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold border-none"
            >
              Yes, Post Again
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Hidden Completed Accounts Settings Modal */}
      <AnimatePresence>
        {showSettingsModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl flex flex-col max-h-[85vh] border border-slate-100"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                    <Settings className="h-5 w-5 text-accent" />
                    Hidden Portfolio
                  </h3>
                  <p className="text-xs text-slate-400 font-medium mt-1">Unhide accounts to show them in posting list.</p>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setShowSettingsModal(false)}
                  className="h-8 w-8 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                >
                  <EyeOff className="h-4 w-4" />
                </Button>
              </div>

              <div className="relative mb-4">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <Input
                  value={modalSearchQuery}
                  onChange={e => setModalSearchQuery(e.target.value)}
                  placeholder="Search completed accounts..."
                  className="pl-8.5 h-9 text-xs border-slate-200/60 rounded-xl focus-visible:ring-accent w-full"
                />
              </div>

              <div className="flex-1 overflow-y-auto min-h-0 space-y-2 pr-1 custom-scrollbar">
                {assignedMembers
                  .filter(m => (m.status === 'completed' || Number(m.balance) <= 0) && !m.unhidden)
                  .filter(m => {
                    if (!modalSearchQuery) return true;
                    return m.name?.toLowerCase().includes(modalSearchQuery.toLowerCase()) ||
                      m.accountNo?.toLowerCase().includes(modalSearchQuery.toLowerCase()) ||
                      (m.nameTelugu && m.nameTelugu.toLowerCase().includes(modalSearchQuery.toLowerCase()));
                  })
                  .length === 0 ? (
                    <div className="text-center py-10 text-slate-400 italic text-xs">
                      No matching hidden accounts.
                    </div>
                  ) : (
                    assignedMembers
                      .filter(m => (m.status === 'completed' || Number(m.balance) <= 0) && !m.unhidden)
                      .filter(m => {
                        if (!modalSearchQuery) return true;
                        return m.name?.toLowerCase().includes(modalSearchQuery.toLowerCase()) ||
                          m.accountNo?.toLowerCase().includes(modalSearchQuery.toLowerCase()) ||
                          (m.nameTelugu && m.nameTelugu.toLowerCase().includes(modalSearchQuery.toLowerCase()));
                      })
                      .map(m => (
                        <div key={m.id} className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between gap-3 hover:bg-slate-100/50 transition-colors">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="h-9 w-9 shrink-0 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center text-[10px] font-black">
                              {cleanAccountNo(m.accountNo)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-black text-slate-800 truncate uppercase">{m.name}</p>
                              <p className="text-[9px] font-bold text-slate-400 truncate mt-0.5">{m.village || 'N/A'}</p>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => toggleAccountUnhide(m.id, true)}
                            className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl font-bold text-[10px] uppercase tracking-wide gap-1 shrink-0 h-8 px-3"
                          >
                            <Eye className="h-3 w-3" /> Unhide
                          </Button>
                        </div>
                      ))
                  )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
                <Button 
                  onClick={() => setShowSettingsModal(false)}
                  className="bg-slate-900 text-white hover:bg-slate-800 rounded-xl font-bold text-xs px-5 h-9"
                >
                  Close
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default DailyPosting;
