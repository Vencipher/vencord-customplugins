import { ApplicationCommandInputType, ApplicationCommandOptionType, Argument, CommandContext, sendBotMessage } from "@api/Commands";
import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { Flex } from "@components/Flex";
import { OpenExternalIcon } from "@components/Icons";
import { insertTextIntoChatInputBox, sendMessage } from "@utils/discord";
import { Margins } from "@utils/margins";
import definePlugin, { OptionType, PluginNative } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { Button, DraftType, Forms, Menu, PermissionsBits, PermissionStore, React, Select, SelectedChannelStore, showToast, Switch, TextInput, UploadManager, useEffect, useState } from "@webpack/common";

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

declare const VencordNative: any;
const Native = VencordNative.pluginHelpers.BigFileUpload as PluginNative<typeof import("./native")>;

const UploadStore = findByPropsLazy("getUploads");
const OptionClasses = findByPropsLazy("optionName", "optionIcon", "optionLabel");

function createCloneableStore(initialState: any) {
    const store = { ...initialState };
    const listeners: (() => void)[] = [];
    function get() { return { ...store }; }
    function set(newState: Partial<typeof store>) { Object.assign(store, newState); listeners.forEach(listener => listener()); }
    function subscribe(listener: () => void) { listeners.push(listener); return () => { const index = listeners.indexOf(listener); if (index > -1) listeners.splice(index, 1); }; }
    return { get, set, subscribe };
}

