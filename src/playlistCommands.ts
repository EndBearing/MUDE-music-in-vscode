import * as vscode from 'vscode';
import {
    SavedPlaylist,
    addSavedPlaylist,
    getActivePlaylistState,
    getSavedPlaylists,
    removeSavedPlaylists,
} from './playlistState';
import { getPlaylistMetadata } from './youtube';
import { completePlaylist, refreshActivePlaylist, startPlaylistPlayback } from './playlistPlayback';

export function playlistCommands(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('MudePlayer.addPlaylistUrl', () => addPlaylistUrl(context)),
        vscode.commands.registerCommand('MudePlayer.selectPlaylist', () => selectPlaylist(context)),
        vscode.commands.registerCommand('MudePlayer.deletePlaylist', () => deletePlaylists(context)),
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

type PlaylistQuickPickItem = vscode.QuickPickItem & { playlist: SavedPlaylist };

async function deletePlaylists(context: vscode.ExtensionContext) {
    const playlists = getSavedPlaylists(context);
    if (!playlists.length) {
        vscode.window.showInformationMessage('No playlists saved yet. Add one first.');
        return;
    }

    const items: PlaylistQuickPickItem[] = playlists.map((playlist) => ({
        label: playlist.title || playlist.url,
        detail: `${playlist.url} · Delete ボタンで確定`,
        playlist,
    }));

    const picks = await vscode.window.showQuickPick<PlaylistQuickPickItem>(items, {
        placeHolder: 'Select playlists to delete',
        canPickMany: true,
    });

    if (!picks || picks.length === 0) {
        vscode.window.showInformationMessage('Playlist deletion cancelled.');
        return;
    }

    const confirm = await vscode.window.showInformationMessage(
        picks.length === 1
            ? `Delete playlist "${picks[0].label}"?`
            : `Delete ${picks.length} playlists?`,
        { modal: true, detail: 'Delete ボタンで確定 / This action cannot be undone.' },
        'Delete'
    );

    if (confirm !== 'Delete') {
        vscode.window.showInformationMessage('Playlist deletion cancelled.');
        return;
    }

    const urlsToDelete = picks.map((pick) => pick.playlist.url);
    const activeState = getActivePlaylistState(context);
    const activeRemoved = Boolean(activeState && urlsToDelete.includes(activeState.playlist.url));
    const deleted = await removeSavedPlaylists(context, urlsToDelete);

    if (!deleted.length) {
        vscode.window.showWarningMessage('Selected playlists could not be deleted.');
        return;
    }

    vscode.commands.executeCommand('extension.refreshPlaylistState');

    if (activeRemoved) {
        await completePlaylist(context);
        const shouldNotify = vscode.workspace
            .getConfiguration('mudePlayer')
            .get<boolean>('notifyActivePlaylistDeletion', true);
        if (shouldNotify) {
            vscode.window.showInformationMessage('再生中のプレイリストを削除したため停止しました');
        }
    }

    if (deleted.length === 1) {
        vscode.window.showInformationMessage(
            `Deleted playlist "${deleted[0].title || deleted[0].url}".`
        );
    } else {
        vscode.window.showInformationMessage(`Deleted ${deleted.length} playlists.`);
    }
}
