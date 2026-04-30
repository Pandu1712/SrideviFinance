import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLine } from "@/contexts/LineContext";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, DocumentData } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, Calendar, FileText, IndianRupee, Printer, Download, Filter, Target } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const PostingSearch = () => {
  const { userData } = useAuth();
  const { selectedLineId } = useLine();
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState<DocumentData[]>([]);
  const [memberSummary, setMemberSummary] = useState<DocumentData | null>(null);
  const [loading, setLoading] = useState(false);

  // Auto-load daily activities on mount
  useEffect(() => {
    if (userData && selectedLineId) handleSearch();
  }, [userData, selectedLineId]);

  const handleSearch = async () => {
    if (!userData) return;
    setLoading(true);
    setMemberSummary(null);
    try {
      let q;
      const postingsRef = collection(db, "postings");
      
      // Build filters
      const constraints: any[] = [];
      if (selectedLineId) constraints.push(where("lineId", "==", selectedLineId));
      if (date) constraints.push(where("date", "==", date));
      
      // If searchTerm (Name/AccNo) is provided, we might need a different approach 
      // since Firestore doesn't support easy case-insensitive substring search without indexing.
      // We will fetch based on other filters and then filter client-side for name.
      
      if (constraints.length > 0) {
        q = query(postingsRef, ...constraints);
      } else {
        q = query(postingsRef); // Careful with large datasets, but for this app it should be fine
      }

      const snap = await getDocs(q);
      let list = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));

      // Client-side filtering for member name or account no
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        list = list.filter(r => 
          r.memberName?.toLowerCase().includes(term) || 
          r.accountNo?.toLowerCase().includes(term)
        );

        // If a specific account is being tracked, load its summary
        if (list.length > 0) {
          const accNo = list[0].accountNo;
          const accSnap = await getDocs(query(collection(db, "accounts"), where("accountNo", "==", accNo)));
          if (!accSnap.empty) {
            setMemberSummary({ id: accSnap.docs[0].id, ...accSnap.docs[0].data() as any });
          }
        }
      }

      // Sort by date desc
      list.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

      setResults(list);
      if (list.length > 0) toast.success(`Retrieved ${list.length} records`);
      else toast.info("No matching records found");
    } catch (err: any) { 
      toast.error(err.message || "Search failed");
    } finally { 
      setLoading(false); 
    }
  };

  const total = results.reduce((sum, r) => sum + (r.amount || 0), 0);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="space-y-6"
    >
      <div className="bg-slate-50/50 p-6 rounded-3xl border border-slate-100 shadow-sm space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-accent-gradient flex items-center justify-center shadow-lg">
            <Search className="text-white h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-primary">Master Audit Portal</h1>
            <p className="text-muted-foreground font-medium text-xs uppercase tracking-widest opacity-70">Track collections by customer or timeline.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="space-y-1.5">
            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Member Name / Acc No</Label>
            <div className="relative group">
              <Target className="absolute left-3 top-3.5 h-4 w-4 text-slate-400 group-focus-within:text-accent transition-colors" />
              <Input 
                value={searchTerm} 
                onChange={e => setSearchTerm(e.target.value)} 
                placeholder="Search member..." 
                className="pl-9 h-11 finance-input" 
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Filter Date (Optional)</Label>
            <div className="relative group">
              <Calendar className="absolute left-3 top-3.5 h-4 w-4 text-slate-400 group-focus-within:text-accent transition-colors" />
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="pl-9 h-11 finance-input" />
            </div>
          </div>

          <Button onClick={handleSearch} className="h-11 bg-accent text-accent-foreground hover:bg-slate-900 font-black shadow-xl border-none transition-all hover:scale-[1.02]" disabled={loading}>
            {loading ? "Syncing..." : "Execute Audit"}
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {memberSummary && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 md:grid-cols-4 gap-6"
          >
            <Card className="glass-card border-none shadow-xl bg-primary text-white overflow-hidden">
               <CardContent className="p-6 relative">
                 <div className="absolute top-0 right-0 p-4 opacity-10">
                   <Target size={80} />
                 </div>
                 <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">Payable Principal</p>
                 <h2 className="text-3xl font-black mt-1">{formatCurrency(memberSummary.totalAmount)}</h2>
                 <p className="text-[10px] bg-white/20 inline-block px-2 py-0.5 rounded mt-2">{memberSummary.accountNo}</p>
               </CardContent>
            </Card>
            <Card className="glass-card border-none shadow-xl border-t-4 border-t-emerald-500">
               <CardContent className="p-6">
                 <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Successfully Paid</p>
                 <h2 className="text-3xl font-black text-emerald-600 mt-1">{formatCurrency(memberSummary.paid)}</h2>
                 <div className="mt-3 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                   <div className="h-full bg-emerald-500" style={{ width: `${(memberSummary.paid/memberSummary.totalAmount)*100}%` }} />
                 </div>
               </CardContent>
            </Card>
            <Card className="glass-card border-none shadow-xl border-t-4 border-t-rose-500">
               <CardContent className="p-6">
                 <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Outstanding Balance</p>
                 <h2 className="text-3xl font-black text-rose-600 mt-1">{formatCurrency(memberSummary.balance)}</h2>
                 <p className="text-[10px] font-bold text-slate-400 mt-2">Started {formatDate(memberSummary.startDate)}</p>
               </CardContent>
            </Card>
            <div className="flex flex-col gap-3">
               <Button variant="outline" className="flex-1 finance-input bg-white h-full flex flex-col items-center justify-center p-4">
                  <Printer size={20} className="text-accent mb-2" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Full Statement</span>
               </Button>
               <Button variant="outline" className="flex-1 finance-input bg-white h-full flex flex-col items-center justify-center p-4">
                  <Download size={20} className="text-slate-400 mb-2" />
                  <span className="text-[10px] font-black uppercase tracking-widest">PDF Export</span>
               </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="glass-card border-none shadow-xl">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Total volume</p>
              <div className="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center">
                <Target size={14} className="text-accent" />
              </div>
            </div>
            <h2 className="text-3xl font-black text-primary">{results.length} Postings</h2>
            <p className="text-[10px] font-bold text-accent mt-1">Found for selected period</p>
          </CardContent>
        </Card>
        
        <Card className="glass-card border-none shadow-xl border-l-4 border-l-accent">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Aggregate Amount</p>
              <div className="h-8 w-8 rounded-lg bg-primary/5 flex items-center justify-center">
                <IndianRupee size={14} className="text-primary" />
              </div>
            </div>
            <h2 className="text-3xl font-black text-primary">{formatCurrency(total)}</h2>
            <div className="flex items-center gap-2 mt-1">
              <Badge className="bg-emerald-500/10 text-emerald-600 border-none font-black text-[9px] uppercase">VERIFIED STATUS</Badge>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-4">
           <Button 
            variant="outline" 
            className="flex-1 h-14 rounded-2xl border-slate-200 text-slate-500 font-bold hover:bg-slate-50 transition-all flex flex-col items-center justify-center gap-1"
            onClick={() => {
              if (results.length === 0) {
                toast.error("No data to export");
                return;
              }
              
              const doc = new jsPDF();
              doc.setFontSize(22);
              doc.setTextColor(15, 23, 42);
              doc.text("SRIDEVI FINANCE HUB", 14, 22);
              
              doc.setFontSize(12);
              doc.text(`Search Results`, 14, 30);
              doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 36);

              const tableColumn = ["Date", "Member Name", "Account No", "Amount", "Mode", "Collected By"];
              const tableRows = results.map(p => [
                formatDate(p.date),
                p.memberName,
                p.accountNo,
                formatCurrency(p.amount),
                p.payMode.toUpperCase(),
                agents.find(a => a.id === p.agentId)?.name || "System"
              ]);

              autoTable(doc, {
                head: [tableColumn],
                body: tableRows,
                startY: 45,
                theme: 'striped',
                headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
                styles: { fontSize: 8, cellPadding: 3 }
              });

              doc.save(`Search_Export_${date || 'all'}.pdf`);
              toast.success("Results Exported as PDF");
            }}
          >
             <Download size={18} />
             <span className="text-[10px] uppercase tracking-widest">Export PDF</span>
          </Button>
        </div>
      </div>

      <Card className="glass-card border-none shadow-2xl overflow-hidden">
        <CardHeader className="bg-slate-50/50 border-b border-white/10 px-6 py-4">
           <div className="flex items-center justify-between">
             <CardTitle className="text-sm font-black uppercase tracking-widest text-primary flex items-center gap-2">
               <Filter size={14} className="text-accent" />
               Search Results
             </CardTitle>
             <span className="text-[10px] font-bold text-slate-400">Date Referenced: {date}</span>
           </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="finance-table w-full">
            <thead>
              <tr className="bg-slate-50/20">
                <th className="p-4 text-[10px] uppercase tracking-widest font-black text-slate-400">Trans #</th>
                <th className="p-4 text-[10px] uppercase tracking-widest font-black text-slate-400">Date Logged</th>
                <th className="p-4 text-[10px] uppercase tracking-widest font-black text-slate-400 text-left">Member / Acc</th>
                <th className="p-4 text-[10px] uppercase tracking-widest font-black text-slate-400 text-left">Handled By</th>
                <th className="p-4 text-[10px] uppercase tracking-widest font-black text-slate-400 text-right">Collection</th>
                <th className="p-4 text-[10px] uppercase tracking-widest font-black text-slate-400 text-center">Status</th>
                <th className="p-4 text-[10px] uppercase tracking-widest font-black text-slate-400 text-center">Pay Mode</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {results.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-20">
                      <div className="flex flex-col items-center justify-center opacity-20">
                         <Target size={48} className="mb-4" />
                         <p className="text-xl font-black uppercase tracking-widest">No Postings Found</p>
                         <p className="text-sm font-medium lowercase">select a different timeframe</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  results.map((r, i) => (
                    <motion.tr 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.02 }}
                      key={r.id} 
                      className="group border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="p-4 text-center font-bold text-slate-300 text-xs">{String(i + 1).padStart(2, '0')}</td>
                      <td className="p-4 text-center text-xs font-bold text-slate-500">{formatDate(r.date)}</td>
                      <td className="p-4 text-left">
                         <div className="flex flex-col">
                            <span className="font-bold text-primary group-hover:text-accent transition-colors">{r.memberName}</span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase">{r.accountNo}</span>
                         </div>
                      </td>
                      <td className="p-4 text-left">
                        <div className="flex items-center gap-2">
                           <div className="h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center text-[8px] font-black text-slate-500">
                             {r.agentId === userData?.uid ? "YO" : "PE"}
                           </div>
                           <span className="text-xs font-bold text-slate-600">
                             {r.agentId === userData?.uid ? "You" : "Personnel"}
                           </span>
                        </div>
                      </td>
                      <td className="p-4 text-right font-black text-emerald-600">{formatCurrency(r.amount)}</td>
                      <td className="p-4 text-center">
                        <Badge className={`${r.status === 'penalty' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'} border-none font-bold text-[9px] uppercase`}>
                          {r.status}
                        </Badge>
                      </td>
                      <td className="p-4 text-center">
                        <span className="text-[10px] font-black uppercase tracking-tighter text-slate-400">{r.payMode}</span>
                      </td>
                    </motion.tr>
                  ))
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default PostingSearch;
