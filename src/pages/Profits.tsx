import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLine } from "@/contexts/LineContext";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, DocumentData } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from "recharts";
import { TrendingUp, FileSpreadsheet, Search, Filter, DollarSign, Calendar, Landmark, ArrowUpRight, ArrowDownRight, Percent, Users, Receipt } from "lucide-react";
import { toast } from "sonner";
import { exportToExcel } from "@/lib/excel";

const Profits = () => {
  const { userData } = useAuth();
  const { selectedLineId, lines } = useLine();
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<DocumentData[]>([]);
  const [postings, setPostings] = useState<DocumentData[]>([]);
  const [expenses, setExpenses] = useState<DocumentData[]>([]);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    const fetchProfitsData = async () => {
      if (!userData) return;
      setLoading(true);

      try {
        // 1. Fetch Accounts
        let accountsRef: any = collection(db, "accounts");
        let accQuery = accountsRef;
        
        if (selectedLineId) {
          accQuery = query(accountsRef, where("lineId", "==", selectedLineId));
        } else if (userData.role === "admin" || userData.role === "partner") {
          accQuery = query(accountsRef, where("adminId", "==", userData.uid));
        }

        const accSnap = await getDocs(accQuery);
        const accList: DocumentData[] = accSnap.docs.map(d => ({
          id: d.id,
          ...d.data()
        }));
        setAccounts(accList);

        // Map account IDs for quick lookup
        const accMap = new Map();
        accList.forEach(a => accMap.set(a.id, a));

        // 2. Fetch Postings
        let postingsRef: any = collection(db, "postings");
        let postQuery = postingsRef;
        
        if (selectedLineId) {
          postQuery = query(postingsRef, where("lineId", "==", selectedLineId));
        } else if (userData.role === "admin" || userData.role === "partner") {
          postQuery = query(postingsRef, where("adminId", "==", userData.uid));
        }

        const postSnap = await getDocs(postQuery);
        const postList = postSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter((p: any) => ["collection", "penalty", "extra_collection", "extra_transfer_out"].includes(p.status?.toLowerCase()));
        setPostings(postList);

        // 3. Fetch Expenses
        let expensesRef: any = collection(db, "expenses_log");
        let expQuery = expensesRef;
        
        if (selectedLineId) {
          expQuery = query(expensesRef, where("lineId", "==", selectedLineId));
        }

        const expSnap = await getDocs(expQuery);
        const expList = expSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setExpenses(expList);

      } catch (err) {
        console.error("Error fetching profits data:", err);
        toast.error("Failed to load profit analytics data.");
      } finally {
        setLoading(false);
      }
    };

    fetchProfitsData();
  }, [userData, selectedLineId]);

  // Account Map for helper lookups
  const accMap = new Map<string, DocumentData>();
  accounts.forEach(a => accMap.set(a.id, a));

  // Process data for calculations
  const totalDisbursed = accounts.reduce((sum, a) => sum + (Number(a.loanAmount) || 0), 0);
  const totalExpectedInterest = accounts.reduce((sum, a) => sum + (Number(a.interestAmount) || 0), 0);
  const totalDocCharges = accounts.reduce((sum, a) => sum + (Number(a.documentCharge) || 0), 0);
  const grossProjectedProfit = totalExpectedInterest + totalDocCharges;

  // Realized calculations
  let realizedInterest = 0;
  let realizedPenalties = 0;
  let realizedExtra = 0;
  let realizedDocCharges = 0;

  // Account profitability details list
  const accountProfits = accounts.map(a => {
    const accId = a.id;
    const loan = Number(a.loanAmount) || 0;
    const interest = Number(a.interestAmount) || 0;
    const total = Number(a.totalAmount) || 0;
    const docChg = Number(a.documentCharge) || 0;
    const paid = Number(a.paid) || 0;

    // Linear amortization: interest portion realized = (paid / total) * interest
    const interestPortionRealized = total > 0 ? (paid / total) * interest : 0;

    // Filter postings for this account
    const accPostings = postings.filter(p => p.accountId === accId);
    const penalties = accPostings.reduce((sum, p) => {
      const status = p.status?.toLowerCase();
      if (status === "penalty") return sum + (Number(p.amount) || 0);
      return sum + (Number(p.penaltyAmount) || 0);
    }, 0);

    const extra = accPostings.reduce((sum, p) => {
      const status = p.status?.toLowerCase();
      if (status === "extra_collection") return sum + (Number(p.amount) || 0);
      if (status === "extra_transfer_out") return sum - (Number(p.amount) || 0);
      return sum + (Number(p.extraAmount) || 0);
    }, 0);

    const netRealizedAccProfit = interestPortionRealized + docChg + penalties + extra;

    return {
      id: accId,
      accountNo: a.accountNo,
      name: a.name,
      nameTelugu: a.nameTelugu,
      village: a.village,
      status: a.status,
      loan,
      expectedInterest: interest,
      docCharges: docChg,
      paid,
      penalties,
      extra,
      netRealizedProfit: netRealizedAccProfit,
      creationDate: a.creationDate || a.startDate || ""
    };
  });

  // Global aggregates
  accountProfits.forEach(ap => {
    realizedInterest += (ap.paid / (ap.loan + ap.expectedInterest || 1)) * ap.expectedInterest;
    realizedPenalties += ap.penalties;
    realizedExtra += ap.extra;
    realizedDocCharges += ap.docCharges;
  });

  const totalRealizedRevenue = realizedInterest + realizedPenalties + realizedExtra + realizedDocCharges;
  const totalOfficeExpenses = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const netRealizedProfit = totalRealizedRevenue - totalOfficeExpenses;

  // Monthly breakdown grouping
  const monthlyDataMap: Record<string, {
    disbursed: number;
    docCharges: number;
    repayments: number;
    penalties: number;
    extra: number;
    expenses: number;
    realizedInterest: number;
  }> = {};

  // Initialize monthly aggregation from accounts (disbursement & doc charges)
  accounts.forEach(a => {
    const dateStr = a.creationDate || a.startDate || "";
    if (!dateStr || dateStr.length < 7) return;
    const month = dateStr.substring(0, 7); // YYYY-MM
    
    if (!monthlyDataMap[month]) {
      monthlyDataMap[month] = { disbursed: 0, docCharges: 0, repayments: 0, penalties: 0, extra: 0, expenses: 0, realizedInterest: 0 };
    }
    monthlyDataMap[month].disbursed += (Number(a.loanAmount) || 0);
    monthlyDataMap[month].docCharges += (Number(a.documentCharge) || 0);
  });

  // Repayments and collections monthly mapping
  postings.forEach(p => {
    const dateStr = p.date || "";
    if (!dateStr || dateStr.length < 7) return;
    const month = dateStr.substring(0, 7); // YYYY-MM

    if (!monthlyDataMap[month]) {
      monthlyDataMap[month] = { disbursed: 0, docCharges: 0, repayments: 0, penalties: 0, extra: 0, expenses: 0, realizedInterest: 0 };
    }

    const amt = Number(p.amount) || 0;
    const penalty = Number(p.penaltyAmount) || 0;
    const extra = Number(p.extraAmount) || 0;
    const status = p.status?.toLowerCase();

    // Check linear interest portion of this recovery posting
    const acc = accMap.get(p.accountId);
    let interestPortion = 0;
    if (acc && status === "collection") {
      const loan = Number(acc.loanAmount) || 0;
      const interest = Number(acc.interestAmount) || 0;
      const total = loan + interest;
      if (total > 0) {
        interestPortion = amt * (interest / total);
      }
    }

    if (status === "extra_transfer_out") {
      monthlyDataMap[month].extra -= amt;
    } else if (status === "extra_collection") {
      monthlyDataMap[month].extra += amt;
    } else if (status === "penalty") {
      monthlyDataMap[month].penalties += amt;
    } else {
      monthlyDataMap[month].repayments += amt;
      monthlyDataMap[month].penalties += penalty;
      monthlyDataMap[month].extra += extra;
    }

    monthlyDataMap[month].realizedInterest += interestPortion;
  });

  // Expenses monthly mapping
  expenses.forEach(e => {
    const dateStr = e.date || "";
    if (!dateStr || dateStr.length < 7) return;
    const month = dateStr.substring(0, 7); // YYYY-MM

    if (!monthlyDataMap[month]) {
      monthlyDataMap[month] = { disbursed: 0, docCharges: 0, repayments: 0, penalties: 0, extra: 0, expenses: 0, realizedInterest: 0 };
    }

    monthlyDataMap[month].expenses += (Number(e.amount) || 0);
  });

  // Convert monthly map to sorted array list
  const monthlyList = Object.entries(monthlyDataMap)
    .map(([month, data]) => {
      const revenue = data.realizedInterest + data.docCharges + data.penalties + data.extra;
      const profit = revenue - data.expenses;
      return {
        month,
        disbursed: data.disbursed,
        docCharges: data.docCharges,
        repayments: data.repayments,
        penalties: data.penalties,
        extra: data.extra,
        expenses: data.expenses,
        realizedInterest: data.realizedInterest,
        revenue,
        profit
      };
    })
    .sort((a, b) => b.month.localeCompare(a.month)); // Sort descending (newest month first)

  // Filter lists based on year selectors
  const uniqueYears = Array.from(new Set(monthlyList.map(m => m.month.substring(0, 4)))).sort().reverse();

  const filteredMonths = monthlyList.filter(m => {
    if (yearFilter === "all") return true;
    return m.month.startsWith(yearFilter);
  });

  // Chart data (sorted chronological ascending for charts)
  const chartData = [...filteredMonths]
    .reverse()
    .slice(-12); // Limit to last 12 periods

  // Filtered account profitability logs
  const filteredAccountProfits = accountProfits.filter(ap => {
    const matchesSearch = ap.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          ap.nameTelugu?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          ap.accountNo?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          ap.village?.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (yearFilter === "all") return matchesSearch;
    return matchesSearch && ap.creationDate?.startsWith(yearFilter);
  }).sort((a, b) => {
    const accA = parseInt(a.accountNo || "0", 10);
    const accB = parseInt(b.accountNo || "0", 10);
    return accA - accB;
  });

  // Export Monthly profits to Excel
  const handleExportMonthlyExcel = () => {
    if (filteredMonths.length === 0) {
      toast.error("No reports to export");
      return;
    }

    const data = filteredMonths.map((m, idx) => ({
      "Sl No": idx + 1,
      "Month": m.month,
      "Capital Disbursed": m.disbursed,
      "Doc Charges (Fees)": m.docCharges,
      "Repayments Collected": m.repayments,
      "Penalties Collected": m.penalties,
      "Extra Collected": m.extra,
      "Total Expenses": m.expenses,
      "Interest Realized": Math.round(m.realizedInterest),
      "Gross Revenue Realized": Math.round(m.revenue),
      "Net Profit": Math.round(m.profit),
      "Margin Status": m.profit >= 0 ? "PROFITABLE" : "DEFICIT"
    }));

    const activeLineName = lines.find(l => l.id === selectedLineId)?.name || "All_Lines";
    exportToExcel(data, `Monthly_Profit_Loss_${activeLineName}_${yearFilter}`, "Profits");
    toast.success("Profit ledger exported successfully as Excel.");
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8 pb-20 max-w-7xl mx-auto"
    >
      {/* Analytics Premium Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 p-8 bg-white rounded-[2rem] border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.01)] relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-600" />
        <div className="flex items-center gap-5">
          <div className="h-16 w-16 rounded-2xl bg-emerald-50 flex items-center justify-center border border-emerald-100/60 shadow-inner shrink-0">
            <TrendingUp className="text-emerald-600 h-8 w-8" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900 uppercase italic leading-none">Profits Center</h1>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="outline" className="bg-slate-50 border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-500 py-0.5 px-3">
                {selectedLineId ? lines.find(l => l.id === selectedLineId)?.name : "Consolidated Portfolio"}
              </Badge>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">• Realized P&L Analytics</span>
            </div>
          </div>
        </div>

        {/* Global Toolbar Filters */}
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-50 border border-slate-100 rounded-xl p-1 shrink-0">
            <button 
              onClick={() => setYearFilter("all")} 
              className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${yearFilter === "all" ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
            >
              All Years
            </button>
            {uniqueYears.map(yr => (
              <button 
                key={yr} 
                onClick={() => setYearFilter(yr)} 
                className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${yearFilter === yr ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
              >
                {yr}
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            onClick={handleExportMonthlyExcel}
            className="h-10 rounded-xl bg-white border-slate-200 text-emerald-600 hover:bg-emerald-50 font-black text-xs uppercase tracking-widest px-5 shadow-sm gap-2"
          >
            <FileSpreadsheet className="h-4 w-4" /> Export Ledger
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-40 gap-4">
          <div className="h-12 w-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Processing ledger calculations...</p>
        </div>
      ) : (
        <>
          {/* Visual P&L Stat Matrix Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Projected Gross Revenue */}
            <Card className="glass-card shadow-lg border-none border-t-4 border-indigo-500 bg-white relative overflow-hidden group">
              <div className="absolute right-0 bottom-0 translate-x-2 translate-y-2 opacity-5 text-indigo-500 group-hover:scale-110 transition-transform">
                <Landmark size={120} />
              </div>
              <CardContent className="p-6 relative z-10">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">Projected Gross Profit</p>
                <h3 className="text-3xl font-black text-slate-900 tracking-tight">{formatCurrency(grossProjectedProfit)}</h3>
                <div className="flex items-center gap-2 mt-4 text-[9px] font-bold text-slate-400">
                  <Badge className="bg-indigo-50 text-indigo-600 border-none font-black text-[8px]">Projected</Badge>
                  <span>Expected Interest + Fees</span>
                </div>
              </CardContent>
            </Card>

            {/* Realized Inflow Revenue */}
            <Card className="glass-card shadow-lg border-none border-t-4 border-emerald-500 bg-white relative overflow-hidden group">
              <div className="absolute right-0 bottom-0 translate-x-2 translate-y-2 opacity-5 text-emerald-500 group-hover:scale-110 transition-transform">
                <ArrowUpRight size={120} />
              </div>
              <CardContent className="p-6 relative z-10">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">Realized Revenue</p>
                <h3 className="text-3xl font-black text-emerald-600 tracking-tight">{formatCurrency(totalRealizedRevenue)}</h3>
                <div className="flex items-center gap-2 mt-4 text-[9px] font-bold text-slate-400">
                  <Badge className="bg-emerald-50 text-emerald-600 border-none font-black text-[8px] flex gap-1"><ArrowUpRight size={10} /> Realized</Badge>
                  <span>Collected portion + Fines + Fees</span>
                </div>
              </CardContent>
            </Card>

            {/* Accumulated Expenses */}
            <Card className="glass-card shadow-lg border-none border-t-4 border-rose-500 bg-white relative overflow-hidden group">
              <div className="absolute right-0 bottom-0 translate-x-2 translate-y-2 opacity-5 text-rose-500 group-hover:scale-110 transition-transform">
                <ArrowDownRight size={120} />
              </div>
              <CardContent className="p-6 relative z-10">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">Office Expenses</p>
                <h3 className="text-3xl font-black text-rose-600 tracking-tight">{formatCurrency(totalOfficeExpenses)}</h3>
                <div className="flex items-center gap-2 mt-4 text-[9px] font-bold text-slate-400">
                  <Badge className="bg-rose-50 text-rose-600 border-none font-black text-[8px] flex gap-1"><ArrowDownRight size={10} /> Outflow</Badge>
                  <span>Office operational costs</span>
                </div>
              </CardContent>
            </Card>

            {/* Net Realized Profit */}
            <Card className="shadow-xl border-none bg-slate-900 text-white relative overflow-hidden group">
              <div className="absolute right-0 bottom-0 translate-x-2 translate-y-2 opacity-10 text-white group-hover:scale-110 transition-transform">
                <DollarSign size={120} />
              </div>
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-transparent pointer-events-none" />
              <CardContent className="p-6 relative z-10">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Net Realized Profit</p>
                <h3 className={`text-3xl font-black tracking-tight ${netRealizedProfit >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {formatCurrency(netRealizedProfit)}
                </h3>
                <div className="flex items-center gap-2 mt-4 text-[9px] font-bold text-slate-400">
                  <Badge className={`${netRealizedProfit >= 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"} border-none font-black text-[8px]`}>
                    {netRealizedProfit >= 0 ? "Net Gain" : "Net Deficit"}
                  </Badge>
                  <span className="text-slate-500">Margin: {totalRealizedRevenue > 0 ? Math.round((netRealizedProfit / totalRealizedRevenue) * 100) : 0}%</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="overview" value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="bg-slate-100/50 p-1.5 border border-slate-100 rounded-2xl h-14 w-fit">
              <TabsTrigger value="overview" className="rounded-xl px-6 font-black uppercase tracking-widest text-[10px] data-[state=active]:bg-white data-[state=active]:shadow-md data-[state=active]:text-indigo-600">Overview Trends</TabsTrigger>
              <TabsTrigger value="monthly" className="rounded-xl px-6 font-black uppercase tracking-widest text-[10px] data-[state=active]:bg-white data-[state=active]:shadow-md data-[state=active]:text-indigo-600">Monthly Ledger</TabsTrigger>
              <TabsTrigger value="accounts" className="rounded-xl px-6 font-black uppercase tracking-widest text-[10px] data-[state=active]:bg-white data-[state=active]:shadow-md data-[state=active]:text-indigo-600">Account Profitability</TabsTrigger>
            </TabsList>

            {/* TAB: Overview & Analytics Chart */}
            <TabsContent value="overview" className="space-y-6">
              <Card className="glass-card border-none shadow-md overflow-hidden bg-white">
                <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-5 px-8">
                  <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-indigo-500" /> Realized Profit vs Expenses Monthly Timeline
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-8">
                  <div className="h-[380px]">
                    {chartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 20, right: 10, left: 10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="month" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                          <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `₹${val}`} />
                          <Tooltip formatter={(value) => formatCurrency(Number(value))} cursor={{ fill: '#f8fafc' }} />
                          <Legend verticalAlign="top" height={36} iconType="circle" />
                          <Bar name="Realized Revenue" dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} barSize={25} />
                          <Bar name="Office Expenses" dataKey="expenses" fill="#f43f5e" radius={[4, 4, 0, 0]} barSize={25} />
                          <Bar name="Net Profit" dataKey="profit" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={25} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center italic text-slate-400">
                        No financial logs available for the selected period
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB: Monthly Ledger Table */}
            <TabsContent value="monthly">
              <Card className="glass-card border-none shadow-md overflow-hidden bg-white rounded-3xl">
                <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-4 px-6 flex flex-row items-center justify-between">
                  <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-indigo-500" /> Monthly Operations Breakout
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto no-scrollbar">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/50 border-b border-slate-100">
                        <th className="p-5 text-[10px] uppercase tracking-[0.2em] font-black text-slate-400 text-center">Ref</th>
                        <th className="p-5 text-[10px] uppercase tracking-[0.2em] font-black text-slate-400">Period</th>
                        <th className="p-5 text-[10px] uppercase tracking-[0.2em] font-black text-slate-400 text-right">Lent Capital</th>
                        <th className="p-5 text-[10px] uppercase tracking-[0.2em] font-black text-slate-400 text-right">Doc Charges</th>
                        <th className="p-5 text-[10px] uppercase tracking-[0.2em] font-black text-slate-400 text-right">Office Expenses</th>
                        <th className="p-5 text-[10px] uppercase tracking-[0.2em] font-black text-indigo-500 text-right">Realized Interest</th>
                        <th className="p-5 text-[10px] uppercase tracking-[0.2em] font-black text-emerald-600 text-right">Gross Revenue</th>
                        <th className="p-5 text-[10px] uppercase tracking-[0.2em] font-black text-slate-900 text-right">Net Profit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {filteredMonths.map((m, idx) => (
                        <motion.tr 
                          key={m.month}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: idx * 0.02 }}
                          className="hover:bg-slate-50/50 transition-colors"
                        >
                          <td className="p-5 text-center font-bold text-slate-300 text-xs">{String(idx + 1).padStart(2, '0')}</td>
                          <td className="p-5 font-black text-slate-900 text-sm">{m.month}</td>
                          <td className="p-5 text-right text-xs font-bold text-slate-600">{formatCurrency(m.disbursed)}</td>
                          <td className="p-5 text-right text-xs font-bold text-slate-600">{formatCurrency(m.docCharges)}</td>
                          <td className="p-5 text-right text-xs font-bold text-rose-500">{formatCurrency(m.expenses)}</td>
                          <td className="p-5 text-right text-xs font-bold text-indigo-600">{formatCurrency(Math.round(m.realizedInterest))}</td>
                          <td className="p-5 text-right text-xs font-black text-emerald-600">{formatCurrency(Math.round(m.revenue))}</td>
                          <td className={`p-5 text-right text-sm font-black ${m.profit >= 0 ? 'text-indigo-600' : 'text-rose-500'}`}>
                            {formatCurrency(Math.round(m.profit))}
                          </td>
                        </motion.tr>
                      ))}
                      {filteredMonths.length === 0 && (
                        <tr>
                          <td colSpan={8} className="p-20 text-center text-slate-400 italic">No operational records mapped.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB: Account Profitability Table */}
            <TabsContent value="accounts">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                <div className="relative w-full md:w-80 group">
                  <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-300 group-focus-within:text-indigo-500 transition-colors" />
                  <Input 
                    placeholder="Search account profitability..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pl-10 h-11 bg-white border-slate-200 shadow-sm rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10"
                  />
                </div>
                <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl">
                  Displaying {filteredAccountProfits.length} Records
                </div>
              </div>

              <Card className="glass-card border-none shadow-md overflow-hidden bg-white rounded-3xl">
                <CardContent className="p-0 overflow-x-auto no-scrollbar">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/50 border-b border-slate-100">
                        <th className="p-5 text-[10px] uppercase tracking-[0.2em] font-black text-slate-400">Account</th>
                        <th className="p-5 text-[10px] uppercase tracking-[0.2em] font-black text-slate-400">Subscriber</th>
                        <th className="p-5 text-[10px] uppercase tracking-[0.2em] font-black text-slate-400 text-right">Lent Capital</th>
                        <th className="p-5 text-[10px] uppercase tracking-[0.2em] font-black text-slate-400 text-right">Expected Interest</th>
                        <th className="p-5 text-[10px] uppercase tracking-[0.2em] font-black text-slate-400 text-right">Doc Charges</th>
                        <th className="p-5 text-[10px] uppercase tracking-[0.2em] font-black text-slate-400 text-right">Penalties</th>
                        <th className="p-5 text-[10px] uppercase tracking-[0.2em] font-black text-slate-400 text-right">Extra Fees</th>
                        <th className="p-5 text-[10px] uppercase tracking-[0.2em] font-black text-emerald-600 text-right">Net Profit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {filteredAccountProfits.map((ap) => (
                        <tr key={ap.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-5 font-black text-xs text-primary/60 tracking-widest">{ap.accountNo}</td>
                          <td className="p-5">
                            <div className="flex flex-col">
                              <span className="font-black text-slate-800 text-sm uppercase">{ap.name}</span>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[8px] text-slate-400 font-bold uppercase tracking-wider">{ap.village || 'N/A'}</span>
                                {ap.nameTelugu && <span className="text-[10px] font-bold text-slate-500 font-telugu">({ap.nameTelugu})</span>}
                                {ap.status === "deleted" && (
                                  <span className="text-[7px] bg-rose-50 text-rose-500 font-black px-1.5 py-0.5 rounded uppercase tracking-wider">Deleted</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="p-5 text-right text-xs font-bold text-slate-600">{formatCurrency(ap.loan)}</td>
                          <td className="p-5 text-right text-xs font-bold text-indigo-500">{formatCurrency(ap.expectedInterest)}</td>
                          <td className="p-5 text-right text-xs font-bold text-slate-600">{formatCurrency(ap.docCharges)}</td>
                          <td className="p-5 text-right text-xs font-bold text-amber-600">{formatCurrency(ap.penalties)}</td>
                          <td className="p-5 text-right text-xs font-bold text-slate-600">{formatCurrency(ap.extra)}</td>
                          <td className={`p-5 text-right text-sm font-black ${ap.netRealizedProfit >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                            {formatCurrency(Math.round(ap.netRealizedProfit))}
                          </td>
                        </tr>
                      ))}
                      {filteredAccountProfits.length === 0 && (
                        <tr>
                          <td colSpan={8} className="p-20 text-center text-slate-400 italic">No profitability records mapped.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </motion.div>
  );
};

export default Profits;
