
"use client";
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { NabdAlMalaebLogo } from '@/components/icons/NabdAlMalaebLogo';
import { GoogleIcon } from '@/components/icons/GoogleIcon';
import { getAuth, GoogleAuthProvider, signInWithRedirect, signInAnonymously, getRedirectResult } from "firebase/auth";
import { useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { handleNewUser } from '@/lib/firebase-client';

export function WelcomeScreen() {
  const { toast } = useToast();
  const { db } = useFirestore();
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isGuestLoading, setIsGuestLoading] = useState(false);
  const [isProcessingRedirect, setIsProcessingRedirect] = useState(true);

  const auth = getAuth();

  useEffect(() => {
    getRedirectResult(auth)
      .then(async (result) => {
        if (result && result.user && db) {
          await handleNewUser(result.user, db);
          // onAuthStateChanged will handle the rest
        }
      })
      .catch((error) => {
        console.error("Google redirect result error:", error);
        toast({
          variant: 'destructive',
          title: 'خطأ في تسجيل الدخول',
          description: 'حدث خطأ أثناء محاولة تسجيل الدخول باستخدام جوجل.',
        });
      })
      .finally(() => {
        setIsProcessingRedirect(false);
      });
  }, [auth, db, toast]);
  
  const handleGoogleLogin = async () => {
    if (!db) return;
    setIsGoogleLoading(true);
    const provider = new GoogleAuthProvider();
    // We don't need a try-catch here because errors will be handled by getRedirectResult
    await signInWithRedirect(auth, provider);
  };

  const handleGuestLogin = async () => {
    setIsGuestLoading(true);
    try {
        await signInAnonymously(auth);
        // onAuthStateChanged will handle the rest.
    } catch(e) {
        console.error("Anonymous login error:", e);
        toast({
            variant: 'destructive',
            title: 'خطأ',
            description: 'فشل تسجيل الدخول كزائر. يرجى المحاولة مرة أخرى.',
        });
        setIsGuestLoading(false);
    }
  }

  const isLoading = isGoogleLoading || isGuestLoading || isProcessingRedirect;

  if (isProcessingRedirect) {
    return (
        <div className="flex h-full flex-col items-center justify-center bg-background">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-muted-foreground">جاري استكمال تسجيل الدخول...</p>
        </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
        <NabdAlMalaebLogo className="h-24 w-24 mb-4" />
        <h1 className="text-3xl font-bold mb-2 font-headline text-primary">أهلاً بك في نبض الملاعب</h1>
        <p className="text-muted-foreground mb-8">عالم كرة القدم بين يديك. سجل الدخول لمزامنة مفضلاتك، أو تصفح كزائر.</p>
        
        <div className="w-full max-w-xs space-y-4">
            <Button 
              onClick={handleGoogleLogin} 
              className="w-full" 
              size="lg"
              disabled={isLoading}
            >
              {isGoogleLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <GoogleIcon className="h-5 w-5 mr-2" />
                  المتابعة باستخدام جوجل
                </>
              )}
            </Button>
            <Button
                variant="ghost"
                onClick={handleGuestLogin}
                className="w-full"
                disabled={isLoading}
            >
               {isGuestLoading ? <Loader2 className="h-5 w-5 animate-spin"/> : 'تصفح كزائر'}
            </Button>
        </div>

        <p className="mt-8 text-xs text-muted-foreground/80 px-4">
          بالاستمرار، أنت توافق على شروط الخدمة و سياسة الخصوصية.
        </p>
      </div>
    </div>
  );
}
