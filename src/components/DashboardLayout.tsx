import { useState, useEffect, useRef } from "react";
import { Outlet, useLocation, Navigate, useNavigate } from "react-router-dom";
import AppSidebar from "@/components/AppSidebar";
import { Bell, Search, Settings, HelpCircle, MapPin, LogOut, UserCog, Users, ShieldCheck, ChevronDown, X, Zap, LayoutDashboard, BookOpen, Wallet } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { useLine } from "@/contexts/LineContext";
import { useAuth } from "@/contexts/AuthContext";
import { collection, getDocs, query, where, DocumentData, onSnapshot, orderBy, limit, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { cn, formatCurrency } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const DashboardLayout = () => {
  const location = useLocation();
  const { userData, logout } = useAuth();
  const { selectedLineId, lines, hasSelectedOnce } = useLine();
  const navigate = useNavigate();

  const triggerHaptic = () => {
    if (window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(5);
    }
  };

  const navTo = (path: string) => {
    triggerHaptic();
    navigate(path);
  };

  const [globalSearch, setGlobalSearch] = useState("");
  const [searchResults, setSearchResults] = useState<DocumentData[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const [notifications, setNotifications] = useState<any[]>([]);

  // Real-time Notification Engine
  useEffect(() => {
    if (!userData || (userData.role !== 'admin' && userData.role !== 'super_admin')) return;

    // Listen to new pending postings (Agent Uploads)
    const q = query(
      collection(db, "postings"),
      where("status", "==", "pending"),
      limit(5)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const data = change.doc.data();

          // Only notify for very recent additions (within last 30 seconds to avoid initial sync flood)
          // We check if it's likely a new entry. Firestore timestamps are best but we check data
          const isNew = data.date === new Date().toISOString().split('T')[0];

          if (isNew) {
            const notifId = change.doc.id;
            setNotifications(prev => {
              if (prev.find(n => n.id === notifId)) return prev;
              return [{
                id: notifId,
                title: "Agent Upload",
                message: `${data.collectedByName || 'An agent'} uploaded ${formatCurrency(data.amount)} for ${data.memberName || 'a member'}.`,
                time: "Just Now",
                type: "upload"
              }, ...prev];
            });
          }
        }
      });
    });

    return () => unsubscribe();
  }, [userData]);

  const removeNotification = (id: any) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (globalSearch.trim() === "") {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      try {
        let accountsRef: any = collection(db, "accounts");
        if (selectedLineId) {
          accountsRef = query(accountsRef, where("lineId", "==", selectedLineId));
        }

        const snap = await getDocs(accountsRef);
        const term = globalSearch.toLowerCase();

        const results = snap.docs
          .map(d => ({ id: d.id, ...(d.data() as any) }))
          .filter(a =>
            a.name?.toLowerCase().includes(term) ||
            a.accountNo?.toLowerCase().includes(term) ||
            a.village?.toLowerCase().includes(term)
          )
          .slice(0, 8);

        setSearchResults(results);
        setShowDropdown(true);
      } catch (err) {
        console.error("Global search error:", err);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [globalSearch, selectedLineId]);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  // Logic: Mandatory Selection Step
  // Redirect to selection page if no line is selected and we aren't already there
  if (!selectedLineId && !hasSelectedOnce) {
    return <Navigate to="/select-line" replace />;
  }

  const pageName = location.pathname.split('/').pop()?.replace('-', ' ') || 'Dashboard';
  const activeLineName = lines.find(l => l.id === selectedLineId)?.name || 'Full Portfolio';

  // Focused Operative Mode: Bypass layout chrome for agents in the field
  const isAgentRecovery = userData?.role === 'agent' && location.pathname === '/daily-collection';

  if (isAgentRecovery) {
    return (
      <div className="h-screen bg-[#F5F7FB] overflow-hidden">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8FAFC]">
      <AppSidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Premium Top Bar */}
        <header className="h-16 lg:h-20 bg-white/80 backdrop-blur-md border-b border-slate-200 px-4 lg:px-6 flex items-center justify-between z-30 shrink-0">
          <div className="flex items-center gap-3 lg:gap-4">
            <div className="h-8 w-8 lg:h-10 lg:w-10 rounded-lg lg:rounded-xl bg-slate-900 flex items-center justify-center text-white shadow-lg">
              <MapPin size={16} className="text-accent lg:w-5 lg:h-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-[8px] lg:text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Channel</span>
              <h2 className="text-sm lg:text-lg font-black text-slate-900 leading-none truncate max-w-[120px] lg:max-w-none">{activeLineName}</h2>
            </div>
            <div className="h-6 lg:h-8 w-[1px] bg-slate-200 mx-1 lg:mx-2" />
            <h2 className="text-sm lg:text-lg font-black text-slate-400 capitalize tracking-tight truncate">{pageName}</h2>
          </div>

          <div className="flex items-center gap-2 lg:gap-6">
            <div ref={searchRef} className="relative hidden md:flex flex-col">
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-xl border border-slate-200 focus-within:bg-white focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20 transition-all shadow-sm">
                <Search size={16} className="text-slate-400" />
                <input
                  type="text"
                  placeholder="Global Search..."
                  value={globalSearch}
                  onChange={(e) => {
                    setGlobalSearch(e.target.value);
                    if (e.target.value.trim() !== "") setShowDropdown(true);
                  }}
                  onFocus={() => { if (globalSearch.trim() !== "") setShowDropdown(true); }}
                  className="bg-transparent border-none outline-none text-xs font-bold w-48 text-slate-600 placeholder:text-slate-400"
                />
                {isSearching && (
                  <div className="h-3 w-3 border-2 border-accent border-t-transparent rounded-full animate-spin ml-1"></div>
                )}
              </div>

              {/* Dropdown Overlay */}
              <div className={`absolute top-full right-0 mt-2 w-[350px] bg-white rounded-xl shadow-2xl border border-slate-100 overflow-hidden z-50 transition-all duration-200 origin-top-right ${showDropdown && globalSearch.trim() !== "" ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"}`}>
                <div className="p-3 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Search Results</p>
                  <p className="text-[9px] font-bold text-slate-400">{searchResults.length} matches</p>
                </div>
                <div className="max-h-[320px] overflow-y-auto custom-scrollbar">
                  {searchResults.length === 0 && !isSearching ? (
                    <div className="p-8 text-center flex flex-col items-center justify-center text-slate-400">
                      <Search size={24} className="mb-2 opacity-20" />
                      <span className="text-xs font-bold">No members found.</span>
                    </div>
                  ) : (
                    searchResults.map((acc: any) => (
                      <div
                        key={acc.id}
                        onClick={() => {
                          setShowDropdown(false);
                          setGlobalSearch("");
                          navigate(`/ledger?acc=${acc.accountNo}`);
                        }}
                        className="p-3 border-b border-slate-50 hover:bg-slate-50 cursor-pointer flex items-center justify-between group transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-lg bg-slate-100 flex items-center justify-center text-[11px] font-black text-slate-500 group-hover:bg-accent group-hover:text-white transition-colors">
                            {acc.accountNo}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-slate-700">{acc.name}</span>
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">{acc.village}</span>
                          </div>
                        </div>
                        <div className="text-right flex flex-col items-end">
                          <span className={`text-[11px] font-black ${acc.balance > 0 ? "text-rose-500" : "text-emerald-500"}`}>
                            {formatCurrency(acc.balance || 0)}
                          </span>
                          <span className="text-[8px] font-bold uppercase tracking-widest text-slate-400">Balance</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 lg:gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 hover:text-primary transition-all relative">
                    <Bell size={20} />
                    {notifications.length > 0 && (
                      <span className="absolute top-2.5 right-2.5 h-2 w-2 bg-red-500 rounded-full border-2 border-white animate-pulse" />
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80 glass-card border-slate-200 p-0 shadow-2xl z-[100] overflow-hidden">
                  <div className="p-4 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-900">Alert Center</h3>
                    <button
                      onClick={() => setNotifications([])}
                      className="text-[10px] font-black uppercase text-accent hover:text-primary transition-colors"
                    >
                      Clear All
                    </button>
                  </div>
                  <div className="max-h-[350px] overflow-y-auto custom-scrollbar">
                    {notifications.length === 0 ? (
                      <div className="p-10 text-center flex flex-col items-center justify-center text-slate-400">
                        <Bell size={32} className="mb-3 opacity-10" />
                        <span className="text-xs font-bold italic">No active alerts.</span>
                      </div>
                    ) : (
                      notifications.map(n => (
                        <div key={n.id} className="p-4 border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-default group relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeNotification(n.id);
                            }}
                            className="absolute top-4 right-4 h-5 w-5 rounded-md flex items-center justify-center bg-slate-100 text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-500 transition-all"
                          >
                            <X size={12} />
                          </button>
                          <div className="flex justify-between items-start mb-1 pr-6">
                            <div className="flex items-center gap-1.5">
                              <div className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
                              <span className="text-[10px] font-black uppercase tracking-tight text-slate-900">{n.title}</span>
                            </div>
                            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">{n.time}</span>
                          </div>
                          <p className="text-[11px] font-medium text-slate-600 leading-relaxed">{n.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>

              {(userData?.role === "super_admin" || userData?.role === "admin" || userData?.role === "partner") && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 hover:text-primary transition-all">
                      <Settings size={20} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 glass-card border-slate-200 p-2 shadow-2xl z-[100]">
                    <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 px-3 py-2">System Controls</DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-slate-100 mx-1" />

                    <DropdownMenuItem
                      onClick={() => navigate("/manage-agents?type=partner")}
                      className="rounded-lg gap-3 py-2.5 cursor-pointer focus:bg-slate-50"
                    >
                      <UserCog size={16} className="text-slate-400" />
                      <span className="text-xs font-bold text-slate-600">Manage Partner</span>
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      onClick={() => navigate("/manage-agents?type=agent")}
                      className="rounded-lg gap-3 py-2.5 cursor-pointer focus:bg-slate-50"
                    >
                      <Users size={16} className="text-slate-400" />
                      <span className="text-xs font-bold text-slate-600">Manage Agents</span>
                    </DropdownMenuItem>


                    {userData?.role === "super_admin" && (
                      <>
                        <DropdownMenuSeparator className="bg-slate-100 mx-1" />
                        <DropdownMenuItem
                          onClick={() => navigate("/manage-admins")}
                          className="rounded-lg gap-3 py-2.5 cursor-pointer focus:bg-slate-50"
                        >
                          <ShieldCheck size={16} className="text-indigo-500" />
                          <span className="text-xs font-black text-slate-700">Admin Control</span>
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <button
                onClick={handleLogout}
                className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-red-50 text-slate-400 hover:text-red-500 transition-all border border-transparent hover:border-red-100"
                title="Logout"
              >
                <LogOut size={20} />
              </button>
            </div>
          </div>
        </header>

      {/* Main Content with Page Transitions */}
      <main className="flex-1 lg:ml-64 p-4 lg:p-8 pb-24 lg:pb-8 overflow-x-hidden min-h-screen bg-slate-50/30">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="w-full h-full"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile Bottom Nav - REIMAGINED FOR NATIVE FEEL */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-[100] safe-area-bottom">
        <div className="absolute inset-0 bg-white/80 backdrop-blur-2xl border-t border-slate-100 shadow-[0_-10px_30px_rgba(0,0,0,0.05)]" />
        <div className="relative flex items-center justify-around h-16 px-2">
          <button
            onClick={() => navTo("/dashboard")}
            className={cn(
              "relative flex flex-col items-center gap-1.5 transition-all w-16",
              location.pathname === "/dashboard" ? "text-accent" : "text-slate-400"
            )}
          >
            <div className={cn("p-1.5 rounded-xl transition-all", location.pathname === "/dashboard" && "bg-accent/10")}>
              <LayoutDashboard size={20} />
            </div>
            <span className="text-[7px] font-black uppercase tracking-widest">Stats</span>
            {location.pathname === "/dashboard" && (
              <motion.div layoutId="activeDot" className="absolute -bottom-1 h-1 w-1 bg-accent rounded-full" />
            )}
          </button>

          <button
            onClick={() => navTo("/daily-posting")}
            className={cn(
              "relative flex flex-col items-center gap-1.5 transition-all w-16",
              location.pathname === "/daily-posting" ? "text-accent" : "text-slate-400"
            )}
          >
            <div className={cn("p-1.5 rounded-xl transition-all", location.pathname === "/daily-posting" && "bg-accent/10")}>
              <Zap size={20} />
            </div>
            <span className="text-[7px] font-black uppercase tracking-widest">Post</span>
            {location.pathname === "/daily-posting" && (
              <motion.div layoutId="activeDot" className="absolute -bottom-1 h-1 w-1 bg-accent rounded-full" />
            )}
          </button>

          <div className="relative w-16 flex justify-center">
            <motion.div 
              whileTap={{ scale: 0.9 }}
              onClick={() => navTo("/posting-search")}
              className={cn(
                "h-14 w-14 rounded-2xl flex items-center justify-center -mt-10 shadow-2xl border-4 border-white transition-all cursor-pointer relative z-10",
                location.pathname === "/posting-search" ? "bg-accent" : "bg-slate-900"
              )}
            >
              <Search size={22} className="text-white" />
              <div className="absolute inset-0 rounded-2xl bg-white/10 animate-pulse" />
            </motion.div>
          </div>

          <button
            onClick={() => navTo("/ledger")}
            className={cn(
              "relative flex flex-col items-center gap-1.5 transition-all w-16",
              location.pathname === "/ledger" ? "text-accent" : "text-slate-400"
            )}
          >
            <div className={cn("p-1.5 rounded-xl transition-all", location.pathname === "/ledger" && "bg-accent/10")}>
              <BookOpen size={20} />
            </div>
            <span className="text-[7px] font-black uppercase tracking-widest">Ledger</span>
            {location.pathname === "/ledger" && (
              <motion.div layoutId="activeDot" className="absolute -bottom-1 h-1 w-1 bg-accent rounded-full" />
            )}
          </button>

          {(userData?.role === "super_admin" || userData?.role === "admin" || userData?.role === "partner") ? (
            <Drawer>
              <DrawerTrigger asChild>
                <button
                  onClick={triggerHaptic}
                  className={cn(
                    "relative flex flex-col items-center gap-1.5 transition-all w-16",
                    location.pathname.includes("manage") ? "text-accent" : "text-slate-400"
                  )}
                >
                  <div className={cn("p-1.5 rounded-xl transition-all", location.pathname.includes("manage") && "bg-accent/10")}>
                    <Settings size={20} />
                  </div>
                  <span className="text-[7px] font-black uppercase tracking-widest">System</span>
                </button>
              </DrawerTrigger>
              <DrawerContent className="rounded-t-[2.5rem] border-none bg-white/95 backdrop-blur-xl">
                <div className="mx-auto w-12 h-1.5 bg-slate-200 rounded-full my-4" />
                <DrawerHeader className="text-left px-8">
                  <DrawerTitle className="text-2xl font-black italic tracking-tighter text-slate-900 uppercase">System Controls</DrawerTitle>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Operational Matrix Controls</p>
                </DrawerHeader>
                <div className="p-8 space-y-4 pb-12">
                   <div className="grid grid-cols-1 gap-3">
                      <button 
                        onClick={() => { navTo("/manage-agents?type=partner"); }}
                        className="flex items-center gap-4 p-4 rounded-3xl bg-slate-50 active:bg-slate-100 transition-all border border-slate-100"
                      >
                         <div className="h-12 w-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-accent"><UserCog size={20} /></div>
                         <div className="text-left">
                            <p className="text-xs font-black uppercase tracking-tight text-slate-800">Manage Partner</p>
                            <p className="text-[9px] font-bold text-slate-400">Enterprise stakeholder control</p>
                         </div>
                      </button>

                      <button 
                        onClick={() => { navTo("/manage-agents?type=agent"); }}
                        className="flex items-center gap-4 p-4 rounded-3xl bg-slate-50 active:bg-slate-100 transition-all border border-slate-100"
                      >
                         <div className="h-12 w-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-accent"><Users size={20} /></div>
                         <div className="text-left">
                            <p className="text-xs font-black uppercase tracking-tight text-slate-800">Manage Agents</p>
                            <p className="text-[9px] font-bold text-slate-400">Field force provisioning</p>
                         </div>
                      </button>

                      {userData?.role === "super_admin" && (
                        <button 
                          onClick={() => { navTo("/manage-admins"); }}
                          className="flex items-center gap-4 p-4 rounded-3xl bg-indigo-50 active:bg-indigo-100 transition-all border border-indigo-100"
                        >
                           <div className="h-12 w-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-indigo-500"><ShieldCheck size={20} /></div>
                           <div className="text-left">
                              <p className="text-xs font-black uppercase tracking-tight text-indigo-900">Admin Control</p>
                              <p className="text-[9px] font-bold text-indigo-400">Master system configuration</p>
                           </div>
                        </button>
                      )}
                   </div>
                </div>
              </DrawerContent>
            </Drawer>
          ) : (
            <button
              onClick={() => navTo("/daily-collection")}
              className={cn(
                "relative flex flex-col items-center gap-1.5 transition-all w-16",
                location.pathname === "/daily-collection" ? "text-accent" : "text-slate-400"
              )}
            >
              <div className={cn("p-1.5 rounded-xl transition-all", location.pathname === "/daily-collection" && "bg-accent/10")}>
                <Wallet size={20} />
              </div>
              <span className="text-[7px] font-black uppercase tracking-widest">Field</span>
              {location.pathname === "/daily-collection" && (
                <motion.div layoutId="activeDot" className="absolute -bottom-1 h-1 w-1 bg-accent rounded-full" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardLayout;
