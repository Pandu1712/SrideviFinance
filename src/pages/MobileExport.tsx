import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, DocumentData } from "firebase/firestore";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatCurrency, formatDate } from "@/lib/utils";

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
      else q = query(collection(db, "accounts"), where("lineId", "==", userData.lineId || ""));
      const snap = await getDocs(q);
      const list: DocumentData[] = [];
      snap.forEach(d => list.push({ id: d.id, ...(d.data() as Record<string, any>) }));
      setAccounts(list);
      setLoading(false);
    };
    fetch();
  }, [userData]);

  const exportPDF = () => {
    if (accounts.length === 0) { toast.error("No data to export"); return; }
    
    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.setTextColor(15, 23, 42);
    doc.text("SRIDEVI FINANCE HUB", 14, 22);
    
    doc.setFontSize(14);
    doc.text(`Mobile Account Audit - ${date}`, 14, 30);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 38);
    doc.text(`Total Subscribers: ${accounts.length}`, 14, 43);

    const tableColumn = ["Account No", "Name", "Phone", "Village", "Total", "Paid", "Balance"];
    const tableRows = accounts.map(a => [
      a.accountNo,
      a.name,
      a.phone || "N/A",
      a.village || "N/A",
      formatCurrency(a.totalAmount || 0),
      formatCurrency(a.paid || 0),
      formatCurrency(a.balance || 0)
    ]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 50,
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 7, cellPadding: 2 },
      columnStyles: {
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right', fontStyle: 'bold' }
      }
    });

    doc.save(`Mobile_Audit_${date}.pdf`);
    toast.success("Mobile Audit exported as PDF");
  };



  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Mobile Export</h1>
      <div className="mb-4 flex flex-wrap gap-4">
        <div className="space-y-1"><Label>Date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-48" /></div>
        <div className="flex items-end gap-2">
          <Button onClick={exportPDF} className="bg-accent text-accent-foreground hover:bg-accent/90">Export PDF</Button>
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