function SettingsComponent(props: { setValue(v: any): void; }) {
    const [fileUploader, setFileUploader] = useState(settings.store.fileUploader || "GoFile");
    const [customUploaderStore] = useState(() => createCloneableStore({
        name: settings.store.customUploaderName || "",
        requestURL: settings.store.customUploaderRequestURL || "",
        fileFormName: settings.store.customUploaderFileFormName || "",
        responseType: settings.store.customUploaderResponseType || "",
        url: settings.store.customUploaderURL || "",
        thumbnailURL: settings.store.customUploaderThumbnailURL || "",
        headers: (() => { const h = JSON.parse(settings.store.customUploaderHeaders || "{}"); return Object.keys(h).length ? h : { "": "" }; })(),
        args: (() => { const a = JSON.parse(settings.store.customUploaderArgs || "{}"); return Object.keys(a).length ? a : { "": "" }; })(),
    }));

    const fileInputRef = React.useRef<HTMLInputElement>(null);

    useEffect(() => {
        return customUploaderStore.subscribe(() => {
            const state = customUploaderStore.get();
            Object.keys(state).forEach(k => {
                if (k === "headers") updateSetting("customUploaderHeaders", JSON.stringify(state.headers));
                else if (k === "args") updateSetting("customUploaderArgs", JSON.stringify(state.args));
                else updateSetting(k as any, (state as any)[k]);
            });
        });
    }, []);

    function updateSetting(key: keyof typeof settings.store, value: any) { (settings.store as any)[key] = value; }

    function handleShareXConfigUpload(event: React.ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e: ProgressEvent<FileReader>) => {
                try {
                    const config = JSON.parse(e.target?.result as string);
                    const newConfig = {
                        name: config.Name || "",
                        requestURL: config.RequestURL || "",
                        fileFormName: config.FileFormName || "",
                        responseType: config.ResponseType || "Text",
                        url: config.URL || "",
                        thumbnailURL: config.ThumbnailURL || "",
                        headers: config.Headers || { "": "" },
                        args: config.Arguments || { "": "" }
                    };
                    customUploaderStore.set(newConfig);
                    setFileUploader("Custom");
                    updateSetting("fileUploader", "Custom");
                    showToast("ShareX config imported successfully!");
                } catch (error) { showToast("Error importing ShareX config."); }
            };
            reader.readAsText(file);
            event.target.value = "";
        }
    }

    const handleArgChange = (oldKey: string, newKey: string, value: any) => {
        const args = { ...customUploaderStore.get().args };
        if (oldKey !== newKey) delete args[oldKey];
        if (newKey) args[newKey] = value;
        else if (!value) delete args[oldKey];
        if (Object.keys(args).every(k => k)) args[""] = "";
        customUploaderStore.set({ args });
    };

    const handleHeaderChange = (oldKey: string, newKey: string, value: string) => {
        const headers = { ...customUploaderStore.get().headers };
        if (oldKey !== newKey) delete headers[oldKey];
        if (newKey) headers[newKey] = value;
        else if (!value) delete headers[oldKey];
        if (Object.keys(headers).every(k => k)) headers[""] = "";
        customUploaderStore.set({ headers });
    };

    return (
        <Flex flexDirection="column">
            <Forms.FormDivider />
            <Forms.FormSection title="Upload Limit Bypass">
                <Forms.FormText className={Margins.bottom8}>Select external file uploader service.</Forms.FormText>
                <Select
                    options={[{ label: "Custom Uploader", value: "Custom" }, { label: "Catbox (200MB)", value: "Catbox" }, { label: "Litterbox (1GB)", value: "Litterbox" }, { label: "GoFile (Unlimited)", value: "GoFile" }]}
                    select={(v) => { setFileUploader(v); updateSetting("fileUploader", v); }}
                    isSelected={v => v === fileUploader}
                    serialize={v => v}
                />
            </Forms.FormSection>
            <Forms.FormSection>
                <Switch value={settings.store.autoSend === "Yes"} onChange={(v) => updateSetting("autoSend", v ? "Yes" : "No")} note="Automatically send links to chat.">Auto-Send Uploads</Switch>
            </Forms.FormSection>
            {fileUploader === "GoFile" && (
                <Forms.FormSection title="GoFile Token (optional)">
                    <TextInput value={settings.store.gofileToken || ""} placeholder="Token" onChange={v => updateSetting("gofileToken", v)} />
                </Forms.FormSection>
            )}
            {fileUploader === "Catbox" && (
                <Forms.FormSection title="Catbox User hash (optional)">
                    <TextInput value={settings.store.catboxUserHash || ""} placeholder="Hash" onChange={v => updateSetting("catboxUserHash", v)} />
                </Forms.FormSection>
            )}
            {fileUploader === "Litterbox" && (
                <Forms.FormSection title="File Expiration Time">
                    <Select options={[{ label: "1 hour", value: "1h" }, { label: "12 hours", value: "12h" }, { label: "24 hours", value: "24h" }, { label: "72 hours", value: "72h" }]} select={v => updateSetting("litterboxTime", v)} isSelected={v => v === settings.store.litterboxTime} serialize={v => v} />
                </Forms.FormSection>
            )}
            {fileUploader === "Custom" && (
                <>
                    <Forms.FormSection title="Custom Uploader Name"><TextInput value={customUploaderStore.get().name} onChange={v => customUploaderStore.set({ name: v })} /></Forms.FormSection>
                    <Forms.FormSection title="Request URL"><TextInput value={customUploaderStore.get().requestURL} onChange={v => customUploaderStore.set({ requestURL: v })} /></Forms.FormSection>
                    <Forms.FormSection title="File Form Name"><TextInput value={customUploaderStore.get().fileFormName} onChange={v => customUploaderStore.set({ fileFormName: v })} /></Forms.FormSection>
                    <Forms.FormSection title="Response type">
                        <Select options={[{ label: "Text", value: "Text" }, { label: "JSON", value: "JSON" }]} select={v => customUploaderStore.set({ responseType: v })} isSelected={v => v === customUploaderStore.get().responseType} serialize={v => v} />
                    </Forms.FormSection>
                    <Forms.FormSection title="URL (JSON path)"><TextInput value={customUploaderStore.get().url} onChange={v => customUploaderStore.set({ url: v })} /></Forms.FormSection>
                    <Forms.FormDivider />
                    <Forms.FormTitle>Arguments</Forms.FormTitle>
                    {Object.entries(customUploaderStore.get().args).map(([k, v], i) => (
                        <div key={i}><TextInput value={k} placeholder="Key" onChange={nk => handleArgChange(k, nk, v)} /><TextInput value={v as string} placeholder="Value" onChange={nv => handleArgChange(k, k, nv)} className={Margins.bottom16} /></div>
                    ))}
                    <Forms.FormDivider />
                    <Forms.FormTitle>Headers</Forms.FormTitle>
                    {Object.entries(customUploaderStore.get().headers).map(([k, v], i) => (
                        <div key={i}><TextInput value={k} placeholder="Key" onChange={nk => handleHeaderChange(k, nk, v)} /><TextInput value={v as string} placeholder="Value" onChange={nv => handleHeaderChange(k, k, nv)} className={Margins.bottom16} /></div>
                    ))}
                    <Button onClick={() => fileInputRef.current?.click()}>Import ShareX Config</Button>
                    <input ref={fileInputRef} type="file" accept=".sxcu" style={{ display: "none" }} onChange={handleShareXConfigUpload} />
                </>
            )}
        </Flex>
    );
}

