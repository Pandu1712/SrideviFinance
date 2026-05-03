import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLine } from "@/contexts/LineContext";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, Timestamp, orderBy } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { formatCurrency, formatDate } from "@/lib/utils";
import { motion } from "framer-motion";
import { FileText, TrendingUp, PieChart as PieIcon, Users, Calendar, Download, FileSpreadsheet, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { exportToExcel } from "@/lib/excel";

const COLORS = ["#0F172A", "#D4AF37", "#64748B", "#F59E0B", "#10B981"];

const Reports = () => {
  const { userData } = useAuth();
  const { selectedLineId } = useLine();
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    cash: 0,
    online: 0,
    principal: 0,
    interest: 0,
    docCharges: 0,
    disbursed: 0,
    expenses: 0,
    penalties: 0,
    extraCol: 0,
    byAgent: {} as Record<string, number>,
  });

  const fetchReportData = async (selectedDate: string) => {
    setLoading(true);
    try {
      if (!selectedLineId) {
        setData([]);
        setStats({ total: 0, cash: 0, online: 0, principal: 0, interest: 0, docCharges: 0, disbursed: 0, expenses: 0, penalties: 0, extraCol: 0, byAgent: {} });
        setLoading(false);
        return;
      }

      // 1. Current Day Postings - Fetch by date only and filter in-memory to avoid index errors
      const baseQ = query(collection(db, "postings"), where("date", "==", selectedDate));
      const baseSnap = await getDocs(baseQ);
      const docs = baseSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((d: any) => {
          const matchesLine = d.lineId === selectedLineId;
          const matchesAdmin = userData?.role === "admin" ? d.adminId === userData.uid : true;
          return matchesLine && matchesAdmin;
        });
      setData(docs);

      // 2. Fetch Accounts & Disbursements first to get split ratios
      let docCharges = 0;
      let accQ = query(collection(db, "accounts"), where("lineId", "==", selectedLineId));
      const accSnap = await getDocs(accQ);

      const accountRatios: Record<string, { p: number; i: number }> = {};
      accSnap.docs.forEach(d => {
        const a = d.data();
        const loan = parseFloat(a.loanAmount || "0");
        const total = parseFloat(a.totalAmount || "0");
        if (total > 0) {
          accountRatios[d.id] = { p: loan / total, i: (total - loan) / total };
        } else {
          accountRatios[d.id] = { p: 1, i: 0 };
        }
      });

      const disbursements = accSnap.docs
        .filter(d => d.data().createdAt && d.data().createdAt.startsWith(selectedDate))
        .map(d => {
          const a = d.data();
          docCharges += parseFloat(a.documentCharge || "0");
          return {
            ...a, id: d.id, isDisbursement: true,
            amount: parseFloat(a.loanAmount || "0"),
            memberName: a.memberName || a.name,
            payMode: a.paymentType || "CASH",
            status: "New Account"
          };
        });

      // 3. Single Loop for Postings (Collections)
      let total = 0; let cash = 0; let online = 0; let principal = 0; let interest = 0; let penalties = 0; let extraCol = 0;
      const byAgent: Record<string, number> = {};

      docs.forEach((item: any) => {
        const amt = item.amount || 0;
        if (item.status === "disbursement") return;

        // Collection Stats (Money In)
        total += amt;
        if (item.payMode?.toLowerCase() === "cash") cash += amt;
        else online += amt;
        
        const pAmt = item.penaltyAmount || 0;
        const eAmt = item.extraAmount || 0;
        penalties += pAmt;
        extraCol += eAmt;
        total += (pAmt + eAmt); // Total inflow includes penalties and extras

        const agent = item.collectedByName || "Unknown";
        byAgent[agent] = (byAgent[agent] || 0) + (amt + eAmt);

        // Principal/Interest Split (Auto-Calculated)
        const ratio = accountRatios[item.accountId] || { p: 1, i: 0 };

        if (item.status === "collection") {
          if (item.principal !== undefined || item.interest !== undefined) {
            principal += (item.principal || 0);
            interest += (item.interest || 0);
          } else {
            principal += (amt * ratio.p);
            interest += (amt * ratio.i);
          }
        } else if (item.status === "penalty" || item.status === "other") {
          interest += amt; // Penalties are 100% interest
        }

        // Explicit late fees
        interest += (item.lateFee || 0);
      });

      // Transaction Registry: Only show actual collection activities
      setData(docs.filter((d: any) => 
        d.status?.toLowerCase() === "collection" || 
        d.status?.toLowerCase() === "penalty" || 
        d.status?.toLowerCase() === "extra_collection" ||
        d.status?.toLowerCase() === "extra_transfer_out"
      ));

      // Calculate total disbursed for stats
      const disbursed = disbursements.reduce((sum, d) => sum + d.amount, 0);

      // 4. Fetch Expenses
      let expenses = 0;
      const expQ = query(collection(db, "day_summaries"), where("date", "==", selectedDate), where("lineId", "==", selectedLineId));
      const expSnap = await getDocs(expQ);
      expSnap.forEach(d => {
        expenses += (d.data().expenses || 0);
      });

      setStats({ total, cash, online, principal, interest, docCharges, disbursed, expenses, penalties, extraCol, byAgent });
    } catch (err) {
      console.error(err);
      toast.error("Failed to load report data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReportData(date);
  }, [date, selectedLineId]);

  const pieData = [
    { name: "Cash", value: stats.cash },
    { name: "Online", value: stats.online },
  ].filter(d => d.value > 0);

  const barData = Object.entries(stats.byAgent).map(([name, value]) => ({ name, value }));

  const handleExportPDF = () => {
    if (data.length === 0) {
      toast.error("No data to export");
      return;
    }

    const doc = new jsPDF();

    // Header
    doc.setFontSize(20);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text("Sridevi Finance Hub - Audit Report", 14, 22);

    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);
    doc.text(`Report Date: ${formatDate(date)}`, 14, 35);

    const tableColumn = ["S.No", "Account No", "Member Name", "Collection", "Payment", "Mode", "Category"];
    const tableRows = data.map((item, idx) => [
      String(idx + 1).padStart(2, '0'),
      item.accountNo,
      item.memberName || item.name,
      !item.isDisbursement ? formatCurrency(item.amount + (item.extraAmount || 0)) : "—",
      item.isDisbursement ? formatCurrency(item.amount) : "—",
      item.payMode.toUpperCase(),
      item.status.toUpperCase(),
      item.purpose || "—"
    ]);

    doc.text(`Total Expenses: ${formatCurrency(stats.expenses)}`, 14, 42);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 48,
      theme: 'striped',
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      styles: { fontSize: 8, cellPadding: 3 }
    });

    doc.save(`Report_${date}.pdf`);
    toast.success("PDF Report Exported Successfully");
  };

  const handleExportExcel = () => {
    if (data.length === 0) {
      toast.error("No data to export");
      return;
    }

    const excelData = data.map((item, idx) => ({
      "S.No": idx + 1,
      "Account No": item.accountNo,
      "Member Name": item.memberName || item.name,
      "Collection": !item.isDisbursement ? item.amount : 0,
      "Disbursement": item.isDisbursement ? item.amount : 0,
      "Doc Charges": item.documentCharge || 0,
      "Daily Expenses": stats.expenses,
      "Mode": (item.payMode || "").toUpperCase(),
      "Category": (item.status || "").toUpperCase()
    }));

    exportToExcel(excelData, `Financial_Report_${date}`, "Report");
    toast.success("Excel Report Exported Successfully");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-premium-gradient flex items-center justify-center shadow-lg">
            <TrendingUp className="text-white h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-primary">Financial Reports</h1>
            <p className="text-muted-foreground">Deep dive into collection trends and performance metrics.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="pl-9 h-10 w-40 glass-card"
            />
          </div>
          <Button
            variant="outline"
            className="gap-2 bg-white/50 backdrop-blur-sm border-slate-200 text-slate-700 hover:bg-slate-100 font-bold"
            onClick={handleExportPDF}
          >
            <Download className="h-4 w-4" /> PDF
          </Button>
          <Button
            variant="outline"
            className="gap-2 bg-white/50 backdrop-blur-sm border-slate-200 text-emerald-600 hover:bg-emerald-50 font-bold"
            onClick={handleExportExcel}
          >
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>
        </div>
      </div>


      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <Card className="glass-card shadow-lg border-none border-t-4 border-rose-500 bg-white">
          <CardHeader className="pb-2 p-4">
            <p className="text-[9px] font-black uppercase text-slate-400 tracking-[0.2em]">Principal</p>
            <CardTitle className="text-2xl font-black text-rose-600 tracking-tighter">{formatCurrency(stats.principal)}</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="flex items-center gap-1.5 text-[8px] font-bold text-slate-400 uppercase tracking-widest">
              <TrendingUp className="h-3 w-3 text-rose-500" /> Recovered
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card shadow-lg border-none border-t-4 border-emerald-500 bg-white">
          <CardHeader className="pb-2 p-4">
            <p className="text-[9px] font-black uppercase text-slate-400 tracking-[0.2em]">Disbursed</p>
            <CardTitle className="text-2xl font-black text-emerald-600 tracking-tighter">{formatCurrency(stats.disbursed)}</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="flex items-center gap-1.5 text-[8px] font-bold text-slate-400 uppercase tracking-widest">
              <Users className="h-3 w-3 text-emerald-500" /> New Loans
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card shadow-lg border-none border-t-4 border-amber-500 bg-white">
          <CardHeader className="pb-2 p-4">
            <p className="text-[9px] font-black uppercase text-slate-400 tracking-[0.2em]">Interest</p>
            <CardTitle className="text-2xl font-black text-amber-600 tracking-tighter">{formatCurrency(stats.interest)}</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="flex items-center gap-1.5 text-[8px] font-bold text-slate-400 uppercase tracking-widest">
              <PieIcon className="h-3 w-3 text-amber-500" /> Profit
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card shadow-lg border-none border-t-4 border-blue-500 bg-white">
          <CardHeader className="pb-2 p-4">
            <p className="text-[9px] font-black uppercase text-slate-400 tracking-[0.2em]">Doc Chg</p>
            <CardTitle className="text-2xl font-black text-blue-600 tracking-tighter">{formatCurrency(stats.docCharges)}</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="flex items-center gap-1.5 text-[8px] font-bold text-slate-400 uppercase tracking-widest">
              <FileText className="h-3 w-3 text-blue-500" /> Fees
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card shadow-lg border-none border-t-4 border-rose-400 bg-white">
          <CardHeader className="pb-2 p-4">
            <p className="text-[9px] font-black uppercase text-slate-400 tracking-[0.2em]">Expenses</p>
            <CardTitle className="text-2xl font-black text-rose-500 tracking-tighter">{formatCurrency(stats.expenses)}</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="flex items-center gap-1.5 text-[8px] font-bold text-slate-400 uppercase tracking-widest text-rose-300">
              <Download className="h-3 w-3 text-rose-400" /> Maintenance
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card shadow-lg border-none border-t-4 border-indigo-500 bg-white">
          <CardHeader className="pb-2 p-4">
            <p className="text-[9px] font-black uppercase text-slate-400 tracking-[0.2em]">Penalties</p>
            <CardTitle className="text-2xl font-black text-indigo-600 tracking-tighter">{formatCurrency(stats.penalties)}</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="flex items-center gap-1.5 text-[8px] font-bold text-slate-400 uppercase tracking-widest">
              <TrendingUp className="h-3 w-3 text-indigo-500" /> Extra Fine
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card shadow-lg border-none border-t-4 border-purple-500 bg-white">
          <CardHeader className="pb-2 p-4">
            <p className="text-[9px] font-black uppercase text-slate-400 tracking-[0.2em]">Extra Col</p>
            <CardTitle className="text-2xl font-black text-purple-600 tracking-tighter">{formatCurrency(stats.extraCol)}</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="flex items-center gap-1.5 text-[8px] font-bold text-slate-400 uppercase tracking-widest">
              <PlusCircle className="h-3 w-3 text-purple-500" /> Misc Income
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card shadow-xl border-none bg-slate-900 text-white relative overflow-hidden">
          <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-white/5 to-transparent pointer-events-none" />
          <CardHeader className="pb-1 p-4 relative z-10">
            <p className="text-[9px] font-black uppercase text-slate-400 tracking-[0.2em]">Total</p>
            <CardTitle className="text-2xl font-black tracking-tighter">{formatCurrency(stats.total)}</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 relative z-10">
            <div className="flex flex-col gap-0.5">
              <div className="flex justify-between items-center">
                <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest">CASH</p>
                <p className="text-[9px] font-black text-emerald-400">{formatCurrency(stats.cash)}</p>
              </div>
              <div className="flex justify-between items-center">
                <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest">UPI</p>
                <p className="text-[9px] font-black text-indigo-400">{formatCurrency(stats.online)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="details" className="space-y-6">
        <TabsList className="bg-slate-100 p-1 rounded-xl">
          <TabsTrigger value="details" className="rounded-lg px-6 py-2">Transaction Details</TabsTrigger>
          <TabsTrigger value="overview" className="rounded-lg px-6 py-2">Analytics Overview</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="glass-card border-none shadow-sm">
              <CardHeader className="border-b border-slate-50">
                <CardTitle className="text-sm font-bold flex items-center gap-2 text-primary/70 uppercase tracking-widest">
                  <PieIcon className="h-4 w-4 text-accent" /> Mode Distribution
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[300px] flex items-center justify-center mt-4">
                {pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        innerRadius={80}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                      <Legend verticalAlign="bottom" height={36} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-muted-foreground italic">No data available for selected date</p>
                )}
              </CardContent>
            </Card>

            <Card className="glass-card border-none shadow-sm">
              <CardHeader className="border-b border-slate-50">
                <CardTitle className="text-sm font-bold flex items-center gap-2 text-primary/70 uppercase tracking-widest">
                  <Users className="h-4 w-4 text-accent" /> Member Performance
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[300px] mt-4">
                {barData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData}>
                      <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                      <Tooltip formatter={(value) => formatCurrency(Number(value))} cursor={{ fill: '#f8fafc' }} />
                      <Bar dataKey="value" fill="#0F172A" radius={[4, 4, 0, 0]} barSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-muted-foreground italic">No data available</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="details">
          <Card className="glass-card border-none shadow-sm overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-primary/70 uppercase tracking-widest">
                <FileText className="h-4 w-4" /> Transaction Registry
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                    <th className="p-4 text-[10px] uppercase tracking-widest font-bold text-muted-foreground">S.No</th>
                    <th className="p-4 text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Account No</th>
                    <th className="p-4 text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Member</th>
                    <th className="p-4 text-[10px] uppercase tracking-widest font-bold text-muted-foreground text-right">Collection</th>
                    <th className="p-4 text-[10px] uppercase tracking-widest font-bold text-muted-foreground text-right">Fine/Extra</th>
                    <th className="p-4 text-[10px] uppercase tracking-widest font-bold text-muted-foreground text-center">Mode</th>
                    <th className="p-4 text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Purpose</th>
                    <th className="p-4 text-[10px] uppercase tracking-widest font-bold text-muted-foreground text-right">Category</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {data.map((item, idx) => (
                    <motion.tr
                      key={idx}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: idx * 0.05 }}
                      className="hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="px-6 py-4 text-[10px] font-bold text-slate-300">
                        {String(idx + 1).padStart(2, '0')}
                      </td>
                      <td className="px-6 py-4 text-sm font-black text-slate-900 tracking-tight">
                        {item.accountNo}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-700">{item.memberName || item.name}</span>
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{item.village || 'N/A'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {!item.isDisbursement ? (
                          <span className="text-sm font-black text-emerald-600">
                            {formatCurrency(item.amount)}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex flex-col items-end">
                          {item.penaltyAmount > 0 && <span className="text-sm font-black text-rose-500">+{formatCurrency(item.penaltyAmount)} Fine</span>}
                          {item.extraAmount > 0 && <span className="text-sm font-black text-indigo-500">+{formatCurrency(item.extraAmount)} Extra</span>}
                          {!(item.penaltyAmount > 0 || item.extraAmount > 0) && <span className="text-xs text-slate-300">—</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest px-2 border-slate-200">
                          {item.payMode}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-[10px] font-bold text-slate-500 truncate max-w-[120px]">{item.purpose || "—"}</p>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          {item.status || 'Active'}
                        </span>
                      </td>
                    </motion.tr>
                  ))}
                  {data.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-20 text-center text-slate-400 italic text-sm">
                        No transactions recorded for this period
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
};

export default Reports;
