import * as vscode from 'vscode';

export const SAVED_PLAYLISTS_KEY = 'savedPlaylists';
export const ACTIVE_PLAYLIST_STATE_KEY = 'activePlaylistState';
export const PLAYBACK_MODE_KEY = 'playbackMode';
export const MAX_SAVED_PLAYLISTS = 50;

export type PlaybackMode = 'search' | 'playlist';

export interface SavedPlaylist {
    url: string;
    title: string;
    addedAt: number;
}

export interface PlaylistTrack {
    videoId: string;
    title: string;
    webUrl: string;
    musicUrl: string;
}

export interface ActivePlaylistState {
    playlist: SavedPlaylist;
    tracks: PlaylistTrack[];
    currentIndex: number;
}

export function getSavedPlaylists(context: vscode.ExtensionContext): SavedPlaylist[] {
    return context.globalState.get<SavedPlaylist[]>(SAVED_PLAYLISTS_KEY, []);
}

export async function addSavedPlaylist(context: vscode.ExtensionContext, playlist: SavedPlaylist): Promise<SavedPlaylist[]> {
    const existing = getSavedPlaylists(context);
    existing.unshift(playlist);
    const trimmed = existing.slice(0, MAX_SAVED_PLAYLISTS);
    await context.globalState.update(SAVED_PLAYLISTS_KEY, trimmed);
    return trimmed;
}

export async function overwriteSavedPlaylists(context: vscode.ExtensionContext, playlists: SavedPlaylist[]): Promise<void> {
    const trimmed = playlists.slice(0, MAX_SAVED_PLAYLISTS);
    await context.globalState.update(SAVED_PLAYLISTS_KEY, trimmed);
}

export async function updateSavedPlaylist(context: vscode.ExtensionContext, url: string, updates: Partial<SavedPlaylist>): Promise<void> {
    const playlists = getSavedPlaylists(context);
    const next = playlists.map((playlist) => {
        if (playlist.url !== url) {
            return playlist;
        }
        return { ...playlist, ...updates };
    });
    await context.globalState.update(SAVED_PLAYLISTS_KEY, next);
}

export async function removeSavedPlaylists(context: vscode.ExtensionContext, urls: string[]): Promise<SavedPlaylist[]> {
    if (!urls.length) {
        return [];
    }

    const urlSet = new Set(urls);
    const playlists = getSavedPlaylists(context);
    const remaining: SavedPlaylist[] = [];
    const removed: SavedPlaylist[] = [];

    for (const playlist of playlists) {
        if (urlSet.has(playlist.url)) {
            removed.push(playlist);
        } else {
            remaining.push(playlist);
        }
    }

    if (!removed.length) {
        return [];
    }

    await context.globalState.update(SAVED_PLAYLISTS_KEY, remaining);
    return removed;
}

export function getActivePlaylistState(context: vscode.ExtensionContext): ActivePlaylistState | undefined {
    return context.globalState.get<ActivePlaylistState>(ACTIVE_PLAYLIST_STATE_KEY);
}

export async function setActivePlaylistState(context: vscode.ExtensionContext, state: ActivePlaylistState | undefined): Promise<void> {
    await context.globalState.update(ACTIVE_PLAYLIST_STATE_KEY, state);
}

export async function clearActivePlaylistState(context: vscode.ExtensionContext): Promise<void> {
    await context.globalState.update(ACTIVE_PLAYLIST_STATE_KEY, undefined);
}

export function getPlaybackMode(context: vscode.ExtensionContext): PlaybackMode {
    return context.globalState.get<PlaybackMode>(PLAYBACK_MODE_KEY, 'search');
}

export async function setPlaybackMode(context: vscode.ExtensionContext, mode: PlaybackMode): Promise<void> {
    await context.globalState.update(PLAYBACK_MODE_KEY, mode);
}

export function getCurrentPlaylistTrack(state: ActivePlaylistState | undefined): PlaylistTrack | undefined {
    if (!state) {
        return undefined;
    }
    return state.tracks[state.currentIndex];
}

export function hasNextPlaylistTrack(state: ActivePlaylistState | undefined): boolean {
    if (!state) {
        return false;
    }
    return state.currentIndex + 1 < state.tracks.length;
}

export function hasPreviousPlaylistTrack(state: ActivePlaylistState | undefined): boolean {
    if (!state) {
        return false;
    }
    return state.currentIndex - 1 >= 0;
}
