import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, DocumentData } from "firebase/firestore";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { toast } from "sonner";

const DailyData = () => {
  const { userData } = useAuth();
  const [postings, setPostings] = useState<DocumentData[]>([]);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      if (!userData) return;
      setLoading(true);
      let q;
      if (userData.role === "super_admin") q = query(collection(db, "postings"), where("date", "==", date));
      else if (userData.role === "admin") q = query(collection(db, "postings"), where("adminId", "==", userData.uid), where("date", "==", date));
      else q = query(collection(db, "postings"), where("agentId", "==", userData.uid), where("date", "==", date));
      try {
        const snap = await getDocs(q);
        const list: DocumentData[] = [];
        snap.forEach(d => list.push({ id: d.id, ...(d.data() as Record<string, any>) }));
        setPostings(list);
      } catch { setPostings([]); }
      setLoading(false);
    };
    fetch();
  }, [userData, date]);

  const totalAmount = postings.reduce((s, p) => s + (p.amount || 0), 0);

  const exportCSV = () => {
    if (postings.length === 0) { toast.error("No data"); return; }
    const headers = "Acc No,Name,Amount,Status,Mode,Date\n";
    const rows = postings.map(p => `${p.accountNo},${p.memberName},${p.amount},${p.status},${p.payMode},${p.date}`).join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `daily_data_${date}.csv`; a.click();
    toast.success("Exported!");
  };

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Daily Data</h1>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="space-y-1"><Label>Date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-48" /></div>
        <div className="flex items-end"><Button onClick={exportCSV} variant="outline"><Download className="mr-2 h-4 w-4" />Export</Button></div>
        <div className="pt-6 text-sm font-medium">Total: ₹{totalAmount.toLocaleString("en-IN")} ({postings.length} entries)</div>
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="finance-table w-full">
            <thead><tr><th className="p-3">S.No</th><th className="p-3">Acc No</th><th className="p-3">Name</th><th className="p-3">Amount</th><th className="p-3">Status</th><th className="p-3">Mode</th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</td></tr>
              ) : postings.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No postings for this date</td></tr>
              ) : postings.map((p, i) => (
                <tr key={p.id}><td>{i + 1}</td><td className="font-mono">{p.accountNo}</td><td>{p.memberName}</td><td>₹{(p.amount || 0).toLocaleString("en-IN")}</td><td className="capitalize">{p.status}</td><td className="capitalize">{p.payMode}</td></tr>
              ))}
              {postings.length > 0 && (
                <tr className="font-bold bg-muted"><td colSpan={3} className="text-right p-3">Total:</td><td className="p-3">₹{totalAmount.toLocaleString("en-IN")}</td><td colSpan={2}></td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
};

export default DailyData;
