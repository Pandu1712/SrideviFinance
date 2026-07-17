const { initializeApp } = require("firebase/app");
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
const db = getFirestore(app);

async function check() {
  const accountsSnap = await getDocs(query(collection(db, "accounts"), where("accountNo", "==", "2")));
  accountsSnap.forEach(doc => {
    console.log("Account 2 Doc ID:", doc.id);
    console.log("Account 2 Data:", JSON.stringify(doc.data(), null, 2));
  });

  if (!accountsSnap.empty) {
    const accId = accountsSnap.docs[0].id;
    const postingsSnap = await getDocs(query(collection(db, "postings"), where("accountId", "==", accId)));
    console.log("Postings for account 2 count:", postingsSnap.size);
    postingsSnap.forEach(doc => {
      console.log("Posting:", JSON.stringify(doc.data(), null, 2));
    });
  }
}

check().catch(console.error);
