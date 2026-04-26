
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCu6ypGoJVlnDBj3XlZfdWnSVaNk_1gBUQ",
  authDomain: "sri-devi-finance.firebaseapp.com",
  projectId: "sri-devi-finance",
  storageBucket: "sri-devi-finance.firebasestorage.app",
  messagingSenderId: "524432572572",
  appId: "1:524432572572:web:f3e304354018ffb5432d59",
  measurementId: "G-NRPBH1174S"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function getStats() {
  const collections = ["accounts", "postings", "villages", "users", "audit_logs"];
  const stats = {};
  
  for (const name of collections) {
    const snap = await getDocs(collection(db, name));
    stats[name] = snap.size;
  }
  
  console.log(JSON.stringify(stats, null, 2));
}

getStats().catch(console.error);
