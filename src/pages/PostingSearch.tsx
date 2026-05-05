import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLine } from "@/contexts/LineContext";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, DocumentData } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, Calendar, FileText, IndianRupee, Printer, Download, Filter, Target, FileSpreadsheet, Edit, Save, X, ArrowRightLeft, MoveRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { updateDoc, doc, runTransaction, getDoc } from "firebase/firestore";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { exportToExcel } from "@/lib/excel";

const PostingSearch = () => {
  const { userData } = useAuth();
  const { selectedLineId } = useLine();
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState<DocumentData[]>([]);
  const [memberSummary, setMemberSummary] = useState<DocumentData | null>(null);
  const [loading, setLoading] = useState(false);
  
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedPosting, setSelectedPosting] = useState<any>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editDate, setEditDate] = useState("");
  
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [destAccountNo, setDestAccountNo] = useState("");

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
      
      if (constraints.length > 0) {
        q = query(postingsRef, ...constraints);
      } else {
        q = query(postingsRef);
      }

      const snap = await getDocs(q);
      let list = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));

      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        list = list.filter(r => 
          r.memberName?.toLowerCase().includes(term) || 
          r.nameTelugu?.toLowerCase().includes(term) || 
          r.accountNo?.toLowerCase().includes(term)
        );

        if (list.length > 0) {
          const accNo = list[0].accountNo;
          const accSnap = await getDocs(query(collection(db, "accounts"), where("accountNo", "==", accNo)));
          if (!accSnap.empty) {
            setMemberSummary({ id: accSnap.docs[0].id, ...accSnap.docs[0].data() as any });
          }
        }
      }

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

  const openEdit = (posting: any) => {
    setSelectedPosting(posting);
    setEditAmount(String(posting.amount));
    setEditDate(posting.date);
    setEditDialogOpen(true);
  };

  const saveEdit = async () => {
    if (!selectedPosting || !editAmount || !editDate) return;
    setLoading(true);
    try {
      const postingRef = doc(db, "postings", selectedPosting.id);
      const newAmount = parseFloat(editAmount);
      const oldAmount = selectedPosting.amount;
      const diff = newAmount - oldAmount;

      await runTransaction(db, async (transaction) => {
        transaction.update(postingRef, { 
          amount: newAmount,
          date: editDate
        });

        if (selectedPosting.verified) {
          const accountRef = doc(db, "accounts", selectedPosting.accountId);
          const accSnap = await transaction.get(accountRef);
          if (accSnap.exists()) {
            const accData = accSnap.data();
            const newPaid = (accData.paid || 0) + diff;
            const newBalance = (accData.totalAmount || 0) - newPaid;
            
            transaction.update(accountRef, {
              paid: newPaid,
              balance: Math.max(0, newBalance),
              status: newBalance <= 0 ? "completed" : "active"
            });
          }
        }
      });

      toast.success("Transaction updated successfully");
      setResults(prev => prev.map(p => p.id === selectedPosting.id ? { ...p, amount: newAmount, date: editDate } : p));
      setEditDialogOpen(false);
      handleSearch();
    } catch (err) {
      console.error("Save edit error:", err);
      toast.error("Update failed");
    } finally {
      setLoading(false);
    }
  };

  const openTransfer = (posting: any) => {
    setSelectedPosting(posting);
    setDestAccountNo("");
    setTransferDialogOpen(true);
  };

  const saveTransfer = async () => {
    if (!selectedPosting || !destAccountNo) return;
    setLoading(true);
    try {
      const sourceAccRef = doc(db, "accounts", selectedPosting.accountId);
      const sourceSnap = await getDoc(sourceAccRef);
      if (!sourceSnap.exists()) {
        toast.error("Source account record missing");
        setLoading(false);
        return;
      }
      const sourceData = sourceSnap.data();

      const destQuery = query(collection(db, "accounts"), where("accountNo", "==", destAccountNo));
      const destSnap = await getDocs(destQuery);
      if (destSnap.empty) {
        toast.error("Destination account not found");
        setLoading(false);
        return;
      }
      const destDoc = destSnap.docs[0];
      const destData = destDoc.data();
      const destId = destDoc.id;

      if (destAccountNo === sourceData.accountNo) {
        toast.error("Source and Destination accounts are identical");
        setLoading(false);
        return;
      }

      await runTransaction(db, async (transaction) => {
        const postingRef = doc(db, "postings", selectedPosting.id);
        const destAccRef = doc(db, "accounts", destId);
        const amount = selectedPosting.amount;

        transaction.update(sourceAccRef, {
          paid: (sourceData.paid || 0) - amount,
          balance: (sourceData.balance || 0) + amount
        });

        transaction.update(destAccRef, {
          paid: (destData.paid || 0) + amount,
          balance: (destData.balance || 0) - amount
        });

        transaction.update(postingRef, {
          accountId: destId,
          accountNo: destAccountNo,
          memberName: destData.name,
          lineId: destData.lineId
        });

        const logRef = doc(collection(db, "activity_logs"));
        transaction.set(logRef, {
          type: "posting_transfer",
          postingId: selectedPosting.id,
          fromAccount: sourceData.accountNo,
          toAccount: destAccountNo,
          amount: amount,
          performedBy: userData?.name || "System",
          timestamp: new Date()
        });
      });

      toast.success(`Post successfully shifted to ${destAccountNo}`);
      setTransferDialogOpen(false);
      handleSearch();
    } catch (err: any) {
      console.error("Shift error:", err);
      toast.error("Failed to shift posting");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="space-y-6"
    >
      <div className="bg-white p-4 sm:p-8 rounded-[2.5rem] border border-slate-100 shadow-2xl shadow-slate-200/50 space-y-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 rounded-full -mr-16 -mt-16 blur-3xl" />
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-slate-900 flex items-center justify-center shadow-xl shadow-slate-900/20 transform -rotate-3 transition-transform hover:rotate-0">
              <Search className="text-white h-7 w-7" />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight text-slate-900">Master Audit</h1>
              <p className="text-slate-400 font-bold text-[10px] uppercase tracking-[0.2em] mt-1 opacity-80">Collection Integrity & Verification</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-2xl border border-slate-100">
             <Badge variant="outline" className="bg-white border-slate-200 text-slate-500 font-bold text-[9px] uppercase px-3 py-1 rounded-xl">
               Real-time Sync
             </Badge>
             <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse mr-1" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end relative z-10">
          <div className="md:col-span-5 space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Subscriber Identity</Label>
            <div className="relative group">
              <Target className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300 group-focus-within:text-accent transition-colors" />
              <Input 
                value={searchTerm} 
                onChange={e => setSearchTerm(e.target.value)} 
                placeholder="Search name, account, or Telugu name..." 
                className="pl-11 h-14 bg-slate-50 border-none rounded-2xl font-bold text-slate-700 placeholder:text-slate-300 focus:ring-2 focus:ring-accent/20 transition-all shadow-inner" 
              />
            </div>
          </div>

          <div className="md:col-span-4 space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Audit Timeline</Label>
            <div className="relative group">
              <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300 group-focus-within:text-accent transition-colors" />
              <Input 
                type="date" 
                value={date} 
                onChange={e => setDate(e.target.value)} 
                className="pl-11 h-14 bg-slate-50 border-none rounded-2xl font-bold text-slate-700 focus:ring-2 focus:ring-accent/20 transition-all shadow-inner" 
              />
            </div>
          </div>

          <div className="md:col-span-3">
            <Button 
              onClick={handleSearch} 
              className="w-full h-14 bg-accent text-accent-foreground hover:bg-slate-900 font-black rounded-2xl shadow-xl shadow-accent/20 border-none transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2" 
              disabled={loading}
            >
              {loading ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Filter className="h-5 w-5" />}
              <span>{loading ? "SEARCHING..." : "EXECUTE"}</span>
            </Button>
          </div>
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
                p.collectedByName || "System"
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
          <Button 
            variant="outline" 
            className="flex-1 h-14 rounded-2xl border-emerald-200 text-emerald-600 font-bold hover:bg-emerald-50 transition-all flex flex-col items-center justify-center gap-1"
            onClick={() => {
              if (results.length === 0) {
                toast.error("No data to export");
                return;
              }
              
              const data = results.map(p => ({
                "Date": formatDate(p.date),
                "Member": p.memberName,
                "Account No": p.accountNo,
                "Amount": p.amount || 0,
                "Mode": (p.payMode || "").toUpperCase(),
                "Category": (p.status || "").toUpperCase(),
                "Agent": p.collectedByName || "System"
              }));

              exportToExcel(data, `Search_Export_${date || 'all'}`, "Search Results");
              toast.success("Results Exported as Excel");
            }}
          >
             <FileSpreadsheet size={18} />
             <span className="text-[10px] uppercase tracking-widest">Export Excel</span>
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
                <th className="p-4 text-[10px] uppercase tracking-widest font-black text-slate-400 text-right">Actions</th>
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
                             <div className="flex items-center gap-2">
                                <span className="font-bold text-primary group-hover:text-accent transition-colors">{r.memberName}</span>
                                {r.nameTelugu && (
                                  <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded italic">
                                    {r.nameTelugu}
                                  </span>
                                )}
                             </div>
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
                        <td className="p-4 text-right">
                          <div className="flex justify-end gap-1">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-slate-300 hover:text-blue-500 hover:bg-blue-50"
                              onClick={() => openTransfer(r)}
                              title="Shift to Another Account"
                            >
                              <ArrowRightLeft size={14} />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-slate-300 hover:text-accent hover:bg-accent/5"
                              onClick={() => openEdit(r)}
                            >
                              <Edit size={14} />
                            </Button>
                          </div>
                        </td>
                    </motion.tr>
                  ))
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px] glass-card border-none shadow-2xl p-0 overflow-hidden">
          <div className="bg-slate-900 p-6 text-white">
            <DialogTitle className="text-xl font-black italic uppercase tracking-tight flex items-center gap-2">
              <Edit size={20} className="text-accent" />
              Adjust Transaction
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs mt-1">
              Correcting entry for {selectedPosting?.memberName}
            </DialogDescription>
          </div>
          <div className="p-6 space-y-5">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Correct Amount</Label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input 
                  type="number" 
                  value={editAmount} 
                  onChange={e => setEditAmount(e.target.value)} 
                  className="pl-9 h-12 finance-input font-black text-lg" 
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Correction Date</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input 
                  type="date" 
                  value={editDate} 
                  onChange={e => setEditDate(e.target.value)} 
                  className="pl-9 h-12 finance-input font-bold" 
                />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setEditDialogOpen(false)} className="flex-1 h-12 rounded-xl font-bold uppercase tracking-widest text-xs border-slate-200">
                Cancel
              </Button>
              <Button onClick={saveEdit} className="flex-1 h-12 rounded-xl bg-slate-900 text-white font-bold uppercase tracking-widest text-xs shadow-lg hover:bg-slate-800">
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
        <DialogContent className="sm:max-w-[425px] glass-card border-none shadow-2xl p-0 overflow-hidden">
          <div className="bg-blue-600 p-6 text-white">
            <DialogTitle className="text-xl font-black italic uppercase tracking-tight flex items-center gap-2">
              <ArrowRightLeft size={20} />
              Shift Transaction
            </DialogTitle>
            <DialogDescription className="text-blue-100 text-xs mt-1 font-medium">
              Moving funds from {selectedPosting?.accountNo} to a new account.
            </DialogDescription>
          </div>
          <div className="p-6 space-y-6">
             <div className="flex items-center gap-4 p-4 bg-blue-50 rounded-2xl border border-blue-100">
                <div className="h-10 w-10 rounded-xl bg-white flex items-center justify-center text-blue-600 font-black shadow-sm">
                   {selectedPosting?.amount}
                </div>
                <div className="flex-1">
                   <p className="text-[10px] font-black uppercase text-blue-400">Transaction Date</p>
                   <p className="text-xs font-bold text-blue-900">{formatDate(selectedPosting?.date)}</p>
                </div>
                <MoveRight className="text-blue-300" />
             </div>

             <div className="space-y-2">
               <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Destination Account</Label>
               <div className="relative group">
                 <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                 <Input 
                   placeholder="Enter ACC-XXXX" 
                   value={destAccountNo}
                   onChange={e => setDestAccountNo(e.target.value.toUpperCase())}
                   className="pl-9 h-12 finance-input font-black text-lg border-slate-200" 
                 />
               </div>
               <p className="text-[10px] text-slate-400 font-medium italic px-1">Source account will be debited and target account credited automatically.</p>
             </div>

             <div className="flex gap-3 pt-2">
               <Button variant="outline" onClick={() => setTransferDialogOpen(false)} className="flex-1 h-12 rounded-xl font-bold uppercase tracking-widest text-xs">
                 Cancel
               </Button>
               <Button 
                 onClick={saveTransfer} 
                 disabled={loading || !destAccountNo}
                 className="flex-1 h-12 rounded-xl bg-blue-600 text-white font-bold uppercase tracking-widest text-xs shadow-lg hover:bg-blue-700"
               >
                 {loading ? "Processing..." : "Confirm Shift"}
               </Button>
             </div>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default PostingSearch;
