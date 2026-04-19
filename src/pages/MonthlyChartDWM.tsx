import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, DocumentData } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const MonthlyChartDWM = () => {
  const { userData } = useAuth();
  const [chartData, setChartData] = useState<{ date: string; amount: number }[]>([]);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      if (!userData) return;
      setLoading(true);
      const [year, mon] = month.split("-").map(Number);
      const startDate = `${month}-01`;
      const endDate = `${month}-${new Date(year, mon, 0).getDate()}`;

      let q;
      if (userData.role === "super_admin") q = query(collection(db, "postings"), where("date", ">=", startDate), where("date", "<=", endDate));
      else if (userData.role === "admin") q = query(collection(db, "postings"), where("adminId", "==", userData.uid), where("date", ">=", startDate), where("date", "<=", endDate));
      else q = query(collection(db, "postings"), where("lineId", "==", userData.lineId || ""), where("date", ">=", startDate), where("date", "<=", endDate));

      try {
        const snap = await getDocs(q);
        const byDate: Record<string, number> = {};
        snap.forEach(d => {
          const data = d.data() as Record<string, any>;
          byDate[data.date] = (byDate[data.date] || 0) + (data.amount || 0);
        });
        const data = Object.entries(byDate).sort().map(([date, amount]) => ({ date: date.slice(8), amount }));
        setChartData(data);
      } catch { setChartData([]); }
      setLoading(false);
    };
    fetch();
  }, [userData, month]);

  const totalCollection = chartData.reduce((s, d) => s + d.amount, 0);

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Monthly Chart DWM</h1>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="space-y-1"><Label>Month</Label><Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="w-48" /></div>
        <div className="pt-6 text-sm font-medium">Total: ₹{totalCollection.toLocaleString("en-IN")}</div>
      </div>
      <Card>
        <CardHeader><CardTitle>Daily Collection Chart</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : chartData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No data for this month</div>
          ) : (
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip formatter={(val: number) => `₹${val.toLocaleString("en-IN")}`} />
                <Bar dataKey="amount" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MonthlyChartDWM;
