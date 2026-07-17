const { initializeApp } = require("firebase/app");
const { getAuth, signInWithEmailAndPassword } = require("firebase/auth");
const { getFirestore, collection, getDocs, query, where } = require("firebase/firestore");

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
  const postQ = query(
    collection(db, "postings"), 
    where("date", ">=", "2026-07-01"), 
    where("date", "<=", "2026-07-31")
  );
  try {
    const snap = await getDocs(postQ);
    console.log("Postings count for date range:", snap.size);
  } catch (err) {
    console.error("Query failed:", err.message);
  }
}

check().catch(console.error);
