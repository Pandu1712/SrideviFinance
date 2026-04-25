import { useAuth, UserRole } from "@/contexts/AuthContext";
import { useState, useEffect, useCallback } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, DocumentData, orderBy, limit } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BookOpen, IndianRupee, Printer, Activity, Calendar as CalendarIcon, User, Search, Filter, MapPin, Download } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLine } from "@/contexts/LineContext";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";
import { Share2 } from "lucide-react";

const DWMBook = () => {
  const { userData } = useAuth();
  const { selectedLineId, lines } = useLine();
  const [postings, setPostings] = useState<DocumentData[]>([]);
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split("T")[0]);
  const [endDateFilter, setEndDateFilter] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("daily");
  const [defaulterAccounts, setDefaulterAccounts] = useState<DocumentData[]>([]);
  const [villageFilter, setVillageFilter] = useState("all");
  const [uniqueVillages, setUniqueVillages] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchPostings = useCallback(async (period: string) => {
    if (!userData?.uid) return;
    
    setLoading(true);
    try {
      let startDateStr = dateFilter;
      let endDateStr = endDateFilter;

      if (period === "weekly") {
        const baseDate = new Date(endDateFilter);
        const d = new Date(baseDate);
        d.setDate(d.getDate() - 7);
        startDateStr = d.toISOString().split("T")[0];
      } else if (period === "monthly") {
        const baseDate = new Date(endDateFilter);
        const d = new Date(baseDate);
        d.setDate(1);
        startDateStr = d.toISOString().split("T")[0];
      }

      if (period === "defaulters") {
        let actQ;
        const assignedLineIds = userData.role === "agent" ? (userData.lineIds || (userData.lineId ? [userData.lineId] : [])) : [];
        const accountsRef = collection(db, "accounts");
        
        if (selectedLineId) {
           actQ = query(accountsRef, where("lineId", "==", selectedLineId));
        } else {
           // Strict isolation: if no line selected, don't show all data
           setDefaulterAccounts([]);
           setPostings([]);
           setLoading(false);
           return;
        }
        const actSnap = await getDocs(actQ);
        const allActs = actSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
        const today = new Date().toISOString().split("T")[0];
        
        const defs = allActs.filter(a => {
           if (!a.balance || a.balance <= 0) return false;
           if (a.startDate && a.paymentFrequency) {
              const start = new Date(a.startDate);
              const totalDays = a.paymentFrequency === "daily" ? 100 : 30;
              start.setDate(start.getDate() + totalDays);
              const expectedEnd = start.toISOString().split("T")[0];
              return expectedEnd < today;
           }
           return false;
        });
        
        const vset = new Set<string>();
        defs.forEach(d => { if (d.village) vset.add(d.village); });
        setUniqueVillages(Array.from(vset));
        setDefaulterAccounts(defs);
        setPostings([]);
        setLoading(false);
        return;
      }

      let q;
      const assignedLineIds = userData.role === "agent" ? (userData.lineIds || (userData.lineId ? [userData.lineId] : [])) : [];
      const postingsRef = collection(db, "postings");

      if (selectedLineId) {
        q = query(postingsRef, where("date", ">=", startDateStr), where("date", "<=", endDateStr), where("lineId", "==", selectedLineId), orderBy("date", "desc"), limit(1000));
      } else {
        setPostings([]);
        setLoading(false);
        return;
      }

      const snap = await getDocs(q);
      const list: DocumentData[] = snap.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as any)
      }));
      
      const vset = new Set<string>();
      list.forEach(p => { if (p.village) vset.add(p.village); });
      setUniqueVillages(Array.from(vset));
      
      setPostings(list);
    } catch (err) {
      console.error("DWM Fetch Error:", err);
      setPostings([]);
    } finally {
      setLoading(false);
    }
  }, [userData, dateFilter, endDateFilter, selectedLineId]);

  useEffect(() => {
    fetchPostings(activeTab);
  }, [activeTab, fetchPostings]);

  const filteredPostings = postings.filter(p => 
    (villageFilter === "all" || p.village === villageFilter) &&
    (!searchQuery || p.memberName?.toLowerCase().includes(searchQuery.toLowerCase()) || p.accountNo?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const filteredDefaulters = defaulterAccounts.filter(a => 
    (villageFilter === "all" || a.village === villageFilter) &&
    (!searchQuery || a.memberName?.toLowerCase().includes(searchQuery.toLowerCase()) || a.accountNo?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const totalAmount = filteredPostings.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const totalDefaulterAmount = filteredDefaulters.reduce((sum, p) => sum + (Number(p.balance) || 0), 0);

  const handleExportPDF = () => {
    const dataToExport = activeTab === "defaulters" ? filteredDefaulters : filteredPostings;
    if (dataToExport.length === 0) {
      toast.error("No data to export");
      return;
    }

    const doc = new jsPDF();
    const activeLineName = lines.find(l => l.id === selectedLineId)?.name || "Master Portfolio";
    
    // Title
    doc.setFontSize(22);
    doc.setTextColor(15, 23, 42);
    doc.text("SRIDEVI FINANCE HUB", 14, 22);
    
    doc.setFontSize(14);
    doc.text(`Book Production: ${activeTab.toUpperCase()}`, 14, 30);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Territory: ${activeLineName}`, 14, 38);
    doc.text(`Date Range: ${dateFilter} to ${endDateFilter}`, 14, 43);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 48);

    const tableColumn = activeTab === "defaulters" 
      ? ["Date", "Member Name", "Account No", "Village", "Balance Due"]
      : ["Date", "Member Name", "Account No", "Village", "Amount"];

    const tableRows = dataToExport.map(p => [
      activeTab === "defaulters" ? p.startDate : p.date,
      p.memberName || p.name,
      p.accountNo,
      p.village || "N/A",
      formatCurrency(activeTab === "defaulters" ? p.balance : p.amount)
    ]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 55,
      theme: 'grid',
      headStyles: { fillColor: [95, 37, 159], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 3 },
      columnStyles: {
        4: { halign: 'right', fontStyle: 'bold' }
      }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;
    const total = activeTab === "defaulters" ? totalDefaulterAmount : totalAmount;
    
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text(`Total ${activeTab === "defaulters" ? "Overdue" : "Value"}: ${formatCurrency(total)}`, 14, finalY);

    doc.save(`Book_${activeTab}_${activeLineName}_${dateFilter}.pdf`);
    toast.success(`${activeTab.toUpperCase()} Book Exported`);
  };

  const handleShareWhatsApp = () => {
    const dataToShare = activeTab === "defaulters" ? filteredDefaulters : filteredPostings;
    if (dataToShare.length === 0) {
      toast.error("No data to share");
      return;
    }
    
    const activeLineName = lines.find(l => l.id === selectedLineId)?.name || "Master Portfolio";
    let text = `⚠️ *SRIDEVI FINANCE - ${activeTab.toUpperCase()} REPORT*\n`;
    text += `📍 *Line:* ${activeLineName}\n`;
    text += `📅 *Period:* ${dateFilter} to ${endDateFilter}\n\n`;
    
    text += `*LIST:*\n`;
    dataToShare.slice(0, 30).forEach((p, i) => {
      const name = p.memberName || p.name;
      const amt = activeTab === "defaulters" ? p.balance : p.amount;
      text += `${i+1}. ${name} (${p.accountNo}) - *${formatCurrency(amt)}*\n`;
    });
    
    if (dataToShare.length > 30) {
      text += `\n_...and ${dataToShare.length - 30} more entries_`;
    }
    
    const total = activeTab === "defaulters" ? totalDefaulterAmount : totalAmount;
    text += `\n\n📊 *TOTAL VALUE:* *${formatCurrency(total)}*\n`;
    text += `\n_Generated via Official Portal_`;
    
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-10 pb-20 print:p-0 print:space-y-6"
    >
      {/* Premium Header Architecture */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-10 p-10 bg-white rounded-[3rem] shadow-[0_8px_30px_rgb(0,0,0,0.02)] border border-slate-100 overflow-hidden relative print:hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-[#5f259f] to-accent opacity-20" />
        <div className="flex items-center gap-6">
          <div className="h-20 w-20 rounded-[2rem] bg-[#5f259f] flex items-center justify-center shadow-[0_20px_40px_-12px_rgba(95,37,159,0.5)] shrink-0">
            <BookOpen className="text-white h-10 w-10" />
          </div>
          <div>
            <h1 className="text-4xl font-black tracking-tight text-[#5f259f] uppercase italic">Book Production</h1>
            <div className="flex items-center gap-2 mt-1">
               <MapPin size={12} className="text-slate-400" />
               <p className="text-slate-400 font-bold text-[10px] tracking-widest uppercase">
                 Territory: {selectedLineId ? lines.find(l => l.id === selectedLineId)?.name : 'Consolidated View'}
               </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-6">
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-300 ml-1">Archive Start</Label>
            <div className="relative group">
              <CalendarIcon className="absolute left-4 top-3.5 h-4 w-4 text-slate-300 group-focus-within:text-primary transition-colors" />
              <Input 
                type="date" 
                value={dateFilter} 
                onChange={e => setDateFilter(e.target.value)} 
                className="pl-11 h-12 w-48 bg-slate-50 border-none rounded-2xl font-black uppercase text-xs focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-300 ml-1">Archive End</Label>
            <div className="relative group">
              <CalendarIcon className="absolute left-4 top-3.5 h-4 w-4 text-slate-300 group-focus-within:text-primary transition-colors" />
              <Input 
                type="date" 
                value={endDateFilter} 
                onChange={e => setEndDateFilter(e.target.value)} 
                className="pl-11 h-12 w-48 bg-slate-50 border-none rounded-2xl font-black uppercase text-xs focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>
          </div>
          <div className="flex gap-2 self-end">
            <Button 
              onClick={() => fetchPostings(activeTab)}
              className="h-12 px-6 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg transition-all"
            >
              Sync Records
            </Button>
            <Button 
              onClick={handleExportPDF}
              variant="outline"
              className="h-12 px-6 border-slate-200 text-[#5f259f] rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-50 shadow-sm transition-all"
            >
              <Download className="mr-2 h-4 w-4" /> Download PDF
            </Button>
            <Button 
              onClick={handleShareWhatsApp}
              variant="outline"
              className="h-12 px-6 border-[#25D366] text-[#25D366] rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-[#25D366]/10 shadow-sm transition-all"
            >
              <Share2 size={16} className="mr-2" /> Share WhatsApp
            </Button>
            <Button 
              onClick={() => window.print()}
              variant="outline"
              className="h-12 px-6 border-slate-200 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-50 shadow-sm transition-all"
            >
              <Printer size={16} className="mr-2" /> Print
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Layer */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 print:hidden">
        <Card className="bg-white border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[2rem] overflow-hidden group hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all">
          <CardContent className="p-8 flex items-center justify-between">
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Total volume</p>
              <h3 className="text-3xl font-black text-slate-900 leading-none">
                {activeTab === "defaulters" ? filteredDefaulters.length : filteredPostings.length}
                <span className="text-xs font-bold text-slate-300 ml-2 uppercase tracking-widest">Entries</span>
              </h3>
            </div>
            <div className="h-14 w-14 rounded-2xl bg-slate-50 flex items-center justify-center border border-slate-100 group-hover:bg-primary/5 group-hover:border-primary/10 transition-colors">
              <Activity size={24} className="text-slate-400 group-hover:text-primary" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="col-span-1 md:col-span-2 bg-[#5f259f] border-none shadow-[0_20px_40px_-12px_rgba(95,37,159,0.3)] rounded-[2rem] overflow-hidden relative">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 blur-3xl rounded-full -mr-32 -mt-32" />
          <CardContent className="p-8 flex items-center justify-between relative z-10">
            <div className="space-y-2 text-white">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Total {activeTab === "defaulters" ? "Overdue Balance" : "Collection Value"}</p>
              <h3 className="text-4xl font-black leading-none">
                {formatCurrency(activeTab === "defaulters" ? totalDefaulterAmount : totalAmount)}
              </h3>
            </div>
            <div className="h-16 w-16 rounded-3xl bg-white/10 backdrop-blur-md border border-white/10 flex items-center justify-center">
              <IndianRupee size={32} className="text-white" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="daily" value={activeTab} onValueChange={setActiveTab} className="space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 print:hidden">
          <TabsList className="bg-slate-100/50 p-1.5 rounded-[1.5rem] h-14 w-fit border border-slate-100">
            <TabsTrigger value="daily" className="rounded-xl px-8 font-black uppercase tracking-widest text-[10px] data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-[#5f259f]">Daily Log</TabsTrigger>
            <TabsTrigger value="weekly" className="rounded-xl px-8 font-black uppercase tracking-widest text-[10px] data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-[#5f259f]">Weekly Summary</TabsTrigger>
            <TabsTrigger value="monthly" className="rounded-xl px-8 font-black uppercase tracking-widest text-[10px] data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-[#5f259f]">Monthly Audit</TabsTrigger>
            <TabsTrigger value="defaulters" className="rounded-xl px-8 font-black uppercase tracking-widest text-[10px] data-[state=active]:bg-rose-500 data-[state=active]:shadow-lg data-[state=active]:text-white">Defaulters List</TabsTrigger>
          </TabsList>

          <div className="flex flex-wrap items-center gap-4">
            {uniqueVillages.length > 0 && (
              <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-100 overflow-x-auto max-w-[400px] no-scrollbar">
                <button onClick={() => setVillageFilter("all")} className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${villageFilter === "all" ? "bg-white text-primary shadow-sm" : "text-slate-400 hover:text-slate-600"}`}>All Villages</button>
                {uniqueVillages.map(v => (
                  <button key={v} onClick={() => setVillageFilter(v)} className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${villageFilter === v ? "bg-white text-primary shadow-sm" : "text-slate-400 hover:text-slate-600"}`}>{v}</button>
                ))}
              </div>
            )}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-300" />
              <Input 
                placeholder="Search Archives..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-10 h-10 w-64 bg-slate-50 border-none rounded-xl text-xs font-bold placeholder:text-slate-300"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden print:border-none print:shadow-none print:rounded-none">
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 print:bg-slate-100">
                  <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 border-b border-slate-50 print:text-black">Reference</th>
                  <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 border-b border-slate-50 print:text-black text-left">Member Identity</th>
                  <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 border-b border-slate-50 print:text-black text-center">A/C No</th>
                  <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 border-b border-slate-50 print:text-black text-right">Value</th>
                  <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 border-b border-slate-50 print:text-black text-center">Status</th>
                  <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 border-b border-slate-50 print:text-black text-center">Contact</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence mode="popLayout">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="text-center py-32">
                        <div className="animate-spin h-10 w-10 border-4 border-slate-100 border-t-[#5f259f] rounded-full mx-auto" />
                        <p className="mt-6 text-[10px] font-black uppercase tracking-[0.4em] text-slate-300">Fetching Matrix...</p>
                      </td>
                    </tr>
                  ) : (activeTab !== "defaulters" && filteredPostings.length === 0) || (activeTab === "defaulters" && filteredDefaulters.length === 0) ? (
                    <tr>
                      <td colSpan={6} className="text-center py-32">
                        <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                          <BookOpen size={24} className="text-slate-200" />
                        </div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-300">No matching records found</p>
                      </td>
                    </tr>
                  ) : activeTab === "defaulters" ? (
                    filteredDefaulters.map((p, i) => (
                      <motion.tr 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.01 }}
                        key={p.id}
                        className="group hover:bg-slate-50 transition-colors border-b border-slate-50 print:border-slate-100"
                      >
                        <td className="px-8 py-5">
                          <Badge variant="outline" className="font-bold text-[10px] px-3 py-1 bg-white border-slate-100 shadow-sm text-slate-600 print:shadow-none print:border-none">
                            {p.startDate}
                          </Badge>
                        </td>
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-3">
                             <div className="h-9 w-9 rounded-full bg-rose-50 flex items-center justify-center text-rose-500 text-xs font-black print:hidden">
                                {p.memberName?.charAt(0) || p.name?.charAt(0)}
                             </div>
                             <div className="flex flex-col">
                                <span className="font-black text-slate-900 text-sm uppercase">{p.memberName || p.name}</span>
                                <span className="text-[8px] text-rose-500 font-black uppercase tracking-widest mt-0.5">{p.village || 'N/A'}</span>
                             </div>
                          </div>
                        </td>
                        <td className="px-8 py-5 text-center font-black text-xs text-primary/60 tracking-widest">{p.accountNo}</td>
                        <td className="px-8 py-5 text-right font-black text-rose-600 text-base">{formatCurrency(p.balance)}</td>
                        <td className="px-8 py-5 text-center">
                          <Badge className="bg-rose-50 text-rose-600 border-none font-black text-[8px] uppercase tracking-widest px-3 py-1">
                            Defaulter
                          </Badge>
                        </td>
                        <td className="px-8 py-5 text-center">
                          <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">{p.phone}</span>
                        </td>
                      </motion.tr>
                    ))
                  ) : (
                    filteredPostings.map((p, i) => (
                      <motion.tr 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.01 }}
                        key={p.id}
                        className="group hover:bg-slate-50 transition-colors border-b border-slate-50 print:border-slate-100"
                      >
                        <td className="px-8 py-5">
                          <Badge variant="outline" className="font-bold text-[10px] px-3 py-1 bg-white border-slate-100 shadow-sm text-slate-600 print:shadow-none print:border-none">
                            {p.date}
                          </Badge>
                        </td>
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-3">
                             <div className="h-9 w-9 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 text-xs font-black print:hidden">
                                {p.memberName?.charAt(0)}
                             </div>
                             <div className="flex flex-col">
                                <span className="font-black text-slate-900 text-sm uppercase">{p.memberName}</span>
                                <span className="text-[8px] text-emerald-600 font-black uppercase tracking-widest mt-0.5">{p.village || 'N/A'}</span>
                             </div>
                          </div>
                        </td>
                        <td className="px-8 py-5 text-center font-black text-xs text-primary/60 tracking-widest">{p.accountNo}</td>
                        <td className="px-8 py-5 text-right font-black text-slate-900 text-base">{formatCurrency(p.amount)}</td>
                        <td className="px-8 py-5 text-center">
                          <Badge className="bg-emerald-50 text-emerald-600 border-none font-black text-[8px] uppercase tracking-widest px-3 py-1">
                            Recovered
                          </Badge>
                        </td>
                        <td className="px-8 py-5 text-center text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] italic">
                          {p.payMode || 'CASH'}
                        </td>
                      </motion.tr>
                    ))
                  )}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </div>
      </Tabs>
    </motion.div>
  );
};

export default DWMBook;
