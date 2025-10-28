
"use client";

import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Skeleton } from './ui/skeleton';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';

interface OddValue {
    value: string;
    odd: string;
}

interface Bet {
    id: number;
    name: string;
    values: OddValue[];
}

interface Bookmaker {
    id: number;
    name: string;
    bets: Bet[];
}

interface OddsApiResponse {
    fixture: { id: number; };
    bookmakers: Bookmaker[];
}

interface FixtureInfo {
    teams: {
        home: { name: string; logo: string };
        away: { name: string; logo: string };
    }
}

interface ProcessedOdds {
    home: number;
    draw: number;
    away: number;
    homeTeamName: string;
    awayTeamName: string;
    homeTeamLogo: string;
    awayTeamLogo: string;
}

const OddRow = ({ label, logo, percentage }: { label: string; logo?: string; percentage: number }) => (
    <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 w-28 flex-shrink-0">
            {logo && <Avatar className="h-5 w-5"><AvatarImage src={logo} alt={label} /><AvatarFallback>{label.charAt(0)}</AvatarFallback></Avatar>}
            <span className="font-medium text-xs truncate">{label}</span>
        </div>
        <div className="flex-1">
            <Progress value={percentage} className="h-2" />
        </div>
        <span className="w-10 text-right font-mono text-xs font-bold">{percentage.toFixed(0)}%</span>
    </div>
);


export function PredictionOdds({ fixtureId, reversed = false }: { fixtureId: number, reversed?: boolean }) {
    const [odds, setOdds] = useState<ProcessedOdds | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;
        setLoading(true);

        Promise.all([
            fetch(`/api/football/odds?fixture=${fixtureId}&bookmaker=8`),
            fetch(`/api/football/fixtures?id=${fixtureId}`)
        ])
        .then(async ([oddsRes, fixtureRes]) => {
            if (!isMounted) return;
            if (!oddsRes.ok || !fixtureRes.ok) {
                throw new Error('Failed to fetch match data');
            }
            const oddsData = await oddsRes.json();
            const fixtureData = await fixtureRes.json();
            
            const oddsResponse: OddsApiResponse | undefined = oddsData.response?.[0];
            const fixtureInfo: FixtureInfo | undefined = fixtureData.response?.[0];

            const bookmaker = oddsResponse?.bookmakers?.find((b: Bookmaker) => b.id === 8);
            const matchWinnerBet = bookmaker?.bets.find((b: Bet) => b.id === 1);

            if (matchWinnerBet && fixtureInfo) {
                const currentOdds: { [key: string]: number } = {};
                matchWinnerBet.values.forEach((v: OddValue) => {
                    const key = v.value.toLowerCase().replace(' ', '');
                    currentOdds[key] = parseFloat(v.odd);
                });

                setOdds({
                    home: currentOdds.home,
                    draw: currentOdds.draw,
                    away: currentOdds.away,
                    homeTeamName: fixtureInfo.teams.home.name,
                    awayTeamName: fixtureInfo.teams.away.name,
                    homeTeamLogo: fixtureInfo.teams.home.logo,
                    awayTeamLogo: fixtureInfo.teams.away.logo,
                });
            } else {
                setOdds(null);
            }
        })
        .catch(err => {
            if (isMounted) setOdds(null);
        })
        .finally(() => {
            if (isMounted) setLoading(false);
        });

        return () => { isMounted = false; };
    }, [fixtureId]);

    if (loading) {
        return <Skeleton className="h-16 w-full" />;
    }

    if (!odds) {
        return null; // Don't render anything if odds are not available
    }

    const probHome = (1 / odds.home) * 100;
    const probDraw = (1 / odds.draw) * 100;
    const probAway = (1 / odds.away) * 100;
    const totalProb = probHome + probDraw + probAway;

    const percentHome = (probHome / totalProb) * 100;
    const percentDraw = (probDraw / totalProb) * 100;
    const percentAway = (probAway / totalProb) * 100;

    const homeRow = <OddRow label={odds.homeTeamName} logo={odds.homeTeamLogo} percentage={percentHome} />;
    const awayRow = <OddRow label={odds.awayTeamName} logo={odds.awayTeamLogo} percentage={percentAway} />;
    const drawRow = <OddRow label="تعادل" percentage={percentDraw} />;

    return (
        <div className="space-y-1.5 rounded-md border bg-background/50 p-2">
            {reversed ? (
                <>
                    {awayRow}
                    {drawRow}
                    {homeRow}
                </>
            ) : (
                <>
                    {homeRow}
                    {drawRow}
                    {awayRow}
                </>
            )}
        </div>
    );
}
