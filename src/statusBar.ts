import * as vscode from 'vscode';
import { player } from './player';
import { getVolume, VOLUME_STATE_KEY, VOLUME_STEP } from './volume';
import { searchYoutube } from './searchYoutube';
import { recommendations, currentRecommendationIndex } from './recommendations';
import { updateRecommendationIndex } from './recommendations';
import { getActivePlaylistState, getPlaybackMode } from './playlistState';

export let togglePauseButton: vscode.StatusBarItem;
export let seekForwardButton: vscode.StatusBarItem;
export let seekBackwordButton: vscode.StatusBarItem;
export let playNextButton: vscode.StatusBarItem;
export let playPreviousButton: vscode.StatusBarItem;
export let youtubeLabelButton: vscode.StatusBarItem;
export let timestampButton: vscode.StatusBarItem;
export let logoButton: vscode.StatusBarItem;
export let volumeButton: vscode.StatusBarItem;
export let volumeUpButton: vscode.StatusBarItem;
export let volumeDownButton: vscode.StatusBarItem;
export let playlistButton: vscode.StatusBarItem;

let statusBarContext: vscode.ExtensionContext | undefined;


function formatVolumeLabel(volume: number) {
    if (volume === 0) {
        return '$(mute) 0%';
    }
    if (volume <= 50) {
        return `$(broadcast) ${volume}%`;
    }
    return `$(unmute) ${volume}%`;
}

export function updateVolumeIndicator(volume: number) {
    if (!volumeButton) {
        return;
    }
    volumeButton.text = formatVolumeLabel(volume);
    volumeButton.tooltip = 'Set playback volume (click to enter 0-100)';
    volumeButton.show();
}

export async function statusBar(context: vscode.ExtensionContext) {
    statusBarContext = context;
    seekBackwordButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 185);
    seekBackwordButton.command = 'MudePlayer.seekBackword';
    seekBackwordButton.text = '$(chevron-left)';
    seekBackwordButton.tooltip = '-10s';

    togglePauseButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 185);
    togglePauseButton.command = 'MudePlayer.togglePause';
    togglePauseButton.text = '$(debug-start)';  

    seekForwardButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 185);
    seekForwardButton.command = 'MudePlayer.seekForward';
    seekForwardButton.text = '$(chevron-right)';
    seekForwardButton.tooltip = '+10s';

    playNextButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 185);
    playNextButton.command = 'MudePlayer.playNext';
    playNextButton.text = '$(triangle-right)';
    playNextButton.tooltip = getNextRecommendationTooltip();

    playPreviousButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 185);
    playPreviousButton.command = 'MudePlayer.playPrevious';
    playPreviousButton.text = '$(triangle-left)';
    playPreviousButton.tooltip = getPreviousRecommendationTooltip();

    youtubeLabelButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 180);
    let storedValue = context.globalState.get<string>('youtubeLabelButton', '');
    youtubeLabelButton.text = storedValue;
    youtubeLabelButton.show();

    timestampButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 170);
    timestampButton.text = '';
    // timestampButton.show();

    playlistButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 169.5);
    playlistButton.command = 'MudePlayer.selectPlaylist';
    updatePlaylistButton(context);
    playlistButton.show();

    const configVolume = vscode.workspace.getConfiguration('mude').get<number>('volume', 70);
    const storedVolume = context.globalState.get<number>(VOLUME_STATE_KEY, configVolume);

    volumeDownButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 169);
    volumeDownButton.command = 'MudePlayer.volumeDown';
    volumeDownButton.text = '$(dash)';
    volumeDownButton.tooltip = `Volume -${VOLUME_STEP}%`;
    volumeDownButton.show();

    volumeButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 168);
    volumeButton.command = 'MudePlayer.setVolume';
    updateVolumeIndicator(storedVolume ?? getVolume());

    volumeUpButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 167);
    volumeUpButton.command = 'MudePlayer.volumeUp';
    volumeUpButton.text = '$(add)';
    volumeUpButton.tooltip = `Volume +${VOLUME_STEP}%`;
    volumeUpButton.show();

    logoButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 200);
    logoButton.text = '🎧';
    logoButton.command = 'MudePlayer.searchYoutube';
    logoButton.tooltip = 'Search for some music!!';
    logoButton.show();

    context.subscriptions.push(
        logoButton,
        playPreviousButton,
        seekBackwordButton,
        togglePauseButton,
        seekForwardButton,
        playNextButton,
        youtubeLabelButton,
        timestampButton,
        playlistButton,
        volumeDownButton,
        volumeButton,
        volumeUpButton,
        vscode.commands.registerCommand('MudePlayer.searchYoutube', () => searchYoutube(context)),
        vscode.commands.registerCommand('extension.refreshYoutubeLabelButton', () => {
            let newValue = context.globalState.get<string>('youtubeLabelButton', '');
            youtubeLabelButton.text = newValue;
        }),
        vscode.commands.registerCommand('extension.refreshPlaylistState', () => {
            updatePlaylistButton(context);
        }),
        vscode.commands.registerCommand('extension.refreshRecommendations', () => {
            const newRecommendations = context.globalState.get<{ videoId: string, title: string }[]>('recommendations', []);
            const newIndex = context.globalState.get<number>('currentRecommendationIndex', 0);
            recommendations.splice(0, recommendations.length, ...newRecommendations);
            updateRecommendationIndex(newIndex);
            updateTooltips();
        }),
        vscode.commands.registerCommand('extension.refreshState', async () => {
            const isPlaying = context.globalState.get<boolean>('isPlaying', false);
            if (isPlaying) {
                await playingState(context);
            } else {
                await stoppedState(context);
            }
        }),
        vscode.commands.registerCommand('extension.refreshVolumeIndicator', () => {
            const saved = context.globalState.get<number>(VOLUME_STATE_KEY, getVolume());
            updateVolumeIndicator(saved);
        })
    );

    // Listen for window state changes to refresh the status bar
    context.subscriptions.push(vscode.window.onDidChangeWindowState(() => {
        vscode.commands.executeCommand('extension.refreshYoutubeLabelButton');
        vscode.commands.executeCommand('extension.refreshPlaylistState');
        vscode.commands.executeCommand('extension.refreshRecommendations');
        vscode.commands.executeCommand('extension.refreshState');
        vscode.commands.executeCommand('extension.refreshVolumeIndicator');
    }));

    // Initial state refresh
    vscode.commands.executeCommand('extension.refreshState');
    vscode.commands.executeCommand('extension.refreshVolumeIndicator');
    vscode.commands.executeCommand('extension.refreshPlaylistState');
}

