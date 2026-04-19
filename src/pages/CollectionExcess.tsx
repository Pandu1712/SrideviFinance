import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, DocumentData } from "firebase/firestore";
import { Card, CardContent } from "@/components/ui/card";

const CollectionExcess = () => {
  const { userData } = useAuth();
  const [accounts, setAccounts] = useState<DocumentData[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      if (!userData) return;
      let q;
      if (userData.role === "super_admin") {
        q = query(collection(db, "accounts"));
      } else {
        q = query(collection(db, "accounts"), where("adminId", "==", userData.uid));
      }
      const snap = await getDocs(q);
      const list: DocumentData[] = [];
      snap.forEach(d => {
        const data = d.data() as Record<string, any>;
        if ((data.paid || 0) > (data.totalAmount || 0)) {
          list.push({ id: d.id, ...data });
        }
      });
      setAccounts(list);
    };
    fetchData();
  }, [userData]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Collection Excess</h1>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="finance-table w-full">
            <thead><tr><th className="p-3">Acc No</th><th className="p-3">Name</th><th className="p-3">Total</th><th className="p-3">Paid</th><th className="p-3">Excess</th></tr></thead>
            <tbody>
              {accounts.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">No excess collections found</td></tr>
              ) : accounts.map(a => (
                <tr key={a.id}>
                  <td className="font-mono">{a.accountNo}</td>
                  <td>{a.name}</td>
                  <td>₹{(a.totalAmount || 0).toLocaleString("en-IN")}</td>
                  <td>₹{(a.paid || 0).toLocaleString("en-IN")}</td>
                  <td className="font-medium">₹{((a.paid || 0) - (a.totalAmount || 0)).toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
};

export default CollectionExcess;
