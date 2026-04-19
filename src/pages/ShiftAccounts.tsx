import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, doc, updateDoc, DocumentData } from "firebase/firestore";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowRightLeft } from "lucide-react";

const ShiftAccounts = () => {
  const { userData } = useAuth();
  const [accounts, setAccounts] = useState<DocumentData[]>([]);
  const [agents, setAgents] = useState<{ uid: string; name: string }[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<DocumentData | null>(null);
  const [newAgentId, setNewAgentId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      if (!userData) return;
      let accQ, agentQ;
      if (userData.role === "super_admin") {
        accQ = query(collection(db, "accounts"));
        agentQ = query(collection(db, "users"), where("role", "==", "agent"));
      } else {
        accQ = query(collection(db, "accounts"), where("adminId", "==", userData.uid));
        agentQ = query(collection(db, "users"), where("role", "==", "agent"), where("adminId", "==", userData.uid));
      }
      const [accSnap, agentSnap] = await Promise.all([getDocs(accQ), getDocs(agentQ)]);
      const accList: DocumentData[] = []; accSnap.forEach(d => accList.push({ id: d.id, ...(d.data() as Record<string, any>) }));
      setAccounts(accList);
      setAgents(agentSnap.docs.map(d => ({ uid: d.id, name: (d.data() as Record<string, any>).name })));
      setLoading(false);
    };
    fetch();
  }, [userData]);

  const handleShift = async () => {
    if (!selectedAccount || !newAgentId) { toast.error("Select account and agent"); return; }
    try {
      await updateDoc(doc(db, "accounts", selectedAccount.id), { agentId: newAgentId });
      toast.success(`Account ${selectedAccount.accountNo} shifted successfully`);
      setSelectedAccount(null);
      setNewAgentId("");
      // Refresh
      const updated = accounts.map(a => a.id === selectedAccount.id ? { ...a, agentId: newAgentId } : a);
      setAccounts(updated);
    } catch (err: any) { toast.error(err.message); }
  };

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Shift to Accounts</h1>
      <p className="mb-4 text-muted-foreground">Transfer accounts between agents</p>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="finance-table w-full">
            <thead><tr><th className="p-3">Acc No</th><th className="p-3">Name</th><th className="p-3">Current Agent</th><th className="p-3">Balance</th><th className="p-3">Action</th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">Loading...</td></tr>
              ) : accounts.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">No accounts</td></tr>
              ) : accounts.map(a => (
                <tr key={a.id}>
                  <td className="font-mono">{a.accountNo}</td>
                  <td>{a.name}</td>
                  <td>{agents.find(ag => ag.uid === a.agentId)?.name || a.agentId || "Unassigned"}</td>
                  <td>₹{(a.balance || 0).toLocaleString("en-IN")}</td>
                  <td><Button variant="ghost" size="sm" onClick={() => setSelectedAccount(a)}><ArrowRightLeft className="h-4 w-4" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={!!selectedAccount} onOpenChange={() => setSelectedAccount(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Shift Account: {selectedAccount?.accountNo}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm">Account: <strong>{selectedAccount?.name}</strong></p>
            <div className="space-y-1">
              <Label>New Agent</Label>
              <Select value={newAgentId} onValueChange={setNewAgentId}>
                <SelectTrigger><SelectValue placeholder="Select agent" /></SelectTrigger>
                <SelectContent>{agents.map(a => <SelectItem key={a.uid} value={a.uid}>{a.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button onClick={handleShift} className="w-full bg-accent text-accent-foreground">Shift Account</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ShiftAccounts;
