import definePlugin from "@utils/types";
import { openModal, ModalRoot, ModalHeader, ModalContent, ModalFooter, ModalCloseButton } from "@utils/modal";
import { React, useState, useEffect, Button, Forms } from "@webpack/common";

const GITHUB_PAGE = "https://github.com/Vencipher/vencord-customplugins";
const PLUGIN_NAME = "EasyMusic";
const PLUGIN_VERSION = 0.1;

const Native = VencordNative.pluginHelpers.EasyMusic as {
    ensureFolder(): Promise<string>;
    getSongs(): Promise<string[]>;
    readSong(fileUrl: string): Promise<Buffer>;
    openFolder(): Promise<void>;
};

function UpdateModal({ to, modalProps }: { to: number; modalProps: any; }) {
    return (
        <ModalRoot {...modalProps}>
            <ModalHeader>
                <Forms.FormTitle tag="h4" style={{ margin: 0 }}>🔔 Update Available</Forms.FormTitle>
                <ModalCloseButton onClick={modalProps.onClose} />
            </ModalHeader>
            <ModalContent style={{ padding: "16px 16px 8px" }}>
                <Forms.FormText style={{ marginBottom: "8px" }}>
                    <strong>{PLUGIN_NAME}</strong> — v{PLUGIN_VERSION} → v{to}
                </Forms.FormText>
                <Forms.FormText style={{ marginBottom: "8px" }}>
                    Run <code>update.bat</code> in your Vencord plugins folder to apply the update.
                </Forms.FormText>
                <Forms.FormText>
                    Plugin GitHub page:{" "}
                    <a
                        href={GITHUB_PAGE}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "var(--text-link)" }}
                        onClick={e => { e.preventDefault(); window.open(GITHUB_PAGE, "_blank", "noreferrer"); }}
                    >
                        {GITHUB_PAGE}
                    </a>
                </Forms.FormText>
            </ModalContent>
            <ModalFooter>
                <Button color={Button.Colors.BRAND} onClick={modalProps.onClose}>Ok</Button>
            </ModalFooter>
        </ModalRoot>
    );
}

async function checkForUpdates() {
    try {
        const response = await fetch(
            "https://raw.githubusercontent.com/Vencipher/vencord-customplugins/main/version.json",
            { cache: "no-store" }
        );
        if (!response.ok) return;
        const data: Record<string, number> = await response.json();
        const remote = data[PLUGIN_NAME] ?? 0;
        if (remote > PLUGIN_VERSION) {
            openModal(modalProps => <UpdateModal to={remote} modalProps={modalProps} />);
        }
    } catch {}
}

function basename(fileUrl: string): string {
    try {
        const p = new URL(fileUrl).pathname;
        return decodeURIComponent(p.split("/").pop() ?? fileUrl);
    } catch {
        return fileUrl;
    }
}

let _audio: HTMLAudioElement | null = null;
let _songs: string[] = [];
let _index = 0;
let _playing = false;
let _currentBlobUrl: string | null = null;

const _listeners = new Set<() => void>();
const _notify = () => _listeners.forEach(fn => fn());

function _getAudio(): HTMLAudioElement {
    if (!_audio) {
        _audio = new Audio();
        _audio.volume = 1;
        _audio.addEventListener("ended", () => {
            if (_songs.length === 0) return;
            _loadTrack((_index + 1) % _songs.length, true);
        });
    }
    return _audio;
}

async function _loadTrack(idx: number, autoplay = false): Promise<void> {
    if (_songs.length === 0) return;
    _index = ((idx % _songs.length) + _songs.length) % _songs.length;

    const el = _getAudio();

    if (_currentBlobUrl) {
        URL.revokeObjectURL(_currentBlobUrl);
        _currentBlobUrl = null;
    }

    try {
        const buffer = await Native.readSong(_songs[_index]);
        const blob = new Blob([buffer]);
        _currentBlobUrl = URL.createObjectURL(blob);
        el.src = _currentBlobUrl;
    } catch (e) {
        _playing = false;
        _notify();
        return;
    }

    if (autoplay) {
        el.play()
            .then(() => { _playing = true; _notify(); })
            .catch(() => { _playing = false; _notify(); });
    } else {
        _notify();
    }
}

