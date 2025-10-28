
"use client";

import React from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import type { ScreenProps } from '@/app/page';
import type { Fixture as FixtureType } from '@/lib/types';
import { useAdmin } from '@/firebase/provider';
import { LiveMatchStatus } from './LiveMatchStatus';
import { Button } from './ui/button';
import { Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PredictionOdds } from './PredictionOdds';

export const FixtureItem = React.memo(({ fixture, navigate, customStatus, isPinnedForPrediction, onPinToggle, isAdmin, showOdds }: { fixture: FixtureType, navigate: ScreenProps['navigate'], customStatus?: string | null, isPinnedForPrediction?: boolean, onPinToggle?: (fixture: FixtureType) => void, isAdmin?: boolean, showOdds?: boolean }) => {

    const TeamDisplay = ({ team }: { team: FixtureType['teams']['home'] }) => (
        <div className="flex flex-col items-center gap-0.5 flex-1 justify-end truncate">
            <Avatar className="h-7 w-7 flex-shrink-0">
                <AvatarImage src={team.logo} alt={team.name} />
                <AvatarFallback>{team.name?.charAt(0) || ''}</AvatarFallback>
            </Avatar>
            <span className="font-semibold text-xs truncate text-center w-full">{team.name}</span>
        </div>
    );

    return (
        <div
            key={fixture.fixture.id}
            className="relative rounded-lg bg-card border text-sm transition-all duration-300 flex flex-col justify-between"
        >
            {isAdmin && onPinToggle && (
                <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-0.5 right-0.5 h-7 w-7 z-10"
                    onClick={(e) => { e.stopPropagation(); onPinToggle(fixture); }}
                >
                    <Crown className={cn("h-4 w-4 text-muted-foreground", isPinnedForPrediction && "text-yellow-400 fill-current")} />
                </Button>
            )}

            <div
                className="flex-1 p-2 cursor-pointer"
                onClick={() => navigate('MatchDetails', { fixtureId: fixture.fixture.id })}
            >
                <main dir="rtl" className="flex items-start justify-between gap-1">
                    <TeamDisplay team={fixture.teams.home} />
                    <div className="flex flex-col items-center justify-center min-w-[70px] pt-1 text-center">
                        <LiveMatchStatus fixture={fixture} customStatus={customStatus} />
                    </div>
                    <TeamDisplay team={fixture.teams.away} />
                </main>
            </div>
             {showOdds && (
                <div className="px-2 pb-2">
                    <PredictionOdds 
                        fixtureId={fixture.fixture.id} 
                        homeTeam={fixture.teams.home}
                        awayTeam={fixture.teams.away}
                        reversed={true} 
                    />
                </div>
            )}
        </div>
    );
});
FixtureItem.displayName = 'FixtureItem';
