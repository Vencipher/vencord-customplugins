/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as fs from "fs";

async function resolveBuffer(filePath: string | Buffer | Uint8Array): Promise<Buffer> {
    return typeof filePath === "string" ? fs.promises.readFile(filePath) : Buffer.from(filePath);
}

export async function uploadFileToGofileNative(_: any, filePath: string | Buffer | Uint8Array, fileName: string, fileType: string, token?: string): Promise<any> {
    try {
        const fileBuffer = await resolveBuffer(filePath);
        const formData = new FormData();
        const blob = new Blob([fileBuffer], { type: fileType });
        formData.append("file", new File([blob], fileName));
        if (token) formData.append("token", token);

        const response = await fetch("https://upload.gofile.io/uploadFile", { method: "POST", body: formData });
        return await response.json();
    } catch (error) {
        console.error("Gofile Upload Error:", error);
        throw error;
    }
}

export async function uploadFileToCatboxNative(_: any, url: string, filePath: string | Buffer | Uint8Array, fileName: string, fileType: string, userHash: string): Promise<string> {
    try {
        const fileBuffer = await resolveBuffer(filePath);
        const formData = new FormData();
        formData.append("reqtype", "fileupload");
        const blob = new Blob([fileBuffer], { type: fileType });
        formData.append("fileToUpload", new File([blob], fileName));
        if (userHash) formData.append("userhash", userHash);

        const response = await fetch(url, { method: "POST", body: formData });
        return await response.text();
    } catch (error) {
        console.error("Catbox Upload Error:", error);
        throw error;
    }
}

export async function uploadFileToLitterboxNative(_: any, url: string, filePath: string | Buffer | Uint8Array, fileName: string, fileType: string, time: string): Promise<string> {
    try {
        const fileBuffer = await resolveBuffer(filePath);
        const formData = new FormData();
        formData.append("reqtype", "fileupload");
        const blob = new Blob([fileBuffer], { type: fileType });
        formData.append("fileToUpload", new File([blob], fileName));
        formData.append("time", time);

        const response = await fetch(url, { method: "POST", body: formData });
        return await response.text();
    } catch (error) {
        console.error("Litterbox Upload Error:", error);
        throw error;
    }
}

export async function uploadFileToCustomNative(_: any, requestURL: string, filePath: string | Buffer | Uint8Array, fileName: string, fileType: string, fileFormName: string, responseType: string, customHeaders: Record<string, string>, customArgs: Record<string, string>, urlPath: string[]): Promise<string> {
    try {
        const fileBuffer = await resolveBuffer(filePath);
        const formData = new FormData();
        const blob = new Blob([fileBuffer], { type: fileType });
        formData.append(fileFormName, new File([blob], fileName));

        for (const [key, value] of Object.entries(customArgs)) {
            formData.append(key, value);
        }

        const headers = new Headers(customHeaders);
        const response = await fetch(requestURL, { method: "POST", body: formData, headers });

        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

        let result = responseType === "JSON" ? await response.json() : await response.text();

        if (responseType === "JSON") {
            if (urlPath.length === 0) throw new Error("JSON URL path is not configured.");
            let current = result;
            for (const key of urlPath) {
                if (current[key] === undefined) throw new Error(`Invalid URL path: ${urlPath.join(".")}`);
                current = current[key];
            }
            return current;
        }
        return result.trim();
    } catch (error) {
        console.error("Custom Upload Error:", error);
        throw error;
    }
}