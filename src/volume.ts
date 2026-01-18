import * as vscode from 'vscode';
import { player } from './player';

const DEFAULT_VOLUME = 50;
let currentVolume = DEFAULT_VOLUME;

export const VOLUME_STATE_KEY = 'volumeLevel';
export const VOLUME_STEP = 5;

function clampVolume(volume: number) {
    return Math.max(0, Math.min(100, Math.round(volume)));
}

export function getVolume(): number {
    return currentVolume;
}

/**
 * Prompts the user to input a volume level via an input box.
 * 
 * Displays an input box with the current volume as the default value.
 * Validates that the input is a number between 0 and 100.
 * 
 * @returns A promise that resolves to the user-specified volume level (0-100).
 *          If the user cancels the input, returns the current volume level.
 * 
 * @remarks
 * The input is validated to ensure:
 * - The value is not empty
 * - The value is a finite number
 * - The value is within the range [0, 100]
 */
export async function promptForVolumeInput(): Promise<number> {
    const currentVolume = getVolume();
    const result = await vscode.window.showInputBox({
        prompt: 'Set playback volume (0-100)',
        placeHolder: '0-100',
        value: currentVolume.toString(),
        validateInput: (value) => {
            if (value.trim() === '') {
                return 'Volume is required';
            }
            const numeric = Number(value);
            if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) {
                return 'Enter a number between 0 and 100';
            }
            return undefined;
        }
    });

    if (result === undefined) {
        return Number(currentVolume);
    }

    return Number(result);
}

export async function setVolume(volume: number): Promise<number> {
    currentVolume = clampVolume(volume);
    await player.setProperty('volume', currentVolume);
    return currentVolume;
}

export async function adjustVolume(delta: number): Promise<number> {
    return setVolume(currentVolume + delta);
}

export async function initializeVolume() {
    return setVolume(DEFAULT_VOLUME);
}

/**
 * Handles volume changes by updating the volume state and notifying listeners.
 * 
 * @param context - The VS Code extension context used to store global state
 * @param updater - An async function that returns the new volume value
 * @param onVolumeUpdated - Optional callback function invoked with the new volume value after successful update
 * @returns A promise that resolves when the volume change is complete
 * @throws Will log errors to console and show an error message to the user if volume change fails
 * 
 * @example
 * ```typescript
 * await handleVolumeChange(
 *   context,
 *   async () => 75,
 *   (volume) => console.log(`Volume updated to ${volume}`)
 * );
 * ```
 */
export async function handleVolumeChange(
    context: vscode.ExtensionContext,
    updater: () => Promise<number>,
    onVolumeUpdated?: (volume: number) => void
) {
    try {
        const newVolume = await updater();
        await context.globalState.update(VOLUME_STATE_KEY, newVolume);
        onVolumeUpdated?.(newVolume);
    } catch (error) {
        console.error('Failed to change volume', error);
        vscode.window.showErrorMessage('Unable to change volume. Check the logs for details.');
    }
}
