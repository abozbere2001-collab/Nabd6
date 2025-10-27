
"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import type { ScreenProps } from '@/app/page';
import { useAuth, useFirestore } from '@/firebase';
import { collection, doc, updateDoc, getDocs, setDoc } from 'firebase/firestore';
import type { Favorites } from '@/lib/types';
import { FirestorePermissionError } from '@/firebase/errors';
import { errorEmitter } from '@/firebase/error-emitter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Newspaper } from 'lucide-react';
import { hardcodedTranslations } from '@/lib/hardcoded-translations';


export function NotificationSettingsScreen({ navigate, goBack, canGoBack, headerActions, favorites, customNames }: ScreenProps) {
  const { user } = useAuth();
  const { db } = useFirestore();

  const getDisplayName = useCallback((type: 'league' | 'team', id: number, defaultName: string) => {
    if (!customNames) return defaultName;
    const key = `${type}s` as 'leagues' | 'teams';
    const map = customNames[key] as Map<number, string>;
    const customName = map?.get(id);
    if(customName) return customName;
    
    const hardcodedName = hardcodedTranslations[key]?.[id];
    if (hardcodedName) return hardcodedName;

    return defaultName;
  }, [customNames]);

  const handleToggleNotification = (type: 'leagues' | 'general', itemId: number | string) => {
    if (!user || !db || !favorites) return;

    let fieldPath: string;
    let currentStatus: boolean;

    if (type === 'leagues') {
        fieldPath = `leagues.${itemId}.notificationsEnabled`;
        currentStatus = favorites.leagues?.[itemId as number]?.notificationsEnabled ?? true;
    } else { // general notifications like news, comments
        fieldPath = `notificationsEnabled.${itemId}`;
        currentStatus = favorites.notificationsEnabled?.[itemId as 'news'] ?? true;
    }
    
    const newStatus = !currentStatus;

    const docRef = doc(db, 'users', user.uid, 'favorites', 'data');
    const updateData = { [fieldPath]: newStatus };
    
    setDoc(docRef, updateData, { merge: true }).catch(serverError => {
      const permissionError = new FirestorePermissionError({ path: docRef.path, operation: 'update', requestResourceData: updateData });
      errorEmitter.emit('permission-error', permissionError);
    });
  };

  const favoriteLeagues = useMemo(() => {
    if (!favorites?.leagues || !customNames) return [];
    return Object.values(favorites.leagues).map(comp => ({
        ...comp,
        name: getDisplayName('league', comp.leagueId, comp.name)
    }));
  }, [favorites, customNames, getDisplayName]);

  const NotificationControlItem = ({ item, type }: { item: any, type: 'leagues' }) => {
    const id = item.leagueId;
    const isEnabled = favorites?.[type]?.[id]?.notificationsEnabled ?? true;

    return (
        <div key={id} className="flex items-center justify-between p-3 border-b last:border-b-0">
            <div className="flex items-center gap-3">
                <Avatar className="h-8 w-8">
                    <AvatarImage src={item.logo} alt={item.name} className={'object-contain p-1'} />
                    <AvatarFallback>{item.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <Label htmlFor={`notif-${id}`} className="font-semibold cursor-pointer">{item.name}</Label>
            </div>
            <Switch
                id={`notif-${id}`}
                checked={isEnabled}
                onCheckedChange={() => handleToggleNotification(type, id)}
            />
        </div>
    );
  }
  
  if (!favorites || !customNames) {
    return (
      <div className="flex h-full flex-col bg-background">
        <ScreenHeader title="إعدادات الإشعارات" onBack={goBack} canGoBack={true} actions={headerActions} />
         <div className="p-4 space-y-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1"><Skeleton className="h-4 w-3/4" /></div>
                 <Skeleton className="h-6 w-12" />
              </div>
            ))}
          </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <ScreenHeader title="إعدادات الإشعارات" onBack={goBack} canGoBack={true} actions={headerActions} />
      
      <div className="flex-1 overflow-y-auto pt-4 space-y-6">
        <Card className="mx-4">
            <CardHeader><CardTitle>الإشعارات العامة</CardTitle></CardHeader>
            <CardContent className="divide-y p-0">
                 <div className="flex items-center justify-between p-3">
                    <div className="flex items-center gap-3">
                        <Newspaper className="h-6 w-6 text-primary" />
                        <Label htmlFor="notif-news" className="font-semibold cursor-pointer">إشعارات الأخبار</Label>
                    </div>
                    <Switch
                        id="notif-news"
                        checked={favorites?.notificationsEnabled?.news ?? true}
                        onCheckedChange={() => handleToggleNotification('general', 'news')}
                    />
                </div>
            </CardContent>
        </Card>

         {favoriteLeagues.length === 0 ? (
            <p className="text-center text-muted-foreground pt-10 px-4">أضف بطولات إلى مفضلتك للتحكم في إشعاراتها بشكل منفصل.</p>
         ) : (
            <Card className="mx-4">
                <CardHeader><CardTitle>إشعارات البطولات المفضلة</CardTitle></CardHeader>
                <CardContent className="p-0">
                    <div className="rounded-lg border">
                        {favoriteLeagues.map((league) => <NotificationControlItem key={league.leagueId} item={league} type="leagues"/>)}
                    </div>
                </CardContent>
            </Card>
         )}
      </div>
    </div>
  );
}
