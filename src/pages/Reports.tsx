import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLine } from "@/contexts/LineContext";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, Timestamp, orderBy } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { cn, formatCurrency, formatDate, formatCurrencyPDF } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, TrendingUp, PieChart as PieIcon, Users, Calendar, Download, FileSpreadsheet, PlusCircle, ShieldCheck, Info, ArrowUpRight, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { CustomDatePicker } from "@/components/ui/CustomDatePicker";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { exportToExcel } from "@/lib/excel";

const COLORS = ["#0F172A", "#D4AF37", "#64748B", "#F59E0B", "#10B981"];

const Reports = () => {
  const { userData } = useAuth();
  const { selectedLineId, lines } = useLine();
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [expenseLogs, setExpenseLogs] = useState<any[]>([]);
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);
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
    agentCol: 0,
    adminCol: 0,
    byAgent: {} as Record<string, number>,
  });

  const fetchReportData = async (selectedDate: string) => {
    setLoading(true);
    try {
      if (!selectedLineId) {
        setData([]);
        setStats({ total: 0, cash: 0, online: 0, principal: 0, interest: 0, docCharges: 0, disbursed: 0, expenses: 0, penalties: 0, extraCol: 0, agentCol: 0, adminCol: 0, byAgent: {} });
        setLoading(false);
        return;
      }

      const adminUsersSnap = await getDocs(query(collection(db, "users"), where("role", "in", ["super_admin", "admin"])));
      const adminIdsSet = new Set(adminUsersSnap.docs.map(d => d.id));

      const baseQ = query(collection(db, "postings"), where("date", "==", selectedDate), where("lineId", "==", selectedLineId));
      const baseSnap = await getDocs(baseQ);
      const docs = baseSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((d: any) => ((userData?.role === "admin" || userData?.role === "partner") ? d.adminId === userData.uid : true));

      const accQ = query(collection(db, "accounts"), where("lineId", "==", selectedLineId), where("creationDate", "==", selectedDate));
      const accSnap = await getDocs(accQ);
      
      let newPrincipal = 0;
      let newInterest = 0;
      let newDocCharges = 0;
      
      const newAccounts = accSnap.docs
        .filter(d => d.data().creationDate === selectedDate) 
        .map(d => {
          const a = d.data();
          const p = parseFloat(a.loanAmount || "0");
          const i = parseFloat(a.interestAmount || "0");
          newPrincipal += p;
          newInterest += i;
          newDocCharges += parseFloat(a.documentCharge || "0");
          if (a.creationDate && a.paymentFrequency) {
            const start = new Date(a.creationDate);
          }
          return {
            ...a, id: d.id, isNewAccount: true,
            amount: p,
            memberName: a.memberName || a.name,
            payMode: a.paymentType || "CASH",
            status: "New Account",
            originalStatus: a.status,
            isDisbursement: true
          };
        });

      let totalInflow = 0; let cashIn = 0; let onlineIn = 0; let penalties = 0; let extraCol = 0;
      let agentCol = 0; let adminCol = 0;
      let docChargesTotal = 0;
      const byAgent: Record<string, number> = {};

      newAccounts.forEach((acc: any) => {
        const dc = parseFloat(acc.documentCharge || "0");
        if (dc > 0) {
          docChargesTotal += dc;
        }
      });

      docs.forEach((item: any) => {
        const amt = item.amount || 0;
        const pAmt = item.penaltyAmount || 0;
        const eAmt = item.extraAmount || 0;
        const itemTotal = amt + pAmt + eAmt;
        const status = item.status?.toLowerCase();
        
        if (status === "disbursement" || status === "charge") return;

        if (status === "extra_transfer_out") {
          if (item.payMode?.toLowerCase() === "online" || item.payMode?.toLowerCase() === "upi") {
            onlineIn -= amt;
          } else {
            cashIn -= amt;
          }
          
          if (adminIdsSet.has(item.collectedById)) adminCol -= amt;
          else agentCol -= amt;
          return;
        }

        if (["collection", "extra_collection", "penalty"].includes(status)) {
          if (item.payMode?.toLowerCase() === "online" || item.payMode?.toLowerCase() === "upi") {
            onlineIn += itemTotal;
          } else {
            cashIn += itemTotal;
          }
          
          penalties += pAmt;
          extraCol += eAmt;

          const agentName = item.collectedByName || "Unknown";
          byAgent[agentName] = (byAgent[agentName] || 0) + itemTotal;

          if (adminIdsSet.has(item.collectedById)) adminCol += itemTotal;
          else agentCol += itemTotal;
        }
      });

      totalInflow = cashIn + onlineIn;

      const combinedData = [
        ...docs.filter((d: any) => ["collection", "penalty", "extra_collection", "extra_transfer_out"].includes(d.status?.toLowerCase())),
        ...newAccounts
      ].sort((a: any, b: any) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      setData(combinedData);

      let expensesValue = 0;
      const expSnap = await getDocs(query(collection(db, "day_summaries"), where("date", "==", selectedDate), where("lineId", "==", selectedLineId)));
      expSnap.forEach(d => expensesValue += (d.data().expenses || 0));

      const logSnap = await getDocs(query(collection(db, "expenses_log"), where("date", "==", selectedDate), where("lineId", "==", selectedLineId)));
      const logs = logSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setExpenseLogs(logs);

      setStats({ 
        total: totalInflow, 
        cash: cashIn, 
        online: onlineIn, 
        principal: newPrincipal, 
        interest: newInterest, 
        docCharges: docChargesTotal, 
        disbursed: newPrincipal, 
        expenses: expensesValue, 
        penalties, 
        extraCol, 
        byAgent,
        agentCol,
        adminCol
      });
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

    const activeLine = lines.find(l => l.id === selectedLineId);
    const lineName = activeLine?.name || "Consolidated Portfolio";

    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.setTextColor(15, 23, 42); 
    doc.text("SriDeviGroups Of Finance", 14, 22);

    doc.setFontSize(14);
    doc.text(`Audit Report: ${lineName}`, 14, 30);

    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 38);
    doc.text(`Report Date: ${formatDate(date)}`, 14, 43);

    const tableColumn = ["S.No", "Account No", "Member Name", "Collection", "Payment", "Mode", "Category"];
    const tableRows = data.map((item, idx) => [
      String(idx + 1).padStart(2, '0'),
      item.accountNo,
      item.memberName || item.name || "N/A",
      !item.isDisbursement ? formatCurrencyPDF(item.amount + (item.extraAmount || 0)) : "—",
      item.isDisbursement ? formatCurrencyPDF(item.amount) : "—",
      (item.payMode?.toUpperCase() || "—") + (item.note ? ` (${item.note})` : ""),
      `${item.collectedByRole === 'agent' ? 'AGENT' : 'ADMIN'} ${item.status?.toUpperCase() || "COLLECTION"}`,
    ]);

    doc.text(`Total Expenses: ${formatCurrencyPDF(stats.expenses)}`, 14, 50);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 55,
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
      "Telugu Name": item.nameTelugu || "",
      "Collection": !item.isDisbursement ? item.amount : 0,
      "Disbursement": item.isDisbursement ? item.amount : 0,
      "Penalty": item.penaltyAmount || 0,
      "Extra": item.extraAmount || 0,
      "Doc Charges": item.documentCharge || 0,
      "Daily Expenses": stats.expenses,
      "Mode": (item.payMode || "").toUpperCase() + (item.note ? ` (${item.note})` : ""),
      "Category": (item.status || "").toUpperCase(),
      "Creation Date": item.creationDate || ""
    }));

    const activeLine = lines.find(l => l.id === selectedLineId);
    const lineName = activeLine?.name || "Consolidated_Portfolio";

    exportToExcel(excelData, `Financial_Report_${lineName.replace(/\s+/g, "_")}_${date}`, "Report");
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
        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
          <CustomDatePicker value={date} onChange={setDate} />
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => window.print()} 
            className="h-10 rounded-xl gap-2 border-slate-200 font-bold hover:bg-slate-50 transition-all print:hidden"
          >
            <Printer className="h-4 w-4" /> <span className="hidden xs:inline">Print / Save PDF (Telugu)</span><span className="xs:hidden">Print</span>
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleExportPDF} 
            className="h-10 rounded-xl gap-2 border-slate-200 font-bold hover:bg-slate-50 transition-all print:hidden"
          >
            <Download className="h-4 w-4" /> PDF
          </Button>
          <Button
            variant="outline"
            className="h-10 rounded-xl gap-2 bg-white/50 backdrop-blur-sm border-slate-200 text-emerald-600 hover:bg-emerald-50 font-bold"
            onClick={handleExportExcel}
          >
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <Card className="glass-card shadow-lg border-none border-t-4 border-rose-500 bg-white">
          <CardHeader className="pb-2 p-4">
            <p className="text-[9px] font-black uppercase text-slate-400 tracking-[0.2em]">New Accounts Principal</p>
            <CardTitle className="text-2xl font-black text-rose-600 tracking-tighter">{formatCurrency(stats.principal)}</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="flex items-center gap-1.5 text-[8px] font-bold text-slate-400 uppercase tracking-widest">
              <TrendingUp className="h-3 w-3 text-rose-500" /> Capital
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card shadow-lg border-none border-t-4 border-amber-500 bg-white">
          <CardHeader className="pb-2 p-4">
            <p className="text-[9px] font-black uppercase text-slate-400 tracking-[0.2em]">New Accounts Interest</p>
            <CardTitle className="text-2xl font-black text-amber-600 tracking-tighter">{formatCurrency(stats.interest)}</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="flex items-center gap-1.5 text-[8px] font-bold text-slate-400 uppercase tracking-widest">
              <PieIcon className="h-3 w-3 text-amber-500" /> Expected Profit
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card shadow-lg border-none border-t-4 border-emerald-500 bg-white">
          <CardHeader className="pb-2 p-4">
            <p className="text-[9px] font-black uppercase text-slate-400 tracking-[0.2em]">Agent Collection</p>
            <CardTitle className="text-2xl font-black text-emerald-600 tracking-tighter">{formatCurrency(stats.agentCol)}</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="flex items-center gap-1.5 text-[8px] font-bold text-slate-400 uppercase tracking-widest">
              <Users className="h-3 w-3 text-emerald-500" /> Field Agents
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card shadow-lg border-none border-t-4 border-indigo-500 bg-white">
          <CardHeader className="pb-2 p-4">
            <p className="text-[9px] font-black uppercase text-slate-400 tracking-[0.2em]">Admin Collection</p>
            <CardTitle className="text-2xl font-black text-indigo-600 tracking-tighter">{formatCurrency(stats.adminCol)}</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="flex items-center gap-1.5 text-[8px] font-bold text-slate-400 uppercase tracking-widest">
              <ShieldCheck className="h-3 w-3 text-indigo-500" /> Admin/Super
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

        <Card 
          onClick={() => setShowExpenseDialog(true)} 
          className="glass-card shadow-lg border-none border-t-4 border-purple-500 bg-white cursor-pointer hover:scale-105 transition-all duration-300 group"
        >
          <CardHeader className="pb-2 p-4">
            <p className="text-[9px] font-black uppercase text-slate-400 tracking-[0.2em]">Expenses</p>
            <CardTitle className="text-2xl font-black text-rose-500 tracking-tighter">{formatCurrency(stats.expenses)}</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="flex items-center gap-1.5 text-[8px] font-bold text-slate-400 uppercase tracking-widest text-rose-300 group-hover:text-rose-500 transition-colors">
              <Download className="h-3 w-3 text-rose-400" /> View Details
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xl border-none bg-slate-900 text-white relative overflow-hidden">
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
                    <th className="p-4 text-[10px] uppercase tracking-widest font-bold text-muted-foreground text-right">Inflow (Coll)</th>
                    <th className="p-4 text-[10px] uppercase tracking-widest font-bold text-muted-foreground text-right">Outflow (Loan)</th>
                    <th className="p-4 text-[10px] uppercase tracking-widest font-bold text-muted-foreground text-center">Mode</th>
                    <th className="p-4 text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Details/Interest</th>
                    <th className="p-4 text-[10px] uppercase tracking-widest font-bold text-muted-foreground text-right">Collector</th>
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
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-700">{item.memberName || item.name}</span>
                            {item.originalStatus === "deleted" && (
                              <span className="text-[8px] bg-rose-100 text-rose-600 font-black px-2 py-0.5 rounded-full uppercase tracking-wider">Deleted</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{item.village || 'N/A'}</span>
                            {item.nameTelugu && <span className="text-[11px] font-bold text-slate-500 font-telugu">{item.nameTelugu}</span>}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {!item.isDisbursement ? (
                          <div className="flex flex-col items-end">
                            <span className="text-sm font-black text-emerald-600">
                              {formatCurrency(item.amount)}
                            </span>
                            {item.penaltyAmount > 0 && <span className="text-[9px] font-bold text-rose-500">+{formatCurrency(item.penaltyAmount)} Fine</span>}
                            {item.extraAmount > 0 && <span className="text-[9px] font-bold text-indigo-500">+{formatCurrency(item.extraAmount)} Extra</span>}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {item.isDisbursement ? (
                          <span className="text-sm font-black text-rose-600">
                            {formatCurrency(item.loanAmount || item.amount)}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col items-center gap-1">
                          <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest px-2 border-slate-200 w-max">
                            {item.payMode}
                          </Badge>
                          {item.note && (
                            <span className="text-[9px] font-medium text-slate-500 max-w-[120px] truncate" title={item.note}>
                              {item.note}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <p className="text-[10px] font-bold text-slate-500 truncate max-w-[150px]">
                            {item.isDisbursement ? `Int: ${formatCurrency(item.interestAmount || 0)}` : (item.purpose || "Regular Posting")}
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Badge className={cn(
                          "text-[9px] font-black uppercase tracking-widest",
                          item.isDisbursement ? "bg-rose-100 text-rose-700 hover:bg-rose-100" : "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                        )}>
                          {item.isDisbursement ? 'Disbursement' : `${(item.collectedByRole || 'Admin').replace('_', ' ')} ${item.status || 'Collection'}`}
                        </Badge>
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

      <Dialog open={showExpenseDialog} onOpenChange={setShowExpenseDialog}>
        <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden border-none shadow-2xl glass-card">
          <div className="bg-slate-900 p-6 text-white">
             <DialogTitle className="text-xl font-black italic uppercase tracking-tight flex items-center gap-2">
                <FileText size={20} className="text-accent" />
                Expense Registry
             </DialogTitle>
             <DialogDescription className="text-slate-400 text-xs mt-1">
                Detailed expenditure logs for {formatDate(date)}
             </DialogDescription>
          </div>
          <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
             {expenseLogs.length === 0 ? (
               <div className="py-10 text-center space-y-3">
                  <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-300">
                     <Info size={24} />
                  </div>
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest">No expenses recorded for this day</p>
               </div>
             ) : expenseLogs.map((log: any) => (
               <div key={log.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex justify-between items-start group hover:bg-white hover:shadow-md transition-all">
                  <div className="space-y-1">
                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{log.collectedByName || "System"}</p>
                     <h4 className="font-black text-slate-900 uppercase text-xs">{log.note || "Daily Expense"}</h4>
                     <p className="text-[8px] font-bold text-slate-400">{log.createdAt ? new Date(log.createdAt).toLocaleTimeString() : ""}</p>
                  </div>
                  <div className="text-right">
                     <p className="text-md font-black text-rose-500">-{formatCurrency(log.amount)}</p>
                     <Badge className="text-[8px] bg-slate-200 text-slate-600 border-none font-black uppercase mt-1">
                        {log.userRole === 'super_admin' || log.userRole === 'admin' ? 'Admin' : 'Agent'}
                     </Badge>
                  </div>
               </div>
             ))}
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default Reports;
