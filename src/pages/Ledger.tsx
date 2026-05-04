import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLine } from "@/contexts/LineContext";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, DocumentData, orderBy, doc, runTransaction } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Search, User, Filter, Download, FileText, ArrowUpDown, Trash2, CreditCard, Image as ImageIcon, File, FileSpreadsheet, Edit, IndianRupee, Calendar, ArrowRightLeft, MoveRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { exportToExcel } from "@/lib/excel";

import { useSearchParams } from "react-router-dom";

const Ledger = () => {
  const { userData, loading: authLoading } = useAuth();
  const { selectedLineId } = useLine();
  const [searchParams] = useSearchParams();
  const [accountNo, setAccountNo] = useState(searchParams.get("acc") || "");
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [accountInfo, setAccountInfo] = useState<DocumentData | null>(null);
  const [postings, setPostings] = useState<DocumentData[]>([]);
  const [totalPenalty, setTotalPenalty] = useState(0);
  const [totalExtra, setTotalExtra] = useState(0);
  const [loading, setLoading] = useState(false);

  // Edit Posting States
  const [editPostingOpen, setEditPostingOpen] = useState(false);
  const [selectedEditPosting, setSelectedEditPosting] = useState<any>(null);
  const [editPostDate, setEditPostDate] = useState("");
  const [editPostAmount, setEditPostAmount] = useState("");

  // Transfer Posting States
  const [transferPostingOpen, setTransferPostingOpen] = useState(false);
  const [selectedPostingForTransfer, setSelectedPostingForTransfer] = useState<any>(null);
  const [destAccountNo, setDestAccountNo] = useState("");

  // Fetch agents for mapping
  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const q = query(collection(db, "users"), where("role", "==", "agent"));
        const snap = await getDocs(q);
        setAgents(snap.docs.map(d => ({ id: d.id, name: d.data().name })));
      } catch (err) { console.error(err); }
    };
    fetchAgents();
  }, []);

  // Auto-search if param exists
  useEffect(() => {
    if (userData && accountNo) handleSearch();
  }, [userData]);

  const handleEditPosting = (posting: DocumentData) => {
    setSelectedEditPosting(posting);
    setEditPostDate(posting.date);
    setEditPostAmount(posting.amount.toString());
    setEditPostingOpen(true);
  };

  const handleTransferInit = (p: any) => {
    setSelectedPostingForTransfer(p);
    setDestAccountNo("");
    setTransferPostingOpen(true);
  };

  const saveTransferPosting = async () => {
    if (!selectedPostingForTransfer || !destAccountNo || !accountInfo) return;
    
    if (destAccountNo === accountInfo.accountNo) {
      toast.error("Source and Destination accounts are the same");
      return;
    }

    setLoading(true);
    try {
      const destQuery = query(collection(db, "accounts"), where("accountNo", "==", destAccountNo), where("lineId", "==", selectedLineId));
      const destSnap = await getDocs(destQuery);
      if (destSnap.empty) {
        toast.error("Destination account not found in this line");
        setLoading(false);
        return;
      }
      const destId = destSnap.docs[0].id;

      await runTransaction(db, async (transaction) => {
        const sourceAccRef = doc(db, "accounts", accountInfo.id);
        const destAccRef = doc(db, "accounts", destId);
        const postingRef = doc(db, "postings", selectedPostingForTransfer.id);

        const sourceSnap = await transaction.get(sourceAccRef);
        const destSnapShot = await transaction.get(destAccRef);

        if (!sourceSnap.exists() || !destSnapShot.exists()) {
          throw new Error("One or more accounts no longer exist");
        }

        const sourceData = sourceSnap.data();
        const destData = destSnapShot.data();
        const amount = Number(selectedPostingForTransfer.amount) || 0;

        // Update Source Account (Revert balance)
        transaction.update(sourceAccRef, {
          paid: (sourceData.paid || 0) - amount,
          balance: (sourceData.balance || 0) + amount
        });

        // Update Destination Account (Apply payment)
        transaction.update(destAccRef, {
          paid: (destData.paid || 0) + amount,
          balance: (destData.balance || 0) - amount
        });

        // Update Posting Record
        transaction.update(postingRef, {
          accountId: destId,
          accountNo: destAccountNo,
          memberName: destData.name,
          lineId: destData.lineId,
          adminId: destData.adminId || "",
          transferredFrom: accountInfo.accountNo,
          transferredAt: new Date().toISOString()
        });

        const logRef = doc(collection(db, "activity_logs"));
        transaction.set(logRef, {
          type: "POSTING_TRANSFER",
          postingId: selectedPostingForTransfer.id,
          fromAccount: accountInfo.accountNo,
          toAccount: destAccountNo,
          amount: amount,
          performedBy: userData?.name || "System",
          performedByRole: userData?.role,
          timestamp: new Date().toISOString()
        });
      });

      toast.success(`Successfully shifted ${formatCurrency(selectedPostingForTransfer.amount)} to ${destAccountNo}`);
      setTransferPostingOpen(false);
      handleSearch();
    } catch (err: any) {
      console.error("Transfer error:", err);
      toast.error(`Transfer failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const saveEditPosting = async () => {
    if (!selectedEditPosting || !accountInfo) return;
    setLoading(true);
    try {
      const postingRef = doc(db, "postings", selectedEditPosting.id);
      const oldAmount = selectedEditPosting.amount;
      const newAmount = parseFloat(editPostAmount);
      const diff = newAmount - oldAmount;

      await runTransaction(db, async (transaction) => {
        const accRef = doc(db, "accounts", accountInfo.id);
        const accDoc = await transaction.get(accRef);
        
        transaction.update(postingRef, {
          date: editPostDate,
          amount: newAmount
        });

        transaction.update(accRef, {
          paid: (accDoc.data()?.paid || 0) + diff,
          balance: (accDoc.data()?.balance || 0) - diff
        });
      });

      toast.success("Transaction updated successfully");
      setEditPostingOpen(false);
      handleSearch();
    } catch (err) {
      console.error(err);
      toast.error("Failed to update transaction");
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
        
        // Reversal logic
        const newPaid = (accData.paid || 0) - postingAmount;
        const newBalance = (accData.balance || 0) + postingAmount;
        const newStatus = newBalance > 0 ? "active" : "completed";

        transaction.update(accountRef, {
          paid: newPaid,
          balance: newBalance,
          status: newStatus
        });

        transaction.delete(postingRef);
      });

      toast.success("Transaction deleted and balance reconciled.");
      handleSearch(); // Refresh data
    } catch (err: any) {
      console.error("Delete Posting Error:", err);
      toast.error("Failed to delete transaction: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!accountNo || !userData) return;
    setLoading(true);
    try {
      let q;
      if (!selectedLineId) {
        toast.error("Please select a line first from the sidebar");
        setLoading(false);
        return;
      }

      q = query(collection(db, "accounts"), where("accountNo", "==", accountNo), where("lineId", "==", selectedLineId));
      
      if (userData.role === "admin") {
        q = query(q, where("adminId", "==", userData.uid));
      }
      
      const accSnap = await getDocs(q);
      if (accSnap.empty) {
        setAccountInfo(null);
        setPostings([]);
        return;
      }
      
      const accDoc = accSnap.docs[0];
      const acc = { id: accDoc.id, ...(accDoc.data() as any) };
      setAccountInfo(acc);
      
      // Fetch all postings for this account, sorted by date
      const pq = query(
        collection(db, "postings"), 
        where("accountId", "==", acc.id)
      );
      
      const pSnap = await getDocs(pq);
      const posts: DocumentData[] = pSnap.docs
        .map(d => ({ id: d.id, ...(d.data() as any) }))
        .filter(p => p.status === 'collection' || p.status === 'penalty' || p.status === 'extra_collection' || p.status === 'extra_transfer_out');
        
      // Sort locally to avoid index requirement
      posts.sort((a, b) => (a.date > b.date ? 1 : -1));
      setPostings(posts);
      
      const penaltySum = posts.reduce((sum, p) => sum + (p.penaltyAmount || 0), 0);
      setTotalPenalty(penaltySum);
      
      const extraSum = posts.reduce((sum, p) => sum + (p.extraAmount || 0), 0);
      const surplus = Math.max(0, acc.paid - acc.totalAmount);
      setTotalExtra(extraSum + surplus);
      
      toast.success("Ledger generated successfully");
    } catch (err) {
      console.error("Ledger Search Error:", err);
      toast.error("Failed to generate statement");
    } finally {
      setLoading(false);
    }
  };

  let runningTotal = 0;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-premium-gradient flex items-center justify-center shadow-lg">
            <BookOpen className="text-white h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-primary">Account Ledger</h1>
            <p className="text-muted-foreground">Comprehensive transaction history and repayment tracking.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-9 gap-2 border-slate-200 text-slate-700 font-bold" onClick={() => {
            if (!accountInfo) {
              toast.error("Please search and load an account first");
              return;
            }
            
            const doc = new jsPDF();
            
            // Header Section
            doc.setFontSize(22);
            doc.setTextColor(15, 23, 42); // slate-900
            doc.text("SRIDEVI FINANCE HUB", 14, 22);
            
            doc.setFontSize(14);
            doc.text("Official Account Statement", 14, 30);
            
            doc.setFontSize(10);
            doc.setTextColor(100, 116, 139); // slate-500
            doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 38);

            // Member Info Box
            doc.setDrawColor(226, 232, 240); // slate-200
            doc.line(14, 42, 196, 42);
            
            doc.setFontSize(10);
            doc.setTextColor(15, 23, 42);
            doc.text(`Member Name: ${accountInfo.name}`, 14, 50);
            doc.text(`Account Number: ${accountInfo.accountNo}`, 14, 55);
            doc.text(`Village: ${accountInfo.village || "N/A"}`, 14, 60);
            doc.text(`Phone: ${accountInfo.phone || "N/A"}`, 14, 65);
            doc.text(`A/C Created: ${accountInfo.creationDate || formatDate(accountInfo.createdAt)}`, 14, 70);
            
            doc.text(`Total Principal: ${formatCurrency(accountInfo.totalAmount)}`, 130, 50);
            doc.text(`Amount Paid: ${formatCurrency(accountInfo.paid)}`, 130, 55);
            doc.text(`Outstanding: ${formatCurrency(accountInfo.balance)}`, 130, 60);
            doc.text(`Status: ${accountInfo.status.toUpperCase()}`, 130, 65);

            const tableColumn = ["Sl No", "Date", "Amount", "Mode", "Collected By"];
            const tableRows = postings.map((p, i) => [
              i + 1, 
              formatDate(p.date), 
              formatCurrency(p.amount), 
              p.payMode.toUpperCase(), 
              p.collectedByName || "System"
            ]);

            autoTable(doc, {
              head: [tableColumn],
              body: tableRows,
              startY: 75,
              theme: 'striped',
              headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
              styles: { fontSize: 9, cellPadding: 4 },
              columnStyles: {
                2: { halign: 'right', fontStyle: 'bold' } // Amount column
              }
            });

            doc.save(`Ledger_${accountNo}_${new Date().toISOString().split("T")[0]}.pdf`);
            toast.success("Ledger Exported as PDF");
          }}>
            <Download className="h-4 w-4" /> PDF
          </Button>
          <Button variant="outline" size="sm" className="h-9 gap-2 border-slate-200 text-emerald-600 font-bold hover:bg-emerald-50 hover:border-emerald-200 transition-all" onClick={() => {
            if (!accountInfo || postings.length === 0) {
              toast.error("No data to export");
              return;
            }
            
            const data = postings.map((p, i) => ({
              "Sl No": i + 1,
              "Date": formatDate(p.date),
              "Description": p.status?.toUpperCase() || "PAYMENT",
              "Amount": p.amount || 0,
              "Mode": (p.payMode || "CASH").toUpperCase(),
              "Collected By": p.collectedByName || "System"
            }));

            exportToExcel(data, `Ledger_${accountNo}`, "Ledger");
            toast.success("Ledger Exported as Excel");
          }}>
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>

        </div>
      </div>

      <Card className="glass-card">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1 space-y-1 w-full">
              <Label className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground ml-1">Search Account</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input 
                  value={accountNo} 
                  onChange={e => setAccountNo(e.target.value)} 
                  placeholder="Enter Account No (e.g. ACC-1001)" 
                  className="pl-9 finance-input"
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                />
              </div>
            </div>
            <Button onClick={handleSearch} disabled={loading || !accountNo} className="bg-accent text-accent-foreground hover:bg-accent/90 min-w-[120px]">
              {loading ? "Searching..." : "Generate Ledger"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <AnimatePresence mode="wait">
        {accountInfo && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="space-y-6"
          >
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="bg-primary/5 border-primary/10">
                <CardContent className="p-4">
                  <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground mb-1">Subscriber & ID</p>
                  <p className="text-lg font-black text-primary truncate leading-tight">{accountInfo.name}</p>
                  <p className="text-[10px] font-bold text-accent">{accountInfo.accountNo}</p>
                </CardContent>
              </Card>
              <Card className="bg-primary/5 border-primary/10">
                <CardContent className="p-4">
                  <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground mb-1">Total Principal</p>
                  <p className="text-lg font-black text-primary leading-tight">{formatCurrency(accountInfo.totalAmount)}</p>
                  <p className="text-[10px] font-bold text-slate-500">Interest Amt: {formatCurrency(accountInfo.interestAmount)}</p>
                </CardContent>
              </Card>
              <Card className="bg-emerald-50 border-emerald-100">
                <CardContent className="p-4">
                  <p className="text-[10px] uppercase font-bold tracking-wider text-emerald-600 mb-1">Total Recieved</p>
                  <p className="text-lg font-black text-emerald-700 leading-tight">{formatCurrency(accountInfo.paid)}</p>
                  <p className="text-[10px] font-bold text-emerald-600 italic">{postings.length} Collection Entries</p>
                </CardContent>
              </Card>
              <Card className="bg-destructive/5 border-destructive/10">
                <CardContent className="p-4">
                  <p className="text-[10px] uppercase font-bold tracking-wider text-destructive mb-1">Outstanding</p>
                  <p className="text-lg font-black text-destructive leading-tight">{formatCurrency(accountInfo.balance)}</p>
                  <p className="text-[10px] font-bold text-destructive/60">Status: {accountInfo.status.toUpperCase()}</p>
                </CardContent>
              </Card>
              <Card className="bg-indigo-50 border-indigo-100">
                <CardContent className="p-4">
                  <p className="text-[10px] uppercase font-bold tracking-wider text-indigo-600 mb-1">Penalty Paid</p>
                  <p className="text-lg font-black text-indigo-700 leading-tight">{formatCurrency(totalPenalty)}</p>
                  <p className="text-[10px] font-bold text-indigo-400">Extra Fines</p>
                </CardContent>
              </Card>
              <Card className="bg-purple-50 border-purple-100">
                <CardContent className="p-4">
                  <p className="text-[10px] uppercase font-bold tracking-wider text-purple-600 mb-1">Extra Collection</p>
                  <p className="text-lg font-black text-purple-700 leading-tight">{formatCurrency(totalExtra)}</p>
                  <p className="text-[10px] font-bold text-purple-400">Misc Income</p>
                </CardContent>
              </Card>
            </div>

            {/* Advanced Metadata */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="bg-slate-50 border-slate-200 shadow-inner">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Assignment Profile</p>
                    <div className="flex items-center gap-2">
                       <div className="h-7 w-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center font-black text-[10px] text-accent">
                          {agents.find(a => a.id === accountInfo.agentId)?.name?.substring(0,2).toUpperCase() || "SY"}
                       </div>
                       <div className="flex flex-col">
                          <span className="text-xs font-black text-primary uppercase">
                            {agents.find(a => a.id === accountInfo.agentId)?.name || accountInfo.lastCollectedByName || 'System Auto-Assigned'}
                          </span>
                          <span className="text-[9px] font-bold text-slate-400">Dedicated Collection Agent</span>
                       </div>
                    </div>
                  </div>
                  <div className="text-right">
                     <Badge className="bg-white text-primary border-slate-200 font-bold mb-1">ACTIVE LOAN</Badge>
                     <p className="text-[10px] font-bold text-slate-400">PLAN: {accountInfo.paymentFrequency?.toUpperCase()}</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-50 border-slate-200 shadow-inner">
                <CardContent className="p-4 flex items-center justify-between">
                   <div className="space-y-1">
                      <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Loan Timeline</p>
                      <div className="flex items-center gap-4 text-xs font-black text-primary">
                         <div className="space-y-0.5">
                            <span className="text-[8px] text-slate-400 block uppercase">Created Date</span>
                            {accountInfo.creationDate ? formatDate(accountInfo.creationDate) : formatDate(accountInfo.createdAt)}
                         </div>
                         <div className="h-8 w-px bg-slate-200" />
                         <div className="space-y-0.5">
                            <span className="text-[8px] text-slate-400 block uppercase">Loan Started</span>
                            {formatDate(accountInfo.startDate)}
                         </div>
                         <div className="h-8 w-px bg-slate-200" />
                         <div className="space-y-0.5">
                            <span className="text-[8px] text-slate-400 block uppercase">Maturity Date</span>
                            {accountInfo.endDate ? formatDate(accountInfo.endDate) : 'Not Set'}
                         </div>
                      </div>
                   </div>
                   <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-white border border-slate-200">
                      <Calendar className="h-5 w-5 text-accent" />
                   </div>
                </CardContent>
              </Card>
            </div>

            {/* Security Documents Vault */}
            {accountInfo.documents && accountInfo.documents.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    Verified Digital Credentials
                  </h3>
                  <Badge variant="outline" className="border-slate-200 text-slate-400 font-bold text-[8px] uppercase tracking-widest px-2">
                    {accountInfo.documents.length} Secure Files
                  </Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {accountInfo.documents.map((doc: any, idx: number) => (
                    <motion.div 
                      key={idx}
                      whileHover={{ y: -2 }}
                      className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-start gap-4 group transition-all hover:shadow-md hover:border-accent/20"
                    >
                      <div className="h-12 w-12 rounded-xl bg-slate-50 flex items-center justify-center shrink-0 group-hover:bg-accent/5 transition-colors">
                         {doc.url.match(/\.(jpg|jpeg|png|webp)$/i) ? (
                           <ImageIcon size={20} className="text-slate-300 group-hover:text-accent" />
                         ) : (
                           <File size={20} className="text-slate-300 group-hover:text-accent" />
                         )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black uppercase text-accent tracking-widest">{doc.type}</p>
                        <p className="text-xs font-bold text-slate-900 truncate mt-0.5">{doc.description || 'Verified Record'}</p>
                        <a 
                          href={doc.url} 
                          target="_blank" 
                          rel="noreferrer"
                          className="text-[9px] font-black uppercase text-slate-400 hover:text-primary transition-colors flex items-center gap-1 mt-2"
                        >
                          <Download size={10} /> View Document
                        </a>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            <Card className="glass-card shadow-lg border-none overflow-hidden">
              <CardHeader className="bg-primary/5 border-b border-primary/10 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-bold flex items-center gap-2 uppercase tracking-widest text-primary/70">
                  <FileText className="h-4 w-4" />
                  Transaction Statement
                </CardTitle>
                <div className="text-xs font-medium text-muted-foreground">
                  Showing {postings.length} entries
                </div>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-primary/5">
                      <th className="p-4 text-[10px] uppercase tracking-widest font-bold text-primary/60">Sl. No.</th>
                      <th className="p-4 text-[10px] uppercase tracking-widest font-bold text-primary/60">Date <ArrowUpDown className="inline h-3 w-3 ml-1" /></th>
                      <th className="p-4 text-[10px] uppercase tracking-widest font-bold text-primary/60 text-right">Credit Amount</th>
                      <th className="p-4 text-[10px] uppercase tracking-widest font-bold text-primary/60 text-right">Running Total</th>
                      <th className="p-4 text-[10px] uppercase tracking-widest font-bold text-primary/60">Payment Mode</th>
                      <th className="p-4 text-[10px] uppercase tracking-widest font-bold text-primary/60">Collected By</th>
                      <th className="p-4 text-[10px] uppercase tracking-widest font-bold text-primary/60 text-center">Status/Purpose</th>
                      <th className="p-4 text-[10px] uppercase tracking-widest font-bold text-primary/60 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-primary/5">
                    {postings.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-20 text-muted-foreground italic bg-slate-50/50">
                          <User className="h-12 w-12 mx-auto mb-3 text-muted-foreground/20" />
                          No payment history found for this account.
                        </td>
                      </tr>
                    ) : (
                      postings.map((p, i) => {
                        runningTotal += p.amount || 0;
                        return (
                          <motion.tr 
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}
                            key={p.id} 
                            className="hover:bg-primary/5 transition-colors group"
                          >
                            <td className="p-4 text-xs font-mono text-muted-foreground">{i + 1}</td>
                            <td className="p-4">
                               <div className="flex flex-col">
                                  <span className="text-sm font-medium">{formatDate(p.date)}</span>
                                  {p.transferredFrom && (
                                    <Badge variant="outline" className="w-fit text-[7px] bg-blue-50 text-blue-600 border-blue-100 font-black uppercase tracking-tighter mt-1">
                                      Shifted from {p.transferredFrom}
                                    </Badge>
                                  )}
                               </div>
                            </td>
                            <td className="p-4 text-sm font-bold text-right text-emerald-600">
                              <div className="flex flex-col">
                                 <span>{formatCurrency(p.amount)}</span>
                                 {p.penaltyAmount > 0 && (
                                   <span className="text-[9px] text-rose-500 font-black">+ {formatCurrency(p.penaltyAmount)} Fine</span>
                                 )}
                                 {p.extraAmount !== 0 && (
                                   <span className={`text-[9px] font-black ${p.extraAmount > 0 ? 'text-indigo-500' : 'text-rose-500'}`}>
                                     {p.extraAmount > 0 ? '+' : '-'} {formatCurrency(Math.abs(p.extraAmount))} Extra
                                   </span>
                                 )}
                              </div>
                            </td>
                            <td className="p-4 text-sm font-bold text-right text-primary group-hover:text-accent transition-colors">
                              {formatCurrency(runningTotal + postings.slice(0, i + 1).reduce((s, x) => s + (x.penaltyAmount || 0), 0))}
                            </td>
                              <td className="p-4">
                                <span className="text-[10px] font-bold uppercase py-1 px-2 rounded-md bg-slate-100 text-slate-600">
                                  {p.payMode}
                                </span>
                              </td>
                              <td className="p-4">
                                <div className="flex flex-col">
                                  <span className="text-xs font-black text-slate-700 uppercase leading-none">
                                    {p.collectedByName || "System"}
                                  </span>
                                  <span className={`text-[8px] font-bold uppercase mt-1 ${p.collectedByRole === 'super_admin' ? 'text-indigo-500' : 'text-emerald-500'}`}>
                                    {p.collectedByRole === 'super_admin' ? 'Admin' : 'Agent'}
                                  </span>
                                </div>
                              </td>
                            <td className="p-4 text-center">
                               <div className="flex flex-col items-center">
                                 <span className={`text-[10px] font-bold uppercase py-1 px-2 rounded-md ${
                                   p.status === 'penalty' ? 'bg-amber-100 text-amber-700' : 
                                   p.status === 'extra_collection' ? 'bg-purple-100 text-purple-700' : 
                                   p.status === 'extra_transfer_out' ? 'bg-rose-100 text-rose-700' : 
                                   'bg-blue-100 text-blue-700'
                                 }`}>
                                   {p.status?.replace('_', ' ')}
                                 </span>
                                 {p.purpose && <span className="text-[8px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">{p.purpose}</span>}
                               </div>
                            </td>
                            <td className="p-4 text-right">
                                {userData?.role === "super_admin" && (
                                  <div className="flex justify-end gap-1">
                                    <Button 
                                      variant="ghost" 
                                      size="icon" 
                                      title="Transfer Posting"
                                      className="h-8 w-8 text-slate-300 hover:text-blue-500 hover:bg-blue-50"
                                      onClick={() => handleTransferInit(p)}
                                    >
                                      <ArrowRightLeft size={14} />
                                    </Button>
                                    {userData?.role === "super_admin" && (
                                      <>
                                        <Button 
                                          variant="ghost" 
                                          size="icon" 
                                          className="h-8 w-8 text-slate-300 hover:text-accent hover:bg-accent/5"
                                          onClick={() => handleEditPosting(p)}
                                        >
                                          <Edit size={14} />
                                        </Button>
                                        <Button 
                                          variant="ghost" 
                                          size="icon" 
                                          className="h-8 w-8 text-slate-300 hover:text-destructive hover:bg-destructive/5"
                                          onClick={() => handleDeletePosting(p)}
                                        >
                                          <Trash2 size={14} />
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                )}
                              </td>
                          </motion.tr>
                        );
                      })
                    )}
                  </tbody>
                  {postings.length > 0 && (
                    <tfoot className="bg-primary hover:bg-primary transition-colors">
                      <tr>
                        <td colSpan={2} className="p-4 text-xs font-bold text-primary-foreground uppercase tracking-widest">Final Total Summarized</td>
                        <td className="p-4 text-lg font-black text-white text-right">{formatCurrency(runningTotal)}</td>
                        <td className="p-4 text-lg font-black text-accent text-right">{formatCurrency(runningTotal)}</td>
                        <td colSpan={4}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </CardContent>
            </Card>

            {/* Payment Progress Visualization */}
            <Card className="glass-card border-none shadow-xl bg-[#0F172A] text-white p-8 overflow-hidden relative rounded-3xl">
               <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                     <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                     <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Recovery Maturity Lifecycle</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black text-emerald-400 italic">
                      {Math.round(((accountInfo.paid || 0) / (accountInfo.totalAmount || 1)) * 100)}%
                    </p>
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">Recovered</p>
                  </div>
               </div>
               
               <div className="h-4 w-full bg-white/5 rounded-full overflow-hidden mb-8 border border-white/5">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, ((accountInfo.paid || 0) / (accountInfo.totalAmount || 1)) * 100)}%` }}
                    className="h-full bg-premium-gradient shadow-[0_0_30px_rgba(245,158,11,0.4)] relative"
                  >
                    <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.2),transparent)] animate-[shimmer_2s_infinite]" />
                  </motion.div>
               </div>

               <div className="grid grid-cols-3 gap-8">
                  <div className="space-y-1">
                     <p className="text-[8px] font-black uppercase text-slate-500 tracking-widest">Total Collected</p>
                     <p className="text-2xl font-black text-emerald-400 italic">{formatCurrency(accountInfo.paid)}</p>
                  </div>
                  <div className="space-y-1">
                     <p className="text-[8px] font-black uppercase text-slate-500 tracking-widest">Principal Owed</p>
                     <p className="text-2xl font-black text-rose-400 italic">{formatCurrency(accountInfo.balance)}</p>
                  </div>
                  <div className="space-y-1">
                     <p className="text-[8px] font-black uppercase text-slate-500 tracking-widest">Agreement Value</p>
                     <p className="text-2xl font-black text-white italic">{formatCurrency(accountInfo.totalAmount)}</p>
                  </div>
               </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {!accountInfo && !loading && (
        <div className="flex flex-col items-center justify-center py-20 bg-primary/5 border-2 border-dashed border-primary/10 rounded-2xl text-center space-y-4">
          <BookOpen className="h-16 w-16 text-primary/10" />
          <div className="max-w-xs space-y-2">
            <h3 className="text-xl font-bold text-primary/40">Ready to Review Ledger?</h3>
            <p className="text-sm text-muted-foreground">Enter an account number above to generate a complete transaction statement for any member.</p>
          </div>
        </div>
      )}

      <Dialog open={editPostingOpen} onOpenChange={setEditPostingOpen}>
        <DialogContent className="sm:max-w-[425px] glass-card border-none shadow-2xl p-0 overflow-hidden">
          <div className="bg-slate-900 p-6 text-white">
            <DialogTitle className="text-xl font-black italic uppercase tracking-tight flex items-center gap-2">
              <Edit size={20} className="text-accent" />
              Adjust Transaction
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs mt-1">
              Correcting ledger entry for {accountInfo?.name}
            </DialogDescription>
          </div>
          <div className="p-6 space-y-5">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Correct Amount</Label>
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
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">New Transaction Date</Label>
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
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={transferPostingOpen} onOpenChange={setTransferPostingOpen}>
        <DialogContent className="sm:max-w-[425px] glass-card border-none shadow-2xl p-0 overflow-hidden">
          <div className="bg-blue-600 p-6 text-white">
            <DialogTitle className="text-xl font-black italic uppercase tracking-tight flex items-center gap-2">
              <ArrowRightLeft size={20} className="text-white" />
              Shift Transaction
            </DialogTitle>
            <DialogDescription className="text-blue-100 text-xs mt-1">
              Moving entry from {accountInfo?.accountNo} to a different account
            </DialogDescription>
          </div>
          <div className="p-6 space-y-5">
            <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 flex items-center gap-3">
               <div className="h-10 w-10 rounded-lg bg-white flex items-center justify-center text-blue-600 shadow-sm font-black text-sm">
                  {selectedPostingForTransfer?.amount}
               </div>
               <div className="flex-1">
                  <p className="text-[10px] font-black uppercase text-blue-400 leading-none">Moving Amount</p>
                  <p className="text-xs font-bold text-blue-700 mt-1">{formatDate(selectedPostingForTransfer?.date)}</p>
               </div>
               <MoveRight className="text-blue-300" />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Destination Account No</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input 
                  placeholder="Enter ACC-XXXX" 
                  value={destAccountNo} 
                  onChange={e => setDestAccountNo(e.target.value.toUpperCase())} 
                  className="pl-9 h-12 finance-input font-black text-lg" 
                />
              </div>
              <p className="text-[9px] font-medium text-slate-400 px-1 italic">Balances will be automatically adjusted on both accounts.</p>
            </div>
            
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setTransferPostingOpen(false)} className="flex-1 h-12 rounded-xl font-bold uppercase tracking-widest text-xs border-slate-200">
                Cancel
              </Button>
              <Button 
                onClick={saveTransferPosting} 
                disabled={loading || !destAccountNo}
                className="flex-1 h-12 rounded-xl bg-blue-600 text-white font-bold uppercase tracking-widest text-xs shadow-lg hover:bg-blue-700"
              >
                {loading ? "Shifting..." : "Shift Now"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default Ledger;
