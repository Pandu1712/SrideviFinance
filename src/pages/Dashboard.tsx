import { toast as sonnerToast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useLine } from "@/contexts/LineContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Users, IndianRupee, FileText, TrendingUp, Search, MapPin, ArrowRight, AlertCircle, Calendar,
  ArrowRightLeft, Banknote, Calculator, Scale, Info, Map as MapIcon, Database
} from "lucide-react";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, orderBy, limit, DocumentData, onSnapshot } from "firebase/firestore";
import { formatCurrency, formatDate } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const StatCard = ({ title, value, icon, color, trend, index }: { title: string; value: string | number; icon: React.ReactNode; color: string; trend?: string; index: number }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: index * 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
  >
    <Card className="bg-white/70 backdrop-blur-xl border border-white/40 shadow-[0_10px_40px_-15px_rgba(0,0,0,0.05)] hover:shadow-[0_20px_60px_-10px_rgba(0,0,0,0.1)] hover:-translate-y-1.5 transition-all duration-500 group overflow-hidden relative">
      <div className={`absolute -right-4 -top-4 w-24 h-24 blur-3xl rounded-full opacity-0 group-hover:opacity-20 transition-opacity duration-700 ${color.includes('bg-') ? color : 'bg-primary'}`} />
      
      <CardContent className="flex items-center gap-5 p-7 relative z-10">
        <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl shadow-xl shadow-slate-200 transition-all duration-500 group-hover:scale-110 group-hover:shadow-2xl ${color} border border-white/20`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 group-hover:text-slate-500 transition-colors">{title}</p>
          <div className="flex items-baseline gap-2 mt-1">
            <h3 className="text-xl font-black tracking-tight text-slate-900 leading-none">{value}</h3>
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
  const [currentDate, setCurrentDate] = useState(new Date().toISOString().split("T")[0]);
  const [streamDate, setStreamDate] = useState(new Date().toISOString().split("T")[0]);

  useEffect(() => {
    if (!userData) return;

    let unsubscribeAccounts: (() => void) | null = null;
    let unsubscribePostings: (() => void) | null = null;
    let unsubscribeLogs: (() => void) | null = null;
    let unsubscribeAgents: (() => void) | null = null;
    let unsubscribeAdmins: (() => void) | null = null;

    const dateObj = new Date(currentDate);
    const startOfMonth = new Date(dateObj.getFullYear(), dateObj.getMonth(), 1).toISOString().split("T")[0];
    const startOfYear = new Date(dateObj.getFullYear(), 0, 1).toISOString().split("T")[0];

    const fetchAdmins = async () => {
      const q = query(collection(db, "users"), where("role", "in", ["admin", "super_admin"]));
      const snap = await getDocs(q);
      return new Set(snap.docs.map(d => d.id));
    };

    const setupListeners = async () => {
      setLoading(true);
      const activeLineId = selectedLineId;
      const todayStr = currentDate;
      
      const adminIdsSet = await fetchAdmins();

      // 1. GLOBAL POSTINGS (Bounded for performance)
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const sixMonthsAgoStr = sixMonthsAgo.toISOString().split('T')[0];

      let postRef: any = collection(db, "postings");
      if (activeLineId) {
        postRef = query(postRef, where("lineId", "==", activeLineId), where("date", ">=", sixMonthsAgoStr));
      } else {
        postRef = query(postRef, where("date", ">=", sixMonthsAgoStr));
      }

      unsubscribePostings = onSnapshot(postRef, (snapshot) => {
        let totalCol = 0; let agCol = 0; let adCol = 0;
        let chartCol: any = {};

        snapshot.forEach(d => {
          const data = d.data();
          const amt = data.amount || 0;
          const pAmt = data.penaltyAmount || 0;
          const eAmt = data.extraAmount || 0;
          const itemTotal = amt + pAmt + eAmt;

          const isMatch = timeFilter === "all" || (timeFilter === "month" && data.date >= startOfMonth) || (timeFilter === "year" && data.date >= startOfYear);
          if (isMatch) totalCol += itemTotal;

          if (data.date === todayStr) {
            if (data.status === "collection" || data.status === "extra_collection") {
               if (data.collectedByRole === 'super_admin' || data.collectedByRole === 'admin') adCol += itemTotal;
               else if (data.collectedByRole === 'agent') agCol += itemTotal;
               else {
                 if (adminIdsSet.has(data.collectedById)) adCol += itemTotal;
                 else agCol += itemTotal;
               }
            }
          }
          
          const monthKey = data.date?.substring(0, 7) || "Unknown";
          chartCol[monthKey] = (chartCol[monthKey] || 0) + itemTotal;
        });

        // Use a separate sorted list for the recent stream, limited to 100 items
        const recent = snapshot.docs
          .map(d => ({ id: d.id, ...d.data() as any }))
          .sort((a, b) => (b.createdAt || b.date || "").localeCompare(a.createdAt || a.date || ""))
          .slice(0, 100);
        
        setRecentPostings(recent);
        
        if (userData.role === 'super_admin') {
          const allKeys = Array.from(new Set([...Object.keys(chartCol)]));
          const formatted = allKeys.sort().slice(-12).map(k => ({ date: k, collected: chartCol[k] || 0 }));
          setChartData(formatted);
          setStats(prev => ({ ...prev, totalCollection: totalCol }));
        } else if (userData.role === 'agent') {
          setStats(prev => ({ ...prev, todayCollection: agCol }));
        } else {
          setStats(prev => ({ ...prev, dailyCollection: totalCol }));
        }
        setLoading(false);
      }, (err) => {
        console.error("Dashboard postings fail:", err);
        setLoading(false);
      });

      // 2. ROLE-SPECIFIC LISTENERS
      if (userData.role === "super_admin") {
        unsubscribeLogs = onSnapshot(query(collection(db, "audit_logs"), orderBy("timestamp", "desc"), limit(50)), (snapshot) => {
           setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any })));
        });

        let accountsRef: any = collection(db, "accounts");
        if (activeLineId) accountsRef = query(accountsRef, where("lineId", "==", activeLineId));

        unsubscribeAccounts = onSnapshot(accountsRef, (snapshot) => {
          let spent = 0; let balance = 0; let expected = 0; let totalAcc = 0;
          snapshot.forEach(d => {
            const acc = d.data();
            const isDeleted = acc.status === "deleted";
            if (!isDeleted) {
              totalAcc++;
            }
            const isMatch = timeFilter === "all" || (timeFilter === "month" && acc.startDate >= startOfMonth) || (timeFilter === "year" && acc.startDate >= startOfYear);
            if (isMatch) { 
              spent += (acc.loanAmount || 0); 
              balance += (acc.balance || 0); 
              expected += (acc.totalAmount || 0); 
            }
          });
          setStats(prev => ({ ...prev, totalAccounts: totalAcc, totalSpent: spent, totalBalance: balance, projectedProfit: expected - spent }));
        });

        // Fetch total agents and admins for super_admin
        unsubscribeAgents = onSnapshot(query(collection(db, "users"), where("role", "==", "agent")), (s) => setStats(prev => ({ ...prev, totalAgents: s.size })));
        unsubscribeAdmins = onSnapshot(query(collection(db, "users"), where("role", "==", "admin")), (s) => setStats(prev => ({ ...prev, totalAdmins: s.size })));
      } else if (userData.role === "admin" || userData.role === "partner") {
        let accountsRef: any = collection(db, "accounts");
        accountsRef = query(accountsRef, where("adminId", "==", userData.uid));
        if (activeLineId) accountsRef = query(accountsRef, where("lineId", "==", activeLineId));

        const agentsQ = query(collection(db, "users"), where("role", "==", "agent"), where("adminId", "==", userData.uid));
        unsubscribeAgents = onSnapshot(agentsQ, (s) => setStats(prev => ({ ...prev, totalAgents: s.size })));

        unsubscribeAccounts = onSnapshot(accountsRef, (snapshot) => {
          let pending = 0;
          let activeCount = 0;
          snapshot.forEach(d => {
            const acc = d.data();
            if (acc.status !== "deleted") {
              activeCount++;
              pending += acc.balance || 0;
            }
          });
          setStats(prev => ({ ...prev, totalAccounts: activeCount, pendingAmount: pending }));
        });
      } else if (userData.role === "agent") {
        let assignedLineIds = userData.lineIds || (userData.lineId ? [userData.lineId] : []);
        let accQuery = selectedLineId ? query(collection(db, "accounts"), where("lineId", "==", selectedLineId)) : query(collection(db, "accounts"), where("lineId", "in", assignedLineIds));
        
        unsubscribeAccounts = onSnapshot(accQuery, (snapshot) => {
           let pendingCount = 0;
           let assignedCount = 0;
           snapshot.forEach(d => {
             const acc = d.data();
             if (acc.status !== "deleted") {
               assignedCount++;
               if (acc.balance > 0) pendingCount++;
             }
           });
           setStats(prev => ({ ...prev, assignedAccounts: assignedCount, pendingAccounts: pendingCount }));
        });
      }
    };

    setupListeners();
    return () => {
      if (unsubscribeAccounts) unsubscribeAccounts();
      if (unsubscribePostings) unsubscribePostings();
      if (unsubscribeLogs) unsubscribeLogs();
      if (unsubscribeAgents) unsubscribeAgents();
      if (unsubscribeAdmins) unsubscribeAdmins();
    };
  }, [userData, timeFilter, selectedLineId, currentDate]);

  const activeLine = lines.find(l => l.id === selectedLineId);
  const activeLineName = activeLine?.name || "Sridevi Finance";
  const activeLineNumber = activeLine?.number;

  return (
    <div className="max-w-7xl mx-auto space-y-10 animate-slide-up pb-10">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between px-2">
        <div className="relative">
          <div className="absolute -left-4 top-0 bottom-0 w-1 bg-amber-500 rounded-full opacity-50" />
          <h1 className="text-4xl md:text-5xl font-black tracking-tighter text-slate-900 uppercase italic leading-none">
            {activeLineName}
          </h1>
          <div className="flex items-center gap-3 mt-3">
            <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-900 text-white rounded-lg text-[10px] font-black uppercase tracking-widest shadow-lg shadow-slate-200">
               <MapPin size={12} className="text-amber-500" />
               {activeLineNumber || "MASTER"}
            </div>
            <p className="text-slate-400 font-black uppercase tracking-[0.3em] text-[10px]">
              {activeLineNumber ? "Operative Intelligence" : "Enterprise Matrix"}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {(userData?.role === "super_admin" || userData?.role === "admin" || userData?.role === "partner") && (
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
              onChange={(e) => setCurrentDate(e.target.value)}
              className="bg-transparent border-none text-[11px] font-black uppercase tracking-widest focus:ring-0 text-slate-900 w-[130px]"
            />
          </div>
        </div>
      </div>

      <div className="space-y-10">
        {userData && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {userData.role === 'agent' ? (
                <>
                  <StatCard index={0} title="Portfolio Registry" value={stats.assignedAccounts} icon={<FileText className="h-7 w-7 text-white" />} color="bg-slate-900" />
                  <StatCard index={1} title="Recovery Today" value={formatCurrency(stats.todayCollection)} icon={<IndianRupee className="h-7 w-7 text-white" />} color="premium-gradient" />
                  <StatCard index={2} title="Deficit Count" value={stats.pendingAccounts} icon={<AlertCircle size={24} className="text-white" />} color="bg-rose-600" />
                </>
              ) : (
                <>
                  <StatCard index={0} title="Personnel Force" value={stats.totalAgents + stats.totalAdmins} icon={<Users className="h-7 w-7 text-white" />} color="bg-slate-900" />
                  <StatCard index={1} title="Active Portfolio" value={stats.totalAccounts} icon={<FileText className="h-7 w-7 text-white" />} color="premium-gradient" />
                  <StatCard index={2} title="Global Recovery" value={formatCurrency(userData.role === 'super_admin' ? stats.totalCollection : stats.dailyCollection)} icon={<IndianRupee className="h-7 w-7 text-white" />} color="bg-[#5f259f]" />
                </>
              )}
            </div>

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

              <Card className="glass-card border-none shadow-2xl overflow-hidden flex flex-col">
                <CardHeader className="border-b border-slate-100 bg-slate-50/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <CardTitle className="text-sm font-black flex items-center gap-2 uppercase tracking-widest italic whitespace-nowrap">
                    <Database size={16} className="text-accent" />
                    Recovery Stream
                  </CardTitle>
                  <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-sm w-full sm:w-auto">
                    <Calendar className="h-3 w-3 text-slate-400 shrink-0" />
                    <input 
                      type="date" 
                      value={streamDate}
                      onChange={(e) => setStreamDate(e.target.value)}
                      className="bg-transparent border-none text-[10px] font-black uppercase tracking-widest focus:ring-0 text-slate-900 w-full sm:w-[110px] p-0"
                    />
                  </div>
                </CardHeader>
                <CardContent className="p-0 flex-1 overflow-y-auto">
                   <div className="divide-y divide-slate-100">
                      {recentPostings.filter(p => p.date === streamDate).length === 0 ? (
                        <div className="p-10 text-center text-slate-400 font-bold uppercase text-[10px] tracking-widest">
                          No transactions for this date
                        </div>
                      ) : recentPostings
                          .filter(p => p.date === streamDate)
                          .map((p: any) => (
                        <div key={p.id} className="p-4 hover:bg-slate-50 transition-colors flex justify-between items-center group">
                           <div>
                              <p className="text-[10px] font-black text-slate-900 uppercase">{p.memberName}</p>
                              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">#{p.accountNo} • {formatDate(p.date)}</p>
                           </div>
                           <div className="text-right">
                              <p className="text-xs font-black text-emerald-600">+{formatCurrency(p.amount)}</p>
                              <Badge className="text-[7px] h-4 bg-slate-100 text-slate-500 border-none font-black uppercase">
                                {(p.collectedByRole || 'Agent').replace('_', ' ')} {p.status || 'Collection'}
                              </Badge>
                           </div>
                        </div>
                      ))}
                   </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
