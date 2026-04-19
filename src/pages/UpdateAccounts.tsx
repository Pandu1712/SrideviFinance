import { useAuth } from "@/contexts/AuthContext";
import { useLine } from "@/contexts/LineContext";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, doc, updateDoc, DocumentData } from "firebase/firestore";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Edit, MapPin } from "lucide-react";

const UpdateAccounts = () => {
  const { userData } = useAuth();
  const { lines, selectedLineId } = useLine();
  const [accounts, setAccounts] = useState<DocumentData[]>([]);
  const [search, setSearch] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<DocumentData | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [fetchingLocation, setFetchingLocation] = useState(false);

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported");
      return;
    }
    setFetchingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const url = `https://www.google.com/maps?q=${latitude},${longitude}`;
        setEditForm(prev => ({ ...prev, customerLocation: url }));
        toast.info("GPS Location Captured");
        setFetchingLocation(false);
      },
      () => {
        toast.error("GPS Access Denied");
        setFetchingLocation(false);
      }
    );
  };

  useEffect(() => {
    const fetch = async () => {
      if (!userData) return;
      let q;
      let accountsRef: any = collection(db, "accounts");
      if (userData.role === "super_admin") {
        q = selectedLineId ? query(accountsRef, where("lineId", "==", selectedLineId)) : query(accountsRef);
      } else if (userData.role === "admin") {
        q = query(accountsRef, where("adminId", "==", userData.uid));
        if (selectedLineId) q = query(q, where("lineId", "==", selectedLineId));
      } else {
        q = query(accountsRef, where("agentId", "==", userData.uid));
        if (selectedLineId) q = query(q, where("lineId", "==", selectedLineId));
      }
      const snap = await getDocs(q);
      const list: DocumentData[] = [];
      snap.forEach(d => list.push({ id: d.id, ...(d.data() as Record<string, any>) }));
      setAccounts(list);
      setLoading(false);
    };
    fetch();
  }, [userData, selectedLineId]);

  const openEdit = (acc: DocumentData) => {
    setSelectedAccount(acc);
    setEditForm({
      name: acc.name || "", phone: acc.phone || "", village: acc.village || "",
      occupation: acc.occupation || "", guarantorName: acc.guarantorName || "",
      guarantorPhone: acc.guarantorPhone || "", installmentAmount: String(acc.installmentAmount || ""),
      endDate: acc.endDate || "", commission: String(acc.commission || ""),
      customerLocation: acc.customerLocation || "",
      lineId: acc.lineId || "default",
    });
  };

  const handleUpdate = async () => {
    if (!selectedAccount) return;
    try {
      await updateDoc(doc(db, "accounts", selectedAccount.id), {
        ...editForm,
        installmentAmount: parseFloat(editForm.installmentAmount) || 0,
        commission: parseFloat(editForm.commission) || 0,
      });
      toast.success("Account updated!");
      setSelectedAccount(null);
      // Refresh
      setAccounts(prev => prev.map(a => a.id === selectedAccount.id ? { ...a, ...editForm } : a));
    } catch (err: any) { toast.error(err.message); }
  };

  const filtered = accounts.filter(a =>
    a.name?.toLowerCase().includes(search.toLowerCase()) ||
    a.accountNo?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Update Accounts</h1>
      <div className="mb-4"><Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" /></div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="finance-table w-full">
            <thead><tr><th className="p-3">Acc No</th><th className="p-3">Name</th><th className="p-3">Phone</th><th className="p-3">Village</th><th className="p-3">Total</th><th className="p-3">Balance</th><th className="p-3">Edit</th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No accounts</td></tr>
              ) : filtered.map(a => (
                <tr key={a.id}>
                  <td className="font-mono">{a.accountNo}</td><td>{a.name}</td><td>{a.phone || "-"}</td><td>{a.village || "-"}</td>
                  <td>₹{(a.totalAmount || 0).toLocaleString("en-IN")}</td><td className="text-destructive">₹{(a.balance || 0).toLocaleString("en-IN")}</td>
                  <td><Button variant="ghost" size="sm" onClick={() => openEdit(a)}><Edit className="h-4 w-4" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={!!selectedAccount} onOpenChange={() => setSelectedAccount(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Update Account: {selectedAccount?.accountNo}</DialogTitle></DialogHeader>
          <div className="grid gap-3 grid-cols-2">
            <div className="space-y-1"><Label>Name</Label><Input value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Phone</Label><Input value={editForm.phone} onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Village</Label><Input value={editForm.village} onChange={e => setEditForm(p => ({ ...p, village: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Occupation</Label><Input value={editForm.occupation} onChange={e => setEditForm(p => ({ ...p, occupation: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Guarantor Name</Label><Input value={editForm.guarantorName} onChange={e => setEditForm(p => ({ ...p, guarantorName: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Guarantor Phone</Label><Input value={editForm.guarantorPhone} onChange={e => setEditForm(p => ({ ...p, guarantorPhone: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Installment</Label><Input type="text" inputMode="decimal" value={editForm.installmentAmount} onChange={e => setEditForm(p => ({ ...p, installmentAmount: e.target.value }))} /></div>
            <div className="space-y-1"><Label>End Date</Label><Input type="date" value={editForm.endDate} onChange={e => setEditForm(p => ({ ...p, endDate: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Commission</Label><Input type="text" inputMode="decimal" value={editForm.commission} onChange={e => setEditForm(p => ({ ...p, commission: e.target.value }))} /></div>
            <div className="space-y-1 col-span-2">
              <div className="flex items-center justify-between mb-1">
                <Label>Location / Maps Link</Label>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="h-6 text-[9px] uppercase font-black bg-accent text-white border-none"
                  onClick={handleGetLocation}
                  disabled={fetchingLocation}
                >
                  {fetchingLocation ? "..." : "Fetch GPS"}
                </Button>
              </div>
              <Input value={editForm.customerLocation} onChange={e => setEditForm(p => ({ ...p, customerLocation: e.target.value }))} />
            </div>
            <div className="space-y-1 col-span-2">
              <Label>Operative Line</Label>
              <Select value={editForm.lineId} onValueChange={v => setEditForm(p => ({ ...p, lineId: v }))}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Select Line" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Full/Default</SelectItem>
                  {lines.map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={handleUpdate} className="w-full mt-2 bg-accent text-accent-foreground">Update Account</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UpdateAccounts;
