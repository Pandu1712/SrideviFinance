import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLine } from "@/contexts/LineContext";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, doc, setDoc, Timestamp, DocumentData, runTransaction } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { IndianRupee, Search, PlusCircle, CheckCircle2, History, User, FileText, Users, ArrowRight, ShieldCheck, Plus, ArrowRightLeft, MoveRight, HelpCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { formatCurrency, formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

const ExtraAmount = () => {
  const { userData } = useAuth();
  const { selectedLineId } = useLine();
  const [accounts, setAccounts] = useState<DocumentData[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Modal states
  const [recordModalOpen, setRecordModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<DocumentData | null>(null);
  const [form, setForm] = useState({
    amount: "",
    purpose: "",
    payMode: "CASH",
    date: new Date().toISOString().split("T")[0]
  });

  // Transfer state
  const [transferForm, setTransferForm] = useState({
    amount: "",
    destAccNo: ""
  });

  const fetchAccounts = async () => {
    if (!selectedLineId) return;
    setLoading(true);
    try {
      const q = query(collection(db, "accounts"), where("lineId", "==", selectedLineId));
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAccounts(list);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load accounts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, [selectedLineId]);

  const handleOpenRecord = (acc: DocumentData) => {
    setSelectedAccount(acc);
    setForm({ ...form, amount: "", purpose: "" });
    setRecordModalOpen(true);
  };

  const handleOpenTransfer = (acc: DocumentData) => {
    const surplus = Math.max(0, (acc.paid || 0) - (acc.totalAmount || 0));
    const manualExtra = acc.totalExtraPaid || 0;
    const totalExtraAvailable = surplus + manualExtra;

    setSelectedAccount(acc);
    setTransferForm({ 
      amount: totalExtraAvailable.toString(), 
      destAccNo: "" 
    });
    setTransferModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!selectedAccount || !form.amount || !form.purpose) {
      toast.error("Please fill all required fields");
      return;
    }

    setSubmitting(true);
    try {
      const postingRef = doc(collection(db, "postings"));
      const postingData = {
        accountId: selectedAccount.id,
        accountNo: selectedAccount.accountNo,
        memberName: selectedAccount.name,
        date: form.date,
        amount: 0,
        extraAmount: parseFloat(form.amount),
        purpose: form.purpose,
        status: "extra_collection",
        payMode: form.payMode,
        lineId: selectedLineId,
        collectedById: userData?.uid,
        collectedByName: userData?.name,
        collectedByRole: userData?.role,
        createdAt: new Date().toISOString(),
        timestamp: Timestamp.now()
      };

      await setDoc(postingRef, postingData);

      // Update Account with totalExtraPaid
      const accountRef = doc(db, "accounts", selectedAccount.id);
      await runTransaction(db, async (transaction) => {
        const accDoc = await transaction.get(accountRef);
        if (accDoc.exists()) {
          const currentExtra = accDoc.data().totalExtraPaid || 0;
          transaction.update(accountRef, {
            totalExtraPaid: currentExtra + parseFloat(form.amount)
          });
        }
      });

      toast.success(`Extra Amount of ${formatCurrency(form.amount)} recorded for ${selectedAccount.name}`);
      setRecordModalOpen(false);
      fetchAccounts();
    } catch (err) {
      console.error(err);
      toast.error("Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleTransferSubmit = async () => {
    if (!selectedAccount || !transferForm.amount || !transferForm.destAccNo) {
      toast.error("Please fill all transfer details");
      return;
    }

    const amountToTransfer = parseFloat(transferForm.amount);
    if (isNaN(amountToTransfer) || amountToTransfer <= 0) {
      toast.error("Invalid amount");
      return;
    }

    setSubmitting(true);
    try {
      // Find destination account
      const destQuery = query(
        collection(db, "accounts"), 
        where("lineId", "==", selectedLineId),
        where("accountNo", "==", transferForm.destAccNo)
      );
      const destSnap = await getDocs(destQuery);

      if (destSnap.empty) {
        toast.error("Destination Account No not found in this line");
        setSubmitting(false);
        return;
      }

      const destAcc = { id: destSnap.docs[0].id, ...destSnap.docs[0].data() } as DocumentData;

      if (destAcc.id === selectedAccount.id) {
        toast.error("Cannot transfer to the same account");
        setSubmitting(false);
        return;
      }

      await runTransaction(db, async (transaction) => {
        const sourceRef = doc(db, "accounts", selectedAccount.id);
        const destRef = doc(db, "accounts", destAcc.id);
        const sourceDoc = await transaction.get(sourceRef);
        const destDoc = await transaction.get(destRef);

        if (!sourceDoc.exists() || !destDoc.exists()) throw new Error("Account data missing");

        const sourceData = sourceDoc.data();
        const destData = destDoc.data();

        // 1. Update Source (Decrement totalExtraPaid)
        const currentExtra = sourceData.totalExtraPaid || 0;
        transaction.update(sourceRef, {
          totalExtraPaid: currentExtra - amountToTransfer
        });

        // 2. Update Destination (Increment paid, decrement balance)
        const newPaid = (destData.paid || 0) + amountToTransfer;
        const newBalance = (destData.balance || 0) - amountToTransfer;
        transaction.update(destRef, {
          paid: newPaid,
          balance: newBalance,
          status: newBalance <= 0 ? "completed" : "active"
        });

        // 3. Record Postings
        const sourcePostingRef = doc(collection(db, "postings"));
        transaction.set(sourcePostingRef, {
          accountId: selectedAccount.id,
          accountNo: selectedAccount.accountNo,
          memberName: selectedAccount.name,
          date: new Date().toISOString().split("T")[0],
          amount: 0,
          extraAmount: -amountToTransfer,
          purpose: `TRANSFER OUT TO ${destAcc.accountNo}`,
          status: "extra_transfer_out",
          payMode: "INTERNAL",
          lineId: selectedLineId,
          collectedById: userData?.uid,
          collectedByName: userData?.name,
          createdAt: new Date().toISOString(),
          timestamp: Timestamp.now()
        });

        const destPostingRef = doc(collection(db, "postings"));
        transaction.set(destPostingRef, {
          accountId: destAcc.id,
          accountNo: destAcc.accountNo,
          memberName: destAcc.name,
          date: new Date().toISOString().split("T")[0],
          amount: amountToTransfer,
          purpose: `TRANSFER IN FROM ${selectedAccount.accountNo} (Extra)`,
          status: "collection",
          payMode: "INTERNAL",
          lineId: selectedLineId,
          collectedById: userData?.uid,
          collectedByName: userData?.name,
          createdAt: new Date().toISOString(),
          timestamp: Timestamp.now()
        });
      });

      toast.success(`Successfully transferred ${formatCurrency(amountToTransfer)} to ${destAcc.name}`);
      setTransferModalOpen(false);
      fetchAccounts();
    } catch (err) {
      console.error(err);
      toast.error("Transfer failed");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredAccounts = accounts.filter(acc => {
    const surplus = Math.max(0, (acc.paid || 0) - (acc.totalAmount || 0));
    const manualExtra = acc.totalExtraPaid || 0;
    const totalExtra = surplus + manualExtra;

    const matchesSearch = acc.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         acc.accountNo.toString().includes(searchTerm) ||
                         acc.village?.toLowerCase().includes(searchTerm.toLowerCase());

    if (searchTerm.trim() !== "") return matchesSearch;
    return totalExtra > 0;
  }).sort((a, b) => parseInt(a.accountNo) - parseInt(b.accountNo));

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8 pb-20"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="h-14 w-14 rounded-2xl bg-premium-gradient flex items-center justify-center shadow-xl rotate-3">
            <PlusCircle className="text-white h-7 w-7" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tighter text-slate-900 uppercase italic">Extra Amount Registry</h1>
            <p className="text-slate-400 font-bold uppercase tracking-widest text-[9px] mt-1">Master Surplus & Miscellaneous Tracking</p>
          </div>
        </div>

        <div className="relative w-full md:w-96">
           <Search className="absolute left-4 top-3.5 h-4 w-4 text-slate-400" />
           <Input 
             placeholder="Search by Name, Account # or Village..." 
             value={searchTerm}
             onChange={(e) => setSearchTerm(e.target.value)}
             className="pl-12 h-12 glass-card border-none shadow-sm font-bold placeholder:text-slate-300"
           />
        </div>
      </div>

      <Card className="glass-card border-none shadow-2xl overflow-hidden rounded-[2rem] bg-white">
        <CardHeader className="p-8 border-b border-slate-50 flex flex-row items-center justify-between">
           <CardTitle className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 flex items-center gap-3">
              <Users size={16} className="text-accent" />
              Member Ledger (Extra Details)
           </CardTitle>
           <Badge className="bg-slate-100 text-slate-500 border-none px-4 font-black text-[9px] uppercase tracking-widest">{filteredAccounts.length} Filtered Accounts</Badge>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
           <table className="w-full text-left border-collapse">
              <thead>
                 <tr className="bg-slate-50">
                    <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-400">Account Info</th>
                    <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-400">Principal</th>
                    <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-400">Total Paid</th>
                    <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-400">Surplus (Regular)</th>
                    <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-400">Extra (Manual)</th>
                    <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-400 text-indigo-600">Total Extra</th>
                    <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">Actions</th>
                 </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                 {loading ? (
                    <tr><td colSpan={7} className="p-20 text-center font-bold text-slate-400 uppercase text-xs">Loading master list...</td></tr>
                 ) : filteredAccounts.length === 0 ? (
                    <tr><td colSpan={7} className="p-20 text-center font-bold text-slate-300 italic text-xs">No accounts matching criteria</td></tr>
                 ) : (
                    filteredAccounts.map((acc, i) => {
                       const surplus = Math.max(0, (acc.paid || 0) - (acc.totalAmount || 0));
                       const manualExtra = acc.totalExtraPaid || 0;
                       const totalExtra = surplus + manualExtra;
                       
                       return (
                          <motion.tr 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: i * 0.01 }}
                            key={acc.id} 
                            className="hover:bg-slate-50 transition-colors group"
                          >
                             <td className="p-6">
                                <div className="flex items-center gap-4">
                                   <div className="h-10 w-10 rounded-xl bg-slate-900 flex items-center justify-center font-black text-white text-xs group-hover:bg-accent transition-colors">
                                      {acc.accountNo}
                                   </div>
                                   <div>
                                      <p className="text-sm font-black text-slate-900">{acc.name}</p>
                                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{acc.village}</p>
                                   </div>
                                </div>
                             </td>
                             <td className="p-6 text-xs font-black text-slate-400">{formatCurrency(acc.totalAmount)}</td>
                             <td className="p-6 text-xs font-black text-slate-900">{formatCurrency(acc.paid)}</td>
                             <td className="p-6 text-xs font-black text-rose-400">{formatCurrency(surplus)}</td>
                             <td className="p-6 text-xs font-black text-emerald-500">{formatCurrency(manualExtra)}</td>
                             <td className="p-6">
                                <Badge className={`border-none font-black text-[10px] px-3 py-1 ${totalExtra > 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-300'}`}>
                                   {formatCurrency(totalExtra)}
                                </Badge>
                             </td>
                             <td className="p-6">
                                <div className="flex items-center justify-center gap-2">
                                  <Button 
                                    onClick={() => handleOpenRecord(acc)}
                                    className="h-9 px-3 bg-slate-900 hover:bg-slate-800 text-white font-black text-[9px] uppercase tracking-widest rounded-xl shadow-lg transition-all flex items-center gap-1.5"
                                  >
                                     <Plus size={12} /> Record
                                  </Button>
                                  <Button 
                                    variant="outline"
                                    onClick={() => handleOpenTransfer(acc)}
                                    className="h-9 px-3 border-accent/20 text-accent hover:bg-accent hover:text-white font-black text-[9px] uppercase tracking-widest rounded-xl shadow-sm transition-all flex items-center gap-1.5"
                                  >
                                     <ArrowRightLeft size={12} /> Transfer
                                  </Button>
                                </div>
                             </td>
                          </motion.tr>
                       );
                    })
                 )}
              </tbody>
           </table>
        </CardContent>
      </Card>

      {/* Record Dialog */}
      <Dialog open={recordModalOpen} onOpenChange={setRecordModalOpen}>
         <DialogContent className="sm:max-w-[500px] rounded-[2.5rem] border-none shadow-2xl p-0 overflow-hidden">
            <div className="bg-slate-900 p-8 text-white">
               <DialogHeader>
                  <DialogTitle className="text-2xl font-black italic uppercase tracking-tighter flex items-center gap-3">
                     <PlusCircle className="text-accent" />
                     Record Extra Amount
                  </DialogTitle>
                  <DialogDescription className="text-slate-400 font-bold uppercase tracking-widest text-[9px]">
                     Add miscellaneous collection for {selectedAccount?.name}
                  </DialogDescription>
               </DialogHeader>
            </div>
            
            <div className="p-8 space-y-6">
               <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                     <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Extra Amount</Label>
                     <div className="relative">
                        <IndianRupee className="absolute left-4 top-4 h-5 w-5 text-accent" />
                        <Input 
                          type="number" 
                          placeholder="0.00"
                          value={form.amount}
                          onChange={(e) => setForm({ ...form, amount: e.target.value })}
                          className="pl-12 h-14 finance-input text-xl font-black rounded-2xl bg-slate-50 border-none"
                          required
                        />
                     </div>
                  </div>
                  <div className="space-y-2">
                     <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Payment Mode</Label>
                     <Select value={form.payMode} onValueChange={(v) => setForm({ ...form, payMode: v })}>
                        <SelectTrigger className="h-14 finance-input font-black rounded-2xl bg-slate-50 border-none">
                           <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-2xl border-none shadow-2xl p-2">
                           <SelectItem value="CASH" className="rounded-xl font-bold py-3">CASH PAYMENT</SelectItem>
                           <SelectItem value="BANK" className="rounded-xl font-bold py-3">BANK TRANSFER</SelectItem>
                           <SelectItem value="PHONEPE" className="rounded-xl font-bold py-3">PHONEPE / UPI</SelectItem>
                        </SelectContent>
                     </Select>
                  </div>
               </div>

               <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Purpose / Reason</Label>
                  <div className="relative">
                     <FileText className="absolute left-4 top-4 h-5 w-5 text-slate-300" />
                     <Input 
                       placeholder="Ex: Late fee, Overlook, Tips..." 
                       value={form.purpose}
                       onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                       className="pl-12 h-14 finance-input font-bold rounded-2xl bg-slate-50 border-none"
                       required
                     />
                  </div>
               </div>

               <Button 
                 onClick={handleSubmit} 
                 disabled={submitting} 
                 className="w-full h-16 bg-slate-900 text-white font-black uppercase tracking-[0.3em] text-xs rounded-2xl shadow-xl hover:shadow-accent/30 transition-all flex items-center justify-center gap-4 mt-4"
               >
                 {submitting ? "Processing..." : (
                   <>
                     <CheckCircle2 size={20} className="text-accent" />
                     Confirm Collection
                   </>
                 )}
               </Button>
            </div>
         </DialogContent>
      </Dialog>

      {/* Transfer Dialog */}
      <Dialog open={transferModalOpen} onOpenChange={setTransferModalOpen}>
         <DialogContent className="sm:max-w-[500px] rounded-[2.5rem] border-none shadow-2xl p-0 overflow-hidden">
            <div className="bg-accent p-8 text-white">
               <DialogHeader>
                  <DialogTitle className="text-2xl font-black italic uppercase tracking-tighter flex items-center gap-3">
                     <ArrowRightLeft className="text-white" />
                     Swift Transfer
                  </DialogTitle>
                  <DialogDescription className="text-white/70 font-bold uppercase tracking-widest text-[9px]">
                     Shift extra amount from {selectedAccount?.accountNo} to another account
                  </DialogDescription>
               </DialogHeader>
            </div>
            
            <div className="p-8 space-y-6">
               <div className="bg-slate-50 p-6 rounded-2xl border-2 border-dashed border-slate-200 flex items-center justify-between">
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Source Account</p>
                    <p className="text-sm font-black text-slate-900">{selectedAccount?.name}</p>
                  </div>
                  <MoveRight className="text-slate-300" />
                  <div className="text-right">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Available Extra</p>
                    <p className="text-sm font-black text-indigo-600">
                      {selectedAccount ? formatCurrency(Math.max(0, (selectedAccount.paid || 0) - (selectedAccount.totalAmount || 0)) + (selectedAccount.totalExtraPaid || 0)) : "₹0"}
                    </p>
                  </div>
               </div>

               <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                     <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Transfer Amount</Label>
                     <div className="relative">
                        <IndianRupee className="absolute left-4 top-4 h-5 w-5 text-accent" />
                        <Input 
                          type="number" 
                          placeholder="0.00"
                          value={transferForm.amount}
                          onChange={(e) => setTransferForm({ ...transferForm, amount: e.target.value })}
                          className="pl-12 h-14 finance-input text-xl font-black rounded-2xl bg-slate-50 border-none"
                        />
                     </div>
                  </div>

                  <div className="space-y-2">
                     <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Destination Account No</Label>
                     <div className="relative">
                        <Search className="absolute left-4 top-4 h-5 w-5 text-slate-300" />
                        <Input 
                          placeholder="Ex: ACC-1002"
                          value={transferForm.destAccNo}
                          onChange={(e) => setTransferForm({ ...transferForm, destAccNo: e.target.value.toUpperCase() })}
                          className="pl-12 h-14 finance-input font-bold rounded-2xl bg-slate-50 border-none"
                        />
                     </div>
                     <p className="text-[8px] font-bold text-slate-400 flex items-center gap-1 mt-1 ml-1">
                        <HelpCircle size={10} /> The amount will be added to this member's regular balance.
                     </p>
                  </div>
               </div>

               <Button 
                 onClick={handleTransferSubmit} 
                 disabled={submitting} 
                 className="w-full h-16 bg-slate-900 text-white font-black uppercase tracking-[0.3em] text-xs rounded-2xl shadow-xl hover:shadow-accent/30 transition-all flex items-center justify-center gap-4 mt-4"
               >
                 {submitting ? "Processing..." : (
                   <>
                     <CheckCircle2 size={20} className="text-accent" />
                     Confirm Transfer
                   </>
                 )}
               </Button>
            </div>
         </DialogContent>
      </Dialog>
    </motion.div>
  );
};

const Badge = ({ children, className }: { children: React.ReactNode, className?: string }) => (
  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${className}`}>
    {children}
  </span>
);

export default ExtraAmount;
