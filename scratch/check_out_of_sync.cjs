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
  
  console.log("Fetching all accounts...");
  const accountsSnap = await getDocs(collection(db, "accounts"));
  console.log("Total accounts:", accountsSnap.size);

  let outOfSyncCount = 0;

  for (const accDoc of accountsSnap.docs) {
    const acc = accDoc.data();
    const accId = accDoc.id;

    // Fetch postings for this account
    const postingsSnap = await getDocs(query(collection(db, "postings"), where("accountId", "==", accId)));
    
    let computedPaid = 0;
    let computedBalance = acc.totalAmount || 0;

    postingsSnap.forEach(postDoc => {
      const post = postDoc.data();
      // Only count verified collections/penalties/extras
      if (post.verified && (post.status === 'collection' || post.status === 'penalty' || post.status === 'extra_collection')) {
        const amt = post.amount || 0;
        const penalty = post.penaltyAmount || 0;
        const extra = post.extraAmount || 0;
        
        computedPaid += amt;
        computedBalance -= (amt - penalty); // balance decreases by principal (amount - penalty)
      } else if (post.verified && post.status === 'extra_transfer_out') {
        const amt = post.amount || 0;
        computedPaid -= amt;
        computedBalance += amt;
      }
    });

    if (computedPaid !== acc.paid || computedBalance !== acc.balance) {
      outOfSyncCount++;
      console.log(`\nAccount ${acc.accountNo} (${acc.name}) - OUT OF SYNC!`);
      console.log(`  DB Values:        Paid: ${acc.paid}, Balance: ${acc.balance}`);
      console.log(`  Computed Values:  Paid: ${computedPaid}, Balance: ${computedBalance}`);
      console.log(`  Diff:             Paid Diff: ${acc.paid - computedPaid}, Balance Diff: ${acc.balance - computedBalance}`);
    }
  }

  console.log(`\nTotal out-of-sync accounts found: ${outOfSyncCount}`);
}

check().catch(console.error);
