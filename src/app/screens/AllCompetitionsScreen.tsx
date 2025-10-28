

"use client";

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Star, Pencil, Plus, Search, Users, Trophy, Loader2, RefreshCw, Crown } from 'lucide-react';
import type { ScreenProps } from '@/app/page';
import { Button } from '@/components/ui/button';
import { useAdmin, useAuth, useFirestore } from '@/firebase';
import { doc, setDoc, getDocs, writeBatch, getDoc, deleteDoc, deleteField, updateDoc } from 'firebase/firestore';
import { RenameDialog } from '@/components/RenameDialog';
import { AddCompetitionDialog } from '@/components/AddCompetitionDialog';
import { FirestorePermissionError } from '@/firebase/errors';
import { errorEmitter } from '@/firebase/error-emitter';
import type { Favorites, ManagedCompetition as ManagedCompetitionType, Team, FavoriteTeam, FavoriteLeague, CrownedLeague, CrownedTeam } from '@/lib/types';
import { SearchSheet } from '@/components/SearchSheet';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from '@/hooks/use-toast';
import { getLocalFavorites, setLocalFavorites } from '@/lib/local-favorites';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ProfileButton } from '../AppContentWrapper';
import { hardcodedTranslations } from '@/lib/hardcoded-translations';
import { LeagueHeaderItem } from '@/components/LeagueHeaderItem';
import { cn } from '@/lib/utils';
import { collection } from 'firebase/firestore';
import { POPULAR_LEAGUES, POPULAR_TEAMS } from '@/lib/popular-data';

// --- Persistent Cache Logic ---
const COMPETITIONS_CACHE_KEY = 'goalstack_all_competitions_cache_v2';
const COUNTRIES_CACHE_KEY = 'goalstack_countries_cache_v2';
const TEAMS_CACHE_KEY = 'goalstack_national_teams_cache_v2';
const CACHE_EXPIRATION_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

interface CacheItem<T> {
    data: T;
    lastFetched: number;
}

const getCachedData = <T>(key: string): T | null => {
    if (typeof window === 'undefined') return null;
    try {
        const cachedData = sessionStorage.getItem(key); // Use sessionStorage
        if (!cachedData) return null;
        const parsed: CacheItem<T> = JSON.parse(cachedData);
        if (!parsed || !parsed.lastFetched || Date.now() - parsed.lastFetched > CACHE_EXPIRATION_MS) {
            sessionStorage.removeItem(key);
            return null;
        }
        return parsed.data;
    } catch (error) {
        return null;
    }
};

const setCachedData = <T>(key: string, data: T) => {
    if (typeof window === 'undefined') return;
    try {
        const cacheData: CacheItem<T> = { data, lastFetched: Date.now() };
        sessionStorage.setItem(key, JSON.stringify(cacheData)); // Use sessionStorage
    } catch (error) {
        console.warn(`Could not set sessionStorage for key "${key}"`, error);
    }
};


// --- TYPE DEFINITIONS ---
interface FullLeague {
  league: { id: number; name: string; type: string; logo: string; };
  country: { name: string; code: string; flag: string; };
  seasons: any[];
}
interface NestedGroupedCompetitions {
    [continent: string]: {
        [country: string]: FullLeague[];
    };
}
type RenameType = 'league' | 'team' | 'player' | 'continent' | 'country' | 'coach' | 'status' | 'crown';
interface RenameState {
  id: string | number;
  name: string;
  type: RenameType;
  purpose: 'rename' | 'note' | 'crown';
  note?: string;
  originalData?: any;
  originalName?: string;
}

