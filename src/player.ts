let mpv = require('node-mpv');

export const player = new mpv({
    audio_only: true,
    auto_restart: true,
    // verbose: true,
    mpv_args: [
        '--idle=no'
    ]
});

