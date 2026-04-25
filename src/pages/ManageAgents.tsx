import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { db, auth } from "@/lib/firebase";
import { collection, getDocs, query, where, deleteDoc, doc, setDoc, updateDoc, DocumentData } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Trash2, Plus, UserCog, Mail, Phone, Lock, User, ShieldCheck, ArrowRight, Activity, Smartphone, BadgeCheck, MapPin, Edit2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useLine } from "@/contexts/LineContext";
import { Checkbox } from "@/components/ui/checkbox";

import { initializeApp, getApps } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { firebaseConfig } from "@/lib/firebase";

const ManageAgents = () => {
  const { userData, loading: authLoading } = useAuth();
  const { lines } = useLine();
  const navigate = useNavigate();
  const [agents, setAgents] = useState<DocumentData[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", lineIds: [] as string[] });
  const [loading, setLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<DocumentData | null>(null);
  const [editForm, setEditForm] = useState({ name: "", phone: "", lineIds: [] as string[] });
  const [updating, setUpdating] = useState(false);

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

  const handleEditClick = (agent: DocumentData) => {
    setEditingAgent(agent);
    setEditForm({ 
      name: agent.name || "", 
      phone: agent.phone || "", 
      lineIds: agent.lineIds || (agent.lineId ? [agent.lineId] : []) 
    });
    setEditOpen(true);
  };

  const handleUpdate = async () => {
    if (!editForm.name) {
      toast.error("Agent name is required");
      return;
    }
    setUpdating(true);
    try {
      if (!editingAgent?.id) throw new Error("Agent ID is missing");
      await updateDoc(doc(db, "users", editingAgent.id), {
        name: editForm.name,
        phone: editForm.phone,
        lineIds: editForm.lineIds,
      });
      toast.success("Agent profile updated");
      setEditOpen(false);
      fetchAgents();
    } catch (err) {
      toast.error("Update failed");
    } finally {
      setUpdating(false);
    }
  };

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
        lineIds: form.lineIds,
        adminId: userData?.uid,
        createdAt: new Date().toISOString(),
      });

      toast.success(`Field agent ${form.name} successfully deployed`);
      setOpen(false);
      setForm({ name: "", email: "", phone: "", password: "", lineIds: [] });
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

              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-400 ml-1 uppercase tracking-widest">Assign Operational Lines</Label>
                <div className="grid grid-cols-2 gap-2 border border-slate-200 rounded-xl p-3 bg-slate-50/50 max-h-40 overflow-y-auto">
                  {lines.map((line) => (
                    <div key={line.id} className="flex items-center space-x-2">
                      <Checkbox 
                        id={`create-${line.id}`} 
                        checked={form.lineIds.includes(line.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setForm(p => ({ ...p, lineIds: [...p.lineIds, line.id] }));
                          } else {
                            setForm(p => ({ ...p, lineIds: p.lineIds.filter(id => id !== line.id) }));
                          }
                        }}
                      />
                      <label htmlFor={`create-${line.id}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer">
                        {line.name}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-amber-50 rounded-xl p-4 border border-amber-100 mt-4">
                <p className="text-[10px] text-amber-700 font-black uppercase tracking-widest flex items-center gap-2">
                  <BadgeCheck size={12} /> Logistic Authority
                </p>
                <p className="text-[11px] text-amber-600 font-medium leading-relaxed mt-1">
                  Creation will log you out. This agent will only have access to the selected operational line.
                </p>
              </div>

              <Button onClick={handleCreate} className="w-full h-12 bg-accent text-accent-foreground font-black text-lg hover:bg-slate-900 mt-2 shadow-xl border-none" disabled={loading}>
                {loading ? "Syncing with Vault..." : "Establish Credentials"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="sm:max-w-[440px] glass-card border-white/20 p-8 shadow-2xl">
            <DialogHeader className="mb-6 text-center">
              <div className="h-16 w-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mb-4 mx-auto">
                <Edit2 size={32} className="text-blue-500" />
              </div>
              <DialogTitle className="text-2xl font-black text-primary text-center">Modify Personnel</DialogTitle>
              <DialogDescription className="text-center text-slate-500 font-medium">Update the operational parameters for this agent.</DialogDescription>
            </DialogHeader>
            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-400 ml-1 uppercase tracking-widest">Agent Full Name</Label>
                <div className="relative group">
                   <User className="absolute left-3 top-3 h-4 w-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                   <Input value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} className="pl-9 h-11 finance-input" placeholder="e.g. Rahul Sharma" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-400 ml-1 uppercase tracking-widest">Phone Number</Label>
                <div className="relative group">
                  <Phone className="absolute left-3 top-3 h-4 w-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                  <Input value={editForm.phone} onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))} className="pl-9 h-11 finance-input" placeholder="+91 XXXXX XXXXX" />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-400 ml-1 uppercase tracking-widest">Assign Operational Lines</Label>
                <div className="grid grid-cols-2 gap-2 border border-blue-200 rounded-xl p-3 bg-blue-50/30 max-h-40 overflow-y-auto">
                  {lines.map((line) => (
                    <div key={line.id} className="flex items-center space-x-2">
                      <Checkbox 
                        id={`edit-${line.id}`} 
                        checked={editForm.lineIds.includes(line.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setEditForm(p => ({ ...p, lineIds: [...p.lineIds, line.id] }));
                          } else {
                            setEditForm(p => ({ ...p, lineIds: p.lineIds.filter(id => id !== line.id) }));
                          }
                        }}
                      />
                      <label htmlFor={`edit-${line.id}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer">
                        {line.name}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <Button onClick={handleUpdate} className="w-full h-12 bg-blue-600 text-white font-black text-lg hover:bg-blue-700 mt-2 shadow-xl border-none" disabled={updating}>
                {updating ? "Committing Changes..." : "Update Profile"}
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
                    <div className="space-y-0.5 col-span-2 p-3 bg-slate-50 rounded-lg border border-slate-100 flex items-center justify-between">
                      <div>
                         <p className="text-[10px] uppercase font-bold text-slate-400 tracking-tighter">Assigned Territories</p>
                         <p className="text-xs font-black text-primary">
                          {(agent.lineIds && agent.lineIds.length > 0) 
                              ? agent.lineIds.map((id: string) => lines.find(l => l.id === id)?.name).filter(Boolean).join(", ") 
                              : (lines.find(l => l.id === agent.lineId)?.name || "Unassigned Territory")}
                         </p>
                      </div>
                      <MapPin size={16} className="text-accent/40" />
                    </div>

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
                      <Button variant="ghost" size="sm" onClick={() => handleEditClick(agent)} className="h-8 w-8 p-0 text-slate-300 hover:text-blue-500 hover:bg-blue-500/10" title="Edit Agent Profile">
                        <Edit2 size={16} />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(agent.id)} className="h-8 w-8 p-0 text-slate-300 hover:text-destructive hover:bg-destructive/10" title="Revoke Access">
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
