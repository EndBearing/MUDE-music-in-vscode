import * as vscode from 'vscode';
import {
    SavedPlaylist,
    addSavedPlaylist,
    getSavedPlaylists,
} from './playlistState';
import { getPlaylistMetadata } from './youtube';
import { completePlaylist, refreshActivePlaylist, startPlaylistPlayback } from './playlistPlayback';

export function playlistCommands(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('MudePlayer.addPlaylistUrl', () => addPlaylistUrl(context)),
        vscode.commands.registerCommand('MudePlayer.selectPlaylist', () => selectPlaylist(context)),
        vscode.commands.registerCommand('MudePlayer.refreshPlaylist', () => refreshActivePlaylist(context)),
        vscode.commands.registerCommand('MudePlayer.exitPlaylistMode', () => completePlaylist(context))
    );
}

async function addPlaylistUrl(context: vscode.ExtensionContext) {
    const url = await vscode.window.showInputBox({
        prompt: 'Add a YouTube playlist URL',
        placeHolder: 'https://www.youtube.com/playlist?list=...'
    });

    if (!url) {
        return;
    }

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Fetching playlist metadata',
        cancellable: false,
    }, async () => {
        try {
            const metadata = await getPlaylistMetadata(url);
            const playlist: SavedPlaylist = {
                url,
                title: metadata.title,
                addedAt: Date.now(),
            };

            await addSavedPlaylist(context, playlist);
            vscode.commands.executeCommand('extension.refreshPlaylistState');
            const choice = await vscode.window.showInformationMessage(
                `Playlist "${metadata.title}" added.`,
                'Play now'
            );

            if (choice === 'Play now') {
                await startPlaylistPlayback(context, playlist);
            }
        } catch (error: any) {
            vscode.window.showErrorMessage('Failed to add playlist. Please verify the URL and try again.');
            console.error('Failed to add playlist URL:', error);
        }
    });
}

async function selectPlaylist(context: vscode.ExtensionContext) {
    const playlists = getSavedPlaylists(context);
    if (!playlists.length) {
        vscode.window.showInformationMessage('No playlists saved yet. Add one first.');
        return;
    }

    const pick = await vscode.window.showQuickPick(
        playlists.map((playlist) => ({
            label: playlist.title || playlist.url,
            detail: playlist.url,
            playlist,
        })),
        { placeHolder: 'Select a playlist to play' }
    );

    if (!pick) {
        return;
    }

    await startPlaylistPlayback(context, pick.playlist);
}
