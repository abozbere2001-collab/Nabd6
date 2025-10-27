

"use client";

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from '@/components/ui/button';
import { Search, Star, Pencil, Loader2, Crown } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useDebounce } from '@/hooks/use-debounce';
import type { ScreenProps } from '@/app/page';
import { useAdmin, useAuth, useFirestore } from '@/firebase';
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, writeBatch, deleteField, onSnapshot, updateDoc } from 'firebase/firestore';
import { RenameDialog } from '@/components/RenameDialog';
import { cn } from '@/lib/utils';
import type { Favorites, AdminFavorite, ManagedCompetition, Team, CrownedTeam } from '@/lib/types';
import { FirestorePermissionError } from '@/firebase/errors';
import { errorEmitter } from '@/firebase/error-emitter';
import { useToast } from '@/hooks/use-toast';
import { POPULAR_TEAMS, POPULAR_LEAGUES } from '@/lib/popular-data';
import { hardcodedTranslations } from '@/lib/hardcoded-translations';
import { getLocalFavorites, setLocalFavorites } from '@/lib/local-favorites';

// --- Types ---
interface TeamResult {
  team: { id: number; name: string; logo: string; national?: boolean; };
}
interface LeagueResult {
  league: { id: number; name: string; logo: string; };
}

type Item = TeamResult['team'] | LeagueResult['league'];
type ItemType = 'teams' | 'leagues';
type SearchResult = (TeamResult & { type: 'team' }) | (LeagueResult & { type: 'league' });
type RenameType = 'league' | 'team' | 'player' | 'continent' | 'country' | 'coach' | 'status' | 'crown';

interface SearchableItem {
    id: number;
    type: ItemType;
    name: string;
    normalizedName: string;
    logo: string;
    originalItem: Item;
}


// --- Cache Logic ---
const COMPETITIONS_CACHE_KEY = 'goalstack_all_competitions_cache';
const TEAMS_CACHE_KEY = 'goalstack_national_teams_cache';
interface Cache<T> {
    data: T;
    lastFetched: number;
}
const getCachedData = <T>(key: string): T | null => {
    if (typeof window === 'undefined') return null;
    try {
        const cachedData = localStorage.getItem(key);
        if (!cachedData) return null;
        const parsed = JSON.parse(cachedData) as Cache<T>;
        return parsed.data;
    } catch (error) {
        return null;
    }
};


const normalizeArabic = (text: string) => {
  if (!text) return '';
  return text
    .replace(/[\u064B-\u0652]/g, "") // Remove harakat
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
};


const ItemRow = ({ item, itemType, isFavorited, isCrowned, onFavoriteToggle, onCrownToggle, onResultClick, onRename, isAdmin }: { item: Item, itemType: ItemType, isFavorited: boolean, isCrowned: boolean, onFavoriteToggle: (item: Item, itemType: ItemType) => void, onCrownToggle: (item: Item) => void, onResultClick: () => void, onRename: () => void, isAdmin: boolean }) => {
  return (
    <div className="flex items-center gap-2 p-1.5 border-b last:border-b-0 hover:bg-accent/50 rounded-md">
       <div className="flex-1 flex items-center gap-2 cursor-pointer" onClick={onResultClick}>
            <Avatar className={cn('h-7 w-7', itemType === 'leagues' && 'p-0.5')}>
                <AvatarImage src={item.logo} alt={item.name} className={itemType === 'leagues' ? 'object-contain' : 'object-cover'} />
                <AvatarFallback>{item.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 font-semibold truncate text-sm">{item.name}</div>
        </div>
        <div className="flex items-center">
            {isAdmin && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); onRename(); }}>
                    <Pencil className="h-4 w-4 text-muted-foreground" />
                </Button>
            )}
            {itemType === 'teams' && (
                 <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); onCrownToggle(item); }}>
                    <Crown className={cn("h-5 w-5 text-muted-foreground/60", isCrowned && "fill-current text-yellow-400")} />
                </Button>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); onFavoriteToggle(item, itemType); }}>
                <Star className={cn("h-5 w-5 text-muted-foreground/60", isFavorited && "fill-current text-yellow-400")} />
            </Button>
        </div>
    </div>
  );
}


