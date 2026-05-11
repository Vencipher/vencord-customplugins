import { app, shell, IpcMainInvokeEvent } from "electron";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "fs";
import { extname, join } from "path";
import { pathToFileURL, fileURLToPath } from "url";

const AUDIO_EXTS = new Set([".mp3", ".wav", ".ogg", ".flac", ".m4a", ".aac", ".opus", ".webm"]);

function getMusicFolder(): string {
    return join(app.getPath("userData"), "EasyMusic");
}

export function ensureFolder(): string {
    const folder = getMusicFolder();
    if (!existsSync(folder)) mkdirSync(folder, { recursive: true });
    return folder;
}

export function getSongs(): string[] {
    try {
        const folder = getMusicFolder();
        return readdirSync(folder)
            .filter(f => AUDIO_EXTS.has(extname(f).toLowerCase()))
            .sort()
            .map(f => pathToFileURL(join(folder, f)).href);
    } catch {
        return [];
    }
}

export function readSong(_evt: IpcMainInvokeEvent, fileUrl: string): Buffer {
    return readFileSync(fileURLToPath(fileUrl));
}

export function openFolder(): void {
    shell.openPath(getMusicFolder());
}
