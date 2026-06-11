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
  console.log("Logging in as Super Admin...");
  const cred = await signInWithEmailAndPassword(auth, "sridevigroups3333@gmail.com", "Ashok@3333");
  console.log("Logged in successfully! User UID:", cred.user.uid);

  console.log("Querying Account 43...");
  const accountsSnap = await getDocs(query(collection(db, "accounts"), where("accountNo", "==", "43")));
  
  if (accountsSnap.empty) {
    console.log("Account 43 not found.");
    return;
  }

  accountsSnap.forEach(doc => {
    console.log("Account 43 Doc ID:", doc.id);
    console.log("Account 43 Data:", JSON.stringify(doc.data(), null, 2));
  });

  const accId = accountsSnap.docs[0].id;
  console.log("Querying Postings for account 43...");
  const postingsSnap = await getDocs(query(collection(db, "postings"), where("accountId", "==", accId)));
  console.log("Total Postings found:", postingsSnap.size);

  const posts = [];
  postingsSnap.forEach(doc => {
    posts.push({ id: doc.id, ...doc.data() });
  });

  // Sort by date/timestamp
  posts.sort((a, b) => (a.date > b.date ? 1 : -1));
  console.log("All postings:");
  console.log(JSON.stringify(posts, null, 2));
}

check().catch(console.error);
