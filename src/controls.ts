import { player } from './player';
import { setVolume, adjustVolume, promptForVolumeInput, VOLUME_STEP, handleVolumeChange } from './volume';
import * as vscode from 'vscode';
import { addLastToNextAndPlay, addToNextAndPlay } from './nextsongs';
import { togglePauseButton, updateVolumeIndicator } from './statusBar';

export function controls(context: vscode.ExtensionContext) {
    let togglePause = vscode.commands.registerCommand(
        'MudePlayer.togglePause',
        async () => {
            const state = await player.getProperty('pause'); 
            if (state) {
                await player.resume();
                console.log('Playing');
                togglePauseButton.text = '$(debug-pause)';
                togglePauseButton.tooltip = 'Pause';
            } else {
                await player.pause();
                console.log('Paused');
                togglePauseButton.text = '$(notebook-execute)';
                togglePauseButton.tooltip = 'Play';
            }
            togglePauseButton.show();
        }
    );
    

    let seekForward = vscode.commands.registerCommand(
        'MudePlayer.seekForward',
        async () => {
            await player.seek(10);
        }
    );

    let seekBackword = vscode.commands.registerCommand(
        'MudePlayer.seekBackword',
        async () => {
            await player.seek(-10);
        }
    );

    let playNext = vscode.commands.registerCommand('MudePlayer.playNext', async () => {
        addToNextAndPlay(context); // Pass context to the function
    });

    let playPrevious = vscode.commands.registerCommand(
        'MudePlayer.playPrevious',
        async () => {
            addLastToNextAndPlay(context); // Pass context to the function
        }
    );

    let setVolumeCommand = vscode.commands.registerCommand('MudePlayer.setVolume', async () => {
        const result: number = await promptForVolumeInput();
        await handleVolumeChange(context, () => setVolume(result), updateVolumeIndicator);
    });

    let volumeUpCommand = vscode.commands.registerCommand('MudePlayer.volumeUp', async () => {
        await handleVolumeChange(context, () => adjustVolume(VOLUME_STEP), updateVolumeIndicator);
    });

    let volumeDownCommand = vscode.commands.registerCommand('MudePlayer.volumeDown', async () => {
        await handleVolumeChange(context, () => adjustVolume(-VOLUME_STEP), updateVolumeIndicator);
    });


    context.subscriptions.push(
        seekForward,
        seekBackword,
        togglePause,
        playNext,
        playPrevious,
        setVolumeCommand,
        volumeUpCommand,
        volumeDownCommand,
    );
}
