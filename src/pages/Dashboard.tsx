import { toast as sonnerToast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useLine } from "@/contexts/LineContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Users, IndianRupee, FileText, TrendingUp, UserCog, Wallet, 
  ArrowUpRight, BarChart3, Target, Search, Plus, ArrowRightLeft, 
  LayoutDashboard, MapPin, ArrowRight, AlertCircle, Calendar,
  ArrowDownRight, Receipt, Banknote, Calculator, Scale, Database
} from "lucide-react";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, orderBy, limit, DocumentData, Timestamp, onSnapshot, updateDoc, doc, addDoc, runTransaction, setDoc, getDoc } from "firebase/firestore";
import { logActivity, AuditAction } from "@/lib/audit";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const StatCard = ({ title, value, icon, color, trend, index }: { title: string; value: string | number; icon: React.ReactNode; color: string; trend?: string; index: number }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: index * 0.1 }}
  >
    <Card className="glass-card hover:shadow-2xl transition-all duration-300 group">
      <CardContent className="flex items-center gap-4 p-6">
        <div className={`flex h-14 w-14 items-center justify-center rounded-xl shadow-lg transition-transform group-hover:scale-110 ${color}`}>
          {icon}
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-2xl font-bold tracking-tight">{value}</h3>
            {trend && (
              <span className="text-xs font-medium text-emerald-500 flex items-center gap-0.5">
                <ArrowUpRight className="h-3 w-3" /> {trend}
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  </motion.div>
);

const Dashboard = () => {
  const { userData } = useAuth();
  const { selectedLineId, setSelectedLineId, lines } = useLine();
  const [logs, setLogs] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [closureStats, setClosureStats] = useState({ openingBalance: 0, agentCol: 0, adminCol: 0, agentDisburse: 0, adminDisburse: 0, docCharges: 0, expenses: 0 });
  const [stats, setStats] = useState({
    totalAdmins: 0,
    totalAgents: 0,
    totalAccounts: 0,
    totalCollection: 0,
    totalSpent: 0,
    projectedProfit: 0,
    totalBalance: 0,
    dailyCollection: 0,
    pendingAmount: 0,
    assignedAccounts: 0,
    todayCollection: 0,
    pendingAccounts: 0,
  });

  const [timeFilter, setTimeFilter] = useState("all");
  const [chartData, setChartData] = useState<any[]>([]);
  const [recentPostings, setRecentPostings] = useState<any[]>([]);
  const [streamDateFilter, setStreamDateFilter] = useState(new Date().toISOString().split("T")[0]);
  const [showAllStream, setShowAllStream] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date().toISOString().split("T")[0]);
  const [isSettingOpening, setIsSettingOpening] = useState(false);
  const [isAddingExpense, setIsAddingExpense] = useState(false);
  const [openingInput, setOpeningInput] = useState("");
  const [expenseInput, setExpenseInput] = useState({ amount: "", note: "" });

  // Date Auto-Refresh logic - Removed forced auto-refresh to allow manual selection
  // The initial date is set on component mount

  useEffect(() => {
    let unsubscribeAccounts: (() => void) | null = null;
    let unsubscribePostings: (() => void) | null = null;
    let unsubscribeLogs: (() => void) | null = null;

    const today = new Date();
    if (!currentDate || isNaN(new Date(currentDate).getTime())) {
       return;
    }

    const todayStr = currentDate;
    const dateObj = new Date(currentDate);
    const startOfMonth = new Date(dateObj.getFullYear(), dateObj.getMonth(), 1).toISOString().split("T")[0];
    const startOfYear = new Date(dateObj.getFullYear(), 0, 1).toISOString().split("T")[0];
    
    setClosureStats({ openingBalance: 0, agentCol: 0, adminCol: 0, agentDisburse: 0, adminDisburse: 0, docCharges: 0, expenses: 0 });

    const setupListeners = async () => {
      if (!userData) return;
      setLoading(true);

      const activeLineId = selectedLineId || (userData.role === 'agent' ? (userData.lineId || 'none') : null);

      if (!activeLineId && userData.role !== 'super_admin') {
         setLoading(false);
         return;
      }

      if (userData.role === "super_admin") {
        unsubscribeLogs = onSnapshot(query(collection(db, "audit_logs"), orderBy("timestamp", "desc"), limit(50)), (snapshot) => {
           setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any })));
        });

        // Pre-fetch admin IDs for attribution
        const adminUsersSnap = await getDocs(query(collection(db, "users"), where("role", "in", ["super_admin", "admin"])));
        const adminIdsSet = new Set(adminUsersSnap.docs.map(d => d.id));

        let accountsRef: any = collection(db, "accounts");
        if (activeLineId) accountsRef = query(accountsRef, where("lineId", "==", activeLineId));

        unsubscribeAccounts = onSnapshot(accountsRef, (snapshot) => {
          let spent = 0; 
          let balance = 0; 
          let expected = 0;
          let totalAcc = 0;
          let dtAgDisburse = 0; 
          let dtAdDisburse = 0; 
          let dtDocCharge = 0;
          
          snapshot.forEach(d => {
            const acc = d.data();
            totalAcc++;
            const isMatch = timeFilter === "all" || (timeFilter === "month" && acc.startDate >= startOfMonth) || (timeFilter === "year" && acc.startDate >= startOfYear);
            if (isMatch) {
              spent += (acc.loanAmount || 0);
              balance += (acc.balance || 0);
              expected += (acc.totalAmount || 0);
            }
          });
          
          setStats(prev => ({
            ...prev,
            totalAccounts: totalAcc,
            totalSpent: spent,
            totalBalance: balance,
            projectedProfit: expected - spent,
          }));
        });

        let postingsRef: any = collection(db, "postings");
        if (activeLineId) postingsRef = query(postingsRef, where("lineId", "==", activeLineId));

        unsubscribePostings = onSnapshot(postingsRef, (snapshot) => {
          let totalCol = 0; let agCol = 0; let adCol = 0; 
          let agDis = 0; let adDis = 0; let dtDocCharge = 0;
          const chartCol: Record<string, number> = {};
          snapshot.forEach(d => {
            const data = d.data();
            const isMatch = timeFilter === "all" || (timeFilter === "month" && data.date >= startOfMonth) || (timeFilter === "year" && data.date >= startOfYear);
            if (isMatch) totalCol += (data.amount || 0);
            
            if (data.date === todayStr) {
               const amt = data.amount || 0;
                if (data.status === 'disbursement') {
                  if (data.collectedByRole === 'super_admin' || data.collectedByRole === 'admin') adDis += amt;
                  else agDis += amt;
                } else if (data.status === 'charge') {
                  dtDocCharge += amt;
                } else {
                  // Collection
                  if (data.collectedByRole === 'super_admin' || data.collectedByRole === 'admin') adCol += amt;
                  else if (data.collectedByRole === 'agent') agCol += amt;
                  else {
                    if (adminIdsSet.has(data.collectedById)) adCol += amt;
                    else agCol += amt;
                  }
                }
            }
            
            const monthKey = data.date?.substring(0, 7) || "Unknown";
            chartCol[monthKey] = (chartCol[monthKey] || 0) + (data.amount || 0);
          });
          setClosureStats(p => ({ 
            ...p, 
            agentCol: agCol, 
            adminCol: adCol,
            agentDisburse: agDis,
            adminDisburse: adDis,
            docCharges: dtDocCharge
          }));
          const recent = snapshot.docs.map(d => ({ id: d.id, ...d.data() as any as any })).sort((a: any, b: any) => (b.date || "").localeCompare(a.date || "")).slice(0, 200);
          setRecentPostings(recent);
          const allKeys = Array.from(new Set([...Object.keys(chartCol)]));
          const formatted = allKeys.sort().slice(-12).map(k => ({ date: k, collected: chartCol[k] || 0, invested: 0 }));
          setChartData(formatted);
          setStats(prev => ({ ...prev, totalCollection: totalCol }));
          setLoading(false);
        }, (err) => {
          console.error("Dashboard postings fail:", err);
          setLoading(false);
        });

        // Fetch Expenses from day_summaries
        let expRef: any = collection(db, "day_summaries");
        expRef = query(expRef, where("date", "==", todayStr));
        if (activeLineId) expRef = query(expRef, where("lineId", "==", activeLineId));

        const unsubscribeExpenses = onSnapshot(expRef, (snapshot) => {
          let totalExp = 0;
          let totalOpening = 0;
          snapshot.forEach(d => {
            const summ = d.data();
            totalExp += (summ.expenses || 0);
            totalOpening += (summ.openingBalance || 0);
          });
          setClosureStats(p => ({ ...p, expenses: totalExp, openingBalance: totalOpening }));
        });

      } else if (userData.role === "admin") {
        let accountsRef: any = query(collection(db, "accounts"), where("adminId", "==", userData.uid));
        if (activeLineId) accountsRef = query(accountsRef, where("lineId", "==", activeLineId));

        unsubscribeAccounts = onSnapshot(accountsRef, (snapshot) => {
          let pending = 0;
          snapshot.forEach(d => pending += d.data().balance || 0);
          
          getDocs(query(collection(db, "users"), where("role", "==", "agent"), where("adminId", "==", userData.uid))).then(ags => {
            setStats(prev => ({ ...prev, totalAgents: ags.size, totalAccounts: snapshot.size, pendingAmount: pending }));
          });
        }, (err) => {
          console.error("Admin accounts fail:", err);
          setLoading(false);
        });

        let postingsRef : any = query(collection(db, "postings"), where("adminId", "==", userData.uid));
        if (activeLineId) postingsRef = query(postingsRef, where("lineId", "==", activeLineId));

        unsubscribePostings = onSnapshot(postingsRef, (snapshot) => {
           let daily = 0;
           snapshot.forEach(d => { if (d.data().date === todayStr) daily += d.data().amount || 0; });
           const recent = snapshot.docs.map(d => ({ id: d.id, ...d.data() as any })).sort((a: any, b: any) => (b.date || "").localeCompare(a.date || "")).slice(0, 200);
           setRecentPostings(recent);
           setStats(prev => ({ ...prev, dailyCollection: daily }));
           setLoading(false);
        }, (err) => {
          console.error("Admin postings fail:", err);
          setLoading(false);
        });

      } else if (userData.role === "agent") {
        let assignedLineIds = userData.lineIds || (userData.lineId ? [userData.lineId] : []);
        if (assignedLineIds.length === 0) {
           console.error("Agent lacks line assignment");
           setLoading(false);
           return;
        }

        let accQuery;
        let postQuery;

        if (selectedLineId) {
          accQuery = query(collection(db, "accounts"), where("lineId", "==", selectedLineId));
          postQuery = query(collection(db, "postings"), where("lineId", "==", selectedLineId));
        } else {
          accQuery = query(collection(db, "accounts"), where("lineId", "in", assignedLineIds));
          postQuery = query(collection(db, "postings"), where("lineId", "in", assignedLineIds));
        }
        
        unsubscribeAccounts = onSnapshot(accQuery, (snapshot) => {
           let pendingCount = 0;
           snapshot.forEach(d => { if (d.data().balance > 0) pendingCount++; });
           setStats(prev => ({ ...prev, assignedAccounts: snapshot.size, pendingAccounts: pendingCount }));
        }, (err) => {
          console.error("Agent accounts fail:", err);
          setLoading(false);
        });

        unsubscribePostings = onSnapshot(postQuery, (snapshot) => {
           let todayCol = 0;
           snapshot.forEach(d => { if (d.data().date === todayStr) todayCol += d.data().amount || 0; });
           const recent = snapshot.docs.map(d => ({ id: d.id, ...d.data() as any })).sort((a: any, b: any) => (b.date || "").localeCompare(a.date || "")).slice(0, 200);
           setRecentPostings(recent);
           setStats(prev => ({ ...prev, todayCollection: todayCol }));
           setLoading(false);
        }, (err) => {
           console.error("Agent postings fail:", err);
           setLoading(false);
        });
      }
    };

    setupListeners();
    // Cleanup is handled inside setupListeners for super_admin or here for others
    return () => {
      if (unsubscribeAccounts) unsubscribeAccounts();
      if (unsubscribePostings) unsubscribePostings();
      if (unsubscribeLogs) unsubscribeLogs();
    };
  }, [userData, timeFilter, selectedLineId, currentDate]);
  
  const handleSetOpening = async () => {
    if (!openingInput || isNaN(parseFloat(openingInput))) return;
    try {
      const todayStr = currentDate;
      const docId = `${todayStr}_${selectedLineId || 'global'}`;
      const summaryRef = doc(db, "day_summaries", docId);
      
      const snap = await getDoc(summaryRef);
      if (snap.exists()) {
        await updateDoc(summaryRef, {
          openingBalance: parseFloat(openingInput)
        });
      } else {
        await setDoc(summaryRef, {
          openingBalance: parseFloat(openingInput),
          date: todayStr,
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
      const todayStr = currentDate;
      const amount = parseFloat(expenseInput.amount);
      const lineId = selectedLineId || 'global';
      
      // 1. Log the individual expense for audit
      await addDoc(collection(db, "expenses_log"), {
        amount,
        note: expenseInput.note || "Daily Expense",
        date: todayStr,
        lineId,
        userName: userData?.name,
        timestamp: new Date().toISOString()
      });

      // 2. Update aggregate in day_summaries
      const docId = `${todayStr}_${lineId}`;
      const summaryRef = doc(db, "day_summaries", docId);
      
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(summaryRef);
        if (!snap.exists()) {
          transaction.set(summaryRef, {
            expenses: amount,
            openingBalance: 0,
            date: todayStr,
            lineId
          });
        } else {
          const currentExp = snap.data().expenses || 0;
          transaction.update(summaryRef, {
            expenses: currentExp + amount
          });
        }
      });

      sonnerToast.success("Expense recorded successfully");
      setIsAddingExpense(false);
      setExpenseInput({ amount: "", note: "" });
      
      if (userData) {
        logActivity(
          userData.uid,
          userData.name,
          userData.role,
          "POSTING_CREATE", // Using a general action for financial entries
          `Recorded Expense: ₹${amount} (${expenseInput.note || 'No note'})`,
          selectedLineId
        );
      }
    } catch (err) {
      console.error("Add expense error:", err);
      sonnerToast.error("Failed to record expense");
    }
  };

  const activeLineName = lines.find(l => l.id === selectedLineId)?.name || "Full Portfolio";

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-slide-up pb-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-primary uppercase italic">
            Sridevi <span className="text-accent not-italic">Finance</span>
          </h1>
          <p className="text-muted-foreground font-medium flex items-center gap-2">
            <MapPin size={14} className="text-accent" /> {activeLineName} Overview
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {(userData?.role === "super_admin" || userData?.role === "admin") && (
            <Button 
              variant="outline" 
              onClick={() => {
                setSelectedLineId(null);
                localStorage.removeItem("lineSelectedOnce");
                window.location.reload();
              }}
              className="h-10 rounded-xl bg-white border-slate-200 text-slate-600 font-bold text-[10px] uppercase tracking-widest px-4 shadow-sm hover:bg-slate-50"
            >
              <ArrowRightLeft className="h-4 w-4 mr-2" /> Switch Logistics Line
            </Button>
          )}
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest shadow-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Neural Pulse Active
          </div>
          
          <div className="flex items-center gap-2 bg-white/50 backdrop-blur-sm border border-slate-200 rounded-xl px-3 py-1.5 shadow-sm">
            <Calendar className="h-4 w-4 text-slate-400" />
            <input 
              type="date" 
              value={currentDate}
              onChange={(e) => {
                setCurrentDate(e.target.value);
                setStreamDateFilter(e.target.value);
              }}
              className="bg-transparent border-none text-[11px] font-black uppercase tracking-widest focus:ring-0 text-slate-900 w-[130px]"
            />
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 px-2 text-[9px] font-black uppercase tracking-widest text-accent hover:bg-accent/10"
              onClick={() => {
                const today = new Date().toISOString().split("T")[0];
                setCurrentDate(today);
                setStreamDateFilter(today);
              }}
            >
              Today
            </Button>
          </div>
        </div>
      </div>

      {userData?.role === "super_admin" && (
        <div className="space-y-8">
          <Card className="glass-card border-none shadow-xl bg-gradient-to-br from-indigo-50 to-white relative overflow-hidden">
             <CardHeader className="pb-4">
                <CardTitle className="text-xl font-black uppercase text-indigo-900 tracking-widest italic flex items-center gap-2">
                  <Wallet size={20}/> Daily Closure Account
                </CardTitle>
             </CardHeader>
             <CardContent>
                 <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-6 text-center">
                   <div>
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Opening Bal</p>
                      <h4 className="text-xl font-black text-slate-600 mt-1">{formatCurrency(closureStats.openingBalance)}</h4>
                   </div>
                   <div>
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Agent Col</p>
                      <h4 className="text-xl font-black text-emerald-600 mt-1">+{formatCurrency(closureStats.agentCol)}</h4>
                   </div>
                   <div>
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Admin Col</p>
                      <h4 className="text-xl font-black text-indigo-600 mt-1">+{formatCurrency(closureStats.adminCol)}</h4>
                   </div>
                   <div>
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Agent Pay</p>
                      <h4 className="text-xl font-black text-rose-500 mt-1">-{formatCurrency(closureStats.agentDisburse)}</h4>
                   </div>
                   <div>
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Admin Pay</p>
                      <h4 className="text-xl font-black text-rose-600 mt-1">-{formatCurrency(closureStats.adminDisburse)}</h4>
                   </div>
                   <div>
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Doc Charges</p>
                      <h4 className="text-xl font-black text-emerald-500 mt-1">+{formatCurrency(closureStats.docCharges)}</h4>
                   </div>
                   <div>
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Expenses</p>
                      <h4 className="text-xl font-black text-rose-400 mt-1">-{formatCurrency(closureStats.expenses)}</h4>
                   </div>
                   <div className="border-l border-slate-200 pl-6">
                      <p className="text-[10px] font-black uppercase text-indigo-400 tracking-widest">Net Closing Cash</p>
                      <h4 className={`text-2xl font-black mt-1 ${closureStats.openingBalance + closureStats.agentCol + closureStats.adminCol + closureStats.docCharges - closureStats.agentDisburse - closureStats.adminDisburse - closureStats.expenses >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                        {formatCurrency(closureStats.openingBalance + closureStats.agentCol + closureStats.adminCol + closureStats.docCharges - closureStats.agentDisburse - closureStats.adminDisburse - closureStats.expenses)}
                      </h4>
                   </div>
                </div>
             </CardContent>
          </Card>
          
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <StatCard index={0} title="Portfolio Spent" value={formatCurrency(stats.totalSpent)} icon={<Target className="h-7 w-7 text-white" />} color="bg-slate-900" />
            <StatCard index={1} title="Total Recovered" value={formatCurrency(stats.totalCollection)} icon={<IndianRupee className="h-7 w-7 text-white" />} color="premium-gradient" />
            <StatCard index={2} title="Projected Yield" value={formatCurrency(stats.projectedProfit)} icon={<TrendingUp className="h-7 w-7 text-white" />} color="bg-emerald-600" />
            <StatCard index={3} title="Collectable Cap" value={formatCurrency(stats.totalBalance)} icon={<Wallet className="h-7 w-7 text-white" />} color="bg-amber-600" />
            <StatCard index={4} title="Active Workforce" value={`${stats.totalAdmins + stats.totalAgents} Personnel`} icon={<Users className="h-7 w-7 text-white" />} color="accent-gradient" />
          </div>

          {!selectedLineId && (
            <div className="space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Logistics Breakdown (Active Lines)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {lines.map((line, idx) => (
                  <motion.div
                    key={line.id}
                    whileHover={{ y: -5 }}
                    onClick={() => setSelectedLineId(line.id)}
                    className="cursor-pointer"
                  >
                    <Card className="glass-card hover:border-accent border-transparent transition-all p-6 group">
                      <div className="flex items-center justify-between mb-4">
                        <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center group-hover:bg-accent transition-colors">
                          <MapPin size={18} className="text-slate-500 group-hover:text-white" />
                        </div>
                        <Badge className="bg-emerald-50 text-emerald-600 border-none text-[8px] font-black uppercase">Line-{idx+1}</Badge>
                      </div>
                      <h4 className="text-lg font-black text-slate-800">{line.name}</h4>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Personnel Ops Active</p>
                      <div className="mt-4 pt-4 border-t border-slate-50 flex items-center justify-between">
                         <span className="text-[10px] font-black text-accent uppercase">View Matrix</span>
                         <ArrowRight size={14} className="text-slate-300 group-hover:text-accent group-hover:translate-x-1 transition-all" />
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {userData?.role === "admin" && (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard index={0} title="My Personnel" value={stats.totalAgents} icon={<Users className="h-7 w-7 text-white" />} color="premium-gradient" />
          <StatCard index={1} title="Managed Accounts" value={stats.totalAccounts} icon={<FileText className="h-7 w-7 text-white" />} color="accent-gradient" />
          <StatCard index={2} title="Collection Flow" value={formatCurrency(stats.dailyCollection)} icon={<Wallet className="h-7 w-7 text-white" />} color="premium-gradient" />
          <StatCard index={3} title="Oustanding Yield" value={formatCurrency(stats.pendingAmount)} icon={<TrendingUp className="h-7 w-7 text-white" />} color="accent-gradient" />
        </div>
      )}

      {userData?.role === "agent" && (
        <div className="space-y-10">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Account Officer</p>
              <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">{userData.name || "Personnel"}</h1>
            </div>
          </div>

          <div className="space-y-5">
            <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter">Your Assigned Lines</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {(userData.lineIds && userData.lineIds.length > 0 ? userData.lineIds : (userData.lineId ? [userData.lineId] : [])).map((lid, idx) => {
                const line = lines.find(l => l.id === lid);
                if (!line) return null;
                return (
                  <motion.div
                    key={line.id}
                    whileHover={{ y: -5 }}
                    onClick={() => {
                       setSelectedLineId(line.id);
                       window.location.href = "/daily-collection";
                    }}
                    className="cursor-pointer"
                  >
                    <Card className="glass-card hover:border-accent border-transparent transition-all p-6 group">
                      <div className="flex items-center justify-between mb-4">
                        <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center group-hover:bg-accent transition-colors">
                          <MapPin size={18} className="text-slate-500 group-hover:text-white" />
                        </div>
                        <Badge className="bg-emerald-50 text-emerald-600 border-none text-[8px] font-black uppercase">Active</Badge>
                      </div>
                      <h4 className="text-lg font-black text-slate-800">{line.name}</h4>
                      <div className="mt-4 pt-4 border-t border-slate-50 flex items-center justify-between">
                         <span className="text-[10px] font-black text-accent uppercase">Open Collections</span>
                         <ArrowRight size={14} className="text-slate-300 group-hover:text-accent group-hover:translate-x-1 transition-all" />
                      </div>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard index={0} title="Portfolio Registry" value={stats.assignedAccounts} icon={<FileText className="h-7 w-7 text-white" />} color="bg-slate-900" />
            <StatCard index={1} title="Recovery Today" value={formatCurrency(stats.todayCollection)} icon={<IndianRupee className="h-7 w-7 text-white" />} color="premium-gradient" />
            <StatCard index={2} title="Deficit Count" value={stats.pendingAccounts} icon={<AlertCircle size={24} className="text-white" />} color="bg-rose-600" />
          </div>
        </div>
      )}

      {/* Daily Shift Reconciliation - Focused Audit */}
      {(userData?.role === "super_admin" || userData?.role === "admin") && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter flex items-center gap-2">
              <Calculator className="h-5 w-5 text-accent" />
              Daily Shift Reconciliation
            </h3>
            <div className="flex items-center gap-3">
              {isSettingOpening ? (
                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4">
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
                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4">
                  <Input 
                    type="text"
                    inputMode="decimal"
                    placeholder="Amount" 
                    value={expenseInput.amount}
                    onChange={e => setExpenseInput(prev => ({ ...prev, amount: e.target.value }))}
                    className="h-8 w-24 text-xs font-bold rounded-lg border-slate-200"
                  />
                  <Input 
                    placeholder="Note..." 
                    value={expenseInput.note}
                    onChange={e => setExpenseInput(prev => ({ ...prev, note: e.target.value }))}
                    className="h-8 w-32 text-xs font-bold rounded-lg border-slate-200"
                  />
                  <Button onClick={handleAddExpense} className="h-8 px-3 bg-rose-500 text-white font-black text-[9px] uppercase">Record</Button>
                  <Button onClick={() => setIsAddingExpense(false)} variant="ghost" className="h-8 px-2 text-slate-400">Cancel</Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Button onClick={() => setIsSettingOpening(true)} variant="outline" className="h-8 border-slate-200 font-black text-[9px] uppercase tracking-widest bg-white">
                    Set Opening Balance
                  </Button>
                  <Button onClick={() => setIsAddingExpense(true)} variant="outline" className="h-8 border-rose-100 text-rose-500 font-black text-[9px] uppercase tracking-widest bg-rose-50/50 hover:bg-rose-50">
                    Add Expense
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
                     <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Daily Expenses</span>
                     <span className="text-sm font-black text-rose-400">-{formatCurrency(closureStats.expenses)}</span>
                   </div>
                   <div className="pt-2 border-t border-slate-50 flex justify-between items-center">
                     <span className="text-[10px] font-black text-slate-900 uppercase">Net Flow</span>
                     <span className={`text-md font-black ${ (closureStats.agentCol + closureStats.adminCol + closureStats.docCharges - closureStats.agentDisburse - closureStats.adminDisburse - closureStats.expenses) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {formatCurrency(closureStats.agentCol + closureStats.adminCol + closureStats.docCharges - closureStats.agentDisburse - closureStats.adminDisburse - closureStats.expenses)}
                     </span>
                   </div>
                </div>
             </Card>

            <Card className="md:col-span-2 glass-card border-none shadow-2xl bg-slate-900 text-white p-8 relative overflow-hidden flex flex-col justify-center">
               <div className="absolute right-0 top-0 h-full w-1/2 bg-gradient-to-l from-white/5 to-transparent pointer-events-none" />
               <div className="flex items-center justify-between relative z-10">
                  <div className="flex-1">
                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-2">Net Closing Cash</p>
                     <h2 className={`text-5xl font-black tracking-tighter ${ (closureStats.openingBalance + closureStats.agentCol + closureStats.adminCol + closureStats.docCharges - closureStats.agentDisburse - closureStats.adminDisburse - closureStats.expenses) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatCurrency(closureStats.openingBalance + closureStats.agentCol + closureStats.adminCol + closureStats.docCharges - closureStats.agentDisburse - closureStats.adminDisburse - closureStats.expenses)}
                     </h2>
                    <div className="flex items-center gap-3 mt-4">
                       <Badge className="bg-white/10 text-white border-none font-black text-[9px] uppercase tracking-widest px-3">
                          Verified Audit
                       </Badge>
                       <span className="text-[10px] font-bold text-slate-500 italic uppercase">Refreshed: {new Date().toLocaleTimeString()}</span>
                    </div>
                  </div>
                  <div className="h-20 w-20 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center">
                     <Scale className={`h-10 w-10 ${ (closureStats.openingBalance + closureStats.agentCol + closureStats.adminCol + closureStats.docCharges - closureStats.agentDisburse - closureStats.adminDisburse - closureStats.expenses) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`} />
                  </div>
               </div>
            </Card>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 glass-card border-none shadow-2xl relative overflow-hidden">
          <div className="absolute top-6 right-8 p-0 z-20">
             <Select value={timeFilter} onValueChange={setTimeFilter}>
                <SelectTrigger className="w-[140px] bg-slate-100/50 backdrop-blur-sm border-none font-black text-[9px] uppercase tracking-widest h-8 rounded-lg">
                   <SelectValue placeholder="Timeline" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-none shadow-2xl">
                   <SelectItem value="all">Full Timeline</SelectItem>
                   <SelectItem value="month">Monthly Audit</SelectItem>
                   <SelectItem value="year">Annual View</SelectItem>
                </SelectContent>
             </Select>
          </div>
          <CardHeader className="pb-8">
            <CardTitle className="text-2xl font-black flex items-center gap-2 uppercase tracking-tighter italic">
              <TrendingUp className="h-6 w-6 text-accent" />
              Dynamic Recovery Analytics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[350px] w-full">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 900, fill: '#94a3b8' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => `₹${v/1000}k`} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 20px 40px rgba(0,0,0,0.1)', padding: '16px' }}
                      itemStyle={{ fontWeight: 900, fontSize: '12px', textTransform: 'uppercase' }}
                    />
                    <Bar dataKey="collected" name="Recovered Amount" fill="#0f172a" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-slate-400 font-bold uppercase tracking-widest text-[10px]">
                  Initializing Telemetry Data...
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="md:col-span-1 space-y-6 flex flex-col h-full">
          {/* Recovery Intelligence Stream */}
          <Card className="flex-1 flex flex-col glass-card border-slate-200/60 overflow-hidden min-h-[450px]">
            <CardHeader className="border-b border-slate-100 pb-4 bg-slate-50/30">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-lg bg-slate-900 text-white flex items-center justify-center shadow-lg">
                    <TrendingUp className="h-3.5 w-3.5" />
                  </div>
                  <CardTitle className="text-[11px] font-black uppercase tracking-widest text-slate-900 italic">Live Postings</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  {!showAllStream && (
                    <div className="relative flex items-center">
                      <Calendar className="absolute left-2 h-3 w-3 text-slate-400 pointer-events-none" />
                      <input 
                        type="date" 
                        value={streamDateFilter}
                        onChange={(e) => setStreamDateFilter(e.target.value)}
                        className="h-8 pl-7 pr-2 rounded-lg text-[9px] font-black uppercase tracking-widest border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-accent w-[125px]"
                      />
                    </div>
                  )}
                  <button 
                    onClick={() => setShowAllStream(!showAllStream)}
                    className={`h-8 px-3 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${showAllStream ? 'bg-slate-900 text-white shadow-lg' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                  >
                    {showAllStream ? 'Global Stream' : 'By Date'}
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden p-0">
              <div className="h-full overflow-y-auto p-6 space-y-6 custom-scrollbar">
                {(showAllStream ? recentPostings : recentPostings.filter(p => p.date === streamDateFilter)).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-300">
                    <LayoutDashboard className="h-12 w-12 opacity-10 mb-2" />
                    <p className="text-[10px] font-black uppercase tracking-widest">{showAllStream ? 'No global telemetry' : 'No telemetry for this date'}</p>
                  </div>
                ) : (
                  (showAllStream ? recentPostings : recentPostings.filter(p => p.date === streamDateFilter))
                    .map((p, idx) => (
                      <motion.div 
                        initial={{ opacity: 0, x: 20 }} 
                        animate={{ opacity: 1, x: 0 }} 
                        transition={{ delay: idx * 0.05 }}
                        key={p.id} 
                        className="flex items-center gap-4 group"
                      >
                        <div className="h-10 w-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-xs shadow-lg group-hover:bg-accent transition-colors">
                          {p.memberName?.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-black text-slate-800 truncate leading-none">{p.memberName}</p>
                            {p.collectedByRole && (
                              <div className="flex items-center gap-1.5">
                                <Badge variant="outline" className={`text-[8px] px-1 py-0 h-4 border-none ${p.collectedByRole === 'super_admin' ? 'bg-indigo-50 text-indigo-500' : 'bg-emerald-50 text-emerald-500'} italic font-black uppercase tracking-widest`}>
                                  {p.collectedByRole === 'super_admin' ? 'Admin' : 'Agent'}
                                </Badge>
                              </div>
                            )}
                          </div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{p.accountNo}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-black text-accent leading-none">+{formatCurrency(p.amount)}</p>
                          <p className="text-[8px] font-black text-slate-400 uppercase mt-1">{formatDate(p.date)}</p>
                        </div>
                      </motion.div>
                    ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Audit Log Stream */}
          {userData?.role === 'super_admin' && (
            <Card className="flex-1 flex flex-col glass-card border-slate-200/60 overflow-hidden min-h-[400px]">
              <CardHeader className="border-b border-slate-100 pb-4 bg-slate-50/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-lg bg-accent text-accent-foreground flex items-center justify-center shadow-lg">
                      <Database className="h-3.5 w-3.5" />
                    </div>
                    <CardTitle className="text-[11px] font-black uppercase tracking-widest text-slate-900 italic">Security Audit</CardTitle>
                  </div>
                  <Badge className="bg-slate-100 text-slate-500 text-[8px] border-none font-black uppercase tracking-tighter">Admin View</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex-1 overflow-hidden p-0">
                <div className="h-full overflow-y-auto p-6 space-y-4 custom-scrollbar">
                  {logs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-300">
                      <Database className="h-12 w-12 opacity-10 mb-2" />
                      <p className="text-[10px] font-black uppercase tracking-widest">No audit trails</p>
                    </div>
                  ) : (
                    logs.map((log, idx) => (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }} 
                        animate={{ opacity: 1, y: 0 }} 
                        transition={{ delay: idx * 0.05 }}
                        key={log.id} 
                        className="p-3 rounded-xl bg-slate-50/50 border border-slate-100 group hover:border-accent/30 transition-all"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <Badge variant="outline" className={cn(
                            "text-[8px] px-1.5 py-0 h-4 border-none font-black uppercase tracking-widest",
                            log.action?.includes('DELETE') ? 'bg-destructive/10 text-destructive' : 'bg-accent/10 text-accent-foreground'
                          )}>
                            {log.action}
                          </Badge>
                          <span className="text-[8px] font-bold text-slate-400">{log.timestamp?.toDate ? log.timestamp.toDate().toLocaleTimeString() : 'Recent'}</span>
                        </div>
                        <p className="text-[11px] font-medium text-slate-700 leading-relaxed mb-1">{log.details}</p>
                        <div className="flex items-center gap-2">
                           <span className="text-[9px] font-black text-slate-400 uppercase tracking-tight">By: {log.userName}</span>
                           <Badge className="text-[7px] px-1 py-0 h-3 bg-white border border-slate-200 text-slate-400 font-bold uppercase">{log.userRole?.replace('_', ' ')}</Badge>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
