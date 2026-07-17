import React, { createContext, useContext, useState, useEffect } from "react";

export type Language = "en" | "te";

export type TranslationKey = 
  | "dashboard" | "dailyPosting" | "dailyCollection" | "masterLedger" | "collectionBook" | "newAccount" | "extraAmount" | "membersRegistry" | "verifyPostings" | "searchArchives" | "manageVillages" | "manageAgents" | "reportsEngine" | "profitsCenter" | "adminControl" | "logout" | "channel" | "systemControls" | "language" | "english" | "telugu" | "shiftAccounts" | "companyAccount"
  // General UI labels
  | "accountNo" | "name" | "village" | "amount" | "paid" | "balance" | "totalDebt" | "recovered" | "repaymentVelocity" | "options" | "actions" | "save" | "cancel" | "loading" | "outstanding" | "notes" | "note" | "search" | "submit" | "date" | "status" | "add" | "edit" | "delete" | "verify"
  // Section Titles
  | "analyticsReporting" | "loanOperations" | "recoveryManagement" | "systemManagement"
  // Login & Select Line
  | "loginTitle" | "loginSubtitle" | "selectLineTitle" | "selectLineSubtitle" | "enterPassword" | "rememberMe" | "signIn" | "selectPortfolioLine" | "fullPortfolio";

const translations: Record<Language, Record<TranslationKey, string>> = {
  en: {
    dashboard: "Dashboard",
    dailyPosting: "Daily Posting",
    dailyCollection: "Daily Collection",
    masterLedger: "Master Ledger",
    collectionBook: "Collection Book",
    newAccount: "New Account",
    extraAmount: "Extra Amount",
    membersRegistry: "Members Registry",
    verifyPostings: "Posting Approval",
    searchArchives: "Search Archives",
    manageVillages: "Manage Villages",
    shiftAccounts: "Shift Accounts",
    manageAgents: "Manage Agents",
    reportsEngine: "Reports Engine",
    profitsCenter: "Profits Center",
    companyAccount: "Company Account",
    adminControl: "Admin Control",
    logout: "Logout",
    channel: "Channel",
    systemControls: "System Controls",
    language: "Language",
    english: "English",
    telugu: "Telugu (తెలుగు)",
    accountNo: "Account No",
    name: "Name",
    village: "Village",
    amount: "Amount",
    paid: "Paid",
    balance: "Balance",
    totalDebt: "Total Debt",
    recovered: "Recovered",
    repaymentVelocity: "Repayment Velocity",
    options: "Options",
    actions: "Actions",
    save: "Save",
    cancel: "Cancel",
    loading: "Loading...",
    outstanding: "Outstanding",
    notes: "Notes",
    note: "Note",
    search: "Search",
    submit: "Submit",
    date: "Date",
    status: "Status",
    add: "Add",
    edit: "Edit",
    delete: "Delete",
    verify: "Verify",
    analyticsReporting: "Analytics & Reporting",
    loanOperations: "Loan Operations",
    recoveryManagement: "Recovery Management",
    systemManagement: "System Management",
    loginTitle: "SriDeviGroups Of Finance",
    loginSubtitle: "Enterprise Hub",
    selectLineTitle: "Select Channel",
    selectLineSubtitle: "Select portfolio line to manage",
    enterPassword: "Enter Password",
    rememberMe: "Remember Me",
    signIn: "Sign In",
    selectPortfolioLine: "Select Portfolio Line",
    fullPortfolio: "Full Portfolio",
  },
  te: {
    dashboard: "డ్యాష్‌బోర్డ్ (Dashboard)",
    dailyPosting: "రోజువారీ పోస్టింగ్ (Daily Posting)",
    dailyCollection: "రోజువారీ కలెక్షన్ (Daily Collection)",
    masterLedger: "ఖాతా పుస్తకం (Master Ledger)",
    collectionBook: "వసూలు పుస్తకం (Collection Book)",
    newAccount: "కొత్త खाता (New Account)",
    extraAmount: "అదనపు మొత్తం (Extra Amount)",
    membersRegistry: "సభ్యుల వివరాలు (Members Registry)",
    verifyPostings: "పోస్టింగ్ వెరిఫికేషన్ (Posting Approval)",
    searchArchives: "పోస్టింగ్ శోధన (Search Archives)",
    manageVillages: "గ్రామాల నిర్వహణ (Manage Villages)",
    shiftAccounts: "ఖాతాల మార్పిడి (Shift Accounts)",
    manageAgents: "ఏజెంట్ల నిర్వహణ (Manage Agents)",
    reportsEngine: "నివేదికలు (Reports Engine)",
    profitsCenter: "లాభాల వివరాలు (Profits Center)",
    companyAccount: "సంస్థ ఖాతా (Company Account)",
    adminControl: "అడ్మిన్ నియంత్రణ (Admin Control)",
    logout: "లాగ్ అవుట్ (Logout)",
    channel: "లైన్ / ఛానెల్",
    systemControls: "సిస్టమ్ సెట్టింగ్స్",
    language: "భాష (Language)",
    english: "English",
    telugu: "తెలుగు (Telugu)",
    accountNo: "ఖాతా సంఖ్య",
    name: "పేరు",
    village: "గ్రామం",
    amount: "మొత్తం",
    paid: "చెల్లించినది",
    balance: "బాకీ (Balance)",
    totalDebt: "మొత్తం అప్పు",
    recovered: "వసూలైనది",
    repaymentVelocity: "వసూలు శాతం",
    options: "ఆప్షన్లు",
    actions: "చర్యలు",
    save: "సేవ్ చేయి",
    cancel: "రద్దు చేయి",
    loading: "లోడ్ అవుతోంది...",
    outstanding: "మిగిలిన బాకీ",
    notes: "గమనికలు (Notes)",
    note: "గమనిక",
    search: "వెతుకు (Search)",
    submit: "సమర్పించు",
    date: "తేదీ",
    status: "స్థితి",
    add: "జతచేయి",
    edit: "సవరించు",
    delete: "తొలగించు",
    verify: "ధృవీకరించు",
    analyticsReporting: "విశ్లేషణ & నివేదికలు",
    loanOperations: "రుణ కార్యకలాపాలు",
    recoveryManagement: "వసూలు నిర్వహణ",
    systemManagement: "వ్యవస్థ నిర్వహణ",
    loginTitle: "శ్రీదేవి గ్రూప్స్ ఫైనాన్స్",
    loginSubtitle: "ఎంటర్‌ప్రైజ్ హబ్",
    selectLineTitle: "లైన్ ఎంచుకోండి",
    selectLineSubtitle: "నిర్వహించడానికి పోర్ట్‌ఫోలియో లైన్‌ను ఎంచుకోండి",
    enterPassword: "పాస్‌వర్డ్ నమోదు చేయండి",
    rememberMe: "గుర్తుంచుకో",
    signIn: "లాగిన్ అవ్వండి",
    selectPortfolioLine: "పోర్ట్‌ఫోలియో లైన్‌ను ఎంచుకోండి",
    fullPortfolio: "మొత్తం పోర్ట్‌ఫోలియో",
  },
};

interface LanguageContextProps {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextProps | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem("language") as Language | null;
    return saved === "te" ? "te" : "en";
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("language", lang);
  };

  const t = (key: TranslationKey): string => {
    return translations[language][key] || translations["en"][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
};
