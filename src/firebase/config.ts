
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

// Configuration object for Firebase
const firebaseConfig = {
  apiKey: "AIzaSyB1B2NlQyUNac6p_c0yZ0u-9vjFCoTqJjI",
  authDomain: "nabd-d71ab.firebaseapp.com",
  projectId: "nabd-d71ab",
  storageBucket: "nabd-d71ab.appspot.com",
  messagingSenderId: "338879612343",
  appId: "1:338879612343:web:076f7f329c3d4b68453472"
};

interface FirebaseServices {
  firebaseApp: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
}

// Singleton pattern to initialize and get Firebase services
export function initializeFirebase(): FirebaseServices {
  if (getApps().length) {
    const app = getApp();
    return {
      firebaseApp: app,
      auth: getAuth(app),
      firestore: getFirestore(app),
    };
  }

  const firebaseApp = initializeApp(firebaseConfig);
  return {
    firebaseApp,
    auth: getAuth(firebaseApp),
    firestore: getFirestore(firebaseApp),
  };
}