// --- CONSTANTS ---
const countryToContinent: { [key: string]: string } = {
    "World": "World", "England": "Europe", "Spain": "Europe", "Germany": "Europe", "Italy": "Europe", "France": "Europe", "Netherlands": "Europe", "Portugal": "Europe", "Belgium": "Europe", "Russia": "Europe", "Turkey": "Europe", "Greece": "Europe", "Switzerland": "Europe", "Austria": "Europe", "Denmark": "Europe", "Scotland": "Europe", "Sweden": "Europe", "Norway": "Europe", "Poland": "Europe", "Ukraine": "Europe", "Czech-Republic": "Europe", "Croatia": "Europe", "Romania": "Europe", "Serbia": "Europe", "Hungary": "Europe", "Finland": "Europe", "Ireland": "Europe", "Northern-Ireland": "Europe", "Wales": "Europe", "Iceland": "Europe", "Albania": "Europe", "Georgia": "Europe", "Latvia": "Europe", "Estonia": "Europe", "Lithuania": "Europe", "Luxembourg": "Europe", "Faroe-Islands": "Europe", "Malta": "Europe", "Andorra": "Europe", "San-Marino": "Europe", "Gibraltar": "Europe", "Kosovo": "Europe", "Bosnia-and-Herzegovina": "Europe", "Slovakia": "Europe", "Slovenia": "Europe", "Bulgaria": "Europe", "Cyprus": "Europe", "Azerbaijan": "Europe", "Armenia": "Europe", "Belarus": "Europe", "Moldova": "Europe", "North-Macedonia": "Europe", "Montenegro": "Europe",
    "Saudi Arabia": "Asia", "Japan": "Asia", "South Korea": "Asia", "China": "Asia", "Qatar": "Asia", "United Arab Emirates": "Asia", "Iran": "Asia", "Iraq": "Asia", "Uzbekistan": "Asia", "Australia": "Asia", "Jordan": "Asia", "Syria": "Asia", "Lebanon": "Asia", "Oman": "Asia", "Kuwait": "Asia", "Bahrain": "Asia", "India": "Asia", "Thailand": "Asia", "Vietnam": "Asia", "Malaysia": "Asia", "Indonesia": "Asia", "Singapore": "Asia", "Philippines": "Asia", "Hong Kong": "Asia", "Palestine": "Asia", "Tajikistan": "Asia", "Turkmenistan": "Asia", "Kyrgyzstan": "Asia", "Bangladesh": "Asia", "Maldives": "Asia", "Cambodia": "Asia", "Myanmar": "Asia", "Yemen": "Asia",
    "Egypt": "Africa", "Morocco": "Africa", "Tunisia": "Africa", "Algeria": "Africa", "Nigeria": "Africa", "Senegal": "Africa", "Ghana": "Africa", "Ivory Coast": "Africa", "Cameroon": "Africa", "South Africa": "Africa", "DR Congo": "Africa", "Mali": "Africa", "Burkina Faso": "Africa", "Guinea": "Africa", "Zambia": "Africa", "Cape Verde": "Africa", "Uganda": "Africa", "Kenya": "Africa", "Tanzania": "Africa", "Sudan": "Africa", "Libya": "Africa", "Angola": "Africa", "Zimbabwe": "Africa", "Ethiopia": "Africa",
    "USA": "North America", "Mexico": "North America", "Canada": "North America", "Costa Rica": "North America", "Honduras": "North America", "Panama": "North America", "Jamaica": "North America", "El Salvador": "North America", "Trinidad and Tobago": "North America", "Guatemala": "North America", "Nicaragua": "North America", "Cuba": "North America",
    "Brazil": "South America", "Argentina": "South America", "Colombia": "South America", "Chile": "South America", "Uruguay": "South America", "Peru": "South America", "Ecuador": "South America", "Paraguay": "South America", "Venezuela": "South America", "Bolivia": "South America",
    "New Zealand": "Oceania", "Fiji": "Oceania",
};

const continentOrder = ["World", "Europe", "Asia", "Africa", "South America", "North America", "Oceania", "Other"];
const WORLD_LEAGUES_KEYWORDS = ["world", "uefa", "champions league", "europa", "copa libertadores", "copa sudamericana", "caf champions", "afc champions", "conmebol", "concacaf", "arab", "club world cup", "nations league"];