async function refreshSongs(): Promise<void> {
    _songs = await Native.getSongs();
    if (_index >= _songs.length) _index = 0;
    _notify();
}

function togglePlay(): void {
    if (_songs.length === 0) return;
    const el = _getAudio();

    if (!_currentBlobUrl) {
        _loadTrack(_index, true);
        return;
    }

    if (el.paused) {
        el.play()
            .then(() => { _playing = true; _notify(); })
            .catch(console.error);
    } else {
        el.pause();
        _playing = false;
        _notify();
    }
}

function stopTrack(): void {
    if (!_audio) return;
    _audio.pause();
    _audio.currentTime = 0;
    _playing = false;
    _notify();
}

function prevTrack(): void {
    if (_songs.length === 0) return;
    _loadTrack(_index - 1, _playing);
}

function nextTrack(): void {
    if (_songs.length === 0) return;
    _loadTrack(_index + 1, _playing);
}

const S = {
    popup: (): React.CSSProperties => ({
        position: "fixed",
        top: 50,
        right: 56,
        zIndex: 9999,
        width: 292,
        background: "var(--background-floating)",
        border: "1px solid var(--background-modifier-accent)",
        borderRadius: 12,
        padding: "14px 16px",
        boxShadow: "0 12px 40px rgba(0,0,0,0.55)",
        color: "var(--text-normal)",
        fontFamily: "var(--font-primary)",
        userSelect: "none",
    }),
    header: (): React.CSSProperties => ({
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 10,
    }),
    title: (): React.CSSProperties => ({
        fontWeight: 700,
        fontSize: 14,
        display: "flex",
        alignItems: "center",
        gap: 6,
        color: "var(--header-primary)",
    }),
    closeBtn: (): React.CSSProperties => ({
        background: "none",
        border: "none",
        cursor: "pointer",
        color: "var(--text-muted)",
        fontSize: 14,
        padding: "2px 6px",
        borderRadius: 4,
        lineHeight: "1",
    }),
    trackBox: (): React.CSSProperties => ({
        background: "var(--background-secondary)",
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 12,
        color: "var(--text-normal)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
    }),
    counter: (): React.CSSProperties => ({
        textAlign: "center",
        fontSize: 11,
        color: "var(--text-muted)",
        marginTop: 5,
        marginBottom: 10,
        letterSpacing: "0.02em",
    }),
    controls: (): React.CSSProperties => ({
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: 8,
        marginBottom: 2,
    }),
    ctrlBtn: (disabled: boolean, large: boolean): React.CSSProperties => ({
        background: "var(--background-secondary)",
        border: "none",
        borderRadius: "50%",
        cursor: disabled ? "not-allowed" : "pointer",
        color: disabled ? "var(--interactive-muted)" : "var(--interactive-active)",
        fontSize: large ? 20 : 15,
        width: large ? 46 : 36,
        height: large ? 46 : 36,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.4 : 1,
        flexShrink: 0,
        transition: "background 0.12s, opacity 0.12s",
        lineHeight: "1",
    }),
    divider: (): React.CSSProperties => ({
        margin: "12px 0 10px",
        borderTop: "1px solid var(--background-modifier-accent)",
    }),
    folderBtn: (): React.CSSProperties => ({
        width: "100%",
        background: "var(--background-secondary-alt)",
        border: "none",
        borderRadius: 8,
        color: "var(--text-normal)",
        cursor: "pointer",
        padding: "7px 0",
        fontSize: 13,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        transition: "background 0.12s",
    }),
    toolbarBtn: (open: boolean, isPlaying: boolean): React.CSSProperties => ({
        background: open ? "var(--background-modifier-selected)" : "none",
        border: "none",
        cursor: "pointer",
        color: isPlaying ? "var(--brand-experiment)" : "var(--interactive-normal)",
        width: 32,
        height: 32,
        borderRadius: 4,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        flexShrink: 0,
        transition: "color 0.15s, background 0.15s",
    }),
};

