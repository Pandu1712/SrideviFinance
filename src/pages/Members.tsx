import { useState, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLine } from "@/contexts/LineContext";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, DocumentData } from "firebase/firestore";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { Users, Search, User, MapPin, Phone, Calendar, ArrowUpRight, Filter, Edit, Trash2, Eye, ShieldAlert, CheckCircle2, Download, FileSpreadsheet, Printer } from "lucide-react";
import { formatCurrency, formatDate, formatCurrencyPDF } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { deleteDoc, doc, updateDoc, writeBatch } from "firebase/firestore";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { exportToExcel } from "@/lib/excel";

const Members = () => {
  const { userData } = useAuth();
  const { selectedLineId, lines } = useLine();
  const navigate = useNavigate();
  const [members, setMembers] = useState<DocumentData[]>([]);
  const [search, setSearch] = useState("");
  const [villageFilter, setVillageFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [availableVillages, setAvailableVillages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!userData) return;
      try {
        let q;
        let accountsRef: any = collection(db, "accounts");
        
        if (!selectedLineId) {
          setMembers([]);
          setLoading(false);
          return;
        }

        q = query(accountsRef, where("lineId", "==", selectedLineId));
        
        if (userData.role === "admin") {
          q = query(q, where("adminId", "==", userData.uid));
        }
        
        const snap = await getDocs(q);
        const list: DocumentData[] = [];
        snap.forEach(d => list.push({ id: d.id, ...(d.data() as Record<string, any>) }));
        setMembers(list);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [userData, selectedLineId]);

  // Fetch available villages for the selected line
  useEffect(() => {
    const fetchLineVillages = async () => {
      if (!selectedLineId) {
        setAvailableVillages([]);
        return;
      }
      try {
        const q = query(collection(db, "villages"), where("lineId", "==", selectedLineId));
        const snap = await getDocs(q);
        const vils = snap.docs.map(d => d.data().name).sort();
        setAvailableVillages(vils);
      } catch (err) {
        console.error("Fetch villages error:", err);
      }
    };
    fetchLineVillages();
  }, [selectedLineId]);

  const handleDelete = async (id: string, name: string) => {
    const member = members.find(m => m.id === id);
    if (member && (member.balance > 0 || member.status !== 'completed')) {
      toast.error(`Cannot delete! ${name} has not fully paid their balance. Remaining: ${formatCurrency(member.balance || 0)}`);
      return;
    }

    if (!window.confirm(`Are you sure you want to delete ${name}'s account? The account will be removed, but all financial postings will be securely preserved to maintain total collection accuracy.`)) return;
    
    try {
      // Delete ONLY the account. We intentionally PRESERVE the postings 
      // so that total collections, profits, and investments are not affected.
      await deleteDoc(doc(db, "accounts", id));
      
      setMembers(prev => prev.filter(m => m.id !== id));
      toast.success("Account successfully deleted. Transaction history preserved for analytics.");
    } catch (err: any) {
      toast.error("Failed to delete account: " + err.message);
    }
  };

  const openEdit = (member: DocumentData) => {
    navigate(`/accounts/edit/${member.id}`);
  };

  const today = new Date().toISOString().split("T")[0];

  const filtered = members.filter(m => {
    const matchSearch = m.name?.toLowerCase().includes(search.toLowerCase()) ||
                        m.nameTelugu?.toLowerCase().includes(search.toLowerCase()) ||
                        m.accountNo?.toLowerCase().includes(search.toLowerCase()) ||
                        m.village?.toLowerCase().includes(search.toLowerCase());
    
    const matchVillage = villageFilter === "all" || m.village === villageFilter;
    
    let matchStatus = true;
    if (statusFilter === "active") matchStatus = m.status === "active";
    if (statusFilter === "completed") matchStatus = m.status === "completed";
    if (statusFilter === "expired") matchStatus = m.status === "active" && m.endDate && m.endDate < today;

    return matchSearch && matchVillage && matchStatus;
  }).sort((a, b) => {
    const accA = parseInt(a.accountNo || "0", 10);
    const accB = parseInt(b.accountNo || "0", 10);
    return accA - accB;
  });

  const exportToPDF = () => {
    if (filtered.length === 0) {
      toast.error("No members to export");
      return;
    }
    
    const doc = new jsPDF();
    
    const activeLine = lines.find(l => l.id === selectedLineId);
    const lineName = activeLine?.name || "Consolidated Portfolio";

    doc.setFontSize(22);
    doc.setTextColor(15, 23, 42);
    doc.text("Sridevi Finance Hub", 14, 22);
    
    doc.setFontSize(14);
    doc.setTextColor(100, 116, 139);
    doc.text(`Members Registry: ${lineName}`, 14, 30);
    
    doc.setFontSize(8);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 38);
    doc.text(`Total Records: ${filtered.length}`, 14, 43);
    
    const tableColumn = ["Acc No", "Name", "Village", "Phone", "Principal", "Balance", "Extra", "Status", "Creator"];
    const tableRows = filtered.map(m => [
      m.accountNo || "N/A",
      m.name || "N/A",
      m.village || "N/A",
      m.phone || "N/A",
      formatCurrencyPDF(m.totalAmount || 0),
      formatCurrencyPDF(m.balance || 0),
      formatCurrencyPDF((m.totalExtraPaid || 0) + Math.max(0, (m.paid || 0) - (m.totalAmount || 0))),
      m.status.toUpperCase(),
      `${m.adminRole?.toUpperCase() || "ADMIN"}`
    ]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 50,
      theme: 'striped',
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      styles: { fontSize: 6, cellPadding: 2, textColor: [51, 65, 85] },
      columnStyles: {
        0: { cellWidth: 15 },
        1: { cellWidth: 45 },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' },
        8: { fontStyle: 'bold', textColor: [15, 23, 42] }
      }
    });

    doc.save(`Members_Registry_${new Date().getTime()}.pdf`);
    toast.success("PDF Exported Successfully");
  };

  const handleExportExcel = () => {
    if (filtered.length === 0) {
      toast.error("No members to export");
      return;
    }
    
    const data = filtered.map(m => ({
      "Account No": m.accountNo,
      "Name": m.name,
      "Name (Telugu)": m.nameTelugu || "",
      "Village": m.village || "N/A",
      "Phone": m.phone || "N/A",
      "Total Amount": m.totalAmount || 0,
      "Paid": m.paid || 0,
      "Extra Paid": (m.totalExtraPaid || 0) + Math.max(0, (m.paid || 0) - (m.totalAmount || 0)),
      "Balance": m.balance || 0,
      "Installment": m.installmentAmount || 0,
      "Frequency": m.paymentFrequency?.toUpperCase(),
      "Status": m.status?.toUpperCase(),
      "Start Date": m.creationDate || m.startDate || "N/A",
      "End Date": m.endDate || "N/A",
    }));

    exportToExcel(data, `Members_Registry_${selectedLineId || 'all'}`, "Members");
    toast.success("Excel Exported Successfully");
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="bg-white p-6 sm:p-10 rounded-[3rem] border border-slate-100 shadow-2xl shadow-slate-200/50 space-y-10 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-accent/5 rounded-full -mr-32 -mt-32 blur-3xl" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-5">
            <div className="h-16 w-16 rounded-3xl bg-premium-gradient flex items-center justify-center shadow-2xl transform -rotate-3 transition-transform hover:rotate-0">
              <Users className="text-white h-8 w-8" />
            </div>
            <div>
              <h1 className="text-4xl font-black tracking-tight text-slate-900">Member Registry</h1>
              <p className="text-slate-400 font-bold text-xs uppercase tracking-[0.2em] mt-1 opacity-80">Portfolio Intelligence & Monitoring</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 bg-slate-50 p-2 rounded-2xl border border-slate-100">
             <Button 
               variant="outline" 
               className="h-12 px-4 sm:px-6 bg-white border-slate-200 text-slate-600 font-black text-[9px] sm:text-[10px] uppercase tracking-widest rounded-xl shadow-sm hover:bg-slate-50 transition-all flex items-center gap-2"
               onClick={() => window.print()}
             >
               <Printer size={16} className="text-slate-600" /> <span className="hidden xs:inline">Print / Save PDF (Telugu)</span><span className="xs:hidden">Print</span>
             </Button>
             <Button 
               variant="outline" 
               className="h-12 px-4 sm:px-6 bg-white border-slate-200 text-slate-600 font-black text-[9px] sm:text-[10px] uppercase tracking-widest rounded-xl shadow-sm hover:bg-slate-50 transition-all flex items-center gap-2"
               onClick={exportToPDF}
             >
               <Download size={16} className="text-accent" /> PDF
             </Button>
             <Button 
               variant="outline" 
               className="h-12 px-4 sm:px-6 bg-white border-slate-200 text-slate-600 font-black text-[9px] sm:text-[10px] uppercase tracking-widest rounded-xl shadow-sm hover:bg-emerald-50 hover:text-emerald-600 transition-all flex items-center gap-2"
               onClick={handleExportExcel}
             >
               <FileSpreadsheet size={16} className="text-emerald-500" /> Excel
             </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 relative z-10">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300 group-focus-within:text-accent transition-colors" />
            <Input 
              placeholder="Search identity..." 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              className="pl-12 h-14 bg-slate-50 border-none rounded-2xl font-bold text-slate-700 placeholder:text-slate-300 focus:ring-2 focus:ring-accent/20 transition-all shadow-inner" 
            />
          </div>
          
          <Select value={villageFilter} onValueChange={setVillageFilter}>
            <SelectTrigger className="h-14 bg-slate-50 border-none rounded-2xl font-bold text-slate-600 text-[11px] uppercase tracking-widest shadow-inner">
              <SelectValue placeholder="Village Filter" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl border-none shadow-2xl">
              <SelectItem value="all">Global Territory</SelectItem>
              {availableVillages.map(v => (
                <SelectItem key={v} value={v}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-14 bg-slate-50 border-none rounded-2xl font-bold text-slate-600 text-[11px] uppercase tracking-widest shadow-inner">
              <SelectValue placeholder="Status State" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl border-none shadow-2xl">
              <SelectItem value="all">All States</SelectItem>
              <SelectItem value="active">Active Recovery</SelectItem>
              <SelectItem value="completed">Fully Reconciled</SelectItem>
              <SelectItem value="expired">Term Expired</SelectItem>
            </SelectContent>
          </Select>

          <div className="bg-accent/10 rounded-2xl p-4 flex items-center justify-between border border-accent/10">
             <div className="flex flex-col">
                <span className="text-[10px] font-black text-accent uppercase tracking-widest">Active Members</span>
                <span className="text-2xl font-black text-primary leading-none mt-1">{filtered.length}</span>
             </div>
             <Filter size={20} className="text-accent opacity-40" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="glass-card border-none">
          <CardContent className="p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Total Customers</p>
            <div className="flex items-end justify-between mt-2">
              <h2 className="text-4xl font-black text-primary">{members.length}</h2>
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary transition-transform hover:scale-110">
                <Users size={18} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-none">
          <CardContent className="p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Active Customers</p>
            <div className="flex items-end justify-between mt-2">
              <h2 className="text-4xl font-black text-emerald-600">
                {members.filter(m => m.status === 'active').length}
              </h2>
              <div className="h-8 w-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600 transition-transform hover:scale-110">
                <ArrowUpRight size={18} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-none">
          <CardContent className="p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Complete Customers</p>
            <div className="flex items-end justify-between mt-2">
              <h2 className="text-4xl font-black text-accent">
                {members.filter(m => m.status === 'completed').length}
              </h2>
              <div className="h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center text-accent transition-transform hover:scale-110">
                <Calendar size={18} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card border-none shadow-xl overflow-hidden">
        <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-4 px-6">
          <CardTitle className="text-sm font-bold flex items-center gap-2 text-primary/70 uppercase tracking-widest">
            <User className="h-4 w-4 text-accent" />
            Registry Database
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="p-5 text-[10px] uppercase tracking-[0.2em] font-black text-slate-500">Member details</th>
                <th className="p-5 text-[10px] uppercase tracking-[0.2em] font-black text-slate-500">Loan Status</th>
                <th className="p-5 text-[10px] uppercase tracking-[0.2em] font-black text-slate-500 text-right">Repayment Progress</th>
                <th className="p-5 text-[10px] uppercase tracking-[0.2em] font-black text-slate-500 text-right">Extra Collected</th>
                <th className="p-5 text-[10px] uppercase tracking-[0.2em] font-black text-slate-500 text-center">Status</th>
                <th className="p-5 text-[10px] uppercase tracking-[0.2em] font-black text-slate-500 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan={4} className="p-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-8 w-8 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
                      <p className="text-sm font-bold text-slate-400">Fetching members...</p>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-32 text-center text-muted-foreground italic">
                    <Users className="h-16 w-16 mx-auto mb-4 opacity-10" />
                    No members matching your criteria were found.
                  </td>
                </tr>
              ) : (
                <AnimatePresence>
                  {filtered.map((m, i) => (
                    <motion.tr 
                      key={m.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.02 }}
                      className="group hover:bg-slate-50/80 transition-all cursor-default"
                    >
                      <td className="p-5">
                        <div className="flex items-center gap-4">
                          <div className="h-12 w-12 rounded-xl bg-slate-900 flex items-center justify-center text-lg font-black text-white shadow-xl group-hover:bg-accent transition-all duration-300">
                            {m.accountNo}
                          </div>
                          <div>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Account # {m.accountNo}</p>
                            <div className="flex items-center gap-2">
                               <button 
                                 onClick={() => navigate(`/ledger?acc=${m.accountNo}`)}
                                 className="text-sm font-black text-slate-900 hover:text-accent transition-colors text-left"
                               >
                                 {m.name}
                               </button>
                               {m.nameTelugu && (
                                 <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100 italic">
                                   {m.nameTelugu}
                                 </span>
                               )}
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-400 font-medium font-mono uppercase tracking-tight">
                              <span className="flex items-center gap-1">
                                <MapPin size={10} className={m.customerLocation ? "text-accent" : "text-slate-300"} /> 
                                {m.customerLocation ? (
                                  <button 
                                    className="hover:text-accent underline underline-offset-2 decoration-accent/20"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const loc = m.customerLocation;
                                      if (loc.startsWith('http')) window.open(loc, '_blank');
                                      else toast.info("Location: " + loc);
                                    }}
                                  >
                                    {m.village || 'Location'}
                                  </button>
                                ) : (
                                  m.village || 'N/A'
                                )}
                              </span>
                              <span className="flex items-center gap-1"><Phone size={10} className="text-slate-300" /> {m.phone || 'N/A'}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-50/50">
                              <Badge variant="outline" className="h-4 text-[7px] font-black px-1.5 border-slate-200 text-slate-400 uppercase tracking-widest bg-slate-50">
                                {m.adminRole || "SYSTEM"}
                              </Badge>
                              <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">
                                By: {m.adminName || "Administrator"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="p-5">
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Account History</p>
                          <p className="text-[10px] font-black text-indigo-600">Registered {m.creationDate ? formatDate(m.creationDate) : formatDate(m.createdAt)}</p>
                          <p className="text-[10px] font-medium text-slate-500 italic">Expires {formatDate(m.endDate)}</p>
                        </div>
                      </td>
                      <td className="p-5">
                        <div className="space-y-2 text-right">
                          <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest">
                            <span className="text-slate-400">Balance Due</span>
                            <span className="text-destructive font-black">{formatCurrency(m.balance)}</span>
                          </div>
                          <div className="h-2 w-48 ml-auto bg-slate-100 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min(100, (m.paid / (m.totalAmount || 1)) * 100)}%` }}
                              className="h-full bg-emerald-500"
                            />
                          </div>
                          <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                            {Math.round((m.paid / (m.totalAmount || 1)) * 100)}% Complete
                          </p>
                        </div>
                      </td>
                      <td className="p-5 text-right">
                         <span className="text-sm font-black text-indigo-600">
                           {formatCurrency((m.totalExtraPaid || 0) + Math.max(0, (m.paid || 0) - (m.totalAmount || 0)))}
                         </span>
                         <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1">Misc Total</p>
                      </td>
                      <td className="p-5 text-center">
                        <Badge className={`${
                          m.status === "completed" 
                            ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" 
                            : m.status === "active" 
                              ? "bg-blue-100 text-blue-700 hover:bg-blue-200" 
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        } border-none font-bold text-[10px] uppercase tracking-widest py-1 px-3`}>
                          {m.status}
                        </Badge>
                      </td>
                      <td className="p-5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 rounded-lg text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50"
                            onClick={() => navigate(`/ledger?acc=${m.accountNo}`)}
                            title="View Detailed Ledger"
                          >
                            <Eye size={14} />
                          </Button>
                          {(userData?.role === "super_admin" || userData?.role === "admin" || userData?.role === "partner") && (
                            <>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 rounded-lg text-slate-400 hover:text-primary hover:bg-primary/5"
                                onClick={() => openEdit(m)}
                              >
                                <Edit size={14} />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 rounded-lg text-slate-400 hover:text-destructive hover:bg-destructive/5"
                                onClick={() => handleDelete(m.id, m.name)}
                              >
                                <Trash2 size={14} />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default Members;
