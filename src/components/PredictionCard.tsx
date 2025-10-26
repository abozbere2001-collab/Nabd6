"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Fixture, Prediction, PredictionMatch } from '@/lib/types';
import { LiveMatchStatus } from './LiveMatchStatus';
import { Loader2 } from 'lucide-react';

const PredictionCard = ({
  predictionMatch,
  userPrediction,
  onSave,
}: {
  predictionMatch: PredictionMatch;
  userPrediction?: Prediction;
  onSave: (fixtureId: number, home: string, away: string) => void;
}) => {
  const [liveFixture, setLiveFixture] = useState<Fixture>(predictionMatch.fixtureData);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isMatchLiveOrFinished = useMemo(() => ['LIVE', '1H', 'HT', '2H', 'ET', 'BT', 'P', 'FT', 'AET', 'PEN'].includes(liveFixture.fixture.status.short), [liveFixture]);
  const isMatchFinished = useMemo(() => ['FT', 'AET', 'PEN'].includes(liveFixture.fixture.status.short), [liveFixture]);
  const isPredictionDisabled = useMemo(() => new Date(liveFixture.fixture.timestamp * 1000) < new Date(), [liveFixture]);

  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    const fetchLiveFixture = async () => {
      setIsUpdating(true);
      try {
        const res = await fetch(`/api/football/fixtures?id=${liveFixture.fixture.id}`);
        const data = await res.json();
        if (data.response && data.response.length > 0) {
          setLiveFixture(data.response[0]);
        }
      } catch (error) {
        console.error('Failed to fetch live fixture data:', error);
      } finally {
        setTimeout(() => setIsUpdating(false), 500);
      }
    };

    if (isMatchLiveOrFinished && !isMatchFinished) {
      fetchLiveFixture();
      intervalId = setInterval(fetchLiveFixture, 60000);
    } else if (['NS', 'TBD'].includes(predictionMatch.fixtureData.fixture.status.short) && new Date(predictionMatch.fixtureData.fixture.timestamp * 1000) < new Date()) {
      fetchLiveFixture();
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [liveFixture.fixture.id, isMatchLiveOrFinished, isMatchFinished, predictionMatch.fixtureData.fixture.status.short, predictionMatch.fixtureData.fixture.timestamp]);

  const getPredictionStatusColors = useCallback(() => {
    if (!isMatchFinished || !userPrediction) return 'bg-card text-foreground';

    const actualHome = liveFixture.goals.home;
    const actualAway = liveFixture.goals.away;
    const predHome = userPrediction.homeGoals;
    const predAway = userPrediction.awayGoals;

    if (actualHome === null || actualAway === null) return 'bg-card text-foreground';

    if (actualHome === predHome && actualAway === predAway) {
      return 'bg-green-500/80 text-white'; // Correct score
    }

    const actualWinner = actualHome > actualAway ? 'home' : actualHome < actualAway ? 'away' : 'draw';
    const predWinner = predHome > predAway ? 'home' : predHome < predAway ? 'away' : 'draw';

    if (actualWinner === predWinner) {
      return 'bg-yellow-500/80 text-white'; // Correct outcome
    }

    return 'bg-destructive/80 text-white'; // Incorrect
  }, [isMatchFinished, userPrediction, liveFixture.goals]);

  const getPointsColor = useCallback(() => {
    if (!isMatchFinished || userPrediction?.points === undefined) return 'text-primary';
    if (userPrediction.points === 5) return 'text-green-500';
    if (userPrediction.points === 3) return 'text-yellow-500';
    return 'text-destructive';
  }, [isMatchFinished, userPrediction]);

  const handlePrediction = async (team: 'home' | 'guest' | 'draw') => {
    if (isPredictionDisabled) return;
    setIsSubmitting(true);
    let homeScore = 0;
    let guestScore = 0;

    if (team === 'home') {
      homeScore = 1;
      guestScore = 0;
    } else if (team === 'guest') {
      homeScore = 0;
      guestScore = 1;
    } else {
      homeScore = 1;
      guestScore = 1;
    }

    await onSave(liveFixture.fixture.id, String(homeScore), String(guestScore));
    setIsSubmitting(false);
  };

  const cardColors = getPredictionStatusColors();
  const isColoredCard = cardColors !== 'bg-card text-foreground';

  const TeamDisplay = ({ team }: { team: Fixture['teams']['home'] }) => (
    <div className="flex flex-col items-center gap-1 flex-1 justify-end truncate">
      <Avatar className="h-8 w-8"><AvatarImage src={team.logo} /></Avatar>
      <span className={cn('font-semibold text-xs text-center truncate w-full', isColoredCard && 'text-white')}>{team.name}</span>
    </div>
  );
  
  const predictedWinner = userPrediction 
    ? userPrediction.homeGoals > userPrediction.awayGoals ? 'home' : userPrediction.homeGoals < userPrediction.awayGoals ? 'guest' : 'draw'
    : null;

  return (
    <Card className={cn('transition-colors', cardColors)}>
      <CardContent className="p-3">
        <div className="flex flex-col items-center text-center mb-2">
            <div className={cn("text-sm", isColoredCard ? "text-white/80" : "text-muted-foreground")}>{liveFixture.league.name}</div>
        </div>

        <main dir="rtl" className="flex items-center justify-between gap-1 mb-3">
          <TeamDisplay team={liveFixture.teams.home} />
          <div className="flex flex-col items-center justify-center min-w-[50px] text-center relative">
            {isUpdating && <Loader2 className="h-4 w-4 animate-spin absolute -top-1" />}
            <LiveMatchStatus fixture={liveFixture} />
          </div>
          <TeamDisplay team={liveFixture.teams.away} />
        </main>
        
        <div className="flex justify-around mt-2" dir="rtl">
            <Button
              onClick={() => handlePrediction('home')}
              disabled={isSubmitting || isPredictionDisabled}
              className={cn("px-3 py-1 h-auto text-xs rounded-lg transition-all", 
                predictedWinner === 'home' ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-accent'
              )}
            >
              فوز المستضيف
            </Button>

            <Button
              onClick={() => handlePrediction('draw')}
              disabled={isSubmitting || isPredictionDisabled}
               className={cn("px-3 py-1 h-auto text-xs rounded-lg transition-all", 
                predictedWinner === 'draw' ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-accent'
              )}
            >
              تعادل
            </Button>

            <Button
              onClick={() => handlePrediction('guest')}
              disabled={isSubmitting || isPredictionDisabled}
               className={cn("px-3 py-1 h-auto text-xs rounded-lg transition-all", 
                predictedWinner === 'guest' ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-accent'
              )}
            >
              فوز الضيف
            </Button>
        </div>

        {isMatchFinished && userPrediction?.points !== undefined && userPrediction.points >= 0 && (
          <p className={cn('text-center font-bold text-sm mt-3', getPointsColor())}>
            +{userPrediction.points} نقاط
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default PredictionCard;
