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
import { FileText, TrendingUp, PieChart as PieIcon, Users, Calendar, Download, FileSpreadsheet } from "lucide-react";
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
    byAgent: {} as Record<string, number>,
  });
  const [history, setHistory] = useState<any[]>([]);

  const fetchReportData = async (selectedDate: string) => {
    setLoading(true);
    try {
      if (!selectedLineId) {
        setData([]);
        setStats({ total: 0, cash: 0, online: 0, principal: 0, interest: 0, docCharges: 0, byAgent: {} });
        setLoading(false);
        return;
      }

      // 1. Current Day Postings
      let q = query(collection(db, "postings"), where("date", "==", selectedDate), where("lineId", "==", selectedLineId));
      if (userData?.role === "admin") q = query(q, where("adminId", "==", userData.uid));
      const snap = await getDocs(q);
      const docs = snap.docs.map(d => d.data());
      setData(docs);

      let total = 0; let cash = 0; let online = 0; let principal = 0; let interest = 0;
      const byAgent: Record<string, number> = {};

      docs.forEach((item: any) => {
        const amt = item.amount || 0;
        total += amt;
        principal += (item.principal || 0);
        interest += (item.lateFee || 0);
        if (item.payMode === "cash") cash += amt;
        else online += amt;
        const agent = item.memberName || "Unknown";
        byAgent[agent] = (byAgent[agent] || 0) + amt;
      });

      // 2. Current Day Document Charges & Disbursements
      let docCharges = 0;
      let accQ = query(collection(db, "accounts"), where("lineId", "==", selectedLineId));
      const accSnap = await getDocs(accQ);
      
      const disbursements = accSnap.docs
        .filter(d => d.data().createdAt && d.data().createdAt.startsWith(selectedDate))
        .map(d => {
          const a = d.data();
          docCharges += parseFloat(a.documentCharge || "0");
          return { 
            ...a, 
            id: d.id, 
            isDisbursement: true, 
            amount: parseFloat(a.loanAmount || "0"),
            memberName: a.memberName || a.name,
            payMode: a.paymentType || "CASH",
            status: "New Account"
          };
        });

      // Combined and Sorted: Disbursements first, then Collections
      setData([...disbursements, ...docs]);

      setStats({ total, cash, online, principal, interest, docCharges, byAgent });

      // 3. Previous Weeks Comparison (Last 3 weeks same day)
      const historyList: any[] = [];
      const baseDate = new Date(selectedDate);
      for (let i = 1; i <= 3; i++) {
        const prevDate = new Date(baseDate);
        prevDate.setDate(prevDate.getDate() - (i * 7));
        const prevDateStr = prevDate.toISOString().split("T")[0];
        
        let hQ = query(collection(db, "postings"), where("date", "==", prevDateStr), where("lineId", "==", selectedLineId));
        const hSnap = await getDocs(hQ);
        let hTotal = 0;
        hSnap.docs.forEach(d => hTotal += (d.data().amount || 0));
        historyList.push({ date: prevDateStr, total: hTotal });
      }
      setHistory(historyList);

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
      !item.isDisbursement ? formatCurrency(item.amount) : "—",
      item.isDisbursement ? formatCurrency(item.amount) : "—",
      item.payMode.toUpperCase(), 
      item.status.toUpperCase()
    ]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 45,
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


      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="glass-card shadow-xl border-none border-t-4 border-rose-500 bg-white">
            <CardHeader className="pb-2">
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Principal Amount</p>
              <CardTitle className="text-3xl font-black text-rose-600 tracking-tighter">{formatCurrency(stats.principal)}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                <TrendingUp className="h-3 w-3 text-rose-500" /> Capital Recovered
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card shadow-xl border-none border-t-4 border-blue-500 bg-white">
            <CardHeader className="pb-2">
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Interest & Doc Charges</p>
              <CardTitle className="text-3xl font-black text-blue-600 tracking-tighter">{formatCurrency(stats.interest + stats.docCharges)}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                  <span>Interest/Late Fee:</span>
                  <span className="text-blue-500">{formatCurrency(stats.interest)}</span>
                </div>
                <div className="flex justify-between text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                  <span>Document Charges:</span>
                  <span className="text-blue-500">{formatCurrency(stats.docCharges)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card shadow-2xl border-none bg-slate-900 text-white relative overflow-hidden">
            <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-white/5 to-transparent pointer-events-none" />
            <CardHeader className="pb-2 relative z-10">
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Total Collection</p>
              <CardTitle className="text-4xl font-black tracking-tighter">{formatCurrency(stats.total)}</CardTitle>
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="mt-2 flex gap-4">
                <div className="flex-1">
                  <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Cash</p>
                  <p className="text-xs font-black text-emerald-400">{formatCurrency(stats.cash)}</p>
                </div>
                <div className="flex-1 border-l border-white/10 pl-4">
                  <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">UPI</p>
                  <p className="text-xs font-black text-indigo-400">{formatCurrency(stats.online)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="glass-card border-none shadow-sm bg-slate-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Previous Weeks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {history.map((h, i) => (
              <div key={i} className="flex justify-between items-center p-2 rounded-lg bg-white shadow-sm border border-slate-100">
                <span className="text-[10px] font-bold text-slate-500">{formatDate(h.date)}</span>
                <span className="text-xs font-black text-slate-700">{formatCurrency(h.total)}</span>
              </div>
            ))}
            {history.length === 0 && !loading && (
              <p className="text-[10px] text-slate-400 italic text-center py-4">No historical data found</p>
            )}
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
                    <th className="p-4 text-[10px] uppercase tracking-widest font-bold text-muted-foreground text-right">Value</th>
                    <th className="p-4 text-[10px] uppercase tracking-widest font-bold text-muted-foreground text-center">Mode</th>
                    <th className="p-4 text-[10px] uppercase tracking-widest font-bold text-muted-foreground text-center">Category</th>
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
                      <td className="px-6 py-4">
                        {item.isDisbursement ? (
                          <div className="flex flex-col">
                            <span className="text-[9px] font-black text-emerald-600 uppercase tracking-tighter">New Disbursement</span>
                            <span className="text-sm font-black text-rose-500">
                              {formatCurrency(item.amount)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest px-2 border-slate-200">
                          {item.payMode}
                        </Badge>
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