const priorityCountries = [ "England", "Spain", "Germany", "Italy", "France", "Netherlands", "Portugal", "Saudi Arabia", "Iraq", "Japan", "Australia", "Brazil", "Argentina", "Egypt", "Morocco", "Tunisia", "Algeria", "Qatar", "United Arab Emirates", "Jordan", "Syria", "Lebanon", "Oman", "Kuwait", "Bahrain", "Sudan", "Libya", "Yemen"];
const priorityNationalTeams = [
    // South America
    6, 28, 5, 4, 7, // Brazil, Argentina, Colombia, Chile, Uruguay
    // Europe
    2, 8, 9, 10, 12, 13, 27, 21, // France, Germany, England, Portugal, Spain, Italy, Netherlands, Belgium
    // Asia
    769, 768, 775, 25, 24, 22, 17, // Iraq, Saudi Arabia, Qatar, Japan, South Korea, Iran, Australia
    // Africa
    15, 19, 20, 29, 31, 23, // Morocco, Egypt, Algeria, Tunisia, Senegal, Nigeria
];


// --- Sorting Logic ---
const getLeagueImportance = (leagueName: string): number => {
    const lowerCaseName = leagueName.toLowerCase();
    // World
    if (lowerCaseName.includes('world cup')) return 1;
    if (lowerCaseName.includes('champions league')) return 2;
    if (lowerCaseName.includes('euro') || lowerCaseName.includes('copa america') || lowerCaseName.includes('afc asian cup') || lowerCaseName.includes('africa cup of nations')) return 3;
    if (lowerCaseName.includes('europa league') || lowerCaseName.includes('afc cup') || lowerCaseName.includes('conference league')) return 4;
    if (lowerCaseName.includes('nations league') || lowerCaseName.includes('club world cup')) return 5;
    if (lowerCaseName.includes('friendly')) return 99;

    // Domestic
    if (lowerCaseName.includes('premier league') || lowerCaseName.includes('la liga') || lowerCaseName.includes('serie a') || lowerCaseName.includes('bundesliga') || lowerCaseName.includes('ligue 1') || lowerCaseName.includes('stars league')) return 10;
    if (lowerCaseName.includes('cup') || lowerCaseName.includes('copa') || lowerCaseName.includes('kfp') || lowerCaseName.includes("king's cup")) return 11;
    if (lowerCaseName.includes('championship') || lowerCaseName.includes('segunda') || lowerCaseName.includes('serie b') || lowerCaseName.includes('division 2')) return 12;

    return 50; // Default importance
}


