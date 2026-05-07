import { definePluginSettings } from "@api/Settings";
import { addMemberListDecorator, removeMemberListDecorator } from "@api/MemberListDecorators";
import { addMessageDecoration, removeMessageDecoration } from "@api/MessageDecorations";
import { openModal, ModalRoot, ModalHeader, ModalContent, ModalFooter, ModalCloseButton } from "@utils/modal";
import { FluxDispatcher, PresenceStore, useState, useEffect, Button, Forms } from "@webpack/common";
import definePlugin, { OptionType } from "@utils/types";

const GITHUB_PAGE = "https://github.com/Vencipher/vencord-customplugins";
const PLUGIN_NAME = "InvisibleDetector";
const PLUGIN_VERSION = 0.1;

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
    staleMinutes: {
        type: OptionType.NUMBER,
        description: "Minutes before a detected invisible user is forgotten (0 = never forget this session)",
        default: 20,
        restartNeeded: false,
    },
});

const invisibleUsers = new Map<string, number>();
const listeners = new Set<(userId: string) => void>();

const emitter = {
    on: (fn: (id: string) => void) => listeners.add(fn),
    off: (fn: (id: string) => void) => listeners.delete(fn),
    emit: (id: string) => listeners.forEach(fn => fn(id)),
};

function getStaleCutoff(): number {
    const m = settings.store.staleMinutes;
    return (!m || m <= 0) ? 0 : Date.now() - m * 60_000;
}

function isOffline(userId: string): boolean {
    const s = PresenceStore?.getStatus(userId);
    return !s || s === "offline";
}

function recordActivity(userId: string | undefined | null) {
    if (!userId) return;
    if (!isOffline(userId)) return;
    invisibleUsers.set(userId, Date.now());
    emitter.emit(userId);
}

function pruneStale() {
    const cutoff = getStaleCutoff();
    if (cutoff === 0) return;
    for (const [id, ts] of invisibleUsers) {
        if (ts < cutoff) {
            invisibleUsers.delete(id);
            emitter.emit(id);
        }
    }
}

function isTracked(userId: string): boolean {
    if (!invisibleUsers.has(userId)) return false;
    const cutoff = getStaleCutoff();
    return cutoff === 0 || (invisibleUsers.get(userId) ?? 0) >= cutoff;
}

function useIsInvisible(userId?: string): boolean {
    const [active, setActive] = useState(() => !!userId && isTracked(userId));
    useEffect(() => {
        if (!userId) return;
        setActive(isTracked(userId));
        const fn = (id: string) => { if (id === userId) setActive(isTracked(id)); };
        emitter.on(fn);
        return () => emitter.off(fn);
    }, [userId]);
    return active;
}

function MemberListDecoration({ user }: { user?: { id: string } }) {
    const active = useIsInvisible(user?.id);
    if (!active) return null;
    return (
        <>
            <div style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                backgroundColor: "rgba(237, 66, 69, 0.15)",
                borderLeft: "3px solid #ed4245",
                pointerEvents: "none",
                zIndex: 0,
            }} />
            <span
                title="This user appears offline but recent activity was detected — possibly invisible"
                style={{
                    position: "relative",
                    zIndex: 1,
                    fontSize: "14px",
                    cursor: "default",
                    userSelect: "none",
                    marginLeft: "2px",
                    display: "inline-flex",
                    alignItems: "center",
                }}
            >
                ❗
            </span>
        </>
    );
}

function ChatDecoration({ message }: { message?: { author?: { id: string } } }) {
    const active = useIsInvisible(message?.author?.id);
    if (!active) return null;
    return (
        <span
            title="This user appears offline but recent activity was detected — possibly invisible"
            style={{
                fontSize: "12px",
                marginLeft: "3px",
                cursor: "default",
                userSelect: "none",
                verticalAlign: "middle",
                display: "inline-flex",
                alignItems: "center",
            }}
        >
            ❗
        </span>
    );
}

