

import type { Favorites } from './types';

export const LOCAL_FAVORITES_KEY = 'goalstack_local_favorites_v2'; // Incremented version
export const GUEST_MODE_KEY = 'goalstack_guest_mode_active';

// This function now only handles starred favorites for guests.
export const getLocalFavorites = (): Partial<Favorites> => {
    if (typeof window === 'undefined') {
        return { teams: {}, leagues: {}, players: {}, crownedTeams: {} };
    }
    try {
        const localData = window.localStorage.getItem(LOCAL_FAVORITES_KEY);
        // If no data, return a default structure.
        if (!localData) {
          return { teams: {}, leagues: {}, players: {}, crownedTeams: {}, notificationsEnabled: { news: true } };
        }
        
        const parsed = JSON.parse(localData);

        // Ensure the parsed data has the expected shape to avoid runtime errors.
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
        // IMPORTANT: Only store the 'favorites' part, not the whole state object
        // which might include large data like 'customNames'.
        const dataToStore: Partial<Favorites> = {
            teams: favorites.teams,
            leagues: favorites.leagues,
            players: favorites.players,
            crownedTeams: favorites.crownedTeams,
            notificationsEnabled: favorites.notificationsEnabled,
        };
        
        window.localStorage.setItem(LOCAL_FAVORITES_KEY, JSON.stringify(dataToStore));
        // Dispatch a custom event to notify other components of the change
        window.dispatchEvent(new CustomEvent('localFavoritesChanged'));
    } catch (error) {
        console.error("Error saving local favorites:", error);
         if (error instanceof DOMException && error.name === 'QuotaExceededError') {
            console.error("LocalStorage quota exceeded. Cannot save new favorites.");
            // Optionally, implement a more robust cleanup or notification strategy here.
        }
    }
};

export const clearLocalFavorites = () => {
    if (typeof window === 'undefined') {
        return;
    }
    window.localStorage.removeItem(LOCAL_FAVORITES_KEY);
     window.dispatchEvent(new CustomEvent('localFavoritesChanged'));
};
