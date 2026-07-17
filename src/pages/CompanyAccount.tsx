import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLine } from "@/contexts/LineContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, DocumentData } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Wallet, FileSpreadsheet, Search, Calendar, ArrowUpRight, ArrowDownRight, 
  Percent, Users, Receipt, Landmark, FileText, Sparkles, Filter, RefreshCw
} from "lucide-react";
import { toast } from "sonner";
import { exportToExcel } from "@/lib/excel";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const CompanyAccount = () => {
  const { userData } = useAuth();
  const { selectedLineId, lines } = useLine();
  const { t } = useLanguage();
  
  // Date filters - default to current month start and today
  const [startDate, setStartDate] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0]
  );
  const [endDate, setEndDate] = useState(new Date().toISOString().split("T")[0]);
  
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<DocumentData[]>([]);
  const [postings, setPostings] = useState<DocumentData[]>([]);
  const [expenses, setExpenses] = useState<DocumentData[]>([]);
  
  // Search & Type Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const activeLine = lines.find(l => l.id === selectedLineId);
  const activeLineName = activeLine?.name || "Full Portfolio";

  const fetchLedgerData = async () => {
    if (!selectedLineId) return;
    setLoading(true);
    try {
      // 1. Fetch all accounts for selected line to build account metadata mapping
      const accountsQ = query(collection(db, "accounts"), where("lineId", "==", selectedLineId));
      const accountsSnap = await getDocs(accountsQ);
      const accountsList = accountsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAccounts(accountsList);

      // 2. Fetch postings for line and filter in memory
      const postingsQ = query(
        collection(db, "postings"),
        where("lineId", "==", selectedLineId)
      );
      const postingsSnap = await getDocs(postingsQ);
      const postingsList = postingsSnap.docs
        .map(doc => ({ id: doc.id, ...doc.data() as any }))
        .filter(doc => doc.date && doc.date >= startDate && doc.date <= endDate);
      setPostings(postingsList);

      // 3. Fetch expenses log for line and filter in memory
      const expensesQ = query(
        collection(db, "expenses_log"),
        where("lineId", "==", selectedLineId)
      );
      const expensesSnap = await getDocs(expensesQ);
      const expensesList = expensesSnap.docs
        .map(doc => ({ id: doc.id, ...doc.data() as any }))
        .filter(doc => doc.date && doc.date >= startDate && doc.date <= endDate);
      setExpenses(expensesList);

    } catch (err: any) {
      console.error("Error fetching ledger data:", err);
      toast.error("Failed to load company ledger data: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLedgerData();
  }, [selectedLineId, startDate, endDate]);

  // Map accounts by ID for fast lookup
  const accMap = new Map();
  accounts.forEach(a => accMap.set(a.id, a));

  // Build the flat transaction ledger items list
  const ledgerItems: any[] = [];

  // Add postings
  postings.forEach(p => {
    const amt = Number(p.amount) || 0;
    const penalty = Number(p.penaltyAmount) || 0;
    const extra = Number(p.extraAmount) || 0;
    const status = p.status?.toLowerCase();
    
    const acc = accMap.get(p.accountId);
    let realizedInterest = 0;
    
    if (acc && status === "collection") {
      const loan = Number(acc.loanAmount) || 0;
      const interest = Number(acc.interestAmount) || 0;
      const total = loan + interest;
      if (total > 0) {
        realizedInterest = amt * (interest / total);
      }
    }

    let detail = "";
    let typeName = "";
    let flowType: "inflow" | "outflow" = "inflow";
    let inflowVal = 0;
    let outflowVal = 0;

    switch (status) {
      case "disbursement":
        detail = `Loan Disbursement to #${p.accountNo} (${p.memberName || "N/A"})`;
        typeName = "Disbursement";
        flowType = "outflow";
        outflowVal = amt;
        break;
      case "collection":
        detail = `Repayment from #${p.accountNo} (${p.memberName || "N/A"})`;
        typeName = "Repayment";
        flowType = "inflow";
        inflowVal = amt;
        break;
      case "charge":
        detail = `Document Charges for #${p.accountNo} (${p.memberName || "N/A"})`;
        typeName = "Doc Charge";
        flowType = "inflow";
        inflowVal = amt;
        break;
      case "penalty":
        detail = `Penalty Collected from #${p.accountNo} (${p.memberName || "N/A"})`;
        typeName = "Penalty";
        flowType = "inflow";
        inflowVal = amt;
        break;
      case "extra":
      case "extra_collection":
        detail = `Extra Amount Received from #${p.accountNo} (${p.memberName || "N/A"})`;
        typeName = "Extra Collection";
        flowType = "inflow";
        inflowVal = amt;
        break;
      default:
        detail = `Transaction #${p.accountNo} (${p.memberName || "N/A"})`;
        typeName = p.status || "Other";
        inflowVal = amt;
    }

    ledgerItems.push({
      id: p.id,
      date: p.date || "",
      createdAt: p.createdAt || "",
      detail,
      type: typeName,
      flowType,
      inflow: inflowVal,
      outflow: outflowVal,
      realizedInterest,
      operator: p.collectedByName || "System"
    });
  });

  // Add expenses_log
  expenses.forEach(e => {
    const amt = Number(e.amount) || 0;
    const type = e.type || "outflow";

    if (type === "inflow") {
      ledgerItems.push({
        id: e.id,
        date: e.date || "",
        createdAt: e.createdAt || "",
        detail: `Other Inflow: ${e.note || "Manual Input"}`,
        type: "Manual Inflow",
        flowType: "inflow",
        inflow: amt,
        outflow: 0,
        realizedInterest: 0,
        operator: e.collectedByName || "Admin"
      });
    } else {
      ledgerItems.push({
        id: e.id,
        date: e.date || "",
        createdAt: e.createdAt || "",
        detail: `Expense: ${e.note || "Office Expense"}`,
        type: "Expense",
        flowType: "outflow",
        inflow: 0,
        outflow: amt,
        realizedInterest: 0,
        operator: e.collectedByName || "Admin"
      });
    }
  });

  // Sort items chronologically by date/createdAt to compute running balance
  ledgerItems.sort((a, b) => {
    const dateComp = a.date.localeCompare(b.date);
    if (dateComp !== 0) return dateComp;
    return (a.createdAt || "").localeCompare(b.createdAt || "");
  });

  // Calculate running balances
  let currentBal = 0;
  const ledgerWithBalance = ledgerItems.map(item => {
    currentBal += item.inflow - item.outflow;
    return {
      ...item,
      runningBalance: currentBal
    };
  });

  // Re-sort to show newest first for registry table display
  const displayItems = [...ledgerWithBalance].reverse();

  // Apply filters
  const filteredItems = displayItems.filter(item => {
    const matchesSearch = 
      item.detail.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.operator.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.type.toLowerCase().includes(searchQuery.toLowerCase());
      
    let matchesType = false;
    if (typeFilter === "all") {
      matchesType = true;
    } else if (typeFilter === "customer_only") {
      matchesType = ["Repayment", "Disbursement", "Doc Charge", "Penalty", "Extra Collection"].includes(item.type);
    } else if (typeFilter === "company_only") {
      matchesType = ["Expense", "Manual Inflow"].includes(item.type);
    } else {
      matchesType = item.type.toLowerCase().replace(" ", "") === typeFilter.toLowerCase();
    }
    
    return matchesSearch && matchesType;
  });

  // Calculate statistics for the selected range
  const totalInflows = ledgerWithBalance.reduce((sum, item) => sum + item.inflow, 0);
  const totalOutflows = ledgerWithBalance.reduce((sum, item) => sum + item.outflow, 0);
  const netCashFlow = totalInflows - totalOutflows;

  // Realized Profit = Realized Interest Portion + Doc Charges + Penalties + Extra Collections - Expenses
  const totalRealizedInterest = ledgerWithBalance.reduce((sum, item) => sum + item.realizedInterest, 0);
  const totalDocCharges = ledgerWithBalance.filter(item => item.type === "Doc Charge").reduce((sum, item) => sum + item.inflow, 0);
  const totalPenalties = ledgerWithBalance.filter(item => item.type === "Penalty").reduce((sum, item) => sum + item.inflow, 0);
  const totalExtra = ledgerWithBalance.filter(item => item.type === "Extra Collection").reduce((sum, item) => sum + item.inflow, 0);
  const totalExpenses = ledgerWithBalance.filter(item => item.type === "Expense").reduce((sum, item) => sum + item.outflow, 0);

  const totalRealizedProfit = (totalRealizedInterest + totalDocCharges + totalPenalties + totalExtra) - totalExpenses;

  // Export to Excel
  const handleExportExcel = () => {
    const formattedData = [...ledgerWithBalance].reverse().map((item, idx) => ({
      "S.No": idx + 1,
      "Date": item.date,
      "Detail": item.detail,
      "Type": item.type,
      "Inflow (+)": item.inflow || 0,
      "Outflow (-)": item.outflow || 0,
      "Realized Interest": Math.round(item.realizedInterest * 100) / 100,
      "Running Balance": item.runningBalance,
      "Operator": item.operator
    }));

    exportToExcel(
      formattedData,
      `Company_Ledger_${activeLineName.replace(" ", "_")}_${startDate}_to_${endDate}`,
      "Operational Ledger"
    );
    toast.success("Excel ledger document exported successfully!");
  };

  // Export to PDF
  const handleExportPDF = () => {
    const doc = new jsPDF("l", "mm", "a4");
    
    // Title & Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(`SRI DEVI GROUPS OF FINANCE`, 14, 15);
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(`Operational Ledger: ${activeLineName} (${startDate} to ${endDate})`, 14, 22);

    // Summary Card Stats
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`Total Realized Profit: Rs. ${Math.round(totalRealizedProfit).toLocaleString()}`, 14, 32);
    doc.text(`Total Inflows: Rs. ${Math.round(totalInflows).toLocaleString()}`, 90, 32);
    doc.text(`Total Outflows: Rs. ${Math.round(totalOutflows).toLocaleString()}`, 160, 32);
    doc.text(`Net Cash Balance: Rs. ${Math.round(netCashFlow).toLocaleString()}`, 230, 32);

    const headers = [["S.No", "Date", "Detail", "Type", "Inflow (+)", "Outflow (-)", "Interest Portion", "Balance", "Operator"]];
    const data = [...ledgerWithBalance].reverse().map((item, idx) => [
      idx + 1,
      item.date,
      item.detail,
      item.type,
      `Rs. ${item.inflow.toLocaleString()}`,
      `Rs. ${item.outflow.toLocaleString()}`,
      `Rs. ${Math.round(item.realizedInterest).toLocaleString()}`,
      `Rs. ${item.runningBalance.toLocaleString()}`,
      item.operator
    ]);

    autoTable(doc, {
      head: headers,
      body: data,
      startY: 38,
      theme: "grid",
      headStyles: { fillColor: [15, 23, 42] },
      styles: { fontSize: 8, font: "helvetica" }
    });

    doc.save(`Company_Ledger_${activeLineName.replace(" ", "_")}_${startDate}_to_${endDate}.pdf`);
    toast.success("PDF ledger document exported successfully!");
  };

  return (
    <div className="space-y-8 p-6 md:p-8 max-w-7xl mx-auto min-h-screen pb-24">
      {/* Premium Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-100 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-5 w-5 text-amber-500 animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">Corporate Finance</span>
          </div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white uppercase italic leading-none flex items-center gap-2">
            <Wallet className="h-8 w-8 text-amber-500" />
            {t("companyAccount")}
          </h1>
          <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mt-2">
            Operational Line: <span className="text-primary italic font-black">{activeLineName}</span>
          </p>
        </div>

        {/* Date to Date Picker */}
        <div className="flex flex-wrap items-center gap-3 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-2xl border border-slate-100 dark:border-slate-800/80 shadow-inner">
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-slate-400" />
            <Input 
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="h-9 w-32 border-none bg-transparent font-bold text-xs focus:ring-0"
            />
          </div>
          <span className="text-xs font-black text-slate-350">TO</span>
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-slate-400" />
            <Input 
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="h-9 w-32 border-none bg-transparent font-bold text-xs focus:ring-0"
            />
          </div>
          <Button 
            onClick={fetchLedgerData}
            size="icon" 
            variant="ghost" 
            className="h-9 w-9 rounded-xl text-slate-400 hover:text-primary hover:bg-slate-100 dark:hover:bg-slate-800/50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </Button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Realized Profit */}
        <Card className="glass-card border-none shadow-xl bg-gradient-to-br from-indigo-500/10 via-indigo-500/5 to-transparent relative overflow-hidden group hover:shadow-2xl transition-all duration-300">
          <div className="absolute top-0 right-0 h-24 w-24 bg-indigo-500/10 blur-[30px] rounded-full group-hover:scale-125 transition-transform" />
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-4">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500">Realized Profit</p>
              <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500"><Percent size={16} /></div>
            </div>
            <h3 className={`text-3xl font-black tracking-tight ${totalRealizedProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`}>
              {formatCurrency(totalRealizedProfit)}
            </h3>
            <p className="text-[8px] font-bold text-slate-400 dark:text-slate-500 mt-2 uppercase tracking-wide">
              Interest ({formatCurrency(totalRealizedInterest)}) + Charges - Exp
            </p>
          </CardContent>
        </Card>

        {/* Total Inflows */}
        <Card className="glass-card border-none shadow-xl bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent relative overflow-hidden group hover:shadow-2xl transition-all duration-300">
          <div className="absolute top-0 right-0 h-24 w-24 bg-emerald-500/10 blur-[30px] rounded-full group-hover:scale-125 transition-transform" />
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-4">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600">Total Inflow</p>
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600"><ArrowUpRight size={16} /></div>
            </div>
            <h3 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              {formatCurrency(totalInflows)}
            </h3>
            <p className="text-[8px] font-bold text-slate-400 dark:text-slate-500 mt-2 uppercase tracking-wide">
              Collections, Charges, Other Inflows
            </p>
          </CardContent>
        </Card>

        {/* Total Outflows */}
        <Card className="glass-card border-none shadow-xl bg-gradient-to-br from-rose-500/10 via-rose-500/5 to-transparent relative overflow-hidden group hover:shadow-2xl transition-all duration-300">
          <div className="absolute top-0 right-0 h-24 w-24 bg-rose-500/10 blur-[30px] rounded-full group-hover:scale-125 transition-transform" />
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-4">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-500">Total Outflow</p>
              <div className="p-2 rounded-xl bg-rose-500/10 text-rose-500"><ArrowDownRight size={16} /></div>
            </div>
            <h3 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              {formatCurrency(totalOutflows)}
            </h3>
            <p className="text-[8px] font-bold text-slate-400 dark:text-slate-500 mt-2 uppercase tracking-wide">
              Disbursements, Operational Exp
            </p>
          </CardContent>
        </Card>

        {/* Net Flow / Cash Balance */}
        <Card className="glass-card border-none shadow-xl bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent relative overflow-hidden group hover:shadow-2xl transition-all duration-300">
          <div className="absolute top-0 right-0 h-24 w-24 bg-amber-500/10 blur-[30px] rounded-full group-hover:scale-125 transition-transform" />
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-4">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500">Net Cash Flow</p>
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500"><Landmark size={16} /></div>
            </div>
            <h3 className={`text-3xl font-black tracking-tight ${netCashFlow >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
              {formatCurrency(netCashFlow)}
            </h3>
            <p className="text-[8px] font-bold text-slate-400 dark:text-slate-500 mt-2 uppercase tracking-wide">
              Net balance for selected period
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Control Actions Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-3xl shadow-md border border-slate-100 dark:border-slate-800">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          {/* Search bar */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-950 border-none font-bold text-xs focus-visible:ring-1 focus-visible:ring-primary"
              placeholder="Search by details, operator, category..."
            />
          </div>

          {/* Type Category Filter */}
          <div className="w-48">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-10 rounded-xl bg-slate-50 dark:bg-slate-950 border-none font-black text-[10px] uppercase tracking-wider text-slate-500">
                <div className="flex items-center gap-2">
                  <Filter size={12} />
                  <SelectValue placeholder="All Categories" />
                </div>
              </SelectTrigger>
              <SelectContent className="rounded-xl border-none shadow-xl bg-white dark:bg-slate-900">
                <SelectItem value="all" className="text-xs font-bold uppercase tracking-wider">All Categories</SelectItem>
                <SelectItem value="customer_only" className="text-xs font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400">All Customer Postings</SelectItem>
                <SelectItem value="company_only" className="text-xs font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">Company Ledger Only</SelectItem>
                <SelectItem value="repayment" className="text-xs font-bold uppercase tracking-wider">Repayments</SelectItem>
                <SelectItem value="disbursement" className="text-xs font-bold uppercase tracking-wider">Disbursements</SelectItem>
                <SelectItem value="doccharge" className="text-xs font-bold uppercase tracking-wider">Doc Charges</SelectItem>
                <SelectItem value="penalty" className="text-xs font-bold uppercase tracking-wider">Penalties</SelectItem>
                <SelectItem value="extracollection" className="text-xs font-bold uppercase tracking-wider">Extra Collections</SelectItem>
                <SelectItem value="expense" className="text-xs font-bold uppercase tracking-wider">Expenses</SelectItem>
                <SelectItem value="manualinflow" className="text-xs font-bold uppercase tracking-wider">Manual Inflows</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Export options */}
        <div className="flex items-center gap-2">
          <Button 
            onClick={handleExportExcel}
            variant="outline" 
            className="h-10 rounded-xl font-black uppercase text-[10px] tracking-widest border-emerald-100 hover:bg-emerald-50 text-emerald-600 dark:border-emerald-950 dark:hover:bg-emerald-950/20"
          >
            <FileSpreadsheet size={14} className="mr-2" /> Export Excel
          </Button>
          <Button 
            onClick={handleExportPDF}
            variant="outline" 
            className="h-10 rounded-xl font-black uppercase text-[10px] tracking-widest border-rose-100 hover:bg-rose-50 text-rose-600 dark:border-rose-950 dark:hover:bg-rose-950/20"
          >
            <FileText size={14} className="mr-2" /> Export PDF
          </Button>
        </div>
      </div>

      {/* Ledger Registry Table */}
      <Card className="border-none shadow-xl bg-white dark:bg-slate-900 rounded-3xl overflow-hidden">
        <CardHeader className="bg-slate-950 p-6 text-white border-b border-slate-900">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 mb-1">Company Ledger</p>
              <h2 className="text-xl font-black italic uppercase tracking-tight">Telemetry Log</h2>
            </div>
            <Badge className="bg-white/10 text-white font-black text-[9px] uppercase tracking-wider px-3 py-1 border-none rounded-lg">
              {filteredItems.length} Records Shown
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-20 text-center space-y-4">
              <RefreshCw className="h-8 w-8 text-primary animate-spin mx-auto" />
              <p className="text-xs font-black uppercase tracking-widest text-slate-400">Loading ledger data stream...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-20 text-center space-y-3">
              <Receipt className="h-12 w-12 text-slate-300 mx-auto" />
              <p className="text-xs font-black uppercase tracking-widest text-slate-400">No matching transactions found</p>
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800 text-[9px] font-black uppercase tracking-widest text-slate-400">
                      <th className="p-5">Date</th>
                      <th className="p-5">Transaction Details</th>
                      <th className="p-5">Category</th>
                      <th className="p-5 text-right">Inflow (+)</th>
                      <th className="p-5 text-right">Outflow (-)</th>
                      <th className="p-5 text-right">Interest Portion</th>
                      <th className="p-5 text-right">Cash Balance</th>
                      <th className="p-5">Operator</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-850 font-bold text-xs text-slate-700 dark:text-slate-300">
                    {filteredItems.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors">
                        <td className="p-5 whitespace-nowrap">{formatDate(item.date)}</td>
                        <td className="p-5 max-w-xs truncate">{item.detail}</td>
                        <td className="p-5">
                          <Badge className={cn(
                            "border-none text-[8px] font-black uppercase px-2 py-0.5 rounded-md",
                            item.flowType === "inflow" 
                              ? "bg-emerald-500/10 text-emerald-500" 
                              : "bg-rose-500/10 text-rose-500"
                          )}>
                            {item.type}
                          </Badge>
                        </td>
                        <td className="p-5 text-right text-emerald-500 font-black whitespace-nowrap">
                          {item.inflow > 0 ? `+${formatCurrency(item.inflow)}` : "-"}
                        </td>
                        <td className="p-5 text-right text-rose-500 font-black whitespace-nowrap">
                          {item.outflow > 0 ? `-${formatCurrency(item.outflow)}` : "-"}
                        </td>
                        <td className="p-5 text-right text-indigo-500 italic whitespace-nowrap">
                          {item.realizedInterest > 0 ? formatCurrency(Math.round(item.realizedInterest)) : "-"}
                        </td>
                        <td className="p-5 text-right font-black whitespace-nowrap">
                          {formatCurrency(item.runningBalance)}
                        </td>
                        <td className="p-5 whitespace-nowrap text-slate-400 font-semibold">{item.operator}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card List View */}
              <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                {filteredItems.map((item) => (
                  <div key={item.id} className="p-5 space-y-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400">{formatDate(item.date)}</span>
                      <Badge className={cn(
                        "border-none text-[8px] font-black uppercase px-2 py-0.5 rounded-md",
                        item.flowType === "inflow" 
                          ? "bg-emerald-500/10 text-emerald-500" 
                          : "bg-rose-500/10 text-rose-500"
                      )}>
                        {item.type}
                      </Badge>
                    </div>

                    <div>
                      <p className="text-sm font-black text-slate-800 dark:text-slate-100">{item.detail}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mt-1">Logged by: {item.operator}</p>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-2 text-center">
                      <div className="bg-slate-50 dark:bg-slate-950 p-2 rounded-xl">
                        <p className="text-[8px] font-bold text-slate-400 uppercase">Amount</p>
                        <p className={cn(
                          "text-xs font-black mt-0.5",
                          item.flowType === "inflow" ? "text-emerald-500" : "text-rose-500"
                        )}>
                          {item.inflow > 0 ? `+${formatCurrency(item.inflow)}` : `-${formatCurrency(item.outflow)}`}
                        </p>
                      </div>

                      <div className="bg-slate-50 dark:bg-slate-950 p-2 rounded-xl">
                        <p className="text-[8px] font-bold text-slate-400 uppercase">Interest</p>
                        <p className="text-xs font-black text-indigo-500 mt-0.5">
                          {item.realizedInterest > 0 ? formatCurrency(Math.round(item.realizedInterest)) : "-"}
                        </p>
                      </div>

                      <div className="bg-slate-50 dark:bg-slate-950 p-2 rounded-xl">
                        <p className="text-[8px] font-bold text-slate-400 uppercase">Balance</p>
                        <p className="text-xs font-black text-slate-700 dark:text-slate-350 mt-0.5">
                          {formatCurrency(item.runningBalance)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CompanyAccount;