const settings = definePluginSettings({
    fileUploader: { type: OptionType.SELECT, options: [{ label: "Custom", value: "Custom" }, { label: "Catbox", value: "Catbox", default: true }, { label: "Litterbox", value: "Litterbox" }, { label: "GoFile", value: "GoFile" }], description: "Uploader service", hidden: true },
    gofileToken: { type: OptionType.STRING, default: "", description: "GoFile Token", hidden: true },
    autoSend: { type: OptionType.SELECT, options: [{ label: "Yes", value: "Yes" }, { label: "No", value: "No", default: true }], description: "Auto-Send", hidden: true },
    catboxUserHash: { type: OptionType.STRING, default: "", description: "Catbox Hash", hidden: true },
    litterboxTime: { type: OptionType.SELECT, options: [{ label: "1h", value: "1h", default: true }, { label: "12h", value: "12h" }, { label: "24h", value: "24h" }, { label: "72h", value: "72h" }], description: "Litterbox Time", hidden: true },
    customUploaderName: { type: OptionType.STRING, default: "", description: "Custom Name", hidden: true },
    customUploaderRequestURL: { type: OptionType.STRING, default: "", description: "Custom URL", hidden: true },
    customUploaderFileFormName: { type: OptionType.STRING, default: "", description: "Custom Form Name", hidden: true },
    customUploaderResponseType: { type: OptionType.SELECT, options: [{ label: "Text", value: "Text", default: true }, { label: "JSON", value: "JSON" }], description: "Custom Response Type", hidden: true },
    customUploaderURL: { type: OptionType.STRING, default: "", description: "Custom JSON Path", hidden: true },
    customUploaderThumbnailURL: { type: OptionType.STRING, default: "", description: "Custom Thumb Path", hidden: true },
    customUploaderHeaders: { type: OptionType.STRING, default: "{}", description: "Custom Headers", hidden: true },
    customUploaderArgs: { type: OptionType.STRING, default: "{}", description: "Custom Args", hidden: true },
    customSettings: { type: OptionType.COMPONENT, component: SettingsComponent, description: "Settings UI", hidden: false },
}).withPrivateSettings<{ customUploaderArgs?: Record<string, string>; customUploaderHeaders?: Record<string, string>; }>();

function sendTextToChat(text: string) {
    if (settings.store.autoSend === "No") insertTextIntoChatInputBox(text);
    else sendMessage(SelectedChannelStore.getChannelId(), { content: text });
}

async function resolveFile(options: Argument[], ctx: CommandContext): Promise<File | null> {
    const opt = options.find(o => o.name === "file");
    return opt ? UploadStore.getUpload(ctx.channel.id, opt.name, DraftType.SlashCommand).item.file : null;
}

async function getFileArg(file: File): Promise<string | Uint8Array> {
    const filePath = (file as any).path as string | undefined;
    if (filePath) return filePath;
    return new Uint8Array(await file.arrayBuffer());
}

async function uploadFileToGofile(file: File, channelId: string) {
    try {
        const fileArg = await getFileArg(file);
        const uploadResult = await Native.uploadFileToGofileNative(fileArg, file.name, file.type, settings.store.gofileToken);

        if (uploadResult.status === "ok") {
            setTimeout(() => sendTextToChat(`${uploadResult.data.downloadPage} `), 10);
            UploadManager.clearAll(channelId, DraftType.SlashCommand);
        } else {
            throw new Error("Invalid GoFile status");
        }
    } catch (e) {
        sendBotMessage(channelId, { content: "Upload failed. Check console." });
    }
}

