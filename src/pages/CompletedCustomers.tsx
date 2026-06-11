import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLine } from "@/contexts/LineContext";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, DocumentData, limit, deleteDoc, doc, writeBatch, updateDoc } from "firebase/firestore";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Users, Search, User, MapPin, Phone, Calendar, Trash2, ArrowLeft, AlertCircle } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const CompletedCustomers = () => {
  const { userData } = useAuth();
  const { selectedLineId } = useLine();
  const navigate = useNavigate();
  const [members, setMembers] = useState<DocumentData[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!userData) return;
      try {
        const accountsRef = collection(db, "accounts");
        let q;
        
        if (selectedLineId) {
          q = query(accountsRef, where("lineId", "==", selectedLineId), where("status", "==", "completed"));
        } else if (userData.role === "super_admin") {
          q = query(accountsRef, where("status", "==", "completed"));
        } else {
          setMembers([]);
          setLoading(false);
          return;
        }

        if (userData.role === "admin" || userData.role === "partner") {
          q = query(q, where("adminId", "==", userData.uid));
        }
        
        const snap = await getDocs(q);
        const list: DocumentData[] = [];
        snap.forEach(d => list.push({ id: d.id, ...(d.data() as Record<string, any>) }));
        
        // Sort by account number
        list.sort((a, b) => {
          const accA = parseInt(a.accountNo || "0", 10);
          const accB = parseInt(b.accountNo || "0", 10);
          return accA - accB;
        });

        setMembers(list);
      } catch (err) {
        console.error(err);
        toast.error("Failed to load completed customers.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [userData, selectedLineId]);

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete ${name}'s account? Financial history will be preserved.`)) return;
    
    try {
      await updateDoc(doc(db, "accounts", id), { status: "deleted" });
      setMembers(prev => prev.filter(m => m.id !== id));
      toast.success("Account successfully deleted. Transaction history preserved.");
    } catch (err: any) {
      toast.error("Failed to delete account: " + err.message);
    }
  };

  const handleBulkDelete = async () => {
    if (members.length === 0) return;
    
    setIsDeleting(true);
    const toastId = toast.loading(`Deleting ${members.length} accounts...`);
    
    try {
      const batch = writeBatch(db);
      
      // Firestore batch has a limit of 500 operations
      // If there are more than 500, we need to chunk them, but for this app it's unlikely to exceed 500 at once.
      // We will slice to first 450 just to be safe.
      const chunk = members.slice(0, 450);
      
      chunk.forEach(m => {
        batch.update(doc(db, "accounts", m.id), { status: "deleted" });
      });

      await batch.commit();
      
      setMembers(prev => prev.filter(m => !chunk.find(c => c.id === m.id)));
      toast.success(`Successfully deleted ${chunk.length} completed accounts.`, { id: toastId });
      setBulkDeleteOpen(false);
    } catch (err: any) {
      console.error(err);
      toast.error("Bulk delete failed: " + err.message, { id: toastId });
    } finally {
      setIsDeleting(false);
    }
  };

  const filtered = members.filter(m => {
    const term = search.toLowerCase();
    return m.name?.toLowerCase().includes(term) ||
           m.nameTelugu?.toLowerCase().includes(term) ||
           m.accountNo?.toLowerCase().includes(term) ||
           m.village?.toLowerCase().includes(term);
  });

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-7xl mx-auto space-y-6"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button 
            variant="outline" 
            size="icon" 
            className="h-12 w-12 rounded-xl"
            onClick={() => navigate('/members')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="h-12 w-12 rounded-xl bg-amber-100 flex items-center justify-center shadow-sm">
            <Calendar className="text-amber-600 h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900">Completed Customers</h1>
            <p className="text-slate-500 font-medium text-sm">Fully reconciled accounts ready for archival or deletion.</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Search complete accounts..." 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              className="pl-10 h-11 bg-white border-slate-200 shadow-sm" 
            />
          </div>
          
          {(userData?.role === "super_admin" || userData?.role === "admin" || userData?.role === "partner") && (
            <Button 
              onClick={() => setBulkDeleteOpen(true)}
              disabled={filtered.length === 0 || loading}
              className="bg-rose-500 hover:bg-rose-600 text-white shadow-lg h-11 px-6 font-bold uppercase tracking-widest text-[10px]"
            >
              <Trash2 className="mr-2 h-4 w-4" /> Bulk Delete All
            </Button>
          )}
        </div>
      </div>

      <Card className="glass-card border-none shadow-xl overflow-hidden rounded-3xl">
        <CardHeader className="bg-slate-50/80 border-b border-slate-100 py-5 px-6">
          <CardTitle className="text-xs font-black flex items-center justify-between text-slate-500 uppercase tracking-[0.2em]">
            <span className="flex items-center gap-2"><User className="h-4 w-4 text-amber-500" /> Completed Records ({filtered.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-white border-b border-slate-100">
                <th className="p-5 text-[10px] uppercase tracking-[0.2em] font-black text-slate-400">Identity</th>
                <th className="p-5 text-[10px] uppercase tracking-[0.2em] font-black text-slate-400">Timeline</th>
                <th className="p-5 text-[10px] uppercase tracking-[0.2em] font-black text-slate-400 text-right">Financials</th>
                <th className="p-5 text-[10px] uppercase tracking-[0.2em] font-black text-slate-400 text-center">Status</th>
                {(userData?.role === "super_admin" || userData?.role === "admin" || userData?.role === "partner") && (
                  <th className="p-5 text-[10px] uppercase tracking-[0.2em] font-black text-slate-400 text-right">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 bg-white/50">
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-8 w-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                      <p className="text-sm font-bold text-slate-400">Loading completed accounts...</p>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-20 text-center text-slate-400 italic">
                    <Calendar className="h-12 w-12 mx-auto mb-4 opacity-20 text-amber-500" />
                    <p className="font-bold text-lg text-slate-500">No completed customers found.</p>
                    <p className="text-sm">They might not exist in the current line or match your search.</p>
                  </td>
                </tr>
              ) : (
                filtered.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-5">
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-xl bg-amber-100 flex items-center justify-center text-lg font-black text-amber-700 shadow-sm border border-amber-200">
                          {m.accountNo}
                        </div>
                        <div>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Account # {m.accountNo}</p>
                          <div className="flex items-center gap-2">
                             <span className="text-sm font-black text-slate-900">{m.name}</span>
                             {m.nameTelugu && (
                               <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100 italic">
                                 {m.nameTelugu}
                               </span>
                             )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-400 font-medium font-mono uppercase tracking-tight">
                            <span className="flex items-center gap-1">
                              <MapPin size={10} className="text-amber-500" /> 
                              {m.village || 'N/A'}
                            </span>
                            <span className="flex items-center gap-1"><Phone size={10} className="text-slate-300" /> {m.phone || 'N/A'}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-5">
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Account History</p>
                        <p className="text-[10px] font-black text-indigo-600">Started: {m.creationDate ? formatDate(m.creationDate) : formatDate(m.createdAt)}</p>
                        <p className="text-[10px] font-medium text-slate-500 italic">Ended: {m.endDate ? formatDate(m.endDate) : 'N/A'}</p>
                      </div>
                    </td>
                    <td className="p-5 text-right">
                      <div className="space-y-1">
                        <p className="text-xs font-black text-emerald-600">Collected: {formatCurrency(m.paid)}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          Original: {formatCurrency(m.totalAmount)}
                        </p>
                      </div>
                    </td>
                    <td className="p-5 text-center">
                      <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-200 border-none font-black text-[9px] uppercase tracking-widest py-1 px-3">
                        COMPLETED
                      </Badge>
                    </td>
                    {(userData?.role === "super_admin" || userData?.role === "admin" || userData?.role === "partner") && (
                      <td className="p-5 text-right">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-9 w-9 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                          onClick={() => handleDelete(m.id, m.name)}
                          title="Delete Account"
                        >
                          <Trash2 size={16} />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Bulk Delete Alert Dialog */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent className="border-rose-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center text-rose-600 gap-2">
              <AlertCircle className="h-6 w-6" />
              Mass Account Deletion Warning
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-600 font-medium pt-2">
              You are about to permanently delete <strong>{filtered.length}</strong> completed accounts.<br/><br/>
              This will remove the member profiles from the registry, but <strong className="text-emerald-600">all their financial postings and payments will be safely preserved</strong> to maintain the integrity of your overall profit/collection totals.<br/><br/>
              Are you absolutely sure you want to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel disabled={isDeleting} className="font-bold">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-rose-600 hover:bg-rose-700 font-bold"
              disabled={isDeleting}
              onClick={handleBulkDelete}
            >
              {isDeleting ? "Deleting..." : "Yes, Delete Accounts"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </motion.div>
  );
};

export default CompletedCustomers;
