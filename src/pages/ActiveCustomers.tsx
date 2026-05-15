import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLine } from "@/contexts/LineContext";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, where, DocumentData } from "firebase/firestore";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Users, Search, User, MapPin, Phone, ArrowLeft, ArrowUpRight, Eye, TrendingUp } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const ActiveCustomers = () => {
  const { userData } = useAuth();
  const { selectedLineId } = useLine();
  const navigate = useNavigate();
  const [members, setMembers] = useState<DocumentData[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userData) return;

    let q;
    const accountsRef = collection(db, "accounts");

    if (selectedLineId) {
      q = query(accountsRef, where("lineId", "==", selectedLineId), where("status", "==", "active"));
    } else if (userData.role === "super_admin") {
      q = query(accountsRef, where("status", "==", "active"));
    } else {
      setMembers([]);
      setLoading(false);
      return;
    }

    if (userData.role === "admin" || userData.role === "partner") {
      q = query(q, where("adminId", "==", userData.uid));
    }

    // Using onSnapshot for real-time tracking of payments/collections
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: DocumentData[] = [];
      snapshot.forEach(d => list.push({ id: d.id, ...(d.data() as Record<string, any>) }));
      
      // Sort by account number
      list.sort((a, b) => {
        const accA = parseInt(a.accountNo || "0", 10);
        const accB = parseInt(b.accountNo || "0", 10);
        return accA - accB;
      });

      setMembers(list);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching active customers live data:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userData, selectedLineId]);

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
          <div className="h-12 w-12 rounded-xl bg-emerald-100 flex items-center justify-center shadow-sm">
            <ArrowUpRight className="text-emerald-600 h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900">Active Customers</h1>
            <p className="text-slate-500 font-medium text-sm">Real-time financial tracking for ongoing accounts.</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Search active accounts..." 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              className="pl-10 h-11 bg-white border-slate-200 shadow-sm" 
            />
          </div>
        </div>
      </div>

      <Card className="glass-card border-none shadow-xl overflow-hidden rounded-3xl">
        <CardHeader className="bg-slate-50/80 border-b border-slate-100 py-5 px-6">
          <CardTitle className="text-xs font-black flex items-center justify-between text-slate-500 uppercase tracking-[0.2em]">
            <span className="flex items-center gap-2"><User className="h-4 w-4 text-emerald-500" /> Ongoing Records ({filtered.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-white border-b border-slate-100">
                <th className="p-5 text-[10px] uppercase tracking-[0.2em] font-black text-slate-400">Identity</th>
                <th className="p-5 text-[10px] uppercase tracking-[0.2em] font-black text-slate-400">Timeline</th>
                <th className="p-5 text-[10px] uppercase tracking-[0.2em] font-black text-slate-400 text-right">Expected (Total)</th>
                <th className="p-5 text-[10px] uppercase tracking-[0.2em] font-black text-emerald-600 text-right">Collected (Paid)</th>
                <th className="p-5 text-[10px] uppercase tracking-[0.2em] font-black text-rose-500 text-right">Pending (Balance)</th>
                <th className="p-5 text-[10px] uppercase tracking-[0.2em] font-black text-slate-400 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 bg-white/50">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-8 w-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                      <p className="text-sm font-bold text-slate-400">Syncing live data...</p>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-20 text-center text-slate-400 italic">
                    <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-20 text-emerald-500" />
                    <p className="font-bold text-lg text-slate-500">No active customers found.</p>
                    <p className="text-sm">They might not exist in the current line or match your search.</p>
                  </td>
                </tr>
              ) : (
                filtered.map((m) => {
                  const progressPercentage = Math.min(100, (m.paid / (m.totalAmount || 1)) * 100);
                  
                  return (
                    <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-5">
                        <div className="flex items-center gap-4">
                          <div className="h-12 w-12 rounded-xl bg-emerald-100 flex items-center justify-center text-lg font-black text-emerald-700 shadow-sm border border-emerald-200">
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
                                <MapPin size={10} className="text-emerald-500" /> 
                                {m.village || 'N/A'}
                              </span>
                              <span className="flex items-center gap-1"><Phone size={10} className="text-slate-300" /> {m.phone || 'N/A'}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="p-5">
                        <div className="space-y-1">
                          <p className="text-[10px] font-black text-indigo-600">Since: {m.creationDate ? formatDate(m.creationDate) : formatDate(m.createdAt)}</p>
                          <p className="text-[10px] font-medium text-slate-500 italic">Ends: {m.endDate ? formatDate(m.endDate) : 'N/A'}</p>
                        </div>
                      </td>
                      <td className="p-5 text-right">
                        <p className="text-sm font-black text-slate-700">{formatCurrency(m.totalAmount)}</p>
                      </td>
                      <td className="p-5 text-right">
                        <div className="space-y-2">
                          <p className="text-sm font-black text-emerald-600">{formatCurrency(m.paid)}</p>
                          <div className="h-1.5 w-24 ml-auto bg-slate-100 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${progressPercentage}%` }}
                              className="h-full bg-emerald-500"
                            />
                          </div>
                        </div>
                      </td>
                      <td className="p-5 text-right">
                        <div className="space-y-1">
                          <p className="text-sm font-black text-rose-500">{formatCurrency(m.balance)}</p>
                          {m.installmentAmount > 0 && (
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                              ~ {Math.ceil(m.balance / m.installmentAmount)} Days Left
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="p-5 text-right">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-9 rounded-xl text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 font-bold text-xs uppercase tracking-widest"
                          onClick={() => navigate(`/ledger?acc=${m.accountNo}`)}
                        >
                          <Eye size={14} className="mr-2" /> Ledger
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default ActiveCustomers;
