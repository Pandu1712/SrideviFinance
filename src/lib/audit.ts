import { db } from "./firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export type AuditAction = 
  | "LOGIN" 
  | "LOGOUT" 
  | "MEMBER_CREATE" 
  | "MEMBER_DELETE" 
  | "POSTING_CREATE" 
  | "POSTING_DELETE" 
  | "LINE_CREATE" 
  | "LINE_DELETE" 
  | "LINE_UPDATE"
  | "EXPENSE_UPDATE"
  | "ACCOUNT_SHIFT";

export const logActivity = async (
  userId: string,
  userName: string,
  userRole: string,
  action: AuditAction,
  details: string,
  lineId?: string | null
) => {
  try {
    await addDoc(collection(db, "audit_logs"), {
      userId,
      userName,
      userRole,
      action,
      details,
      lineId: lineId || "global",
      timestamp: serverTimestamp(),
      date: new Date().toISOString().split("T")[0]
    });
  } catch (err) {
    console.error("Audit Log Failure:", err);
  }
};
