import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { db, auth } from "@/lib/firebase";
import { collection, getDocs, query, where, deleteDoc, doc, setDoc, DocumentData } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Trash2, Plus, UserCog, Mail, Phone, Lock, User, ShieldCheck, ArrowRight, Activity, Smartphone, BadgeCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

import { initializeApp, getApps } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { firebaseConfig } from "@/lib/firebase";

const ManageAgents = () => {
  const { userData, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [agents, setAgents] = useState<DocumentData[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [loading, setLoading] = useState(false);

  const fetchAgents = async () => {
    if (!userData) return;
    try {
      const q = userData.role === 'super_admin' 
        ? query(collection(db, "users"), where("role", "==", "agent"))
        : query(collection(db, "users"), where("role", "==", "agent"), where("adminId", "==", userData.uid));
        
      const snap = await getDocs(q);
      const list: DocumentData[] = [];
      snap.forEach(d => list.push({ id: d.id, ...(d.data() as Record<string, any>) }));
      setAgents(list);
    } catch (err) {
      console.error("Error fetching agents:", err);
    }
  };

  useEffect(() => { fetchAgents(); }, [userData]);

  const handleCreate = async () => {
    if (!form.name || !form.email || !form.password) {
      toast.error("Complete credentials required for agent deployment");
      return;
    }
    setLoading(true);
    try {
      // Create a secondary app to avoid logging out the current admin
      const secondaryApp = getApps().find(a => a.name === "secondary") || initializeApp(firebaseConfig, "secondary");
      const secondaryAuth = getAuth(secondaryApp);
      
      const cred = await createUserWithEmailAndPassword(secondaryAuth, form.email, form.password);

      await setDoc(doc(db, "users", cred.user.uid), {
        uid: cred.user.uid,
        name: form.name,
        email: form.email,
        phone: form.phone,
        role: "agent",
        adminId: userData?.uid,
        createdAt: new Date().toISOString(),
      });

      toast.success(`Field agent ${form.name} successfully deployed`);
      setOpen(false);
      setForm({ name: "", email: "", phone: "", password: "" });
      fetchAgents();
    } catch (err: any) {
      toast.error(err.message || "Deployment failed");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Deactivate and remove this agent from field operations?")) return;
    try {
      await deleteDoc(doc(db, "users", id));
      toast.success("Agent access revoked");
      fetchAgents();
    } catch (err) {
      toast.error("Operation failed");
    }
  };

  if (authLoading) return <div className="h-screen flex items-center justify-center">Authenticating Personnel Access...</div>;

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="space-y-6"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-accent-gradient flex items-center justify-center shadow-xl border border-accent/20">
            <UserCog className="text-white h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-primary">Field Force Management</h1>
            <p className="text-muted-foreground font-medium">Provision and oversee active agents operating in the field.</p>
          </div>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-accent text-accent-foreground h-11 px-6 shadow-xl hover:bg-accent/90 font-bold border-none transition-all">
              <Plus className="mr-2 h-5 w-5" /> Deploy New Agent
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[440px] glass-card border-white/20 p-8 shadow-2xl">
            <DialogHeader className="mb-6 text-center">
              <div className="h-16 w-16 bg-accent/10 rounded-2xl flex items-center justify-center mb-4 mx-auto">
                <Smartphone size={32} className="text-accent" />
              </div>
              <DialogTitle className="text-2xl font-black text-primary text-center">Secure Provisioning</DialogTitle>
              <DialogDescription className="text-center text-slate-500 font-medium">Create enterprise credentials for new field workers.</DialogDescription>
            </DialogHeader>
            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-400 ml-1 uppercase tracking-widest">Agent Full Name</Label>
                <div className="relative group">
                   <User className="absolute left-3 top-3 h-4 w-4 text-slate-400 group-focus-within:text-accent transition-colors" />
                   <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="pl-9 h-11 finance-input" placeholder="e.g. Rahul Sharma" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-400 ml-1 uppercase tracking-widest">Email Access</Label>
                  <div className="relative group">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400 group-focus-within:text-accent transition-colors" />
                    <Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className="pl-9 h-11 finance-input text-xs" placeholder="agent@mail.com" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-400 ml-1 uppercase tracking-widest">Mobile PIN</Label>
                  <div className="relative group">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400 group-focus-within:text-accent transition-colors" />
                    <Input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} className="pl-9 h-11 finance-input text-xs" placeholder="••••••••" />
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-400 ml-1 uppercase tracking-widest">Phone Number</Label>
                <div className="relative group">
                  <Phone className="absolute left-3 top-3 h-4 w-4 text-slate-400 group-focus-within:text-accent transition-colors" />
                  <Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className="pl-9 h-11 finance-input" placeholder="+91 XXXXX XXXXX" />
                </div>
              </div>

              <div className="bg-amber-50 rounded-xl p-4 border border-amber-100 mt-4">
                <p className="text-[10px] text-amber-700 font-black uppercase tracking-widest flex items-center gap-2">
                  <Activity size={12} /> Force Exit Warning
                </p>
                <p className="text-[11px] text-amber-600 font-medium leading-relaxed mt-1">
                  Firebase security policies will terminate your current session upon new user creation. Be ready to log back in.
                </p>
              </div>

              <Button onClick={handleCreate} className="w-full h-12 bg-accent text-accent-foreground font-black text-lg hover:bg-slate-900 mt-2 shadow-xl border-none" disabled={loading}>
                {loading ? "Syncing with Vault..." : "Establish Credentials"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <AnimatePresence>
          {agents.length === 0 ? (
            <Card className="col-span-full border-dashed border-2 py-20 flex flex-col items-center justify-center bg-slate-50/50">
               <Smartphone className="h-12 w-12 text-slate-200 mb-4" />
               <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No Field Agents Assigned</p>
            </Card>
          ) : agents.map((agent, i) => (
            <motion.div
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.05 }}
              key={agent.id}
            >
              <Card className="glass-card border-none shadow-xl group hover:shadow-2xl hover:-translate-y-1 transition-all duration-300">
                <CardHeader className="flex flex-row items-center justify-between pb-2 bg-slate-50/50 rounded-t-xl border-b border-slate-100">
                  <div className="h-10 w-10 bg-accent text-accent-foreground rounded-lg flex items-center justify-center font-black group-hover:bg-slate-900 transition-all">
                    {agent.name?.charAt(0) || "A"}
                  </div>
                  <Badge className="bg-accent/10 text-accent border-none font-black text-[9px] uppercase tracking-widest">
                    FIELD FORCE
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
                  <div>
                    <h3 className="text-xl font-black text-primary truncate">{agent.name}</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">{agent.email}</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="space-y-0.5">
                      <p className="text-[10px] uppercase font-bold text-slate-400 tracking-tighter">Mobile</p>
                      <p className="text-xs font-bold text-slate-600 flex items-center gap-1"><Phone size={10} /> {agent.phone || '-'}</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-[10px] uppercase font-bold text-slate-400 tracking-tighter">Deployment</p>
                      <p className="text-xs font-bold text-slate-600">{formatDate(agent.createdAt)}</p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-accent">
                      <BadgeCheck size={14} className="text-emerald-500" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Active Duty</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => navigate(`/agent-audit/${agent.uid || agent.id}`)} className="h-8 w-8 p-0 text-slate-300 hover:text-accent hover:bg-accent/10" title="View Agent Audit">
                        <Activity size={16} />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(agent.id)} className="h-8 w-8 p-0 text-slate-300 hover:text-destructive hover:bg-destructive/10">
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default ManageAgents;
