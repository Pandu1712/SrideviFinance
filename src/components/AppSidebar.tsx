import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLine } from "@/contexts/LineContext";
import {
  IndianRupee, LayoutDashboard, UserPlus, FileText, Users, Search,
  TrendingUp, BookOpen, BarChart3, List, Download, LogOut, Menu, X,
  Wallet, UserCog, Printer, Calendar, LineChart, Database, MapPin,
  ArrowRightLeft, Edit, Calculator, ChevronRight, ShieldCheck, Zap
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface MenuItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  roles: string[];
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

const menuSections: MenuSection[] = [
  {
    title: "Intelligence & Insight",
    items: [
      { label: "Dashboard", path: "/dashboard", icon: <LayoutDashboard size={18} />, roles: ["super_admin", "admin", "agent"] },
      { label: "Reports Engine", path: "/reports", icon: <BarChart3 size={18} />, roles: ["super_admin", "admin"] },
    ]
  },
  {
    title: "Financial Logistics",
    items: [
      { label: "Daily Posting", path: "/daily-posting", icon: <Zap size={18} />, roles: ["super_admin", "admin", "agent"] },
      { label: "Master Ledger", path: "/ledger", icon: <BookOpen size={18} />, roles: ["super_admin", "admin"] },
      { label: "New Account", path: "/accounts/new", icon: <UserPlus size={18} />, roles: ["super_admin", "admin", "agent"] },
      { label: "Members Registry", path: "/members", icon: <Users size={18} />, roles: ["super_admin", "admin", "agent"] },
    ]
  },
  {
    title: "Collection Matrix",
    items: [
      { label: "Collection Portal", path: "/daily-collection", icon: <Wallet size={18} />, roles: ["super_admin", "admin", "agent"] },
      { label: "Search Archives", path: "/posting-search", icon: <Search size={18} />, roles: ["super_admin", "admin", "agent"] },
      { label: "Growth Tracking", path: "/monthly-chart", icon: <TrendingUp size={18} />, roles: ["super_admin", "admin"] },
    ]
  },
  {
    title: "Advanced Printing",
    items: [
      { label: "Matrix A4 Print", path: "/weekly-line-a4", icon: <Printer size={18} />, roles: ["super_admin", "admin"] },
      { label: "Book Production", path: "/book-print", icon: <FileText size={18} />, roles: ["super_admin", "admin"] },
      { label: "D/W/M Audit", path: "/dwm-book", icon: <Calendar size={18} />, roles: ["super_admin", "admin"] },
    ]
  },
  {
    title: "Security & Ops",
    items: [
      { label: "System Data", path: "/daily-data", icon: <Database size={18} />, roles: ["super_admin", "admin"] },
      { label: "Maintenance", path: "/update-accounts", icon: <Edit size={18} />, roles: ["super_admin", "admin"] },
      { label: "Shift Logistics", path: "/shift-accounts", icon: <ArrowRightLeft size={18} />, roles: ["super_admin"] },
      { label: "Manage Agents", path: "/manage-agents", icon: <UserCog size={18} />, roles: ["super_admin", "admin"] },
      { label: "Manage Villages", path: "/manage-villages", icon: <MapPin size={18} />, roles: ["super_admin", "admin"] },
      { label: "Admin Control", path: "/manage-admins", icon: <ShieldCheck size={18} />, roles: ["super_admin"] },
    ]
  }
];

const AppSidebar = () => {
  const { userData, logout } = useAuth();
  const { selectedLineId, lines, setSelectedLineId } = useLine();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  
  const activeLine = lines.find(l => l.id === selectedLineId);
  const activeLineName = activeLine?.name || "Full Portfolio";

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const roleLabels = {
    super_admin: "System Architect",
    admin: "Executive Manager",
    agent: "Account Officer",
  };

  const sidebarContent = (
    <div className="flex h-full flex-col bg-[#0F172A] text-slate-100 border-r border-white/5 shadow-2xl overflow-hidden">
      {/* Premium Brand Header */}
      <div className="relative overflow-hidden px-6 py-10 bg-gradient-to-br from-white/5 to-transparent">
        <div className="absolute top-0 right-0 w-32 h-32 bg-accent/10 blur-[60px] rounded-full -mr-16 -mt-16" />
        <div className="flex items-center gap-4 relative z-10">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-gradient shadow-[0_0_20px_rgba(245,158,11,0.3)]">
            <IndianRupee className="h-6 w-6 text-white" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl font-black tracking-tighter text-white leading-none">Sridevi Finance</h1>
            <span className="text-[10px] font-bold text-accent tracking-[.25em] uppercase mt-1">Enterprise Hub</span>
          </div>
        </div>
      </div>

      {/* Operational Context Switcher */}
      {(userData?.role === "super_admin" || userData?.role === "admin" || (userData?.role === "agent" && (userData.lineIds?.length || 0) > 1)) && (
        <div className="px-6 py-6 border-b border-white/5 bg-white/5">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-4">Operative Channel</h3>
          <button 
            onClick={() => {
              setSelectedLineId(null);
              localStorage.removeItem("lineSelectedOnce");
              window.location.href = "/select-line"; // Redirect to selection page
            }}
            className="flex w-full items-center justify-between gap-3 p-4 rounded-2xl bg-[#0F172A] border border-accent/20 hover:border-accent transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
                <MapPin size={16} />
              </div>
              <div className="text-left">
                <p className="text-xs font-black text-white leading-tight">{activeLineName}</p>
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Switch Line</p>
              </div>
            </div>
            <ArrowRightLeft size={14} className="text-slate-600 group-hover:text-accent transition-colors" />
          </button>
        </div>
      )}

      {/* Navigation Space */}
      <nav className="flex-1 overflow-y-auto px-4 py-8 custom-scrollbar space-y-10">
        {menuSections.map((section, sidx) => {
          const authorizedItems = section.items.filter(item => 
            userData ? item.roles.includes(userData.role) : false
          );

          if (authorizedItems.length === 0) return null;

          return (
            <div key={sidx} className="space-y-4">
              <h3 className="px-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500/80">{section.title}</h3>
              <div className="space-y-1.5">
                {authorizedItems.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "group flex items-center gap-3 rounded-2xl px-4 py-3.5 text-sm font-bold transition-all duration-300",
                        isActive
                          ? "bg-accent text-accent-foreground shadow-lg shadow-accent/20"
                          : "text-slate-400 hover:bg-white/5 hover:text-white"
                      )
                    }
                  >
                    <span className="transition-transform group-hover:scale-125 duration-300">{item.icon}</span>
                    <span className="flex-1 truncate tracking-tight">{item.label}</span>
                    <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-300" />
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Integrated Profile & Logout */}
      <div className="p-4 bg-black/40 border-t border-white/5 backdrop-blur-md">
        <div className="bg-white/5 rounded-2xl p-4 mb-4 flex items-center gap-3 border border-white/5 group hover:bg-white/10 transition-all cursor-default">
          <div className="h-10 w-10 min-w-[40px] rounded-xl bg-slate-800 border border-white/10 flex items-center justify-center font-black text-accent shadow-inner">
            {userData?.name?.charAt(0) || "U"}
          </div>
          <div className="flex flex-col min-w-0">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{userData ? roleLabels[userData.role] : "System Access"}</p>
            <p className="text-sm font-bold text-white truncate max-w-[120px]">{userData?.name || "Anonymous User"}</p>
          </div>
        </div>
        
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-500 hover:bg-destructive hover:text-white transition-all duration-300 group"
        >
          <LogOut size={16} className="group-hover:-translate-x-1 transition-transform" />
          Terminate
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Interaction Bar */}
      <div className="lg:hidden fixed top-0 left-0 w-full h-20 bg-[#0F172A] border-b border-white/5 flex items-center justify-between px-6 z-40 shadow-2xl">
        <div className="flex items-center">
          <button
            className="p-3 -ml-3 text-slate-400 hover:text-white active:scale-95 transition-all"
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={28} />
          </button>
          <div className="ml-2 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-accent-gradient flex items-center justify-center shadow-lg">
              <IndianRupee className="h-5 w-5 text-white" />
            </div>
            <span className="font-black text-white text-lg tracking-tighter hidden sm:inline-block">Sridevi Finance</span>
            <span className="font-black text-white text-lg tracking-tighter sm:hidden">Sridevi</span>
          </div>
        </div>
        
        <button
          onClick={handleLogout}
          className="flex items-center justify-center h-10 w-10 rounded-xl bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white transition-all shadow-sm"
        >
          <LogOut size={18} />
        </button>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-md lg:hidden" 
            onClick={() => setMobileOpen(false)} 
          />
        )}
      </AnimatePresence>

      <div className={cn(
        "fixed inset-y-0 left-0 z-[70] w-72 transform transition-transform duration-500 cubic-bezier(0.16, 1, 0.3, 1) lg:hidden",
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {sidebarContent}
      </div>

      <div className="hidden lg:flex lg:w-72 lg:flex-shrink-0">
        <div className="w-72 h-full fixed inset-y-0 left-0">
          {sidebarContent}
        </div>
      </div>
    </>
  );
};

export default AppSidebar;
