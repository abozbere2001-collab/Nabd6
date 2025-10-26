
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

// Configuration object for Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDG7nLIqi2QjPqsFGLeLJFHTkrpYbx4sNk",
  authDomain: "studio-5560913388-9a637.firebaseapp.com",
  projectId: "studio-5560913388-9a637",
  storageBucket: "studio-5560913388-9a637.appspot.com",
  messagingSenderId: "954115183601",
  appId: "1:954115183601:web:e979508da0aa1de5506a50"
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
