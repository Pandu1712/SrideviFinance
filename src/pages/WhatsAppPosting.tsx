import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, DocumentData } from "firebase/firestore";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Smartphone } from "lucide-react";
import { toast } from "sonner";

const WhatsAppPosting = () => {
  const { userData } = useAuth();
  const [postings, setPostings] = useState<DocumentData[]>([]);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      if (!userData) return;
      setLoading(true);
      let q;
      if (userData.role === "super_admin") q = query(collection(db, "postings"), where("date", "==", date));
      else if (userData.role === "admin") q = query(collection(db, "postings"), where("adminId", "==", userData.uid), where("date", "==", date));
      else q = query(collection(db, "postings"), where("agentId", "==", userData.uid), where("date", "==", date));
      try {
        const snap = await getDocs(q);
        const list: DocumentData[] = [];
        snap.forEach(d => list.push({ id: d.id, ...(d.data() as Record<string, any>) }));
        setPostings(list);
      } catch { setPostings([]); }
      setLoading(false);
    };
    fetch();
  }, [userData, date]);

  const totalAmount = postings.reduce((s, p) => s + (p.amount || 0), 0);

  const shareAll = () => {
    if (postings.length === 0) { toast.error("No postings to share"); return; }
    let text = `📋 *SriDevi Finance - Daily Report*\n📅 Date: ${date}\n\n`;
    postings.forEach((p, i) => {
      text += `${i + 1}. *${p.memberName}* (${p.accountNo})\n   💰 ₹${(p.amount || 0).toLocaleString("en-IN")} - ${p.status} (${p.payMode})\n\n`;
    });
    text += `\n💵 *Total Collection: ₹${totalAmount.toLocaleString("en-IN")}*\n📊 Total Entries: ${postings.length}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  const shareIndividual = (p: DocumentData) => {
    const text = `📋 *SriDevi Finance - Payment Receipt*\n📅 Date: ${p.date}\n\n👤 Name: *${p.memberName}*\n🔢 Account: ${p.accountNo}\n💰 Amount: ₹${(p.amount || 0).toLocaleString("en-IN")}\n📌 Status: ${p.status}\n💳 Mode: ${p.payMode}\n\n✅ Payment recorded successfully!`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">WhatsApp Posting</h1>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="space-y-1"><Label>Date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-48" /></div>
        <div className="flex items-end">
          <Button onClick={shareAll} className="bg-accent text-accent-foreground hover:bg-accent/90">
            <Smartphone className="mr-2 h-4 w-4" />Share All via WhatsApp
          </Button>
        </div>
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="finance-table w-full">
            <thead><tr><th className="p-3">S.No</th><th className="p-3">Acc No</th><th className="p-3">Name</th><th className="p-3">Amount</th><th className="p-3">Status</th><th className="p-3">Share</th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</td></tr>
              ) : postings.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No postings for this date</td></tr>
              ) : postings.map((p, i) => (
                <tr key={p.id}>
                  <td>{i + 1}</td><td className="font-mono">{p.accountNo}</td><td>{p.memberName}</td><td>₹{(p.amount || 0).toLocaleString("en-IN")}</td><td className="capitalize">{p.status}</td>
                  <td><Button variant="ghost" size="sm" onClick={() => shareIndividual(p)}><Smartphone className="h-4 w-4" /></Button></td>
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

export default WhatsAppPosting;
