import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, DocumentData, addDoc, serverTimestamp, doc, updateDoc, increment } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { Wallet, TrendingUp, IndianRupee, Search, RefreshCw, ArrowLeft, Smartphone, Edit3, Navigation, PhoneCall, Check, ChevronRight, User, Banknote, CreditCard, CheckCircle2, ChevronDown, Calendar, X, Zap } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { generateRepaymentSchedule, getGoogleMapsUrl } from "@/lib/loanUtils";

const DailyCollection = () => {
  const navigate = useNavigate();
  const { userData } = useAuth();
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [records, setRecords] = useState<DocumentData[]>([]);
  const [customers, setCustomers] = useState<DocumentData[]>([]);
  const [postings, setPostings] = useState<Record<string, Record<string, any>>>({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  const [activeCustomer, setActiveCustomer] = useState<any>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{custId: string, date: string, custName: string, amount: number, accountNo: string} | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMode, setPayMode] = useState("cash");
  const [digiPayer, setDigiPayer] = useState("");
  const [lateFee, setLateFee] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().split("T")[0]);

  const gridDates = Array.from({ length: 5 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (4 - i));
    return d.toISOString().split("T")[0];
  });

  const fetchDataForGrid = async () => {
    if (!userData || userData.role !== "agent") return;
    setLoading(true);
    try {
      const custQuery = query(collection(db, "accounts"), where("agentId", "==", userData.uid));
      const custSnap = await getDocs(custQuery);
      const custData = custSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setCustomers(custData);
      
      const postQuery = query(collection(db, "postings"), where("agentId", "==", userData.uid));
      const postSnap = await getDocs(postQuery);
      const postMap: Record<string, Record<string, any>> = {};
      
      const minDate = gridDates[0];
      postSnap.forEach(d => {
        const data = d.data();
        if (data.date >= minDate) {
          if (!postMap[data.accountId]) postMap[data.accountId] = {};
          postMap[data.accountId][data.date] = data;
        }
      });
      setPostings(postMap);
    } catch (err) {
      console.error(err);
      toast.error("Sync Error. Please Check Internet.");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!userData) return;
    if (userData.role === "agent") {
      fetchDataForGrid();
      return;
    }
    setLoading(true);
    try {
      let q;
      if (userData.role === "super_admin") q = query(collection(db, "postings"), where("date", "==", date));
      else if (userData.role === "admin") q = query(collection(db, "postings"), where("adminId", "==", userData.uid), where("date", "==", date));
      
      const snap = await getDocs(q!);
      const list: DocumentData[] = [];
      snap.forEach(d => list.push({ id: d.id, ...(d.data() as Record<string, any>) }));
      setRecords(list);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => { handleSearch(); }, [date, userData]);

  const handleCellClick = (customer: any, dateStr: string) => {
    const existing = postings[customer.id]?.[dateStr];
    setActiveCustomer(customer);
    setSelectedCell({
      custId: customer.id,
      date: dateStr,
      custName: customer.memberName || customer.name || "Unknown",
      accountNo: customer.accountNo,
      amount: existing?.amount || customer.installmentAmount || 0
    });
    setPayAmount(String(existing?.amount || customer.installmentAmount || ""));
    setPayMode(existing?.payMode || "cash");
    setDigiPayer(existing?.digiPayer || "");
    setLateFee(existing?.lateFee || "");
    setPayDate(dateStr);
    setPayDialogOpen(true);
  };

  const submitPayment = async (overrideAmount?: number) => {
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
        const postingData = {
          accountId: targetCell.custId,
          accountNo: targetCell.accountNo,
          memberName: targetCell.custName,
          amount: amountNum,
          principal: principalAmount,
          lateFee: lateFeeNum,
          digiPayer: payMode === 'online' ? digiPayer : '',
          date: targetCell.date,
          payMode: payMode,
          agentId: userData?.uid,
          adminId: activeCustomer?.adminId || "",
          lineId: activeCustomer?.lineId || "default",
          timestamp: serverTimestamp(),
          status: 'COLLECTION'
        };

        await addDoc(collection(db, "postings"), postingData);
        const accountRef = doc(db, "accounts", targetCell.custId);
        
        // Logic: Paid increases by total recovery, Balance decreases only by principal
        await updateDoc(accountRef, {
          paid: increment(amountNum),
          balance: increment(-principalAmount)
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

        toast.success(`Success ₹${amountNum}`);
        setPayDialogOpen(false);
        setDigiPayer("");
        setLateFee("");
        setPostings(prev => ({
          ...prev,
          [targetCell.custId]: { ...(prev[targetCell.custId] || {}), [targetCell.date]: postingData }
        }));
    } catch (err) {
      console.error(err);
      toast.error("Recovery failed to sync");
    } finally { setSubmitting(false); }
  };

  const filteredCustomers = customers.filter(c => {
    return (c.memberName || c.name || "").toLowerCase().includes(searchQuery.toLowerCase()) || 
           (c.accountNo || "").toLowerCase().includes(searchQuery.toLowerCase());
  });

  const totalTarget = filteredCustomers.reduce((acc, c) => acc + (c.totalAmount || 0), 0);
  const totalRecovered = filteredCustomers.reduce((acc, c) => acc + (c.paid || 0), 0);

  if (userData?.role === "agent") {
    return (
      <div className="flex flex-col h-screen bg-[#F5F7FB] overflow-hidden">
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
             
             <div className="relative z-10">
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
                 className="bg-white rounded-[2rem] p-4 shadow-sm border border-slate-100 active:scale-[0.98] transition-all"
               >
                  <div className="flex items-center justify-between mb-3">
                     <div className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 rounded-2xl bg-slate-50 flex items-center justify-center text-[#5f259f] font-black border border-slate-100 shrink-0 uppercase">
                           {c.memberName?.charAt(0) || c.name?.charAt(0)}
                        </div>
                        <div className="min-w-0">
                           <h3 className="text-[13px] font-black text-slate-900 tracking-tighter leading-none uppercase truncate">{c.memberName || c.name}</h3>
                           <p className="text-[8px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">{c.accountNo}</p>
                        </div>
                     </div>
                     <div className="text-right shrink-0">
                        <h4 className="text-[14px] font-black text-rose-500 italic tracking-tighter">₹{c.balance || 0}</h4>
                     </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-50">
                     <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                        {gridDates.map(d => {
                          const post = postings[c.id]?.[d];
                          const isToday = d === new Date().toISOString().split("T")[0];
                          return (
                            <div key={d} className={`h-7 w-7 rounded-lg flex items-center justify-center text-[7px] font-black border transition-all ${post ? 'bg-emerald-500 border-emerald-400 text-white' : isToday ? 'bg-amber-50 border-amber-300 text-amber-600' : 'bg-slate-50 border-slate-100 text-slate-200'}`}>
                               {d.slice(8, 10)}
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
           </div>
        </div>

        {/* Member Profile Overlay */}
        <AnimatePresence>
          {detailModalOpen && activeCustomer && (
            <div className="fixed inset-0 z-[10000] flex items-center justify-center p-0 md:p-6 lg:p-12">
               <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDetailModalOpen(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
               <motion.div initial={{ y: "100%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: "100%", opacity: 0 }} transition={{ type: "spring", damping: 35, stiffness: 400 }} className="relative w-full max-w-2xl h-full md:h-auto md:max-h-[90vh] bg-white md:rounded-[3rem] overflow-y-auto pb-40 no-scrollbar shadow-2xl">
                 <div className="bg-[#5f259f] px-6 pt-20 pb-8 text-white relative shrink-0">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 blur-[100px] rounded-full -mr-32 -mt-32" />
                    <div className="flex items-center justify-between mb-6 relative z-10">
                       <button onClick={() => setDetailModalOpen(false)} className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center active:bg-white/20 hover:bg-white/30 transition-all border border-white/20 shadow-lg">
                          <ArrowLeft size={18} />
                       </button>
                       <p className="text-[9px] font-black uppercase tracking-[0.2em] opacity-40">Portfolio Intelligence</p>
                       <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center opacity-20"><Smartphone size={16} /></div>
                    </div>
                    
                    <div className="flex flex-col items-center gap-1 text-center relative z-10">
                       <div className="h-12 w-12 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-xl font-black italic shadow-xl mb-1">
                          {activeCustomer.memberName?.charAt(0) || activeCustomer.name?.charAt(0)}
                       </div>
                       <div className="space-y-1">
                          <h2 className="text-2xl font-black tracking-tight uppercase italic leading-none">{activeCustomer.memberName || activeCustomer.name}</h2>
                          <div className="flex items-center justify-center gap-2 mt-2">
                             <span className="text-[9px] font-black text-white/50">{activeCustomer.accountNo}</span>
                             <div className="h-1 w-1 rounded-full bg-white/20" />
                             <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest">{activeCustomer.paymentFrequency} Plan</span>
                          </div>
                       </div>
                    </div>
                 </div>

                 <div className="px-5 -mt-6 grid grid-cols-2 gap-2 relative z-10">
                    <a href={`tel:${activeCustomer.phone}`} className="h-12 bg-white rounded-xl shadow-lg flex items-center justify-center gap-2 text-[9px] font-black uppercase text-slate-800 border border-slate-50">
                       <PhoneCall size={14} className="text-emerald-500" /> Call
                    </a>
                    <button onClick={() => activeCustomer.customerLocation && window.open(getGoogleMapsUrl(activeCustomer.customerLocation), '_blank')} className="h-12 bg-white rounded-xl shadow-lg flex items-center justify-center gap-2 text-[9px] font-black uppercase text-slate-800 border border-slate-50">
                       <Navigation size={14} className="text-blue-500" /> Maps
                    </button>
                 </div>

                 <div className="px-5 py-6 space-y-4">
                    <div className="bg-[#5f259f] p-5 rounded-[2rem] text-white shadow-2xl relative overflow-hidden">
                       <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                          <div className="col-span-2 pb-3 border-b border-white/10 flex justify-between items-center">
                             <div>
                                <p className="text-[7px] font-black uppercase tracking-[0.2em] opacity-40 mb-1">Portfolio Value</p>
                                <p className="text-2xl font-black italic">₹{activeCustomer.totalAmount || 0}</p>
                             </div>
                             <Badge className="bg-white/10 text-white border-none text-[8px] font-black uppercase h-6">Balance</Badge>
                          </div>
                          <div>
                             <p className="text-[7px] font-black uppercase tracking-[0.2em] opacity-40">Recovered</p>
                             <p className="text-base font-black text-emerald-400 italic">₹{activeCustomer.paid || 0}</p>
                          </div>
                          <div className="text-right">
                             <p className="text-[7px] font-black uppercase tracking-[0.2em] opacity-40">Due</p>
                             <p className="text-base font-black text-amber-400 italic">₹{activeCustomer.balance || 0}</p>
                          </div>
                       </div>
                    </div>

                    <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
                       <div className="flex justify-between items-end mb-3">
                          <div>
                             <p className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1">Velocity</p>
                             <h4 className="text-sm font-black text-slate-800 uppercase">{Math.round(((activeCustomer.paid || 0) / (activeCustomer.totalAmount || 1)) * 100)}% Completed</h4>
                          </div>
                          <CheckCircle2 size={16} className={((activeCustomer.paid || 0) >= (activeCustomer.totalAmount || 0)) ? "text-emerald-500" : "text-slate-200"} />
                       </div>
                       <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                          <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, ((activeCustomer.paid || 0) / (activeCustomer.totalAmount || 1)) * 100)}%` }} className="h-full bg-gradient-to-r from-[#5f259f] to-[#7c3aed]" />
                       </div>
                    </div>
                 </div>

                 <div className="px-5 pb-10">
                    <div className="space-y-2 max-w-sm mx-auto">
                       <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 mb-4 px-2">Repayment Matrix</p>
                       {generateRepaymentSchedule(activeCustomer.startDate, activeCustomer.paymentFrequency || 'daily', activeCustomer.totalAmount || 0, activeCustomer.installmentAmount || 0).map((d, i) => {
                          const post = postings[activeCustomer.id]?.[d];
                          const isToday = d === new Date().toISOString().split("T")[0];
                          const isSettled = (activeCustomer.balance || 0) <= 0;

                          return (
                            <div key={d} onClick={() => !post && !isSettled && handleCellClick(activeCustomer, d)} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${post ? 'bg-emerald-50 border-emerald-100' : isToday && !isSettled ? 'bg-[#5f259f]/5 border-[#5f259f]/10' : 'bg-white border-slate-50'}`}>
                               <div className={`h-8 w-8 shrink-0 rounded-lg flex items-center justify-center font-black text-[9px] ${post ? 'bg-emerald-500 text-white' : isToday && !isSettled ? 'bg-[#5f259f] text-white animate-pulse' : 'bg-slate-100 text-slate-400'}`}>{d.slice(8, 10)}</div>
                               <div className="flex-1">
                                  <p className="text-[12px] font-black text-slate-900 leading-none">₹{post ? post.amount : activeCustomer.installmentAmount}</p>
                                  <p className="text-[7px] font-bold text-slate-400 uppercase mt-0.5">{formatDate(d)} • Plan #{i+1}</p>
                               </div>
                               <div className="text-right">
                                  {post ? <Check size={12} className="text-emerald-500" /> : isSettled ? <div className="px-2 py-0.5 rounded-md text-[6px] font-black uppercase bg-emerald-50 text-emerald-500 border border-emerald-100 italic">SETTLED</div> : <div className={`px-2 py-0.5 rounded-md text-[6px] font-black uppercase ${isToday ? 'bg-primary text-white' : 'bg-slate-50 text-slate-300'}`}>{isToday ? 'COLLECT' : 'PLAN'}</div>}
                               </div>
                            </div>
                          );
                       })}
                    </div>
                 </div>

                 <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white via-white to-transparent shrink-0 z-20">
                    <Button onClick={() => setPayDialogOpen(true)} className="w-full h-12 bg-[#5f259f] text-white font-black rounded-xl uppercase tracking-tighter text-sm italic shadow-lg active:scale-95 transition-all">Manual Entry Audit</Button>
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
                              <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="w-full h-12 rounded-xl bg-slate-50 border border-slate-100 px-3 text-[11px] font-black text-slate-700 focus:outline-none uppercase" />
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

  // Admin View
  const total = records.reduce((acc, r) => acc + (r.amount || 0), 0);
  const cashTotal = records.filter(r => r.payMode === 'cash').reduce((acc, r) => acc + (r.amount || 0), 0);
  const onlineTotal = records.filter(r => r.payMode !== 'cash').reduce((acc, r) => acc + (r.amount || 0), 0);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-slate-900 flex items-center justify-center shadow-lg"><Wallet className="text-white h-6 w-6" /></div>
          <div><h1 className="text-3xl font-extrabold tracking-tight text-[#5f259f] uppercase italic">Recovery Intelligence</h1><p className="text-muted-foreground font-medium">Global session auditing matrix.</p></div>
        </div>
        <div className="flex items-center gap-3">
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-11 w-44 glass-card border-none shadow-sm font-bold text-[#5f259f]" />
          <Button onClick={handleSearch} className="bg-[#5f259f] text-white h-11 px-6 shadow-lg" disabled={loading}>{loading ? "Syncing..." : "Sync Matrix"}</Button>
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
                <th className="p-5 text-[10px] uppercase font-black text-slate-500 text-right">Total Credit</th>
                <th className="p-5 text-[10px] uppercase font-black text-slate-500 text-right">Late Fee</th>
                <th className="p-5 text-[10px] uppercase font-black text-slate-500">Mode</th>
                <th className="p-5 text-[10px] uppercase font-black text-slate-500">Verify ID</th>
                <th className="p-5 text-[10px] uppercase font-black text-slate-500 text-center">Audit</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => (
                <tr key={r.id} className="border-b border-slate-50 hover/bg-slate-50/50">
                  <td className="p-5 text-xs font-black text-slate-400">#{String(i+1).padStart(2,'0')}</td>
                  <td className="p-5"><div className="flex flex-col"><span className="text-sm font-black text-slate-900 uppercase italic">{r.memberName}</span><span className="text-[10px] font-bold text-primary uppercase">{r.accountNo}</span></div></td>
                  <td className="p-5 text-right font-black text-emerald-600 italic text-lg">{formatCurrency(r.amount)}</td>
                  <td className="p-5 text-right font-black text-orange-500 italic text-sm">{formatCurrency(r.lateFee || 0)}</td>
                  <td className="p-5"><Badge className="bg-slate-100 text-slate-600 border-none font-black text-[9px] uppercase tracking-widest">{r.payMode}</Badge></td>
                  <td className="p-5"><span className="text-[10px] font-black text-indigo-500 uppercase tracking-tighter">{r.digiPayer || '—'}</span></td>
                  <td className="p-5 text-center"><Badge variant="outline" className="text-slate-400 text-[9px] font-black uppercase">{r.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default DailyCollection;
