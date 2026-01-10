import * as vscode from 'vscode';
import { processTrack } from './searchYoutube';
import { getPlaylistMetadata } from './youtube';
import {
    ActivePlaylistState,
    PlaylistTrack,
    SavedPlaylist,
    clearActivePlaylistState,
    getActivePlaylistState,
    getPlaybackMode,
    getCurrentPlaylistTrack,
    hasNextPlaylistTrack,
    hasPreviousPlaylistTrack,
    setActivePlaylistState,
    setPlaybackMode,
    updateSavedPlaylist,
} from './playlistState';
import { resetRecommendations, recommendations, currentRecommendationIndex } from './recommendations';

async function persistRecommendationReset(context: vscode.ExtensionContext) {
    resetRecommendations();
    await context.globalState.update('recommendations', recommendations);
    await context.globalState.update('currentRecommendationIndex', currentRecommendationIndex);
    vscode.commands.executeCommand('extension.refreshRecommendations');
}

async function syncActivePlaylistState(
    context: vscode.ExtensionContext,
    desiredIndex?: number,
    preserveVideoId?: string
): Promise<ActivePlaylistState | undefined> {
    const state = getActivePlaylistState(context);
    if (!state) {
        return undefined;
    }

    const metadata = await getPlaylistMetadata(state.playlist.url);
    const nextTracks = metadata.tracks;
    let nextIndex = 0;

    if (typeof desiredIndex === 'number') {
        nextIndex = Math.min(Math.max(desiredIndex, 0), Math.max(nextTracks.length - 1, 0));
    } else if (preserveVideoId) {
        const idx = nextTracks.findIndex((track) => track.videoId === preserveVideoId);
        nextIndex = idx >= 0 ? idx : 0;
    } else {
        nextIndex = Math.min(state.currentIndex, Math.max(nextTracks.length - 1, 0));
    }

    const nextState: ActivePlaylistState = {
        playlist: { ...state.playlist, title: metadata.title },
        tracks: nextTracks,
        currentIndex: nextTracks.length === 0 ? 0 : nextIndex,
    };

    await setActivePlaylistState(context, nextState);
    await updateSavedPlaylist(context, state.playlist.url, { title: metadata.title });
    vscode.commands.executeCommand('extension.refreshPlaylistState');
    return nextState;
}

export async function startPlaylistPlayback(context: vscode.ExtensionContext, playlist: SavedPlaylist): Promise<void> {
    await persistRecommendationReset(context);
    await setPlaybackMode(context, 'playlist');
    try {
        const metadata = await getPlaylistMetadata(playlist.url);
        const nextState: ActivePlaylistState = {
            playlist: { ...playlist, title: metadata.title },
            tracks: metadata.tracks,
            currentIndex: 0,
        };
        await setActivePlaylistState(context, nextState);
        await updateSavedPlaylist(context, playlist.url, { title: metadata.title });
        vscode.commands.executeCommand('extension.refreshPlaylistState');
        await playCurrentPlaylistTrack(context);
    } catch (error) {
        await completePlaylist(context);
        vscode.window.showErrorMessage('Failed to start playlist playback.');
        console.error('Failed to start playlist playback:', error);
    }
}

export async function playCurrentPlaylistTrack(context: vscode.ExtensionContext): Promise<void> {
    let state = getActivePlaylistState(context);
    if (!state) {
        vscode.window.showWarningMessage('No active playlist selected.');
        return;
    }

    state = await syncActivePlaylistState(context, state.currentIndex);
    if (!state || state.tracks.length === 0) {
        await completePlaylist(context);
        vscode.window.showInformationMessage('Playlist is empty. Returning to search mode.');
        return;
    }

    const track = getCurrentPlaylistTrack(state);
    if (!track) {
        vscode.window.showWarningMessage('Playlist track unavailable.');
        return;
    }

    await context.globalState.update('youtubeLabelButton', `$(loading~spin) Loading ${track.title}...`);
    vscode.commands.executeCommand('extension.refreshYoutubeLabelButton');
    const success = await processTrack(context, track.webUrl, track.title, track.musicUrl);
    if (!success) {
        vscode.window.showWarningMessage('Failed to play playlist track. Skipping to next available item.');
        await playNextPlaylistTrack(context);
    }
}

export async function playNextPlaylistTrack(context: vscode.ExtensionContext): Promise<void> {
    const state = getActivePlaylistState(context);
    if (!state) {
        vscode.window.showInformationMessage('Playlist mode inactive.');
        return;
    }

    if (!hasNextPlaylistTrack(state)) {
        await completePlaylist(context);
        vscode.window.showInformationMessage('Reached end of playlist.');
        return;
    }

    await setActivePlaylistState(context, { ...state, currentIndex: state.currentIndex + 1 });
    await playCurrentPlaylistTrack(context);
}

export async function playPreviousPlaylistTrack(context: vscode.ExtensionContext): Promise<void> {
    const state = getActivePlaylistState(context);
    if (!state) {
        vscode.window.showInformationMessage('Playlist mode inactive.');
        return;
    }

    if (!hasPreviousPlaylistTrack(state)) {
        vscode.window.showWarningMessage('Already at first playlist track.');
        return;
    }

    await setActivePlaylistState(context, { ...state, currentIndex: state.currentIndex - 1 });
    await playCurrentPlaylistTrack(context);
}

export async function refreshActivePlaylist(context: vscode.ExtensionContext): Promise<void> {
    const state = getActivePlaylistState(context);
    if (!state) {
        vscode.window.showInformationMessage('No active playlist to refresh.');
        return;
    }

    const currentTrack = getCurrentPlaylistTrack(state);
    await syncActivePlaylistState(context, undefined, currentTrack?.videoId);
}

export async function completePlaylist(context: vscode.ExtensionContext): Promise<void> {
    await clearActivePlaylistState(context);
    await setPlaybackMode(context, 'search');
    await context.globalState.update('youtubeLabelButton', '');
    vscode.commands.executeCommand('extension.refreshYoutubeLabelButton');
    vscode.commands.executeCommand('extension.refreshPlaylistState');
}

export async function ensurePlaylistMode(context: vscode.ExtensionContext): Promise<boolean> {
    const mode = getPlaybackMode(context);
    if (mode !== 'playlist' || !getActivePlaylistState(context)) {
        vscode.window.showInformationMessage('Activate a playlist to use this command.');
        return false;
    }
    return true;
}
