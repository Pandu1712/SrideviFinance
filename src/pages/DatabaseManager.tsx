import { useState } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, deleteDoc, doc, writeBatch, query, limit } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Database, Trash2, AlertTriangle, CheckCircle2, ShieldAlert, Zap, History, FileText, Users } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";

const DatabaseManager = () => {
    const { userData } = useAuth();
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState<string[]>([]);

    if (userData?.role !== "super_admin") {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center">
                <ShieldAlert className="h-20 w-20 text-rose-500 mb-6 animate-bounce" />
                <h1 className="text-4xl font-black text-slate-900 uppercase italic">Access Restricted</h1>
                <p className="text-slate-500 font-bold uppercase tracking-widest text-xs mt-4">Only the Root Administrator can access Neural Database Management.</p>
            </div>
        );
    }

    const deleteCollection = async (collectionName: string) => {
        setLoading(true);
        setResults(prev => [...prev, `Starting cleanup for: ${collectionName.toUpperCase()}`]);
        try {
            let deletedCount = 0;
            let hasMore = true;

            while (hasMore) {
                const q = query(collection(db, collectionName), limit(500));
                const snap = await getDocs(q);
                
                if (snap.empty) {
                    hasMore = false;
                    break;
                }

                const batch = writeBatch(db);
                snap.docs.forEach(d => {
                    batch.delete(d.ref);
                    deletedCount++;
                });

                await batch.commit();
                setResults(prev => [...prev, `Batch Cleared: ${deletedCount} records...`]);
                
                if (snap.size < 500) {
                    hasMore = false;
                }
            }

            setResults(prev => [...prev, `✅ SUCCESS: Cleared ${deletedCount} records from ${collectionName}`]);
            toast.success(`${collectionName} cleanup complete!`);
        } catch (err: any) {
            console.error(err);
            setResults(prev => [...prev, `❌ ERROR: ${err.message}`]);
            toast.error(`Cleanup failed for ${collectionName}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-4xl mx-auto space-y-10 pb-20"
        >
            <div className="flex items-center gap-6">
                <div className="h-16 w-16 rounded-3xl bg-premium-gradient flex items-center justify-center shadow-2xl rotate-3">
                    <Database className="text-white h-8 w-8" />
                </div>
                <div>
                    <h1 className="text-4xl font-black tracking-tighter text-slate-900 uppercase italic leading-none">Database Nexus</h1>
                    <p className="text-slate-400 font-black uppercase tracking-[0.3em] text-[10px] mt-2 flex items-center gap-2">
                        <Zap size={12} className="text-amber-500" /> System Maintenance & Data Optimization
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Cleanup Cards */}
                <Card className="glass-card border-none shadow-xl overflow-hidden group">
                    <CardHeader className="bg-slate-900 p-6 text-white relative">
                        <div className="absolute top-4 right-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <History size={60} />
                        </div>
                        <CardTitle className="text-lg font-black uppercase italic tracking-tight">Transaction History</CardTitle>
                        <CardDescription className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Wipe all payment records & postings</CardDescription>
                    </CardHeader>
                    <CardContent className="p-6 space-y-4">
                        <div className="text-xs text-slate-500 leading-relaxed">
                            Deleting postings will clear all transaction history, including collections, penalties, and extra amounts. <span className="text-rose-500 font-bold">This is irreversible.</span>
                        </div>
                        <Button 
                            variant="destructive" 
                            disabled={loading}
                            onClick={() => {
                                if (confirm("DANGER: This will delete ALL payment records across ALL lines. Are you absolutely sure?")) {
                                    deleteCollection("postings");
                                }
                            }}
                            className="w-full h-12 bg-rose-600 hover:bg-rose-700 font-black uppercase tracking-widest text-[10px] rounded-xl shadow-lg shadow-rose-100"
                        >
                            <Trash2 size={14} className="mr-2" /> Clear All Postings
                        </Button>
                    </CardContent>
                </Card>

                <Card className="glass-card border-none shadow-xl overflow-hidden group">
                    <CardHeader className="bg-slate-900 p-6 text-white relative">
                        <div className="absolute top-4 right-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <Users size={60} />
                        </div>
                        <CardTitle className="text-lg font-black uppercase italic tracking-tight">Member Accounts</CardTitle>
                        <CardDescription className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Wipe all loan documents & active balances</CardDescription>
                    </CardHeader>
                    <CardContent className="p-6 space-y-4">
                        <div className="text-xs text-slate-500 leading-relaxed">
                            Deleting accounts will remove all active loans, balances, and member assignments. <span className="text-rose-500 font-bold">Registry will be emptied.</span>
                        </div>
                        <Button 
                            variant="destructive" 
                            disabled={loading}
                            onClick={() => {
                                if (confirm("CRITICAL WARNING: This will delete ALL member accounts. You will lose all outstanding balance tracking. Proceed?")) {
                                    deleteCollection("accounts");
                                }
                            }}
                            className="w-full h-12 bg-rose-600 hover:bg-rose-700 font-black uppercase tracking-widest text-[10px] rounded-xl shadow-lg shadow-rose-100"
                        >
                            <Trash2 size={14} className="mr-2" /> Clear All Accounts
                        </Button>
                    </CardContent>
                </Card>

                <Card className="glass-card border-none shadow-xl overflow-hidden group">
                    <CardHeader className="bg-slate-900 p-6 text-white relative">
                        <div className="absolute top-4 right-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <FileText size={60} />
                        </div>
                        <CardTitle className="text-lg font-black uppercase italic tracking-tight">Audit & Summaries</CardTitle>
                        <CardDescription className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Wipe logs and day closure reports</CardDescription>
                    </CardHeader>
                    <CardContent className="p-6 space-y-4">
                        <div className="text-xs text-slate-500 leading-relaxed">
                            Clears `activity_logs` and `day_summaries`. Recommended for freeing space without losing core business data.
                        </div>
                        <div className="flex gap-2">
                            <Button 
                                variant="outline" 
                                disabled={loading}
                                onClick={() => deleteCollection("activity_logs")}
                                className="flex-1 h-12 border-slate-200 text-slate-600 font-black uppercase tracking-widest text-[9px] rounded-xl"
                            >
                                Clear Logs
                            </Button>
                            <Button 
                                variant="outline" 
                                disabled={loading}
                                onClick={() => deleteCollection("day_summaries")}
                                className="flex-1 h-12 border-slate-200 text-slate-600 font-black uppercase tracking-widest text-[9px] rounded-xl"
                            >
                                Clear Summaries
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Console / Output */}
                <Card className="glass-card border-none shadow-xl bg-slate-50 overflow-hidden md:col-span-1">
                    <CardHeader className="p-6 border-b border-slate-100 bg-white">
                        <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                            <Zap size={14} className="text-amber-500" /> Maintenance Output
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                        <div className="h-[180px] overflow-y-auto font-mono text-[9px] space-y-1.5 custom-scrollbar">
                            {results.length === 0 ? (
                                <p className="text-slate-400 italic">No maintenance tasks in progress...</p>
                            ) : results.map((r, i) => (
                                <p key={i} className={`flex items-start gap-2 ${r.includes('✅') ? 'text-emerald-600 font-bold' : r.includes('❌') ? 'text-rose-600' : 'text-slate-500'}`}>
                                    {r.includes('Batch') ? <Zap size={10} className="mt-0.5 text-amber-500" /> : <MoveRight size={10} className="mt-0.5 opacity-30" />}
                                    {r}
                                </p>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="bg-amber-50 border border-amber-100 rounded-[2rem] p-8 flex items-start gap-6">
                <div className="h-12 w-12 rounded-2xl bg-amber-500 flex items-center justify-center shrink-0 shadow-lg shadow-amber-200">
                    <AlertTriangle className="text-white" />
                </div>
                <div className="space-y-2">
                    <h3 className="text-sm font-black text-amber-800 uppercase tracking-widest">Protocol Warning</h3>
                    <p className="text-xs text-amber-700 font-medium leading-relaxed">
                        Neural cleanup operations directly impact the Firestore persistence layer. Deleting data will free up your Firestore quota but will result in permanent loss of records. Ensure you have exported all necessary PDF/Excel reports before executing these protocols.
                    </p>
                </div>
            </div>
        </motion.div>
    );
};

const MoveRight = ({ size, className }: { size: number, className?: string }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M18 8L22 12L18 16" />
    <path d="M2 12H22" />
  </svg>
);

export default DatabaseManager;