async function uploadFileToCatbox(file: File, channelId: string) {
    try {
        const fileArg = await getFileArg(file);
        const url = "https://catbox.moe/user/api.php";
        const result = await Native.uploadFileToCatboxNative(url, fileArg, file.name, file.type, settings.store.catboxUserHash);

        if (result.startsWith("http")) {
            setTimeout(() => sendTextToChat(`${result} `), 10);
            UploadManager.clearAll(channelId, DraftType.SlashCommand);
        } else throw new Error(result);
    } catch (e) {
        sendBotMessage(channelId, { content: "Upload failed. Check console." });
    }
}

async function uploadFileToLitterbox(file: File, channelId: string) {
    try {
        const fileArg = await getFileArg(file);
        const url = "https://litterbox.catbox.moe/resources/internals/api.php";
        const result = await Native.uploadFileToLitterboxNative(url, fileArg, file.name, file.type, settings.store.litterboxTime ?? "1h");

        if (result.startsWith("http")) {
            setTimeout(() => sendTextToChat(`${result} `), 10);
            UploadManager.clearAll(channelId, DraftType.SlashCommand);
        } else throw new Error(result);
    } catch (e) {
        sendBotMessage(channelId, { content: "Upload failed. Check console." });
    }
}

async function uploadFileCustom(file: File, channelId: string) {
    try {
        const fileArg = await getFileArg(file);
        const s = settings.store;
        const args = JSON.parse(s.customUploaderArgs || "{}");
        const headers = JSON.parse(s.customUploaderHeaders || "{}");
        const path = s.customUploaderURL ? s.customUploaderURL.split(".") : [];

        const result = await Native.uploadFileToCustomNative(s.customUploaderRequestURL, fileArg, file.name, file.type, s.customUploaderFileFormName || "file", s.customUploaderResponseType, headers, args, path);

        if (result.startsWith("http")) {
            setTimeout(() => sendTextToChat(`${result} `), 10);
            UploadManager.clearAll(channelId, DraftType.SlashCommand);
        } else throw new Error("Invalid URL");
    } catch (e) {
        sendBotMessage(channelId, { content: "Upload failed. Check console." });
    }
}

async function uploadFile(file: File, channelId: string) {
    const uploader = settings.store.fileUploader;
    if (uploader === "GoFile") await uploadFileToGofile(file, channelId);
    else if (uploader === "Catbox") await uploadFileToCatbox(file, channelId);
    else if (uploader === "Litterbox") await uploadFileToLitterbox(file, channelId);
    else if (uploader === "Custom") await uploadFileCustom(file, channelId);
}

function triggerFileUpload() {
    const i = document.createElement("input");
    i.type = "file";
    i.style.display = "none";
    i.onchange = async e => {
        const f = (e.target as HTMLInputElement).files?.[0];
        if (f) await uploadFile(f, SelectedChannelStore.getChannelId());
        i.remove();
    };
    document.body.appendChild(i);
    i.click();
}

const ctxMenuPatch: NavContextMenuPatchCallback = (children, props) => {
    if (props.channel.guild_id && !PermissionStore.can(PermissionsBits.SEND_MESSAGES, props.channel)) return;
    children.splice(1, 0,
        <Menu.MenuItem id="upload-big-file" label={<div className={OptionClasses.optionLabel}><OpenExternalIcon className={OptionClasses.optionIcon} height={24} width={24} /><div className={OptionClasses.optionName}>Upload a Big File</div></div>} action={triggerFileUpload} />
    );
};

export default definePlugin({
    name: "BigFileUpload",
    description: "Upload large files via external services.",
    authors: [{ name: "Vencipher", id: 1234567890123456789n }],
    settings,
    dependencies: ["CommandsAPI"],
    contextMenus: { "channel-attach": ctxMenuPatch },
    start() {
        checkForUpdates();
    },
    commands: [{
        inputType: ApplicationCommandInputType.BUILT_IN,
        name: "fileupload",
        description: "Upload a file",
        options: [{ name: "file", description: "File", type: ApplicationCommandOptionType.ATTACHMENT, required: true }],
        execute: async (opts, ctx) => {
            const f = await resolveFile(opts, ctx);
            if (f) await uploadFile(f, ctx.channel.id);
            else sendBotMessage(ctx.channel.id, { content: "No file!" });
        }
    }]
});