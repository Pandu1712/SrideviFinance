import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLine } from "@/contexts/LineContext";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, query, where, doc, getDoc, updateDoc, orderBy, limit } from "firebase/firestore";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  Wallet, UserPlus, Calendar, Info, Calculator, UserCheck, IndianRupee, TrendingUp, Download, CreditCard, MapPin, Check, ChevronsUpDown, Plus, CheckCircle2,
  FileText, Upload, X, File, Image as ImageIcon
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { logActivity } from "@/lib/audit";

const accountSchema = z.object({
  accountNo: z.string().min(1, "Account number is required"),
  name: z.string().min(3, "Name must be at least 3 characters"),
  fatherHusbandName: z.string().optional(),
  phone: z.string().regex(/^[0-9]{10}$/, "Invalid phone number").optional().or(z.literal("")),
  village: z.string().optional(),
  occupation: z.string().optional(),
  documentsTaken: z.string().optional(),
  altPhone: z.string().optional(),
  documentCharge: z.string().optional(),
  guarantorName: z.string().optional(),
  guarantorPhone: z.string().optional(),
  loanAmount: z.string().min(1, "Loan amount is required"),
  interestAmount: z.string().min(1, "Interest amount is required"),
  customerLocation: z.string().optional(),
  paymentFrequency: z.enum(["daily", "weekly", "monthly"]),
  installmentAmount: z.string().min(1, "Required"),
  totalAmount: z.string().min(1, "Required"),
  startDate: z.string().min(1, "Required"),
  endDate: z.string().min(1, "Required"),
  paymentType: z.enum(["cash", "upi", "account"]),
  upiId: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  bankIfsc: z.string().optional(),
  commission: z.string().default("0"),
  initialPaid: z.string().default("0"),
  lineId: z.string().min(1, "Please select an operational line"),
  documents: z.array(z.object({
    url: z.string(),
    type: z.string(),
    description: z.string().optional()
  })).optional().default([]),
});

type AccountForm = z.infer<typeof accountSchema>;

