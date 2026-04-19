import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, DocumentData } from "firebase/firestore";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Smartphone } from "lucide-react";
import { toast } from "sonner";

const MobileExport = () => {
  const { userData } = useAuth();
  const [accounts, setAccounts] = useState<DocumentData[]>([]);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      if (!userData) return;
      let q;
      if (userData.role === "super_admin") q = query(collection(db, "accounts"));
      else if (userData.role === "admin") q = query(collection(db, "accounts"), where("adminId", "==", userData.uid));
      else q = query(collection(db, "accounts"), where("agentId", "==", userData.uid));
      const snap = await getDocs(q);
      const list: DocumentData[] = [];
      snap.forEach(d => list.push({ id: d.id, ...(d.data() as Record<string, any>) }));
      setAccounts(list);
      setLoading(false);
    };
    fetch();
  }, [userData]);

  const exportCSV = () => {
    if (accounts.length === 0) { toast.error("No data to export"); return; }
    const headers = "Account No,Name,Phone,Village,Total,Paid,Balance,Status\n";
    const rows = accounts.map(a => `${a.accountNo},${a.name},${a.phone || ""},${a.village || ""},${a.totalAmount || 0},${a.paid || 0},${a.balance || 0},${a.status}`).join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `mobile_export_${date}.csv`;
    link.click();
    toast.success("CSV exported!");
  };

  const shareWhatsApp = () => {
    let text = `📱 SriDevi Finance - Account Summary (${date})\n\n`;
    accounts.slice(0, 20).forEach((a, i) => {
      text += `${i + 1}. ${a.name} (${a.accountNo})\n   Total: ₹${a.totalAmount || 0} | Paid: ₹${a.paid || 0} | Balance: ₹${a.balance || 0}\n\n`;
    });
    if (accounts.length > 20) text += `... and ${accounts.length - 20} more accounts`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Mobile Export</h1>
      <div className="mb-4 flex flex-wrap gap-4">
        <div className="space-y-1"><Label>Date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-48" /></div>
        <div className="flex items-end gap-2">
          <Button onClick={exportCSV} className="bg-accent text-accent-foreground hover:bg-accent/90">Export CSV</Button>
          <Button onClick={shareWhatsApp} variant="outline"><Smartphone className="mr-2 h-4 w-4" />WhatsApp</Button>
        </div>
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="finance-table w-full">
            <thead><tr><th className="p-3">S.No</th><th className="p-3">Acc No</th><th className="p-3">Name</th><th className="p-3">Phone</th><th className="p-3">Total</th><th className="p-3">Paid</th><th className="p-3">Balance</th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</td></tr>
              ) : accounts.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No accounts</td></tr>
              ) : accounts.map((a, i) => (
                <tr key={a.id}><td>{i + 1}</td><td className="font-mono">{a.accountNo}</td><td>{a.name}</td><td>{a.phone || "-"}</td><td>₹{(a.totalAmount || 0).toLocaleString("en-IN")}</td><td>₹{(a.paid || 0).toLocaleString("en-IN")}</td><td className="text-destructive">₹{(a.balance || 0).toLocaleString("en-IN")}</td></tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
};

export default MobileExport;
