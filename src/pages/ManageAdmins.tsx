import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, deleteDoc, doc, setDoc, DocumentData } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Trash2, Plus, ShieldCheck, Mail, Phone, Lock, User, ShieldAlert, ArrowRight, Activity, BadgeCheck, MapPin } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

import { initializeApp, getApps } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { firebaseConfig } from "@/lib/firebase";

const ManageAdmins = () => {
  const { userData, loading: authLoading } = useAuth();
  const [admins, setAdmins] = useState<DocumentData[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [loading, setLoading] = useState(false);

  const fetchAdmins = async () => {
    if (!userData) return;
    try {
      const snap = await getDocs(query(collection(db, "users"), where("role", "==", "admin")));
      const list: DocumentData[] = [];
      snap.forEach(d => list.push({ id: d.id, ...(d.data() as Record<string, any>) }));
      setAdmins(list);
    } catch (err) {
      console.error("Error fetching admins:", err);
    }
  };

  useEffect(() => {
    if (userData?.role === "super_admin") {
      fetchAdmins();
    }
  }, [userData]);

  const handleCreate = async () => {
    if (!form.name || !form.email || !form.password) {
      toast.error("Elite credentials required for admin provisioning");
      return;
    }
    setLoading(true);
    try {
      const secondaryApp = getApps().find(a => a.name === "secondaryAdmin") || initializeApp(firebaseConfig, "secondaryAdmin");
      const secondaryAuth = getAuth(secondaryApp);
      
      const cred = await createUserWithEmailAndPassword(secondaryAuth, form.email, form.password);

      await setDoc(doc(db, "users", cred.user.uid), {
        uid: cred.user.uid,
        name: form.name,
        email: form.email,
        phone: form.phone,
        role: "admin",
        createdAt: new Date().toISOString(),
      });

      toast.success(`Administrative access successfully provisioned for ${form.name}`);
      setOpen(false);
      setForm({ name: "", email: "", phone: "", password: "" });
      fetchAdmins();
    } catch (err: any) {
      toast.error(err.message || "Failed to provision administrator");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Permanently revoke administrative access?")) return;
    try {
      await deleteDoc(doc(db, "users", id));
      toast.success("Administrator access revoked");
      fetchAdmins();
    } catch (err) {
      toast.error("Operation failed");
    }
  };

  if (authLoading) return <div className="h-screen flex items-center justify-center">Loading Access Control...</div>;

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="space-y-6"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center shadow-xl border border-primary/20">
            <ShieldAlert className="text-white h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-primary">Admin Control Center</h1>
            <p className="text-muted-foreground font-medium">Manage top-level administrators and system access protocols.</p>
          </div>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary text-white h-11 px-6 shadow-xl hover:bg-slate-900 font-bold border-none transition-all">
              <Plus className="mr-2 h-5 w-5" /> Provision Administrator
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[440px] glass-card border-white/20 p-8 shadow-2xl">
            <DialogHeader className="mb-6 text-center">
              <div className="h-16 w-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4 mx-auto">
                <ShieldCheck size={32} className="text-primary" />
              </div>
              <DialogTitle className="text-2xl font-black text-primary">Provision Access</DialogTitle>
              <DialogDescription className="text-slate-500 font-medium">Create enterprise-grade credentials with full admin privileges.</DialogDescription>
            </DialogHeader>
            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Administrator Profile</Label>
                <div className="relative group">
                   <User className="absolute left-3 top-3 h-4 w-4 text-slate-400 group-focus-within:text-primary transition-colors" />
                   <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="pl-9 h-11 finance-input" placeholder="Display Name" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Email ID</Label>
                  <div className="relative group">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400 group-focus-within:text-primary transition-colors" />
                    <Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className="pl-9 h-11 finance-input text-xs" placeholder="auth@admin.com" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Secure PIN</Label>
                  <div className="relative group">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400 group-focus-within:text-primary transition-colors" />
                    <Input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} className="pl-9 h-11 finance-input text-xs" placeholder="••••••••" />
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Active Contact</Label>
                <div className="relative group">
                  <Phone className="absolute left-3 top-3 h-4 w-4 text-slate-400 group-focus-within:text-primary transition-colors" />
                  <Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className="pl-9 h-11 finance-input" placeholder="+91 XXXXX XXXXX" />
                </div>
              </div>
              
              <div className="bg-amber-50 rounded-xl p-4 border border-amber-100 mt-4">
                <p className="text-[10px] text-amber-700 font-black uppercase tracking-widest flex items-center gap-2">
                  <ShieldAlert size={12} /> System Security Protocol
                </p>
                <p className="text-[11px] text-amber-600 font-medium leading-relaxed mt-1">
                  Creation will log you out of your current session per security rules. Please re-enter your credentials afterward.
                </p>
              </div>

              <Button onClick={handleCreate} className="w-full h-12 bg-primary text-white font-black text-lg hover:bg-slate-900 mt-2 shadow-xl" disabled={loading}>
                {loading ? "Initializing..." : "Register Administrator"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <AnimatePresence>
          {admins.length === 0 ? (
            <Card className="col-span-full border-dashed border-2 py-20 flex flex-col items-center justify-center bg-slate-50/50">
               <ShieldAlert className="h-12 w-12 text-slate-200 mb-4" />
               <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No Secondary Admins Found</p>
            </Card>
          ) : admins.map((admin, i) => (
            <motion.div
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              key={admin.id}
            >
              <Card className="glass-card border-none shadow-xl group hover:shadow-2xl hover:-translate-y-1 transition-all duration-300">
                <CardHeader className="flex flex-row items-center justify-between pb-2 bg-slate-50/50 rounded-t-xl border-b border-slate-100">
                  <div className="h-10 w-10 bg-primary text-white rounded-lg flex items-center justify-center font-black group-hover:bg-slate-900 transition-all">
                    {admin.name?.charAt(0) || "A"}
                  </div>
                  <Badge className="bg-primary/10 text-primary border-none font-black text-[9px] uppercase tracking-widest">
                    SYSTEM ADMIN
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
                  <div>
                    <h3 className="text-xl font-black text-primary truncate">{admin.name}</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">{admin.email}</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="space-y-0.5">
                      <p className="text-[10px] uppercase font-bold text-slate-400 tracking-tighter">Joined</p>
                      <p className="text-xs font-bold text-slate-600 truncate">{formatDate(admin.createdAt)}</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-[10px] uppercase font-bold text-slate-400 tracking-tighter">Last Login</p>
                      <p className="text-xs font-bold text-emerald-600 truncate">
                        {admin.lastLogin ? formatDate(admin.lastLogin) : 'Never'}
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-primary">
                      <BadgeCheck size={14} className="text-emerald-500" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Role Verified</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {admin.phone && (
                        <a 
                          href={`tel:${admin.phone}`} 
                          className="h-8 w-8 flex items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white transition-all shadow-sm"
                          title="Call Admin"
                        >
                          <Phone size={14} />
                        </a>
                      )}
                      {(admin.location || admin.address) && (
                        <button 
                          onClick={() => {
                            const query = admin.location || admin.address;
                            window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, '_blank');
                          }}
                          className="h-8 w-8 flex items-center justify-center rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-500 hover:text-white transition-all shadow-sm"
                          title="Get Directions"
                        >
                          <MapPin size={14} />
                        </button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(admin.id)} className="h-8 w-8 p-0 text-slate-300 hover:text-destructive hover:bg-destructive/10">
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

export default ManageAdmins;
