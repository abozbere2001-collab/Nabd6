
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


// --- Types ---
interface TeamResult {
  team: { id: number; name: string; logo: string; national?: boolean; };
}
interface LeagueResult {
    league: { id: number; name: string; logo: string; };
    country: { name: string; };
}

type Item = TeamResult['team'] | LeagueResult['league'];
type ItemType = 'teams' | 'leagues';
type RenameType = 'league' | 'team' | 'player' | 'continent' | 'country' | 'coach' | 'status' | 'crown';

interface SearchableItem {
    id: number;
    type: ItemType;
    name: string; // The translated name
    originalName: string;
    logo: string;
    originalItem: Item;
}

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


export function SearchSheet({ children, navigate, initialItemType, favorites, customNames, setFavorites, onCustomNameChange }: { children: React.ReactNode, navigate: ScreenProps['navigate'], initialItemType?: ItemType, favorites: Partial<Favorites>, customNames: any, setFavorites: React.Dispatch<React.SetStateAction<Partial<Favorites>>>, onCustomNameChange?: () => void }) {
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
  
  const [renameItem, setRenameItem] = useState<{ id: string | number; name: string; note?: string; type: RenameType; purpose: 'rename' | 'note' | 'crown'; originalData?: any; originalName?: string; } | null>(null);

  const getDisplayName = useCallback((type: 'team' | 'league', id: number, defaultName: string) => {
    if (!customNames) return defaultName;
    const customMap = type === 'team' ? customNames.teams : customNames.leagues;
    return customMap?.get(id) || hardcodedTranslations[`${type}s`]?.[id] || defaultName;
  }, [customNames]);


  const localSearchIndex = useMemo(() => {
    if (!customNames) return [];
    
    const index: SearchableItem[] = [];
    const seen = new Set<string>();

    const competitionsCache = getCachedData<any[]>(COMPETITIONS_CACHE_KEY);
    const nationalTeamsCache = getCachedData<Team[]>(TEAMS_CACHE_KEY);

    if (competitionsCache) {
      competitionsCache.forEach(comp => {
        const league = comp.league;
        const key = `leagues-${league.id}`;
        if (seen.has(key)) return;

        index.push({
          id: league.id,
          type: 'leagues',
          name: getDisplayName('league', league.id, league.name),
          originalName: league.name,
          logo: league.logo,
          originalItem: { id: league.id, name: league.name, logo: league.logo }
        });
        seen.add(key);
      });
    }

    if (nationalTeamsCache) {
      nationalTeamsCache.forEach(team => {
        const key = `teams-${team.id}`;
        if (seen.has(key)) return;

        index.push({
          id: team.id,
          type: 'teams',
          name: getDisplayName('team', team.id, team.name),
          originalName: team.name,
          logo: team.logo,
          originalItem: { ...team }
        });
        seen.add(key);
      });
    }

    return index;
  }, [customNames, getDisplayName]);


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
    if (!query) {
      setSearchResults([]);
      return;
    }
    setLoading(true);
    const finalResults: SearchableItem[] = [];
    const seen = new Set<string>();
    const normalizedQuery = normalizeArabic(query);

    // 1. Search local index (leagues and national teams)
    localSearchIndex.forEach(item => {
        const normalizedDisplayName = normalizeArabic(item.name);
        const normalizedOriginalName = normalizeArabic(item.originalName);
        if (normalizedDisplayName.includes(normalizedQuery) || normalizedOriginalName.includes(normalizedQuery)) {
            const key = `${item.type}-${item.id}`;
            if (!seen.has(key)) {
                finalResults.push(item);
                seen.add(key);
            }
        }
    });

    // 2. Search translated club teams from Firestore
    if (db) {
        try {
            const teamsCustomSnap = await getDocs(collection(db, 'teamCustomizations'));
            const matchedTeamIds: number[] = [];
            teamsCustomSnap.forEach(doc => {
                const name = doc.data().customName;
                if (normalizeArabic(name).includes(normalizedQuery)) {
                    matchedTeamIds.push(Number(doc.id));
                }
            });
            
            if(matchedTeamIds.length > 0) {
                const teamPromises = matchedTeamIds.map(id => fetch(`/api/football/teams?id=${id}`).then(res => res.json()));
                const teamResults = await Promise.all(teamPromises);
                teamResults.forEach(data => {
                    if (data.response?.[0]) {
                        const team = data.response[0].team;
                        const key = `teams-${team.id}`;
                        if (!seen.has(key)) {
                             finalResults.push({
                                id: team.id,
                                type: 'teams',
                                name: getDisplayName('team', team.id, team.name),
                                originalName: team.name,
                                logo: team.logo,
                                originalItem: team,
                            });
                            seen.add(key);
                        }
                    }
                });
            }
        } catch (e) {
            console.error("Error searching Firestore team customizations:", e);
        }
    }


    // 3. Search API for additional results
    const apiSearchPromises = [
      fetch(`/api/football/teams?search=${encodeURIComponent(query)}`).then(res => res.ok ? res.json() : { response: [] }),
      fetch(`/api/football/leagues?search=${encodeURIComponent(query)}`).then(res => res.ok ? res.json() : { response: [] })
    ];
    
    try {
        const [teamsData, leaguesData] = await Promise.all(apiSearchPromises);
        
        teamsData.response?.forEach((r: TeamResult) => {
            const key = `teams-${r.team.id}`;
            if (!seen.has(key)) {
                finalResults.push({
                    id: r.team.id,
                    type: 'teams',
                    name: getDisplayName('team', r.team.id, r.team.name),
                    originalName: r.team.name,
                    logo: r.team.logo,
                    originalItem: r.team,
                });
                seen.add(key);
            }
        });

        leaguesData.response?.forEach((r: LeagueResult) => {
            const key = `leagues-${r.league.id}`;
            if (!seen.has(key)) {
                finalResults.push({
                    id: r.league.id,
                    type: 'leagues',
                    name: getDisplayName('league', r.league.id, r.league.name),
                    originalName: r.league.name,
                    logo: r.league.logo,
                    originalItem: r.league,
                });
                seen.add(key);
            }
        });
    } catch(e) {
        console.error("API search failed", e);
    } finally {
        setSearchResults(finalResults);
        setLoading(false);
    }
  }, [getDisplayName, localSearchIndex, db]);


  useEffect(() => {
    if (debouncedSearchTerm && isOpen) {
      handleSearch(debouncedSearchTerm);
    } else {
      setSearchResults([]);
    }
  }, [debouncedSearchTerm, handleSearch, isOpen]);

    const handleFavorite = useCallback((item: Item, itemType: ItemType) => {
        const itemId = item.id;
    
        if (!user) { // Guest mode logic
            const isPopular = itemType === 'teams'
                ? POPULAR_TEAMS.some(t => t.id === itemId)
                : POPULAR_LEAGUES.some(l => l.id === itemId);
    
            if (!isPopular) {
                toast({
                    title: 'ميزة للمستخدمين المسجلين',
                    description: 'تفضيل هذا العنصر متاح فقط للمستخدمين المسجلين. يمكنك تفضيل الفرق والبطولات الشائعة كزائر.',
                });
                return;
            }
        }
    
        setFavorites(prev => {
            const newFavorites = JSON.parse(JSON.stringify(prev || {}));
            if (!newFavorites[itemType]) {
                newFavorites[itemType] = {};
            }
    
            const isCurrentlyFavorited = !!newFavorites[itemType]?.[itemId];
    
            if (isCurrentlyFavorited) {
                delete newFavorites[itemType]![itemId];
            } else {
                const favData = itemType === 'leagues'
                    ? { name: item.name, leagueId: itemId, logo: item.logo, notificationsEnabled: true }
                    : { name: (item as Team).name, teamId: itemId, logo: item.logo, type: (item as Team).national ? 'National' : 'Club' };
                newFavorites[itemType]![itemId] = favData as any;
            }
    
            if (!user) { // Guest mode: save to local storage
                setLocalFavorites(newFavorites);
            } else if (db) { // Logged-in user: update Firestore
                const favDocRef = doc(db, 'users', user.uid, 'favorites', 'data');
                const updateData = { [`${itemType}.${itemId}`]: isCurrentlyFavorited ? deleteField() : newFavorites[itemType]![itemId] };
                updateDoc(favDocRef, updateData).catch(err => {
                    errorEmitter.emit('permission-error', new FirestorePermissionError({path: favDocRef.path, operation: 'update', requestResourceData: updateData}));
                });
            }
    
            return newFavorites;
        });
    }, [user, db, setFavorites, toast]);


  const handleOpenCrownDialog = (team: Item) => {
    if (!user) {
        toast({ title: 'مستخدم زائر', description: 'يرجى تسجيل الدخول لاستخدام هذه الميزة.' });
        return;
    }
    setRenameItem({
        id: team.id,
        name: getDisplayName('team', team.id, team.name),
        type: 'crown',
        purpose: 'crown',
        originalData: team,
        note: favorites?.crownedTeams?.[team.id]?.note || '',
    });
  };


  const handleResultClick = (result: SearchableItem) => {
    if (result.type === 'teams') {
      navigate('TeamDetails', { teamId: result.id });
    } else {
      navigate('CompetitionDetails', { leagueId: result.id, title: result.name, logo: result.logo });
    }
    handleOpenChange(false);
  }

  const handleOpenRename = (type: RenameType, id: number, originalItem: Item) => {
    const currentName = getDisplayName(type as 'team' | 'league', id, originalItem.name);
    setRenameItem({ id, name: currentName, type, originalData: originalItem, purpose: 'rename', originalName: originalItem.name });
  };
  
  const handleSaveRenameOrNote = (type: RenameType, id: string | number, newName: string, newNote: string = '') => {
    if (!renameItem || !db) return;
    const { purpose, originalData, originalName } = renameItem;

    if (purpose === 'rename' && isAdmin) {
        const collectionName = `${type}Customizations`;
        const docRef = doc(db, collectionName, String(id));
        if (newName && newName !== originalName) {
            setDoc(docRef, { customName: newName });
        } else {
            deleteDoc(docRef); 
        }
        if (onCustomNameChange) onCustomNameChange();
    } else if (purpose === 'crown' && user) {
        const teamId = Number(id);
        
        setFavorites(prev => {
            if (!prev) return {};
            const newFavorites = JSON.parse(JSON.stringify(prev));
            if (!newFavorites.crownedTeams) newFavorites.crownedTeams = {};
            const isCurrentlyCrowned = !!newFavorites.crownedTeams?.[teamId];

            if (isCurrentlyCrowned) {
                delete newFavorites.crownedTeams[teamId];
            } else {
                newFavorites.crownedTeams[teamId] = { teamId, name: (originalData as Team).name, logo: (originalData as Team).logo, note: newNote };
            }

            if (user && !user.isAnonymous) {
                const favDocRef = doc(db, 'users', user.uid, 'favorites', 'data');
                const updateData = { [`crownedTeams.${teamId}`]: newFavorites.crownedTeams[teamId] || deleteField() };
                updateDoc(favDocRef, updateData).catch(err => {
                    errorEmitter.emit('permission-error', new FirestorePermissionError({ path: favDocRef.path, operation: 'update', requestResourceData: updateData }));
                });
            } else {
                setLocalFavorites(newFavorites);
            }
            return newFavorites;
        });
    }
    setRenameItem(null);
  };
  
  const popularItems = useMemo(() => {
    if (!customNames) return [];
    const seen = new Set<string>();

    return [...POPULAR_TEAMS, ...POPULAR_LEAGUES].map(item => {
        const type = 'national' in item || 'type' in item ? 'teams' : 'leagues';
        const key = `${type}-${item.id}`;
        if (seen.has(key)) return null;
        seen.add(key);

        return {
            id: item.id,
            type: type as ItemType,
            name: getDisplayName(type.slice(0, -1) as 'team' | 'league', item.id, item.name),
            originalName: item.name,
            logo: item.logo,
            originalItem: item as Item,
        };
    }).filter(Boolean) as SearchableItem[];

  }, [getDisplayName, customNames]);

  const renderContent = () => {
    if (!customNames || !favorites) {
      return <div className="flex justify-center items-center h-full"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }

    if (loading) {
        return <div className="flex justify-center items-center h-full"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }
    
    const itemsToDisplay = debouncedSearchTerm ? searchResults : popularItems.filter(item => item.type === itemType);

    if (itemsToDisplay.length === 0 && debouncedSearchTerm) {
        return <p className="text-muted-foreground text-center pt-8">لا توجد نتائج بحث.</p>;
    }

    if(itemsToDisplay.length === 0 && !debouncedSearchTerm) {
        return <p className="text-muted-foreground text-center pt-8">لا توجد عناصر شائعة لعرضها.</p>;
    }


    return (
        <div className="space-y-2">
            {!debouncedSearchTerm && <h3 className="font-bold text-md text-center text-muted-foreground">{itemType === 'teams' ? 'الفرق الأكثر شعبية' : 'البطولات الأكثر شعبية'}</h3>}
             {itemsToDisplay.map(result => {
                    const isFavorited = !!favorites[result.type]?.[result.id];
                    const isCrowned = result.type === 'teams' && !!favorites.crownedTeams?.[result.id];
                    return <ItemRow 
                                key={`${result.type}-${result.id}`} 
                                item={{...result.originalItem, name: result.name}}
                                itemType={result.type} 
                                isFavorited={isFavorited} 
                                isCrowned={isCrowned}
                                onFavoriteToggle={handleFavorite} 
                                onCrownToggle={(item) => handleOpenCrownDialog(item)}
                                onResultClick={() => handleResultClick(result)} 
                                isAdmin={isAdmin} 
                                onRename={() => handleOpenRename(result.type as RenameType, result.id, result.originalItem)} 
                            />;
                })
            }
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
            onSave={(type, id, name, note) => handleSaveRenameOrNote(type as RenameType, id, name, note || '')}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

