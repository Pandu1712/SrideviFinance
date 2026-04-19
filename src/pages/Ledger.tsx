import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLine } from "@/contexts/LineContext";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, DocumentData, orderBy, doc, runTransaction } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Search, User, Filter, Download, FileText, ArrowUpDown, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "lucide-react";
import { toast } from "sonner";

import { useSearchParams } from "react-router-dom";

const Ledger = () => {
  const { userData, loading: authLoading } = useAuth();
  const { selectedLineId } = useLine();
  const [searchParams] = useSearchParams();
  const [accountNo, setAccountNo] = useState(searchParams.get("acc") || "");
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [accountInfo, setAccountInfo] = useState<DocumentData | null>(null);
  const [postings, setPostings] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(false);

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
      if (userData.role === "super_admin") {
        q = query(collection(db, "accounts"), where("accountNo", "==", accountNo));
      } else if (userData.role === "admin") {
        q = query(collection(db, "accounts"), where("accountNo", "==", accountNo), where("adminId", "==", userData.uid));
      } else {
        // Agent role
        q = query(collection(db, "accounts"), where("accountNo", "==", accountNo), where("lineId", "==", userData.lineId || ""));
      }

      if (selectedLineId) {
        q = query(q, where("lineId", "==", selectedLineId));
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
      const posts: DocumentData[] = pSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      // Sort locally to avoid index requirement
      posts.sort((a, b) => (a.date > b.date ? 1 : -1));
      setPostings(posts);
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
          <Button variant="outline" size="sm" className="h-9 gap-2" onClick={() => {
            if (!accountInfo) return;
            const headers = ["Sl. No.", "Date", "Amount", "Mode", "Status"];
            const rows = postings.map((p, i) => [i + 1, formatDate(p.date), p.amount, p.payMode, p.status]);
            const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
            const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = `Ledger_${accountNo}_${new Date().toISOString().split("T")[0]}.csv`;
            link.click();
            toast.success("Ledger exported successfully");
          }}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          <Button 
            className="h-9 gap-2 bg-[#25D366] text-white hover:bg-[#128C7E]"
            onClick={() => {
              if (!accountInfo) return;
              const text = `*Sridevi Finance Hub - Ledger Summary*%0A%0A*Member:* ${accountInfo.name}%0A*Account:* ${accountInfo.accountNo}%0A*Total Principal:* ${formatCurrency(accountInfo.totalAmount)}%0A*Amount Paid:* ${formatCurrency(accountInfo.paid)}%0A*Balance Due:* ${formatCurrency(accountInfo.balance)}%0A%0A*Status:* ${accountInfo.status.toUpperCase()}%0A%0A_Generated via Official Portal_`;
              const phone = accountInfo.phone || "";
              window.open(`https://wa.me/${phone.includes('+') ? phone : '+91' + phone}?text=${text}`, '_blank');
            }}
          >
            <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
            Send WhatsApp
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

              {/* Advanced Metadata */}
              <Card className="bg-slate-50 border-slate-200 shadow-inner md:col-span-2">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Assignment Profile</p>
                    <div className="flex items-center gap-2">
                       <div className="h-7 w-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center font-black text-[10px] text-accent">
                          {agents.find(a => a.id === accountInfo.agentId)?.name?.substring(0,2).toUpperCase() || "SY"}
                       </div>
                       <div className="flex flex-col">
                          <span className="text-xs font-black text-primary uppercase">
                            {agents.find(a => a.id === accountInfo.agentId)?.name || 'System Auto-Assigned'}
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

              <Card className="bg-slate-50 border-slate-200 shadow-inner md:col-span-2">
                <CardContent className="p-4 flex items-center justify-between">
                   <div className="space-y-1">
                      <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Loan Timeline</p>
                      <div className="flex items-center gap-4 text-xs font-black text-primary">
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
                      <th className="p-4 text-[10px] uppercase tracking-widest font-bold text-primary/60 text-center">Status</th>
                      {userData?.role === "super_admin" && (
                        <th className="p-4 text-[10px] uppercase tracking-widest font-bold text-primary/60 text-right">Delete</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-primary/5">
                    {postings.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-20 text-muted-foreground italic bg-slate-50/50">
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
                            <td className="p-4 text-sm font-medium">{formatDate(p.date)}</td>
                            <td className="p-4 text-sm font-bold text-right text-emerald-600">{formatCurrency(p.amount)}</td>
                            <td className="p-4 text-sm font-bold text-right text-primary group-hover:text-accent transition-colors">{formatCurrency(runningTotal)}</td>
                            <td className="p-4">
                              <span className="text-[10px] font-bold uppercase py-1 px-2 rounded-md bg-slate-100 text-slate-600">
                                {p.payMode}
                              </span>
                            </td>
                            <td className="p-4 text-center">
                              <span className={`text-[10px] font-bold uppercase py-1 px-2 rounded-md ${p.status === 'penalty' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                                {p.status}
                              </span>
                            </td>
                            {userData?.role === "super_admin" && (
                              <td className="p-4 text-right">
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 text-destructive/50 hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => handleDeletePosting(p)}
                                >
                                  <Trash2 size={14} />
                                </Button>
                              </td>
                            )}
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
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </CardContent>
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
    </motion.div>
  );
};

export default Ledger;
