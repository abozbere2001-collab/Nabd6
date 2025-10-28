
"use client";

import React, { useState, useEffect } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Trophy, Crown, X } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';

interface OnboardingHintsProps {
    onDismiss: () => void;
    activeTab: string;
}

export function OnboardingHints({ onDismiss, activeTab }: OnboardingHintsProps) {
    const [visibleHints, setVisibleHints] = useState({ predictions: true, crown: true });

    useEffect(() => {
        const predictionTimer = setTimeout(() => {
            if(visibleHints.predictions) handleDismiss('predictions');
        }, 8000); // Hide after 8 seconds

        const crownTimer = setTimeout(() => {
            if(visibleHints.crown) handleDismiss('crown');
        }, 12000); // Hide after 12 seconds

        return () => {
            clearTimeout(predictionTimer);
            clearTimeout(crownTimer);
        };
    }, [visibleHints]);

    const handleDismiss = (hintKey: keyof typeof visibleHints) => {
        setVisibleHints(prev => {
            const newHints = { ...prev, [hintKey]: false };
            if (!newHints.predictions && !newHints.crown) {
                onDismiss();
            }
            return newHints;
        });
    };
    
    const showPredictionsHint = activeTab === 'Predictions' && visibleHints.predictions;
    const showCrownHint = activeTab === 'MyCountry' && visibleHints.crown;

    if (!showPredictionsHint && !showCrownHint) {
        return null;
    }

    return (
        <>
            {/* Predictions Hint */}
            <div 
                data-id="predictions-hint-anchor"
                className="fixed bottom-0 z-40"
                style={{
                    left: '50%',
                    transform: 'translateX(calc(-50% + 58px))' // Positioned on the "Predictions" tab
                }}
            >
                <Popover open={showPredictionsHint}>
                    <PopoverTrigger asChild>
                        <div className="h-16 w-[60px]"></div>
                    </PopoverTrigger>
                    <PopoverContent side="top" align="center" className="w-56 p-2 rounded-xl shadow-lg">
                        <div className="flex items-start">
                            <div className="p-2">
                                <Trophy className="h-5 w-5 text-primary" />
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-semibold">ميزة جديدة!</p>
                                <p className="text-xs text-muted-foreground">
                                    توقع نتائج المباريات وتصدر لوحة الصدارة.
                                </p>
                            </div>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDismiss('predictions')}><X className="h-4 w-4" /></Button>
                        </div>
                    </PopoverContent>
                </Popover>
            </div>
            
             {/* Crown/MyCountry Hint */}
            <div
                data-id="mycountry-hint-anchor"
                className={cn(
                    "fixed bottom-0 z-40"
                )}
                style={{
                    left: '50%',
                    transform: 'translateX(calc(-50% - 62px))' // Positioned on the "MyCountry" tab
                }}
             >
                <Popover open={showCrownHint}>
                    <PopoverTrigger asChild>
                        <div className="h-16 w-[60px]"></div>
                    </PopoverTrigger>
                    <PopoverContent side="top" align="center" className="w-56 p-2 rounded-xl shadow-lg">
                       <div className="flex items-start">
                            <div className="p-2">
                                <Crown className="h-5 w-5 text-yellow-400" />
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-semibold">توّج فريقك!</p>
                                <p className="text-xs text-muted-foreground">
                                   تابع فريقك المفضل هنا بالضغط على أيقونة التاج.
                                </p>
                            </div>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDismiss('crown')}><X className="h-4 w-4" /></Button>
                        </div>
                    </PopoverContent>
                </Popover>
            </div>
        </>
    );
}