const NewAccount = () => {
  const { userData } = useAuth();
  const { lines, selectedLineId } = useLine();
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;
  const [loading, setLoading] = useState(false);
  const [fetchingLocation, setFetchingLocation] = useState(false);
  const [villages, setVillages] = useState<any[]>([]);
  const [villageOpen, setVillageOpen] = useState(false);
  const [villageSearch, setVillageSearch] = useState("");
  const [showVillageDialog, setShowVillageDialog] = useState(false);
  const [newVillageData, setNewVillageData] = useState({
    name: "",
    mondalam: "",
    district: "",
    pincode: "",
    postOffice: ""
  });
  const [documents, setDocuments] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [docDescription, setDocDescription] = useState("");
  const [docType, setDocType] = useState("Aadhar Card");

  useEffect(() => {
    const fetchVillages = async () => {
      try {
        const snap = await getDocs(collection(db, "villages"));
        const list: any[] = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() as any }));
        list.sort((a, b) => a.name.localeCompare(b.name));
        setVillages(list);
      } catch (err) {
        console.error("Error fetching villages:", err);
      }
    };
    fetchVillages();
  }, []);

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }
    setFetchingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const url = `https://www.google.com/maps?q=${latitude},${longitude}`;
        setValue("customerLocation", url);
        toast.success("Current location captured!");
        setFetchingLocation(false);
      },
      (error) => {
        toast.error("Failed to get location: " + error.message);
        setFetchingLocation(false);
      },
      { enableHighAccuracy: true }
    );
  };

  const handleCreateVillage = async () => {
    if (!newVillageData.name.trim()) {
      toast.error("Village name is required");
      return;
    }
    setLoading(true);
    try {
      const docRef = await addDoc(collection(db, "villages"), {
        ...newVillageData,
        createdAt: new Date().toISOString(),
      });
      const newVillageObj = { id: docRef.id, ...newVillageData };
      setVillages(prev => [...prev, newVillageObj].sort((a, b) => a.name.localeCompare(b.name)));
      
      if (userData) {
        logActivity(
          userData.uid,
          userData.name,
          userData.role,
          "LINE_CREATE", // Reusing LINE_CREATE for structural geographic data
          `Added NEW Village: ${newVillageData.name} (${newVillageData.pincode}) to the master database`
        );
      }

      setValue("village", newVillageData.name);
      setShowVillageDialog(false);
      setVillageOpen(false);
      setVillageSearch("");
      setNewVillageData({ name: "", mondalam: "", district: "", pincode: "", postOffice: "" });
    } catch (err) {
      console.error("Error creating village:", err);
      toast.error("Failed to save village to database");
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const res = await uploadToCloudinary(file);
      const newDoc = {
        url: res.url,
        type: docType,
        description: docDescription
      };
      setDocuments(prev => [...prev, newDoc]);
      setDocDescription("");
      toast.success(`${docType} uploaded successfully`);
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setIsUploading(false);
      e.target.value = ""; // Reset input
    }
  };

  const removeDocument = (index: number) => {
    setDocuments(prev => prev.filter((_, i) => i !== index));
    toast.info("Document removed from list");
  };

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<AccountForm>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      startDate: new Date().toISOString().split("T")[0],
      commission: "0",
      paymentFrequency: "daily",
      interestAmount: "0",
      paymentType: "cash",
      customerLocation: "",
      documentsTaken: "",
      documentCharge: "0",
      altPhone: "",
    },
  });

  const loanAmount = watch("loanAmount");
  const interestAmount = watch("interestAmount");
  const paymentFrequency = watch("paymentFrequency");
  const installmentAmount = watch("installmentAmount");
  const totalAmount = watch("totalAmount");
  const startDate = watch("startDate");
  const paymentType = watch("paymentType");

  // Calculate Total Amount based on Principal and Direct Interest
  useEffect(() => {
    if (loanAmount && interestAmount) {
      const principal = parseFloat(loanAmount);
      const interest = parseFloat(interestAmount);
      if (!isNaN(principal) && !isNaN(interest)) {
        const total = principal + interest;
        setValue("totalAmount", total.toString());
      }
    }
  }, [loanAmount, interestAmount, setValue]);

  // Calculate End Date based on Total Amount, Installment, and Frequency
  useEffect(() => {
    if (installmentAmount && totalAmount && startDate && paymentFrequency) {
      const inst = parseFloat(installmentAmount);
      const total = parseFloat(totalAmount);
      if (inst > 0 && total > 0) {
        const tenureUnits = Math.ceil(total / inst);
        const start = new Date(startDate);
        const end = new Date(start);
        
        if (paymentFrequency === "daily") {
          end.setDate(start.getDate() + tenureUnits);
        } else if (paymentFrequency === "weekly") {
          end.setDate(start.getDate() + (tenureUnits * 7));
        } else if (paymentFrequency === "monthly") {
          end.setMonth(start.getMonth() + tenureUnits);
        }
        
        setValue("endDate", end.toISOString().split("T")[0]);
      }
    }
  }, [installmentAmount, totalAmount, startDate, paymentFrequency, setValue]);

  useEffect(() => {
    const fetchExisting = async () => {
      if (!id || !isEdit) return;
      if (userData?.role === 'agent') {
        toast.error("Agents cannot edit existing member data.");
        navigate('/members');
        return;
      }
      try {
        const snap = await getDoc(doc(db, "accounts", id));
        if (snap.exists()) {
          const data = snap.data();
          reset({
            ...data,
            loanAmount: String(data.loanAmount || ""),
            interestAmount: String(data.interestAmount || ""),
            installmentAmount: String(data.installmentAmount || ""),
            totalAmount: String(data.totalAmount || ""),
            commission: String(data.commission || "0"),
            documentCharge: String(data.documentCharge || "0"),
            initialPaid: String(data.initialPaid || "0"),
            customerLocation: data.customerLocation || "",
          } as any);
          if (data.documents) {
            setDocuments(data.documents);
          }
        }
      } catch (err) {
        toast.error("Failed to load account details");
      }
    };
    fetchExisting();
  }, [id, isEdit, reset]);

  const currentLineId = watch("lineId");
  useEffect(() => {
    const generateNextAccountNo = async () => {
      if (isEdit || !currentLineId) return;
      try {
        const q = query(collection(db, "accounts"), where("lineId", "==", currentLineId));
        const snap = await getDocs(q);
        
        if (snap.empty) {
          setValue("accountNo", "1");
        } else {
          const existingNumbers = new Set(
            snap.docs
              .map(d => parseInt(d.data().accountNo, 10))
              .filter(n => !isNaN(n) && n > 0)
          );
          let nextAccNo = 1;
          while (existingNumbers.has(nextAccNo) && nextAccNo <= 999) {
            nextAccNo++;
          }
          if (nextAccNo > 999) {
            toast.warning("Warning: Reached Account #999 limit for this line.");
          }
          setValue("accountNo", String(nextAccNo));
        }
      } catch (err) {
        console.error("Error generating account number:", err);
        setValue("accountNo", "1"); // Safe default
      }
    };

    generateNextAccountNo();
  }, [userData, isEdit, setValue, currentLineId]);

  // Set default lineId if selectedLineId is present and form doesn't have one
  useEffect(() => {
    if (selectedLineId && !isEdit) {
      setValue("lineId", selectedLineId);
    }
  }, [selectedLineId, isEdit, setValue]);

  const generatePDF = (data: any) => {
    const doc = new jsPDF();
    
    // Header
    doc.setFillColor(15, 23, 42); // #0F172A
    doc.rect(0, 0, 210, 40, "F");
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont("helvetica", "bold");
    doc.text("SRI FINANCE HUB", 105, 20, { align: "center" });
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Premium Financial Management Services", 105, 30, { align: "center" });
    
    // Account Summary Title
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Account Registration Receipt", 14, 55);
    
    doc.setDrawColor(245, 158, 11); // Accent color
    doc.setLineWidth(1);
    doc.line(14, 60, 60, 60);

    // Data for Tables
    const basicInfo = [
      ["Account Number", data.accountNo],
      ["Customer Name", data.name],
      ["Phone Number", data.phone || "N/A"],
      ["Village/Area", data.village || "N/A"],
      ["Occupation", data.occupation || "N/A"],
    ];

    const financeInfo = [
      ["Principal Amount", formatCurrency(data.loanAmount)],
      ["Interest Amount", formatCurrency(data.interestAmount)],
      ["Total Payable", formatCurrency(data.totalAmount)],
      ["Payment Type", data.paymentType?.toUpperCase()],
      ["Direction/Location", data.customerLocation || "N/A"],
    ];

    if (data.paymentType === "upi" && data.upiId) {
      financeInfo.push(["UPI ID", data.upiId]);
    } else if (data.paymentType === "account") {
      financeInfo.push(["A/C Number", data.bankAccountNumber || "N/A"]);
      financeInfo.push(["IFSC Code", data.bankIfsc || "N/A"]);
    }

    financeInfo.push(
      ["Frequency", data.paymentFrequency?.toUpperCase()],
      ["Installment", formatCurrency(data.installmentAmount)],
      ["Start Date", data.startDate],
      ["Tentative End Date", data.endDate],
    );

    autoTable(doc, {
      startY: 70,
      head: [["Field", "Details"]],
      body: basicInfo,
      theme: "striped",
      headStyles: { fillColor: [15, 23, 42], textColor: 255 },
    });

    doc.setFontSize(14);
    doc.text("Financing Details", 14, (doc as any).lastAutoTable.finalY + 15);

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 20,
      head: [["Field", "Value"]],
      body: financeInfo,
      theme: "grid",
      headStyles: { fillColor: [245, 158, 11] },
    });

    // Footer
    const finalY = (doc as any).lastAutoTable.finalY + 30;
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text("Authorized Signature", 14, finalY);
    doc.line(14, finalY + 10, 60, finalY + 10);
    doc.text("Customer Signature", 140, finalY);
    doc.line(140, finalY + 10, 190, finalY + 10);

    doc.setFontSize(8);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 105, 285, { align: "center" });

    const safeAccountNo = (data.accountNo || "NEW").replace(/[^a-zA-Z0-9]/g, "_");
    const safeName = (data.name || "Member").replace(/[^a-zA-Z0-9]/g, "_");
    const fileName = `Receipt_${safeAccountNo}_${safeName}.pdf`;

    doc.save(fileName);
    toast.success(`PDF ${fileName} Downloaded Successfully`);
  };

  const onSubmit = async (data: AccountForm) => {
    setLoading(true);
    try {
      if (!isEdit) {
        // Double check for duplicate account number in the same line
        const qDup = query(
          collection(db, "accounts"), 
          where("lineId", "==", data.lineId),
          where("accountNo", "==", data.accountNo)
        );
        const snapDup = await getDocs(qDup);
        if (!snapDup.empty) {
          toast.error(`Account Number ${data.accountNo} already exists in this line! Please use a unique number.`);
          setLoading(false);
          return;
        }
      }

      const total = parseFloat(data.totalAmount);
      const payload = {
        ...data,
        installmentAmount: parseFloat(data.installmentAmount),
        totalAmount: total,
        loanAmount: parseFloat(data.loanAmount),
        interestAmount: parseFloat(data.interestAmount),
        commission: parseFloat(data.commission) || 0,
        documentCharge: parseFloat(data.documentCharge || "0"),
        customerLocation: data.customerLocation || "",
        documents: documents,
      };

      if (isEdit && id) {
        await updateDoc(doc(db, "accounts", id), payload);
        toast.success("Account updated successfully");

        if (userData) {
          logActivity(
            userData.uid,
            userData.name,
            userData.role,
            "MEMBER_CREATE", // Using CREATE as general UPSERT log
            `Modified Account ${data.accountNo} for ${data.name}. New Balance: ${formatCurrency(total - (parseFloat(data.initialPaid || "0")))}`,
            data.lineId
          );
        }

        navigate("/members");
      } else {
        // Prevent duplicate account numbers within the same line
        const accQuery = query(
          collection(db, "accounts"),
          where("lineId", "==", data.lineId),
          where("accountNo", "==", data.accountNo)
        );
        const accSnap = await getDocs(accQuery);
        if (!accSnap.empty) {
          toast.error(`Account number ${data.accountNo} already exists in this line! Please use a different number.`);
          setLoading(false);
          return;
        }

        const initialPaidValue = parseFloat(data.initialPaid || "0");
        const newPayload = {
          ...payload,
          paid: initialPaidValue,
          balance: total - initialPaidValue,
          status: (total - initialPaidValue) <= 0 ? "completed" : "active",
          adminId: userData?.uid,
          createdAt: new Date().toISOString(),
        };
        await addDoc(collection(db, "accounts"), newPayload);
        toast.success("Account created successfully");

        if (userData) {
          logActivity(
            userData.uid,
            userData.name,
            userData.role,
            "MEMBER_CREATE",
            `Registered NEW Account ${data.accountNo} for ${data.name}. Total: ${formatCurrency(total)}`,
            data.lineId
          );
        }

        setDocuments([]);
        
        // Preserve operational context for rapid consecutive entry
        const savedLineId = data.lineId;
        const savedVillage = data.village;
        const savedFreq = data.paymentFrequency;
        const savedType = data.paymentType;
        const savedDate = data.startDate;
        const savedComm = data.commission;
        const savedDocChg = data.documentCharge;
        // Find next available account number to fill gaps
        const qLine = query(collection(db, "accounts"), where("lineId", "==", savedLineId));
        const snapLine = await getDocs(qLine);
        const existingNumbers = new Set(
          snapLine.docs
            .map(d => parseInt(d.data().accountNo, 10))
            .filter(n => !isNaN(n) && n > 0)
        );
        let nextAccNoInt = 1;
        while (existingNumbers.has(nextAccNoInt)) {
          nextAccNoInt++;
        }
        const nextAccNo = String(nextAccNoInt);

        reset({
          lineId: savedLineId,
          village: savedVillage,
          paymentFrequency: savedFreq,
          paymentType: savedType,
          startDate: savedDate,
          commission: savedComm,
          documentCharge: savedDocChg,
          accountNo: nextAccNo,
          loanAmount: "",
          interestAmount: "",
          installmentAmount: "",
          totalAmount: "",
          initialPaid: "0",
          name: "",
          phone: "",
          fatherHusbandName: "",
          occupation: "",
          altPhone: "",
          documentsTaken: "",
          customerLocation: "",
          guarantorName: "",
          guarantorPhone: "",
          upiId: "",
          bankAccountNumber: "",
          bankIfsc: "",
        });
        
        // Scroll to top for next entry
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (err: any) {
      toast.error(err.message || "Operation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-xl bg-premium-gradient flex items-center justify-center shadow-lg">
          <UserPlus className="text-white h-6 w-6" />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-[#0F172A]">
            {isEdit ? "Update Account" : "New Account"}
          </h1>
          <p className="text-muted-foreground font-medium">
            {isEdit ? `Modifying details for ${watch("accountNo")}` : "Register a new member with automated loan calculation."}
          </p>
        </div>
      </div>

      <Card className="glass-card overflow-hidden">
        <CardHeader className="bg-primary/5 border-b border-primary/10">
          <CardTitle className="text-xl flex items-center gap-2">
            <Info className="h-5 w-5 text-accent" />
            Basic Information
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Account Number *</Label>
                </div>
                <Input 
                  {...register("accountNo")} 
                  className={`finance-input ${errors.accountNo ? "border-destructive" : ""} ${!isEdit ? "bg-slate-50 font-bold text-primary" : ""}`}
                  placeholder="ACC-001"
                />
                {!isEdit && <p className="text-[10px] text-muted-foreground px-1 italic">Auto-generated</p>}
                {errors.accountNo && <p className="text-xs text-destructive mt-1">{errors.accountNo.message}</p>}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Customer Name *</Label>
                  {!isEdit && (userData?.role === 'super_admin' || userData?.role === 'admin') && (
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="sm" 
                      className="h-5 px-2 text-[10px] bg-slate-100 uppercase tracking-widest text-slate-500 hover:text-primary"
                      onClick={async () => {
                        const custName = watch("name");
                        const lineId = watch("lineId");
                        if (!lineId) {
                          toast.error("Please select an Operational Line first");
                          return;
                        }
                        if (!custName) {
                          toast.error("Enter a customer name to search");
                          return;
                        }
                        try {
                          const q = query(
                            collection(db, "accounts"), 
                            where("name", "==", custName), 
                            where("lineId", "==", lineId),
                            limit(1)
                          );
                          const snap = await getDocs(q);
                          if (!snap.empty) {
                            const oldData = snap.docs[0].data();
                            setValue("fatherHusbandName", oldData.fatherHusbandName || "");
                            setValue("phone", oldData.phone || "");
                            setValue("village", oldData.village || "");
                            setValue("occupation", oldData.occupation || "");
                            setValue("altPhone", oldData.altPhone || "");
                            setValue("customerLocation", oldData.customerLocation || "");
                            toast.success("Old customer details auto-filled!");
                          } else {
                            toast.error("No record found in this line");
                          }
                        } catch (err) {
                          toast.error("Search failed in this line");
                        }
                      }}
                    >
                      Search Old
                    </Button>
                  )}
                </div>
                <Input 
                  {...register("name")} 
                  className={`finance-input ${errors.name ? "border-destructive" : ""}`}
                  placeholder="Full Legal Name"
                />
                {errors.name && <p className="text-xs text-destructive mt-1">{errors.name.message}</p>}
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold">Father / Husband Name</Label>
                <Input {...register("fatherHusbandName")} className="finance-input" placeholder="Relation Name" />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Phone Number</Label>
                  {(userData?.role === 'super_admin' || userData?.role === 'admin') && (
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="sm" 
                      className="h-5 px-2 text-[10px] bg-slate-100 uppercase tracking-widest text-slate-500 hover:text-primary"
                      onClick={async () => {
                        const ph = watch("phone");
                        const lineId = watch("lineId");
                        if (!lineId) {
                          toast.error("Please select an Operational Line first");
                          return;
                        }
                        if (!ph || ph.length < 10) {
                          toast.error("Enter a valid 10-digit phone number first");
                          return;
                        }
                        try {
                          const q = query(
                            collection(db, "accounts"), 
                            where("phone", "==", ph), 
                            where("lineId", "==", lineId),
                            limit(1)
                          );
                          const snap = await getDocs(q);
                          if (!snap.empty) {
                            const oldData = snap.docs[0].data();
                            setValue("name", oldData.name || "");
                            setValue("fatherHusbandName", oldData.fatherHusbandName || "");
                            setValue("village", oldData.village || "");
                            setValue("occupation", oldData.occupation || "");
                            setValue("altPhone", oldData.altPhone || "");
                            setValue("customerLocation", oldData.customerLocation || "");
                            toast.success("Old customer details auto-filled!");
                          } else {
                            toast.error("No record found in this line");
                          }
                        } catch (err) {
                          toast.error("Search failed in this line");
                        }
                      }}
                    >
                      Search Old
                    </Button>
                  )}
                </div>
                <Input {...register("phone")} className="finance-input" placeholder="10-digit mobile" />
                {errors.phone && <p className="text-xs text-destructive mt-1">{errors.phone.message}</p>}
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold">Alternative Phone Number</Label>
                <Input {...register("altPhone")} className="finance-input" placeholder="Alt 10-digit mobile" />
              </div>

              <div className="space-y-2 flex flex-col">
                <Label className="text-sm font-semibold">Village / Area</Label>
                <div className="relative">
                  <Popover open={villageOpen} onOpenChange={setVillageOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={villageOpen}
                        className={cn("w-full justify-between finance-input h-11 bg-white font-normal text-left", !watch("village") && "text-muted-foreground")}
                      >
                        {watch("village") || "Select village..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput 
                          placeholder="Search or type new..." 
                          onValueChange={setVillageSearch}
                          value={villageSearch}
                        />
                        <CommandList>
                          <CommandEmpty className="p-0">
                            {villageSearch ? (
                              <div className="flex flex-col">
                                <Button 
                                  type="button" 
                                  variant="ghost" 
                                  className="w-full text-left justify-start rounded-none h-12 text-sm text-primary font-medium border-b border-slate-100"
                                  onClick={() => {
                                     setValue("village", villageSearch);
                                     setVillageOpen(false);
                                     setVillageSearch("");
                                  }}
                                >
                                  Use "{villageSearch}"
                                </Button>
                                {(userData?.role === 'super_admin' || userData?.role === 'admin') && (
                                  <Button 
                                    type="button" 
                                    variant="ghost" 
                                    className="w-full text-left justify-start rounded-none h-12 text-sm text-emerald-600 font-bold bg-emerald-50 hover:bg-emerald-100"
                                    onClick={() => {
                                      setNewVillageData(prev => ({ ...prev, name: villageSearch }));
                                      setShowVillageDialog(true);
                                    }}
                                  >
                                    <Plus size={14} className="mr-2" />
                                    Add Full Village Details
                                  </Button>
                                )}
                              </div>
                            ) : (
                              <div className="p-4 text-center text-sm text-muted-foreground">Type to search...</div>
                            )}
                          </CommandEmpty>
                          <CommandGroup>
                            {villages.map((v) => (
                              <CommandItem
                                key={v.id}
                                value={v.name}
                                onSelect={(currentValue) => {
                                  setValue("village", v.name); 
                                  setVillageOpen(false);
                                  setVillageSearch("");
                                }}
                                className="flex flex-col items-start py-3"
                              >
                                <div className="flex items-center w-full">
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4 shrink-0",
                                      watch("village") === v.name ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  <span className="font-bold uppercase">{v.name}</span>
                                  {v.pincode && <Badge variant="outline" className="ml-auto text-[9px] font-black h-4 px-1">{v.pincode}</Badge>}
                                </div>
                                {(v.mondalam || v.district) && (
                                  <span className="text-[10px] text-muted-foreground mt-1 ml-6 uppercase font-bold tracking-widest">
                                    {v.mondalam}{v.mondalam && v.district && ", "}{v.district}
                                  </span>
                                )}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <input type="hidden" {...register("village")} />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold">Occupation</Label>
                <Input {...register("occupation")} className="finance-input" placeholder="Business or Job" />
              </div>

              <div className="space-y-2 lg:col-span-2">
                <Label className="text-sm font-semibold">Documents Taken</Label>
                <Input {...register("documentsTaken")} className="finance-input" placeholder="e.g. Aadhar Card, Promissory Note, Blank Cheque" />
              </div>

              <div className="space-y-2 sm:col-span-2 lg:col-span-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold text-accent">Customer Location / Google Maps Link (for Agents)</Label>
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm" 
                    className="h-8 text-[10px] uppercase font-black tracking-widest bg-accent shadow-lg shadow-accent/20 text-white hover:bg-slate-900 border-none transition-all flex items-center gap-2"
                    onClick={handleGetLocation}
                    disabled={fetchingLocation}
                  >
                    <MapPin className="h-3 w-3" />
                    {fetchingLocation ? "Fetching GPS..." : "Find My Location"}
                  </Button>
                </div>
                <Input 
                  {...register("customerLocation")} 
                  className="finance-input border-accent/20 bg-accent/5" 
                  placeholder="Captured GPS link or manual address" 
                />
              </div>
            </div>

            <div className="border-t border-primary/10 pt-8">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Calculator className="h-5 w-5 text-accent" />
                Finance Details
              </h3>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-[#0F172A]">Principal Loan Amount (₹) *</Label>
                  <div className="relative">
                    <Wallet className="absolute left-3 top-3 h-4 w-4 text-primary/60" />
                    <Input 
                      type="text"
                      inputMode="decimal"
                      {...register("loanAmount")} 
                      className="pl-9 finance-input font-bold" 
                      placeholder="e.g. 10000"
                    />
                  </div>
                  {errors.loanAmount && <p className="text-[10px] text-destructive">{errors.loanAmount.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-[#0F172A]">Interest Amount (₹) *</Label>
                  <div className="relative">
                    <TrendingUp className="absolute left-3 top-3 h-4 w-4 text-primary/60" />
                    <Input 
                      type="text"
                      inputMode="decimal"
                      {...register("interestAmount")} 
                      className="pl-9 finance-input" 
                      placeholder="e.g. 25000"
                    />
                  </div>
                  {errors.interestAmount && <p className="text-[10px] text-destructive">{errors.interestAmount.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-[#0F172A]">Document Charge (₹)</Label>
                  <div className="relative">
                    <IndianRupee className="absolute left-3 top-3 h-4 w-4 text-primary/60" />
                    <Input 
                      type="text"
                      inputMode="decimal"
                      {...register("documentCharge")} 
                      className="pl-9 finance-input" 
                      placeholder="e.g. 500"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-[#0F172A]">Payment Frequency *</Label>
                  <Select onValueChange={(v: any) => setValue("paymentFrequency", v)} value={paymentFrequency}>
                    <SelectTrigger className="finance-input">
                      <SelectValue placeholder="Select frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-[#0F172A]">Installment Amount (₹) *</Label>
                  <div className="relative">
                    <IndianRupee className="absolute left-3 top-3 h-4 w-4 text-primary/60" />
                    <Input 
                      type="text"
                      inputMode="decimal"
                      {...register("installmentAmount")} 
                      className="pl-9 finance-input" 
                      placeholder="Amount per payment"
                    />
                  </div>
                  {errors.installmentAmount && <p className="text-[10px] text-destructive">{errors.installmentAmount.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-primary">Total Amount to Pay (₹)</Label>
                  <div className="relative">
                    <Calculator className="absolute left-3 top-3 h-4 w-4 text-primary" />
                    <Input 
                      type="text"
                      inputMode="decimal"
                      {...register("totalAmount")} 
                      className="pl-9 finance-input bg-emerald-50 border-emerald-200 font-black text-emerald-700" 
                      readOnly
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground px-1 italic">Auto-calculated (Principal + Interest)</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-emerald-600">Already Paid Amount (₹)</Label>
                  <div className="relative">
                    <CheckCircle2 className="absolute left-3 top-3 h-4 w-4 text-emerald-600" />
                    <Input 
                      type="text"
                      inputMode="decimal"
                      {...register("initialPaid")} 
                      className="pl-9 finance-input border-emerald-200 bg-emerald-50/50" 
                      placeholder="e.g. 5000"
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground px-1 italic">Initial deduction from total</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-[#0F172A]">Start Date *</Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-3 h-4 w-4 text-primary/60" />
                    <Input type="date" {...register("startDate")} className="pl-9 finance-input" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-[#0F172A]">End Date</Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-3 h-4 w-4 text-primary/60" />
                    <Input type="date" {...register("endDate")} className="pl-9 finance-input bg-muted/30" readOnly />
                  </div>
                  <p className="text-[10px] text-muted-foreground px-1 italic">Auto-calculated expiry</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-[#0F172A]">Payment Type *</Label>
                    <Select onValueChange={(v: any) => setValue("paymentType", v)} value={paymentType}>
                      <SelectTrigger className="finance-input">
                        <SelectValue placeholder="Payment mode" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash Payment</SelectItem>
                        <SelectItem value="upi">UPI Transfer</SelectItem>
                        <SelectItem value="account">Bank Account</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <AnimatePresence mode="wait">
                    {paymentType === "upi" && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-2 overflow-hidden"
                      >
                        <Label className="text-sm font-semibold text-primary">UPI ID Details</Label>
                        <Input 
                          {...register("upiId")} 
                          className="finance-input border-primary/20 bg-primary/5" 
                          placeholder="vpa@upi" 
                        />
                      </motion.div>
                    )}

                    {paymentType === "account" && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-4 overflow-hidden pt-2"
                      >
                        <div className="space-y-2">
                          <Label className="text-sm font-semibold text-primary">Account Number</Label>
                          <Input 
                            {...register("bankAccountNumber")} 
                            className="finance-input border-primary/20 bg-primary/5" 
                            placeholder="Bank A/C Number" 
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-semibold text-primary">IFSC Code</Label>
                          <Input 
                            {...register("bankIfsc")} 
                            className="finance-input border-primary/20 bg-primary/5 uppercase" 
                            placeholder="e.g. SBIN0001234" 
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {!selectedLineId && (
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-[#0F172A]">Assign Operational Line *</Label>
                    <Select 
                      onValueChange={(v) => setValue("lineId", v)} 
                      value={watch("lineId") || undefined}
                    >
                      <SelectTrigger className="finance-input">
                        <SelectValue placeholder="Select Line" />
                      </SelectTrigger>
                      <SelectContent>
                        {lines.map(line => (
                          <SelectItem key={line.id} value={line.id}>{line.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.lineId && <p className="text-[10px] text-destructive">{errors.lineId.message}</p>}
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-primary/10 pt-8">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-accent" />
                Guarantor Information
              </h3>
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Guarantor Name</Label>
                  <Input {...register("guarantorName")} className="finance-input" placeholder="Guarantor legal name" />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Guarantor Phone</Label>
                  <Input {...register("guarantorPhone")} className="finance-input" placeholder="10-digit mobile" />
                </div>
              </div>
            </div>

            <div className="border-t border-primary/10 pt-8">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-accent" />
                  Digital Credentials & Security
                </h3>
                <Badge className="bg-slate-900 text-white border-none font-black text-[8px] uppercase tracking-widest px-3 py-1">
                  Cloudinary Secure Storage
                </Badge>
              </div>

              <div className="grid gap-6 md:grid-cols-3 bg-slate-50/50 p-6 rounded-3xl border border-slate-100">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Document Type</Label>
                  <Select value={docType} onValueChange={setDocType}>
                    <SelectTrigger className="finance-input bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Aadhar Card">Aadhar Card</SelectItem>
                      <SelectItem value="PAN Card">PAN Card</SelectItem>
                      <SelectItem value="Security Cheque">Security Cheque</SelectItem>
                      <SelectItem value="Promissory Note">Promissory Note</SelectItem>
                      <SelectItem value="Other Document">Other Document</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Description / Note</Label>
                  <Input 
                    value={docDescription} 
                    onChange={e => setDocDescription(e.target.value)} 
                    className="finance-input bg-white" 
                    placeholder="e.g. Front side, Cheque No 123..." 
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Select File</Label>
                  <div className="relative group">
                    <input 
                      type="file" 
                      onChange={handleFileUpload}
                      disabled={isUploading}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed" 
                    />
                    <div className={cn(
                      "h-11 flex items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-all",
                      isUploading ? "bg-slate-100 border-slate-200" : "bg-white border-slate-200 group-hover:border-accent group-hover:bg-accent/5"
                    )}>
                      {isUploading ? (
                        <>
                          <div className="h-4 w-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                          <span className="text-xs font-black uppercase text-accent">Uploading...</span>
                        </>
                      ) : (
                        <>
                          <Upload size={16} className="text-slate-400 group-hover:text-accent" />
                          <span className="text-xs font-black uppercase text-slate-500 group-hover:text-accent">Upload Document</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Document Preview Grid */}
              {documents.length > 0 && (
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {documents.map((doc, idx) => (
                    <motion.div 
                      key={idx}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-start gap-4 relative group"
                    >
                      <button 
                        type="button"
                        onClick={() => removeDocument(idx)}
                        className="absolute -top-2 -right-2 h-6 w-6 bg-rose-500 text-white rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-20"
                      >
                        <X size={12} />
                      </button>
                      <div className="h-12 w-12 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                         {doc.type.includes('Image') || doc.url.match(/\.(jpg|jpeg|png|webp)$/i) ? (
                           <ImageIcon size={20} className="text-slate-400" />
                         ) : (
                           <File size={20} className="text-slate-400" />
                         )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black uppercase text-accent tracking-widest">{doc.type}</p>
                        <p className="text-xs font-bold text-slate-900 truncate mt-0.5">{doc.description || 'No description'}</p>
                        <a 
                          href={doc.url} 
                          target="_blank" 
                          rel="noreferrer"
                          className="text-[9px] font-black uppercase text-slate-400 hover:text-primary transition-colors flex items-center gap-1 mt-2"
                        >
                          <Download size={10} /> View Document
                        </a>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-8 p-6 bg-slate-900 rounded-3xl text-white shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-accent/10 blur-[100px] rounded-full -mr-32 -mt-32" />
              <div className="flex justify-between items-start relative z-10">
                <div className="space-y-6 flex-1">
                  <h4 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Financing Summary</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                    <div>
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Taken Amount</p>
                      <p className="text-2xl font-black text-white">{loanAmount ? formatCurrency(parseFloat(loanAmount)) : "₹0"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Interest Amount</p>
                      <p className="text-2xl font-black text-accent">{interestAmount ? formatCurrency(parseFloat(interestAmount)) : "₹0"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Payable</p>
                      <p className="text-2xl font-black text-emerald-400">{totalAmount ? formatCurrency(parseFloat(totalAmount)) : "₹0"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Tenure ({paymentFrequency})</p>
                      <p className="text-2xl font-black text-blue-400">
                        {installmentAmount && totalAmount ? Math.ceil(parseFloat(totalAmount) / parseFloat(installmentAmount)) : "0"} {paymentFrequency === "daily" ? "Days" : paymentFrequency === "weekly" ? "Weeks" : "Months"}
                      </p>
                    </div>
                  </div>
                </div>
                
                <Button 
                  type="button" 
                  onClick={() => generatePDF(watch())}
                  className="bg-white/10 hover:bg-white/20 text-white gap-2 border border-white/10"
                >
                  <Download size={16} />
                  Download PDF
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-end border-t border-primary/10 pt-6">
              <div className="flex gap-4">
                <Button variant="outline" type="button" onClick={() => reset()} disabled={loading}>
                  Reset Form
                </Button>
                <Button 
                  type="submit" 
                  className="flex-1 premium-gradient text-white h-12 rounded-xl shadow-lg border-none font-bold text-lg"
                  disabled={loading}
                >
                  {loading ? "Processing..." : (isEdit ? "Update Member Account" : "Create Account & Activate")}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </motion.div>

      <Dialog open={showVillageDialog} onOpenChange={setShowVillageDialog}>
        <DialogContent className="sm:max-w-[425px] rounded-3xl border-none shadow-2xl overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 blur-3xl -mr-16 -mt-16" />
          <DialogHeader className="relative z-10">
            <DialogTitle className="text-2xl font-black text-primary">New Village Details</DialogTitle>
            <DialogDescription className="font-medium text-slate-500">
              Add comprehensive area details for the central registry.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 relative z-10">
            <div className="space-y-2">
              <Label className="text-sm font-bold">Village Name *</Label>
              <Input 
                value={newVillageData.name} 
                onChange={e => setNewVillageData(p => ({ ...p, name: e.target.value }))}
                className="finance-input font-bold uppercase"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-bold">Mondalam</Label>
                <Input 
                  value={newVillageData.mondalam} 
                  onChange={e => setNewVillageData(p => ({ ...p, mondalam: e.target.value }))}
                  className="finance-input uppercase text-xs"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-bold">District</Label>
                <Input 
                  value={newVillageData.district} 
                  onChange={e => setNewVillageData(p => ({ ...p, district: e.target.value }))}
                  className="finance-input uppercase text-xs"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-bold">PIN Code</Label>
                <Input 
                  value={newVillageData.pincode} 
                  onChange={e => setNewVillageData(p => ({ ...p, pincode: e.target.value }))}
                  className="finance-input text-xs"
                  placeholder="6-digit"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-bold">Post Office</Label>
                <Input 
                  value={newVillageData.postOffice} 
                  onChange={e => setNewVillageData(p => ({ ...p, postOffice: e.target.value }))}
                  className="finance-input text-xs"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="relative z-10">
            <Button 
              onClick={handleCreateVillage} 
              className="w-full premium-gradient text-white font-bold h-12 rounded-xl shadow-lg border-none"
              disabled={loading}
            >
              {loading ? "Saving..." : "Add to Database"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default NewAccount;
