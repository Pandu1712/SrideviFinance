import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, DocumentData } from "firebase/firestore";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Download, Upload } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatCurrency, formatDate } from "@/lib/utils";

const PaymentsExportImport = () => {
  const { userData } = useAuth();
  const [postings, setPostings] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      if (!userData) return;
      let q;
      if (userData.role === "super_admin") q = query(collection(db, "postings"));
      else if (userData.role === "admin") q = query(collection(db, "postings"), where("adminId", "==", userData.uid));
      else q = query(collection(db, "postings"), where("lineId", "==", userData.lineId || ""));
      const snap = await getDocs(q);
      const list: DocumentData[] = [];
      snap.forEach(d => list.push({ id: d.id, ...(d.data() as Record<string, any>) }));
      setPostings(list);
      setLoading(false);
    };
    fetch();
  }, [userData]);

  const exportPayments = () => {
    if (postings.length === 0) { toast.error("No payments to export"); return; }
    
    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.setTextColor(15, 23, 42);
    doc.text("SRIDEVI FINANCE HUB", 14, 22);
    
    doc.setFontSize(14);
    doc.text("Global Payment Master Export", 14, 30);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 38);
    doc.text(`Total Records: ${postings.length}`, 14, 43);

    const tableColumn = ["Date", "Account No", "Member Name", "Amount", "Status", "Mode"];
    const tableRows = postings.map(p => [
      formatDate(p.date),
      p.accountNo,
      p.memberName,
      formatCurrency(p.amount),
      p.status.toUpperCase(),
      p.payMode.toUpperCase()
    ]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 50,
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 3 },
      columnStyles: {
        3: { halign: 'right', fontStyle: 'bold' }
      }
    });

    doc.save(`Payments_Master_Export_${new Date().toISOString().split("T")[0]}.pdf`);
    toast.success("Payments Master exported as PDF");
  };

  const handleImport = () => {
    toast.info("Payment import feature - upload CSV file to import payment records. Coming soon with full validation.");
  };

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Payments Export / Import</h1>
      <Tabs defaultValue="export">
        <TabsList><TabsTrigger value="export">Export</TabsTrigger><TabsTrigger value="import">Import</TabsTrigger></TabsList>
        <TabsContent value="export">
          <div className="mb-4"><Button onClick={exportPayments} className="bg-accent text-accent-foreground hover:bg-accent/90"><Download className="mr-2 h-4 w-4" />Export Master PDF</Button></div>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="finance-table w-full">
                <thead><tr><th className="p-3">S.No</th><th className="p-3">Date</th><th className="p-3">Acc No</th><th className="p-3">Name</th><th className="p-3">Amount</th><th className="p-3">Status</th></tr></thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</td></tr>
                  ) : postings.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No payments found</td></tr>
                  ) : postings.slice(0, 50).map((p, i) => (
                    <tr key={p.id}><td>{i + 1}</td><td>{p.date}</td><td className="font-mono">{p.accountNo}</td><td>{p.memberName}</td><td>₹{(p.amount || 0).toLocaleString("en-IN")}</td><td className="capitalize">{p.status}</td></tr>
                  ))}
                </tbody>
              </table>
              {postings.length > 50 && <div className="p-3 text-center text-sm text-muted-foreground">Showing 50 of {postings.length} records. Export to see all.</div>}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="import">
          <Card>
            <CardContent className="p-8 text-center">
              <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Import Payments</h3>
              <p className="text-muted-foreground mb-4">Upload a CSV file with columns: Date, Account No, Amount, Status, Mode</p>
              <Button onClick={handleImport} variant="outline">Select CSV File</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PaymentsExportImport;
