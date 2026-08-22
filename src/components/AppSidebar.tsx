import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLine } from "@/contexts/LineContext";
import { useLanguage, TranslationKey } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import {
  IndianRupee, LayoutDashboard, UserPlus, FileText, Users, Search,
  TrendingUp, BookOpen, BarChart3, List, Download, LogOut, Menu, X,
  Wallet, UserCog, Printer, Calendar, LineChart, Database, MapPin,
  ArrowRightLeft, Edit, Calculator, ChevronRight, ShieldCheck, Zap,
  Globe, Sun, Moon
} from "lucide-react";
import { cn, isMenuAllowed } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface MenuItem {
  label: string;
  labelKey: TranslationKey;
  path: string;
  icon: React.ReactNode;
  roles: string[];
}

interface MenuSection {
  title: string;
  titleKey: TranslationKey;
  items: MenuItem[];
}

const menuSections: MenuSection[] = [
  {
    title: "Loan Operations",
    titleKey: "loanOperations",
    items: [
      { label: "Dashboard", labelKey: "dashboard", path: "/dashboard", icon: <LayoutDashboard size={18} />, roles: ["super_admin", "admin", "agent"] },
      { label: "New Account", labelKey: "newAccount", path: "/accounts/new", icon: <UserPlus size={18} />, roles: ["super_admin", "admin", "partner", "agent"] },
      { label: "Daily Posting", labelKey: "dailyPosting", path: "/daily-posting", icon: <Zap size={18} />, roles: ["super_admin", "admin", "agent"] },
      { label: "Collection Book", labelKey: "collectionBook", path: "/collection-book", icon: <BookOpen size={18} />, roles: ["super_admin", "admin", "partner", "agent"] },
      { label: "Members Registry", labelKey: "membersRegistry", path: "/members", icon: <Users size={18} />, roles: ["super_admin", "admin", "partner", "agent"] },
      { label: "Extra Amount", labelKey: "extraAmount", path: "/extra-amount", icon: <IndianRupee size={18} />, roles: ["super_admin", "admin", "partner"] },
    ]
  },
  {
    title: "Analytics & Reporting",
    titleKey: "analyticsReporting",
    items: [
      { label: "Accounts", labelKey: "accounts", path: "/accounts", icon: <Database size={18} />, roles: ["super_admin", "admin", "partner", "agent"] },
      { label: "Ledger", labelKey: "companyAccount", path: "/company-account", icon: <Wallet size={18} />, roles: ["super_admin", "admin", "partner"] },
      { label: "Customer Statement", labelKey: "masterLedger", path: "/ledger", icon: <BookOpen size={18} />, roles: ["super_admin", "admin", "partner", "agent"] },
      { label: "Daily Sheet", labelKey: "dailyData", path: "/daily-data", icon: <FileText size={18} />, roles: ["super_admin", "admin"] },
      { label: "Reports Engine", labelKey: "reportsEngine", path: "/reports", icon: <BarChart3 size={18} />, roles: ["super_admin", "admin", "partner", "agent"] },
      { label: "Profits Center", labelKey: "profitsCenter", path: "/profits", icon: <TrendingUp size={18} />, roles: ["super_admin", "admin", "partner"] },
    ]
  },
  {
    title: "Recovery Management",
    titleKey: "recoveryManagement",
    items: [
      { label: "Collection Portal", labelKey: "dailyCollection", path: "/daily-collection", icon: <Wallet size={18} />, roles: ["super_admin", "admin", "partner", "agent"] },
      { label: "Posting Approval", labelKey: "verifyPostings", path: "/verify-postings", icon: <ShieldCheck size={18} />, roles: ["super_admin", "admin", "partner"] },
      { label: "Search Archives", labelKey: "searchArchives", path: "/posting-search", icon: <Search size={18} />, roles: ["super_admin", "admin", "agent"] },
    ]
  },
  {
    title: "System Management",
    titleKey: "systemManagement",
    items: [
      { label: "Manage Villages", labelKey: "manageVillages", path: "/manage-villages", icon: <MapPin size={18} />, roles: ["super_admin", "admin", "partner"] },
      { label: "Manage Agents", labelKey: "manageAgents", path: "/manage-agents", icon: <Users size={18} />, roles: ["super_admin", "admin", "partner"] },
      { label: "Shift Accounts", labelKey: "shiftAccounts", path: "/shift-accounts", icon: <ArrowRightLeft size={18} />, roles: ["super_admin"] },
    ]
  }
];

