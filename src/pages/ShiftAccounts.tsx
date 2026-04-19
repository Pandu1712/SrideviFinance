import { useAuth } from "@/contexts/AuthContext";
import { useLine } from "@/contexts/LineContext";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, doc, updateDoc, DocumentData } from "firebase/firestore";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowRightLeft } from "lucide-react";

const ShiftAccounts = () => {
  const { userData } = useAuth();
  const { lines } = useLine();
  const [accounts, setAccounts] = useState<DocumentData[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<DocumentData | null>(null);
  const [newLineId, setNewLineId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      if (!userData) return;
      let accQ;
      if (userData.role === "super_admin") {
        accQ = query(collection(db, "accounts"));
      } else {
        accQ = query(collection(db, "accounts"), where("adminId", "==", userData.uid));
      }
      const accSnap = await getDocs(accQ);
      const accList: DocumentData[] = []; 
      accSnap.forEach(d => accList.push({ id: d.id, ...(d.data() as Record<string, any>) }));
      
      // Sort alphabetically by name
      accList.sort((a,b) => (a.name || "").localeCompare(b.name || ""));
      setAccounts(accList);
      setLoading(false);
    };
    fetch();
  }, [userData]);

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

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-slide-up">
      <div>
        <h1 className="text-3xl font-black text-primary tracking-tighter">Shift Accounts</h1>
        <p className="text-muted-foreground font-medium">Reassign accounts to a different operational territory</p>
      </div>

      <Card className="glass-card shadow-2xl border-none">
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50/50 text-[10px] uppercase font-black tracking-widest text-slate-400">
              <tr>
                <th className="p-4 rounded-tl-xl">Acc No</th>
                <th className="p-4">Name</th>
                <th className="p-4">Current Territory</th>
                <th className="p-4 text-right">Balance</th>
                <th className="p-4 text-center rounded-tr-xl">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground animate-pulse text-xs tracking-widest font-bold uppercase">Loading...</td></tr>
              ) : accounts.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground text-xs uppercase font-bold tracking-widest">No accounts found</td></tr>
              ) : accounts.map(a => (
                <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 text-xs font-black text-primary">{a.accountNo}</td>
                  <td className="p-4 text-sm font-bold text-slate-700">{a.name}</td>
                  <td className="p-4 text-xs font-bold text-slate-500">
                     <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-accent"></span>
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

      <Dialog open={!!selectedAccount} onOpenChange={() => setSelectedAccount(null)}>
        <DialogContent className="glass-card shadow-2xl border-none">
          <DialogHeader>
             <DialogTitle className="text-2xl font-black text-primary">Shift Account</DialogTitle>
             <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Operational Reassignment</p>
          </DialogHeader>
          <div className="space-y-6 pt-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex justify-between items-center">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Target Account</p>
                  <p className="text-lg font-black text-primary">{selectedAccount?.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Acc No</p>
                  <p className="text-sm font-black text-accent">{selectedAccount?.accountNo}</p>
                </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-600 uppercase tracking-widest">Target Operational Line</Label>
              <Select value={newLineId} onValueChange={setNewLineId}>
                <SelectTrigger className="h-12 finance-input bg-white"><SelectValue placeholder="Select target territory..." /></SelectTrigger>
                <SelectContent>
                   {lines.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <Button onClick={handleShift} className="w-full h-12 bg-accent text-accent-foreground font-black text-lg hover:bg-slate-900 shadow-xl border-none transition-all">
              Commit Shift
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ShiftAccounts;
