import { useState, useEffect, useRef } from "react";
import { Outlet, useLocation, Navigate, useNavigate } from "react-router-dom";
import AppSidebar from "@/components/AppSidebar";
import { Bell, Search, Settings, HelpCircle, MapPin, LogOut } from "lucide-react";
import { useLine } from "@/contexts/LineContext";
import { useAuth } from "@/contexts/AuthContext";
import { collection, getDocs, query, where, DocumentData } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { formatCurrency } from "@/lib/utils";

const DashboardLayout = () => {
  const location = useLocation();
  const { userData, logout } = useAuth();
  const { selectedLineId, lines, hasSelectedOnce } = useLine();
  const navigate = useNavigate();

  const [globalSearch, setGlobalSearch] = useState("");
  const [searchResults, setSearchResults] = useState<DocumentData[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

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
          .map(d => ({ id: d.id, ...d.data() as DocumentData }))
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
        <header className="h-20 bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 flex items-center justify-between z-30 shrink-0">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-slate-900 flex items-center justify-center text-white shadow-lg">
               <MapPin size={20} className="text-accent" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Active Channel</span>
              <h2 className="text-lg font-black text-slate-900 leading-none">{activeLineName}</h2>
            </div>
            <div className="h-8 w-[1px] bg-slate-200 mx-2" />
            <h2 className="text-lg font-black text-slate-400 capitalize tracking-tight">{pageName}</h2>
          </div>

          <div className="flex items-center gap-6">
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
                    searchResults.map(acc => (
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
            
            <div className="flex items-center gap-2">
              <button className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 hover:text-primary transition-all relative">
                <Bell size={20} />
                <span className="absolute top-2.5 right-2.5 h-2 w-2 bg-red-500 rounded-full border-2 border-white" />
              </button>
              <button className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 hover:text-primary transition-all">
                <HelpCircle size={20} />
              </button>
              <button className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 hover:text-primary transition-all">
                <Settings size={20} />
              </button>
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

        {/* Main Content Area (Scrollable) */}
        <main className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/30">
          <div className="w-full p-4 lg:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
