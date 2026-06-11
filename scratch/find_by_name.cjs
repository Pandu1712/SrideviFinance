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
  const snap = await getDocs(collection(db, "accounts"));
  console.log("Total accounts in DB:", snap.size);
  snap.forEach(doc => {
    const data = doc.data();
    if (data.name.toLowerCase().includes("pinninti") || data.name.toLowerCase().includes("anandrao")) {
      console.log(`Match: ${doc.id} - ${data.name} (Acc: ${data.accountNo}, Paid: ${data.paid}, Balance: ${data.balance}, Status: ${data.status}, LineId: ${data.lineId})`);
    }
  });
}

check().catch(console.error);
