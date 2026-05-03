import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLine } from "@/contexts/LineContext";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, DocumentData } from "firebase/firestore";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet } from "lucide-react";
import { exportToExcel } from "@/lib/excel";
import { toast } from "sonner";

const AdvancedLists = () => {
  const { userData } = useAuth();
  const [accounts, setAccounts] = useState<DocumentData[]>([]);

  const { selectedLineId } = useLine();

  useEffect(() => {
    const fetchData = async () => {
      if (!userData) return;
      if (!selectedLineId) {
        setAccounts([]);
        return;
      }

      let q = query(collection(db, "accounts"), where("lineId", "==", selectedLineId));
      
      if (userData.role === "admin") {
        q = query(q, where("adminId", "==", userData.uid));
      }

      const snap = await getDocs(q);
      const list: DocumentData[] = [];
      snap.forEach(d => list.push({ id: d.id, ...(d.data() as Record<string, any>) }));
      setAccounts(list);
    };
    fetchData();
  }, [userData, selectedLineId]);

  const pending = accounts.filter(a => a.status === "active" && (a.balance || 0) > 0);
  const completed = accounts.filter(a => a.status === "completed");
  const expired = accounts.filter(a => a.status === "expired");

  const renderTable = (list: DocumentData[], title: string) => (
    <div className="space-y-4 p-4">
      <div className="flex justify-end">
        <Button 
          variant="outline" 
          size="sm" 
          className="gap-2 border-emerald-200 text-emerald-600 hover:bg-emerald-50"
          onClick={() => handleExportExcel(list, title)}
        >
          <FileSpreadsheet className="h-4 w-4" /> Export {title} to Excel
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="finance-table w-full">
          <thead><tr><th className="p-3">Acc No</th><th className="p-3">Name</th><th className="p-3">Village</th><th className="p-3">Total</th><th className="p-3">Paid</th><th className="p-3">Balance</th></tr></thead>
          <tbody>
            {list.length === 0 ? (<tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No records</td></tr>
            ) : list.map(a => (
              <tr key={a.id}><td className="font-mono">{a.accountNo}</td><td>{a.name}</td><td>{a.village}</td><td>₹{(a.totalAmount||0).toLocaleString("en-IN")}</td><td>₹{(a.paid||0).toLocaleString("en-IN")}</td><td className="text-destructive">₹{(a.balance||0).toLocaleString("en-IN")}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const handleExportExcel = (list: DocumentData[], title: string) => {
    if (list.length === 0) {
      toast.error("No data to export");
      return;
    }
    
    const data = list.map((a, i) => ({
      "Sl No": i + 1,
      "Account No": a.accountNo,
      "Name": a.name,
      "Village": a.village,
      "Phone": a.phone,
      "Total Amount": a.totalAmount || 0,
      "Paid": a.paid || 0,
      "Balance": a.balance || 0,
      "Frequency": (a.paymentFrequency || "").toUpperCase(),
      "Start Date": a.startDate || ""
    }));

    exportToExcel(data, `AdvancedList_${title}`, "Accounts");
    toast.success(`${title} list exported as Excel`);
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Advanced Lists</h1>
      <Tabs defaultValue="pending">
        <TabsList><TabsTrigger value="pending">Pending ({pending.length})</TabsTrigger><TabsTrigger value="completed">Completed ({completed.length})</TabsTrigger><TabsTrigger value="expired">Expired ({expired.length})</TabsTrigger></TabsList>
        <TabsContent value="pending"><Card><CardContent className="p-0">{renderTable(pending, "Pending")}</CardContent></Card></TabsContent>
        <TabsContent value="completed"><Card><CardContent className="p-0">{renderTable(completed, "Completed")}</CardContent></Card></TabsContent>
        <TabsContent value="expired"><Card><CardContent className="p-0">{renderTable(expired, "Expired")}</CardContent></Card></TabsContent>
      </Tabs>
    </div>
  );
};

export default AdvancedLists;
