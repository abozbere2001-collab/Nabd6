
"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth, useAdmin } from '@/firebase/provider';
import { Button } from './ui/button';
import { NabdAlMalaebLogo } from './icons/NabdAlMalaebLogo';
import { X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isToday, isBefore, addDays, parseISO, format } from 'date-fns';

// --- Ad Context ---
interface AdContextType {
  showSplashAd: boolean;
  showBannerAd: boolean;
  setSplashAdShown: () => void;
  dismissBannerAd: () => void;
}

const AdContext = createContext<AdContextType | undefined>(undefined);

const FIRST_USE_DATE_KEY = 'goalstack_first_use_date';
const SPLASH_AD_SHOWN_SESSION_KEY = 'goalstack_splash_ad_shown_session';
const BANNER_AD_DISMISSED_KEY = 'goalstack_banner_ad_dismissed_session';

export const AdProvider = ({ children }: { children: React.ReactNode }) => {
  const { isProUser } = useAuth();
  const { isAdmin } = useAdmin();
  const [shouldShowSplash, setShouldShowSplash] = useState(false);
  const [bannerAdDismissed, setBannerAdDismissed] = useState(() => {
    if (typeof window === 'undefined') return true;
    return sessionStorage.getItem(BANNER_AD_DISMISSED_KEY) === 'true';
  });

  useEffect(() => {
    if (isProUser || isAdmin || typeof window === 'undefined') {
      setShouldShowSplash(false);
      return;
    }

    // Check if splash ad has already been shown in this session
    const splashAdShownInSession = sessionStorage.getItem(SPLASH_AD_SHOWN_SESSION_KEY) === 'true';
    if (splashAdShownInSession) {
      setShouldShowSplash(false);
      return;
    }
    
    const firstUseDateStr = localStorage.getItem(FIRST_USE_DATE_KEY);

    if (!firstUseDateStr) {
      // First time user ever, set the date but don't show the ad yet.
      localStorage.setItem(FIRST_USE_DATE_KEY, new Date().toISOString());
      setShouldShowSplash(false);
    } else {
      const firstUseDate = parseISO(firstUseDateStr);
      // Change addMonths to addDays(5) to show after 5 days
      const fiveDaysLater = addDays(firstUseDate, 5);
      
      // Show the ad only if five days have passed since first use.
      if (isBefore(new Date(), fiveDaysLater)) {
        setShouldShowSplash(false);
      } else {
        setShouldShowSplash(true);
      }
    }
  }, [isProUser, isAdmin]);

  const setSplashAdShown = () => {
    if (typeof window !== 'undefined') {
        // Mark that the ad has been shown for this session
        sessionStorage.setItem(SPLASH_AD_SHOWN_SESSION_KEY, 'true');
    }
    setShouldShowSplash(false);
  }

  const dismissBannerAd = () => {
    setBannerAdDismissed(true);
     if (typeof window !== 'undefined') {
        sessionStorage.setItem(BANNER_AD_DISMISSED_KEY, 'true');
     }
  }

  const showSplashAd = !isProUser && !isAdmin && shouldShowSplash;
  const showBannerAd = !isProUser && !isAdmin && !bannerAdDismissed;

  const value = {
    showSplashAd,
    showBannerAd,
    setSplashAdShown,
    dismissBannerAd,
  };

  return <AdContext.Provider value={value}>{children}</AdContext.Provider>;
};

export const useAd = () => {
  const context = useContext(AdContext);
  if (!context) {
    throw new Error('useAd must be used within an AdProvider');
  }
  return context;
};

// --- Ad Components ---

export const SplashScreenAd = () => {
  const { setSplashAdShown } = useAd();
  const [showSkip, setShowSkip] = useState(false);

  useEffect(() => {
    const skipTimer = setTimeout(() => setShowSkip(true), 1000); // Show skip after 1 second
    const hideTimer = setTimeout(() => setSplashAdShown(), 3000); // Auto hide after 3 seconds
    return () => {
      clearTimeout(skipTimer);
      clearTimeout(hideTimer);
    };
  }, [setSplashAdShown]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background">
       <NabdAlMalaebLogo className="h-24 w-24 mb-4" />
       <h2 className="text-xl font-bold text-primary">مرحباً بك مجدداً في نبض الملاعب</h2>
       <p className="text-muted-foreground">استمتع بتجربتك الكروية</p>
       
       <div className="absolute bottom-10 flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin"/>
        <p className="text-xs text-muted-foreground">جاري تحميل الإعلانات...</p>
       </div>

      {showSkip && (
        <Button
          variant="ghost"
          className="absolute top-4 right-4"
          onClick={(e) => {
            e.stopPropagation();
            setSplashAdShown();
          }}
        >
          تخطي
        </Button>
      )}
    </div>
  );
};


export const BannerAd = () => {
    const { dismissBannerAd } = useAd();
    return (
        <div className="relative w-full h-14 bg-card border-t flex items-center justify-center text-muted-foreground text-sm z-20">
            <p>منطقة الإعلان (Banner Ad)</p>
            <Button 
                variant="ghost" 
                size="icon" 
                className="absolute top-1 right-1 h-7 w-7"
                onClick={dismissBannerAd}
            >
                <X className="h-4 w-4" />
            </Button>
        </div>
    )
}

    