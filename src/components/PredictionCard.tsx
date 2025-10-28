

"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useDebounce } from '@/hooks/use-debounce';
import type { Fixture, Prediction, PredictionMatch } from '@/lib/types';
import { PredictionOdds } from './PredictionOdds';
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

  const [homeValue, setHomeValue] = useState(userPrediction?.awayGoals?.toString() ?? '');
  const [awayValue, setAwayValue] = useState(userPrediction?.homeGoals?.toString() ?? '');


  const debouncedHome = useDebounce(homeValue, 500);
  const debouncedAway = useDebounce(awayValue, 500);

  const isMatchLiveOrFinished = useMemo(
    () => ['LIVE', '1H', 'HT', '2H', 'ET', 'BT', 'P', 'FT', 'AET', 'PEN'].includes(liveFixture.fixture.status.short),
    [liveFixture]
  );

  const isMatchFinished = useMemo(
    () => ['FT', 'AET', 'PEN'].includes(liveFixture.fixture.status.short),
    [liveFixture]
  );

  const isPredictionDisabled = useMemo(
    () => new Date(liveFixture.fixture.timestamp * 1000) < new Date(),
    [liveFixture]
  );

  // 🔁 Update live match data
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
    } else {
      if (
        ['NS', 'TBD'].includes(predictionMatch.fixtureData.fixture.status.short) &&
        new Date(predictionMatch.fixtureData.fixture.timestamp * 1000) < new Date()
      ) {
        fetchLiveFixture();
      }
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [
    liveFixture.fixture.id,
    isMatchLiveOrFinished,
    isMatchFinished,
    predictionMatch.fixtureData.fixture.status.short,
    predictionMatch.fixtureData.fixture.timestamp,
  ]);

  // 🎨 Determine card colors based on prediction accuracy
  const getPredictionStatusColors = useCallback(() => {
    if (!isMatchFinished || !userPrediction) return 'bg-card text-foreground';

    const actualHome = liveFixture.goals.home;
    const actualAway = liveFixture.goals.away;
    
    const predHome = userPrediction.awayGoals;
    const predAway = userPrediction.homeGoals;


    if (actualHome === null || actualAway === null) return 'bg-card text-foreground';
    
    if (actualHome === predHome && actualAway === predAway) {
        return 'bg-green-500/80 text-white';
    }

    const actualWinner = actualHome > actualAway ? 'home' : actualHome < actualAway ? 'away' : 'draw';
    const predWinner = predHome > predAway ? 'home' : predHome < predAway ? 'away' : 'draw';

    if (actualWinner === predWinner) {
        return 'bg-yellow-500/80 text-white';
    }
    
    return 'bg-destructive/80 text-white';
  }, [isMatchFinished, userPrediction, liveFixture.goals]);


  const getPointsColor = useCallback(() => {
    if (!isMatchFinished || userPrediction?.points === undefined) return 'text-primary';
    if (userPrediction.points === 3) return 'text-green-500';
    if (userPrediction.points === 1) return 'text-yellow-500';
    return 'text-destructive';
  }, [isMatchFinished, userPrediction]);

  useEffect(() => {
    if (
      !isPredictionDisabled &&
      debouncedHome !== '' &&
      debouncedAway !== '' &&
      (debouncedHome !== userPrediction?.awayGoals?.toString() ||
       debouncedAway !== userPrediction?.homeGoals?.toString())
    ) {
      onSave(liveFixture.fixture.id, debouncedHome, debouncedAway);
    }
  }, [debouncedHome, debouncedAway, onSave, userPrediction, liveFixture.fixture.id, isPredictionDisabled]);

  useEffect(() => {
    setHomeValue(userPrediction?.awayGoals?.toString() ?? '');
    setAwayValue(userPrediction?.homeGoals?.toString() ?? '');
  }, [userPrediction]);

  const cardColors = getPredictionStatusColors();
  const isColoredCard = cardColors !== 'bg-card text-foreground';

  const TeamDisplay = ({ team }: { team: Fixture['teams']['home'] }) => (
    <div className="flex flex-col items-center gap-0.5 flex-1 justify-start truncate">
      <Avatar className="h-7 w-7">
        <AvatarImage src={team.logo} />
      </Avatar>
      <span className={cn('font-semibold text-xs text-center truncate w-full', isColoredCard && 'text-white/90')}>
        {team.name}
      </span>
    </div>
  );
  
  return (
    <Card className={cn('transition-colors', cardColors)}>
      <CardContent className="p-2">
        <main dir="rtl" className="flex items-center justify-between gap-1">
          <TeamDisplay team={liveFixture.teams.home} />

          <div className="flex flex-col items-center justify-center text-center">
             <div className="flex items-center gap-1 min-w-[100px] justify-center">
                 <Input
                    type="number"
                    className={cn(
                    'w-9 h-8 text-center text-sm font-bold',
                    isColoredCard && 'bg-black/20 border-white/30 text-white placeholder:text-white/70'
                    )}
                    min="0"
                    value={homeValue}
                    onChange={(e) => setHomeValue(e.target.value)}
                    id={`home-${liveFixture.fixture.id}`}
                    disabled={isPredictionDisabled}
                />
                <div className="flex flex-col items-center justify-center min-w-[50px] text-center relative">
                    {isUpdating && <Loader2 className="h-3 w-3 animate-spin absolute -top-1" />}
                    <LiveMatchStatus fixture={liveFixture} />
                </div>
                <Input
                    type="number"
                    className={cn(
                    'w-9 h-8 text-center text-sm font-bold',
                    isColoredCard && 'bg-black/20 border-white/30 text-white placeholder:text-white/70'
                    )}
                    min="0"
                    value={awayValue}
                    onChange={(e) => setAwayValue(e.target.value)}
                    id={`away-${liveFixture.fixture.id}`}
                    disabled={isPredictionDisabled}
                />
            </div>
          </div>

          <TeamDisplay team={liveFixture.teams.away} />
        </main>

        <div
          className={cn(
            'text-center text-[10px] mt-1',
            isMatchLiveOrFinished ? (isColoredCard ? 'text-white/80' : 'text-muted-foreground') : 'text-muted-foreground'
          )}
        >
          <span className={cn(isColoredCard && 'text-white/90')}>{liveFixture.league.name}</span>
        </div>

        <div className="mt-1">
          <PredictionOdds fixtureId={liveFixture.fixture.id} reversed={true} />
        </div>

        {isMatchFinished && userPrediction?.points !== undefined && userPrediction.points >= 0 && (
          <p className={cn('text-center font-bold text-xs mt-1', getPointsColor())}>+{userPrediction.points} نقاط</p>
        )}

        {!isMatchFinished && userPrediction && !isPredictionDisabled && (
          <p className={cn('text-center text-[10px] mt-1', isColoredCard ? 'text-green-300' : 'text-green-500')}>
            تم حفظ توقعك
          </p>
        )}

        {isPredictionDisabled && !userPrediction && !isMatchFinished && (
          <p className={cn('text-center text-[10px] mt-1', isColoredCard ? 'text-red-300' : 'text-red-500')}>
            أغلق باب التوقع
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default PredictionCard;
