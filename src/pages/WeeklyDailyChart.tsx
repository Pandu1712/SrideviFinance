import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, DocumentData } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";

const WeeklyDailyChart = () => {
  const { userData } = useAuth();
  const [postings, setPostings] = useState<DocumentData[]>([]);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(new Date().toISOString().split("T")[0]);

  useEffect(() => {
    const fetch = async () => {
      if (!userData) return;
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
    };
    fetch();
  }, [userData, startDate, endDate]);

  const byDate: Record<string, number> = {};
  postings.forEach(p => { byDate[p.date] = (byDate[p.date] || 0) + (p.amount || 0); });
  const chartData = Object.entries(byDate).sort().map(([date, amount]) => ({ date, amount }));

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Weekly/Daily Chart</h1>
      <div className="mb-4 flex flex-wrap gap-4">
        <div className="space-y-1"><Label>From</Label><Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-48" /></div>
        <div className="space-y-1"><Label>To</Label><Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-48" /></div>
      </div>
      <Tabs defaultValue="bar">
        <TabsList><TabsTrigger value="bar">Bar Chart</TabsTrigger><TabsTrigger value="line">Line Chart</TabsTrigger></TabsList>
        <TabsContent value="bar">
          <Card><CardContent className="pt-6">
            {chartData.length === 0 ? <div className="text-center py-8 text-muted-foreground">No data</div> : (
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis /><Tooltip formatter={(v: number) => `₹${v.toLocaleString("en-IN")}`} /><Bar dataKey="amount" fill="hsl(var(--accent))" radius={[4,4,0,0]} /></BarChart>
              </ResponsiveContainer>
            )}
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="line">
          <Card><CardContent className="pt-6">
            {chartData.length === 0 ? <div className="text-center py-8 text-muted-foreground">No data</div> : (
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis /><Tooltip formatter={(v: number) => `₹${v.toLocaleString("en-IN")}`} /><Line type="monotone" dataKey="amount" stroke="hsl(var(--primary))" strokeWidth={2} /></LineChart>
              </ResponsiveContainer>
            )}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default WeeklyDailyChart;
