import { useState } from "react";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Database, Zap, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

const SeedData = () => {
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState<string[]>([]);

    const members = [
        { name: "Sumanadasa Perera", phone: "0771234567", village: "Galevela", category: "Daily" },
        { name: "Anura Priyantha", phone: "0777654321", village: "Matale", category: "Weekly" },
        { name: "Chaminda Silva", phone: "0712345678", village: "Dambulla", category: "Monthly" },
        { name: "Kasun Kalhara", phone: "0723456789", village: "Naula", category: "Daily" },
        { name: "Nimal Siripala", phone: "0754567890", village: "Galewela", category: "Weekly" },
        { name: "Sunil Shantha", phone: "0765678901", village: "Kandy", category: "Daily" },
        { name: "Bandara Kularatne", phone: "0786789012", village: "Matale", category: "Monthly" },
        { name: "Ranjith Premadasa", phone: "0707890123", village: "Dambulla", category: "Weekly" },
        { name: "Malinga Sameera", phone: "0748901234", village: "Galewela", category: "Daily" },
        { name: "Dilshan Mudalige", phone: "0799012345", village: "Naula", category: "Daily" }
    ];

    const runSeed = async () => {
        setLoading(true);
        setResults([]);
        try {
            const addedMembers = [];
            for (const m of members) {
                const memberRef = await addDoc(collection(db, "members"), {
                    ...m,
                    createdAt: new Date().toISOString(),
                    status: "active"
                });
                
                const accountNo = `ACC-${Math.floor(1000 + Math.random() * 9000)}`;
                const accountDate = new Date().toISOString();
                const accountRef = await addDoc(collection(db, "accounts"), {
                    memberId: memberRef.id,
                    memberName: m.name,
                    accountNo: accountNo,
                    totalAmount: 50000 + Math.floor(Math.random() * 50000),
                    paid: 0,
                    balance: 50000 + Math.floor(Math.random() * 50000), // Initialize balance properly
                    status: "active",
                    startDate: accountDate.split('T')[0],
                    createdAt: accountDate
                });
                
                addedMembers.push({ id: memberRef.id, name: m.name, accountNo: accountNo });
                setResults(prev => [...prev, `Created Member: ${m.name}`]);
            }

            // Create Postings for the last 7 days
            const agents = ["agent_test_1", "agent_test_2"];
            const now = new Date().toISOString();
            for (let i = 0; i < 30; i++) {
                const randomMember = addedMembers[Math.floor(Math.random() * addedMembers.length)];
                const postingDateObj = new Date();
                postingDateObj.setDate(postingDateObj.getDate() - Math.floor(Math.random() * 7));
                const postingDate = postingDateObj.toISOString().split('T')[0];
                
                await addDoc(collection(db, "postings"), {
                    memberId: randomMember.id,
                    memberName: randomMember.name,
                    accountNo: randomMember.accountNo,
                    amount: 500 + Math.floor(Math.random() * 2000),
                    date: postingDate,
                    status: "verified",
                    payMode: Math.random() > 0.5 ? "Cash" : "Online",
                    agentId: agents[Math.floor(Math.random() * agents.length)],
                    adminId: "master_admin_demo",
                    createdAt: now
                });
            }
            setResults(prev => [...prev, "Generated 30 Daily Postings across 7 days."]);
            toast.success("Database Seeding Successful");
        } catch (err: any) {
            toast.error(err.message);
            setResults(prev => [...prev, `Error: ${err.message}`]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto py-12">
            <Card className="glass-card shadow-2xl border-none">
                <CardHeader className="text-center">
                    <div className="h-16 w-16 bg-accent/20 rounded-2xl flex items-center justify-center mb-4 mx-auto animate-pulse">
                        <Database className="text-accent" size={32} />
                    </div>
                    <CardTitle className="text-3xl font-black text-primary uppercase tracking-tighter">System Stress Test</CardTitle>
                    <p className="text-slate-500 font-medium italic">Generate realistic financial telemetry for verification.</p>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 text-[11px] font-medium leading-relaxed text-slate-500">
                        <p className="flex items-center gap-2 text-primary font-black uppercase tracking-widest mb-1">
                            <Zap size={12} /> Execution Scope
                        </p>
                        This will inject 10 Member records, 10 Loan Accounts, and 30 Daily Posting slips into your Firestore database. Postings will be retroactively dated over the last 7 days to populate analytics trends.
                    </div>

                    <Button 
                        onClick={runSeed} 
                        disabled={loading} 
                        className="w-full h-14 bg-premium-gradient text-white font-black text-lg hover:scale-[1.02] transition-all shadow-xl border-none uppercase tracking-widest"
                    >
                        {loading ? "Seeding Real-time Data..." : "Execute Bulk Seeding"}
                    </Button>

                    <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar p-4 bg-black/5 rounded-xl border border-black/5 font-mono text-[10px]">
                        {results.length === 0 ? (
                            <p className="text-slate-400 italic">Waiting for execution sequence...</p>
                        ) : results.map((r, i) => (
                            <p key={i} className="flex items-center gap-2 text-slate-600">
                                {r.startsWith("Error") ? <AlertCircle size={10} className="text-destructive" /> : <CheckCircle2 size={10} className="text-emerald-500" />}
                                {r}
                            </p>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default SeedData;
