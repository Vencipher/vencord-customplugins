import definePlugin, { OptionType } from "@utils/types";
import { FluxDispatcher, React, showToast } from "@webpack/common";
import { definePluginSettings } from "@api/Settings";
import { addMessageAccessory, removeMessageAccessory } from "@api/MessageAccessories";
import { ApplicationCommandInputType, ApplicationCommandOptionType } from "@api/Commands";
import { sendMessage } from "@utils/discord";

const PLUGIN_VERSIONS = {
    BigFileUpload: 1,
    EncryptedText: 1,
    FakeDeafen: 1
};

async function checkForUpdates() {
    try {
        const response = await fetch("https://raw.githubusercontent.com/Vencipher/vencord-customplugins/main/version.json", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        let needsUpdate = false;
        for (const key in PLUGIN_VERSIONS) {
            if (data[key] > (PLUGIN_VERSIONS as any)[key]) {
                needsUpdate = true;
                break;
            }
        }
        if (needsUpdate) {
            showToast("Update available for custom plugins! Run the updater script.", { duration: 10000 });
        }
    } catch (error) {}
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

const MARKER = "This message is 🔒End-to-end Encrypted.";
const CIPHER_REGEX = /`([A-Za-z0-9+/]+=*)`/;
const decryptedIds = new Set<string>();

export default definePlugin({
    name: "EncryptedText",
    description: "End-to-End Encryption for Discord messages. Use /e2ee to send.",
    authors: [{ name: "Vencipher", id: 1234567890123456789n }],
    settings,
    dependencies: ["CommandsAPI", "MessageAccessoriesAPI"],

    _handlers: {} as Record<string, (...args: any[]) => void>,

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
    },

    stop() {
        FluxDispatcher.unsubscribe("MESSAGE_CREATE", this._handlers.create);
        FluxDispatcher.unsubscribe("LOAD_MESSAGES_SUCCESS", this._handlers.load);
        this._handlers = {};
        removeMessageAccessory("e2ee-badge");
        decryptedIds.clear();
    },

    commands: [{
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
    }]
});