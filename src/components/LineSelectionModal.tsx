import { useState } from "react";
import { useLine } from "@/contexts/LineContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { db } from "@/lib/firebase";
import { collection, addDoc } from "firebase/firestore";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { IndianRupee, MapPin, Plus, LayoutDashboard, Database } from "lucide-react";

const LineSelectionModal = () => {
  const { lines, setSelectedLineId, selectedLineId } = useLine();
  const [newLineName, setNewLineName] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const handleCreateLine = async () => {
    if (!newLineName.trim()) return;
    try {
      await addDoc(collection(db, "lines"), {
        name: newLineName,
        createdAt: new Date().toISOString(),
      });
      toast.success("New Line created!");
      setNewLineName("");
      setShowCreate(false);
    } catch {
      toast.error("Failed to create line");
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[#0F172A] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-accent/10 to-transparent" />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative z-10 w-full max-w-2xl bg-white rounded-[40px] shadow-2xl overflow-hidden border border-white/20"
      >
        <div className="bg-[#0F172A] p-10 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-accent/20 blur-[80px] rounded-full -mr-32 -mt-32" />
          <div className="flex items-center gap-4 relative z-10 mb-6">
            <div className="h-14 w-14 rounded-2xl bg-accent flex items-center justify-center shadow-lg shadow-accent/30">
              <Database className="text-white h-7 w-7" />
            </div>
            <div>
              <h2 className="text-3xl font-black tracking-tight leading-none">Choose Operative Line</h2>
              <p className="text-slate-400 text-sm mt-2 font-medium">Select a service area to begin operations</p>
            </div>
          </div>
        </div>

        <div className="p-10 bg-[#F8FAFC]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <button
              onClick={() => setSelectedLineId(null)}
              className="group p-6 rounded-3xl border-2 border-slate-200 bg-white hover:border-accent hover:shadow-xl transition-all text-left flex flex-col gap-4 relative overflow-hidden"
            >
              <div className="h-10 w-10 rounded-xl bg-slate-100 group-hover:bg-accent/10 flex items-center justify-center text-slate-500 group-hover:text-accent transition-colors">
                <LayoutDashboard size={20} />
              </div>
              <div>
                <h3 className="font-black text-slate-900 leading-tight">Full Dashboard</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Mixed Data View</p>
              </div>
            </button>

            {lines.map((line) => (
              <button
                key={line.id}
                onClick={() => setSelectedLineId(line.id)}
                className="group p-6 rounded-3xl border-2 border-slate-200 bg-white hover:border-accent hover:shadow-xl transition-all text-left flex flex-col gap-4"
              >
                <div className="h-10 w-10 rounded-xl bg-slate-100 group-hover:bg-accent/10 flex items-center justify-center text-slate-500 group-hover:text-accent transition-colors">
                  <MapPin size={20} />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 leading-tight">{line.name}</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Specific Territory</p>
                </div>
              </button>
            ))}

            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center justify-center gap-2 p-6 rounded-3xl border-2 border-dashed border-slate-300 hover:border-slate-400 hover:bg-slate-50 transition-all text-slate-500 font-bold text-sm"
            >
              <Plus size={18} />
              Create New Line
            </button>
          </div>

          {showCreate && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="bg-white p-6 rounded-3xl border border-slate-200 shadow-lg"
            >
              <h4 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-4">Define New Logistics Line</h4>
              <div className="flex gap-2">
                <Input 
                  value={newLineName} 
                  onChange={(e) => setNewLineName(e.target.value)} 
                  placeholder="e.g. Line 01 (South Area)"
                  className="rounded-xl h-12 bg-slate-50 border-slate-200 font-bold"
                />
                <Button onClick={handleCreateLine} className="bg-accent text-white h-12 px-6 rounded-xl font-black">
                  CREATE
                </Button>
              </div>
              <Button variant="ghost" className="mt-2 text-[10px] h-auto p-0 font-bold text-slate-400" onClick={() => setShowCreate(false)}>CANCEL</Button>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default LineSelectionModal;
