import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLine } from "@/contexts/LineContext";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { db } from "@/lib/firebase";
import { collection, addDoc, deleteDoc, doc, getDocs, query, where, writeBatch, updateDoc } from "firebase/firestore";
import { toast } from "sonner";
import { LayoutDashboard, MapPin, Plus, Database, ArrowRight, Trash2, Edit2 } from "lucide-react";
import { logActivity } from "@/lib/audit";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * MEGA-STABLE Line Selection Page
 * Removed framer-motion temporarily to isolate the 'White Screen' bug.
 * Re-implementing core logic with maximum safety checks.
 */
const LineSelection = () => {
  const { userData, logout } = useAuth();
  const { lines, setSelectedLineId, loadingLines } = useLine();
  const navigate = useNavigate();
  const [newLineName, setNewLineName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [deletingLineId, setDeletingLineId] = useState<string | null>(null);
  const [renamingLineId, setRenamingLineId] = useState<string | null>(null);
  const [renamingName, setRenamingName] = useState("");

  // Filter lines based on role
  const availableLines = (userData?.role === "super_admin" || userData?.role === "admin")
    ? lines 
    : lines.filter(line => 
        (userData?.lineIds && userData.lineIds.includes(line.id)) || 
        userData?.lineId === line.id
      );

  const handleSelection = (id: string | null) => {
    setIsSyncing(true);
    try {
      setSelectedLineId(id);
      toast.success(id ? "Operational Context Established" : "Full Portfolio Activated");
      setTimeout(() => navigate("/dashboard"), 600);
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
      
      if (userData) {
        logActivity(
          userData.uid,
          userData.name,
          userData.role,
          "LINE_CREATE",
          `Established new operational line: ${newLineName}`
        );
      }
      
      setNewLineName("");
      setShowCreate(false);
    } catch (err) {
      toast.error("Failed to establish line");
    }
  };

  const handleUpdateLine = async () => {
    if (!renamingLineId || !renamingName.trim()) return;
    try {
      const lineRef = doc(db, "lines", renamingLineId);
      await updateDoc(lineRef, { name: renamingName });
      toast.success("Line Identity Updated");
      
      if (userData) {
        logActivity(
          userData.uid,
          userData.name,
          userData.role,
          "LINE_UPDATE",
          `Renamed line to: ${renamingName}`
        );
      }
      
      setRenamingLineId(null);
    } catch (err) {
      toast.error("Failed to update line");
    }
  };

  const handleDeleteLine = async (id: string) => {
    setDeletingLineId(id);
    try {
      const accountsQuery = query(collection(db, "accounts"), where("lineId", "==", id));
      const accountsSnapshot = await getDocs(accountsQuery);
      const postingsQuery = query(collection(db, "postings"), where("lineId", "==", id));
      const postingsSnapshot = await getDocs(postingsQuery);
      
      const allDocs = [
        ...postingsSnapshot.docs,
        ...accountsSnapshot.docs,
        { ref: doc(db, "lines", id) }
      ];

      for (let i = 0; i < allDocs.length; i += 500) {
        const batch = writeBatch(db);
        const chunk = allDocs.slice(i, i + 500);
        chunk.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }

      toast.success("Operational Line & Associated Data Purged");

      if (userData) {
        logActivity(
          userData.uid,
          userData.name,
          userData.role,
          "LINE_DELETE",
          `Permanently purged line and all data for ID: ${id}`
        );
      }
    } catch (err) {
      console.error("Delete Error:", err);
      toast.error("Failed to decommissioning line");
    } finally {
      setDeletingLineId(null);
    }
  };

  if (loadingLines || isSyncing) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-8">
        <motion.div 
          animate={{ 
            rotate: 360,
            scale: [1, 1.2, 1]
          }} 
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="h-16 w-16 border-t-4 border-amber-500 border-r-4 border-r-amber-500/20 rounded-full" 
        />
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-amber-500 font-black uppercase tracking-[0.5em] text-[10px] animate-pulse"
        >
          Syncing High-Yield Matrix...
        </motion.p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020617] text-white flex items-center justify-center p-6 font-sans relative overflow-hidden">
      {/* Dynamic Background */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
         <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-amber-500/10 blur-[120px] rounded-full" />
         <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-500/10 blur-[120px] rounded-full" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-5xl bg-slate-900/40 backdrop-blur-3xl rounded-[3rem] border border-white/5 overflow-hidden shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] z-10"
      >
        
        {/* Header */}
        <div className="p-12 md:p-16 border-b border-white/5 bg-gradient-to-br from-slate-800/50 to-slate-900/50 relative overflow-hidden flex justify-between items-start">
          <div className="absolute top-0 right-0 p-8 opacity-10">
             <Database size={120} className="text-white" />
          </div>
          <div className="flex flex-col md:flex-row items-center gap-10 relative z-10">
            <motion.div 
              whileHover={{ rotate: 5, scale: 1.05 }}
              className="h-24 w-24 rounded-3xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-2xl shadow-amber-500/20"
            >
              <Database className="text-white h-12 w-12" />
            </motion.div>
            <div className="text-center md:text-left">
              <motion.h1 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className="text-5xl font-black italic uppercase tracking-tighter"
              >
                Operative <span className="text-amber-500 not-italic">Channels</span>
              </motion.h1>
              <p className="text-slate-400 text-xs font-black uppercase tracking-[0.4em] mt-2 opacity-60">Sridevi Finance Command Suite v2.0</p>
            </div>
          </div>
          
          <Button 
            variant="ghost" 
            onClick={async () => {
              await logout();
              navigate("/login");
            }}
            className="relative z-10 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 font-bold tracking-widest uppercase text-[10px]"
          >
            Logout
          </Button>
        </div>

        {/* Selection Grid */}
        <div className="p-12 md:p-16">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            
            {/* Full Portfolio - Only for Admins */}
            {(userData?.role === "super_admin" || userData?.role === "admin") && (
              <motion.button
                whileHover={{ y: -8, backgroundColor: "rgba(30, 41, 59, 0.8)" }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleSelection(null)}
                className="group p-10 rounded-[2.5rem] bg-slate-800/40 border border-white/5 hover:border-amber-500/50 transition-all text-left relative flex flex-col gap-8 shadow-xl"
              >
                <div className="h-16 w-16 bg-slate-700/50 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-amber-500 group-hover:text-white transition-all duration-500">
                  <LayoutDashboard size={32} />
                </div>
                <div>
                  <h3 className="text-2xl font-black tracking-tight">Full Portfolio</h3>
                  <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mt-2 group-hover:text-slate-300 transition-colors">Master Enterprise View</p>
                </div>
                <div className="absolute bottom-10 right-10 p-3 bg-slate-700/30 rounded-xl text-slate-500 group-hover:bg-amber-500 group-hover:text-white group-hover:translate-x-2 transition-all duration-500">
                   <ArrowRight size={20} />
                </div>
              </motion.button>
            )}

            {/* Dynamic Lines */}
            <AnimatePresence>
              {availableLines.map((line, idx) => (
                <motion.div 
                  key={line.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.05 }}
                  className="relative group"
                >
                  <motion.button
                    whileHover={{ y: -8, backgroundColor: "rgba(30, 41, 59, 0.8)" }}
                    whileTap={{ scale: 0.98 }}
                    disabled={!!deletingLineId}
                    onClick={() => handleSelection(line.id)}
                    className={`w-full p-10 rounded-[2.5rem] bg-slate-800/40 border border-white/5 hover:border-amber-500/50 transition-all text-left relative flex flex-col gap-8 shadow-xl ${deletingLineId === line.id ? 'opacity-50 grayscale' : ''}`}
                  >
                    <div className="h-16 w-16 bg-slate-700/50 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-amber-500 group-hover:text-white transition-all duration-500">
                      {deletingLineId === line.id ? <div className="h-8 w-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" /> : <MapPin size={32} />}
                    </div>
                    <div>
                      <h3 className="text-2xl font-black tracking-tight truncate pr-12">{line.name}</h3>
                      <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mt-2 group-hover:text-slate-300 transition-colors">
                        {deletingLineId === line.id ? 'Decommissioning Data...' : 'Regional Operative'}
                      </p>
                    </div>
                    {!deletingLineId && (
                      <div className="absolute bottom-10 right-10 p-3 bg-slate-700/30 rounded-xl text-slate-500 group-hover:bg-amber-500 group-hover:text-white group-hover:translate-x-2 transition-all duration-500">
                         <ArrowRight size={20} />
                      </div>
                    )}
                  </motion.button>

                  {(userData?.role === "super_admin" || userData?.role === "admin") && (
                    <>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenamingLineId(line.id);
                          setRenamingName(line.name);
                        }}
                        className="absolute top-10 right-24 p-3 rounded-xl bg-slate-700/30 text-slate-500 hover:bg-amber-500 hover:text-white transition-all opacity-0 group-hover:opacity-100 z-20 shadow-lg"
                      >
                        <Edit2 size={18} />
                      </button>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button 
                            onClick={(e) => e.stopPropagation()}
                            className="absolute top-10 right-10 p-3 rounded-xl bg-slate-700/30 text-slate-500 hover:bg-rose-500 hover:text-white transition-all opacity-0 group-hover:opacity-100 z-20 shadow-lg"
                          >
                            <Trash2 size={18} />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="bg-slate-900 border border-white/10 text-white rounded-[2rem] p-10">
                          <AlertDialogHeader>
                            <AlertDialogTitle className="text-3xl font-black italic uppercase tracking-tighter">CONFIRM DECOMMISSIONING?</AlertDialogTitle>
                            <AlertDialogDescription className="text-slate-400 font-bold text-base mt-4 leading-relaxed">
                              You are about to permanently remove <span className="text-amber-500 font-black">{line.name}</span> from the active operative landscape. All associated accounts and postings will be <span className="text-rose-500 font-black">PURGED</span>.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter className="mt-10 gap-4">
                            <AlertDialogCancel className="h-14 flex-1 bg-slate-800 border-white/5 text-white hover:bg-slate-700 rounded-2xl font-black uppercase tracking-widest text-[10px]">ABORT</AlertDialogCancel>
                            <AlertDialogAction 
                              onClick={() => handleDeleteLine(line.id)}
                              className="h-14 flex-1 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-2xl uppercase tracking-widest text-[10px] shadow-2xl shadow-rose-600/20"
                            >
                              PROCEED WITH PURGE
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {/* New Line */}
            {userData?.role === "super_admin" && (
              !showCreate ? (
                <motion.button
                  whileHover={{ scale: 0.98, backgroundColor: "rgba(255, 255, 255, 0.05)" }}
                  onClick={() => setShowCreate(true)}
                  className="flex flex-col items-center justify-center gap-6 p-10 rounded-[2.5rem] border-2 border-dashed border-slate-800 hover:border-amber-500/50 transition-all text-slate-600 group"
                >
                  <div className="h-16 w-16 rounded-2xl bg-slate-800/50 flex items-center justify-center group-hover:bg-amber-500/10 group-hover:text-amber-500 transition-all">
                    <Plus size={32} className="group-hover:rotate-90 transition-all duration-500" />
                  </div>
                  <span className="font-black text-[10px] uppercase tracking-[0.4em]">Establish Channel</span>
                </motion.button>
              ) : (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="col-span-full bg-amber-500/5 p-12 rounded-[2.5rem] border border-amber-500/20 flex flex-col gap-6"
                >
                  <div className="flex flex-col md:flex-row gap-6">
                    <Input 
                      value={newLineName} 
                      onChange={(e) => setNewLineName(e.target.value)} 
                      placeholder="Enter Line Identity (e.g., Regional Sector A)"
                      className="h-16 bg-slate-900 border-white/5 text-white font-black text-lg px-8 rounded-2xl focus:ring-amber-500/20"
                    />
                    <Button onClick={handleCreateLine} className="h-16 px-12 bg-amber-500 text-slate-950 font-black uppercase tracking-widest rounded-2xl shadow-xl hover:bg-amber-400">ESTABLISH</Button>
                  </div>
                  <button className="text-[10px] font-black text-slate-500 hover:text-white uppercase tracking-[0.3em] transition-colors" onClick={() => setShowCreate(false)}>Cancel Deployment</button>
                </motion.div>
              )
            )}
          </div>

          <Dialog open={!!renamingLineId} onOpenChange={(open) => !open && setRenamingLineId(null)}>
            <DialogContent className="bg-slate-900 border border-white/10 text-white rounded-[2rem] p-10">
              <DialogHeader>
                <DialogTitle className="text-3xl font-black italic uppercase tracking-tighter">Rename Line</DialogTitle>
                <DialogDescription className="text-slate-400 font-bold text-base mt-4">
                  Update the identity of this operative channel.
                </DialogDescription>
              </DialogHeader>
              <div className="py-6">
                <Input 
                  value={renamingName} 
                  onChange={(e) => setRenamingName(e.target.value)} 
                  className="h-14 bg-slate-800 border-white/5 text-white font-black px-6 rounded-xl"
                  placeholder="Enter new line name"
                />
              </div>
              <DialogFooter className="gap-4">
                <Button 
                  variant="ghost" 
                  onClick={() => setRenamingLineId(null)}
                  className="h-14 flex-1 bg-slate-800 border-white/5 text-white hover:bg-slate-700 rounded-xl font-black uppercase tracking-widest text-[10px]"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleUpdateLine}
                  className="h-14 flex-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl uppercase tracking-widest text-[10px] shadow-xl"
                >
                  Save Changes
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <div className="mt-20 pt-10 border-t border-white/5 text-center flex flex-col items-center gap-4">
             <div className="flex items-center gap-2 px-6 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                <div className="h-1.5 w-1.5 bg-emerald-500 rounded-full animate-pulse" />
                <p className="text-[9px] font-black uppercase text-emerald-500 tracking-[0.5em]">SRIDEVI ENTERPRISE SECURITY CONTEXT ACTIVE</p>
             </div>
             <p className="text-[8px] text-slate-600 font-bold uppercase tracking-widest">Authorized Access Only • AES-256 Cloud Synchronization</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default LineSelection;
