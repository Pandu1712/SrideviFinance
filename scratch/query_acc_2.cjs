const { initializeApp } = require("firebase/app");
const { getAuth, signInWithEmailAndPassword } = require("firebase/auth");
const { getFirestore, doc, getDoc } = require("firebase/firestore");

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
  const docRef = doc(db, "accounts", "O7ijWQKwSG6I4E5mWNmU");
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    console.log("Account Data:", JSON.stringify(snap.data(), null, 2));
  } else {
    console.log("Account not found!");
  }
}

check().catch(console.error);
