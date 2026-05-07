import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where } from "firebase/firestore";

// Config from src/lib/firebase.ts
const firebaseConfig = {
  apiKey: "AIzaSyAs7V4_Xy4V4V4V4V4V4V4V4V4V4V4V4V4",
  authDomain: "sri-finance-hub.firebaseapp.com",
  projectId: "sri-finance-hub",
  storageBucket: "sri-finance-hub.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef1234567890"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function check() {
  console.log("Checking database totals...");
  
  const accountsSnap = await getDocs(collection(db, "accounts"));
  console.log(`Total Accounts: ${accountsSnap.size}`);
  
  const linesSnap = await getDocs(collection(db, "lines"));
  console.log(`Total Lines: ${linesSnap.size}`);
  linesSnap.forEach(doc => {
    console.log(`Line: ${doc.id} - ${doc.data().name}`);
  });

  const sampleAcc = accountsSnap.docs[0]?.data();
  if (sampleAcc) {
    console.log("Sample Account:", JSON.stringify(sampleAcc, null, 2));
  }
}

check().catch(console.error);