export function SearchSheet({ children, navigate, initialItemType }: { children: React.ReactNode, navigate: ScreenProps['navigate'], initialItemType?: ItemType }) {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const [searchResults, setSearchResults] = useState<SearchableItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  
  const [itemType, setItemType] = useState<ItemType>(initialItemType || 'teams');

  const { isAdmin } = useAdmin();
  const { user } = useAuth();
  const { db } = useFirestore();
  const { toast } = useToast();
  const [favorites, setFavorites] = useState<Partial<Favorites>>({});
  
  const [renameItem, setRenameItem] = useState<{ id: string | number; name: string; note?: string; type: RenameType; purpose: 'rename' | 'note' | 'crown'; originalData?: any; } | null>(null);

  const [localSearchIndex, setLocalSearchIndex] = useState<SearchableItem[]>([]);
  
  const buildLocalIndex = useCallback(async () => {
    if (!db) return;
    setLoading(true);
    const index: SearchableItem[] = [];
    const competitionsCache = getCachedData<any[]>(COMPETITIONS_CACHE_KEY);
    const nationalTeamsCache = getCachedData<Team[]>(TEAMS_CACHE_KEY);
    
    let customTeamNames = new Map<number, string>();
    let customLeagueNames = new Map<number, string>();

    if(db) {
        try {
            const [teamsSnap, leaguesSnap] = await Promise.all([
                getDocs(collection(db, 'teamCustomizations')),
                getDocs(collection(db, 'leagueCustomizations'))
            ]);
            teamsSnap?.forEach(doc => customTeamNames.set(Number(doc.id), doc.data().customName));
            leaguesSnap?.forEach(doc => customLeagueNames.set(Number(doc.id), doc.data().customName));
        } catch (e) {
            // Non-admin may not have access, that's fine.
        }
    }

    const getName = (type: 'team' | 'league', id: number, defaultName: string) => {
        const customMap = type === 'team' ? customTeamNames : customLeagueNames;
        return customMap.get(id) || hardcodedTranslations[`${type}s`]?.[id] || defaultName;
    };

    if (competitionsCache) {
        competitionsCache.forEach(comp => {
            const league = comp.league;
            const name = getName('league', league.id, league.name);
            index.push({
                id: league.id,
                type: 'leagues',
                name,
                normalizedName: normalizeArabic(name),
                logo: league.logo,
                originalItem: { id: league.id, name: league.name, logo: league.logo }
            });
        });
    }

    if (nationalTeamsCache) {
        nationalTeamsCache.forEach(team => {
            const name = getName('team', team.id, team.name);
            index.push({
                id: team.id,
                type: 'teams',
                name,
                normalizedName: normalizeArabic(name),
                logo: team.logo,
                originalItem: { ...team }
            });
        });
    }
    
    setLocalSearchIndex(index);
    setLoading(false);
  }, [db]);


  useEffect(() => {
    if (isOpen) {
        buildLocalIndex();
        
        let unsubscribe: (() => void) | null = null;
        const handleLocalFavoritesChange = () => {
            setFavorites(getLocalFavorites());
        };

        if (user && db && !user.isAnonymous) {
             const favoritesRef = doc(db, 'users', user.uid, 'favorites', 'data');
            unsubscribe = onSnapshot(favoritesRef, (docSnap) => {
                setFavorites(docSnap.exists() ? (docSnap.data() as Favorites) : {});
            }, (error) => {
                const permissionError = new FirestorePermissionError({
                    path: favoritesRef.path,
                    operation: 'get',
                });
                errorEmitter.emit('permission-error', permissionError);
            });
            window.removeEventListener('localFavoritesChanged', handleLocalFavoritesChange);
        } else {
             setFavorites(getLocalFavorites());
             window.addEventListener('localFavoritesChanged', handleLocalFavoritesChange);
        }

        return () => {
            if (unsubscribe) unsubscribe();
            window.removeEventListener('localFavoritesChanged', handleLocalFavoritesChange);
        }
    }
  }, [isOpen, user, db, buildLocalIndex]);


  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setSearchTerm('');
      setSearchResults([]);
      if (initialItemType) {
        setItemType(initialItemType);
      }
    }
  };

  const handleSearch = useCallback(async (query: string) => {
    setLoading(true);
    const normalizedQuery = normalizeArabic(query);

    if (!normalizedQuery) {
        setSearchResults([]);
        setLoading(false);
        return;
    }
    
    // Start with local search
    const localResults = localSearchIndex.filter(item => 
        item.name.toLowerCase().includes(query.toLowerCase()) || item.normalizedName.includes(normalizedQuery)
    );
    const existingIds = new Set(localResults.map(r => `${r.type}-${r.id}`));

    // Simultaneously fetch from API
    const apiSearchPromises = [
      fetch(`/api/football/teams?search=${query}`).then(res => res.ok ? res.json() : { response: [] }),
      fetch(`/api/football/leagues?search=${query}`).then(res => res.ok ? res.json() : { response: [] })
    ];
    
    try {
        const [teamsData, leaguesData] = await Promise.all(apiSearchPromises);
        
        teamsData.response?.forEach((r: TeamResult) => {
            if(!existingIds.has(`teams-${r.team.id}`)) {
                localResults.push({
                    id: r.team.id,
                    type: 'teams',
                    name: r.team.name,
                    normalizedName: normalizeArabic(r.team.name),
                    logo: r.team.logo,
                    originalItem: r.team,
                });
                existingIds.add(`teams-${r.team.id}`);
            }
        });
        leaguesData.response?.forEach((r: LeagueResult) => {
             if(!existingIds.has(`leagues-${r.league.id}`)) {
                localResults.push({
                    id: r.league.id,
                    type: 'leagues',
                    name: r.league.name,
                    normalizedName: normalizeArabic(r.league.name),
                    logo: r.league.logo,
                    originalItem: r.league,
                });
                existingIds.add(`leagues-${r.league.id}`);
            }
        });
    } catch(e) {
        console.error("API search failed, showing local results only.", e);
    }
    
    setSearchResults(localResults);
    setLoading(false);
  }, [localSearchIndex]);


  useEffect(() => {
    if (debouncedSearchTerm && isOpen) {
      handleSearch(debouncedSearchTerm);
    } else {
      setSearchResults([]);
    }
  }, [debouncedSearchTerm, handleSearch, isOpen]);

 const getDisplayName = useCallback((type: 'team' | 'league', id: number, defaultName: string): string => {
    const item = localSearchIndex.find(i => i.id === id && i.type === `${type}s`);
    return item?.name || hardcodedTranslations[`${type}s`]?.[id] || defaultName;
}, [localSearchIndex]);


    const handleFavorite = useCallback((item: Item, itemType: ItemType) => {
        const itemId = item.id;
        const isLeague = itemType === 'leagues';

        setFavorites(prev => {
            const newFavs = JSON.parse(JSON.stringify(prev));
            if (!newFavs[itemType]) newFavs[itemType] = {};
            
            if (newFavs[itemType][itemId]) {
                delete newFavs[itemType][itemId];
            } else {
                const favData = isLeague 
                    ? { name: item.name, leagueId: itemId, logo: item.logo }
                    : { name: item.name, teamId: itemId, logo: item.logo, type: (item as Team).national ? 'National' : 'Club' };
                newFavs[itemType][itemId] = favData as any;
            }

            if (!user || user.isAnonymous) {
                setLocalFavorites(newFavs);
            }
            return newFavs;
        });

        if (user && db && !user.isAnonymous) {
            const favDocRef = doc(db, 'users', user.uid, 'favorites', 'data');
            const isCurrentlyFavorited = !!favorites[itemType]?.[itemId];
            const fieldPath = `${itemType}.${itemId}`;
            
            const updateData = isCurrentlyFavorited
                ? { [fieldPath]: deleteField() }
                : { [fieldPath]: isLeague 
                    ? { name: item.name, leagueId: itemId, logo: item.logo } 
                    : { name: item.name, teamId: itemId, logo: item.logo, type: (item as Team).national ? 'National' : 'Club' } };

            updateDoc(favDocRef, updateData).catch(err => {
                errorEmitter.emit('permission-error', new FirestorePermissionError({path: favDocRef.path, operation: 'update', requestResourceData: updateData}))
            });
        }
    }, [user, db, favorites]);

  const handleCrownToggle = useCallback((item: Item) => {
    const team = item as Team;
    const teamId = team.id;
    if (!user || user.isAnonymous) {
        toast({title: 'مستخدم زائر', description: 'يرجى تسجيل الدخول لاستخدام هذه الميزة.'});
        return;
    }
    if (!db) return;

    setFavorites(prev => {
        const newFavs = JSON.parse(JSON.stringify(prev));
        if (!newFavs.crownedTeams) newFavs.crownedTeams = {};
        if (newFavs.crownedTeams[teamId]) {
            delete newFavs.crownedTeams[teamId];
        } else {
            newFavs.crownedTeams[teamId] = { teamId, name: team.name, logo: team.logo, note: '' };
        }
        if (!user || user.isAnonymous) {
            setLocalFavorites(newFavs);
        }
        return newFavs;
    });

    const favRef = doc(db, 'users', user.uid, 'favorites', 'data');
    const fieldPath = `crownedTeams.${teamId}`;
    const isCrowned = !!favorites.crownedTeams?.[teamId];

    const updateData = isCrowned 
        ? { [fieldPath]: deleteField() }
        : { [fieldPath]: { teamId, name: team.name, logo: team.logo, note: '' } };
    
    updateDoc(favRef, updateData).catch(err => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({path: favRef.path, operation: 'update', requestResourceData: updateData}));
    });
  }, [user, db, favorites, toast]);


  const handleResultClick = (result: SearchableItem) => {
    if (result.type === 'teams') {
      navigate('TeamDetails', { teamId: result.id });
    } else {
      navigate('CompetitionDetails', { leagueId: result.id, title: result.name, logo: result.logo });
    }
    handleOpenChange(false);
  }

  const handleOpenRename = (type: RenameType, id: number, originalData: any) => {
    const currentName = getDisplayName(type as 'team' | 'league', id, originalData.name);
    setRenameItem({ id, name: currentName, type, originalData, purpose: 'rename' });
  };
  
  const handleSaveRenameOrNote = async (type: RenameType, id: string | number, newName: string, newNote?: string) => {
    if (!renameItem || !db) return;
    const { originalData, purpose } = renameItem;

    if (purpose === 'rename' && isAdmin && db) {
        const collectionName = `${type}Customizations`;
        const docRef = doc(db, collectionName, String(id));
        if (newName && newName !== originalData.name) {
            await setDoc(docRef, { customName: newName });
        } else {
            await deleteDoc(docRef); 
        }
        toast({ title: 'نجاح', description: 'تم حفظ التغييرات. قد تحتاج لإعادة فتح البحث لرؤية التحديث.' });
        await buildLocalIndex();
        if(debouncedSearchTerm) {
            handleSearch(debouncedSearchTerm);
        }
    }
    setRenameItem(null);
  };
  
  const popularItems = itemType === 'teams' ? POPULAR_TEAMS : POPULAR_LEAGUES;

  const renderContent = () => {
    if (loading) {
      return <div className="flex justify-center items-center h-full"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }
    
    const itemsToRender = debouncedSearchTerm ? searchResults.filter(i => i.type === itemType) : popularItems.map(item => ({
        id: item.id,
        type: itemType,
        name: item.name,
        logo: item.logo,
        originalItem: item,
        normalizedName: normalizeArabic(item.name)
    })).filter(i => i.type === itemType);

    if (itemsToRender.length === 0 && debouncedSearchTerm) {
        return <p className="text-muted-foreground text-center pt-8">لا توجد نتائج بحث.</p>;
    }

    return (
        <div className="space-y-2">
            {!debouncedSearchTerm && <h3 className="font-bold text-md text-center text-muted-foreground">{itemType === 'teams' ? 'الفرق الأكثر شعبية' : 'البطولات الأكثر شعبية'}</h3>}
            {itemsToRender.map(result => {
                const isFavorited = !!favorites[result.type]?.[result.id];
                const isCrowned = result.type === 'teams' && !!favorites.crownedTeams?.[result.id];
                const displayName = getDisplayName(result.type.slice(0, -1) as 'team'|'league', result.id, result.name);

                return <ItemRow 
                            key={`${result.type}-${result.id}`} 
                            item={{...result.originalItem, name: displayName}} 
                            itemType={result.type} 
                            isFavorited={isFavorited} 
                            isCrowned={isCrowned}
                            onFavoriteToggle={handleFavorite} 
                            onCrownToggle={handleCrownToggle}
                            onResultClick={() => handleResultClick(result)} 
                            isAdmin={isAdmin} 
                            onRename={() => handleOpenRename(result.type as RenameType, result.id, result.originalItem)} 
                        />;
            })}
        </div>
    )
  }

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild onClick={(e) => { e.stopPropagation(); setIsOpen(true) }}>{children}</SheetTrigger>
      <SheetContent side="bottom" className="flex flex-col h-[90vh] top-0 rounded-t-none">
        <SheetHeader>
          <SheetTitle>اكتشف</SheetTitle>
        </SheetHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="ابحث عن فريق أو بطولة..."
            className="pl-10 text-md"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        {!debouncedSearchTerm && (
             <div className="flex items-center justify-center pt-2">
                <Button variant={itemType === 'teams' ? 'secondary' : 'ghost'} size="sm" onClick={() => setItemType('teams')}>الفرق</Button>
                <Button variant={itemType === 'leagues' ? 'secondary' : 'ghost'} size="sm" onClick={() => setItemType('leagues')}>البطولات</Button>
            </div>
        )}
        <div className="mt-4 flex-1 overflow-y-auto space-y-1 pr-2 relative">
          {renderContent()}
        </div>
        
        {renameItem && (
          <RenameDialog 
            isOpen={!!renameItem}
            onOpenChange={(isOpen) => !isOpen && setRenameItem(null)}
            item={renameItem}
            onSave={(type, id, name, note) => handleSaveRenameOrNote(type as RenameType, id, name, note)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

