import { useAuth } from "@/contexts/AuthContext";
import { useLine } from "@/contexts/LineContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Users, IndianRupee, FileText, TrendingUp, UserCog, Wallet, 
  ArrowUpRight, BarChart3, Target, Search, Plus, ArrowRightLeft, 
  LayoutDashboard, MapPin, ArrowRight, AlertCircle 
} from "lucide-react";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, limit, orderBy, onSnapshot } from "firebase/firestore";
import { formatCurrency, formatDate } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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

  useEffect(() => {
    let unsubscribeAccounts: (() => void) | null = null;
    let unsubscribePostings: (() => void) | null = null;

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0];
    const startOfYear = new Date(today.getFullYear(), 0, 1).toISOString().split("T")[0];

    const setupListeners = async () => {
      if (!userData) return;
      setLoading(true);

      if (userData.role === "super_admin") {
        let accountsRef: any = collection(db, "accounts");
        if (selectedLineId) accountsRef = query(accountsRef, where("lineId", "==", selectedLineId));

        unsubscribeAccounts = onSnapshot(accountsRef, (snapshot) => {
          let spent = 0; let balance = 0; let expected = 0;
          snapshot.forEach(d => {
            const acc = d.data();
            const isMatch = timeFilter === "all" || (timeFilter === "month" && acc.startDate >= startOfMonth) || (timeFilter === "year" && acc.startDate >= startOfYear);
            if (isMatch) {
              spent += (acc.loanAmount || 0);
              balance += (acc.balance || 0);
              expected += (acc.totalAmount || 0);
            }
          });
          
          getDocs(query(collection(db, "users"), where("role", "==", "admin"))).then(ads => {
            getDocs(query(collection(db, "users"), where("role", "==", "agent"))).then(ags => {
              setStats(prev => ({
                ...prev,
                totalAdmins: ads.size,
                totalAgents: ags.size,
                totalAccounts: snapshot.size,
                totalSpent: spent,
                totalBalance: balance,
                projectedProfit: expected - spent,
              }));
            });
          });
        }, (err) => {
          console.error("Dashboard accounts fail:", err);
          setLoading(false);
        });

        let postingsRef: any = collection(db, "postings");
        if (selectedLineId) postingsRef = query(postingsRef, where("lineId", "==", selectedLineId));

        unsubscribePostings = onSnapshot(postingsRef, (snapshot) => {
          let totalCol = 0;
          const chartCol: Record<string, number> = {};
          snapshot.forEach(d => {
            const data = d.data();
            const isMatch = timeFilter === "all" || (timeFilter === "month" && data.date >= startOfMonth) || (timeFilter === "year" && data.date >= startOfYear);
            if (isMatch) totalCol += (data.amount || 0);
            const monthKey = data.date?.substring(0, 7) || "Unknown";
            chartCol[monthKey] = (chartCol[monthKey] || 0) + (data.amount || 0);
          });
          const recent = snapshot.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => (b.date || "").localeCompare(a.date || "")).slice(0, 5);
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

      } else if (userData.role === "admin") {
        let accountsRef: any = query(collection(db, "accounts"), where("adminId", "==", userData.uid));
        if (selectedLineId) accountsRef = query(accountsRef, where("lineId", "==", selectedLineId));

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
        if (selectedLineId) postingsRef = query(postingsRef, where("lineId", "==", selectedLineId));

        unsubscribePostings = onSnapshot(postingsRef, (snapshot) => {
           let daily = 0;
           snapshot.forEach(d => { if (d.data().date === todayStr) daily += d.data().amount || 0; });
           const recent = snapshot.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => (b.date || "").localeCompare(a.date || "")).slice(0, 5);
           setRecentPostings(recent);
           setStats(prev => ({ ...prev, dailyCollection: daily }));
           setLoading(false);
        }, (err) => {
          console.error("Admin postings fail:", err);
          setLoading(false);
        });

      } else if (userData.role === "agent") {
        if (!userData.lineId) {
           console.error("Agent lacks lineId assignment");
           setLoading(false);
           return;
        }
        unsubscribeAccounts = onSnapshot(query(collection(db, "accounts"), where("lineId", "==", userData.lineId)), (snapshot) => {
           let pendingCount = 0;
           snapshot.forEach(d => { if (d.data().balance > 0) pendingCount++; });
           setStats(prev => ({ ...prev, assignedAccounts: snapshot.size, pendingAccounts: pendingCount }));
        }, (err) => {
          console.error("Agent accounts fail:", err);
          setLoading(false);
        });

        unsubscribePostings = onSnapshot(query(collection(db, "postings"), where("lineId", "==", userData.lineId)), (snapshot) => {
           let todayCol = 0;
           snapshot.forEach(d => { if (d.data().date === todayStr) todayCol += d.data().amount || 0; });
           const recent = snapshot.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => (b.date || "").localeCompare(a.date || "")).slice(0, 5);
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
    return () => {
      if (unsubscribeAccounts) unsubscribeAccounts();
      if (unsubscribePostings) unsubscribePostings();
    };
  }, [userData, timeFilter, selectedLineId]);

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
        </div>
      </div>

      {userData?.role === "super_admin" && (
        <div className="space-y-8">
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
            <div className="flex gap-2">
              <Button size="icon" variant="secondary" className="rounded-2xl h-12 w-12 bg-white shadow-sm border border-slate-100 hover:bg-accent hover:text-white transition-all">
                <Search size={22} />
              </Button>
              <Button size="icon" variant="secondary" className="rounded-2xl h-12 w-12 bg-white shadow-sm border border-slate-100 hover:bg-accent hover:text-white transition-all">
                <Plus size={22} />
              </Button>
            </div>
          </div>

          <div className="space-y-5">
            <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter">Your Collection Circles</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              <motion.div whileHover={{ scale: 1.02 }} onClick={() => window.location.href = "/daily-collection"} className="cursor-pointer">
                <Card className="rounded-[40px] border-none shadow-xl bg-gradient-to-br from-cyan-50 to-white p-8 h-56 flex flex-col justify-between group overflow-hidden relative">
                   <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-100/50 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-cyan-200/50 transition-all" />
                   <div className="h-14 w-14 rounded-2xl bg-white shadow-sm flex items-center justify-center">
                     <span className="font-black text-cyan-600 text-sm">DAY</span>
                   </div>
                   <div>
                     <p className="text-[10px] font-black text-cyan-600/60 uppercase tracking-widest">Ongoing</p>
                     <h4 className="text-3xl font-black text-cyan-900 leading-none mt-1">DAILY</h4>
                   </div>
                </Card>
              </motion.div>
              <Card className="rounded-[40px] border-none shadow-sm bg-slate-50 border border-dashed border-slate-200 p-8 h-56 flex flex-col items-center justify-center text-center opacity-60">
                 <div className="h-12 w-12 rounded-2xl bg-white flex items-center justify-center mb-4">
                   <BarChart3 className="text-slate-300" />
                 </div>
                 <h4 className="font-black text-slate-400 uppercase tracking-widest text-xs">Future Circles</h4>
              </Card>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard index={0} title="Portfolio Registry" value={stats.assignedAccounts} icon={<FileText className="h-7 w-7 text-white" />} color="bg-slate-900" />
            <StatCard index={1} title="Recovery Today" value={formatCurrency(stats.todayCollection)} icon={<IndianRupee className="h-7 w-7 text-white" />} color="premium-gradient" />
            <StatCard index={2} title="Deficit Count" value={stats.pendingAccounts} icon={<AlertCircle size={24} className="text-white" />} color="bg-rose-600" />
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

        <Card className="glass-card border-none shadow-2xl">
          <CardHeader className="border-b border-slate-50">
            <CardTitle className="text-xl font-black uppercase tracking-tighter">Live Stream</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            {recentPostings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-300">
                <LayoutDashboard className="h-12 w-12 opacity-10 mb-2" />
                <p className="text-[10px] font-black uppercase tracking-widest">No Recent Telemetry</p>
              </div>
            ) : (
              recentPostings.map((p, idx) => (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }} 
                  animate={{ opacity: 1, x: 0 }} 
                  transition={{ delay: idx * 0.1 }}
                  key={p.id} 
                  className="flex items-center gap-4 group"
                >
                  <div className="h-10 w-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-xs shadow-lg group-hover:bg-accent transition-colors">
                    {p.memberName?.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-slate-800 truncate leading-none">{p.memberName}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{p.accountNo}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-accent leading-none">+{formatCurrency(p.amount)}</p>
                    <p className="text-[8px] font-black text-slate-400 uppercase mt-1">{formatDate(p.date)}</p>
                  </div>
                </motion.div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
