import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, doc, getDoc, updateDoc, setDoc, addDoc, getDocs } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { useLine } from "@/contexts/LineContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { 
  Calculator, IndianRupee, Banknote, Search, Scale, FileText, Info, Edit2, Trash2, X, Check
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { toast as sonnerToast } from "sonner";
import { logActivity } from "@/lib/audit";

interface DailyReconciliationProps {
  targetDate?: string;
  lineId?: string | null;
}

const DailyReconciliation = ({ targetDate, lineId: propLineId }: DailyReconciliationProps) => {
  const { userData } = useAuth();
  const { selectedLineId: contextLineId } = useLine();
  const selectedLineId = propLineId !== undefined ? propLineId : contextLineId;
  const [closureStats, setClosureStats] = useState({ 
    openingBalance: 0, 
    agentCol: 0, 
    adminCol: 0, 
    agentDisburse: 0, 
    adminDisburse: 0, 
    docCharges: 0, 
    expenses: 0, 
    penalties: 0, 
    extraCol: 0, 
    agentExpenses: 0, 
    adminExpenses: 0 
  });
  const [dailyExpenseLogs, setDailyExpenseLogs] = useState<any[]>([]);
  const [showExpenseDetails, setShowExpenseDetails] = useState(false);
  const [isSettingOpening, setIsSettingOpening] = useState(false);
  const [isAddingExpense, setIsAddingExpense] = useState(false);
  const [openingInput, setOpeningInput] = useState("");
  const [expenseInput, setExpenseInput] = useState({ amount: "", note: "" });
  const [editingExpense, setEditingExpense] = useState<any>(null);
  const [editInput, setEditInput] = useState({ amount: "", note: "" });

  const effectiveDate = targetDate || new Date().toISOString().split("T")[0];

  useEffect(() => {
    if (!userData) return;

    // Fetch Admin IDs for breakdown
    const fetchAdmins = async () => {
      const q = query(collection(db, "users"), where("role", "in", ["admin", "super_admin"]));
      const snap = await getDocs(q);
      return new Set(snap.docs.map(d => d.id));
    };

    let unsubscribePostings: any;
    let unsubscribeExpenses: any;
    let unsubscribeExpLog: any;

    fetchAdmins().then(adminIdsSet => {
      // 1. Postings Listener
      let postRef: any = collection(db, "postings");
      postRef = query(postRef, where("date", "==", effectiveDate));
      if (selectedLineId) postRef = query(postRef, where("lineId", "==", selectedLineId));

      unsubscribePostings = onSnapshot(postRef, (snapshot) => {
        let agCol = 0; let adCol = 0; let agDis = 0; let adDis = 0;
        let dtDocCharge = 0; let dtPenalties = 0; let dtExtra = 0;

        snapshot.forEach(d => {
          const data = d.data();
          const amt = data.amount || 0;
          
          if (data.status === "disbursement") {
            if (adminIdsSet.has(data.collectedById)) adDis += amt;
            else agDis += amt;
          } else if (data.status === "charge") {
            dtDocCharge += amt;
          } else if (data.status === "other") {
            dtExtra += amt;
          } else {
            if (adminIdsSet.has(data.collectedById)) adCol += amt;
            else agCol += amt;
          }
          
          dtDocCharge += (data.documentCharge || 0);
          dtPenalties += (data.penaltyAmount || 0);
          dtExtra += (data.extraAmount || 0);
        });

        setClosureStats(p => ({ 
          ...p, 
          agentCol: agCol, 
          adminCol: adCol,
          agentDisburse: agDis,
          adminDisburse: adDis,
          docCharges: dtDocCharge,
          penalties: dtPenalties,
          extraCol: dtExtra
        }));
      });

      // 2. Summary Listener
      let summRef: any = collection(db, "day_summaries");
      summRef = query(summRef, where("date", "==", effectiveDate));
      if (selectedLineId) summRef = query(summRef, where("lineId", "==", selectedLineId));

      unsubscribeExpenses = onSnapshot(summRef, (snapshot) => {
        let totalExp = 0;
        let totalInflow = 0;
        let totalOpening = 0;
        snapshot.forEach(d => {
          const summ = d.data();
          if (userData.role !== 'agent') {
            totalExp += (summ.expenses || 0);
            totalInflow += (summ.manualInflows || 0);
          }
          totalOpening += (summ.openingBalance || 0);
        });
        setClosureStats(p => ({ ...p, expenses: totalExp, manualInflows: totalInflow, openingBalance: totalOpening }));
      });

      // 3. Expense Log Listener
      let expLogRef: any = collection(db, "expenses_log");
      expLogRef = query(expLogRef, where("date", "==", effectiveDate));
      if (selectedLineId) expLogRef = query(expLogRef, where("lineId", "==", selectedLineId));
      if (userData.role === 'agent') expLogRef = query(expLogRef, where("collectedById", "==", userData.uid));

      unsubscribeExpLog = onSnapshot(expLogRef, (snapshot) => {
        const logs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        let agentExp = 0;
        let adminExp = 0;
        let agentInflow = 0;
        let adminInflow = 0;
        let personalTotalExp = 0;
        let personalTotalInflow = 0;

        logs.forEach((log: any) => {
          const amt = log.amount || 0;
          const isInflow = log.type === 'inflow';
          const isAdmin = log.userRole === 'super_admin' || log.userRole === 'admin' || adminIdsSet.has(log.collectedById);

          if (isAdmin) {
            if (isInflow) adminInflow += amt;
            else adminExp += amt;
          } else {
            if (isInflow) agentInflow += amt;
            else agentExp += amt;
          }

          if (log.collectedById === userData.uid) {
            if (isInflow) personalTotalInflow += amt;
            else personalTotalExp += amt;
          }
        });

        setClosureStats(p => {
          const updated = {
            ...p,
            agentExpenses: agentExp,
            adminExpenses: adminExp
          };
          if (userData.role === 'agent') {
            updated.expenses = personalTotalExp;
            updated.manualInflows = personalTotalInflow;
          } else {
            // For admin/partner, manualInflows is already computed from day_summaries
            // but we can also set adminExpenses / agentExpenses
          }
          return updated;
        });
        setDailyExpenseLogs(logs);
      });
      
      // Let's complete the callback
      });

    return () => {
      if (unsubscribePostings) unsubscribePostings();
      if (unsubscribeExpenses) unsubscribeExpenses();
      if (unsubscribeExpLog) unsubscribeExpLog();
    };
  }, [userData, effectiveDate, selectedLineId]);

  const handleSetOpening = async () => {
    if (!openingInput || isNaN(parseFloat(openingInput))) return;
    try {
      const docId = `${effectiveDate}_${selectedLineId || 'global'}`;
      const summaryRef = doc(db, "day_summaries", docId);
      const snap = await getDoc(summaryRef);
      if (snap.exists()) {
        await updateDoc(summaryRef, { openingBalance: parseFloat(openingInput) });
      } else {
        await setDoc(summaryRef, {
          openingBalance: parseFloat(openingInput),
          date: effectiveDate,
          lineId: selectedLineId || 'global',
          expenses: 0
        });
      }
      sonnerToast.success("Opening Balance Updated");
      setIsSettingOpening(false);
      setOpeningInput("");
    } catch (err) {
      console.error("Set opening error:", err);
    }
  };

  const handleAddExpense = async () => {
    if (!expenseInput.amount || isNaN(parseFloat(expenseInput.amount))) return;
    try {
      const amount = parseFloat(expenseInput.amount);
      const lineId = selectedLineId || 'global';
      const txType = expenseInput.type || 'outflow';
      
      await addDoc(collection(db, "expenses_log"), {
        amount,
        type: txType,
        note: expenseInput.note || (txType === 'inflow' ? "Manual Inflow" : "Daily Expense"),
        date: effectiveDate,
        lineId,
        collectedById: userData?.uid,
        collectedByName: userData?.name,
        userRole: userData?.role,
        createdAt: new Date().toISOString()
      });

      const summaryId = `${effectiveDate}_${lineId}`;
      const summaryRef = doc(db, "day_summaries", summaryId);
      const summSnap = await getDoc(summaryRef);
      
      if (summSnap.exists()) {
        const updateData: any = {};
        if (txType === 'inflow') {
          updateData.manualInflows = (summSnap.data().manualInflows || 0) + amount;
        } else {
          updateData.expenses = (summSnap.data().expenses || 0) + amount;
        }
        await updateDoc(summaryRef, updateData);
      } else {
        await setDoc(summaryRef, { 
          expenses: txType === 'outflow' ? amount : 0, 
          manualInflows: txType === 'inflow' ? amount : 0, 
          date: effectiveDate, 
          lineId, 
          openingBalance: 0 
        });
      }

      if (userData) {
        logActivity(userData.uid, userData.name, userData.role, "EXPENSE_ADD", `Recorded ${txType}: ${formatCurrency(amount)} - ${expenseInput.note}`, lineId);
      }

      sonnerToast.success(txType === 'inflow' ? "Inflow Recorded" : "Expense Recorded");
      setIsAddingExpense(false);
      setExpenseInput({ amount: "", note: "", type: "outflow" });
    } catch (err) {
      console.error("Add expense error:", err);
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
      
      await updateDoc(doc(db, "expenses_log", editingExpense.id), {
        amount: newAmount,
        note: editInput.note
      });

      const summaryId = `${editingExpense.date || effectiveDate}_${lineId}`;
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

      sonnerToast.success("Transaction Updated");
      setEditingExpense(null);
    } catch (err) {
      console.error("Update expense error:", err);
      sonnerToast.error("Update failed");
    }
  };

  const handleDeleteExpense = async (log: any) => {
    if (!window.confirm("Are you sure you want to delete this record?")) return;
    try {
      const lineId = log.lineId || 'global';
      const txType = log.type || 'outflow';
      const amount = log.amount || 0;
      
      await deleteDoc(doc(db, "expenses_log", log.id));

      const summaryId = `${log.date || effectiveDate}_${lineId}`;
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

      sonnerToast.success("Record Deleted");
    } catch (err) {
      console.error("Delete expense error:", err);
      sonnerToast.error("Deletion failed");
    }
  };

  const netFlow = (closureStats.agentCol + closureStats.adminCol + closureStats.docCharges + closureStats.penalties + closureStats.extraCol + (closureStats.manualInflows || 0) - closureStats.agentDisburse - closureStats.adminDisburse - closureStats.expenses);
  const closingCash = closureStats.openingBalance + netFlow;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter flex items-center gap-2">
          <Calculator className="h-5 w-5 text-accent" />
          Daily Shift Reconciliation
        </h3>
        <div className="flex items-center gap-3 flex-wrap justify-center sm:justify-end">
          {isSettingOpening ? (
            <div className="flex items-center gap-2">
              <Input 
                type="text"
                inputMode="decimal"
                placeholder="Opening Balance" 
                value={openingInput}
                onChange={e => setOpeningInput(e.target.value)}
                className="h-8 w-32 text-xs font-bold rounded-lg border-slate-200"
              />
              <Button onClick={handleSetOpening} className="h-8 px-3 bg-emerald-500 text-white font-black text-[9px] uppercase">Save</Button>
              <Button onClick={() => setIsSettingOpening(false)} variant="ghost" className="h-8 px-2 text-slate-400">Cancel</Button>
            </div>
          ) : isAddingExpense ? (
            <div className="flex items-center gap-2">
              <select
                value={expenseInput.type || "outflow"}
                onChange={e => setExpenseInput(prev => ({ ...prev, type: e.target.value }))}
                className="h-8 px-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg text-[10px] font-bold text-slate-700 dark:text-slate-250 outline-none shadow-sm focus:border-accent"
              >
                <option value="outflow">- Outflow / Expense</option>
                <option value="inflow">+ Inflow / Income</option>
              </select>
              <Input 
                type="text"
                inputMode="decimal"
                placeholder="Amount" 
                value={expenseInput.amount}
                onChange={e => setExpenseInput(prev => ({ ...prev, amount: e.target.value }))}
                className="h-8 w-20 text-xs font-bold rounded-lg border-slate-200 dark:border-slate-800"
              />
              <Input 
                placeholder="Note..." 
                value={expenseInput.note}
                onChange={e => setExpenseInput(prev => ({ ...prev, note: e.target.value }))}
                className="h-8 w-28 text-xs font-bold rounded-lg border-slate-200 dark:border-slate-800"
              />
              <Button 
                onClick={handleAddExpense} 
                className={`h-8 px-3 text-white font-black text-[9px] uppercase transition-all ${
                  expenseInput.type === "inflow" 
                    ? "bg-emerald-600 hover:bg-emerald-700" 
                    : "bg-rose-500 hover:bg-rose-600"
                }`}
              >
                {expenseInput.type === "inflow" ? "Add" : "Record"}
              </Button>
              <Button onClick={() => setIsAddingExpense(false)} variant="ghost" className="h-8 px-2 text-slate-400">Cancel</Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {(userData?.role === "super_admin" || userData?.role === "admin") && (
                <Button onClick={() => setIsSettingOpening(true)} variant="outline" className="h-8 border-slate-200 dark:border-slate-800 font-black text-[9px] uppercase tracking-widest bg-white dark:bg-slate-850 dark:text-white">
                  Set Opening Balance
                </Button>
              )}
              <Button onClick={() => setIsAddingExpense(true)} variant="outline" className="h-8 border-rose-100 text-rose-500 font-black text-[9px] uppercase tracking-widest bg-rose-50/50 hover:bg-rose-55 dark:bg-rose-950/20 dark:hover:bg-rose-950/30">
                Add Transaction
              </Button>
            </div>
          )}
          <Badge className="bg-slate-900 text-white border-none text-[8px] font-black uppercase tracking-widest px-3 py-1">
            Live Balance Audit
          </Badge>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="glass-card border-none shadow-xl p-6 relative overflow-hidden group">
           <div className="absolute -right-4 -top-4 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity">
              <IndianRupee size={80} />
           </div>
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Inflow Breakdown</p>
           <div className="mt-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase italic tracking-tighter">Opening Balance</span>
                <span className="text-sm font-black text-slate-900">{formatCurrency(closureStats.openingBalance)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Agent Collection</span>
                <span className="text-sm font-black text-emerald-600">+{formatCurrency(closureStats.agentCol)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Admin Collection</span>
                <span className="text-sm font-black text-indigo-600">+{formatCurrency(closureStats.adminCol)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Doc Charges</span>
                <span className="text-sm font-black text-emerald-500">+{formatCurrency(closureStats.docCharges)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Penalty Fees</span>
                <span className="text-sm font-black text-rose-500">+{formatCurrency(closureStats.penalties)}</span>
              </div>
               <div className="flex justify-between items-center">
                 <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Extra Collections</span>
                 <span className="text-sm font-black text-indigo-500">+{formatCurrency(closureStats.extraCol)}</span>
               </div>
               <div className="flex justify-between items-center border-t border-slate-100 dark:border-slate-800/40 pt-2 mt-2">
                 <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Other Inflows</span>
                 <span className="text-sm font-black text-emerald-700 dark:text-emerald-400">+{formatCurrency(closureStats.manualInflows)}</span>
               </div>
           </div>
        </Card>

         <Card className="glass-card border-none shadow-xl p-6 relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity">
               <Banknote size={80} />
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Outflow & Logistics</p>
            <div className="mt-4 space-y-3">
               <div className="flex justify-between items-center">
                 <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Agent Payments</span>
                 <span className="text-sm font-black text-rose-500">-{formatCurrency(closureStats.agentDisburse)}</span>
               </div>
               <div className="flex justify-between items-center">
                 <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Admin Payments</span>
                 <span className="text-sm font-black text-rose-500">-{formatCurrency(closureStats.adminDisburse)}</span>
               </div>
               <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Agent Expenses</span>
                  <span className="text-sm font-black text-rose-300">-{formatCurrency(closureStats.agentExpenses)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Admin Expenses</span>
                  <span className="text-sm font-black text-rose-300">-{formatCurrency(closureStats.adminExpenses)}</span>
                </div>
                <div onClick={() => setShowExpenseDetails(true)} className="flex justify-between items-center cursor-pointer hover:bg-slate-50 p-1 -m-1 rounded-lg transition-colors border border-transparent hover:border-slate-100">
                  <span className="text-[10px] font-black text-slate-900 uppercase tracking-tighter flex items-center gap-1">
                    Daily Expenses <Search size={10} className="text-slate-400" />
                  </span>
                  <span className="text-sm font-black text-rose-400">-{formatCurrency(closureStats.expenses)}</span>
                </div>
               <div className="pt-2 border-t border-slate-50 flex justify-between items-center">
                 <span className="text-[10px] font-black text-slate-900 uppercase">Net Flow</span>
                 <span className={`text-md font-black ${ netFlow >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {formatCurrency(netFlow)}
                 </span>
               </div>
            </div>
         </Card>

        <Card className="md:col-span-2 glass-card border-none shadow-2xl bg-slate-900 text-white p-8 relative overflow-hidden flex flex-col justify-center">
           <div className="absolute right-0 top-0 h-full w-1/2 bg-gradient-to-l from-white/5 to-transparent pointer-events-none" />
           <div className="flex items-center justify-between relative z-10">
              <div className="flex-1">
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-2">Net Closing Cash</p>
                 <h2 className={`text-5xl font-black tracking-tighter ${ closingCash >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {formatCurrency(closingCash)}
                 </h2>
                <div className="flex items-center gap-3 mt-4">
                   <Badge className="bg-white/10 text-white border-none font-black text-[9px] uppercase tracking-widest px-3">
                      Verified Audit
                   </Badge>
                   <span className="text-[10px] font-bold text-slate-500 italic uppercase">Refreshed: {new Date().toLocaleTimeString()}</span>
                </div>
              </div>
              <div className="h-20 w-20 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center">
                 <Scale className={`h-10 w-10 ${ closingCash >= 0 ? 'text-emerald-400' : 'text-rose-400'}`} />
              </div>
           </div>
        </Card>
      </div>

      <Dialog open={showExpenseDetails} onOpenChange={setShowExpenseDetails}>
        <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden border-none shadow-2xl glass-card">
          <div className="bg-slate-900 p-6 text-white">
             <DialogTitle className="text-xl font-black italic uppercase tracking-tight flex items-center gap-2">
                <FileText size={20} className="text-accent" />
                Transaction Registry
             </DialogTitle>
             <DialogDescription className="text-slate-400 text-xs mt-1">
                Detailed expenditure and inflow logs for {formatDate(effectiveDate)}
             </DialogDescription>
          </div>
          <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
             {(() => {
                const sortedLogs = [...dailyExpenseLogs].sort((a, b) => {
                  const timeA = a.createdAt || a.timestamp || "";
                  const timeB = b.createdAt || b.timestamp || "";
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
                    <div className="py-10 text-center space-y-3">
                       <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-300">
                          <Info size={24} />
                       </div>
                       <p className="text-xs font-black text-slate-400 uppercase tracking-widest">No transactions recorded for this session</p>
                    </div>
                  );
                }

                return displayLogs.map((log: any) => (
                  <div key={log.id} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800/60 flex justify-between items-start group hover:bg-white dark:hover:bg-slate-800 hover:shadow-md transition-all">
                   {editingExpense?.id === log.id ? (
                     <div className="flex-1 space-y-3">
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
                         <Button onClick={handleUpdateExpense} size="sm" className="h-7 bg-emerald-500 text-white text-[9px] uppercase font-black"><Check size={12} className="mr-1" /> Update</Button>
                       </div>
                     </div>
                   ) : (
                     <>
                       <div className="space-y-1">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{log.collectedByName || "System"}</p>
                          <h4 className="font-black text-slate-900 dark:text-slate-100 uppercase text-xs">{log.note}</h4>
                          <p className="text-[8px] font-bold text-slate-400">{new Date(log.createdAt).toLocaleTimeString()}</p>
                       </div>
                       <div className="text-right">
                          <div className="flex items-center gap-2 justify-end mb-1">
                             {(userData?.role === 'super_admin' || userData?.role === 'admin') && (
                               <div className="flex items-center gap-0.5">
                                 <Button 
                                   variant="ghost" 
                                   size="icon" 
                                   className="h-6 w-6 text-slate-400 hover:text-indigo-600 hover:bg-slate-100/50"
                                   onClick={() => {
                                     setEditingExpense(log);
                                     setEditInput({ amount: String(log.amount), note: log.note });
                                   }}
                                 >
                                   <Edit2 size={12} />
                                 </Button>
                                 <Button 
                                   variant="ghost" 
                                   size="icon" 
                                   className="h-6 w-6 text-slate-400 hover:text-rose-600 hover:bg-slate-100/50"
                                   onClick={() => handleDeleteExpense(log)}
                                 >
                                   <Trash2 size={12} />
                                 </Button>
                               </div>
                             )}
                             <p className={`text-md font-black ${log.type === "inflow" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`}>
                               {log.type === "inflow" ? "+" : "-"}{formatCurrency(log.amount)}
                             </p>
                             <p className="text-[9px] font-black text-slate-450 dark:text-slate-500 mt-0.5 text-right">
                               Bal: {log.runningBalance >= 0 ? "+" : ""}{formatCurrency(log.runningBalance)}
                             </p>
                          </div>
                          <div className="flex items-center gap-1 justify-end flex-wrap">
                            <Badge className="text-[7px] bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-350 border-none font-black uppercase px-1 py-0.5 leading-none">
                               {log.userRole === 'super_admin' ? 'Admin' : 'Agent'}
                            </Badge>
                            <Badge className={`text-[7px] border-none font-black uppercase px-1 py-0.5 leading-none ${log.type === "inflow" ? "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400" : "bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400"}`}>
                               {log.type === "inflow" ? "Inflow" : "Outflow"}
                            </Badge>
                          </div>
                       </div>
                     </>
                   )}
                </div>
                ));
             })()}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DailyReconciliation;
