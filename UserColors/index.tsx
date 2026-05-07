import definePlugin from "@utils/types";
import * as DataStore from "@api/DataStore";
import { addContextMenuPatch, removeContextMenuPatch, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { openModal, ModalRoot, ModalHeader, ModalContent, ModalFooter, ModalCloseButton, ModalSize } from "@utils/modal";
import { Menu, React, showToast, Button, Forms } from "@webpack/common";

const GITHUB_PAGE = "https://github.com/Vencipher/vencord-customplugins";
const PLUGIN_NAME = "UserColors";
const PLUGIN_VERSION = 0.1;
const DATA_KEY = "UserColors_colors";

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

let userColors: Record<string, string> = {};
let observer: MutationObserver | null = null;

function getReactFiber(el: Element): any {
    const key = Object.keys(el).find(k =>
        k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance")
    );
    return key ? (el as any)[key] : null;
}

function getAuthorId(startEl: Element): string | null {
    let domNode: Element | null = startEl;
    while (domNode && domNode !== document.body) {
        let fiber = getReactFiber(domNode);
        let depth = 0;
        while (fiber && depth < 30) {
            const props = fiber.memoizedProps ?? fiber.pendingProps;
            if (props?.message?.author?.id) return props.message.author.id;
            if (props?.author?.id) return props.author.id;
            fiber = fiber.return;
            depth++;
        }
        domNode = domNode.parentElement;
    }
    return null;
}

function applyToHeader(h3: Element) {
    const authorId = getAuthorId(h3);
    if (!authorId) return;
    const color = userColors[authorId];
    if (!color) return;

    const usernameEl = (
        h3.querySelector("span > span") as HTMLElement | null
    ) ?? (
        h3.querySelector("span") as HTMLElement | null
    );

    if (usernameEl) {
        usernameEl.style.setProperty("color", color, "important");
    }
}

function scanAll() {
    document.querySelectorAll("h3").forEach(applyToHeader);
}

function startObserver() {
    observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (!(node instanceof Element)) continue;
                if (node.tagName === "H3") {
                    applyToHeader(node);
                } else {
                    node.querySelectorAll("h3").forEach(applyToHeader);
                }
            }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

function stopObserver() {
    observer?.disconnect();
    observer = null;
}

function ColorPickerModal({ userId, userName, modalProps }: { userId: string; userName: string; modalProps: any; }) {
    const [color, setColor] = React.useState<string>(userColors[userId] ?? "#ffffff");

    async function handleSave() {
        userColors[userId] = color;
        await DataStore.set(DATA_KEY, userColors);
        scanAll();
        modalProps.onClose();
        showToast(`Color set for ${userName}.`);
    }

    async function handleReset() {
        delete userColors[userId];
        await DataStore.set(DATA_KEY, userColors);
        scanAll();
        modalProps.onClose();
        showToast(`Color reset for ${userName}.`);
    }

    return (
        <ModalRoot {...modalProps} size={ModalSize.SMALL}>
            <ModalHeader separator={false}>
                <Forms.FormTitle tag="h4">Set Color — {userName}</Forms.FormTitle>
            </ModalHeader>
            <ModalContent>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "16px 0" }}>
                    <input
                        type="color"
                        value={color}
                        onChange={e => setColor(e.target.value)}
                        style={{ width: "100%", height: "48px", border: "none", borderRadius: "4px", cursor: "pointer", background: "transparent" }}
                    />
                    <Forms.FormText style={{ fontFamily: "monospace" }}>{color.toUpperCase()}</Forms.FormText>
                </div>
            </ModalContent>
            <ModalFooter>
                <Button onClick={handleSave}>Save</Button>
                <Button color={Button.Colors.RED} look={Button.Looks.OUTLINED} onClick={handleReset}>Reset</Button>
                <Button color={Button.Colors.TRANSPARENT} look={Button.Looks.LINK} onClick={modalProps.onClose}>Cancel</Button>
            </ModalFooter>
        </ModalRoot>
    );
}

const userContextPatch: NavContextMenuPatchCallback = (children, { user }) => {
    if (!user?.id) return;

    children.push(
        <Menu.MenuSeparator />,
        <Menu.MenuItem
            id="vc-user-color"
            label="Set User Color"
            action={() => openModal(modalProps => (
                <ColorPickerModal userId={user.id} userName={user.username} modalProps={modalProps} />
            ))}
        />
    );
};

export default definePlugin({
    name: "UserColor",
    description: "Assign a custom color to any user via their right-click context menu, overriding role colors. Colors persist across sessions.",
    authors: [{ name: "Vencipher", id: 1234567890123456789n }],

    async start() {
        checkForUpdates();

        userColors = (await DataStore.get<Record<string, string>>(DATA_KEY)) ?? {};

        startObserver();
        scanAll();

        addContextMenuPatch("user-context", userContextPatch);
        addContextMenuPatch("user-profile-actions", userContextPatch);
    },

    stop() {
        stopObserver();
        removeContextMenuPatch("user-context", userContextPatch);
        removeContextMenuPatch("user-profile-actions", userContextPatch);
    }
});
