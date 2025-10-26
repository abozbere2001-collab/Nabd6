
"use client";
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { NabdAlMalaebLogo } from '@/components/icons/NabdAlMalaebLogo';
import { GoogleIcon } from '@/components/icons/GoogleIcon';
import { getAuth, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { handleNewUser } from '@/lib/firebase-client';

export const GUEST_MODE_KEY = 'goalstack_guest_mode_active';


export function WelcomeScreen() {
  const { toast } = useToast();
  const { db } = useFirestore();
  const [isLoading, setIsLoading] = useState<false | 'google' | 'guest'>(false);
  
  const handleGoogleLogin = async () => {
    if (!db) return;
    // Clear guest mode when logging in with a real account
    localStorage.removeItem(GUEST_MODE_KEY);
    setIsLoading('google');
    const auth = getAuth();
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      await handleNewUser(result.user, db);
      // onAuthStateChanged will handle the rest
    } catch (error: any) {
      if (error.code !== 'auth/popup-closed-by-user' && error.code !== 'auth/cancelled-popup-request') {
        console.error("Google Sign-In Error:", error);
        toast({
          variant: 'destructive',
          title: 'خطأ في تسجيل الدخول',
          description: 'حدث خطأ أثناء محاولة تسجيل الدخول باستخدام جوجل.',
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuestLogin = () => {
    setIsLoading('guest');
    try {
        // Set a flag in localStorage to indicate guest mode
        localStorage.setItem(GUEST_MODE_KEY, 'true');
        // Force a page reload to re-evaluate the auth state in the root component
        window.location.reload();
    } catch(e: any) {
        console.error("Guest mode error:", e);
        toast({
            variant: 'destructive',
            title: 'خطأ',
            description: 'فشل تفعيل وضع الزائر. يرجى المحاولة مرة أخرى.',
        });
    } finally {
        setIsLoading(false);
    }
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
              disabled={!!isLoading}
            >
              {isLoading === 'google' ? (
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
                disabled={!!isLoading}
            >
               {isLoading === 'guest' ? <Loader2 className="h-5 w-5 animate-spin"/> : 'تصفح كزائر'}
            </Button>
        </div>

        <p className="mt-8 text-xs text-muted-foreground/80 px-4">
          بالاستمرار، أنت توافق على شروط الخدمة و سياسة الخصوصية.
        </p>
      </div>
    </div>
  );
}
