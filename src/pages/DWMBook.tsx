import { useAuth, UserRole } from "@/contexts/AuthContext";
import { useState, useEffect, useCallback } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, DocumentData, orderBy, limit } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BookOpen, IndianRupee, Printer, Filter, Activity, CalendarIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const DWMBook = () => {
  const { userData } = useAuth();
  const [postings, setPostings] = useState<DocumentData[]>([]);
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("daily");

  const fetchPostings = useCallback(async (period: string) => {
    if (!userData?.uid) return;
    
    setLoading(true);
    try {
      const baseDate = new Date(dateFilter);
      let startDateStr = dateFilter;

      if (period === "weekly") {
        const d = new Date(baseDate);
        d.setDate(d.getDate() - 7);
        startDateStr = d.toISOString().split("T")[0];
      } else if (period === "monthly") {
        const d = new Date(baseDate);
        d.setDate(1);
        startDateStr = d.toISOString().split("T")[0];
      }

      let q;
      const postingsRef = collection(db, "postings");

      if (userData.role === "super_admin") {
        q = query(
          postingsRef, 
          where("date", ">=", startDateStr), 
          where("date", "<=", dateFilter), 
          orderBy("date", "desc"),
          limit(500)
        );
      } else if (userData.role === "admin") {
        q = query(
          postingsRef, 
          where("adminId", "==", userData.uid),
          where("date", ">=", startDateStr), 
          where("date", "<=", dateFilter), 
          orderBy("date", "desc"),
          limit(500)
        );
      } else {
        q = query(
          postingsRef, 
          where("agentId", "==", userData.uid),
          where("date", ">=", startDateStr), 
          where("date", "<=", dateFilter), 
          orderBy("date", "desc"),
          limit(500)
        );
      }

      const snap = await getDocs(q);
      const list: DocumentData[] = snap.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as any)
      }));
      
      setPostings(list);
    } catch (err) {
      console.error("DWM Fetch Error:", err);
      setPostings([]);
    } finally {
      setLoading(false);
    }
  }, [userData, dateFilter]);

  useEffect(() => {
    fetchPostings(activeTab);
  }, [activeTab, fetchPostings]);

  const totalAmount = postings.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const renderTableContent = () => (
    <div className="space-y-6 animate-fade-in-up">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="glass-card border-none shadow-xl">
          <CardContent className="p-6 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Total Entries</p>
              <h3 className="text-2xl font-black text-slate-900">{postings.length} Records</h3>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-primary/5 flex items-center justify-center border border-primary/5">
              <Activity size={20} className="text-primary" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="glass-card border-none shadow-xl border-b-4 border-b-accent">
          <CardContent className="p-6 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Total Collection</p>
              <h3 className="text-2xl font-black text-accent">{formatCurrency(totalAmount)}</h3>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-accent/10 flex items-center justify-center border border-accent/10">
              <IndianRupee size={20} className="text-accent" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="finance-table-container">
        <table className="finance-table">
          <thead>
            <tr>
              <th className="text-center w-32">Date Ref</th>
              <th>Member Identity</th>
              <th className="text-center">Account No</th>
              <th className="text-right">Collection</th>
              <th className="text-center">Verification</th>
              <th className="text-center">Mode</th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence mode="popLayout">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-20">
                    <div className="animate-spin h-8 w-8 border-4 border-slate-200 border-t-accent rounded-full mx-auto" />
                    <p className="mt-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Accessing Archives...</p>
                  </td>
                </tr>
              ) : postings.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-20 text-slate-400 font-medium italic">
                    No financial traces found for this timeframe.
                  </td>
                </tr>
              ) : (
                postings.map((p, i) => (
                  <motion.tr 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.01 }}
                    key={p.id}
                  >
                    <td className="text-center">
                      <Badge variant="outline" className="font-bold text-[10px] px-3 py-1 bg-slate-50 border-slate-200">
                        {p.date}
                      </Badge>
                    </td>
                    <td>
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-900">{p.memberName || 'Unknown Member'}</span>
                        <span className="text-[10px] text-slate-400 font-medium uppercase tracking-tighter">Verified Entry</span>
                      </div>
                    </td>
                    <td className="text-center font-black text-xs text-primary tracking-tighter uppercase">{p.accountNo}</td>
                    <td className="text-right font-black text-slate-900">{formatCurrency(p.amount)}</td>
                    <td className="text-center">
                      <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border-none font-bold text-[9px] uppercase tracking-widest px-3 py-1">
                        {p.status || 'Success'}
                      </Badge>
                    </td>
                    <td className="text-center">
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{p.payMode || 'CASH'}</span>
                    </td>
                  </motion.tr>
                ))
              )}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 p-6 bg-white rounded-3xl border border-slate-100 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-primary flex items-center justify-center shadow-xl border border-white/10 shrink-0">
            <BookOpen className="text-white h-7 w-7" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-primary">Financial Journal</h1>
            <p className="text-muted-foreground font-medium text-sm">D/W/M Unified Collection Matrix</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="space-y-1.5">
            <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Archive Baseline</Label>
            <div className="relative">
              <CalendarIcon className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
              <Input 
                type="date" 
                value={dateFilter} 
                onChange={e => setDateFilter(e.target.value)} 
                className="pl-10 h-11 finance-input w-48 shadow-sm" 
              />
            </div>
          </div>
          <Button 
            variant="outline" 
            onClick={() => window.print()}
            className="mt-5 h-11 px-5 bg-white border-2 border-slate-100 text-slate-500 hover:text-primary hover:border-primary/20 transition-all rounded-xl shadow-sm"
          >
             <Printer size={18} />
          </Button>
        </div>
      </div>

      <Tabs defaultValue="daily" value={activeTab} onValueChange={setActiveTab} className="space-y-8">
        <TabsList className="bg-slate-100/50 p-1.5 rounded-2xl h-14 inline-flex shadow-inner border border-slate-200/50">
          <TabsTrigger value="daily" className="px-10 rounded-xl font-black uppercase text-[10px] tracking-[0.2em] data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-xl transition-all h-full">Daily Audit</TabsTrigger>
          <TabsTrigger value="weekly" className="px-10 rounded-xl font-black uppercase text-[10px] tracking-[0.2em] data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-xl transition-all h-full">Weekly Matrix</TabsTrigger>
          <TabsTrigger value="monthly" className="px-10 rounded-xl font-black uppercase text-[10px] tracking-[0.2em] data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-xl transition-all h-full">Monthly Cycle</TabsTrigger>
        </TabsList>
        
        <TabsContent value="daily" className="outline-none">{renderTableContent()}</TabsContent>
        <TabsContent value="weekly" className="outline-none">{renderTableContent()}</TabsContent>
        <TabsContent value="monthly" className="outline-none">{renderTableContent()}</TabsContent>
      </Tabs>
    </motion.div>
  );
};

export default DWMBook;
