# vencord-customplugins

A personal collection of custom userplugins developed for the Vencord Discord client. 

## Included Plugins

> [!NOTE]
> Check out the [patch notes](PATCHNOTES.MD) for more in depth information about each plugin

* **BigFileUpload:** Bypass standard upload limits by routing large files through external services (Catbox, Litterbox, GoFile, or Custom).
* **EncryptedText:** End-to-end encryption for Discord messages. Uses AES-GCM to ensure only users with the matching preset key can read your messages.
* **FakeDeafen:** Visually fake your server mute/deafen status to other users while remaining able to hear and speak.
* **UserColors:** Change the colors of any user in any chat to whatever you want. It overrides role colors.
* **InvisibleDetector:** Detects invisible users and displays a visible sign next to their username.

## 🚀 Installation & Updating
This repository uses a completely automated batch script to handle installing, updating, and injecting the plugins into your client.

1. Download the `updater.bat` file from this repository.
2. Place it anywhere on your PC and double-click to run it.
3. **On the first run:** The script will ask you to enter the path to your Vencord installation folder (e.g., `C:\Users\YourName\Documents\Vencord`). It will save this location for future use.
4. The script will automatically close Discord, download the latest plugin files, update dependencies, and rebuild Vencord for you!

**To update in the future:** The plugins will notify you inside Discord when a new update is available. Simply run the `updater.bat` script again, and it will handle the rest.

## ⚠️ Disclaimer & Terms of Service
**Use at your own risk.** 
Client modifications technically violate Discord's Terms of Service. While Vencord strives to be safe, I am not responsible for any account suspensions, bans, data loss, or other consequences that may occur from installing or using these plugins. 

## License
These plugins are released under the [GNU General Public License v3.0](https://www.gnu.org/licenses/gpl-3.0.html), matching Vencord's open-source license.
