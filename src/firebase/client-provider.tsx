
"use client";

import React, { createContext, useContext, useMemo, type ReactNode } from 'react';
import { initializeFirebase } from '@/firebase/config'; // Corrected import
import { type Auth } from 'firebase/auth';
import { type FirebaseApp } from 'firebase/app';
import { type Firestore } from 'firebase/firestore';
import { FirebaseProvider } from './provider';

interface FirebaseClientProviderProps {
  children: ReactNode;
}

// This is a re-implementation of the context provider to simplify initialization
export function FirebaseClientProvider({ children }: FirebaseClientProviderProps) {
  const { firebaseApp, auth, firestore } = useMemo(() => initializeFirebase(), []);

  return (
    <FirebaseProvider
      firebaseApp={firebaseApp}
      auth={auth}
      firestore={firestore}
    >
      {children}
    </FirebaseProvider>
  );
}
