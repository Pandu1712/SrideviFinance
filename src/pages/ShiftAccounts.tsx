import { useAuth } from "@/contexts/AuthContext";
import { useLine } from "@/contexts/LineContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, doc, updateDoc, DocumentData, runTransaction } from "firebase/firestore";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowRightLeft, MapPin, Hash, Check } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

const ShiftAccounts = () => {
  const { userData } = useAuth();
  const { selectedLineId, lines } = useLine();
  const { t } = useLanguage();
  const [accounts, setAccounts] = useState<DocumentData[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<DocumentData | null>(null);
  const [newLineId, setNewLineId] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"territory" | "number">("territory");

  // State for Account Number Transfer
  const [sourceAccountId, setSourceAccountId] = useState("");
  const [targetAccountId, setTargetAccountId] = useState("");
  const [transferring, setTransferring] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      if (!userData) return;
      if (!selectedLineId) {
        setAccounts([]);
        setLoading(false);
        return;
      }

      let accQ = query(collection(db, "accounts"), where("lineId", "==", selectedLineId));
      
      if (userData.role === "admin") {
        accQ = query(accQ, where("adminId", "==", userData.uid));
      }

      const accSnap = await getDocs(accQ);
      const accList: DocumentData[] = []; 
      accSnap.forEach(d => accList.push({ id: d.id, ...(d.data() as Record<string, any>) }));
      
      accList.sort((a, b) => {
        // Sort active first, then sort alphabetically/numerically
        if (a.status === "deleted" && b.status !== "deleted") return 1;
        if (a.status !== "deleted" && b.status === "deleted") return -1;
        return (a.accountNo || "").localeCompare(b.accountNo || "");
      });
      setAccounts(accList);
      setLoading(false);
    };
    fetch();
  }, [userData, selectedLineId]);

  const handleShift = async () => {
    if (!selectedAccount || !newLineId) { toast.error("Select account and target line"); return; }
    try {
      await updateDoc(doc(db, "accounts", selectedAccount.id), { lineId: newLineId });
      toast.success(`Account ${selectedAccount.accountNo} shifted successfully`);
      setSelectedAccount(null);
      setNewLineId("");
      // Refresh
      const updated = accounts.map(a => a.id === selectedAccount.id ? { ...a, lineId: newLineId } : a);
      setAccounts(updated);
    } catch (err: any) { toast.error(err.message); }
  };

  const handleNumberTransfer = async () => {
    if (!sourceAccountId || !targetAccountId) {
      toast.error("Please select both source and target accounts");
      return;
    }

    const sourceAcc = accounts.find(a => a.id === sourceAccountId);
    const targetAcc = accounts.find(a => a.id === targetAccountId);

    if (!sourceAcc || !targetAcc) {
      toast.error("Selected accounts not found");
      return;
    }

    const confirmMsg = `Are you sure you want to transfer/swap account number of active account "${sourceAcc.name}" (#${sourceAcc.accountNo}) to deleted account number #${targetAcc.accountNo}? All transaction history for both accounts will be properly synchronized under the new numbers.`;
    if (!window.confirm(confirmMsg)) return;

    setTransferring(true);
    try {
      const timestamp = Date.now();
      const originalTargetNo = targetAcc.accountNo;
      const originalSourceNo = sourceAcc.accountNo;
      const newTargetNo = `${originalTargetNo}_deleted_${timestamp}`;
      const newSourceNo = originalTargetNo; // e.g. "3"

      await runTransaction(db, async (transaction) => {
        const sourceDocRef = doc(db, "accounts", sourceAcc.id);
        const targetDocRef = doc(db, "accounts", targetAcc.id);

        // 1. Update source and target account numbers in Firestore
        transaction.update(sourceDocRef, { accountNo: newSourceNo });
        transaction.update(targetDocRef, { accountNo: newTargetNo });
      });

      // 2. Query and update all postings of target account to newTargetNo
      const postingsRef = collection(db, "postings");
      const targetPostSnap = await getDocs(query(postingsRef, where("accountId", "==", targetAcc.id)));
      for (const d of targetPostSnap.docs) {
        await updateDoc(doc(db, "postings", d.id), { accountNo: newTargetNo });
      }

      // 3. Query and update all postings of source account to newSourceNo
      const sourcePostSnap = await getDocs(query(postingsRef, where("accountId", "==", sourceAcc.id)));
      for (const d of sourcePostSnap.docs) {
        await updateDoc(doc(db, "postings", d.id), { accountNo: newSourceNo });
      }

      toast.success(`Successfully shifted account #${originalSourceNo} to deleted number #${originalTargetNo} for ${sourceAcc.name}`);
      
      // Reset State
      setSourceAccountId("");
      setTargetAccountId("");

      // Reload
      window.location.reload();
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to transfer account number: " + err.message);
    } finally {
      setTransferring(false);
    }
  };

  // Filter accounts lists
  const activeAccounts = accounts.filter(a => a.status !== "deleted");
  const deletedAccounts = accounts.filter(a => a.status === "deleted");

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-slide-up pb-10">
      <div>
        <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter">Shift Accounts</h1>
        <p className="text-muted-foreground font-medium">Reassign territories or reallocate account number blocks</p>
      </div>

      {/* Tabs Selector */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 mb-6">
        <button 
          onClick={() => setActiveTab("territory")}
          className={`pb-3 px-4 font-black uppercase text-xs tracking-widest transition-all ${activeTab === "territory" ? "border-b-2 border-accent text-accent" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"}`}
        >
          Reassign Territory
        </button>
        <button 
          onClick={() => setActiveTab("number")}
          className={`pb-3 px-4 font-black uppercase text-xs tracking-widest transition-all ${activeTab === "number" ? "border-b-2 border-accent text-accent" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"}`}
        >
          Transfer Account Number
        </button>
      </div>

      {activeTab === "territory" ? (
        <Card className="glass-card shadow-2xl border-none">
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50/50 dark:bg-slate-900/50 text-[10px] uppercase font-black tracking-widest text-slate-400 border-b border-slate-100 dark:border-slate-850">
                <tr>
                  <th className="p-4 rounded-tl-xl">Acc No</th>
                  <th className="p-4">Name</th>
                  <th className="p-4">Current Territory</th>
                  <th className="p-4 text-right">Balance</th>
                  <th className="p-4 text-center rounded-tr-xl">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40">
                {loading ? (
                  <tr><td colSpan={5} className="text-center py-8 text-muted-foreground animate-pulse text-xs tracking-widest font-bold uppercase">Loading...</td></tr>
                ) : activeAccounts.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-8 text-muted-foreground text-xs uppercase font-bold tracking-widest">No active accounts found</td></tr>
                ) : activeAccounts.map(a => (
                  <tr key={a.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="p-4 text-xs font-black text-slate-900 dark:text-white">{a.accountNo}</td>
                    <td className="p-4 text-sm font-bold text-slate-700 dark:text-slate-300">
                      {a.name} {a.nameTelugu && <span className="text-[10px] text-slate-500 font-telugu">({a.nameTelugu})</span>}
                    </td>
                    <td className="p-4 text-xs font-bold text-slate-500">
                       <span className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-accent animate-pulse"></span>
                          {lines.find(l => l.id === a.lineId)?.name || a.lineId || "Unassigned"}
                       </span>
                    </td>
                    <td className="p-4 text-right text-sm font-black text-rose-500">
                      {a.balance > 0 ? `₹${(a.balance || 0).toLocaleString("en-IN")}` : "Cleared"}
                    </td>
                    <td className="p-4 text-center">
                      <Button variant="ghost" size="sm" onClick={() => setSelectedAccount(a)} className="h-8 w-8 p-0 text-slate-400 hover:text-accent hover:bg-accent/10">
                        <ArrowRightLeft className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : (
        <Card className="glass-card shadow-2xl border-none p-8 max-w-2xl">
          <CardContent className="space-y-6 p-0">
            <div className="space-y-2">
              <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tighter italic">Reallocate Account Numbers</h3>
              <p className="text-xs text-slate-400 font-medium">Re-route an active account to a target soft-deleted account number. Swaps indices and maps existing transaction history cleanly.</p>
            </div>

            <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">1. Source Active Account</Label>
                <Select value={sourceAccountId} onValueChange={setSourceAccountId}>
                  <SelectTrigger className="h-12 finance-input bg-white dark:bg-slate-850 text-slate-900 dark:text-white">
                    <SelectValue placeholder="Select active member..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    {activeAccounts.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        #{a.accountNo} - {a.name} {a.nameTelugu ? `(${a.nameTelugu})` : ''} [Bal: ₹{a.balance}]
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">2. Target Deleted Number Block</Label>
                <Select value={targetAccountId} onValueChange={setTargetAccountId}>
                  <SelectTrigger className="h-12 finance-input bg-white dark:bg-slate-850 text-slate-900 dark:text-white">
                    <SelectValue placeholder="Select deleted number block..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    {deletedAccounts.map(a => {
                      const cleanNo = a.accountNo.split("_deleted")[0];
                      return (
                        <SelectItem key={a.id} value={a.id}>
                          #{cleanNo} - (Deleted) {a.name} {a.nameTelugu ? `(${a.nameTelugu})` : ''}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="bg-amber-50 dark:bg-amber-950/20 rounded-xl p-4 border border-amber-100 dark:border-amber-950/40 mt-4">
                <p className="text-[10px] text-amber-700 dark:text-amber-400 font-black uppercase tracking-widest flex items-center gap-2">
                  System Re-indexing Protocol
                </p>
                <p className="text-[11px] text-amber-600 dark:text-amber-500 font-medium leading-relaxed mt-1">
                  Swapping handles full transaction history reconciliation. The source account will assume the target number. The target account will be re-indexed as a backup identifier.
                </p>
              </div>

              <Button 
                onClick={handleNumberTransfer} 
                disabled={transferring || !sourceAccountId || !targetAccountId}
                className="w-full h-12 bg-accent text-accent-foreground font-black text-md hover:opacity-90 mt-4 shadow-xl border-none transition-all"
              >
                {transferring ? "Re-indexing Account Logs..." : "Execute Reallocation Swaps"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Territory Reassignment Dialog */}
      <Dialog open={!!selectedAccount} onOpenChange={() => setSelectedAccount(null)}>
        <DialogContent className="glass-card shadow-2xl border-none text-slate-900 dark:text-white">
          <DialogHeader>
             <DialogTitle className="text-2xl font-black text-slate-900 dark:text-white">Shift Account</DialogTitle>
             <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Operational Reassignment</p>
          </DialogHeader>
          <div className="space-y-6 pt-4">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 flex justify-between items-center">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Target Account</p>
                  <p className="text-lg font-black text-slate-900 dark:text-white">{selectedAccount?.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Acc No</p>
                  <p className="text-sm font-black text-accent">{selectedAccount?.accountNo}</p>
                </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest">Target Operational Line</Label>
              <Select value={newLineId} onValueChange={setNewLineId}>
                <SelectTrigger className="h-12 finance-input bg-white dark:bg-slate-850 text-slate-900 dark:text-white"><SelectValue placeholder="Select target territory..." /></SelectTrigger>
                <SelectContent>
                   {lines.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <Button onClick={handleShift} className="w-full h-12 bg-accent text-accent-foreground font-black text-lg hover:opacity-90 shadow-xl border-none transition-all">
              Commit Shift
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ShiftAccounts;
