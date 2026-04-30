import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLine } from "@/contexts/LineContext";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, query, where, doc, updateDoc, DocumentData, runTransaction, orderBy } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Search, FileText, CheckCircle2, Wallet, Calendar, CreditCard, ArrowRight, User, IndianRupee, Users, Filter, Zap, Printer } from "lucide-react";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { logActivity } from "@/lib/audit";

const DailyPosting = () => {
  const { userData } = useAuth();
  const { selectedLineId } = useLine();
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [accountInfo, setAccountInfo] = useState<DocumentData | null>(null);
  const [assignedMembers, setAssignedMembers] = useState<DocumentData[]>([]);
  const [fetchingMembers, setFetchingMembers] = useState(false);
  const [villageFilter, setVillageFilter] = useState("all");
  const [availableVillages, setAvailableVillages] = useState<string[]>([]);
  const [isSuccess, setIsSuccess] = useState(false);
  const [lastPostedAmount, setLastPostedAmount] = useState(0);
  const [todayPostings, setTodayPostings] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({ 
    accountNo: "", 
    date: new Date().toISOString().split("T")[0], 
    amount: "", 
    status: "collection", 
    payMode: "cash" 
  });

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
        const vils = Array.from(new Set(membersList.map(m => m.village).filter(Boolean))) as string[];
        setAvailableVillages(vils.sort());
        membersList.sort((a: any, b: any) => (a.accountNo || "").localeCompare(b.accountNo || ""));
        setAssignedMembers(membersList);
      } catch (err) {
        console.error("Load members error:", err);
      } finally {
        setFetchingMembers(false);
      }
    };
    loadAssignedMembers();
  }, [userData, selectedLineId]);

  // Fetch today's postings to highlight paid accounts
  // Fetch today's postings to highlight paid accounts
  useEffect(() => {
    const loadTodayPostings = async () => {
      if (!selectedLineId || !form.date) return;
      try {
        const q = query(
          collection(db, "postings"), 
          where("lineId", "==", selectedLineId),
          where("date", "==", form.date)
        );
        const snap = await getDocs(q);
        const postedIds = new Set(snap.docs.map(d => d.data().accountId));
        setTodayPostings(postedIds);
      } catch (err) {
        console.error("Load today postings error:", err);
      }
    };
    loadTodayPostings();
  }, [selectedLineId, form.date]);

  const selectMember = (member: DocumentData) => {
    setAccountInfo(member);
    setForm(prev => ({ ...prev, accountNo: member.accountNo }));
    toast.info(`Selected: ${member.name}`);
    
    // Auto-scroll to profile on mobile
    if (window.innerWidth < 1024) {
      setTimeout(() => {
        profileRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
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
      setAccountInfo(accountData);
      toast.success("Account loaded successfully");
      
      // Auto-scroll to profile on mobile
      if (window.innerWidth < 1024) {
        setTimeout(() => {
          profileRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
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
    if (!accountInfo || !form.amount) {
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

      const postingAmount = parseFloat(form.amount);
      const accountRef = doc(db, "accounts", accountInfo.id);

      await runTransaction(db, async (transaction) => {
        const accDoc = await transaction.get(accountRef);
        if (!accDoc.exists()) throw new Error("Account does not exist!");

        const accData = accDoc.data();
        const newPaid = (accData.paid || 0) + postingAmount;
        const newBalance = (accData.totalAmount || 0) - newPaid;
        const newStatus = newBalance <= 0 ? "completed" : "active";

        const postingRef = doc(collection(db, "postings"));
        transaction.set(postingRef, {
          accountId: accountInfo.id,
          accountNo: form.accountNo,
          date: form.date,
          amount: postingAmount,
          status: form.status,
          payMode: form.payMode,
          lineId: accountInfo.lineId,
          memberName: accountInfo.name,
          createdAt: new Date().toISOString(),
        });

        transaction.update(accountRef, {
          paid: newPaid,
          balance: Math.max(0, newBalance),
          status: newStatus,
          lastPostingDate: form.date,
          lastCollectedByName: userData?.name,
          lastCollectedByRole: userData?.role
        });
      });

      if (userData) {
        logActivity(
          userData.uid,
          userData.name,
          userData.role,
          "COLLECTION_POST",
          `Collected ${formatCurrency(postingAmount)} from ${accountInfo.name} (#${accountInfo.accountNo})`
        );
      }

      toast.success("Posted successfully");
      setIsSuccess(true);
      setLastPostedAmount(postingAmount);
      
      // Update local state for balance
      setAccountInfo(prev => prev ? { 
        ...prev, 
        paid: (prev.paid || 0) + postingAmount, 
        balance: Math.max(0, (prev.balance || 0) - postingAmount) 
      } : null);

    } catch (err: any) {
      toast.error(err.message || "Failed");
    } finally {
      setLoading(false);
    }
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-7 gap-6">
        <AnimatePresence mode="wait">
          {!isSuccess ? (
            <motion.div
              key="posting-form"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="lg:col-span-4 space-y-6"
            >
              {/* Entry Portal - NOW FIRST */}
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
                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Account Number</Label>
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
                            className="absolute right-1 top-1 h-9 w-9 bg-primary text-white rounded-lg"
                          >
                            <Search size={16} />
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Posting Date</Label>
                        <Input 
                          type="date" 
                          value={form.date} 
                          onChange={e => handleChange("date", e.target.value)} 
                          className="h-11 finance-input font-bold" 
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Amount (₹)</Label>
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
                            <SelectItem value="collection">Collection</SelectItem>
                            <SelectItem value="penalty">Penalty</SelectItem>
                            <SelectItem value="other">Other Fees</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

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

                    <Button 
                      type="submit" 
                      className="w-full h-16 md:h-14 bg-primary text-white font-black uppercase tracking-widest shadow-2xl hover:bg-slate-900 transition-all active:scale-95" 
                      disabled={loading || !accountInfo}
                    >
                      {loading ? "Authorizing..." : "Submit Collection"}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card className="glass-card h-[calc(100vh-250px)] overflow-hidden flex flex-col border-none shadow-2xl transition-all">
                <CardHeader className="border-b border-primary/5 bg-slate-50/50 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <CardTitle className="text-sm font-black flex items-center gap-2 text-primary uppercase tracking-[0.2em]">
                      <Users className="h-4 w-4 text-accent" />
                      Portfolio
                    </CardTitle>
                    <Select value={villageFilter} onValueChange={setVillageFilter}>
                      <SelectTrigger className="h-8 w-32 text-[10px] font-black uppercase tracking-widest border-none bg-white shadow-sm">
                        <SelectValue placeholder="Village" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Villages</SelectItem>
                        {availableVillages.map(v => (
                          <SelectItem key={v} value={v}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent className="p-0 flex-1 overflow-hidden">
                  <ScrollArea className="h-full">
                    <div className="p-3 space-y-2">
                      {fetchingMembers ? (
                        <div className="p-5 text-center text-xs text-muted-foreground animate-pulse">Syncing members...</div>
                      ) : assignedMembers
                          .filter(m => villageFilter === 'all' || m.village === villageFilter)
                          .map((m) => (
                        <button 
                          key={m.id}
                          onClick={() => selectMember(m)}
                          className={cn(
                            "w-full text-left p-3 rounded-2xl border border-transparent transition-all group",
                            accountInfo?.id === m.id 
                              ? "bg-accent text-accent-foreground shadow-lg shadow-accent/20" 
                              : todayPostings.has(m.id)
                                ? "bg-emerald-50 border-emerald-100" 
                                : "hover:bg-slate-50 hover:border-slate-100"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "h-10 w-10 rounded-xl flex items-center justify-center text-[11px] font-black transition-all",
                              accountInfo?.id === m.id ? "bg-white text-accent" : 
                              todayPostings.has(m.id) ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-600 group-hover:bg-white"
                            )}>
                              {m.accountNo}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={cn("text-[13px] font-black truncate uppercase tracking-tighter", accountInfo?.id === m.id ? "text-white" : todayPostings.has(m.id) ? "text-emerald-700" : "text-primary")}>{m.name}</p>
                              <div className="flex items-center gap-2">
                                <span className={cn("text-[9px] font-bold opacity-60", accountInfo?.id === m.id ? "text-white" : "text-slate-400")}>
                                  # {m.accountNo}
                                </span>
                                {m.village && (
                                  <span className={cn("text-[8px] font-bold opacity-40 uppercase truncate", accountInfo?.id === m.id ? "text-white" : "text-slate-400")}>
                                    • {m.village}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                               {m.phone && (
                                 <a href={`tel:${m.phone}`} onClick={e => e.stopPropagation()} className="p-2 bg-slate-100 rounded-lg hover:bg-emerald-100 text-emerald-600">
                                   <Zap size={12} />
                                 </a>
                               )}
                               <ArrowRight size={14} className={cn("ml-1", accountInfo?.id === m.id ? "text-white" : "text-slate-300")} />
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            <motion.div
              key="success-receipt"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="lg:col-span-4 flex flex-col items-center justify-center p-8 bg-emerald-50 rounded-3xl border-2 border-dashed border-emerald-200"
            >
               <div className="h-24 w-24 bg-emerald-500 rounded-full flex items-center justify-center shadow-2xl mb-6 text-white animate-bounce">
                  <CheckCircle2 size={48} />
               </div>
               <h2 className="text-4xl font-black text-emerald-900 tracking-tighter mb-2">Payment Posted!</h2>
               <p className="text-emerald-700 font-bold mb-8 uppercase tracking-widest text-xs">Authorization Successful • Receipt Generated</p>
               
               <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-xl border border-emerald-100 space-y-4 mb-8">
                  <div className="flex justify-between items-center pb-4 border-b border-slate-50">
                    <span className="text-[10px] font-black uppercase text-slate-400">Subscriber</span>
                    <span className="font-black text-primary uppercase">{accountInfo?.name}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black uppercase text-slate-400">Amount Collected</span>
                    <span className="text-2xl font-black text-emerald-600 tracking-tighter">{formatCurrency(lastPostedAmount)}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-[10px] font-black uppercase text-slate-400">Remaining Balance</span>
                    <span className="font-black text-rose-500">{formatCurrency(accountInfo?.balance)}</span>
                  </div>
               </div>

               <div className="flex gap-4 w-full max-w-xs">
                  <Button 
                    onClick={() => {
                      setIsSuccess(false);
                      setAccountInfo(null);
                      setForm(prev => ({ ...prev, accountNo: "" }));
                    }}
                    className="flex-1 h-12 bg-emerald-600 text-white font-black uppercase text-[10px] tracking-widest shadow-lg hover:bg-emerald-700"
                  >
                    Next Member
                  </Button>
                  <Button 
                    variant="outline"
                    className="flex-1 h-12 border-2 border-emerald-200 text-emerald-700 font-black uppercase text-[10px] tracking-widest"
                  >
                    <Printer size={16} className="mr-2" />
                    Receipt
                  </Button>
               </div>
            </motion.div>
          )}
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
                    <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${accountInfo.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {accountInfo.status}
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="grid grid-cols-2 divide-x divide-primary/10">
                      <div className="p-6 space-y-5">
                        <div className="space-y-1">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Subscriber Name</p>
                          <p className="text-xl font-black text-primary leading-tight">{accountInfo.name}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Village / Area</p>
                          <p className="text-sm font-semibold text-slate-600">{accountInfo.village || 'Not specified'}</p>
                        </div>
                        <div className="pt-4 border-t border-primary/5">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Total Payable Principal</p>
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
                                animate={{ width: `${Math.min(100, (accountInfo.paid / accountInfo.totalAmount) * 100)}%` }}
                                className="h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]"
                              />
                            </div>
                            <p className="text-[10px] text-right text-muted-foreground font-black uppercase tracking-widest">
                              {Math.round((accountInfo.paid / accountInfo.totalAmount) * 100)}% Recovered
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
    </motion.div>
  );
};

export default DailyPosting;
