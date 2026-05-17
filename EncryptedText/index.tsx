import definePlugin, { OptionType } from "@utils/types";
import { openModal, ModalRoot, ModalHeader, ModalContent, ModalFooter, ModalCloseButton } from "@utils/modal";
import { FluxDispatcher, React, Button, Forms, UploadHandler, Tooltip } from "@webpack/common";
import { definePluginSettings } from "@api/Settings";
import { addMessageAccessory, removeMessageAccessory } from "@api/MessageAccessories";
import { ApplicationCommandInputType, ApplicationCommandOptionType } from "@api/Commands";
import { sendMessage } from "@utils/discord";
import { addChatBarButton, removeChatBarButton, ChatBarButton } from "@api/ChatButtons";
import { findByProps } from "@webpack";

const GITHUB_PAGE = "https://github.com/Vencipher/vencord-customplugins";
const PLUGIN_NAME = "EncryptedText";
const PLUGIN_VERSION = 2.0;
const MARKER = "This message is 🔒End-to-end Encrypted.";
const CIPHER_REGEX = /`([A-Za-z0-9+/]+=*)`/;
const E2EE_EXT = ".e2ee.png";

const decryptedIds = new Set<string>();
let encryptionEnabled = false;

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

const settings = definePluginSettings({
    presetKey: {
        type: OptionType.STRING,
        description: "Preset Encryption Key (must match on both ends)",
        default: "",
        secret: true,
        restartNeeded: false
    }
});

async function deriveKey(password: string): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const hash = await crypto.subtle.digest("SHA-256", enc.encode(password));
    return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptMessage(text: string, password: string): Promise<string> {
    const key = await deriveKey(password);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        new TextEncoder().encode(text)
    );
    const payload = new Uint8Array(12 + cipher.byteLength);
    payload.set(iv, 0);
    payload.set(new Uint8Array(cipher), 12);
    let binary = "";
    for (let i = 0; i < payload.length; i++) binary += String.fromCharCode(payload[i]);
    return btoa(binary);
}

async function decryptMessage(base64: string, password: string): Promise<{ success: boolean; text: string; }> {
    try {
        const key = await deriveKey(password);
        const raw = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        const iv = raw.slice(0, 12);
        const data = raw.slice(12);
        const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
        return { success: true, text: new TextDecoder().decode(decrypted) };
    } catch {
        return { success: false, text: "❌ Decryption failed — wrong key or corrupted message." };
    }
}

async function encryptFile(
    buffer: ArrayBuffer,
    filename: string,
    mimeType: string,
    password: string
): Promise<File> {
    const key = await deriveKey(password);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, buffer);

    const metaBytes = new TextEncoder().encode(JSON.stringify({ name: filename, type: mimeType }));
    const metaLenBuf = new Uint32Array([metaBytes.length]);

    const payload = new Uint8Array(4 + metaBytes.length + 12 + cipher.byteLength);
    payload.set(new Uint8Array(metaLenBuf.buffer), 0);
    payload.set(metaBytes, 4);
    payload.set(iv, 4 + metaBytes.length);
    payload.set(new Uint8Array(cipher), 4 + metaBytes.length + 12);

    return new File([payload], filename + E2EE_EXT, { type: "image/png" });
}

interface DecryptedFile { blob: Blob; name: string; type: string; }

async function decryptFile(buffer: ArrayBuffer, password: string): Promise<DecryptedFile | null> {
    try {
        const key = await deriveKey(password);
        const bytes = new Uint8Array(buffer);
        const metaLen = new DataView(buffer).getUint32(0, true);

        const meta: { name: string; type: string; } =
            JSON.parse(new TextDecoder().decode(bytes.slice(4, 4 + metaLen)));

        const iv = bytes.slice(4 + metaLen, 4 + metaLen + 12);
        const data = bytes.slice(4 + metaLen + 12);

        const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
        return { blob: new Blob([decrypted], { type: meta.type }), name: meta.name, type: meta.type };
    } catch {
        return null;
    }
}

type MediaState = "idle" | "loading" | "done" | "error";

