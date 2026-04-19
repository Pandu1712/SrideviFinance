import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, DocumentData } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

const BookPrint = () => {
  const { userData } = useAuth();
  const [accounts, setAccounts] = useState<DocumentData[]>([]);
  const [search, setSearch] = useState("");
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

  const filtered = accounts.filter(a =>
    a.name?.toLowerCase().includes(search.toLowerCase()) ||
    a.accountNo?.toLowerCase().includes(search.toLowerCase())
  );

  const handlePrint = () => window.print();

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Book Print</h1>
        <Button onClick={handlePrint} className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Printer className="mr-2 h-4 w-4" />Print
        </Button>
      </div>
      <div className="mb-4">
        <Input placeholder="Search account..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" />
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="finance-table w-full">
            <thead>
              <tr><th className="p-3">S.No</th><th className="p-3">Acc No</th><th className="p-3">Name</th><th className="p-3">Phone</th><th className="p-3">Total</th><th className="p-3">Paid</th><th className="p-3">Balance</th><th className="p-3">Installment</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">No accounts found</td></tr>
              ) : filtered.map((a, i) => (
                <tr key={a.id}>
                  <td>{i + 1}</td>
                  <td className="font-mono">{a.accountNo}</td>
                  <td className="font-medium">{a.name}</td>
                  <td>{a.phone || "-"}</td>
                  <td>₹{(a.totalAmount || 0).toLocaleString("en-IN")}</td>
                  <td>₹{(a.paid || 0).toLocaleString("en-IN")}</td>
                  <td className="text-destructive">₹{(a.balance || 0).toLocaleString("en-IN")}</td>
                  <td>₹{(a.installmentAmount || 0).toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
};

export default BookPrint;
