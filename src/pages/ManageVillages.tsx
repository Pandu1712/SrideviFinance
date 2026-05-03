import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, addDoc, deleteDoc, doc, DocumentData, updateDoc, query, where } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { useLine } from "@/contexts/LineContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { MapPin, Plus, Trash2, ShieldAlert, Edit, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
const ManageVillages = () => {
  const { userData, loading: authLoading } = useAuth();
  const { selectedLineId } = useLine();
  const [villages, setVillages] = useState<DocumentData[]>([]);
  const [villageData, setVillageData] = useState({
    name: "",
    mondalam: "",
    district: "",
    pincode: "",
    postOffice: ""
  });
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isRenamingLine, setIsRenamingLine] = useState(false);
  const [newLineName, setNewLineName] = useState("");
  const { lines } = useLine();

  const fetchVillages = async () => {
    if (!selectedLineId) return;
    try {
      const q = query(collection(db, "villages"), where("lineId", "==", selectedLineId));
      const snap = await getDocs(q);
      const list: DocumentData[] = [];
      snap.forEach(d => list.push({ id: d.id, ...(d.data() as Record<string, any>) }));
      // Sort alphabetically
      list.sort((a, b) => a.name.localeCompare(b.name));
      setVillages(list);
    } catch (err) {
      console.error("Error fetching villages:", err);
      toast.error("Failed to load villages");
    }
  };

  useEffect(() => {
    if ((userData?.role === "super_admin" || userData?.role === "admin") && selectedLineId) {
      fetchVillages();
    } else {
      setVillages([]);
    }
  }, [userData, selectedLineId]);

  const handleSave = async () => {
    if (!villageData.name.trim()) {
      toast.error("Please enter a village name");
      return;
    }
    setLoading(true);
    try {
      const payload = {
        ...villageData,
        name: villageData.name.trim(),
        mondalam: villageData.mondalam.trim(),
        district: villageData.district.trim(),
        pincode: villageData.pincode.trim(),
        postOffice: villageData.postOffice.trim(),
        lineId: selectedLineId,
        updatedAt: new Date().toISOString(),
      };

      if (editingId) {
        await updateDoc(doc(db, "villages", editingId), payload);
        toast.success(`Village "${villageData.name}" updated successfully`);
      } else {
        // Check for duplicates only on creation
        const exists = villages.some(v => 
          v.name.toLowerCase() === villageData.name.trim().toLowerCase() && 
          v.mondalam?.toLowerCase() === villageData.mondalam.trim().toLowerCase()
        );
        if (exists) {
          toast.error("Village already exists in this mondalam");
          setLoading(false);
          return;
        }
        await addDoc(collection(db, "villages"), {
          ...payload,
          createdAt: new Date().toISOString(),
        });
        toast.success(`Village "${villageData.name}" added successfully`);
      }

      setVillageData({
        name: "",
        mondalam: "",
        district: "",
        pincode: "",
        postOffice: ""
      });
      setEditingId(null);
      fetchVillages();
    } catch (err: any) {
      toast.error(err.message || "Failed to save village");
    } finally {
      setLoading(false);
    }
  };

  const handleEditStart = (village: DocumentData) => {
    setEditingId(village.id);
    setVillageData({
      name: village.name || "",
      mondalam: village.mondalam || "",
      district: village.district || "",
      pincode: village.pincode || "",
      postOffice: village.postOffice || ""
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setVillageData({
      name: "",
      mondalam: "",
      district: "",
      pincode: "",
      postOffice: ""
    });
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Permanently remove village "${name}"?`)) return;
    try {
      await deleteDoc(doc(db, "villages", id));
      toast.success("Village removed");
      if (editingId === id) handleCancelEdit();
      fetchVillages();
    } catch (err) {
      toast.error("Operation failed");
    }
  };

  const handleLineRename = async () => {
    if (!selectedLineId || !newLineName.trim()) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, "lines", selectedLineId), {
        name: newLineName.trim(),
        updatedAt: new Date().toISOString()
      });
      toast.success("Line renamed successfully");
      setIsRenamingLine(false);
      setNewLineName("");
      // Refreshing through context happens automatically via onSnapshot
    } catch (err) {
      toast.error("Failed to rename line");
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) return <div className="h-screen flex items-center justify-center">Loading Data...</div>;

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="space-y-6"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-accent flex items-center justify-center shadow-xl border border-accent/20">
            <MapPin className="text-white h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-[#0F172A]">Manage Villages</h1>
            <p className="text-muted-foreground font-medium">Configure central village dropdown for account creation.</p>
          </div>
        </div>

        {selectedLineId && (userData?.role === "super_admin" || userData?.role === "admin") && (
          <Card className="glass-card border-none shadow-lg p-4 flex items-center gap-4 bg-white/50 backdrop-blur-sm">
             <div className="flex-1">
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest leading-none mb-1">Active Line</p>
                <h3 className="text-lg font-black text-slate-900 leading-none">
                  {lines.find(l => l.id === selectedLineId)?.name || "Unknown Line"}
                </h3>
             </div>
             
             {isRenamingLine ? (
                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4">
                   <Input 
                     value={newLineName}
                     onChange={e => setNewLineName(e.target.value)}
                     placeholder="New Line Name"
                     className="h-9 w-48 finance-input text-xs font-bold"
                   />
                   <Button onClick={handleLineRename} className="h-9 px-4 bg-emerald-500 text-white font-black text-[10px] uppercase">Save</Button>
                   <Button variant="ghost" onClick={() => setIsRenamingLine(false)} className="h-9 text-slate-400">Cancel</Button>
                </div>
             ) : (
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setNewLineName(lines.find(l => l.id === selectedLineId)?.name || "");
                    setIsRenamingLine(true);
                  }}
                  className="h-10 border-slate-200 font-black text-[10px] uppercase tracking-widest px-4 group"
                >
                  <Edit size={14} className="mr-2 text-slate-400 group-hover:text-accent" />
                  Rename Line
                </Button>
             )}
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1">
          <Card className={cn("glass-card shadow-2xl border-none h-fit sticky top-6 transition-all", editingId ? "ring-2 ring-accent" : "")}>
            <CardHeader className={cn("rounded-t-xl border-b transition-colors", editingId ? "bg-accent/10 border-accent/20" : "bg-slate-50/50 border-primary/10")}>
              <CardTitle className="text-xl font-black text-primary flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {editingId ? <Edit size={20} className="text-accent" /> : <Plus size={20} className="text-accent" />}
                  {editingId ? "Edit Village" : "Add New Village"}
                </div>
                {editingId && (
                  <Button variant="ghost" size="icon" onClick={handleCancelEdit} className="h-8 w-8 text-slate-400 hover:text-slate-600">
                    <X size={16} />
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Village / Area Name *</Label>
                <Input 
                  value={villageData.name} 
                  onChange={e => setVillageData(prev => ({ ...prev, name: e.target.value }))} 
                  className="h-11 finance-input text-sm font-bold uppercase" 
                  placeholder="Enter village name..." 
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold">Mondalam</Label>
                <Input 
                  value={villageData.mondalam} 
                  onChange={e => setVillageData(prev => ({ ...prev, mondalam: e.target.value }))} 
                  className="h-11 finance-input text-sm uppercase" 
                  placeholder="Enter mondalam..." 
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold">District</Label>
                <Input 
                  value={villageData.district} 
                  onChange={e => setVillageData(prev => ({ ...prev, district: e.target.value }))} 
                  className="h-11 finance-input text-sm uppercase" 
                  placeholder="Enter district..." 
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Pin Code</Label>
                  <Input 
                    value={villageData.pincode} 
                    onChange={e => setVillageData(prev => ({ ...prev, pincode: e.target.value }))} 
                    className="h-11 finance-input text-sm" 
                    placeholder="6-digit PIN" 
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Post Office</Label>
                  <Input 
                    value={villageData.postOffice} 
                    onChange={e => setVillageData(prev => ({ ...prev, postOffice: e.target.value }))} 
                    className="h-11 finance-input text-sm uppercase" 
                    placeholder="Post branch" 
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                {editingId && (
                  <Button 
                    variant="outline"
                    onClick={handleCancelEdit}
                    className="flex-1 h-12 font-bold border-slate-200"
                  >
                    Cancel
                  </Button>
                )}
                <Button 
                  onClick={handleSave} 
                  className={cn("flex-[2] h-12 text-white font-bold tracking-wide shadow-xl transition-all", editingId ? "bg-accent hover:bg-amber-600" : "bg-primary hover:bg-slate-900")}
                  disabled={loading}
                >
                  {loading ? "Saving..." : editingId ? "Update Details" : "Add to Database"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-2">
          <Card className="glass-card shadow-xl border-none">
            <CardHeader className="bg-slate-50/50 rounded-t-xl border-b border-primary/10 flex flex-row items-center justify-between py-4">
              <CardTitle className="text-lg font-black text-primary">Registered Villages Grid</CardTitle>
              <div className="bg-primary/10 text-primary uppercase text-[10px] font-black tracking-widest px-3 py-1 rounded-full">
                {villages.length} Total
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[700px] overflow-y-auto custom-scrollbar">
                {villages.length === 0 ? (
                  <div className="p-12 text-center text-slate-500 flex flex-col items-center">
                    <ShieldAlert size={40} className="mb-4 text-slate-300" />
                    <p className="font-bold">No villages registered yet.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-primary/5">
                    {villages.map((village, idx) => (
                      <motion.div 
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        key={village.id} 
                        className={cn("flex items-center justify-between p-4 transition-colors group", editingId === village.id ? "bg-accent/5" : "bg-white hover:bg-slate-50")}
                      >
                        <div className="flex items-center gap-4">
                          <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center shadow-sm transition-colors", editingId === village.id ? "bg-accent text-white" : "bg-accent/10 text-accent")}>
                            <MapPin size={18} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-slate-900 text-sm uppercase tracking-wide">{village.name}</p>
                              {village.pincode && (
                                <Badge variant="outline" className="text-[9px] font-black h-4 px-1">{village.pincode}</Badge>
                              )}
                            </div>
                            <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mt-1">
                              {village.mondalam && `${village.mondalam}, `}{village.district && `${village.district} | `} 
                              Added: {formatDate(village.createdAt)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost" 
                            size="icon"
                            onClick={() => handleEditStart(village)} 
                            className={cn("transition-opacity text-slate-400 hover:text-accent hover:bg-accent/10", editingId === village.id ? "opacity-100 text-accent" : "opacity-0 group-hover:opacity-100")}
                          >
                            <Edit size={16} />
                          </Button>
                          <Button
                            variant="ghost" 
                            size="icon"
                            onClick={() => handleDelete(village.id, village.name)} 
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 size={16} />
                          </Button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  );
};

export default ManageVillages;
