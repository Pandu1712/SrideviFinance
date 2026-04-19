import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, DocumentData } from "firebase/firestore";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const WeeklyBook = () => {
  const { userData } = useAuth();
  const [postings, setPostings] = useState<DocumentData[]>([]);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      if (!userData) return;
      setLoading(true);
      let q;
      if (userData.role === "super_admin") q = query(collection(db, "postings"), where("date", ">=", startDate), where("date", "<=", endDate));
      else if (userData.role === "admin") q = query(collection(db, "postings"), where("adminId", "==", userData.uid), where("date", ">=", startDate), where("date", "<=", endDate));
      else q = query(collection(db, "postings"), where("agentId", "==", userData.uid), where("date", ">=", startDate), where("date", "<=", endDate));
      try {
        const snap = await getDocs(q);
        const list: DocumentData[] = [];
        snap.forEach(d => list.push({ id: d.id, ...(d.data() as Record<string, any>) }));
        setPostings(list);
      } catch { setPostings([]); }
      setLoading(false);
    };
    fetch();
  }, [userData, startDate, endDate]);

  const totalAmount = postings.reduce((sum, p) => sum + (p.amount || 0), 0);

  // Group by date
  const grouped = postings.reduce((acc, p) => {
    const date = p.date || "Unknown";
    if (!acc[date]) acc[date] = [];
    acc[date].push(p);
    return acc;
  }, {} as Record<string, DocumentData[]>);

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Weekly Book (Ledger)</h1>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="space-y-1"><Label>From</Label><Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-48" /></div>
        <div className="space-y-1"><Label>To</Label><Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-48" /></div>
        <div className="space-y-1 pt-6"><span className="text-sm font-medium">Total: ₹{totalAmount.toLocaleString("en-IN")}</span></div>
      </div>
      {Object.entries(grouped).sort().map(([date, items]) => (
        <Card key={date} className="mb-4">
          <CardContent className="p-0 overflow-x-auto">
            <div className="bg-muted px-4 py-2 font-semibold text-sm">{date} — {items.length} entries — ₹{items.reduce((s, p) => s + (p.amount || 0), 0).toLocaleString("en-IN")}</div>
            <table className="finance-table w-full">
              <thead><tr><th className="p-3">Acc No</th><th className="p-3">Name</th><th className="p-3">Amount</th><th className="p-3">Status</th><th className="p-3">Mode</th></tr></thead>
              <tbody>
                {items.map((p, i) => (
                  <tr key={p.id}><td className="font-mono">{p.accountNo}</td><td>{p.memberName}</td><td>₹{(p.amount || 0).toLocaleString("en-IN")}</td><td className="capitalize">{p.status}</td><td className="capitalize">{p.payMode}</td></tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ))}
      {!loading && postings.length === 0 && <Card><CardContent className="p-8 text-center text-muted-foreground">No postings found for this period</CardContent></Card>}
    </div>
  );
};

export default WeeklyBook;
