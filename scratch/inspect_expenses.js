import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCu6ypGoJVlnDBj3XlZfdWnSVaNk_1gBUQ',
  authDomain: 'sri-devi-finance.firebaseapp.com',
  projectId: 'sri-devi-finance',
  storageBucket: 'sri-devi-finance.firebasestorage.app',
  messagingSenderId: '524432572572',
  appId: '1:524432572572:web:f3e304354018ffb5432d59'
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function inspect() {
  console.log('=== EXPENSES LOG ===');
  const expSnap = await getDocs(collection(db, 'expenses_log'));
  console.log('Total expenses_log count:', expSnap.size);
  expSnap.forEach(d => {
    console.log(d.id, JSON.stringify(d.data()));
  });

  console.log('\n=== DAY SUMMARIES ===');
  const summSnap = await getDocs(collection(db, 'day_summaries'));
  console.log('Total day_summaries count:', summSnap.size);
  summSnap.forEach(d => {
    console.log(d.id, JSON.stringify(d.data()));
  });
}

inspect().catch(console.error);
