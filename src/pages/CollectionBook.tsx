import { useAuth } from "@/contexts/AuthContext";
import { useLine } from "@/contexts/LineContext";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, DocumentData } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { BookOpen, Calendar, Filter, FileSpreadsheet, Printer, Search, IndianRupee, MapPin } from "lucide-react";
import { motion } from "framer-motion";
import { exportToExcel } from "@/lib/excel";
import { toast } from "sonner";

const CollectionBook = () => {
  const { userData } = useAuth();
  const { selectedLineId } = useLine();
  const [accounts, setAccounts] = useState<DocumentData[]>([]);
  const [postings, setPostings] = useState<DocumentData[]>([]);
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth() + 1); // 1-indexed
  const [selectedFrequency, setSelectedFrequency] = useState("all"); // all, daily, weekly, monthly
  const [villageFilter, setVillageFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const months = [
    { label: "January", value: 1 },
    { label: "February", value: 2 },
    { label: "March", value: 3 },
    { label: "April", value: 4 },
    { label: "May", value: 5 },
    { label: "June", value: 6 },
    { label: "July", value: 7 },
    { label: "August", value: 8 },
    { label: "September", value: 9 },
    { label: "October", value: 10 },
    { label: "November", value: 11 },
    { label: "December", value: 12 },
  ];

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => currentYear - 4 + i); // 4 years back, 1 year forward

  const monthStr = String(selectedMonth).padStart(2, "0");
  const startDate = `${selectedYear}-${monthStr}-01`;
  const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
  const endDate = `${selectedYear}-${monthStr}-${String(daysInMonth).padStart(2, "0")}`;

  useEffect(() => {
    const fetchData = async () => {
      if (!userData) return;
      setLoading(true);
      setError(null);
      
      let accQ, postQ;
      
      if (selectedLineId) {
        accQ = query(collection(db, "accounts"), where("lineId", "==", selectedLineId));
        postQ = query(collection(db, "postings"), where("date", ">=", startDate), where("date", "<=", endDate));
      } else {
        setAccounts([]);
        setPostings([]);
        setLoading(false);
        return;
      }

      try {
        const accSnap = await getDocs(accQ);
        const accList: DocumentData[] = [];
        accSnap.forEach(d => {
          const data = d.data();
          if (data.status !== "deleted") {
            accList.push({ id: d.id, ...data });
          }
        });
        setAccounts(accList);
      } catch (err: any) {
        console.error("Error fetching accounts:", err);
        setError("Accounts fetch failed: " + (err.message || String(err)));
        setAccounts([]);
      }

      try {
        const postSnap = await getDocs(postQ);
        const postList: DocumentData[] = [];
        postSnap.forEach(d => {
          const data = d.data();
          if (data.lineId === selectedLineId && data.status === "collection") {
            postList.push({ id: d.id, ...data });
          }
        });
        setPostings(postList);
      } catch (err: any) {
        console.error("Error fetching postings:", err);
        setError(prev => prev ? prev + " | Postings fetch failed: " + (err.message || String(err)) : "Postings fetch failed: " + (err.message || String(err)));
        setPostings([]);
      }

      setLoading(false);
    };
    fetchData();
  }, [userData, selectedYear, selectedMonth, selectedLineId]);

  const filteredAccounts = accounts.filter(acc => {
    const matchesFreq = selectedFrequency === "all" || (acc.paymentFrequency || "daily") === selectedFrequency;
    const matchesVillage = villageFilter === "all" || acc.village === villageFilter;
    const matchesSearch = !searchQuery || 
      acc.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
      acc.nameTelugu?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      acc.accountNo?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFreq && matchesVillage && matchesSearch;
  });

  const uniqueVillages = [...new Set(accounts.filter(a => selectedFrequency === "all" || (a.paymentFrequency || "daily") === selectedFrequency).map(a => a.village).filter(Boolean))].sort();

  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const getPostingAmount = (accountNo: string, day: number) => {
    const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const matched = postings.filter(p => p.accountNo === accountNo && p.date === dateStr);
    return matched.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  };

  const getDayTotal = (day: number) => {
    const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const filteredAccNos = new Set(filteredAccounts.map(a => a.accountNo));
    const matched = postings.filter(p => filteredAccNos.has(p.accountNo) && p.date === dateStr);
    return matched.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  };

  const getAccountMonthTotal = (accountNo: string) => {
    const matched = postings.filter(p => p.accountNo === accountNo);
    return matched.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  };

  const grandMonthTotal = daysArray.reduce((sum, d) => sum + getDayTotal(d), 0);

  const handleExportExcel = () => {
    if (filteredAccounts.length === 0) {
      toast.error("No ledger data to export");
      return;
    }

    const data = filteredAccounts.map((acc, index) => {
      const row: Record<string, any> = {
        "Sl.No": index + 1,
        "Account No": acc.accountNo,
        "Member Name": acc.nameTelugu ? `${acc.name} (${acc.nameTelugu})` : acc.name,
        "Village": acc.village || "N/A",
      };
      
      daysArray.forEach(d => {
        const amt = getPostingAmount(acc.accountNo, d);
        row[`Day ${d}`] = amt > 0 ? amt : "--";
      });
      
      row["Total Paid"] = getAccountMonthTotal(acc.accountNo);
      return row;
    });

    const totalsRow: Record<string, any> = {
      "Sl.No": "TOTAL",
      "Account No": "",
      "Member Name": "",
      "Village": "",
    };
    daysArray.forEach(d => {
      totalsRow[`Day ${d}`] = getDayTotal(d);
    });
    totalsRow["Total Paid"] = grandMonthTotal;
    data.push(totalsRow);

    const monthName = months.find(m => m.value === selectedMonth)?.label || "Month";
    exportToExcel(data, `Collection_Book_${monthName}_${selectedYear}`, `Collection_Book`);
    toast.success("Collection Book exported as Excel");
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="space-y-6"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-accent-gradient flex items-center justify-center shadow-xl border border-accent/20">
            <BookOpen className="text-white h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-primary">Collection Book</h1>
            <p className="text-muted-foreground font-medium">Month-wise day-by-day subscriber payment ledger.</p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button 
            variant="outline" 
            className="h-11 gap-2 border-emerald-200 text-emerald-600 hover:bg-emerald-50 font-bold"
            onClick={handleExportExcel}
          >
            <FileSpreadsheet className="h-4 w-4" /> Export Excel
          </Button>
          <Button 
            onClick={() => window.print()} 
            className="h-11 gap-2 bg-slate-900 text-white font-bold hover:bg-slate-800"
          >
            <Printer className="h-4 w-4" /> Print Ledger
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100 font-bold text-xs flex flex-col gap-2">
          <div>{error}</div>
          <div className="text-[10px] text-slate-500 font-mono">
            Debug Info: selectedLineId="{selectedLineId}" | accountsCount={accounts.length} | postingsCount={postings.length}
          </div>
        </div>
      )}

      {accounts.length > 0 && filteredAccounts.length === 0 && (
        <div className="bg-amber-50 text-amber-900 p-4 rounded-xl border border-amber-200 text-xs font-mono">
          <p className="font-bold mb-1">Filter Diagnostic:</p>
          <pre>{JSON.stringify({
            selectedFrequency,
            villageFilter,
            searchQuery,
            firstAccount: {
              id: accounts[0].id,
              name: accounts[0].name,
              accountNo: accounts[0].accountNo,
              paymentFrequency: accounts[0].paymentFrequency,
              village: accounts[0].village,
              status: accounts[0].status
            },
            matchesFreq: (accounts[0].paymentFrequency || "daily") === selectedFrequency,
            matchesVillage: villageFilter === "all" || accounts[0].village === villageFilter,
            matchesSearch: !searchQuery || accounts[0].name?.toLowerCase().includes(searchQuery.toLowerCase())
          }, null, 2)}</pre>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-4 p-5 bg-white rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex items-center gap-2 text-slate-400 mb-2 w-full sm:w-auto sm:mb-0">
          <Filter size={16} />
          <span className="text-[10px] font-black uppercase tracking-widest">Telemetry Filters</span>
        </div>
        
        <div className="space-y-1">
          <Label className="text-[10px] font-bold uppercase text-slate-400 ml-1">Frequency Type</Label>
          <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200">
            {["all", "daily", "weekly", "monthly"].map(freq => (
              <button
                key={freq}
                onClick={() => setSelectedFrequency(freq)}
                className={`px-4 h-9 rounded-lg text-xs font-black uppercase transition-all ${
                  selectedFrequency === freq 
                    ? "bg-white text-primary shadow-sm" 
                    : "text-slate-500 hover:text-primary"
                }`}
              >
                {freq}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-[10px] font-bold uppercase text-slate-400 ml-1">Calendar Month</Label>
          <select 
            value={selectedMonth} 
            onChange={e => setSelectedMonth(Number(e.target.value))} 
            className="h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-accent w-40 animate-none"
          >
            {months.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <Label className="text-[10px] font-bold uppercase text-slate-400 ml-1">Select Year</Label>
          <select 
            value={selectedYear} 
            onChange={e => setSelectedYear(Number(e.target.value))} 
            className="h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-accent w-28 block"
          >
            {years.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <Label className="text-[10px] font-bold uppercase text-slate-400 ml-1">Village/Area</Label>
          <select 
            value={villageFilter} 
            onChange={e => setVillageFilter(e.target.value)} 
            className="h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-accent w-44"
          >
            <option value="all">All Territories</option>
            {uniqueVillages.map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1 flex-1 min-w-[200px]">
          <Label className="text-[10px] font-bold uppercase text-slate-400 ml-1">Search Subscriber</Label>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Search by ID or Name..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 h-10 border-slate-200 rounded-xl focus-visible:ring-accent"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
        <Card className="glass-card border-none shadow-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Filtered Accounts</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-black text-slate-900">
              {filteredAccounts.length}
              <span className="text-xs text-slate-400 font-bold ml-1">/ {accounts.length} total</span>
            </p>
            <p className="text-[10px] text-slate-500 font-semibold mt-1">Operating in selected range</p>
          </CardContent>
        </Card>
        <Card className="glass-card border-none shadow-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Monthly Collection</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-black text-emerald-600">₹{grandMonthTotal.toLocaleString("en-IN")}</p>
            <p className="text-[10px] text-slate-500 font-semibold mt-1">Accumulated month total</p>
          </CardContent>
        </Card>
        <Card className="glass-card border-none shadow-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Active Territory</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-black text-indigo-600 truncate">{villageFilter === "all" ? "Global Territory" : villageFilter}</p>
            <p className="text-[10px] text-slate-500 font-semibold mt-1 flex items-center gap-1"><MapPin size={10} /> Village scope filter</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-none shadow-2xl overflow-hidden rounded-2xl">
        <CardContent className="p-0">
          <div className="relative overflow-x-auto max-w-full border-none">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs font-black uppercase border-b border-slate-200 dark:border-slate-800">
                  <th className="sticky left-0 bg-slate-100 dark:bg-slate-900 z-30 min-w-[150px] max-w-[150px] p-3 border-r border-slate-200 dark:border-slate-800 shadow-[3px_0_5px_rgba(0,0,0,0.05)] text-left pl-4">S.No / Date</th>
                  {daysArray.map(d => (
                    <th key={d} className="p-3 text-center min-w-[65px] border-r border-slate-200 dark:border-slate-800">
                      {String(d).padStart(2, "0")}-{String(selectedMonth).padStart(2, "0")}
                    </th>
                  ))}
                  <th className="p-3 text-right pr-6 min-w-[110px] bg-slate-100 dark:bg-slate-900">Month Total</th>
                </tr>
                <tr className="bg-indigo-50/70 dark:bg-indigo-950/20 text-indigo-900 dark:text-indigo-300 text-xs font-black border-b border-indigo-100 dark:border-indigo-900/60">
                  <td className="sticky left-0 bg-indigo-50/90 dark:bg-indigo-950/40 z-25 p-3 border-r border-indigo-100 dark:border-indigo-900/60 shadow-[3px_0_5px_rgba(0,0,0,0.05)] font-bold pl-4">Total Collection</td>
                  {daysArray.map(d => {
                    const totalDay = getDayTotal(d);
                    return (
                      <td key={d} className="p-3 text-center border-r border-indigo-100 dark:border-indigo-900/40 font-black tabular-nums">
                        {totalDay > 0 ? (
                          <span className="text-emerald-700 dark:text-emerald-400 font-bold">{totalDay}</span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-700">-</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="p-3 text-right pr-6 bg-indigo-50/90 dark:bg-indigo-950/40 font-black text-sm text-indigo-700 dark:text-indigo-400 tabular-nums">
                    ₹{grandMonthTotal.toLocaleString("en-IN")}
                  </td>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={daysInMonth + 2} className="text-center py-20 bg-white dark:bg-[#0B0F19]">
                      <div className="animate-spin h-8 w-8 border-4 border-slate-200 dark:border-slate-800 border-t-accent rounded-full mx-auto" />
                      <p className="mt-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Compiling Collections Matrix...</p>
                    </td>
                  </tr>
                ) : filteredAccounts.length === 0 ? (
                  <tr>
                    <td colSpan={daysInMonth + 2} className="text-center py-20 bg-white dark:bg-[#0B0F19] text-slate-400 font-medium italic">
                      No matching accounts or payments found for this period.
                    </td>
                  </tr>
                ) : (
                  filteredAccounts.map((acc, index) => {
                    const rowTotal = getAccountMonthTotal(acc.accountNo);
                    return (
                      <tr key={acc.id} className="group hover:bg-slate-50 dark:hover:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800 transition-colors">
                        <td className="sticky left-0 bg-white dark:bg-[#0B0F19] group-hover:bg-slate-50 dark:group-hover:bg-slate-800/30 transition-colors z-20 p-3 border-r border-slate-200 dark:border-slate-800 shadow-[3px_0_5px_rgba(0,0,0,0.04)] min-w-[150px] max-w-[150px]">
                          <div className="flex items-start gap-2 pl-1">
                            <span className="text-red-500 font-bold mt-0.5 text-[10px]">►</span>
                            <div className="flex flex-col min-w-0">
                              <span className="font-black text-slate-800 dark:text-white text-xs leading-none">
                                {acc.accountNo}
                              </span>
                              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase mt-1 truncate">
                                {acc.name} {acc.nameTelugu && <span className="font-telugu text-[9px] lowercase">({acc.nameTelugu})</span>}
                              </span>
                            </div>
                          </div>
                        </td>
                        {daysArray.map(d => {
                          const amt = getPostingAmount(acc.accountNo, d);
                          return (
                            <td key={d} className="p-3 text-center border-r border-slate-100 dark:border-slate-800 font-bold text-slate-800 dark:text-slate-200 tabular-nums text-xs min-w-[65px]">
                              {amt > 0 ? (
                                amt.toLocaleString("en-IN")
                              ) : (
                                <span className="text-slate-200 dark:text-slate-850 font-normal">-</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="p-3 text-right pr-6 bg-slate-50/50 dark:bg-slate-900/30 group-hover:bg-slate-100/50 dark:group-hover:bg-slate-800/50 font-black text-slate-900 dark:text-slate-100 text-xs tabular-nums">
                          ₹{rowTotal.toLocaleString("en-IN")}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default CollectionBook;
