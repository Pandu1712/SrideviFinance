import { useState, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLine } from "@/contexts/LineContext";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, DocumentData } from "firebase/firestore";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { Users, Search, User, MapPin, Phone, Calendar, ArrowUpRight, Filter, Edit, Trash2, Eye, ShieldAlert, CheckCircle2 } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { deleteDoc, doc, updateDoc } from "firebase/firestore";
import { toast } from "sonner";

const Members = () => {
  const { userData } = useAuth();
  const { selectedLineId } = useLine();
  const navigate = useNavigate();
  const [members, setMembers] = useState<DocumentData[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!userData) return;
      try {
        let q;
        let accountsRef: any = collection(db, "accounts");
        
        if (userData.role === "super_admin") {
          q = selectedLineId ? query(accountsRef, where("lineId", "==", selectedLineId)) : query(accountsRef);
        } else if (userData.role === "admin") {
          q = query(accountsRef, where("adminId", "==", userData.uid));
          if (selectedLineId) q = query(q, where("lineId", "==", selectedLineId));
        } else {
          q = query(accountsRef, where("agentId", "==", userData.uid));
          if (selectedLineId) q = query(q, where("lineId", "==", selectedLineId));
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

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you absolutely sure you want to delete ${name}'s account? This cannot be undone.`)) return;
    
    try {
      await deleteDoc(doc(db, "accounts", id));
      setMembers(prev => prev.filter(m => m.id !== id));
      toast.success("Account permanently deleted.");
    } catch (err: any) {
      toast.error("Failed to delete account: " + err.message);
    }
  };

  const openEdit = (member: DocumentData) => {
    navigate(`/accounts/edit/${member.id}`);
  };

  const filtered = members.filter(m =>
    m.name?.toLowerCase().includes(search.toLowerCase()) ||
    m.accountNo?.toLowerCase().includes(search.toLowerCase()) ||
    m.village?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-premium-gradient flex items-center justify-center shadow-lg transform rotate-3">
            <Users className="text-white h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-primary">Member Registry</h1>
            <p className="text-muted-foreground font-medium">Manage and monitor all finance subscribers in one place.</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative group">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground group-focus-within:text-accent transition-colors" />
            <Input 
              placeholder="Search members..." 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              className="pl-9 h-10 w-full md:w-72 glass-card border-none shadow-sm" 
            />
          </div>
          <button className="h-10 w-10 flex items-center justify-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
            <Filter size={18} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="glass-card bg-primary text-white border-none">
          <CardContent className="p-6">
            <p className="text-xs font-bold uppercase tracking-widest opacity-70">Total Subscribers</p>
            <div className="flex items-end justify-between mt-2">
              <h2 className="text-4xl font-black">{members.length}</h2>
              <Badge className="bg-white/20 text-white border-none">Active Database</Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-none">
          <CardContent className="p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Active Collections</p>
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
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Completed Portfolios</p>
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
                          <div className="h-11 w-11 rounded-full bg-slate-100 flex items-center justify-center font-bold text-primary group-hover:bg-accent group-hover:text-accent-foreground transition-all duration-300">
                            {m.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || "M"}
                          </div>
                          <div>
                            <p className="text-[10px] font-black text-accent uppercase tracking-tighter mb-0.5">{m.accountNo}</p>
                            <button 
                              onClick={() => navigate(`/ledger?acc=${m.accountNo}`)}
                              className="text-sm font-black text-primary hover:text-accent transition-colors text-left"
                            >
                              {m.name}
                            </button>
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
                          </div>
                        </div>
                      </td>
                      <td className="p-5">
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Principal</p>
                          <p className="text-[10px] font-black text-primary">{formatCurrency(m.totalAmount)}</p>
                          <p className="text-[10px] font-medium text-slate-600">Starts {formatDate(m.startDate)}</p>
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
