import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, DocumentData } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Archive, FileText, IndianRupee, MapPin, Calendar, Phone, Filter, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { formatCurrency } from "@/lib/utils";

const OldAccounts = () => {
  const { userData } = useAuth();
  const [accounts, setAccounts] = useState<DocumentData[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      if (!userData) return;
      let q;
      if (userData.role === "super_admin") q = query(collection(db, "accounts"), where("status", "==", "completed"));
      else if (userData.role === "admin") q = query(collection(db, "accounts"), where("adminId", "==", userData.uid), where("status", "==", "completed"));
      else q = query(collection(db, "accounts"), where("lineId", "==", userData.lineId || ""), where("status", "==", "completed"));
      try {
        const snap = await getDocs(q);
        const list: DocumentData[] = [];
        snap.forEach(d => list.push({ id: d.id, ...(d.data() as Record<string, any>) }));
        setAccounts(list);
      } catch { setAccounts([]); }
      setLoading(false);
    };
    fetch();
  }, [userData]);

  const filtered = accounts.filter(a =>
    a.name?.toLowerCase().includes(search.toLowerCase()) ||
    a.accountNo?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-slate-900 flex items-center justify-center shadow-xl border border-white/10">
            <Archive className="text-white h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-primary">Settled Archives</h1>
            <p className="text-muted-foreground font-medium">Repository of all matured and successfully completed accounts.</p>
          </div>
        </div>

        <div className="relative w-full md:w-80 group">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400 group-focus-within:text-accent transition-colors" />
          <Input 
            placeholder="Search by name or account..." 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            className="pl-9 h-11 finance-input" 
          />
        </div>
      </div>

      <Card className="glass-card border-none shadow-2xl overflow-hidden">
        <CardHeader className="bg-slate-50/50 border-b border-slate-100 flex flex-row items-center justify-between py-4">
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-slate-400" />
            <CardTitle className="text-sm font-black uppercase tracking-widest text-primary">Historical Registry</CardTitle>
          </div>
          <Badge className="bg-emerald-500/10 text-emerald-600 border-none font-black text-[10px] uppercase px-3">
            {filtered.length} ARCHIVED RECORDS
          </Badge>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="finance-table w-full">
            <thead>
              <tr className="bg-slate-50/30">
                <th className="p-4 text-[10px] uppercase tracking-widest font-black text-slate-400 text-center">Ref</th>
                <th className="p-4 text-[10px] uppercase tracking-widest font-black text-slate-400 text-left">Identity & Account</th>
                <th className="p-4 text-[10px] uppercase tracking-widest font-black text-slate-400 text-left">Location</th>
                <th className="p-4 text-[10px] uppercase tracking-widest font-black text-slate-400 text-right">Settlement</th>
                <th className="p-4 text-[10px] uppercase tracking-widest font-black text-slate-400 text-center">Duration</th>
                <th className="p-4 text-[10px] uppercase tracking-widest font-black text-slate-400"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-20"><div className="animate-pulse flex flex-col items-center"><Archive size={40} className="text-slate-200 mb-2" /><p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Retrieving Archives...</p></div></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-20 text-muted-foreground font-medium italic">No settled accounts found in this registry.</td></tr>
              ) : filtered.map((a, i) => (
                <motion.tr 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.02 }}
                  key={a.id} 
                  className="group hover:bg-slate-50/50 transition-colors border-b border-slate-50"
                >
                  <td className="p-4 text-center font-bold text-slate-300 text-xs">{String(i + 1).padStart(2, '0')}</td>
                  <td className="p-4">
                    <div className="flex flex-col">
                      <span className="font-black text-primary text-sm uppercase tracking-tight">{a.name}</span>
                      <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1"><FileText size={10} /> {a.accountNo}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-slate-600 flex items-center gap-1 uppercase"><MapPin size={10} /> {a.village || "N/A"}</span>
                      <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1"><Phone size={10} /> {a.phone || "---"}</span>
                    </div>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex flex-col items-end">
                      <span className="text-sm font-black text-primary">{formatCurrency(a.totalAmount)}</span>
                      <Badge className="bg-emerald-500/10 text-emerald-600 border-none font-bold text-[9px] uppercase mt-1">FULLY SETTLED</Badge>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center justify-center gap-3 text-[10px] font-bold text-slate-400">
                      <span className="flex items-center gap-1"><Calendar size={10} /> {a.startDate || "-"}</span>
                      <ChevronRight size={10} className="text-slate-200" />
                      <span className="flex items-center gap-1">{a.endDate || "-"}</span>
                    </div>
                  </td>
                  <td className="p-4 text-center">
                    <button className="h-8 w-8 rounded-lg bg-slate-50 text-slate-300 flex items-center justify-center hover:bg-slate-900 hover:text-white transition-all">
                       <ChevronRight size={16} />
                    </button>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default OldAccounts;
