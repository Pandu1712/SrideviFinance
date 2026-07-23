const { initializeApp } = require("firebase/app");
const { getAuth, signInWithEmailAndPassword } = require("firebase/auth");
const { getFirestore, doc, getDoc, updateDoc, collection, getDocs, query, where } = require("firebase/firestore");

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

async function fix() {
  await signInWithEmailAndPassword(auth, "sridevigroups3333@gmail.com", "Ashok@3333");
  const accountId = "IYazjyE3Zshl5WEHWsO2";
  
  const docRef = doc(db, "accounts", accountId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) {
    console.log("Account not found!");
    return;
  }
  
  const data = snap.data();
  console.log("Original Paid:", data.paid, "Original Balance:", data.balance);

  const pq = query(collection(db, "postings"), where("accountId", "==", accountId));
  const pSnap = await getDocs(pq);
  
  const subsequentCollections = pSnap.docs.filter(d => {
    const pData = d.data();
    return pData.status === "collection" && pData.isInitial !== true && pData.verified !== false;
  });

  const subsequentPaid = subsequentCollections.reduce((sum, doc) => {
    return sum + (parseFloat(String(doc.data().amount || "0")) || 0);
  }, 0);

  const newInitialPaid = parseFloat(data.initialPaid || "0");
  const newPaid = newInitialPaid + subsequentPaid;
  const newBalance = Math.max(0, data.totalAmount - newPaid);
  const newStatus = newBalance <= 0 ? "completed" : "active";

  console.log("Updating to Paid:", newPaid, "Balance:", newBalance, "Status:", newStatus);

  await updateDoc(docRef, {
    paid: newPaid,
    balance: newBalance,
    status: newStatus
  });

  console.log("Account successfully updated and reconciled!");
}

fix().catch(console.error);
