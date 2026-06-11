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
  console.log("Logging in...");
  await signInWithEmailAndPassword(auth, "sridevigroups3333@gmail.com", "Ashok@3333");
  console.log("Logged in.");

  console.log("Querying all accounts with accountNo == 43...");
  const snap = await getDocs(query(collection(db, "accounts"), where("accountNo", "==", "43")));
  console.log("Found accounts count:", snap.size);
  snap.forEach(doc => {
    console.log(`- Account Doc ID: ${doc.id}`);
    console.log(`  Name: ${doc.data().name}`);
    console.log(`  Paid: ${doc.data().paid}`);
    console.log(`  Balance: ${doc.data().balance}`);
    console.log(`  TotalAmount: ${doc.data().totalAmount}`);
    console.log(`  Status: ${doc.data().status}`);
    console.log(`  LineId: ${doc.data().lineId}`);
  });
}

check().catch(console.error);
