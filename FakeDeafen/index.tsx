import definePlugin, { OptionType } from "@utils/types";
import { definePluginSettings } from "@api/Settings";
import { findStore, findByProps } from "@webpack";
import { showToast } from "@webpack/common";

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

let GatewayConnectionStore: any;
let AudioUtils: any;
let SoundModule: any;

const settings = definePluginSettings({
    fakeMute: {
        type: OptionType.BOOLEAN,
        description: "Fake Mute",
        default: true
    },
    fakeDeaf: {
        type: OptionType.BOOLEAN,
        description: "Fake Deafen",
        default: true
    },
    fakeVideo: {
        type: OptionType.BOOLEAN,
        description: "Fake Video",
        default: false
    },
    keybind: {
        type: OptionType.STRING,
        description: "Keybind (e.g., ctrl+d)",
        default: "ctrl+d"
    },
    playAudio: {
        type: OptionType.BOOLEAN,
        description: "Play Sound on Toggle",
        default: true
    }
});

export default definePlugin({
    name: "FakeDeafen",
    description: "Fake your audio status to make it look like you are muted or deafened when you're not.",
    authors: [{ name: "Vencipher", id: 1234567890123456789n }],

    settings,

    enabled: false,
    unpatch: null as any,
    keyDownHandler: null as any,

    start() {
        checkForUpdates();

        GatewayConnectionStore = findStore("GatewayConnectionStore");
        AudioUtils = findByProps("toggleSelfMute");
        SoundModule = findByProps("playSound");

        this.keyDownHandler = this.handleKeyDown.bind(this);
        document.addEventListener("keydown", this.keyDownHandler);
    },

    stop() {
        document.removeEventListener("keydown", this.keyDownHandler);
        this.unfakeIt();
    },

    fakeIt() {
        const voiceSocket = GatewayConnectionStore?.getSocket();
        
        if (!voiceSocket) return;

        if (this.unpatch) this.unpatch();

        const originalVoiceStateUpdate = voiceSocket.voiceStateUpdate.bind(voiceSocket);

        voiceSocket.voiceStateUpdate = (data: any) => {
            voiceSocket.send(4, {
                guild_id: data.guildId,
                channel_id: data.channelId,
                preferredRegion: data.preferredRegion,
                self_mute: settings.store.fakeMute || data.selfMute,
                self_deaf: settings.store.fakeDeaf || data.selfDeaf,
                self_video: settings.store.fakeVideo || data.selfVideo,
            });
        };

        this.unpatch = () => {
            voiceSocket.voiceStateUpdate = originalVoiceStateUpdate;
        };

        this.enabled = true;
        this.forceUpdate();
    },

    unfakeIt() {
        if (this.unpatch) {
            this.unpatch();
            this.unpatch = null;
        }
        this.enabled = false;
        this.forceUpdate();
    },

    toggle() {
        if (this.enabled) {
            this.unfakeIt();
            if (settings.store.playAudio) this.playSound("stream_ended");
        } else {
            this.fakeIt();
            if (settings.store.playAudio) this.playSound("reconnect");
        }
    },

    async forceUpdate() {
        if (!AudioUtils) return;
        
        await AudioUtils.toggleSelfMute();
        setTimeout(() => {
            AudioUtils.toggleSelfMute();
        }, 100);
    },

    playSound(soundName: string) {
        if (SoundModule) {
            try { SoundModule.playSound(soundName, 0.5); } catch(e) {}
        }
    },

    handleKeyDown(e: KeyboardEvent) {
        const keybindSetting = settings.store.keybind;
        if (!keybindSetting || typeof keybindSetting !== "string") return;
        
        const keybind = keybindSetting.toLowerCase();
        const parts = keybind.split("+");
        const key = parts[parts.length - 1];
        const ctrl = parts.includes("ctrl");
        const shift = parts.includes("shift");
        const alt = parts.includes("alt");

        if (e.key.toLowerCase() === key && 
           (ctrl === e.ctrlKey) && 
           (shift === e.shiftKey) && 
           (alt === e.altKey)) {
            
            e.preventDefault(); 
            this.toggle();
        }
    }
});