function DecryptedMediaItem({ attachment }: { attachment: any; }) {
    const [state, setState] = React.useState<MediaState>("idle");
    const [objectUrl, setObjectUrl] = React.useState<string | null>(null);
    const [file, setFile] = React.useState<DecryptedFile | null>(null);

    React.useEffect(() => {
        return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
    }, [objectUrl]);

    const handleDecrypt = async () => {
        const key = settings.store.presetKey;
        if (!key) { setState("error"); return; }
        setState("loading");
        try {
            const res = await fetch(attachment.url);
            const buf = await res.arrayBuffer();
            const result = await decryptFile(buf, key);
            if (!result) { setState("error"); return; }
            setFile(result);
            setObjectUrl(URL.createObjectURL(result.blob));
            setState("done");
        } catch {
            setState("error");
        }
    };

    const containerStyle: React.CSSProperties = {
        marginTop: "6px",
        padding: "6px 10px",
        background: "var(--background-secondary)",
        borderRadius: "6px",
        borderLeft: "3px solid #23a559",
        display: "inline-block",
        maxWidth: "420px"
    };

    const labelStyle: React.CSSProperties = {
        fontSize: "0.78em",
        color: "var(--text-muted)",
        marginBottom: "6px",
        userSelect: "none"
    };

    const displayName = (attachment.filename as string).replace(/\.e2ee(\.png)?$/, "");

    if (state === "idle") {
        return (
            <div style={containerStyle}>
                <div style={labelStyle}>🔒 Encrypted file: <strong>{displayName}</strong></div>
                <Button size={Button.Sizes.SMALL} color={Button.Colors.BRAND} onClick={handleDecrypt}>
                    🔓 Decrypt
                </Button>
            </div>
        );
    }

    if (state === "loading") {
        return (
            <div style={containerStyle}>
                <div style={labelStyle}>Decrypting <strong>{displayName}</strong>…</div>
            </div>
        );
    }

    if (state === "error") {
        return (
            <div style={{ ...containerStyle, borderLeftColor: "#ed4245" }}>
                <div style={{ ...labelStyle, color: "#ed4245" }}>
                    ❌ Failed to decrypt <strong>{displayName}</strong> — wrong key or corrupted file.
                </div>
            </div>
        );
    }

    const { type } = file!;
    const isImage = type.startsWith("image/");
    const isVideo = type.startsWith("video/");

    return (
        <div style={containerStyle}>
            <div style={labelStyle}>🔒 <strong>{file!.name}</strong></div>
            {isImage && (
                <img
                    src={objectUrl!}
                    alt={file!.name}
                    style={{ maxWidth: "400px", maxHeight: "300px", borderRadius: "4px", display: "block" }}
                />
            )}
            {isVideo && (
                <video
                    src={objectUrl!}
                    controls
                    style={{ maxWidth: "400px", maxHeight: "300px", borderRadius: "4px", display: "block" }}
                />
            )}
            {!isImage && !isVideo && (
                <a
                    href={objectUrl!}
                    download={file!.name}
                    style={{ color: "var(--text-link)", fontSize: "0.9em" }}
                >
                    ⬇ Download {file!.name}
                </a>
            )}
        </div>
    );
}

function DecryptedMediaAccessory({ message }: { message: any; }) {
    const e2eeAttachments: any[] = (message?.attachments ?? []).filter(
        (a: any) => typeof a.filename === "string" && a.filename.includes(".e2ee")
    );
    if (!e2eeAttachments.length) return null;

    return (
        <div>
            {e2eeAttachments.map((a: any) => (
                <DecryptedMediaItem key={a.id} attachment={a} />
            ))}
        </div>
    );
}

const EncryptLockButton: ChatBarButton = ({ isMainChat }) => {
    const [enabled, setEnabled] = React.useState(encryptionEnabled);

    if (!isMainChat) return null;

    const toggle = () => {
        encryptionEnabled = !encryptionEnabled;
        setEnabled(encryptionEnabled);
    };

    return (
        <Tooltip text={enabled ? "Encryption ON — click to disable" : "Encryption OFF — click to enable"}>
            {({ onMouseEnter, onMouseLeave }) => (
                <div
                    onMouseEnter={onMouseEnter}
                    onMouseLeave={onMouseLeave}
                    onClick={toggle}
                    style={{
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "32px",
                        height: "32px",
                        borderRadius: "4px",
                        color: enabled ? "var(--brand-experiment)" : "var(--interactive-normal)",
                        transition: "color 0.15s ease"
                    }}
                >
                    {enabled ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                    ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                        </svg>
                    )}
                </div>
            )}
        </Tooltip>
    );
};

