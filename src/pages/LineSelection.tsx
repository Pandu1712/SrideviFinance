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
import { LayoutDashboard, MapPin, Plus, Database, ArrowRight, Trash2, Edit2, Settings } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

  useEffect(() => {
    // Prevent white background flicker/bleed on scroll
    document.body.style.backgroundColor = "#020617";
    return () => {
      document.body.style.backgroundColor = "";
    };
  }, []);
  const [newLineName, setNewLineName] = useState("");
  const [newLineNumber, setNewLineNumber] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [deletingLineId, setDeletingLineId] = useState<string | null>(null);
  const [renamingLineId, setRenamingLineId] = useState<string | null>(null);
  const [renamingName, setRenamingName] = useState("");
  const [renamingNumber, setRenamingNumber] = useState("");

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
        number: newLineNumber,
        createdAt: new Date().toISOString(),
      });
      toast.success("New Operational Line Created");
      
      if (userData) {
        logActivity(
          userData.uid,
          userData.name,
          userData.role,
          "LINE_CREATE",
          `Established new operational line: ${newLineNumber} - ${newLineName}`
        );
      }
      
      setNewLineName("");
      setNewLineNumber("");
      setShowCreate(false);
    } catch (err) {
      toast.error("Failed to establish line");
    }
  };

  const handleUpdateLine = async () => {
    if (!renamingLineId || !renamingName.trim() || !renamingNumber.trim()) return;
    try {
      const lineRef = doc(db, "lines", renamingLineId);
      await updateDoc(lineRef, { name: renamingName, number: renamingNumber });
      toast.success("Line Identity Updated");
      
      if (userData) {
        logActivity(
          userData.uid,
          userData.name,
          userData.role,
          "LINE_UPDATE",
          `Renamed line to: ${renamingNumber} - ${renamingName}`
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
    <div className="min-h-screen w-full bg-[#020617] text-white flex flex-col items-center justify-start py-12 md:py-20 px-4 md:px-8 font-sans relative overflow-x-hidden selection:bg-amber-500/30">
      {/* Animated Mesh Gradient Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div 
          animate={{ 
            scale: [1, 1.2, 1],
            rotate: [0, 90, 0],
            x: [0, 100, 0],
            y: [0, 50, 0]
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] bg-amber-500/10 blur-[120px] rounded-full mix-blend-screen" 
        />
        <motion.div 
          animate={{ 
            scale: [1.2, 1, 1.2],
            rotate: [90, 0, 90],
            x: [0, -100, 0],
            y: [0, -50, 0]
          }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className="absolute -bottom-[20%] -right-[10%] w-[60%] h-[60%] bg-indigo-500/10 blur-[120px] rounded-full mix-blend-screen" 
        />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] mix-blend-overlay" />
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-6xl bg-[#0F172A]/30 backdrop-blur-[40px] rounded-[3.5rem] border border-white/10 overflow-hidden shadow-[0_40px_100px_-20px_rgba(0,0,0,0.7)] z-10 relative"
      >
        {/* Decorative Top Line */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        
        {/* Header Section */}
        <div className="px-8 pt-12 pb-10 md:px-16 md:pt-16 md:pb-12 border-b border-white/5 relative flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex flex-col md:flex-row items-center gap-8 relative z-10">
            <motion.div 
              whileHover={{ rotate: 5, scale: 1.05 }}
              className="h-20 w-20 rounded-3xl bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 flex items-center justify-center shadow-[0_0_40px_rgba(245,158,11,0.3)] border border-white/20"
            >
              <Database className="text-white h-10 w-10 drop-shadow-lg" />
            </motion.div>
            <div className="text-center md:text-left space-y-1">
              <motion.h1 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className="text-4xl md:text-5xl font-black tracking-tight flex flex-wrap justify-center md:justify-start gap-x-3 items-baseline"
              >
                <span className="bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60">OPERATIVE</span>
                <span className="text-amber-500">CHANNELS</span>
              </motion.h1>
              <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.5em] opacity-50 flex items-center justify-center md:justify-start gap-2">
                <span className="h-px w-8 bg-slate-700" />
                COMMAND SUITE V2.0
                <span className="h-px w-8 bg-slate-700" />
              </p>
            </div>
          </div>
          
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button 
              variant="ghost" 
              onClick={async () => {
                await logout();
                navigate("/login");
              }}
              className="px-6 py-6 rounded-2xl bg-white/5 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 border border-white/5 hover:border-rose-500/20 transition-all font-black uppercase tracking-[0.2em] text-[10px]"
            >
              Terminate Session
            </Button>
          </motion.div>
        </div>

        {/* Selection Grid */}
        <div className="px-8 py-12 md:px-16 md:py-16">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            
            {/* Full Portfolio - Only for Admins */}
            {(userData?.role === "super_admin" || userData?.role === "admin") && (
              <motion.button
                whileHover={{ y: -5, backgroundColor: "rgba(255, 255, 255, 0.05)", borderColor: "rgba(245, 158, 11, 0.4)" }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleSelection(null)}
                className="group p-6 rounded-[2rem] bg-white/[0.03] border border-white/10 transition-all duration-500 text-left relative flex flex-col gap-6 shadow-xl hover:shadow-amber-500/10 overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 blur-3xl rounded-full -mr-12 -mt-12 group-hover:bg-amber-500/10 transition-all duration-700" />
                <div className="h-12 w-12 bg-white/5 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-amber-500 group-hover:text-white transition-all duration-500 border border-white/5">
                  <LayoutDashboard size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black tracking-tight text-white group-hover:text-white transition-colors">Full Portfolio</h3>
                  <p className="text-[8px] text-slate-500 font-black uppercase tracking-[0.25em] mt-2 group-hover:text-amber-500/80 transition-colors">Enterprise Master View</p>
                </div>
                <div className="mt-auto flex items-center gap-2 text-slate-500 group-hover:text-white transition-all duration-500">
                  <span className="text-[8px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all duration-500">Initialize</span>
                  <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform duration-500" />
                </div>
              </motion.button>
            )}

            {/* Dynamic Lines */}
            <AnimatePresence mode="popLayout">
              {availableLines.map((line, idx) => (
                <motion.div 
                  key={line.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: idx * 0.05, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  className="relative group"
                >
                  <motion.button
                    whileHover={{ y: -5, scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    disabled={!!deletingLineId}
                    onClick={() => handleSelection(line.id)}
                    className={`w-full p-5 rounded-3xl bg-white/[0.02] backdrop-blur-md border border-white/10 transition-all duration-500 text-left relative flex flex-col h-full gap-4 shadow-2xl hover:border-amber-500/30 hover:shadow-amber-500/5 group overflow-hidden ${deletingLineId === line.id ? 'opacity-50 grayscale cursor-wait' : ''}`}
                  >
                    {/* Abstract background glow */}
                    <div className="absolute -right-8 -top-8 w-24 h-24 bg-amber-500/10 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                    
                    <div className="flex items-center justify-between relative z-10">
                      <div className="h-10 w-10 bg-slate-900 border border-white/5 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-amber-500 group-hover:text-white transition-all duration-500">
                        {deletingLineId === line.id ? <div className="h-5 w-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" /> : <MapPin size={18} />}
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <div className="px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                          <span className="text-[9px] font-black text-amber-500 tracking-[0.2em]">#{line.number || (idx + 1)}</span>
                        </div>
                        
                        {(userData?.role === "super_admin" || userData?.role === "admin") && (
                          <div onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button 
                                  className="h-8 w-8 rounded-lg bg-white/5 hover:bg-white/10 text-slate-500 hover:text-white flex items-center justify-center transition-all border border-white/5"
                                  title="Settings"
                                >
                                  <Settings size={14} className="hover:rotate-90 transition-transform duration-500" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="bg-[#0F172A] border-white/10 text-white rounded-xl p-1.5 min-w-[150px] shadow-2xl backdrop-blur-2xl">
                                <DropdownMenuItem 
                                  onClick={() => {
                                    setRenamingLineId(line.id);
                                    setRenamingName(line.name);
                                    setRenamingNumber(line.number);
                                  }}
                                  className="flex items-center gap-2 px-3 py-2 cursor-pointer rounded-lg hover:bg-white/5 focus:bg-white/5 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-amber-500"
                                >
                                  <Edit2 size={12} />
                                  Rename
                                </DropdownMenuItem>

                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <div className="flex items-center gap-2 px-3 py-2 cursor-pointer rounded-lg hover:bg-rose-500/10 focus:bg-rose-500/10 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-rose-500">
                                      <Trash2 size={12} />
                                      Decommission
                                    </div>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent className="bg-[#0F172A] border border-white/10 text-white rounded-[2rem] p-8 max-w-sm">
                                    <AlertDialogHeader>
                                      <AlertDialogTitle className="text-xl font-black text-center">PURGE CHANNEL?</AlertDialogTitle>
                                      <AlertDialogDescription className="text-slate-400 text-center text-[10px] uppercase tracking-widest mt-2">
                                        Terminating <span className="text-white font-black">{line.name}</span> is permanent.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter className="mt-6 flex gap-3">
                                      <AlertDialogCancel className="flex-1 bg-white/5 border-white/10 text-white rounded-lg text-[9px] font-black uppercase tracking-widest">ABORT</AlertDialogCancel>
                                      <AlertDialogAction 
                                        onClick={() => handleDeleteLine(line.id)}
                                        className="flex-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[9px] font-black uppercase tracking-widest"
                                      >
                                        CONFIRM
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1 relative z-10">
                      <h3 className="text-lg font-black tracking-tight text-white group-hover:text-amber-500 transition-colors truncate">
                        {line.name}
                      </h3>
                      <div className="flex items-center gap-2">
                        <div className="h-1 w-1 bg-emerald-500 rounded-full animate-pulse" />
                        <p className="text-[8px] text-slate-500 font-black uppercase tracking-[0.3em]">
                          Active Operations
                        </p>
                      </div>
                    </div>

                    <div className="mt-auto pt-3 border-t border-white/5 flex items-center justify-between opacity-50 group-hover:opacity-100 transition-opacity">
                       <span className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-400">Initialize Link</span>
                       <ArrowRight size={14} className="text-slate-500 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </motion.button>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* New Line */}
            {userData?.role === "super_admin" && (
              !showCreate ? (
                <motion.button
                  whileHover={{ scale: 0.98, backgroundColor: "rgba(255, 255, 255, 0.05)", borderColor: "rgba(245, 158, 11, 0.3)" }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowCreate(true)}
                  className="flex flex-col items-center justify-center h-full min-h-[200px] gap-4 p-6 rounded-[2rem] border-2 border-dashed border-white/10 hover:border-amber-500/50 transition-all text-slate-500 group relative overflow-hidden"
                >
                  <div className="h-12 w-12 rounded-xl bg-white/5 flex items-center justify-center group-hover:bg-amber-500 group-hover:text-white transition-all duration-500 border border-white/5">
                    <Plus size={24} className="group-hover:rotate-90 transition-all duration-500" />
                  </div>
                  <div className="text-center space-y-1">
                    <span className="font-black text-[8px] uppercase tracking-[0.4em] block">Establish</span>
                    <span className="font-black text-[8px] uppercase tracking-[0.4em] text-slate-600 group-hover:text-slate-400 transition-colors">New Channel</span>
                  </div>
                </motion.button>
              ) : (
                <motion.div 
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="col-span-full bg-amber-500/[0.03] p-8 md:p-10 rounded-[2.5rem] border border-amber-500/20 flex flex-col gap-6 shadow-2xl relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/[0.05] blur-[80px] rounded-full -mr-24 -mt-24" />
                  <div className="space-y-1">
                    <h4 className="text-md font-black uppercase tracking-tight text-amber-500">Deploy New Channel</h4>
                    <p className="text-[10px] font-medium text-slate-400">Define the identity for this operational sector.</p>
                  </div>
                  <div className="flex flex-col md:flex-row gap-3">
                    <Input 
                      value={newLineNumber} 
                      onChange={(e) => setNewLineNumber(e.target.value)} 
                      placeholder="Line #"
                      className="h-14 w-full md:w-32 bg-[#020617] border-white/10 text-white font-bold text-md px-6 rounded-xl focus:ring-amber-500/20 focus:border-amber-500/40 transition-all"
                    />
                    <Input 
                      value={newLineName} 
                      onChange={(e) => setNewLineName(e.target.value)} 
                      placeholder="e.g. Northern Regional Sector"
                      className="h-14 flex-1 bg-[#020617] border-white/10 text-white font-bold text-md px-6 rounded-xl focus:ring-amber-500/20 focus:border-amber-500/40 transition-all"
                    />
                    <Button onClick={handleCreateLine} className="h-14 px-8 bg-amber-500 text-slate-950 font-black uppercase tracking-widest rounded-xl shadow-xl hover:bg-amber-400 transition-all text-[11px]">DEPLOY</Button>
                    <Button variant="ghost" onClick={() => setShowCreate(false)} className="h-14 px-6 text-slate-400 font-black uppercase tracking-widest rounded-xl hover:bg-white/5 transition-all text-[11px]">Cancel</Button>
                  </div>
                </motion.div>
              )
            )}
          </div>

          {/* Footer Context */}
          <div className="mt-20 pt-10 border-t border-white/5 flex flex-col items-center gap-6">
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               transition={{ delay: 1 }}
               className="flex items-center gap-3 px-6 py-2.5 bg-emerald-500/5 border border-emerald-500/10 rounded-full"
             >
                <div className="h-2 w-2 bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)] animate-pulse" />
                <p className="text-[9px] font-black uppercase text-emerald-500/80 tracking-[0.4em]">SRIDEVI ENTERPRISE SECURITY ACTIVE</p>
             </motion.div>
             <p className="text-[8px] text-slate-600 font-bold uppercase tracking-[0.5em]">Authorized Personnel Only • AES-256 Multi-Zone Encryption</p>
          </div>
        </div>
      </motion.div>

      {/* Rename Dialog */}
      <Dialog open={!!renamingLineId} onOpenChange={(open) => !open && setRenamingLineId(null)}>
        <DialogContent className="bg-[#0F172A] border border-white/10 text-white rounded-[2.5rem] p-10 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black tracking-tight text-center">Identity Update</DialogTitle>
            <DialogDescription className="text-slate-400 font-medium text-center text-xs mt-2">
              Modify the operative designation for this channel.
            </DialogDescription>
          </DialogHeader>
          <div className="py-8 space-y-4">
            <Input 
              value={renamingNumber} 
              onChange={(e) => setRenamingNumber(e.target.value)} 
              className="h-14 bg-[#020617] border-white/10 text-white font-bold px-6 rounded-xl text-md focus:ring-amber-500/20 focus:border-amber-500/40 transition-all"
              placeholder="Line Number (e.g. 1)"
            />
            <Input 
              value={renamingName} 
              onChange={(e) => setRenamingName(e.target.value)} 
              className="h-14 bg-[#020617] border-white/10 text-white font-bold px-6 rounded-xl text-md focus:ring-amber-500/20 focus:border-amber-500/40 transition-all"
              placeholder="Designation name..."
            />
          </div>
          <DialogFooter className="gap-3 flex flex-col sm:flex-row">
            <Button 
              variant="ghost" 
              onClick={() => setRenamingLineId(null)}
              className="h-12 flex-1 bg-white/5 border-white/10 text-white hover:bg-white/10 rounded-xl font-black uppercase tracking-widest text-[9px] transition-all"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleUpdateLine}
              className="h-12 flex-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl uppercase tracking-widest text-[9px] shadow-xl transition-all"
            >
              Update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LineSelection;