function CtrlBtn({ onClick, title, disabled = false, large = false, children }: {
    onClick(): void;
    title: string;
    disabled?: boolean;
    large?: boolean;
    children: React.ReactNode;
}) {
    return (
        <button onClick={disabled ? undefined : onClick} title={title} style={S.ctrlBtn(disabled, large)}>
            {children}
        </button>
    );
}

function MusicPlayerPopup({ onClose }: { onClose(): void; }) {
    const [, setTick] = useState(0);

    useEffect(() => {
        refreshSongs();
        const fn = () => setTick(t => t + 1);
        _listeners.add(fn);
        return () => { _listeners.delete(fn); };
    }, []);

    const hasTracks = _songs.length > 0;
    const trackName = hasTracks ? basename(_songs[_index]) : "No audio files found";

    return (
        <div style={S.popup()}>
            <div style={S.header()}>
                <span style={S.title()}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ color: "var(--brand-experiment)" }}>
                        <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
                    </svg>
                    EasyMusic
                </span>
                <button style={S.closeBtn()} onClick={onClose} title="Close">✕</button>
            </div>

            <div style={S.trackBox()} title={trackName}>{trackName}</div>

            <div style={S.counter()}>
                {hasTracks
                    ? `Track ${_index + 1} of ${_songs.length}`
                    : "Drop audio files into the music folder"}
            </div>

            <div style={S.controls()}>
                <CtrlBtn onClick={prevTrack} title="Previous track" disabled={!hasTracks}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" /></svg>
                </CtrlBtn>

                <CtrlBtn onClick={togglePlay} title={_playing ? "Pause" : "Play"} disabled={!hasTracks} large>
                    {_playing
                        ? <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                        : <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                    }
                </CtrlBtn>

                <CtrlBtn onClick={stopTrack} title="Stop" disabled={!hasTracks}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z" /></svg>
                </CtrlBtn>

                <CtrlBtn onClick={nextTrack} title="Next track" disabled={!hasTracks}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zm2-8.14L11.03 12 8 14.14V9.86zM16 6h2v12h-2z" /></svg>
                </CtrlBtn>
            </div>

            <div style={S.divider()} />
            <button style={S.folderBtn()} onClick={() => Native.openFolder()} title="Open music folder">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.8 }}>
                    <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
                </svg>
                Open Music Folder
            </button>
        </div>
    );
}

function MusicPlayerToolbarButton() {
    const [open, setOpen] = useState(false);
    const [, setTick] = useState(0);

    useEffect(() => {
        const fn = () => setTick(t => t + 1);
        _listeners.add(fn);
        return () => { _listeners.delete(fn); };
    }, []);

    return (
        <>
            <button
                title="EasyMusic"
                aria-label="EasyMusic"
                onClick={() => setOpen(v => !v)}
                style={S.toolbarBtn(open, _playing)}
            >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
                </svg>
            </button>

            {open && <MusicPlayerPopup onClose={() => setOpen(false)} />}
        </>
    );
}

export default definePlugin({
    name: "EasyMusic",
    description: "Play local audio files from a dedicated folder with a media-player popup in the Discord toolbar.",
    authors: [{ name: "Vencipher", id: 1234567890123456789n }],

    patches: [
        {
            find: "toolbar:function",
            replacement: {
                match: /(?<=toolbar:function.{0,150}children:\[)/,
                replace: "$self.renderToolbarButton(),",
            },
        },
    ],

    async start() {
        checkForUpdates();
        await Native.ensureFolder();
        await refreshSongs();
    },

    stop() {
        stopTrack();
        if (_currentBlobUrl) {
            URL.revokeObjectURL(_currentBlobUrl);
            _currentBlobUrl = null;
        }
        if (_audio) {
            _audio.src = "";
            _audio = null;
        }
    },

    renderToolbarButton(): JSX.Element {
        return <MusicPlayerToolbarButton />;
    },
});
