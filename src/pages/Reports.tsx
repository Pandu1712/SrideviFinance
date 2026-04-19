import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLine } from "@/contexts/LineContext";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, Timestamp, orderBy } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { formatCurrency, formatDate } from "@/lib/utils";
import { motion } from "framer-motion";
import { FileText, TrendingUp, PieChart as PieIcon, Users, Calendar, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const COLORS = ["#0F172A", "#D4AF37", "#64748B", "#F59E0B", "#10B981"];

const Reports = () => {
  const { userData } = useAuth();
  const { selectedLineId } = useLine();
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    cash: 0,
    online: 0,
    byAgent: {} as Record<string, number>,
  });

  const fetchReportData = async (selectedDate: string) => {
    setLoading(true);
    try {
      let q;
      if (userData?.role === "super_admin") {
        q = query(collection(db, "postings"), where("date", "==", selectedDate));
      } else if (userData?.role === "admin") {
        q = query(collection(db, "postings"), where("date", "==", selectedDate), where("adminId", "==", userData.uid));
      } else {
        q = query(collection(db, "postings"), where("date", "==", selectedDate), where("lineId", "==", userData.lineId || ""));
      }

      if (selectedLineId) {
        q = query(q, where("lineId", "==", selectedLineId));
      }
      const snap = await getDocs(q);
      const docs = snap.docs.map(d => d.data());
      setData(docs);

      let total = 0;
      let cash = 0;
      let online = 0;
      const byAgent: Record<string, number> = {};

      docs.forEach((item: any) => {
        const amt = item.amount || 0;
        total += amt;
        if (item.payMode === "cash") cash += amt;
        else online += amt;

        const agent = item.memberName || "Unknown"; // Fallback to member name if agent name missing in posting
        byAgent[agent] = (byAgent[agent] || 0) + amt;
      });

      setStats({ total, cash, online, byAgent });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReportData(date);
  }, [date, selectedLineId]);

  const pieData = [
    { name: "Cash", value: stats.cash },
    { name: "Online", value: stats.online },
  ].filter(d => d.value > 0);

  const barData = Object.entries(stats.byAgent).map(([name, value]) => ({ name, value }));

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-premium-gradient flex items-center justify-center shadow-lg">
            <TrendingUp className="text-white h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-primary">Financial Reports</h1>
            <p className="text-muted-foreground">Deep dive into collection trends and performance metrics.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              type="date" 
              value={date} 
              onChange={(e) => setDate(e.target.value)} 
              className="pl-9 h-10 w-40 glass-card"
            />
          </div>
          <Button 
            variant="outline" 
            className="gap-2 bg-white/50 backdrop-blur-sm"
            onClick={() => {
              if (data.length === 0) return;
              const headers = ["Member", "Account", "Amount", "Mode", "Status"];
              const rows = data.map(item => [item.memberName, item.accountNo, item.amount, item.payMode, item.status]);
              const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
              const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = `Report_${date}.csv`;
              link.click();
              toast.success("Report exported as CSV");
            }}
          >
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="glass-card shadow-sm border-none bg-primary text-white">
          <CardHeader className="pb-2">
            <p className="text-xs font-medium text-primary-foreground opacity-70 uppercase tracking-widest">Total Collection</p>
            <CardTitle className="text-3xl font-black">{formatCurrency(stats.total)}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-xs text-primary-foreground opacity-80">
              <span className="flex items-center gap-1 font-bold"><TrendingUp className="h-3 w-3" /> Live Update</span>
              <span>for {formatDate(date)}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card shadow-sm border-none">
          <CardHeader className="pb-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Cash Collections</p>
            <CardTitle className="text-3xl font-black text-emerald-600">{formatCurrency(stats.cash)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{((stats.cash / (stats.total || 1)) * 100).toFixed(1)}% of total</p>
          </CardContent>
        </Card>

        <Card className="glass-card shadow-sm border-none">
          <CardHeader className="pb-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Online / UPI</p>
            <CardTitle className="text-3xl font-black text-accent">{formatCurrency(stats.online)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{((stats.online / (stats.total || 1)) * 100).toFixed(1)}% of total</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="bg-slate-100 p-1 rounded-xl">
          <TabsTrigger value="overview" className="rounded-lg px-6 py-2">Analytics Overview</TabsTrigger>
          <TabsTrigger value="details" className="rounded-lg px-6 py-2">Transaction Details</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="glass-card border-none shadow-sm">
              <CardHeader className="border-b border-slate-50">
                <CardTitle className="text-sm font-bold flex items-center gap-2 text-primary/70 uppercase tracking-widest">
                  <PieIcon className="h-4 w-4 text-accent" /> Mode Distribution
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[300px] flex items-center justify-center mt-4">
                {pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        innerRadius={80}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                      <Legend verticalAlign="bottom" height={36} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-muted-foreground italic">No data available for selected date</p>
                )}
              </CardContent>
            </Card>

            <Card className="glass-card border-none shadow-sm">
              <CardHeader className="border-b border-slate-50">
                <CardTitle className="text-sm font-bold flex items-center gap-2 text-primary/70 uppercase tracking-widest">
                  <Users className="h-4 w-4 text-accent" /> Member Performance
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[300px] mt-4">
                {barData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData}>
                      <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                      <Tooltip formatter={(value) => formatCurrency(Number(value))} cursor={{ fill: '#f8fafc' }} />
                      <Bar dataKey="value" fill="#0F172A" radius={[4, 4, 0, 0]} barSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-muted-foreground italic">No data available</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="details">
          <Card className="glass-card border-none shadow-sm overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-primary/70 uppercase tracking-widest">
                <FileText className="h-4 w-4" /> Transaction Registry
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                    <th className="p-4 text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Member</th>
                    <th className="p-4 text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Account</th>
                    <th className="p-4 text-[10px] uppercase tracking-widest font-bold text-muted-foreground text-right">Amount</th>
                    <th className="p-4 text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Mode</th>
                    <th className="p-4 text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Category</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {data.length === 0 ? (
                    <tr><td colSpan={5} className="p-12 text-center text-muted-foreground italic">No collection records found for this day</td></tr>
                  ) : data.map((item, i) => (
                    <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 text-sm font-semibold text-primary">{item.memberName}</td>
                      <td className="p-4 text-sm font-medium text-muted-foreground">{item.accountNo}</td>
                      <td className="p-4 text-sm font-black text-right text-emerald-600">{formatCurrency(item.amount)}</td>
                      <td className="p-4">
                        <span className="text-[10px] font-bold uppercase py-1 px-2 rounded-md bg-slate-100 text-slate-600">{item.payMode}</span>
                      </td>
                      <td className="p-4">
                        <span className={`text-[10px] font-bold uppercase py-1 px-2 rounded-md ${item.status === 'penalty' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                          {item.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
};

export default Reports;
