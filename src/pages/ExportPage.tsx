import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet, FileText, IndianRupee, ShieldCheck, MapPin, Search } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useLine } from "@/contexts/LineContext";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import * as XLSX from "xlsx";
import { formatCurrency, formatDate } from "@/lib/utils";
import { motion } from "framer-motion";

const ExportPage = () => {
  const { userData } = useAuth();
  const { selectedLineId, lines } = useLine();
  const [loading, setLoading] = useState(false);

  const activeLine = lines.find(l => l.id === selectedLineId);
  const activeLineName = activeLine?.name || "All Portfolio";

  const exportToExcel = async () => {
    if (!selectedLineId) {
      toast.error("Please select an Operative Line from the sidebar first.");
      return;
    }

    setLoading(true);
    try {
      const q = query(
        collection(db, "accounts"),
        where("lineId", "==", selectedLineId)
      );
      
      const snap = await getDocs(q);
      if (snap.empty) {
        toast.error("No member data found in this line.");
        setLoading(false);
        return;
      }

      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      // Sort in-memory to avoid composite index requirement
      list.sort((a, b) => {
        const numA = parseInt(a.accountNo, 10);
        const numB = parseInt(b.accountNo, 10);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return (a.accountNo || "").localeCompare(b.accountNo || "");
      });

      const data = list.map(d => {
        return {
          "Account No": d.accountNo,
          "Customer Name": d.name,
          "Father/Husband": d.fatherHusbandName || "N/A",
          "Village/Area": d.village || "N/A",
          "Phone": d.phone || "N/A",
          "Loan Amount (Principal)": d.loanAmount || 0,
          "Interest": d.interestAmount || 0,
          "Total Payable": d.totalAmount || 0,
          "Installment": d.installmentAmount || 0,
          "Frequency": (d.paymentFrequency || "N/A").toUpperCase(),
          "Total Paid": d.paid || 0,
          "Remaining Balance": d.balance || 0,
          "Start Date": d.startDate || "N/A",
          "End Date": d.endDate || "N/A",
          "Last Posting": d.lastPostingDate || "No Postings",
          "Status": (d.status || "active").toUpperCase(),
        };
      });

      // Create Worksheet
      const ws = XLSX.utils.json_to_sheet(data);
      
      // Set Column Widths
      const wscols = [
        { wch: 10 }, // Acc No
        { wch: 25 }, // Name
        { wch: 25 }, // Father
        { wch: 20 }, // Village
        { wch: 15 }, // Phone
        { wch: 15 }, // Loan
        { wch: 10 }, // Interest
        { wch: 15 }, // Total
        { wch: 12 }, // Inst
        { wch: 12 }, // Freq
        { wch: 12 }, // Paid
        { wch: 15 }, // Balance
        { wch: 12 }, // Start
        { wch: 12 }, // End
        { wch: 15 }, // Last Post
        { wch: 10 }, // Status
      ];
      ws['!cols'] = wscols;

      // Create Workbook
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Accounts Ledger");

      // Download File
      const fileName = `Sri_Finance_${activeLineName.replace(/\s+/g, '_')}_Data_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);

      toast.success(`Exported ${data.length} accounts for ${activeLineName}`);
    } catch (err: any) {
      console.error("Export error:", err);
      toast.error(err.message || "Export failed. Check console for details.");
    } finally {
      setLoading(false);
    }
  };

  const exportAllLinesToExcel = async () => {
    if (userData?.role !== 'super_admin') {
        toast.error("Only Super Admin can export full portfolio data.");
        return;
    }

    setLoading(true);
    try {
      const wb = XLSX.utils.book_new();

      for (const line of lines) {
        const q = query(
          collection(db, "accounts"),
          where("lineId", "==", line.id)
        );
        const snap = await getDocs(q);
        
        if (!snap.empty) {
            const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
            list.sort((a, b) => {
                const numA = parseInt(a.accountNo, 10);
                const numB = parseInt(b.accountNo, 10);
                if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                return (a.accountNo || "").localeCompare(b.accountNo || "");
            });

            const data = list.map(d => {
                return {
                    "Account No": d.accountNo,
                    "Customer Name": d.name,
                    "Village": d.village || "N/A",
                    "Phone": d.phone || "N/A",
                    "Total Payable": d.totalAmount || 0,
                    "Paid": d.paid || 0,
                    "Balance": d.balance || 0,
                    "Status": d.status || "active"
                };
            });
            const ws = XLSX.utils.json_to_sheet(data);
            XLSX.utils.book_append_sheet(wb, ws, line.name.substring(0, 31)); // Sheet name limit
        }
      }

      XLSX.writeFile(wb, `Full_Portfolio_Backup_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success("Full portfolio backup generated successfully.");
    } catch (err) {
      toast.error("Full backup failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div className="flex items-center gap-4">
        <div className="h-14 w-14 rounded-2xl bg-slate-900 flex items-center justify-center shadow-xl">
           <Download className="text-accent h-7 w-7" />
        </div>
        <div>
          <h1 className="text-4xl font-black tracking-tight text-primary uppercase">Data Export Center</h1>
          <p className="text-muted-foreground font-bold flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            Secure Enterprise Data Management • {activeLineName}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {/* Line Specific Export */}
        <Card className="glass-card border-none shadow-2xl overflow-hidden hover:scale-[1.02] transition-all group">
           <CardHeader className="bg-slate-900 text-white p-6">
              <div className="flex justify-between items-center">
                 <CardTitle className="text-lg font-black uppercase tracking-widest flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-accent" />
                    Channel Export
                 </CardTitle>
                 <FileSpreadsheet className="h-8 w-8 text-accent/20 group-hover:text-accent transition-colors" />
              </div>
           </CardHeader>
           <CardContent className="p-8 space-y-6">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                 <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Target Line</p>
                 <p className="text-xl font-black text-primary">{activeLineName}</p>
              </div>
              <p className="text-sm text-slate-500 font-medium leading-relaxed">
                Export all active accounts, balances, and customer details for the selected operative channel into a formatted Excel spreadsheet.
              </p>
              <Button 
                onClick={exportToExcel} 
                disabled={loading || !selectedLineId}
                className="w-full h-14 bg-accent text-accent-foreground font-black uppercase tracking-widest text-[11px] shadow-xl hover:bg-slate-900 transition-all active:scale-95 gap-2"
              >
                {loading ? "Generating..." : <><Download size={16} /> Export Line Data</>}
              </Button>
           </CardContent>
        </Card>

        {/* Full Backup Export */}
        {(userData?.role === 'super_admin') && (
            <Card className="glass-card border-none shadow-2xl overflow-hidden hover:scale-[1.02] transition-all group border-t-4 border-t-emerald-500">
                <CardHeader className="bg-emerald-600 text-white p-6">
                    <div className="flex justify-between items-center">
                        <CardTitle className="text-lg font-black uppercase tracking-widest flex items-center gap-2">
                            <ShieldCheck className="h-5 w-5" />
                            Global Backup
                        </CardTitle>
                        <Download className="h-8 w-8 text-white/20 group-hover:text-white transition-colors" />
                    </div>
                </CardHeader>
                <CardContent className="p-8 space-y-6">
                    <p className="text-sm text-slate-500 font-medium leading-relaxed">
                        Generate a complete snapshot of all operational lines. Each line will be exported as a separate sheet in a single workbook.
                    </p>
                    <Button 
                        variant="outline"
                        onClick={exportAllLinesToExcel}
                        disabled={loading}
                        className="w-full h-14 border-2 border-emerald-500 text-emerald-600 font-black uppercase tracking-widest text-[11px] hover:bg-emerald-50 transition-all active:scale-95 gap-2"
                    >
                        {loading ? "Processing..." : <><FileSpreadsheet size={16} /> Full Portfolio Backup</>}
                    </Button>
                </CardContent>
            </Card>
        )}

        {/* Documentation / PDF placeholder */}
        <Card className="glass-card border-none shadow-2xl overflow-hidden opacity-50 cursor-not-allowed">
            <CardHeader className="bg-slate-100 p-6">
                <CardTitle className="text-lg font-black uppercase tracking-widest flex items-center gap-2 text-slate-400">
                    <FileText className="h-5 w-5" />
                    PDF Reports
                </CardTitle>
            </CardHeader>
            <CardContent className="p-8">
                <p className="text-sm text-slate-400 font-medium text-center py-10 italic">
                    Advanced PDF reporting engine coming soon...
                </p>
            </CardContent>
        </Card>
      </div>

      {/* Audit Log / Recent Exports */}
      <div className="mt-12">
          <div className="flex items-center gap-2 mb-6">
              <Search className="h-5 w-5 text-accent" />
              <h3 className="text-lg font-black uppercase tracking-widest text-primary">Data Export Guidelines</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                  <h4 className="font-black text-slate-800 mb-2 flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-accent" />
                      Formatting
                  </h4>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">
                      Files are generated in .xlsx format compatible with Microsoft Excel, Google Sheets, and Numbers. Columns are pre-sized for optimal readability.
                  </p>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                  <h4 className="font-black text-slate-800 mb-2 flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-emerald-500" />
                      Security
                  </h4>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">
                      All exports include sensitive financial data. Ensure downloaded files are stored securely and only shared with authorized personnel.
                  </p>
              </div>
          </div>
      </div>
    </motion.div>
  );
};

export default ExportPage;
