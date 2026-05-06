import { useAuth } from "@/contexts/AuthContext";
import { useLine } from "@/contexts/LineContext";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, DocumentData, orderBy } from "firebase/firestore";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Printer, Search, FileText, MapPin } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";

const BookPrint = () => {
  const { userData } = useAuth();
  const { selectedLineId, lines } = useLine();
  const [accounts, setAccounts] = useState<DocumentData[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      if (!userData) return;
      setLoading(true);
      try {
        let q;
        const accountsRef = collection(db, "accounts");
        
        if (userData.role === "super_admin") {
          q = selectedLineId 
              ? query(accountsRef, where("lineId", "==", selectedLineId), orderBy("accountNo"))
              : query(accountsRef, orderBy("accountNo"));
        } else if (userData.role === "admin") {
          q = selectedLineId
              ? query(accountsRef, where("adminId", "==", userData.uid), where("lineId", "==", selectedLineId), orderBy("accountNo"))
              : query(accountsRef, where("adminId", "==", userData.uid), orderBy("accountNo"));
        } else {
          const lineId = selectedLineId || userData.lineId || "";
          q = query(accountsRef, where("lineId", "==", lineId), orderBy("accountNo"));
        }

        const snap = await getDocs(q);
        const list: DocumentData[] = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() as any }));
        setAccounts(list);
      } catch (err) {
        console.error("Fetch error:", err);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [userData, selectedLineId]);

  const filtered = accounts.filter(a =>
    a.name?.toLowerCase().includes(search.toLowerCase()) ||
    a.accountNo?.toLowerCase().includes(search.toLowerCase())
  );

  const handlePrint = () => window.print();

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8 pb-20"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 print:hidden">
        <div className="flex items-center gap-5">
           <div className="h-14 w-14 rounded-2xl bg-slate-900 flex items-center justify-center shadow-2xl">
              <FileText className="text-white h-7 w-7" />
           </div>
           <div>
              <h1 className="text-3xl font-black tracking-tighter uppercase italic text-slate-900">Book Print</h1>
              <div className="flex items-center gap-2 mt-0.5">
                 <MapPin size={12} className="text-slate-400" />
                 <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Active Channel: {selectedLineId ? lines.find(l => l.id === selectedLineId)?.name : 'Full Portfolio'}
                 </p>
              </div>
           </div>
        </div>
        <Button onClick={handlePrint} className="h-12 px-8 bg-accent text-accent-foreground hover:bg-accent/90 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-lg transition-all active:scale-95">
          <Printer className="mr-3 h-5 w-5" /> Execute Print
        </Button>
      </div>

      <Card className="glass-card border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden print:shadow-none print:border-none">
        <div className="p-8 border-b border-slate-50 flex items-center justify-between print:hidden">
           <div className="relative group w-full max-w-md">
              <Search className="absolute left-4 top-3.5 h-4 w-4 text-slate-300 group-focus-within:text-accent transition-colors" />
              <Input 
                placeholder="Locate account..." 
                value={search} 
                onChange={e => setSearch(e.target.value)} 
                className="pl-11 h-11 bg-slate-50/50 border-none rounded-xl font-bold text-xs placeholder:text-slate-300 transition-all focus:bg-white focus:ring-2 focus:ring-accent/10" 
              />
           </div>
           <div className="hidden md:flex items-center gap-2">
              <Badge variant="outline" className="border-slate-100 text-[9px] font-black uppercase tracking-widest text-slate-400">
                 {filtered.length} Indexed Members
              </Badge>
           </div>
        </div>
        
        <CardContent className="p-0 overflow-x-auto no-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 print:bg-slate-100">
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 border-b border-slate-50 print:text-black">S.No</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 border-b border-slate-50 print:text-black">Acc No</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 border-b border-slate-50 print:text-black">Member Identity</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 border-b border-slate-50 print:text-black">Contact</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 border-b border-slate-50 print:text-black text-right">Principal</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 border-b border-slate-50 print:text-black text-right">Recovery</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 border-b border-slate-50 print:text-black text-right">Deficit</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 border-b border-slate-50 print:text-black text-right">Installment</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="text-center py-24">
                       <div className="animate-spin h-8 w-8 border-4 border-slate-100 border-t-accent rounded-full mx-auto" />
                       <p className="mt-4 text-[10px] font-black uppercase tracking-widest text-slate-300">Compiling Portfolio...</p>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-24 text-slate-300 font-black uppercase tracking-widest text-[10px]">
                       No accounts discovered in this channel
                    </td>
                  </tr>
                ) : filtered.map((a, i) => (
                  <motion.tr 
                    key={a.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.01 }}
                    className="group hover:bg-slate-50/50 transition-colors border-b border-slate-50 print:border-slate-100"
                  >
                    <td className="px-8 py-5 font-black text-slate-300 text-[10px]">{i + 1}</td>
                    <td className="px-8 py-5 font-black text-xs text-primary/60 tracking-widest uppercase">{a.accountNo}</td>
                     <td className="px-8 py-5">
                        <div className="flex flex-col">
                           <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-black text-slate-900 text-sm uppercase leading-tight">{a.name}</span>
                              {a.nameTelugu && <span className="text-[10px] font-bold text-slate-500 font-telugu whitespace-nowrap">({a.nameTelugu})</span>}
                           </div>
                           <span className="text-[8px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{a.fatherHusbandName || 'Personal Profile'}</span>
                        </div>
                     </td>
                    <td className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">{a.phone || "-"}</td>
                    <td className="px-8 py-5 text-right font-black text-slate-900 text-sm">{formatCurrency(a.totalAmount)}</td>
                    <td className="px-8 py-5 text-right font-black text-emerald-600 text-sm">{formatCurrency(a.paid)}</td>
                    <td className="px-8 py-5 text-right font-black text-rose-500 text-sm">{formatCurrency(a.balance)}</td>
                    <td className="px-8 py-5 text-right">
                       <Badge variant="outline" className="bg-slate-50 border-none font-black text-[10px] text-primary px-3 py-1">
                          {formatCurrency(a.installmentAmount)}
                       </Badge>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default BookPrint;
