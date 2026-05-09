import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, DocumentData, doc, runTransaction } from "firebase/firestore";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Download, Trash2 } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatCurrency, formatDate } from "@/lib/utils";

const DailyData = () => {
  const { userData } = useAuth();
  const [postings, setPostings] = useState<DocumentData[]>([]);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(true);

  const fetchPostings = async () => {
    if (!userData) return;
    setLoading(true);
    let q;
    if (userData.role === "super_admin") q = query(collection(db, "postings"), where("date", "==", date));
    else if (userData.role === "admin") q = query(collection(db, "postings"), where("adminId", "==", userData.uid), where("date", "==", date));
    else q = query(collection(db, "postings"), where("lineId", "==", userData.lineId || ""), where("date", "==", date));
    try {
      const snap = await getDocs(q);
      const list: DocumentData[] = [];
      snap.forEach(d => list.push({ id: d.id, ...(d.data() as Record<string, any>) }));
      setPostings(list);
    } catch { setPostings([]); }
    setLoading(false);
  };

  useEffect(() => {
    fetchPostings();
  }, [userData, date]);

  const handleDeletePosting = async (posting: DocumentData) => {
    if (userData?.role !== "super_admin") return;
    if (!window.confirm(`Are you sure you want to delete this payment of ₹${posting.amount}? The member's balance will be REVERSED (increased).`)) return;

    setLoading(true);
    try {
      const accountRef = doc(db, "accounts", posting.accountId);
      const postingRef = doc(db, "postings", posting.id);

      await runTransaction(db, async (transaction) => {
        const accDoc = await transaction.get(accountRef);
        if (!accDoc.exists()) throw new Error("Account not found");

        const accData = accDoc.data();
        const postingAmount = posting.amount || 0;
        const principalAmount = posting.principal || (postingAmount - (posting.lateFee || 0));
        
        const newPaid = (accData.paid || 0) - postingAmount;
        const newBalance = (accData.balance || 0) + principalAmount;
        const newStatus = newBalance > 0 ? "active" : "completed";

        transaction.update(accountRef, {
          paid: newPaid,
          balance: newBalance,
          status: newStatus
        });

        transaction.delete(postingRef);
      });

      toast.success("Transaction deleted and balance reconciled.");
      fetchPostings();
    } catch (err: any) {
      console.error("Delete Posting Error:", err);
      toast.error("Failed to delete transaction: " + err.message);
      setLoading(false);
    }
  };

  const totalAmount = postings.reduce((s, p) => s + (p.amount || 0), 0);

  const exportPDF = () => {
    if (postings.length === 0) { toast.error("No data"); return; }
    
    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.setTextColor(15, 23, 42);
    doc.text("SRIDEVIGROUPS OF FINANCE", 14, 22);
    
    doc.setFontSize(14);
    doc.text(`Daily Transaction Audit - ${date}`, 14, 30);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 38);
    doc.text(`Total Entries: ${postings.length}`, 14, 43);

    const tableColumn = ["Acc No", "Name", "Amount", "Status", "Mode", "Date"];
    const tableRows = postings.map(p => [
      p.accountNo,
      p.memberName,
      formatCurrency(p.amount),
      p.status.toUpperCase(),
      p.payMode.toUpperCase(),
      formatDate(p.date)
    ]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 50,
      theme: 'striped',
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 3 },
      columnStyles: {
        2: { halign: 'right', fontStyle: 'bold' }
      }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text(`Daily Total: ${formatCurrency(totalAmount)}`, 14, finalY);

    doc.save(`Daily_Audit_${date}.pdf`);
    toast.success("Daily Audit exported as PDF");
  };

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Daily Data</h1>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="space-y-1"><Label>Date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-48" /></div>
        <div className="flex items-end"><Button onClick={exportPDF} variant="outline"><Download className="mr-2 h-4 w-4" />Export PDF</Button></div>
        <div className="pt-6 text-sm font-medium">Total: ₹{totalAmount.toLocaleString("en-IN")} ({postings.length} entries)</div>
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="finance-table w-full">
            <thead>
              <tr>
                <th className="p-3">S.No</th>
                <th className="p-3">Acc No</th>
                <th className="p-3">Name</th>
                <th className="p-3">Amount</th>
                <th className="p-3">Status</th>
                <th className="p-3">Mode</th>
                {userData?.role === "super_admin" && <th className="p-3 text-right">Action</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</td></tr>
              ) : postings.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No postings for this date</td></tr>
              ) : postings.map((p, i) => (
                <tr key={p.id}>
                  <td>{i + 1}</td>
                  <td className="font-mono">{p.accountNo}</td>
                  <td>{p.memberName}</td>
                  <td>₹{(p.amount || 0).toLocaleString("en-IN")}</td>
                  <td className="capitalize">{p.status}</td>
                  <td className="capitalize">{p.payMode}</td>
                  {userData?.role === "super_admin" && (
                    <td className="text-right">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-destructive/50 hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDeletePosting(p)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
              {postings.length > 0 && (
                <tr className="font-bold bg-muted"><td colSpan={3} className="text-right p-3">Total:</td><td className="p-3">₹{totalAmount.toLocaleString("en-IN")}</td><td colSpan={2}></td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
};

export default DailyData;