export default definePlugin({
    name: "EncryptedText",
    description: "End-to-End Encryption for Discord messages and files. Use /e2ee or /e2ee-file.",
    authors: [{ name: "Vencipher", id: 1234567890123456789n }],
    settings,
    dependencies: ["CommandsAPI", "MessageAccessoriesAPI", "ChatInputButtonAPI"],

    _handlers: {} as Record<string, (...args: any[]) => void>,
    _origSend: null as any,

    async _tryDecrypt(channelId: string, msg: any) {
        if (!msg?.content?.includes(MARKER)) return;
        const key = settings.store.presetKey;
        if (!key) return;
        const match = msg.content.match(CIPHER_REGEX);
        if (!match) return;
        const result = await decryptMessage(match[1], key);
        if (result.success) {
            decryptedIds.add(msg.id);
        }
        FluxDispatcher.dispatch({
            type: "MESSAGE_UPDATE",
            message: {
                ...msg,
                channel_id: channelId,
                content: result.success
                    ? result.text
                    : "❌ Decryption failed — wrong key or corrupted message."
            }
        });
    },

    start() {
        checkForUpdates();

        this._handlers.create = ({ message, channelId }: any) => {
            const cid = channelId ?? message?.channel_id;
            if (cid) this._tryDecrypt(cid, message);
        };

        this._handlers.load = ({ messages, channelId }: any) => {
            if (!Array.isArray(messages)) return;
            for (const msg of messages) this._tryDecrypt(channelId, msg);
        };

        FluxDispatcher.subscribe("MESSAGE_CREATE", this._handlers.create);
        FluxDispatcher.subscribe("LOAD_MESSAGES_SUCCESS", this._handlers.load);

        addMessageAccessory("e2ee-badge", (props: any) => {
            if (!decryptedIds.has(props.message?.id)) return null;
            return React.createElement("span", {
                    style: { fontSize: "0.85em", display: "block", marginTop: "2px", userSelect: "none" }
                },
                React.createElement("span", {
                    style: { color: "#FFFFFF", fontStyle: "normal" }
                }, "This message is "),
                React.createElement("span", {
                    style: { color: "#23a559", fontStyle: "italic" }
                }, "🔒End-to-end Encrypted")
            );
        });

        addMessageAccessory("e2ee-media", (props: any) => {
            return React.createElement(DecryptedMediaAccessory, { message: props.message });
        });

        addChatBarButton("e2ee-lock", EncryptLockButton);

        const MessageActions = findByProps("sendMessage", "editMessage");
        if (MessageActions) {
            this._origSend = MessageActions.sendMessage;
            MessageActions.sendMessage = async (channelId: string, msg: any, ...rest: any[]) => {
                if (encryptionEnabled && msg?.content?.trim()) {
                    const key = settings.store.presetKey;
                    if (key) {
                        const b64 = await encryptMessage(msg.content, key);
                        const encrypted =
                            `\`${b64}\`\n\n` +
                            `This message is 🔒End-to-end Encrypted. ` +
                            `To view its contents use [Vencord](<https://vencord.dev>) with the EncryptedText plugin. ` +
                            `Alternatively, use an [online Decryption tool](<https://vencipher.github.io/decryptor>).`;
                        if (encrypted.length <= 2000) msg = { ...msg, content: encrypted };
                    }
                }
                return this._origSend.call(MessageActions, channelId, msg, ...rest);
            };
        }
    },

    stop() {
        FluxDispatcher.unsubscribe("MESSAGE_CREATE", this._handlers.create);
        FluxDispatcher.unsubscribe("LOAD_MESSAGES_SUCCESS", this._handlers.load);
        this._handlers = {};
        removeMessageAccessory("e2ee-badge");
        removeMessageAccessory("e2ee-media");
        removeChatBarButton("e2ee-lock");
        if (this._origSend) {
            const MessageActions = findByProps("sendMessage", "editMessage");
            if (MessageActions) MessageActions.sendMessage = this._origSend;
            this._origSend = null;
        }
        decryptedIds.clear();
        encryptionEnabled = false;
    },

    commands: [
        {
            inputType: ApplicationCommandInputType.BUILT_IN,
            name: "e2ee",
            description: "Send an end-to-end encrypted message",
            options: [{
                name: "message",
                type: ApplicationCommandOptionType.STRING,
                required: true,
                description: "The secret text to encrypt and send"
            }],
            execute: async (opts: any, ctx: any) => {
                const raw: string = opts.find((o: any) => o.name === "message")?.value;
                const key = settings.store.presetKey;
                if (!key) {
                    return { content: "❌ Set a Preset Key in Plugin Settings before using /e2ee." };
                }
                const b64 = await encryptMessage(raw, key);
                const finalContent =
                    `\`${b64}\`\n\n` +
                    `This message is 🔒End-to-end Encrypted. ` +
                    `To view its contents use [Vencord](<https://vencord.dev>) with the EncryptedText plugin. ` +
                    `Alternatively, use an [online Decryption tool](<https://vencipher.github.io/decryptor>).`;
                if (finalContent.length > 2000) {
                    return { content: "❌ Message too long after encryption. Discord limits messages to 2000 characters." };
                }
                sendMessage(ctx.channel.id, { content: finalContent });
            }
        },
        {
            inputType: ApplicationCommandInputType.BUILT_IN,
            name: "e2ee-file",
            description: "Send an end-to-end encrypted file (photo, gif, video, etc.)",
            options: [],
            execute: (_opts: any, ctx: any) => {
                const key = settings.store.presetKey;
                if (!key) {
                    sendMessage(ctx.channel.id, { content: "❌ [EncryptedText] Set a Preset Key in Plugin Settings before using /e2ee-file." });
                    return;
                }

                openModal(modalProps => (
                    <ModalRoot {...modalProps}>
                        <ModalHeader>
                            <Forms.FormTitle tag="h4" style={{ margin: 0 }}>🔒 Send Encrypted File</Forms.FormTitle>
                            <ModalCloseButton onClick={modalProps.onClose} />
                        </ModalHeader>
                        <ModalContent style={{ padding: "16px" }}>
                            <Forms.FormText style={{ marginBottom: "12px" }}>
                                Select a file to encrypt and send (max 10 MB).
                            </Forms.FormText>
                            <label style={{
                                display: "inline-block",
                                padding: "8px 16px",
                                background: "var(--brand-experiment)",
                                color: "#fff",
                                borderRadius: "4px",
                                cursor: "pointer",
                                fontSize: "14px"
                            }}>
                                📁 Choose File
                                <input
                                    type="file"
                                    accept="image/*,video/*,audio/*"
                                    style={{ display: "none" }}
                                    onChange={async e => {
                                        const file = e.currentTarget.files?.[0];
                                        if (!file) return;
                                        modalProps.onClose();
                                        if (file.size > 10 * 1024 * 1024) {
                                            sendMessage(ctx.channel.id, { content: "❌ [EncryptedText] File exceeds 10 MB." });
                                            return;
                                        }
                                        try {
                                            const buf = await file.arrayBuffer();
                                            const encFile = await encryptFile(buf, file.name, file.type || "application/octet-stream", key);
                                            const uploader = UploadHandler ?? (window as any).Vencord?.Webpack?.findByProps?.("promptToUpload");
                                            if (!uploader?.promptToUpload) {
                                                sendMessage(ctx.channel.id, { content: "❌ [EncryptedText] Could not find upload handler." });
                                                return;
                                            }
                                            uploader.promptToUpload([encFile], ctx.channel, 0);
                                        } catch (err) {
                                            console.error("[EncryptedText] file encrypt error:", err);
                                            sendMessage(ctx.channel.id, { content: "❌ [EncryptedText] Encryption failed — check console." });
                                        }
                                    }}
                                />
                            </label>
                        </ModalContent>
                        <ModalFooter>
                            <Button color={Button.Colors.TRANSPARENT} onClick={modalProps.onClose}>Cancel</Button>
                        </ModalFooter>
                    </ModalRoot>
                ));
            }
        }
    ]
});