const AppSidebar = () => {
  const { userData, logout } = useAuth();
  const { selectedLineId, lines, setSelectedLineId } = useLine();
  const { t, language, setLanguage } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const activeLine = lines.find(l => l.id === selectedLineId);
  const activeLineName = activeLine?.name || "Full Portfolio";

  const handleLogout = async () => {
    await logout();
    navigate("/login");
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
            <h1 className="text-xl font-black tracking-tighter text-white leading-none">SriDeviGroups Of Finance</h1>
            <span className="text-[10px] font-bold text-accent mt-1">Enterprise Hub</span>
          </div>
        </div>
      </div>

      {/* Operational Context Switcher */}
      {(userData?.role === "super_admin" || userData?.role === "admin" || (userData?.role === "agent" && (userData.lineIds?.length || 0) > 1)) && (
        <div className="px-6 py-6 border-b border-white/5 bg-white/5">
          <h3 className="text-[10px] font-black text-slate-400 mb-4">{t("channel")}</h3>
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
                <p className="text-[9px] font-bold text-slate-400 mt-0.5">Switch Line</p>
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
            userData ? isMenuAllowed(item.path, userData, item.roles) : false
          );

          if (authorizedItems.length === 0) return null;

          return (
            <div key={sidx} className="space-y-3">
              <h3 className="px-4 text-[9px] font-black text-slate-400 flex items-center gap-2">
                <span className="h-px w-4 bg-slate-800" />
                {t(section.titleKey)}
              </h3>
              <div className="space-y-1">
                {authorizedItems.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) => {
                      const isExactlyActive = isActive && (item.path.includes('?') ? location.search === item.path.split('?')[1] || `?${item.path.split('?')[1]}` === location.search : true);
                      return cn(
                        "group flex items-center gap-4 rounded-xl px-4 py-3 text-sm font-bold transition-all duration-500 relative overflow-hidden",
                        isExactlyActive
                          ? "bg-amber-500 text-slate-950 shadow-[0_10px_30px_rgba(245,158,11,0.25)] border border-white/20"
                          : "text-slate-400 hover:bg-white/5 hover:text-white"
                      );
                    }}
                  >
                    <span className="transition-all group-hover:scale-110 duration-500 opacity-80 group-hover:opacity-100">{item.icon}</span>
                    <span className="flex-1 truncate tracking-tight font-black text-[12px]">{t(item.labelKey)}</span>
                    <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-500" />

                    {/* Active Glow */}
                    <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="p-4 bg-black/40 border-t border-white/5 backdrop-blur-md">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-xs font-black text-slate-500 hover:bg-destructive hover:text-white transition-all duration-300 group"
        >
          <LogOut size={16} className="group-hover:-translate-x-1 transition-transform" />
          {t("logout")}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Interaction Bar */}
      <div className="lg:hidden fixed top-0 left-0 w-full h-16 bg-[#0F172A] border-b border-white/5 flex items-center justify-between px-4 z-40 shadow-2xl backdrop-blur-md bg-opacity-90">
        <div className="flex items-center">
          <button
            className="p-2 text-slate-400 hover:text-white active:scale-95 transition-all"
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={24} />
          </button>
          <div className="ml-2 flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-accent-gradient flex items-center justify-center shadow-lg">
              <IndianRupee className="h-4 w-4 text-white" />
            </div>
            <span className="font-black text-white text-md tracking-tighter">SriDeviGroups Of Finance</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Language Switcher */}
          <button
            onClick={() => setLanguage(language === "en" ? "te" : "en")}
            className="h-8 px-2 flex items-center justify-center rounded-lg bg-white/5 text-slate-200 text-[10px] font-black uppercase active:scale-95 transition-transform"
            title={t("language")}
          >
            <Globe size={14} className="mr-1 text-slate-200" />
            <span>{language === "en" ? "EN" : "తె"}</span>
          </button>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="h-8 w-8 flex items-center justify-center rounded-lg bg-white/5 text-slate-200 active:scale-95 transition-transform"
            title="Toggle Theme"
          >
            {theme === "light" ? <Moon size={14} className="text-slate-200" /> : <Sun size={14} className="text-amber-400" />}
          </button>

          <div className="h-6 w-[1px] bg-white/10 mx-0.5" />

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="flex items-center justify-center h-8 w-8 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 active:scale-95 transition-transform"
            title="Logout"
          >
            <LogOut size={14} />
          </button>
        </div>
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