// Function to get the tooltip for the next recommendation
function getNextRecommendationTooltip(): string {
    if (statusBarContext && getPlaybackMode(statusBarContext) === 'playlist') {
        const state = getActivePlaylistState(statusBarContext);
        if (state && state.currentIndex + 1 < state.tracks.length) {
            return `Playlist next: ${state.tracks[state.currentIndex + 1].title}`;
        }
        return 'Playlist: no upcoming track';
    }

    const nextIndex = currentRecommendationIndex;
    if (nextIndex < recommendations.length) {
        return `Up next: ${recommendations[nextIndex].title}`;
    }
    return 'Play next';
}

function getPreviousRecommendationTooltip(): string {
    if (statusBarContext && getPlaybackMode(statusBarContext) === 'playlist') {
        const state = getActivePlaylistState(statusBarContext);
        if (state && state.currentIndex - 1 >= 0) {
            return `Playlist previous: ${state.tracks[state.currentIndex - 1].title}`;
        }
        return 'Playlist: no previous track';
    }

    const prevIndex = currentRecommendationIndex - 1;
    if (prevIndex >= 0) {
        return `Play previous: ${recommendations[prevIndex].title}`;
    }
    return 'Play previous';
}

player.on('started', async () => {
    console.log('Started playing');
    togglePauseButton.tooltip = 'Pause';
    togglePauseButton.text = '$(debug-pause)';
    updateTooltips(); // Update tooltips when playback starts
    // await context.globalState.update('isPlaying', true);
    vscode.commands.executeCommand('extension.refreshRecommendations');
    vscode.commands.executeCommand('extension.refreshState');
});

player.on('stopped', async () => {
    console.log('Stopped playing');
    updateTooltips(); // Update tooltips when playback stops
    // await context.globalState.update('isPlaying', false);
    vscode.commands.executeCommand('extension.refreshRecommendations');
    vscode.commands.executeCommand('extension.refreshState');
});

// Function to update both next and previous buttons' tooltips
function updateTooltips() {
    if (!playNextButton || !playPreviousButton) {
        return;
    }
    playNextButton.tooltip = getNextRecommendationTooltip();
    playPreviousButton.tooltip = getPreviousRecommendationTooltip();
    updatePlaylistButton();
}

function updatePlaylistButton(context?: vscode.ExtensionContext) {
    if (!playlistButton) {
        return;
    }

    const targetContext = context ?? statusBarContext;
    if (!targetContext) {
        playlistButton.text = '$(list-ordered) Playlist';
        playlistButton.tooltip = 'Select a playlist to play';
        playlistButton.show();
        return;
    }

    const mode = getPlaybackMode(targetContext);
    const state = getActivePlaylistState(targetContext);

    if (mode === 'playlist' && state) {
        const total = state.tracks.length;
        const position = total ? `${state.currentIndex + 1}/${total}` : '0/0';
        const title = state.playlist.title || 'Playlist';
        playlistButton.text = `$(list-ordered) ${title}`;
        playlistButton.tooltip = `Playlist mode (${position}). Click to switch.`;
    } else {
        playlistButton.text = '$(list-ordered) Playlist';
        playlistButton.tooltip = 'Select a playlist to play';
    }

    playlistButton.show();
}

export async function playingState(context: vscode.ExtensionContext) {
    playPreviousButton.show();
    seekBackwordButton.show();
    togglePauseButton.show();
    seekForwardButton.show();
    playNextButton.show();
    timestampButton.show();
    await context.globalState.update('isPlaying', true);
}

export async function stoppedState(context: vscode.ExtensionContext) {
    playPreviousButton.hide();
    seekBackwordButton.hide();
    togglePauseButton.hide();
    seekForwardButton.hide();
    playNextButton.hide();
    timestampButton.hide();
    await context.globalState.update('isPlaying', false);
}

player.on('timeposition', async (timePosition: number) => {
    const time = new Date(timePosition * 1000).toISOString();
    timestampButton.text = timePosition < 3600 ? time.substring(14, 19) : time.substring(11, 19);
    updateTooltips();
    vscode.commands.executeCommand('extension.refreshYoutubeLabelButton');
    vscode.commands.executeCommand('extension.refreshRecommendations');
    vscode.commands.executeCommand('extension.refreshState');
});