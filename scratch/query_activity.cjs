const { initializeApp } = require("firebase/app");
const { getAuth, signInWithEmailAndPassword } = require("firebase/auth");
const { getFirestore, collection, getDocs, query, orderBy, limit } = require("firebase/firestore");

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
  const snap = await getDocs(query(collection(db, "activity_logs"), orderBy("timestamp", "desc"), limit(20)));
  console.log("Recent activity logs count:", snap.size);
  snap.forEach(doc => {
    console.log(JSON.stringify(doc.data(), null, 2));
    console.log("------------------------");
  });
}

check().catch(console.error);
