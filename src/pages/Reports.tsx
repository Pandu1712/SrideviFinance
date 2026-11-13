import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useLine } from "@/contexts/LineContext";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, Timestamp, orderBy } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { cn, formatCurrency, formatDate, formatCurrencyPDF } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Filter, TrendingUp, PieChart as PieIcon, Users, Calendar, Download, FileSpreadsheet, PlusCircle, ShieldCheck, Info, ArrowUpRight, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CustomDatePicker } from "@/components/ui/CustomDatePicker";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { exportToExcel } from "@/lib/excel";

const COLORS = ["#0F172A", "#D4AF37", "#64748B", "#F59E0B", "#10B981"];

const Reports = () => {
  const { language } = useLanguage();
  const localTranslations = {
    en: {
      financialReports: "Financial Reports",
      reportsSubtitle: "Deep dive into collection trends and performance metrics.",
      newAccountsPrincipal: "New Accounts Principal",
      newAccountsInterest: "New Accounts Interest",
      agentCollection: "Agent Collection",
      adminCollection: "Admin Collection",
      docChg: "Doc Chg",
      expenses: "Expenses",
      total: "Total",
      analyticsOverview: "Analytics Overview",
      modeDistribution: "Mode Distribution",
      memberPerformance: "Member Performance",
      transactionRegistry: "Transaction Registry",
      transactionDetails: "Transaction Details",
      slNo: "S.No",
      accountNo: "Account No",
      member: "Member",
      inflow: "Inflow (Coll)",
      outflow: "Outflow (Loan)",
      mode: "Mode",
      detailsInterest: "Details/Interest",
      collector: "Collector",
      collectedBy: "Collected By",
      allCollectors: "All Collectors",
      otherInflows: "Other Inflows",
      adminsOnly: "All Admins",
      agentsOnly: "All Agents"
    },
    te: {
      financialReports: "ఆర్థిక నివేదికలు (Financial Reports)",
      reportsSubtitle: "కలెక్షన్ పోకడలు మరియు పనితీరు కొలమానాల విశ్లేషణ.",
      newAccountsPrincipal: "కొత్త ఖాతాల అసలు (Principal)",
      newAccountsInterest: "కొత్త ఖాతాల వడ్డీ (Interest)",
      agentCollection: "ఏజెంట్ కలెక్షన్",
      adminCollection: "అడ్మిన్ కలెక్షన్",
      docChg: "డాక్యుమెంట్ చార్జీలు",
      expenses: "ఖర్చులు (Expenses)",
      total: "మొత్తం (Total)",
      analyticsOverview: "విశ్లేషణ అవలోకనం",
      modeDistribution: "చెల్లింపు పద్ధతుల పంపిణీ",
      memberPerformance: "సభ్యుల పనితీరు",
      transactionRegistry: "లావాదేవీల రిజిస్ట్రీ",
      transactionDetails: "లావాదేవీల వివరాలు",
      slNo: "క్ర.సం.",
      accountNo: "ఖాతా సంఖ్య",
      member: "కస్టమర్",
      inflow: "వసూలు (Inflow)",
      outflow: "చెల్లింపు (Outflow)",
      mode: "మోడ్",
      detailsInterest: "వివరాలు / వడ్డీ",
      collector: "వసూలు చేసిన వారు",
      collectedBy: "వసూలు చేసిన వారు (Collected By)",
      allCollectors: "అందరూ కలెక్టర్లు (All Collectors)",
      otherInflows: "ఇతర ఇన్‌ఫ్లోలు (Other Inflows)",
      adminsOnly: "అడ్మిన్లు మాత్రమే (Admins Only)",
      agentsOnly: "ఏజెంట్లు మాత్రమే (Agents Only)"
    }
  };
  const tLocal = (key) => {
    const lang = language === "te" ? "te" : "en";
    return localTranslations[lang][key] || localTranslations.en[key];
  };

  const { userData } = useAuth();
  const { selectedLineId, lines } = useLine();
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [data, setData] = useState<any[]>([]);
  const [selectedCollector, setSelectedCollector] = useState<string>("all");
  const [loading, setLoading] = useState(false);

  // Extract unique collectors from data
  const uniqueCollectors = useMemo(() => {
    const map = new Map<string, { name: string; role: string }>();
    data.forEach((item: any) => {
      const name = (item.collectedByName || "").trim();
      if (name && !map.has(name.toLowerCase())) {
        map.set(name.toLowerCase(), {
          name,
          role: (item.collectedByRole || "").toLowerCase()
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  // Filtered data based on selected collector/role
  const filteredData = useMemo(() => {
    if (selectedCollector === "all") return data;
    if (selectedCollector === "role_admin") {
      return data.filter((item: any) => {
        const role = (item.collectedByRole || "").toLowerCase();
        return role === "admin" || role === "super_admin" || item.isDisbursement;
      });
    }
    if (selectedCollector === "role_agent") {
      return data.filter((item: any) => {
        const role = (item.collectedByRole || "").toLowerCase();
        return role === "agent" && !item.isDisbursement;
      });
    }
    if (selectedCollector.startsWith("user_")) {
      const target = selectedCollector.replace("user_", "").toLowerCase();
      return data.filter((item: any) => (item.collectedByName || "").trim().toLowerCase() === target);
    }
    return data;
  }, [data, selectedCollector]);
  const [expenseLogs, setExpenseLogs] = useState<any[]>([]);
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);
  const [registryTab, setRegistryTab] = useState<'expense' | 'inflow'>('expense');
  const [stats, setStats] = useState({
    total: 0,
    cash: 0,
    online: 0,
    principal: 0,
    interest: 0,
    docCharges: 0,
    disbursed: 0,
    expenses: 0,
    manualInflows: 0,
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
        setStats({ total: 0, cash: 0, online: 0, principal: 0, interest: 0, docCharges: 0, disbursed: 0, expenses: 0, manualInflows: 0, penalties: 0, extraCol: 0, agentCol: 0, adminCol: 0, byAgent: {} });
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
          const isAdm = adminIdsSet.has(a.adminId) || !a.agentId;
          return {
            ...a, id: d.id, isNewAccount: true,
            amount: p,
            memberName: a.memberName || a.name,
            payMode: a.paymentType === "split" 
              ? `SPLIT (Cash: ₹${(parseFloat(a.splitCashAmount || "0") || 0).toLocaleString("en-IN")}, ${a.splitOnlineType === "account" ? "Bank" : "UPI"}: ₹${(parseFloat(a.splitOnlineAmount || "0") || 0).toLocaleString("en-IN")})`
              : (a.paymentType || "CASH"),
            status: "New Account",
            originalStatus: a.status,
            isDisbursement: true,
            collectedByName: a.collectedByName || a.adminName || a.agentName || (isAdm ? "Super Admin" : "Agent"),
            collectedByRole: a.collectedByRole || (isAdm ? "super_admin" : "agent")
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
          if (item.payMode?.toLowerCase() === "split") {
            const sCash = Number(item.splitCashAmount) || 0;
            const sOnline = Number(item.splitOnlineAmount) || 0;
            cashIn += sCash;
            onlineIn += sOnline;
          } else if (item.payMode?.toLowerCase() === "online" || item.payMode?.toLowerCase() === "upi" || item.payMode?.toLowerCase() === "bank") {
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
      let manualInflowsSummary = 0;
      const expSnap = await getDocs(query(collection(db, "day_summaries"), where("date", "==", selectedDate), where("lineId", "==", selectedLineId)));
      expSnap.forEach(d => {
        expensesValue += (d.data().expenses || 0);
        manualInflowsSummary += (d.data().manualInflows || 0);
      });

      const logSnap = await getDocs(query(collection(db, "expenses_log"), where("date", "==", selectedDate), where("lineId", "==", selectedLineId)));
      const logs = logSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setExpenseLogs(logs);

      const realExpenses = logs.filter((l: any) => l.type !== 'inflow').reduce((acc: number, l: any) => acc + (Number(l.amount) || 0), 0);
      const realInflows = logs.filter((l: any) => l.type === 'inflow').reduce((acc: number, l: any) => acc + (Number(l.amount) || 0), 0);

      const finalExpenses = logs.some((l: any) => l.type !== 'inflow') ? realExpenses : expensesValue;
      const finalManualInflows = logs.some((l: any) => l.type === 'inflow') ? realInflows : manualInflowsSummary;

      setStats({ 
        total: totalInflow, 
        cash: cashIn, 
        online: onlineIn, 
        principal: newPrincipal, 
        interest: newInterest, 
        docCharges: docChargesTotal, 
        disbursed: newPrincipal, 
        expenses: finalExpenses,
        manualInflows: finalManualInflows,
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
    setSelectedCollector("all");
    fetchReportData(date);
  }, [date, selectedLineId]);

  const pieData = [
    { name: "Cash", value: stats.cash },
    { name: "Online", value: stats.online },
  ].filter(d => d.value > 0);

  const barData = Object.entries(stats.byAgent).map(([name, value]) => ({ name, value }));

  const handleExportPDF = () => {
    const exportItems = filteredData;
    if (exportItems.length === 0) {
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

    const tableColumn = ["S.No", "Account No", "Collection (Inflow)", "Member Name", "Payment (Outflow)", "Mode", "Category"];
    const tableRows = exportItems.map((item, idx) => [
      String(idx + 1).padStart(2, '0'),
      item.accountNo,
      !item.isDisbursement ? formatCurrencyPDF(item.amount + (item.extraAmount || 0)) : "—",
      item.memberName || item.name || "N/A",
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
    const exportItems = filteredData;
    if (exportItems.length === 0) {
      toast.error("No data to export");
      return;
    }

    const excelData = exportItems.map((item, idx) => ({
      "S.No": idx + 1,
      "Account No": item.accountNo,
      "Collection (Inflow)": !item.isDisbursement ? item.amount : 0,
      "Member Name": item.memberName || item.name,
      "Telugu Name": item.nameTelugu || "",
      "Disbursement (Outflow)": item.isDisbursement ? item.amount : 0,
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
            <h1 className="text-3xl font-extrabold tracking-tight text-primary">{tLocal("financialReports")}</h1>
            <p className="text-muted-foreground">{tLocal("reportsSubtitle")}</p>
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

      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="glass-card shadow-lg border-none border-t-4 border-rose-500 bg-white">
          <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-4">
            <p className="text-[9px] font-black uppercase text-slate-400 tracking-[0.2em]">{tLocal("newAccountsPrincipal")}</p>
            <CardTitle className="text-lg sm:text-2xl font-black text-rose-600 truncate tracking-tighter">{formatCurrency(stats.principal)}</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 sm:px-4 sm:pb-4">
            <div className="flex items-center gap-1.5 text-[8px] font-bold text-slate-400 uppercase tracking-widest">
              <TrendingUp className="h-3 w-3 text-rose-500" /> Capital
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card shadow-lg border-none border-t-4 border-amber-500 bg-white">
          <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-4">
            <p className="text-[9px] font-black uppercase text-slate-400 tracking-[0.2em]">{tLocal("newAccountsInterest")}</p>
            <CardTitle className="text-lg sm:text-2xl font-black text-amber-600 truncate tracking-tighter">{formatCurrency(stats.interest)}</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 sm:px-4 sm:pb-4">
            <div className="flex items-center gap-1.5 text-[8px] font-bold text-slate-400 uppercase tracking-widest">
              <PieIcon className="h-3 w-3 text-amber-500" /> Expected Profit
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card shadow-lg border-none border-t-4 border-emerald-500 bg-white">
          <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-4">
            <p className="text-[9px] font-black uppercase text-slate-400 tracking-[0.2em]">{tLocal("agentCollection")}</p>
            <CardTitle className="text-lg sm:text-2xl font-black text-emerald-600 truncate tracking-tighter">{formatCurrency(stats.agentCol)}</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 sm:px-4 sm:pb-4">
            <div className="flex items-center gap-1.5 text-[8px] font-bold text-slate-400 uppercase tracking-widest">
              <Users className="h-3 w-3 text-emerald-500" /> Field Agents
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card shadow-lg border-none border-t-4 border-indigo-500 bg-white">
          <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-4">
            <p className="text-[9px] font-black uppercase text-slate-400 tracking-[0.2em]">{tLocal("adminCollection")}</p>
            <CardTitle className="text-lg sm:text-2xl font-black text-indigo-600 truncate tracking-tighter">{formatCurrency(stats.adminCol)}</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 sm:px-4 sm:pb-4">
            <div className="flex items-center gap-1.5 text-[8px] font-bold text-slate-400 uppercase tracking-widest">
              <ShieldCheck className="h-3 w-3 text-indigo-500" /> Admin/Super
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card shadow-lg border-none border-t-4 border-blue-500 bg-white">
          <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-4">
            <p className="text-[9px] font-black uppercase text-slate-400 tracking-[0.2em]">{tLocal("docChg")}</p>
            <CardTitle className="text-lg sm:text-2xl font-black text-blue-600 truncate tracking-tighter">{formatCurrency(stats.docCharges)}</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 sm:px-4 sm:pb-4">
            <div className="flex items-center gap-1.5 text-[8px] font-bold text-slate-400 uppercase tracking-widest">
              <FileText className="h-3 w-3 text-blue-500" /> Fees
            </div>
          </CardContent>
        </Card>

        <Card 
          onClick={() => { setRegistryTab("expense"); setShowExpenseDialog(true); }} 
          className="glass-card shadow-lg border-none border-t-4 border-purple-500 bg-white cursor-pointer hover:scale-105 transition-all duration-300 group"
        >
          <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-4">
            <p className="text-[9px] font-black uppercase text-slate-400 tracking-[0.2em]">{tLocal("expenses")}</p>
            <CardTitle className="text-lg sm:text-2xl font-black text-rose-500 truncate tracking-tighter">{formatCurrency(stats.expenses)}</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 sm:px-4 sm:pb-4">
            <div className="flex items-center gap-1.5 text-[8px] font-bold text-slate-400 uppercase tracking-widest text-rose-300 group-hover:text-rose-500 transition-colors">
              <Download className="h-3 w-3 text-rose-400" /> View Details
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xl border-none bg-slate-900 text-white relative overflow-hidden">
          <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-white/5 to-transparent pointer-events-none" />
          <CardHeader className="pb-1 p-4 relative z-10">
            <p className="text-[9px] font-black uppercase text-slate-400 tracking-[0.2em]">{tLocal("total")}</p>
            <CardTitle className="text-lg sm:text-2xl font-black tracking-tighter truncate">{formatCurrency(stats.total)}</CardTitle>
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

        <Card 
          onClick={() => { setRegistryTab("inflow"); setShowExpenseDialog(true); }}
          className="glass-card shadow-lg border-none border-t-4 border-emerald-500 bg-white cursor-pointer hover:scale-105 transition-all duration-300 group"
        >
          <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-4">
            <p className="text-[9px] font-black uppercase text-slate-400 tracking-[0.2em]">{tLocal("otherInflows") || "OTHER INFLOWS"}</p>
            <CardTitle className="text-lg sm:text-2xl font-black text-emerald-600 truncate tracking-tighter">+{formatCurrency(stats.manualInflows)}</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 sm:px-4 sm:pb-4">
            <div className="flex items-center gap-1.5 text-[8px] font-bold text-slate-400 uppercase tracking-widest text-emerald-500/80 group-hover:text-emerald-600 transition-colors">
              <PlusCircle className="h-3 w-3 text-emerald-500" /> Daily Inflow (Info)
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="details" className="space-y-6">
        <TabsList className="bg-slate-100 p-1 rounded-xl w-full sm:w-auto grid grid-cols-2 sm:inline-flex">
          <TabsTrigger value="details" className="rounded-lg px-2 sm:px-6 py-2 text-xs sm:text-sm font-bold truncate">
            {tLocal("transactionDetails") || "Transaction Details"}
          </TabsTrigger>
          <TabsTrigger value="overview" className="rounded-lg px-2 sm:px-6 py-2 text-xs sm:text-sm font-bold truncate">
            {tLocal("analyticsOverview") || "Analytics Overview"}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="glass-card border-none shadow-sm">
              <CardHeader className="border-b border-slate-50">
                <CardTitle className="text-sm font-bold flex items-center gap-2 text-primary/70 uppercase tracking-widest">
                  <PieIcon className="h-4 w-4 text-accent" /> {tLocal("modeDistribution")}
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
                  <Users className="h-4 w-4 text-accent" /> {tLocal("memberPerformance")}
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
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-3 sm:px-6 sm:py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center justify-between gap-2 w-full sm:w-auto">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-xs sm:text-sm font-black text-slate-800 uppercase tracking-wider whitespace-nowrap">
                    {tLocal("transactionRegistry")}
                  </span>
                </div>
                <Badge variant="outline" className="text-[10px] font-bold text-slate-500 border-slate-200 bg-white px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap shadow-xs">
                  {filteredData.length} of {data.length}
                </Badge>
              </div>

              {/* Filter: Collected By */}
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="hidden sm:flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider shrink-0">
                  <Filter className="h-3.5 w-3.5 text-primary" />
                  <span className="whitespace-nowrap">{tLocal("collectedBy") || "Collected By"}:</span>
                </div>
                <div className="flex items-center gap-1.5 w-full sm:w-auto min-w-0 flex-1 sm:flex-initial">
                  <Select value={selectedCollector} onValueChange={setSelectedCollector}>
                    <SelectTrigger className="h-8 w-full sm:w-[185px] text-xs font-semibold bg-white border-slate-200 rounded-lg shadow-sm focus:ring-1 focus:ring-primary">
                      <div className="flex items-center gap-1.5 truncate">
                        <Filter className="h-3 w-3 text-primary shrink-0 sm:hidden" />
                        <SelectValue placeholder={tLocal("allCollectors") || "All Collectors"} />
                      </div>
                    </SelectTrigger>
                    <SelectContent className="text-xs max-h-72">
                      <SelectItem value="all" className="font-semibold text-slate-800">
                        🌟 {tLocal("allCollectors") || "All Collectors"} ({data.length})
                      </SelectItem>
                      <SelectItem value="role_admin" className="font-semibold text-slate-800">
                        🛡️ {tLocal("adminsOnly") || "All Admins"} ({data.filter((d: any) => (d.collectedByRole === 'admin' || d.collectedByRole === 'super_admin' || d.isDisbursement)).length})
                      </SelectItem>
                      <SelectItem value="role_agent" className="font-semibold text-slate-800">
                        💼 {tLocal("agentsOnly") || "All Agents"} ({data.filter((d: any) => (d.collectedByRole === 'agent' && !d.isDisbursement)).length})
                      </SelectItem>
                      {uniqueCollectors.length > 0 && (
                        <SelectGroup>
                          <SelectLabel className="text-[10px] uppercase font-bold text-slate-400 px-2 py-1.5 border-t border-slate-100 mt-1">
                            Individual Collectors
                          </SelectLabel>
                          {uniqueCollectors.map((c) => {
                            const count = data.filter((d: any) => (d.collectedByName || '').trim().toLowerCase() === c.name.toLowerCase()).length;
                            const isAd = c.role === 'admin' || c.role === 'super_admin';
                            return (
                              <SelectItem key={c.name} value={`user_${c.name.toLowerCase()}`} className="font-medium">
                                {isAd ? '🛡️' : '💼'} {c.name} ({count})
                              </SelectItem>
                            );
                          })}
                        </SelectGroup>
                      )}
                    </SelectContent>
                  </Select>
                  {selectedCollector !== "all" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedCollector("all")}
                      className="h-8 px-2 text-[11px] font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 shrink-0"
                    >
                      Reset
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-left min-w-[780px] sm:min-w-[850px]">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                    <th className="py-3 px-3 sm:px-4 text-[10px] uppercase tracking-wider font-bold text-muted-foreground whitespace-nowrap">{tLocal("slNo")}</th>
                    <th className="py-3 px-3 sm:px-4 text-[10px] uppercase tracking-wider font-bold text-muted-foreground whitespace-nowrap">{tLocal("accountNo")}</th>
                    <th className="py-3 px-3 sm:px-4 text-[10px] uppercase tracking-wider font-bold text-muted-foreground text-right whitespace-nowrap">{tLocal("inflow")}</th>
                    <th className="py-3 px-3 sm:px-4 text-[10px] uppercase tracking-wider font-bold text-muted-foreground whitespace-nowrap min-w-[150px]">{tLocal("member")}</th>
                    <th className="py-3 px-3 sm:px-4 text-[10px] uppercase tracking-wider font-bold text-muted-foreground text-right whitespace-nowrap">{tLocal("outflow")}</th>
                    <th className="py-3 px-3 sm:px-4 text-[10px] uppercase tracking-wider font-bold text-muted-foreground text-center whitespace-nowrap">{tLocal("mode")}</th>
                    <th className="py-3 px-3 sm:px-4 text-[10px] uppercase tracking-wider font-bold text-muted-foreground whitespace-nowrap">{tLocal("detailsInterest")}</th>
                    <th className="py-3 px-3 sm:px-4 text-[10px] uppercase tracking-wider font-bold text-muted-foreground text-right whitespace-nowrap">{tLocal("collector")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredData.map((item, idx) => (
                    <motion.tr
                      key={idx}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: idx * 0.05 }}
                      className="hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="px-3 sm:px-4 py-3 text-[10px] font-bold text-slate-300">
                        {String(idx + 1).padStart(2, '0')}
                      </td>
                      <td className="px-3 sm:px-4 py-3 text-sm font-black text-slate-900 tracking-tight">
                        {item.accountNo}
                      </td>
                      <td className="px-3 sm:px-4 py-3 text-right">
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
                      <td className="px-3 sm:px-4 py-3 min-w-[150px]">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-bold text-slate-700 whitespace-nowrap">{item.memberName || item.name}</span>
                            {item.originalStatus === "deleted" && (
                              <span className="text-[8px] bg-rose-100 text-rose-600 font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider shrink-0">Deleted</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">{item.village || 'N/A'}</span>
                            {item.nameTelugu && <span className="text-[11px] font-bold text-slate-500 font-telugu whitespace-nowrap">{item.nameTelugu}</span>}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 sm:px-4 py-3 text-right">
                        {item.isDisbursement ? (
                          <span className="text-sm font-black text-rose-600">
                            {formatCurrency(item.loanAmount || item.amount)}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-3 sm:px-4 py-3">
                        {item.payMode?.toLowerCase() === 'split' ? (
                          <div className="flex flex-col items-center gap-1 min-w-[130px]">
                            <Badge className="text-[9px] font-black uppercase tracking-widest px-2 bg-purple-100 text-purple-800 border-none w-max">
                              SPLIT
                            </Badge>
                            <span className="text-[10px] font-bold text-slate-700 text-center">
                              {item.note || `Cash: ₹${item.splitCashAmount} + Online: ₹${item.splitOnlineAmount}`}
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-1">
                            <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest px-2 border-slate-200 w-max">
                              {item.payMode}
                            </Badge>
                            {item.note && (
                              <span className="text-[9px] font-medium text-slate-500 whitespace-normal break-words max-w-[140px] text-center" title={item.note}>
                                {item.note}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-3 sm:px-4 py-3">
                        <div className="flex flex-col">
                          <p className="text-[10px] font-bold text-slate-500 truncate max-w-[150px]">
                            {item.isDisbursement ? `Int: ${formatCurrency(item.interestAmount || 0)}` : (item.purpose || "Regular Posting")}
                          </p>
                        </div>
                      </td>
                      <td className="px-3 sm:px-4 py-3 text-right">
                        <div className="flex flex-col items-end gap-0.5">
                          <Badge className={cn(
                            "text-[9px] font-black uppercase tracking-widest",
                            item.isDisbursement ? "bg-rose-100 text-rose-700 hover:bg-rose-100" : "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                          )}>
                            {item.isDisbursement ? 'Disbursement' : `${(item.collectedByRole || 'Admin').replace('_', ' ')} ${item.status || 'Collection'}`}
                          </Badge>
                          {item.collectedByName && item.collectedByName.toLowerCase() !== (item.collectedByRole || '').toLowerCase() && (
                            <span className="text-[10px] font-semibold text-slate-500">
                              {item.collectedByName}
                            </span>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                  {filteredData.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-6 py-20 text-center text-slate-400 italic text-sm">
                        {data.length === 0
                          ? "No transactions recorded for this period"
                          : "No transactions found matching the selected collector filter"}
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
                {registryTab === 'inflow' ? "Other Inflows Registry" : "Expense Registry"}
             </DialogTitle>
             <DialogDescription className="text-slate-400 text-xs mt-1">
                {registryTab === 'inflow' 
                  ? `Detailed manual inflow logs for ${formatDate(date)}` 
                  : `Detailed expenditure logs for ${formatDate(date)}`}
             </DialogDescription>

             {/* Tab Switcher */}
             <div className="flex items-center gap-2 mt-4 bg-slate-800/80 p-1 rounded-xl w-max border border-slate-700/60">
                <button
                  type="button"
                  onClick={() => setRegistryTab('expense')}
                  className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                    registryTab === 'expense'
                      ? 'bg-rose-600 text-white shadow-md'
                      : 'bg-transparent text-slate-400 hover:text-white'
                  }`}
                >
                  Daily Expenses ({expenseLogs.filter(l => l.type !== 'inflow').length})
                </button>
                <button
                  type="button"
                  onClick={() => setRegistryTab('inflow')}
                  className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                    registryTab === 'inflow'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'bg-transparent text-slate-400 hover:text-white'
                  }`}
                >
                  Other Inflows ({expenseLogs.filter(l => l.type === 'inflow').length})
                </button>
             </div>
          </div>
          <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
             {(() => {
                const targetLogs = expenseLogs.filter(l => registryTab === 'inflow' ? l.type === 'inflow' : l.type !== 'inflow');
                if (targetLogs.length === 0) {
                  return (
                    <div className="py-10 text-center space-y-3">
                       <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-300">
                          <Info size={24} />
                       </div>
                       <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
                         {registryTab === 'inflow' ? "No inflows recorded for this day" : "No expenses recorded for this day"}
                       </p>
                    </div>
                  );
                }
                return targetLogs.map((log: any) => (
                  <div key={log.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex justify-between items-start group hover:bg-white hover:shadow-md transition-all">
                     <div className="space-y-1">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{log.collectedByName || "System"}</p>
                        <h4 className="font-black text-slate-900 uppercase text-xs">{log.note || (log.type === 'inflow' ? "Manual Inflow" : "Daily Expense")}</h4>
                        <p className="text-[8px] font-bold text-slate-400">{log.createdAt ? new Date(log.createdAt).toLocaleTimeString() : ""}</p>
                     </div>
                     <div className="text-right">
                        <p className={`text-md font-black ${log.type === 'inflow' ? "text-emerald-600" : "text-rose-500"}`}>
                          {log.type === 'inflow' ? "+" : "-"}{formatCurrency(log.amount)}
                        </p>
                        <Badge className={cn(
                          "text-[8px] border-none font-black uppercase mt-1",
                          log.type === 'inflow' ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
                        )}>
                           {log.userRole === 'super_admin' || log.userRole === 'admin' ? 'Admin' : 'Agent'}
                        </Badge>
                     </div>
                  </div>
                ));
             })()}
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default Reports;
