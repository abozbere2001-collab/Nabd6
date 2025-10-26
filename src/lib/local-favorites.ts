
import type { Favorites } from './types';

const LOCAL_FAVORITES_KEY = 'goalstack_local_favorites';

// This function now only handles starred favorites for guests.
export const getLocalFavorites = (): Partial<Favorites> => {
    if (typeof window === 'undefined') {
        return { teams: {}, leagues: {}, players: {}, crownedTeams: {} };
    }
    try {
        const localData = window.localStorage.getItem(LOCAL_FAVORITES_KEY);
        const parsed = localData ? JSON.parse(localData) : {};
        return {
            teams: parsed.teams || {},
            leagues: parsed.leagues || {},
            players: parsed.players || {},
            crownedTeams: parsed.crownedTeams || {},
            notificationsEnabled: parsed.notificationsEnabled || { news: true },
        };
    } catch (error) {
        console.error("Error reading local favorites:", error);
        return { teams: {}, leagues: {}, players: {}, crownedTeams: {} };
    }
};

// This function now only handles starred favorites for guests.
export const setLocalFavorites = (favorites: Partial<Favorites>) => {
    if (typeof window === 'undefined') {
        return;
    }
    try {
        window.localStorage.setItem(LOCAL_FAVORITES_KEY, JSON.stringify(favorites));
        // Dispatch a custom event to notify other components of the change
        window.dispatchEvent(new CustomEvent('localFavoritesChanged'));
    } catch (error) {
        console.error("Error saving local favorites:", error);
    }
};

export const clearLocalFavorites = () => {
    if (typeof window === 'undefined') {
        return;
    }
    window.localStorage.removeItem(LOCAL_FAVORITES_KEY);
     window.dispatchEvent(new CustomEvent('localFavoritesChanged'));
};
