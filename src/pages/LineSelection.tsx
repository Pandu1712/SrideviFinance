import { useState, useEffect } from "react";
import { useLine } from "@/contexts/LineContext";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { db } from "@/lib/firebase";
import { collection, addDoc, deleteDoc, doc, getDocs, query, where, writeBatch } from "firebase/firestore";
import { toast } from "sonner";
import { LayoutDashboard, MapPin, Plus, Database, ArrowRight, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/**
 * MEGA-STABLE Line Selection Page
 * Removed framer-motion temporarily to isolate the 'White Screen' bug.
 * Re-implementing core logic with maximum safety checks.
 */
const LineSelection = () => {
  const { userData } = useAuth();
  const { lines, setSelectedLineId, loadingLines } = useLine();
  const navigate = useNavigate();
  const [newLineName, setNewLineName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [deletingLineId, setDeletingLineId] = useState<string | null>(null);

  // Safety Redirect for Agents
  useEffect(() => {
    if (userData && userData.role === "agent") {
      navigate("/dashboard");
    }
  }, [userData, navigate]);

  const handleSelection = (id: string | null) => {
    setIsSyncing(true);
    try {
      setSelectedLineId(id);
      toast.success(id ? "Operational Context Established" : "Full Portfolio Activated");
      // Short delay for visual feedback before navigation
      setTimeout(() => navigate("/dashboard"), 400);
    } catch (err) {
      console.error("Selection Error:", err);
      setIsSyncing(false);
    }
  };

  const handleCreateLine = async () => {
    if (!newLineName.trim()) return;
    try {
      await addDoc(collection(db, "lines"), {
        name: newLineName,
        createdAt: new Date().toISOString(),
      });
      toast.success("New Operational Line Created");
      setNewLineName("");
      setShowCreate(false);
    } catch (err) {
      toast.error("Failed to establish line");
    }
  };

  const handleDeleteLine = async (id: string) => {
    setDeletingLineId(id);
    try {
      // 1. Fetch all associated accounts
      const accountsQuery = query(collection(db, "accounts"), where("lineId", "==", id));
      const accountsSnapshot = await getDocs(accountsQuery);
      
      // 2. Fetch all associated postings
      const postingsQuery = query(collection(db, "postings"), where("lineId", "==", id));
      const postingsSnapshot = await getDocs(postingsQuery);
      
      // 3. Consolidate all documents for batch deletion
      const allDocs = [
        ...postingsSnapshot.docs,
        ...accountsSnapshot.docs,
        { ref: doc(db, "lines", id) } // Include the line itself
      ];

      // 4. Execute deletion in batches of 500 (Firestore limit)
      for (let i = 0; i < allDocs.length; i += 500) {
        const batch = writeBatch(db);
        const chunk = allDocs.slice(i, i + 500);
        chunk.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }

      toast.success("Operational Line & Associated Data Purged");
    } catch (err) {
      console.error("Delete Error:", err);
      toast.error("Failed to decommissioning line");
    } finally {
      setDeletingLineId(null);
    }
  };

  if (loadingLines || isSyncing) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-6">
        <div className="h-12 w-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-amber-500 font-black uppercase tracking-[0.3em] text-[10px] animate-pulse">Syncing High-Yield Matrix...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020617] text-white flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-slate-900/50 backdrop-blur-3xl rounded-[2.5rem] border border-white/5 overflow-hidden shadow-2xl">
        
        {/* Header */}
        <div className="p-12 border-b border-white/5 bg-gradient-to-br from-slate-800 to-slate-900">
          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="h-20 w-20 rounded-2xl bg-amber-500 flex items-center justify-center shadow-2xl">
              <Database className="text-white h-10 w-10" />
            </div>
            <div className="text-center md:text-left">
              <h1 className="text-4xl font-black italic uppercase tracking-tighter italic">
                Operative <span className="text-amber-500 not-italic">Channels</span>
              </h1>
              <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.3em] mt-1">Sridevi Finance Command Suite</p>
            </div>
          </div>
        </div>

        {/* Selection Grid */}
        <div className="p-12">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            
            {/* Full Portfolio */}
            <button
              onClick={() => handleSelection(null)}
              className="group p-8 rounded-3xl bg-slate-800/50 border border-white/5 hover:border-amber-500 hover:bg-slate-800 transition-all text-left relative flex flex-col gap-6"
            >
              <div className="h-12 w-12 bg-slate-700 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-amber-500/10 group-hover:text-amber-500 transition-all">
                <LayoutDashboard size={24} />
              </div>
              <div>
                <h3 className="text-xl font-black">Full Portfolio</h3>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Master Enterprise View</p>
              </div>
              <ArrowRight className="absolute bottom-8 right-8 text-slate-700 group-hover:text-amber-500 group-hover:translate-x-1 transition-all" size={18} />
            </button>

            {/* Dynamic Lines */}
            {lines.map((line) => (
              <div key={line.id} className="relative group">
                <button
                  disabled={!!deletingLineId}
                  onClick={() => handleSelection(line.id)}
                  className={`w-full p-8 rounded-3xl bg-slate-800/50 border border-white/5 hover:border-amber-500 hover:bg-slate-800 transition-all text-left relative flex flex-col gap-6 ${deletingLineId === line.id ? 'opacity-50 grayscale' : ''}`}
                >
                  <div className="h-12 w-12 bg-slate-700 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-amber-500/10 group-hover:text-amber-500 transition-all">
                    {deletingLineId === line.id ? <div className="h-5 w-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" /> : <MapPin size={24} />}
                  </div>
                  <div>
                    <h3 className="text-xl font-black truncate pr-12">{line.name}</h3>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">
                      {deletingLineId === line.id ? 'Decommissioning Data...' : 'Regional Operative'}
                    </p>
                  </div>
                  {!deletingLineId && <ArrowRight className="absolute bottom-8 right-8 text-slate-700 group-hover:text-amber-500 group-hover:translate-x-1 transition-all" size={18} />}
                </button>

                {(userData?.role === "super_admin" || userData?.role === "admin") && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button 
                        onClick={(e) => e.stopPropagation()}
                        className="absolute top-8 right-8 p-2 rounded-lg bg-slate-700/50 text-slate-400 hover:bg-red-500/20 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={16} />
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="bg-slate-900 border-white/10 text-white">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="text-xl font-black italic">CONFIRM DECOMMISSIONING?</AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-400 font-bold">
                          You are about to permanently remove <span className="text-amber-500">{line.name}</span> from the active operative landscape. This action is irreversible.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="bg-slate-800 border-white/5 text-white hover:bg-slate-700">ABORT</AlertDialogCancel>
                        <AlertDialogAction 
                          onClick={() => handleDeleteLine(line.id)}
                          className="bg-red-600 hover:bg-red-700 text-white font-black"
                        >
                          PROCEED WITH DELETE
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            ))}

            {/* New Line */}
            {!showCreate ? (
              <button
                onClick={() => setShowCreate(true)}
                className="flex flex-col items-center justify-center gap-4 p-8 rounded-3xl border-2 border-dashed border-slate-700 hover:border-slate-500 hover:bg-white/5 transition-all text-slate-500 group"
              >
                <Plus size={28} className="group-hover:rotate-90 transition-all" />
                <span className="font-black text-[9px] uppercase tracking-widest">New Line</span>
              </button>
            ) : (
              <div className="col-span-full bg-amber-500/5 p-8 rounded-3xl border border-amber-500/20">
                <div className="flex gap-4">
                  <Input 
                    value={newLineName} 
                    onChange={(e) => setNewLineName(e.target.value)} 
                    placeholder="Enter Line Identity..."
                    className="h-12 bg-slate-900 border-white/10 text-white font-bold"
                  />
                  <Button onClick={handleCreateLine} className="h-12 px-8 bg-amber-500 text-black font-black">ESTABLISH</Button>
                </div>
                <button className="mt-4 text-[9px] font-black text-slate-500 hover:text-white uppercase tracking-widest" onClick={() => setShowCreate(false)}>Aborted Operation</button>
              </div>
            )}
          </div>

          <div className="mt-12 pt-8 border-t border-white/5 text-center">
             <p className="text-[9px] font-black uppercase text-slate-600 tracking-[0.5em]">SRIDEVI ENTERPRISE SECURITY CONTEXT ACTIVE</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LineSelection;
