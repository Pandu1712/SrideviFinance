export interface Account {
  id: string;
  accountNo: string;
  name: string;
  fatherHusbandName: string;
  phone: string;
  village: string;
  occupation: string;
  guarantorName: string;
  guarantorPhone: string;
  installmentAmount: number;
  totalAmount: number;
  startDate: string;
  endDate: string;
  commission: number;
  agentId: string;
  adminId: string;
  paid: number;
  balance: number;
  status: "active" | "completed" | "expired";
  createdAt: string;
}

export interface DailyPosting {
  id: string;
  accountId: string;
  accountNo: string;
  date: string;
  amount: number;
  status: "collection" | "penalty";
  payMode: "cash" | "bank";
  agentId: string;
  adminId: string;
  memberName: string;
  createdAt: string;
}

export interface AdminUser {
  uid: string;
  email: string;
  name: string;
  phone: string;
  role: "admin";
  createdAt: string;
  createdBy: string;
}

export interface AgentUser {
  uid: string;
  email: string;
  name: string;
  phone: string;
  role: "agent";
  adminId: string;
  createdAt: string;
}