const onTypingStart = (e: any) => { recordActivity(e.userId); };
const onMessageCreate = (e: any) => { recordActivity(e.message?.author?.id ?? e.author?.id); };
const onVoiceStateUpdate = (e: any) => {
    const userId = e.userId ?? e.voiceState?.userId ?? e.user?.id;
    const channelId = e.channelId ?? e.voiceState?.channelId;
    if (userId && channelId) recordActivity(userId);
};
const onMessageReactionAdd = (e: any) => { recordActivity(e.userId ?? e.user?.id); };
const onCallUpdate = (e: any) => { (e.ringing ?? []).forEach(recordActivity); };
const onThreadMemberUpdate = (e: any) => { recordActivity(e.member?.userId ?? e.member?.user?.id ?? e.userId); };
const onThreadListSync = (e: any) => { (e.members ?? []).forEach((m: any) => recordActivity(m.userId ?? m.user?.id)); };
const onGuildMemberUpdate = (e: any) => { recordActivity(e.user?.id ?? e.userId); };
const onChannelRecipientAdd = (e: any) => { recordActivity(e.user?.id ?? e.userId); };
const onInteractionSuccess = (e: any) => { recordActivity(e.interaction?.user?.id ?? e.user?.id); };
const onPresenceUpdate = (e: any) => {
    const user = e.user ?? e.presence?.user;
    if (!user?.id) return;
    const status = e.status ?? e.presence?.status;
    if (status && status !== "offline") {
        invisibleUsers.delete(user.id);
        emitter.emit(user.id);
    }
};

export default definePlugin({
    name: "InvisibleDetector",
    description: "Marks users with ❗ who appear offline but show activity. Highlights them in the member list and chat.",
    authors: [{ name: "Vencipher", id: 1234567890123456789n }],
    settings,
    dependencies: ["MemberListDecoratorsAPI", "MessageDecorationsAPI"],

    start() {
        checkForUpdates();

        addMemberListDecorator("InvisibleDetector", props => <MemberListDecoration user={props?.user} />);
        addMessageDecoration("InvisibleDetector", props => <ChatDecoration message={props?.message} />);

        FluxDispatcher.subscribe("TYPING_START", onTypingStart);
        FluxDispatcher.subscribe("MESSAGE_CREATE", onMessageCreate);
        FluxDispatcher.subscribe("VOICE_STATE_UPDATE", onVoiceStateUpdate);
        FluxDispatcher.subscribe("MESSAGE_REACTION_ADD", onMessageReactionAdd);
        FluxDispatcher.subscribe("CALL_UPDATE", onCallUpdate);
        FluxDispatcher.subscribe("THREAD_MEMBER_UPDATE", onThreadMemberUpdate);
        FluxDispatcher.subscribe("THREAD_LIST_SYNC", onThreadListSync);
        FluxDispatcher.subscribe("GUILD_MEMBER_UPDATE", onGuildMemberUpdate);
        FluxDispatcher.subscribe("CHANNEL_RECIPIENT_ADD", onChannelRecipientAdd);
        FluxDispatcher.subscribe("INTERACTION_SUCCESS", onInteractionSuccess);
        FluxDispatcher.subscribe("PRESENCE_UPDATES", onPresenceUpdate);

        this._pruneTimer = setInterval(pruneStale, 60_000);
    },

    stop() {
        removeMemberListDecorator("InvisibleDetector");
        removeMessageDecoration("InvisibleDetector");

        FluxDispatcher.unsubscribe("TYPING_START", onTypingStart);
        FluxDispatcher.unsubscribe("MESSAGE_CREATE", onMessageCreate);
        FluxDispatcher.unsubscribe("VOICE_STATE_UPDATE", onVoiceStateUpdate);
        FluxDispatcher.unsubscribe("MESSAGE_REACTION_ADD", onMessageReactionAdd);
        FluxDispatcher.unsubscribe("CALL_UPDATE", onCallUpdate);
        FluxDispatcher.unsubscribe("THREAD_MEMBER_UPDATE", onThreadMemberUpdate);
        FluxDispatcher.unsubscribe("THREAD_LIST_SYNC", onThreadListSync);
        FluxDispatcher.unsubscribe("GUILD_MEMBER_UPDATE", onGuildMemberUpdate);
        FluxDispatcher.unsubscribe("CHANNEL_RECIPIENT_ADD", onChannelRecipientAdd);
        FluxDispatcher.unsubscribe("INTERACTION_SUCCESS", onInteractionSuccess);
        FluxDispatcher.unsubscribe("PRESENCE_UPDATES", onPresenceUpdate);

        clearInterval(this._pruneTimer);
        invisibleUsers.clear();
    },
});
