import { useAuth } from "@/contexts/AuthContext";
import { useLine } from "@/contexts/LineContext";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, DocumentData } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Printer, CalendarRange, Filter, FileSpreadsheet } from "lucide-react";
import { motion } from "framer-motion";

const WeeklyLineA4 = () => {
  const { userData } = useAuth();
  const { selectedLineId } = useLine();
  const [accounts, setAccounts] = useState<DocumentData[]>([]);
  const [postings, setPostings] = useState<DocumentData[]>([]);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      if (!userData) return;
      setLoading(true);
      let accQ, postQ;
      if (userData.role === "super_admin") {
        accQ = query(collection(db, "accounts"));
        postQ = query(collection(db, "postings"), where("date", ">=", startDate), where("date", "<=", endDate));
      } else if (userData.role === "admin") {
        accQ = query(collection(db, "accounts"), where("adminId", "==", userData.uid));
        postQ = query(collection(db, "postings"), where("adminId", "==", userData.uid), where("date", ">=", startDate), where("date", "<=", endDate));
      } else {
        accQ = query(collection(db, "accounts"), where("lineId", "==", userData.lineId || ""));
        postQ = query(collection(db, "postings"), where("lineId", "==", userData.lineId || ""), where("date", ">=", startDate), where("date", "<=", endDate));
      }

      if (selectedLineId) {
        accQ = query(accQ, where("lineId", "==", selectedLineId));
        postQ = query(postQ, where("lineId", "==", selectedLineId));
      }
      try {
        const [accSnap, postSnap] = await Promise.all([getDocs(accQ), getDocs(postQ)]);
        const accList: DocumentData[] = []; accSnap.forEach(d => accList.push({ id: d.id, ...(d.data() as Record<string, any>) }));
        const postList: DocumentData[] = []; postSnap.forEach(d => postList.push({ id: d.id, ...(d.data() as Record<string, any>) }));
        setAccounts(accList);
        setPostings(postList);
      } catch { setAccounts([]); setPostings([]); }
      setLoading(false);
    };
    fetch();
  }, [userData, startDate, endDate, selectedLineId]);

  const dates = [...new Set(postings.map(p => p.date))].sort();

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-6 p-6 bg-white rounded-2xl border border-slate-100 shadow-sm animate-fade-in-up">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-slate-400">
            <Filter size={18} />
            <span className="text-xs font-black uppercase tracking-widest">Filters</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="space-y-1">
              <Label className="text-[10px] font-bold uppercase text-slate-500 ml-1">Archive Start</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-10 w-40 finance-input" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-bold uppercase text-slate-500 ml-1">Archive End</Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-10 w-40 finance-input" />
            </div>
          </div>
        </div>

        <Button onClick={() => window.print()} className="h-11 px-6 rounded-xl bg-accent text-accent-foreground font-bold hover:scale-[1.02] transition-transform shadow-lg shadow-accent/20">
          <Printer className="mr-2 h-4 w-4" /> Print A4 Matrix
        </Button>
      </div>

      <Card className="border-none shadow-2xl overflow-hidden rounded-2xl">
        <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-6">
          <CardTitle className="text-sm font-black uppercase tracking-[0.2em] text-primary flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-accent animate-pulse" />
            Audit Ledger ({accounts.length} Active Records)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="finance-table-container border-none rounded-none">
            <table className="finance-table">
              <thead>
                <tr>
                  <th className="text-center w-16">S.No</th>
                  <th className="w-40">Account Identity</th>
                  <th>Member Name</th>
                  {dates.map(d => (
                    <th key={d} className="text-center font-bold text-primary">
                      {new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit' })}
                    </th>
                  ))}
                  <th className="text-right pr-8">Weekly Total</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={dates.length + 4} className="text-center py-20"><div className="animate-spin h-8 w-8 border-4 border-slate-200 border-t-accent rounded-full mx-auto" /><p className="mt-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Compiling Matrix Data...</p></td></tr>
                ) : accounts.length === 0 ? (
                  <tr><td colSpan={dates.length + 4} className="text-center py-20 text-muted-foreground font-medium italic">No financial telemetry found for this range.</td></tr>
                ) : accounts.map((acc, i) => {
                  const accPostings = postings.filter(p => p.accountNo === acc.accountNo);
                  const rowTotal = accPostings.reduce((s, p) => s + (p.amount || 0), 0);
                  return (
                    <motion.tr 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.01 }}
                      key={acc.id}
                      className="group"
                    >
                      <td className="text-center font-bold text-slate-300">{i + 1}</td>
                      <td className="font-bold text-slate-900 tracking-tighter uppercase">{acc.accountNo}</td>
                      <td>
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900 group-hover:text-accent transition-colors">{acc.name}</span>
                          <span className="text-[10px] text-slate-400 uppercase font-black tracking-tighter">{acc.village || 'N/A'}</span>
                        </div>
                      </td>
                      {dates.map(d => {
                        const dayPost = accPostings.filter(p => p.date === d);
                        const dayAmt = dayPost.reduce((s, p) => s + (p.amount || 0), 0);
                        return (
                          <td key={d} className="text-center">
                            {dayAmt > 0 ? (
                              <span className="px-2 py-1 rounded bg-accent/10 text-accent font-black text-xs">₹{dayAmt}</span>
                            ) : (
                              <span className="text-slate-200 text-xs">-</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="text-right pr-8">
                        <span className="text-sm font-black text-primary">₹{rowTotal.toLocaleString("en-IN")}</span>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default WeeklyLineA4;
