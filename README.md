# vencord-customplugins

A personal collection of custom userplugins developed for the Vencord Discord client. 

## Included Plugins
* **BigFileUpload:** Bypass standard upload limits by routing large files through external services (Catbox, Litterbox, GoFile, or Custom).
* **EncryptedText:** End-to-end encryption for Discord messages. Uses AES-GCM to ensure only users with the matching preset key can read your messages.
* **FakeDeafen:** Visually fake your server mute/deafen status to other users while remaining able to hear and speak.

## ⚠️ Disclaimer & Terms of Service
**Use at your own risk.** 
Client modifications technically violate Discord's Terms of Service. While Vencord strives to be safe, I am not responsible for any account suspensions, bans, data loss, or other consequences that may occur from installing or using these plugins. 

## Installation
1. Clone the official [Vencord repository](https://github.com/Vendicated/Vencord).
2. Download the plugin files from this repository.
3. Place the plugin files into your Vencord `src/userplugins` directory.
4. Run `pnpm build` to compile the client with the custom plugins included.

## License
These plugins are released under the [GNU General Public License v3.0](https://www.gnu.org/licenses/gpl-3.0.html), matching Vencord's open-source license.
