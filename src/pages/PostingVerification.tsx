import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLine } from "@/contexts/LineContext";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, doc, updateDoc, runTransaction, DocumentData, orderBy } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, Edit, Search, User, IndianRupee, Calendar, ShieldCheck, AlertCircle, Trash2, RefreshCw, FileSpreadsheet, CheckCheck } from "lucide-react";
import { logActivity } from "@/lib/audit";
import { exportToExcel } from "@/lib/excel";
import { motion, AnimatePresence } from "framer-motion";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PostingVerification = () => {
  const { userData } = useAuth();
  const { lines, selectedLineId } = useLine();
  const [postings, setPostings] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isBulkApproving, setIsBulkApproving] = useState(false);
  const [otherLinesCount, setOtherLinesCount] = useState(0);
  
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedPosting, setSelectedPosting] = useState<any>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editPayMode, setEditPayMode] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editNote, setEditNote] = useState("");

  const fetchPendingPostings = async () => {
    if (!selectedLineId) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, "postings"),
        where("lineId", "==", selectedLineId),
        where("verified", "==", false)
      );
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setPostings(list);

      // Check other lines
      const otherQ = query(
        collection(db, "postings"),
        where("verified", "==", false)
      );
      const otherSnap = await getDocs(otherQ);
      const otherTotal = otherSnap.docs.filter(d => d.data().lineId !== selectedLineId).length;
      setOtherLinesCount(otherTotal);
    } catch (err) {
      console.error("Fetch pending fail:", err);
      toast.error("Failed to load pending collections");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userData && selectedLineId) {
      fetchPendingPostings();
    }
  }, [userData, selectedLineId]);

  const handleApprove = async (posting: any) => {
    setProcessingId(posting.id);
    try {
      const accountRef = doc(db, "accounts", posting.accountId);
      const postingRef = doc(db, "postings", posting.id);

      await runTransaction(db, async (transaction) => {
        const accDoc = await transaction.get(accountRef);
        if (!accDoc.exists()) throw new Error("Account no longer exists");

        const accData = accDoc.data();
        const postingAmount = parseFloat(posting.amount);
        
        const newPaid = (accData.paid || 0) + postingAmount;
        const newBalance = (accData.totalAmount || 0) - newPaid;
        const newStatus = newBalance <= 0 ? "completed" : "active";

        transaction.update(accountRef, {
          paid: newPaid,
          balance: Math.max(0, newBalance),
          status: newStatus,
          lastPostingDate: posting.date,
          lastCollectedByName: posting.collectedByName || "Agent",
          lastCollectedByRole: posting.collectedByRole || "agent"
        });

        transaction.update(postingRef, { verified: true });
      });

      toast.success(`Approved ₹${posting.amount} for ${posting.memberName}`);
      setPostings(prev => prev.filter(p => p.id !== posting.id));
    } catch (err: any) {
      toast.error(err.message || "Approval failed");
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id: string) => {
    if (!confirm("Are you sure you want to REJECT and DELETE this entry? This cannot be undone.")) return;
    setProcessingId(id);
    try {
      // Just delete the unverified posting
      // Since it was never added to the account balance, we don't need to revert anything
      const { deleteDoc } = await import("firebase/firestore");
      await deleteDoc(doc(db, "postings", id));
      toast.info("Entry rejected and removed");
      setPostings(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      toast.error("Deletion failed");
    } finally {
      setProcessingId(null);
    }
  };

  const handleBulkApprove = async () => {
    if (postings.length === 0) return;
    
    setIsBulkApproving(true);
    const totalCount = postings.length;
    const toastId = toast.loading(`Initiating Bulk Approval for ${totalCount} entries...`);

    try {
      let successCount = 0;
      
      for (const p of postings) {
        successCount++;
        toast.loading(`Processing ${successCount}/${totalCount}: ${p.memberName}...`, { id: toastId });
        
        const accountRef = doc(db, "accounts", p.accountId);
        const postingRef = doc(db, "postings", p.id);

        await runTransaction(db, async (transaction) => {
          const accDoc = await transaction.get(accountRef);
          if (!accDoc.exists()) return;

          const accData = accDoc.data();
          const postingAmount = parseFloat(String(p.amount));
          
          const newPaid = (accData.paid || 0) + postingAmount;
          const newBalance = (accData.totalAmount || 0) - newPaid;
          const newStatus = newBalance <= 0 ? "completed" : "active";

          transaction.update(accountRef, {
            paid: newPaid,
            balance: Math.max(0, newBalance),
            status: newStatus,
            lastPostingDate: p.date,
            lastCollectedByName: p.collectedByName || "Agent",
            lastCollectedByRole: p.collectedByRole || "agent"
          });

          transaction.update(postingRef, { verified: true });
        });
      }

      toast.success(`Successfully approved ${totalCount} collection entries`, { id: toastId });
      
      if (userData) {
        logActivity(
          userData.uid,
          userData.name,
          userData.role,
          "POSTING_VERIFY_BATCH",
          `Batch approved ${totalCount} collections in ${selectedLineId}`,
          selectedLineId
        );
      }
      
      setPostings([]);
    } catch (err: any) {
      console.error("Bulk approval error:", err);
      toast.error(`Approval failed: ${err.message}`, { id: toastId });
      fetchPendingPostings();
    } finally {
      setIsBulkApproving(false);
    }
  };

  const openEdit = (posting: any) => {
    setSelectedPosting(posting);
    setEditAmount(String(posting.amount));
    setEditDate(posting.date);
    setEditPayMode(posting.payMode);
    setEditStatus(posting.status || "collection");
    setEditNote(posting.note || "");
    setEditDialogOpen(true);
  };

  const saveEdit = async () => {
    if (!selectedPosting || !editAmount) return;
    try {
      const postingRef = doc(db, "postings", selectedPosting.id);
      const updates = { 
        amount: parseFloat(editAmount),
        date: editDate,
        payMode: editPayMode,
        status: editStatus,
        note: (editPayMode === 'bank' || editPayMode === 'upi') ? editNote : ""
      };
      await updateDoc(postingRef, updates);
      toast.success("Entry updated successfully");
      setPostings(prev => prev.map(p => p.id === selectedPosting.id ? { ...p, ...updates } : p));
      setEditDialogOpen(false);
    } catch (err) {
      toast.error("Update failed");
    }
  };

  const handleExportExcel = () => {
    if (postings.length === 0) {
      toast.error("No pending postings to export");
      return;
    }
    
    const data = postings.map((p, i) => ({
      "Sl No": i + 1,
      "Date": formatDate(p.date),
      "Member": p.memberName,
      "Account No": p.accountNo,
      "Agent Name": p.collectedByName || "Unknown",
      "Agent ID": p.collectedById || "N/A",
      "Amount": p.amount || 0,
      "Mode": (p.payMode || "CASH").toUpperCase() + (p.note ? ` (${p.note})` : ""),
      "Category": `${(p.collectedByRole || 'Agent').replace('_', ' ')} ${p.status || 'Collection'}`.toUpperCase()
    }));

    exportToExcel(data, `Verification_Queue_${new Date().toISOString().split('T')[0]}`, "Pending Postings");
    toast.success("Verification List Exported as Excel");
  };

  if (userData?.role === 'agent') return <div className="p-10 text-center font-bold">Access Denied</div>;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-slate-900 flex items-center justify-center shadow-lg">
            <ShieldCheck className="text-white h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-primary">Reconciliation Queue</h1>
            <div className="flex items-center gap-3 mt-1">
              <p className="text-muted-foreground font-medium uppercase text-[10px] tracking-widest flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
                Awaiting Admin Approval
              </p>
              <Badge className="bg-indigo-50 text-indigo-600 border-indigo-100 font-black text-[9px] uppercase tracking-widest px-3">
                Line: {lines.find(l => l.id === selectedLineId)?.name || "Default"}
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {postings.length > 0 && (
            <Button 
              onClick={handleBulkApprove} 
              disabled={isBulkApproving || loading}
              className="h-10 bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-widest text-[10px] shadow-lg gap-2"
            >
              <CheckCheck size={16} />
              Approve All ({postings.length})
            </Button>
          )}
          <Button variant="outline" onClick={fetchPendingPostings} className="h-10 font-bold">
            <RefreshCw className={loading ? "animate-spin mr-2 h-4 w-4" : "mr-2 h-4 w-4"} />
            Refresh List
          </Button>
          <Button 
            variant="outline" 
            onClick={handleExportExcel} 
            className="h-10 font-bold border-emerald-200 text-emerald-600 hover:bg-emerald-50"
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Excel Export
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="glass-card border-none shadow-xl border-l-4 border-l-amber-500">
          <CardContent className="p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Pending Entries</p>
            <h2 className="text-4xl font-black text-primary mt-1">{postings.length}</h2>
          </CardContent>
        </Card>
        <Card className="glass-card border-none shadow-xl border-l-4 border-l-emerald-500">
          <CardContent className="p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Total Pending Cash</p>
            <h2 className="text-4xl font-black text-emerald-600 mt-1">
              {formatCurrency(postings.reduce((sum, p) => sum + (p.amount || 0), 0))}
            </h2>
          </CardContent>
        </Card>
        {otherLinesCount > 0 && (
          <Card className="glass-card border-none shadow-xl border-l-4 border-l-indigo-500 bg-indigo-50/30">
            <CardContent className="p-6">
              <p className="text-xs font-bold uppercase tracking-widest text-indigo-500">Other Lines Pending</p>
              <h2 className="text-4xl font-black text-indigo-600 mt-1">{otherLinesCount}</h2>
              <p className="text-[9px] font-bold text-indigo-400 uppercase mt-2 italic">* Switch line to approve these</p>
            </CardContent>
          </Card>
        )}
      </div>

      <Card className="glass-card border-none shadow-2xl overflow-hidden">
        <CardHeader className="bg-slate-50/50 border-b py-4">
          <CardTitle className="text-sm font-black flex items-center gap-2 uppercase tracking-widest">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            Verification List
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/20">
                  <th className="p-4 text-[10px] uppercase tracking-widest font-black text-slate-500">Member / Account</th>
                  <th className="p-4 text-[10px] uppercase tracking-widest font-black text-slate-500">Collection Date</th>
                  <th className="p-4 text-[10px] uppercase tracking-widest font-black text-slate-500">Collected By</th>
                  <th className="p-4 text-[10px] uppercase tracking-widest font-black text-slate-500 text-right">Amount</th>
                  <th className="p-4 text-[10px] uppercase tracking-widest font-black text-slate-500 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  <tr><td colSpan={5} className="p-20 text-center text-slate-400 font-bold">Syncing pending collections...</td></tr>
                ) : postings.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-32 text-center">
                      <CheckCircle2 size={48} className="mx-auto mb-4 text-emerald-200" />
                      <p className="text-xl font-black text-slate-300 uppercase tracking-widest">All Clear!</p>
                      <p className="text-sm text-slate-400">No pending collections to verify.</p>
                    </td>
                  </tr>
                ) : (
                  postings.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center text-xs font-black text-slate-500 group-hover:bg-primary group-hover:text-white transition-colors">
                            {p.accountNo}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-black text-primary">{p.memberName}</p>
                              {p.nameTelugu && (
                                <span className="text-[10px] font-bold text-slate-500 font-telugu whitespace-nowrap">
                                  ({p.nameTelugu})
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase"># {p.accountNo}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                          <Calendar size={14} className="text-slate-400" />
                          {formatDate(p.date)}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col">
                          <span className="text-xs font-black text-slate-700">{p.collectedByName || "Unknown Agent"}</span>
                          <Badge variant="outline" className="text-[8px] font-bold uppercase py-0 w-fit mt-1">
                            ID: {p.collectedById?.substring(0,6)}
                          </Badge>
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <p className="text-lg font-black text-primary">{formatCurrency(p.amount)}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">{p.payMode}</p>
                        {p.note && (
                          <p className="text-[9px] font-medium text-slate-500 italic mt-0.5" title={p.note}>
                            Note: {p.note}
                          </p>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-center gap-2">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-9 w-9 text-slate-400 hover:text-primary hover:bg-slate-100"
                            onClick={() => openEdit(p)}
                            disabled={!!processingId}
                          >
                            <Edit size={16} />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-9 w-9 text-rose-400 hover:text-rose-600 hover:bg-rose-50"
                            onClick={() => handleReject(p.id)}
                            disabled={!!processingId}
                          >
                            <Trash2 size={16} />
                          </Button>
                          <Button 
                            className="h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-widest gap-2 shadow-lg"
                            onClick={() => handleApprove(p)}
                            disabled={!!processingId}
                          >
                            {processingId === p.id ? "..." : <><CheckCircle2 size={14} /> Approve</>}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="glass-card border-none shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-primary uppercase tracking-tight">Edit Collection Amount</DialogTitle>
            <DialogDescription className="text-slate-500 font-medium">
              Update the collected cash amount before final approval.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-black uppercase tracking-widest text-slate-400">Cash Amount (₹)</Label>
                <div className="relative">
                  <IndianRupee className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                  <Input 
                    type="number" 
                    value={editAmount} 
                    onChange={e => setEditAmount(e.target.value)} 
                    className="pl-9 h-12 finance-input text-lg font-black"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-black uppercase tracking-widest text-slate-400">Collection Date</Label>
                <Input 
                  type="date" 
                  value={editDate} 
                  onChange={e => setEditDate(e.target.value)} 
                  className="h-12 finance-input font-bold"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-black uppercase tracking-widest text-slate-400">Payment Mode</Label>
                <Select value={editPayMode} onValueChange={setEditPayMode}>
                  <SelectTrigger className="h-12 finance-input font-bold"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank">Bank</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-black uppercase tracking-widest text-slate-400">Category</Label>
                <Select value={editStatus} onValueChange={setEditStatus}>
                  <SelectTrigger className="h-12 finance-input font-bold"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="collection">Collection</SelectItem>
                    <SelectItem value="penalty">Penalty</SelectItem>
                    <SelectItem value="other">Other Fees</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {(editPayMode === 'bank' || editPayMode === 'upi') && (
              <div className="space-y-2">
                <Label className="text-xs font-black uppercase tracking-widest text-slate-400">Note / Reference (Optional)</Label>
                <Input 
                  type="text" 
                  value={editNote} 
                  onChange={e => setEditNote(e.target.value)} 
                  placeholder="Enter transaction ref, bank name or note..."
                  className="h-12 finance-input font-bold text-slate-900"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} className="h-11 font-bold">Cancel</Button>
            <Button onClick={saveEdit} className="h-11 bg-primary text-primary-foreground font-black uppercase tracking-widest px-8">Save Update</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default PostingVerification;
