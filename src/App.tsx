import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { LineProvider } from "@/contexts/LineContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import DashboardLayout from "@/components/DashboardLayout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import NewAccount from "@/pages/NewAccount";
import DailyPosting from "@/pages/DailyPosting";
import Members from "@/pages/Members";
import PostingSearch from "@/pages/PostingSearch";
import CollectionExcess from "@/pages/CollectionExcess";
import DailyCollection from "@/pages/DailyCollection";
import Ledger from "@/pages/Ledger";
import Reports from "@/pages/Reports";
import AdvancedLists from "@/pages/AdvancedLists";
import ExportPage from "@/pages/ExportPage";
import ManageAdmins from "@/pages/ManageAdmins";
import ManageAgents from "@/pages/ManageAgents";
import BookPrint from "@/pages/BookPrint";
import DWMBook from "@/pages/DWMBook";
import WeeklyBook from "@/pages/WeeklyBook";
import WeeklyLineA4 from "@/pages/WeeklyLineA4";
import CollectionBook from "@/pages/CollectionBook";
import MonthlyChartDWM from "@/pages/MonthlyChartDWM";
import WeeklyDailyChart from "@/pages/WeeklyDailyChart";
import MobileExport from "@/pages/MobileExport";
import DailyData from "@/pages/DailyData";
import PaymentsExportImport from "@/pages/PaymentsExportImport";
import OldAccounts from "@/pages/OldAccounts";
import ShiftAccounts from "@/pages/ShiftAccounts";
import UpdateAccounts from "@/pages/UpdateAccounts";
import Calculator from "@/pages/Calculator";
import AgentAudit from "@/pages/AgentAudit";
import NotFound from "@/pages/NotFound";
import SetupSuperAdmin from "@/pages/SetupSuperAdmin";
import SeedData from "@/pages/SeedData";
import LineSelection from "@/pages/LineSelection";
import ManageVillages from "@/pages/ManageVillages";
import PostingVerification from "@/pages/PostingVerification";
import ExtraAmount from "@/pages/ExtraAmount";
import CompletedCustomers from "@/pages/CompletedCustomers";
import ActiveCustomers from "@/pages/ActiveCustomers";
import Profits from "@/pages/Profits";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <LanguageProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <AuthProvider>
            <LineProvider>
              <BrowserRouter>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/setup" element={<SetupSuperAdmin />} />
                <Route path="/select-line" element={<ProtectedRoute><LineSelection /></ProtectedRoute>} />
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/accounts/new" element={<ProtectedRoute allowedRoles={["super_admin", "admin", "partner", "agent"]}><NewAccount /></ProtectedRoute>} />
                  <Route path="/accounts/edit/:id" element={<ProtectedRoute allowedRoles={["super_admin", "admin", "partner"]}><NewAccount /></ProtectedRoute>} />
                  <Route path="/daily-posting" element={<DailyPosting />} />
                  <Route path="/extra-amount" element={<ProtectedRoute allowedRoles={["super_admin", "admin", "partner"]}><ExtraAmount /></ProtectedRoute>} />
                  <Route path="/members" element={<Members />} />
                  <Route path="/completed-customers" element={<CompletedCustomers />} />
                  <Route path="/active-customers" element={<ActiveCustomers />} />
                  <Route path="/posting-search" element={<PostingSearch />} />
                  <Route path="/collection-excess" element={<ProtectedRoute allowedRoles={["super_admin", "admin"]}><CollectionExcess /></ProtectedRoute>} />
                  <Route path="/daily-collection" element={<DailyCollection />} />
                  <Route path="/book-print" element={<ProtectedRoute allowedRoles={["super_admin", "admin"]}><BookPrint /></ProtectedRoute>} />
                  <Route path="/ledger" element={<ProtectedRoute allowedRoles={["super_admin", "admin", "partner", "agent"]}><Ledger /></ProtectedRoute>} />
                  <Route path="/reports" element={<ProtectedRoute allowedRoles={["super_admin", "admin", "partner", "agent"]}><Reports /></ProtectedRoute>} />
                  <Route path="/profits" element={<ProtectedRoute allowedRoles={["super_admin", "admin", "partner"]}><Profits /></ProtectedRoute>} />
                  <Route path="/advanced-lists" element={<ProtectedRoute allowedRoles={["super_admin", "admin"]}><AdvancedLists /></ProtectedRoute>} />
                  <Route path="/dwm-book" element={<ProtectedRoute allowedRoles={["super_admin", "admin", "partner", "agent"]}><DWMBook /></ProtectedRoute>} />
                  <Route path="/collection-book" element={<ProtectedRoute allowedRoles={["super_admin", "admin", "partner", "agent"]}><CollectionBook /></ProtectedRoute>} />
                  <Route path="/weekly-book" element={<ProtectedRoute allowedRoles={["super_admin", "admin"]}><WeeklyBook /></ProtectedRoute>} />
                  <Route path="/weekly-line-a4" element={<ProtectedRoute allowedRoles={["super_admin", "admin"]}><WeeklyLineA4 /></ProtectedRoute>} />
                  <Route path="/monthly-chart" element={<ProtectedRoute allowedRoles={["super_admin", "admin"]}><MonthlyChartDWM /></ProtectedRoute>} />
                  <Route path="/weekly-daily-chart" element={<ProtectedRoute allowedRoles={["super_admin", "admin"]}><WeeklyDailyChart /></ProtectedRoute>} />
                  <Route path="/mobile-export" element={<ProtectedRoute allowedRoles={["super_admin", "admin"]}><MobileExport /></ProtectedRoute>} />
                  <Route path="/daily-data" element={<ProtectedRoute allowedRoles={["super_admin", "admin"]}><DailyData /></ProtectedRoute>} />
                  <Route path="/payments-export" element={<ProtectedRoute allowedRoles={["super_admin", "admin"]}><PaymentsExportImport /></ProtectedRoute>} />
                  <Route path="/old-accounts" element={<ProtectedRoute allowedRoles={["super_admin"]}><OldAccounts /></ProtectedRoute>} />
                  <Route path="/shift-accounts" element={<ProtectedRoute allowedRoles={["super_admin"]}><ShiftAccounts /></ProtectedRoute>} />
                  <Route path="/update-accounts" element={<ProtectedRoute allowedRoles={["super_admin", "admin"]}><UpdateAccounts /></ProtectedRoute>} />
                  <Route path="/calculator" element={<Calculator />} />
                  <Route path="/export" element={<ProtectedRoute allowedRoles={["super_admin", "admin"]}><ExportPage /></ProtectedRoute>} />
                  <Route path="/admin/seed" element={<SeedData />} />
                  <Route path="/manage-admins" element={<ProtectedRoute allowedRoles={["super_admin"]}><ManageAdmins /></ProtectedRoute>} />
                  <Route path="/manage-villages" element={<ProtectedRoute allowedRoles={["super_admin", "admin", "partner"]}><ManageVillages /></ProtectedRoute>} />
                  <Route path="/manage-agents" element={<ProtectedRoute allowedRoles={["super_admin", "admin", "partner"]}><ManageAgents /></ProtectedRoute>} />
                  <Route path="/verify-postings" element={<ProtectedRoute allowedRoles={["super_admin", "admin", "partner"]}><PostingVerification /></ProtectedRoute>} />
                  <Route path="/agent-audit/:id" element={<ProtectedRoute allowedRoles={["super_admin", "admin"]}><AgentAudit /></ProtectedRoute>} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </LineProvider>
        </AuthProvider>
      </TooltipProvider>
    </LanguageProvider>
  </ThemeProvider>
</QueryClientProvider>
);

export default App;
