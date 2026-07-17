const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs, query, where } = require("firebase/firestore");
const { getAuth, signInWithEmailAndPassword } = require("firebase/auth");

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
const auth = getAuth(app);
const db = getFirestore(app);

async function check() {
  await signInWithEmailAndPassword(auth, "sridevigroups3333@gmail.com", "Ashok@3333");
  console.log("Signed in successfully!");

  const dateStr = new Date().toISOString().split("T")[0]; // Wait, let's look at the date in the screenshot: 17 Jul 2026.
  const targetDate = "2026-07-17";
  
  console.log("Checking expenses_log for date:", targetDate);
  const q = query(collection(db, "expenses_log"), where("date", "==", targetDate));
  const snap = await getDocs(q);
  snap.forEach(d => {
    console.log("LOG ID:", d.id, d.data());
  });

  console.log("\nChecking day_summaries for date:", targetDate);
  const q2 = query(collection(db, "day_summaries"), where("date", "==", targetDate));
  const snap2 = await getDocs(q2);
  snap2.forEach(d => {
    console.log("SUMMARY ID:", d.id, d.data());
  });
}

check().catch(console.error);