// --- MAIN SCREEN COMPONENT ---
export function AllCompetitionsScreen({ navigate, goBack, canGoBack, favorites, customNames, setFavorites, onCustomNameChange }: ScreenProps & {setFavorites: React.Dispatch<React.SetStateAction<Partial<Favorites>>>, onCustomNameChange: () => Promise<void>}) {
    const { isAdmin } = useAdmin();
    const { user } = useAuth();
    const { db } = useFirestore();
    const { toast } = useToast();
    
    const [renameItem, setRenameItem] = useState<RenameState | null>(null);
    const [isAddOpen, setAddOpen] = useState(false);

    const [allLeagues, setAllLeagues] = useState<FullLeague[]>([]);
    const [nationalTeams, setNationalTeams] = useState<Team[] | null>(null);
    const [loadingClubData, setLoadingClubData] = useState(false);
    const [loadingNationalTeams, setLoadingNationalTeams] = useState(false);
    
    const getName = useCallback((type: 'league' | 'team' | 'country' | 'continent', id: string | number, defaultName: string) => {
        if (!customNames || !id) return defaultName || '';
        const mapKey = type === 'league' ? 'leagues' : type === 'team' ? 'teams' : type === 'country' ? 'countries' : 'continents';
        const firestoreMap = customNames[mapKey];
        
        const customName = firestoreMap?.get(id as any);
        if (customName) return customName;
        
        const hardcodedKey = `${type}s` as 'leagues' | 'teams' | 'countries' | 'continents';
        const hardcodedName = hardcodedTranslations[hardcodedKey]?.[id];
        if (hardcodedName) return hardcodedName;

        return defaultName;
    }, [customNames]);


    const fetchAllCompetitions = useCallback(async () => {
        const cached = getCachedData<FullLeague[]>(COMPETITIONS_CACHE_KEY);
        if (cached && cached.length > 0) {
            setAllLeagues(cached);
            return;
        }

        setLoadingClubData(true);
        toast({ title: 'جاري جلب بيانات البطولات...', description: 'قد تستغرق هذه العملية دقيقة في المرة الأولى.' });
        
        try {
            const res = await fetch('/api/football/leagues');
            if (!res.ok) throw new Error("Failed to fetch leagues");
            const data = await res.json();
            const leaguesData: FullLeague[] = data.response || [];
            
            setAllLeagues(leaguesData);
            setCachedData(COMPETITIONS_CACHE_KEY, leaguesData);

        } catch (error) {
             console.error("Error fetching all leagues:", error);
            toast({ variant: 'destructive', title: "خطأ", description: "فشل في جلب بيانات البطولات." });
        } finally {
            setLoadingClubData(false);
        }
    }, [toast]);

    
    const sortedGroupedCompetitions = useMemo(() => {
        if (!customNames) return {};
        const grouped: NestedGroupedCompetitions = {};

        allLeagues
            .filter(l => l.league.type.toLowerCase() === 'cup' || l.league.type.toLowerCase() === 'league')
            .forEach(league => {
                const leagueNameLower = league.league.name.toLowerCase();
                const countryNameLower = league.country.name.toLowerCase();
                let continent: string;

                if (WORLD_LEAGUES_KEYWORDS.some(keyword => leagueNameLower.includes(keyword)) || countryNameLower === 'world') {
                    continent = "World";
                } else {
                    continent = countryToContinent[league.country.name] || "Other";
                }

                if (!grouped[continent]) {
                    grouped[continent] = {};
                }
                const countryKey = league.country.name || "N/A";
                if (!grouped[continent][countryKey]) {
                    grouped[continent][countryKey] = [];
                }
                grouped[continent][countryKey].push(league);
            });
        
        // Sort leagues within each country
        for (const continent in grouped) {
            for (const country in grouped[continent]) {
                grouped[continent][country].sort((a, b) => {
                    const importanceA = getLeagueImportance(a.league.name);
                    const importanceB = getLeagueImportance(b.league.name);
                    if (importanceA !== importanceB) {
                        return importanceA - importanceB;
                    }
                    // Secondary sort by translated name if importance is the same
                    const translatedNameA = getName('league', a.league.id, a.league.name);
                    const translatedNameB = getName('league', b.league.id, b.league.name);
                    return translatedNameA.localeCompare(translatedNameB, 'ar');
                });
            }
        }
        
        return grouped;
    }, [allLeagues, getName, customNames]);

    
    const fetchNationalTeams = useCallback(async () => {
        const cached = getCachedData<Team[]>(TEAMS_CACHE_KEY);
        if (cached && cached.length > 0) {
            setNationalTeams(cached);
            return;
        }

        setLoadingNationalTeams(true);
        toast({ title: 'جاري جلب بيانات المنتخبات...', description: 'قد تستغرق هذه العملية دقيقة في المرة الأولى.' });
    
        try {
            let countries: { name: string }[] = [];
            const cachedCountries = getCachedData<{ name: string }[]>(COUNTRIES_CACHE_KEY);
            if (cachedCountries) {
                countries = cachedCountries;
            } else {
                const countriesRes = await fetch('/api/football/countries');
                if (!countriesRes.ok) throw new Error('Failed to fetch countries');
                const countriesData = await countriesRes.json();
                countries = countriesData.response || [];
                setCachedData(COUNTRIES_CACHE_KEY, countries);
            }

            const teamPromises = countries.map(country => 
                fetch(`/api/football/teams?country=${country.name}`)
                    .then(res => res.ok ? res.json() : { response: [] })
                    .then(data => (data.response || []).filter((r: { team: Team }) => r.team.national).map((r: { team: Team}) => r.team))
                    .catch(() => [])
            );
    
            const results = await Promise.all(teamPromises);
            const nationalTeamsData = results.flat();
            
            setCachedData(TEAMS_CACHE_KEY, nationalTeamsData);
            setNationalTeams(nationalTeamsData);

        } catch (error) {
            console.error("Error fetching national teams:", error);
            toast({ variant: 'destructive', title: "خطأ", description: "فشل في جلب بيانات المنتخبات الوطنية." });
        } finally {
            setLoadingNationalTeams(false);
        }
    }, [toast]);
    
    const groupedNationalTeams = useMemo(() => {
        if (!nationalTeams || !customNames) return null;

        const processedTeams = nationalTeams.map(team => ({
            ...team,
            name: getName('team', team.id, team.name),
        }));

        const grouped: { [continent: string]: Team[] } = {};
        processedTeams.forEach(team => {
            const continent = countryToContinent[team.country || team.name] || "Other";
            if (!grouped[continent]) grouped[continent] = [];
            grouped[continent].push(team);
        });

        Object.keys(grouped).forEach(continent => {
            grouped[continent].sort((a,b) => {
                const aIsPriority = priorityNationalTeams.includes(a.id);
                const bIsPriority = priorityNationalTeams.includes(b.id);
                if (aIsPriority && !bIsPriority) return -1;
                if (!aIsPriority && bIsPriority) return 1;
                return a.name.localeCompare(b.name, 'ar');
            });
        });
        
        return grouped;
    }, [nationalTeams, getName, customNames]);


    const handleFavoriteToggle = useCallback((item: { id: number, name: string, logo: string, national?: boolean }, itemType: 'leagues' | 'teams') => {
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
                if (itemType === 'leagues') {
                    newFavorites.leagues![itemId] = { name: item.name, leagueId: itemId, logo: item.logo, notificationsEnabled: true };
                } else {
                    newFavorites.teams![itemId] = { name: (item as Team).name, teamId: itemId, logo: item.logo, type: (item as Team).national ? 'National' : 'Club' };
                }
            }
    
            if (user && db && !user.isAnonymous) {
                const favDocRef = doc(db, 'users', user.uid, 'favorites', 'data');
                const updatePayload = {
                    [`${itemType}.${itemId}`]: isCurrentlyFavorited
                        ? deleteField()
                        : newFavorites[itemType]![itemId]
                };
                updateDoc(favDocRef, updatePayload).catch(err => {
                    errorEmitter.emit('permission-error', new FirestorePermissionError({path: favDocRef.path, operation: 'update', requestResourceData: updatePayload}));
                });
            } else { // Guest mode: save to local storage
                setLocalFavorites(newFavorites);
            }
            return newFavorites;
        });
    
    }, [user, db, setFavorites, toast]);
    

    const handleOpenCrownDialog = (team: Team) => {
        if (!user) {
            toast({ title: 'مستخدم زائر', description: 'يرجى تسجيل الدخول لاستخدام هذه الميزة.' });
            return;
        }
        setRenameItem({
            id: team.id,
            name: getName('team', team.id, team.name),
            type: 'crown',
            purpose: 'crown',
            originalData: team,
            note: favorites?.crownedTeams?.[team.id]?.note || '',
        });
    };

    const handleSaveRenameOrNote = (type: RenameType, id: string | number, newName: string, newNote: string = '') => {
        if (!renameItem || !db) return;
        const { purpose, originalData, originalName } = renameItem;
    
        if (purpose === 'rename' && isAdmin) {
            const collectionName = `${type}Customizations`;
            const docRef = doc(db, collectionName, String(id));
            const data = { customName: newName };
    
            const op = (newName && newName.trim() && newName !== originalName) ? setDoc(docRef, data) : deleteDoc(docRef);
    
            op.then(() => onCustomNameChange())
            .catch(serverError => {
                errorEmitter.emit('permission-error', new FirestorePermissionError({ path: docRef.path, operation: 'write', requestResourceData: data }));
            });
    
        } else if (purpose === 'crown' && user) {
            const teamId = Number(id);
            
            setFavorites(prev => {
                const newFavorites = JSON.parse(JSON.stringify(prev || {}));
                if (!newFavorites.crownedTeams) newFavorites.crownedTeams = {};
                const isCurrentlyCrowned = !!newFavorites.crownedTeams?.[teamId];
                
                let updatePayload: any;

                if (isCurrentlyCrowned) {
                    delete newFavorites.crownedTeams[teamId];
                    updatePayload = { [`crownedTeams.${teamId}`]: deleteField() };
                } else {
                    const crownedData = { teamId, name: (originalData as Team).name, logo: (originalData as Team).logo, note: newNote };
                    newFavorites.crownedTeams[teamId] = crownedData;
                    updatePayload = { [`crownedTeams.${teamId}`]: crownedData };
                }
                
                if (user && db && !user.isAnonymous) {
                    const favDocRef = doc(db, 'users', user.uid, 'favorites', 'data');
                    updateDoc(favDocRef, updatePayload).catch(err => {
                        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: favDocRef.path, operation: 'update', requestResourceData: updatePayload }));
                    });
                } else {
                    setLocalFavorites(newFavorites);
                }
                return newFavorites;
            });
        }
    
        setRenameItem(null);
    };
    
    const handleOpenRename = (type: RenameType, id: number | string, name: string, originalName?: string) => {
        if (!isAdmin) return;
        setRenameItem({
            type: type,
            id: id,
            name: name,
            originalName: originalName || name,
            purpose: 'rename',
        });
    };
    
    const handleAdminRefresh = async () => {
        if (!isAdmin) return;
        sessionStorage.removeItem(COMPETITIONS_CACHE_KEY);
        sessionStorage.removeItem(TEAMS_CACHE_KEY);
        sessionStorage.removeItem(COUNTRIES_CACHE_KEY);
        toast({ title: 'بدء التحديث...', description: 'جاري تحديث بيانات البطولات والمنتخبات.' });
        await fetchAllCompetitions();
        await fetchNationalTeams();
        toast({ title: 'نجاح', description: 'تم تحديث البيانات بنجاح.' });
    };

    const renderNationalTeams = () => {
        if (loadingNationalTeams) return <div className="flex justify-center p-4"><Loader2 className="h-6 w-6 animate-spin"/></div>;
        if (!groupedNationalTeams) return null;

        return continentOrder.filter(c => groupedNationalTeams[c]).map(continent => (
            <AccordionItem value={`national-${continent}`} key={`national-${continent}`} className="rounded-lg border bg-card/50">
                <div className="flex items-center px-4 py-3">
                    <AccordionTrigger className="flex-1 hover:no-underline p-0">
                        <h3 className="text-lg font-bold">{getName('continent', continent, continent)}</h3>
                    </AccordionTrigger>
                    {isAdmin && (
                        <Button variant="ghost" size="icon" className="h-9 w-9 ml-2" onClick={(e) => { e.stopPropagation(); handleOpenRename('continent', continent, getName('continent', continent, continent)); }}>
                            <Pencil className="h-4 w-4"/>
                        </Button>
                    )}
                </div>
              <AccordionContent className="p-1">
                <ul className="flex flex-col">{
                  groupedNationalTeams[continent].map(team => {
                     const isStarred = !!favorites?.teams?.[team.id];
                     const isCrowned = !!favorites?.crownedTeams?.[team.id];
                     const countryName = team.country || team.name;
                     return (
                         <li key={team.id} className="flex w-full items-center justify-between p-3 h-12 hover:bg-accent/80 transition-colors rounded-md">
                           <div className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer" onClick={() => navigate('TeamDetails', { teamId: team.id })}>
                             <Avatar className="h-6 w-6 bg-white"><AvatarImage src={team.logo} alt={team.name} /></Avatar>
                             <span className="text-sm truncate">{team.name}</span>
                           </div>
                           <div className="flex items-center gap-1">
                             {isAdmin && (
                               <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); handleOpenRename('country', countryName, getName('country', countryName, countryName), countryName) }}>
                                 <Pencil className="h-4 w-4 text-muted-foreground/80" />
                               </Button>
                             )}
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); handleOpenCrownDialog(team); }}>
                                <Crown className={cn("h-5 w-5 text-muted-foreground/60", isCrowned && "fill-current text-yellow-400")} />
                              </Button>
                             <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); handleFavoriteToggle(team, 'teams'); }}>
                               <Star className={isStarred ? "h-5 w-5 text-yellow-400 fill-current" : "h-5 w-5 text-muted-foreground/50"} />
                             </Button>
                           </div>
                         </li>
                     )
                  })
                }</ul>
              </AccordionContent>
            </AccordionItem>
          ));
    }


    const renderClubCompetitions = () => {
        if (loadingClubData) return <div className="flex justify-center p-4"><Loader2 className="h-6 w-6 animate-spin"/></div>;
        if (allLeagues.length === 0) return <p className="p-4 text-center text-muted-foreground">اضغط على زر الفتح لعرض البطولات.</p>;
        
        return continentOrder.filter(c => sortedGroupedCompetitions[c]).map(continent => (
             <AccordionItem value={`club-${continent}`} key={`club-${continent}`} className="rounded-lg border bg-card/50">
                <div className="flex items-center px-4 py-3">
                    <AccordionTrigger className="flex-1 hover:no-underline p-0">
                        <h3 className="text-lg font-bold">{getName('continent', continent, continent)}</h3>
                    </AccordionTrigger>
                    {isAdmin && (
                        <Button variant="ghost" size="icon" className="h-9 w-9 ml-2" onClick={(e) => { e.stopPropagation(); handleOpenRename('continent', continent, getName('continent', continent, continent)); }}>
                            <Pencil className="h-4 w-4"/>
                        </Button>
                    )}
                </div>
                <AccordionContent className="p-2 space-y-2">
                     <Accordion type="multiple" className="w-full space-y-2">
                        {Object.keys(sortedGroupedCompetitions[continent]).sort((a,b) => {
                           const aIsPriority = priorityCountries.includes(a);
                           const bIsPriority = priorityCountries.includes(b);
                           if (aIsPriority && !bIsPriority) return -1;
                           if (!aIsPriority && bIsPriority) return 1;
                           return getName('country', a, a).localeCompare(getName('country', b, b), 'ar');
                        }).map(country => (
                            <AccordionItem value={`country-${country}`} key={country} className="rounded-lg border bg-background/50">
                                <div className="flex items-center px-3 py-2.5">
                                    <AccordionTrigger className="flex-1 hover:no-underline p-0 text-base">
                                        <span className="font-semibold">{getName('country', country, country)}</span>
                                    </AccordionTrigger>
                                    {isAdmin && (
                                        <Button variant="ghost" size="icon" className="h-7 w-7 ml-2" onClick={(e) => { e.stopPropagation(); handleOpenRename('country', country, getName('country', country, country)); }}>
                                            <Pencil className="h-3 w-3"/>
                                        </Button>
                                    )}
                                </div>
                                <AccordionContent className="p-1">
                                    {sortedGroupedCompetitions[continent][country].map(({ league }) => (
                                        <LeagueHeaderItem
                                            key={league.id}
                                            league={{leagueId: league.id, name: getName('league', league.id, league.name), logo: league.logo, countryName: country}}
                                            isFavorited={!!favorites?.leagues?.[league.id]}
                                            onFavoriteToggle={() => handleFavoriteToggle(league, 'leagues')}
                                            onRename={() => handleOpenRename('league', league.id, getName('league', league.id, league.name), league.name)}
                                            onClick={() => navigate('CompetitionDetails', { title: getName('league', league.id, league.name), leagueId: league.id, logo: league.logo })}
                                            isAdmin={isAdmin}
                                        />
                                    ))}
                                </AccordionContent>
                             </AccordionItem>
                        ))}
                    </Accordion>
                </AccordionContent>
             </AccordionItem>
        ));
    };

    if (!favorites || !customNames) {
         return (
            <div className="flex h-full flex-col bg-background">
                <ScreenHeader 
                    title={"البطولات"} 
                    onBack={goBack} 
                    canGoBack={canGoBack} 
                />
                <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin" />
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col bg-background">
            <ScreenHeader 
                title={"البطولات"} 
                onBack={goBack} 
                canGoBack={canGoBack} 
                actions={
                  <div className="flex items-center gap-1">
                      <SearchSheet navigate={navigate} favorites={favorites} customNames={customNames} setFavorites={setFavorites} onCustomNameChange={onCustomNameChange}>
                          <Button variant="ghost" size="icon">
                              <Search className="h-5 w-5" />
                          </Button>
                      </SearchSheet>
                      {isAdmin && (
                        <>
                            <Button size="icon" variant="ghost" onClick={handleAdminRefresh}>
                                <RefreshCw className="h-5 w-5" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => setAddOpen(true)}>
                                <Plus className="h-5 w-5" />
                            </Button>
                        </>
                      )}
                      <ProfileButton />
                  </div>
                }
            />
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                 <Accordion type="multiple" className="w-full space-y-2">
                    <AccordionItem value="national-teams-section" className="rounded-lg border bg-card/50">
                        <AccordionTrigger className="px-4 py-3 hover:no-underline" onClick={() => { if (!nationalTeams && !loadingNationalTeams) fetchNationalTeams() }}>
                            <div className="flex items-center gap-3">
                                <Users className="h-6 w-6 text-primary"/>
                                <h3 className="text-lg font-bold">المنتخبات</h3>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="p-2">
                             <Accordion type="multiple" className="w-full space-y-2">
                                {renderNationalTeams()}
                             </Accordion>
                        </AccordionContent>
                    </AccordionItem>
                 </Accordion>
                 
                 <Accordion type="multiple" className="w-full space-y-2">
                    <AccordionItem value="club-competitions-section" className="rounded-lg border bg-card/50">
                        <AccordionTrigger className="px-4 py-3 hover:no-underline" onClick={() => { if (allLeagues.length === 0 && !loadingClubData) fetchAllCompetitions() }}>
                            <div className="flex items-center gap-3">
                                <Trophy className="h-6 w-6 text-primary"/>
                                <h3 className="text-lg font-bold">البطولات</h3>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="p-2">
                           <Accordion type="multiple" className="w-full space-y-2">
                               {renderClubCompetitions()}
                            </Accordion>
                        </AccordionContent>
                    </AccordionItem>
                 </Accordion>
            </div>
            
            {renameItem && <RenameDialog
                isOpen={!!renameItem}
                onOpenChange={(isOpen) => !isOpen && setRenameItem(null)}
                item={renameItem}
                onSave={(type, id, name, note) => handleSaveRenameOrNote(type, id, name, note || '')}
            />}
            <AddCompetitionDialog isOpen={isAddOpen} onOpenChange={(isOpen) => {
                setAddOpen(isOpen);
                if(!isOpen) {
                    fetchAllCompetitions();
                }
            }} />
        </div>
    );
}
