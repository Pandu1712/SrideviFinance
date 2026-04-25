import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, doc, getDoc, DocumentData, orderBy } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  User, 
  Smartphone, 
  Target, 
  TrendingUp, 
  Users, 
  Calendar, 
  ArrowLeft, 
  Search, 
  IndianRupee, 
  Clock,
  MapPin,
  ClipboardList,
  CheckCircle2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useLine } from "@/contexts/LineContext";
import { formatCurrency, formatDate } from "@/lib/utils";
import { toast } from "sonner";

const AgentAudit = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { selectedLineId } = useLine();
  const [agent, setAgent] = useState<DocumentData | null>(null);
  const [assignedCustomers, setAssignedCustomers] = useState<DocumentData[]>([]);
  const [postings, setPostings] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      setLoading(true);
      try {
        // 1. Fetch Agent Profile
        const agentDoc = await getDoc(doc(db, "users", id));
        if (agentDoc.exists()) {
          setAgent({ id: agentDoc.id, ...agentDoc.data() as any });
        }

        // 2. Fetch Assigned Customers (Strictly for the selected line)
        if (!selectedLineId) {
          setAssignedCustomers([]);
          setPostings([]);
          setLoading(false);
          return;
        }

        const custQ = query(collection(db, "accounts"), where("agentId", "==", id), where("lineId", "==", selectedLineId));
        const custSnap = await getDocs(custQ);
        setAssignedCustomers(custSnap.docs.map(d => ({ id: d.id, ...d.data() as any })));

        // 3. Fetch Recent Postings (Strictly for the selected line)
        const postQ = query(
          collection(db, "postings"), 
          where("agentId", "==", id),
          where("lineId", "==", selectedLineId)
        );
        const postSnap = await getDocs(postQ);
        const postList = postSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
        // Manual sort by date since compound index might not exist yet
        postList.sort((a: any, b: any) => (b.date || "").localeCompare(a.date || ""));
        setPostings(postList);

      } catch (err) {
        console.error("Agent Audit Fetch Error:", err);
        toast.error("Failed to sync agent intelligence");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  if (loading) return (
    <div className="h-screen flex flex-col items-center justify-center gap-4">
      <div className="h-12 w-12 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">Synchronizing Field Data...</p>
    </div>
  );

  if (!agent) return <div className="p-20 text-center">Agent Profile Not Found</div>;

  const totalCollected = postings.reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalPayableByClients = assignedCustomers.reduce((sum, c) => sum + (c.totalAmount || 0), 0);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50 p-6 rounded-3xl border border-slate-100 shadow-sm">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/manage-agents")} className="h-10 w-10 rounded-xl hover:bg-white shadow-sm border border-slate-100">
            <ArrowLeft size={18} />
          </Button>
          <div className="h-14 w-14 rounded-2xl bg-accent-gradient flex items-center justify-center shadow-lg transform rotate-3">
             <User size={28} className="text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tighter text-primary uppercase">{agent.name}</h1>
              <Badge className="bg-emerald-500 text-white border-none font-black text-[9px] uppercase tracking-widest px-2">ACTIVE DUTY</Badge>
            </div>
            <p className="text-muted-foreground font-medium text-xs flex items-center gap-2">
              <Smartphone size={12} className="text-slate-400" /> Authorized Field Force • {agent.email}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6 pr-4">
           <div className="text-right">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Deployment Date</p>
              <p className="text-sm font-black text-primary">{formatDate(agent.createdAt)}</p>
           </div>
           <div className="h-10 w-px bg-slate-200 hidden md:block" />
           <div className="text-right">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Enterprise ID</p>
              <p className="text-sm font-bold text-accent font-mono">{agent.uid.substring(0,8).toUpperCase()}</p>
           </div>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="glass-card border-none shadow-xl bg-primary text-white overflow-hidden relative">
           <div className="absolute top-0 right-0 p-4 opacity-10">
              <IndianRupee size={60} />
           </div>
           <CardContent className="p-6">
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">Total Recovered</p>
              <h2 className="text-3xl font-black mt-1">{formatCurrency(totalCollected)}</h2>
              <div className="flex items-center gap-2 mt-2">
                 <Badge className="bg-white/20 text-white border-none text-[8px] font-black uppercase">LIVE PERFORMANCE</Badge>
              </div>
           </CardContent>
        </Card>

        <Card className="glass-card border-none shadow-xl border-l-4 border-l-accent">
           <CardContent className="p-6">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Portfolio Strength</p>
              <h2 className="text-3xl font-black text-primary mt-1">{assignedCustomers.length} Customers</h2>
              <p className="text-[10px] font-bold text-accent mt-1 flex items-center gap-1">
                 <CheckCircle2 size={10} /> Verified Assignments
              </p>
           </CardContent>
        </Card>

        <Card className="glass-card border-none shadow-xl border-l-4 border-l-emerald-500">
           <CardContent className="p-6">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Operational History</p>
              <h2 className="text-3xl font-black text-emerald-600 mt-1">{postings.length} Visits</h2>
              <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase">Successful Collections</p>
           </CardContent>
        </Card>

        <Card className="glass-card border-none shadow-xl border-l-4 border-l-amber-500">
           <CardContent className="p-6">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Recovery Velocity</p>
              <h2 className="text-3xl font-black text-amber-600 mt-1">
                 {totalPayableByClients > 0 ? Math.round((totalCollected / totalPayableByClients) * 100) : 0}% 
              </h2>
              <div className="mt-2 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                 <div className="h-full bg-amber-500" style={{ width: `${(totalCollected / (totalPayableByClients || 1)) * 100}%` }} />
              </div>
           </CardContent>
        </Card>
      </div>

      {/* Main Intelligence Tabs */}
      <Tabs defaultValue="customers" className="space-y-6">
        <TabsList className="bg-slate-100/50 p-1.5 rounded-2xl h-14 w-fit border border-slate-200">
          <TabsTrigger value="customers" className="rounded-xl px-8 font-black uppercase tracking-widest text-[10px] data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-accent">
            <Users className="mr-2 h-3.5 w-3.5" /> Assigned Portfolio
          </TabsTrigger>
          <TabsTrigger value="history" className="rounded-xl px-8 font-black uppercase tracking-widest text-[10px] data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-accent">
            <Clock className="mr-2 h-3.5 w-3.5" /> Field Activity Log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="customers" className="space-y-4">
           <Card className="glass-card border-none shadow-2xl overflow-hidden">
              <CardHeader className="bg-slate-50 border-b border-slate-100 px-6 py-4">
                 <CardTitle className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
                    <Target size={14} className="text-accent" />
                    Target Personnel Registry
                 </CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                 <table className="finance-table w-full">
                    <thead>
                       <tr className="bg-slate-50/20">
                          <th className="p-4 text-[10px] uppercase font-black text-slate-400">Account No</th>
                          <th className="p-4 text-[10px] uppercase font-black text-slate-400 text-left">Customer Details</th>
                          <th className="p-4 text-[10px] uppercase font-black text-slate-400">Location</th>
                          <th className="p-4 text-[10px] uppercase font-black text-slate-400 text-right">Balance Due</th>
                          <th className="p-4 text-[10px] uppercase font-black text-slate-400 text-center">Progress</th>
                       </tr>
                    </thead>
                    <tbody>
                       {assignedCustomers.length === 0 ? (
                         <tr><td colSpan={5} className="text-center py-20 text-slate-400 italic">No customers assigned to this agent yet.</td></tr>
                       ) : assignedCustomers.map((c, i) => (
                         <tr key={c.id} className="group hover:bg-slate-50/50 transition-colors border-b border-slate-50 last:border-0" onClick={() => navigate(`/ledger?acc=${c.accountNo}`)}>
                            <td className="p-4 text-center">
                               <Badge className="bg-primary/5 text-primary border-none font-black text-[10px] group-hover:bg-accent group-hover:text-white transition-all">
                                  {c.accountNo}
                               </Badge>
                            </td>
                            <td className="p-4">
                               <div className="flex flex-col">
                                  <span className="font-black text-primary uppercase text-xs">{c.name}</span>
                                  <span className="text-[9px] font-bold text-slate-400">{c.phone || 'No Mobile'}</span>
                               </div>
                            </td>
                            <td className="p-4 text-center">
                               <div className="flex items-center justify-center gap-1.5 text-[10px] font-black text-slate-400 uppercase">
                                  <MapPin size={10} className="text-accent" /> {c.village || 'N/A'}
                               </div>
                            </td>
                            <td className="p-4 text-right">
                               <span className="font-black text-destructive text-sm">{formatCurrency(c.balance)}</span>
                            </td>
                            <td className="p-4">
                               <div className="flex flex-col items-center gap-1">
                                  <div className="h-1.5 w-24 bg-slate-100 rounded-full overflow-hidden">
                                     <div className="h-full bg-emerald-500" style={{ width: `${(c.paid/(c.totalAmount||1))*100}%` }} />
                                  </div>
                                  <span className="text-[9px] font-black text-emerald-600 uppercase tracking-tighter">
                                     {Math.round((c.paid/(c.totalAmount||1))*100)}% Complete
                                  </span>
                               </div>
                            </td>
                         </tr>
                       ))}
                    </tbody>
                 </table>
              </CardContent>
           </Card>
        </TabsContent>

        <TabsContent value="history">
           <Card className="glass-card border-none shadow-2xl overflow-hidden">
              <CardHeader className="bg-slate-50 border-b border-slate-100 px-6 py-4">
                 <CardTitle className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
                    <ClipboardList size={14} className="text-accent" />
                    Operational activity history
                 </CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                 <table className="finance-table w-full">
                    <thead>
                       <tr className="bg-slate-50/20">
                          <th className="p-4 text-[10px] uppercase font-black text-slate-400">Date Logged</th>
                          <th className="p-4 text-[10px] uppercase font-black text-slate-400 text-left">Member Reference</th>
                          <th className="p-4 text-[10px] uppercase font-black text-slate-400 text-right">Collection</th>
                          <th className="p-4 text-[10px] uppercase font-black text-slate-400 text-center">Status</th>
                          <th className="p-4 text-[10px] uppercase font-black text-slate-400 text-center">Mode</th>
                       </tr>
                    </thead>
                    <tbody>
                       {postings.length === 0 ? (
                         <tr><td colSpan={5} className="text-center py-20 text-slate-400 italic">No activity recorded for this agent.</td></tr>
                       ) : postings.map((p, i) => (
                         <tr key={p.id} className="group hover:bg-slate-50/50 transition-colors border-b border-slate-50 last:border-0">
                            <td className="p-4 text-center">
                               <span className="text-xs font-black text-slate-500">{formatDate(p.date)}</span>
                            </td>
                            <td className="p-4">
                               <div className="flex flex-col">
                                  <span className="font-black text-primary uppercase text-xs">{p.memberName}</span>
                                  <span className="text-[9px] font-bold text-slate-400">{p.accountNo}</span>
                               </div>
                            </td>
                            <td className="p-4 text-right">
                               <span className="font-black text-emerald-600">{formatCurrency(p.amount)}</span>
                            </td>
                            <td className="p-4 text-center">
                               <Badge className="bg-slate-100 text-slate-600 border-none font-black text-[9px] uppercase">
                                  {p.status}
                               </Badge>
                            </td>
                            <td className="p-4 text-center">
                               <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">{p.payMode}</span>
                            </td>
                         </tr>
                       ))}
                    </tbody>
                 </table>
              </CardContent>
           </Card>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
};

export default AgentAudit;
