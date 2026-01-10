import * as vscode from 'vscode';
import youtubedl from 'youtube-dl-exec';
import YTMusic from 'ytmusic-api';
const ytmusic = new YTMusic();
import { youtubeLabelButton } from './statusBar';
import { addToSearchHistory, showSearchHistory, clearSearchHistory } from './searchHistory';
import { PlaylistTrack } from './playlistState';

export interface PlaylistMetadata {
    title: string;
    tracks: PlaylistTrack[];
}

const PLAYLIST_METADATA_TIMEOUT_MS = 45000;

// why the retry??? well just for backup if the download fails
//  to do : but to fix the issue when window1 is playing , but i playnext in window2 , it is tryign to download same thing , some conflict is coming then
export async function downloadTrack(url: string, path: string): Promise<void> {
    console.log(`Starting download from ${url} to ${path}`);
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
        try {
            await youtubedl(url, {
                output: path,
                format: 'bestaudio/best', // Don't restrict to webm
            });
            console.log('Download completed');
            return;
        } catch (err: any) {
            attempts++;
            console.error(`Download failed (attempt ${attempts} of ${maxAttempts})`);
            console.error(err.stderr || err.stdout || err.message || err);
            if (attempts >= maxAttempts) {
                throw new Error('Download failed after 3 attempts');
            }
        }
    }
}


export async function getSearchResults(query: string): Promise<any> {
    try {

        await ytmusic.initialize(); // This should be awaited to ensure initialization is done properly
        const songs = await ytmusic.searchSongs(query);
        const videos = await ytmusic.searchVideos(query);
        const searchResults = [...songs, ...videos];
        console.log('Search results:', searchResults);
        return searchResults;  // Return song search results
    } catch (error) {
        console.error('Error fetching YouTube Music search results:', error);
        return [];
    }
}

export async function getSearchPick(context: vscode.ExtensionContext) {
    // Show options: New search or History
    const searchOption = await vscode.window.showQuickPick(
        [
            { label: '$(search) New Search', value: 'new' },
            { label: '$(history) Recent Plays', value: 'history' },
            { label: '$(trash) Clear History', value: 'clear' }
        ],
        { placeHolder: 'Search or view recent plays' }
    );

    if (!searchOption) {
        return;
    }

    // Handle different options
    if (searchOption.value === 'history') {
        return await showSearchHistory(context);
    } else if (searchOption.value === 'clear') {
        clearSearchHistory(context);
        return;
    }

    const input = await vscode.window.showInputBox({
        prompt: 'Search YouTube Music',
        placeHolder: 'Search YouTube Music',
    });

    if (!input) {
        return;
    }

    context.globalState.update('previousyoutubeLabelButton',  context.globalState.get('youtubeLabelButton'));
    await context.globalState.update('youtubeLabelButton', `$(loading~spin) Searching...`);
    vscode.commands.executeCommand('extension.refreshYoutubeLabelButton');
    const results = await getSearchResults(input);
    if (!results.length) {
        vscode.window.showInformationMessage('No results found');
        return;
    }
    await context.globalState.update('youtubeLabelButton', 'What do you want to play?');
    vscode.commands.executeCommand('extension.refreshYoutubeLabelButton');
    const filteredResults = results.filter((song: any) => song.type === "SONG" || song.type === "VIDEO");
    const pick = await vscode.window.showQuickPick(
        filteredResults.map((song: any) => {
            const minutes = Math.floor(song.duration / 60);
            const seconds = song.duration % 60;
            const formattedDuration = `${minutes}:${seconds.toString().padStart(2, '0')}`;  // Format seconds to always show two digits
            return {
                label: `${song.name}`,
                detail: `${song.artist?.name} - ${formattedDuration}`,  // Use the formatted duration
                data: song,
            };
        }),
        {}
    );

    await context.globalState.update('youtubeLabelButton', context.globalState.get('previousyoutubeLabelButton'));
    vscode.commands.executeCommand('extension.refreshYoutubeLabelButton');
    // If a song was selected, add it to the history
    if (pick) {
        addToSearchHistory(context, pick);
    }
    console.log('Search pick:', pick);
    return pick;
}

export async function getPlaylistMetadata(url: string): Promise<PlaylistMetadata> {
    try {
        const result: any = await withTimeout(
            youtubedl(url, {
                dumpSingleJson: true,
                flatPlaylist: true,
                skipDownload: true,
                ignoreErrors: true,
                noWarnings: true,
            }),
            PLAYLIST_METADATA_TIMEOUT_MS,
            'Fetching playlist metadata timed out.'
        );

        const entries = (Array.isArray(result?.entries) ? result.entries : []).filter((entry: any) => !isUnavailableEntry(entry));
        const tracks: PlaylistTrack[] = entries
            .map((entry: any) => {
                const videoId = entry.id || entry.video_id || entry.url;
                const webUrl = entry.url || entry.webpage_url || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : url);
                const title = entry.title || result?.title || 'Unknown Playlist Item';
                const resolvedVideoId = videoId || extractVideoIdFromUrl(webUrl);
                const canonicalWebUrl = resolvedVideoId ? `https://www.youtube.com/watch?v=${resolvedVideoId}` : webUrl;
                const musicUrl = resolvedVideoId ? `https://music.youtube.com/watch?v=${resolvedVideoId}` : webUrl;
                return {
                    videoId: resolvedVideoId || webUrl,
                    title,
                    webUrl: canonicalWebUrl,
                    musicUrl,
                };
            })
            .filter((track: PlaylistTrack) => Boolean(track.videoId));

        return {
            title: result?.title || 'Untitled Playlist',
            tracks,
        };
    } catch (error) {
        console.error('Failed to fetch playlist metadata:', error);
        throw error;
    }
}

function extractVideoIdFromUrl(possibleUrl: string | undefined): string | undefined {
    if (!possibleUrl) {
        return undefined;
    }
    const url = new URL(possibleUrl, 'https://www.youtube.com');
    if (url.searchParams.has('v')) {
        return url.searchParams.get('v') || undefined;
    }
    const pathMatch = url.pathname.match(/\/watch\/(.+)$/);
    return pathMatch ? pathMatch[1] : undefined;
}

function isUnavailableEntry(entry: any): boolean {
    const title = (entry?.title || '').toLowerCase();
    if (title.includes('private video') || title.includes('deleted video')) {
        return true;
    }
    const availability = (entry?.availability || '').toLowerCase();
    if (availability && availability !== 'public') {
        return true;
    }
    return false;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
    let timeoutHandle: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
    });

    try {
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
        }
    }
}