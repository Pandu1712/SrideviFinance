import { Outlet, useLocation, Navigate, useNavigate } from "react-router-dom";
import AppSidebar from "@/components/AppSidebar";
import { Bell, Search, Settings, HelpCircle, MapPin, LogOut } from "lucide-react";
import { useLine } from "@/contexts/LineContext";
import { useAuth } from "@/contexts/AuthContext";

const DashboardLayout = () => {
  const location = useLocation();
  const { userData, logout } = useAuth();
  const { selectedLineId, lines, hasSelectedOnce } = useLine();
  const navigate = useNavigate();

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
            <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-xl border border-slate-200">
              <Search size={16} className="text-slate-400" />
              <input type="text" placeholder="Global Search..." className="bg-transparent border-none outline-none text-xs font-bold w-48 text-slate-600 placeholder:text-slate-400" />
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
