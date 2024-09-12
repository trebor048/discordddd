/**
 * @name SendWebhooksViaChat
 * @version 2.2.0
 * @description Sends webhook messages via Discord chat.
 * @author bottom_text | Z-Team
 * @source https://github.com/bottomtext228/BetterDiscord-Plugins/tree/main/Plugins/SendWebhooksViaChat
 * @updateUrl https://raw.githubusercontent.com/bottomtext228/BetterDiscord-Plugins/main/Plugins/SendWebhooksViaChat/SendWebhooksViaChat.plugin.js
*/


module.exports = class SendWebhooksViaChat {
    constructor(meta) {
        for (let key in meta) {
            this[key] = meta[key];
        }
    }


    start() {


        this.findWebpacks();

        this.loadSettings();


        // get webhooks data
        this.settings.webhooks.forEach(async webhook => {
            if (!webhook.url) {
                return;
            }
            const data = await this.fetchWebhookData(webhook.url);

            if (!data) {
                BdApi.UI.showToast('Error while getting webhook data!', { type: 'danger' });
                return;
            }

            if (data.code == 50027) { // if no webhook found
                // delete webhook
                this.deleteWebhook(webhook);
                BdApi.UI.showToast('Webhook was not found! It will be deleted.', { type: 'warning' });
                return;
            }

            webhook.default_username = data.name;
            webhook.default_avatar_url = data.avatar ? `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.webp?size=128` : this.avatarUtils.getDefaultAvatarURL();
            webhook.channel_id = data.channel_id;
            webhook.guild_id = data.guild_id;
        });


        // patch message actions
        BdApi.Patcher.instead(
            this.name,
            this.messageUtils,
            'sendMessage',
            (_, args, original) => {
                const message = args[1].content;
                const parsingResult = this.parseMessageForWebhook(message);
                if (parsingResult) {
                    const { webhook, messageToSend } = parsingResult;

                    this.makeWebhookRequest(webhook.url, {
                        body: JSON.stringify({
                            content: messageToSend,
                            username: webhook.username ? webhook.username : undefined,
                            avatar_url: webhook.avatar_url ? webhook.avatar_url : undefined
                        }),
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        method: 'POST'
                    }, 'sended');

                    return; // prevent sending the message
                }

                original(...args);

            }
        );

        // patch uploading files when sending message
        BdApi.Patcher.instead(
            this.name,
            BdApi.Webpack.getByKeys('uploadFiles'),
            'uploadFiles',
            async (_, args, original) => {

                const message = args[0].parsedMessage.content;
                const parsingResult = this.parseMessageForWebhook(message);

                if (parsingResult) {

                    const { webhook, messageToSend } = parsingResult;

                    // this hand-maded multipart/form-data request just works, ok?
                    const formBoundary = this.generateFormBoundary();

                    const uploads = args[0].uploads;

                    const encoder = new TextEncoder();

                    let requestString =
                        `--${formBoundary}\r\nContent-Disposition: form-data; name="payload_json"\r\n\r\n${JSON.stringify({
                            content: messageToSend,
                            username: webhook.username ? webhook.username : undefined,
                            avatar_url: webhook.avatar_url ? webhook.avatar_url : undefined
                        })}`

                    let data = encoder.encode(requestString);


                    for (let uploadIterator in uploads) { // add all files to the request

                        const upload = uploads[uploadIterator];

                        const file = upload.item.file;

                        let fileArray = new Uint8Array(await file.arrayBuffer());


                        let fileDisposition = encoder.encode(
                            `Content-Disposition: form-data; name="file[${uploadIterator}]"; filename="${upload.spoiler ? `SPOILER_` : ''}${upload.filename}"\r\nContent-Type: ${upload.mimeType}\r\n\r\n`);

                        data = this.concatTypedArrays(data, encoder.encode(`\r\n--${formBoundary}\r\n`), fileDisposition, fileArray);
                    }

                    data = this.concatTypedArrays(data, encoder.encode(`\r\n--${formBoundary}--`));

                    this.makeWebhookRequest(webhook.url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': `multipart/form-data; boundary=${formBoundary}`
                        },
                        timeout: 60e3,
                        body: data
                    }, 'sended');

                } else {

                    return original(...args);
                }

            }
        );

        this.lastEditedWebhookMessage = {};

        // patch editing message
        BdApi.Patcher.instead(this.name, this.messageUtils, 'editMessage', (_, args, original) => {
            const [channelId, messageId, content] = args;
            if (this.lastEditedWebhookMessage.id == messageId) {
                const webhook = this.settings.webhooks.find(webhook => webhook.url.match(/webhooks\/(\d+)/)?.[1] == this.lastEditedWebhookMessage.webhookId);
                if (webhook) {
                    this.makeWebhookRequest(`${webhook.url}/messages/${messageId}`, {
                        method: 'PATCH',
                        body: JSON.stringify(content),
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    }, 'edited');
                }
            } else {
                original(...args);
            }

        });

        this.unpatches = [];
        this.unpatches.push(BdApi.ContextMenu.patch('message', (ret, props) => this.onMessageContextMenu(props, ret)));
    }
    // right click on message
    onMessageContextMenu(props, ret) {
        if (props.message && props.channel && props.message.webhookId) {
            const webhook = this.settings.webhooks.find(webhook => webhook.url.match(/webhooks\/(\d+)/)?.[1] == props.message.webhookId);
            if (webhook) {


                const editChild = {
                    label: 'Edit Webhook message',
                    icon: _ => BdApi.React.createElement('svg',
                        {
                            class: this.contextMenuClassess.icon,
                            width: "24",
                            height: "24",
                            "area-hidden": "true",
                            role: "img",
                            viewBox: "0 0 24 24"
                        },
                        BdApi.React.createElement('path',
                            {
                                "fill-rule": "evenodd",
                                "clip-rule": "evenodd",
                                fill: "currentColor",
                                d: "M19.2929 9.8299L19.9409 9.18278C21.353 7.77064 21.353 5.47197 19.9409 4.05892C18.5287 2.64678 16.2292 2.64678 14.817 4.05892L14.1699 4.70694L19.2929 9.8299ZM12.8962 5.97688L5.18469 13.6906L10.3085 18.813L18.0201 11.0992L12.8962 5.97688ZM4.11851 20.9704L8.75906 19.8112L4.18692 15.239L3.02678 19.8796C2.95028 20.1856 3.04028 20.5105 3.26349 20.7337C3.48669 20.9569 3.8116 21.046 4.11851 20.9704Z"
                            })

                    ),
                    id: `${this.name}EditPopUp`,
                    action: _ => {
                        this.lastEditedWebhookMessage = props.message;
                        this.messageUtils.startEditMessage(props.channel.id, props.message.id, props.message.content);
                    }
                }
                const deleteChild = {
                    label: 'Delete Webhook message',
                    icon: _ => BdApi.React.createElement('svg',
                        {
                            class: this.contextMenuClassess.icon,
                            width: "24",
                            height: "24",
                            "area-hidden": "true",
                            role: "img",
                            viewBox: "0 0 24 24"
                        },
                        [
                            BdApi.React.createElement('path',
                                {
                                    fill: "currentColor",
                                    d: "M15 3.999V2H9V3.999H3V5.999H21V3.999H15Z"
                                }
                            ),
                            BdApi.React.createElement('path',
                                {
                                    fill: "currentColor",
                                    d: "M5 6.99902V18.999C5 20.101 5.897 20.999 7 20.999H17C18.103 20.999 19 20.101 19 18.999V6.99902H5ZM11 17H9V11H11V17ZM15 17H13V11H15V17Z"
                                }
                            )]),
                    id: `${this.name}DeletePopUp`,
                    color: 'danger',
                    action: _ => {
                        this.makeWebhookRequest(`${webhook.url}/messages/${props.message.id}`, {
                            method: 'DELETE'
                        }, 'deleted');
                    }

                }

                ret.props.children.splice(ret.props.children.length - 1, 0, BdApi.ContextMenu.buildMenuChildren([{
                    type: "group",
                    items: [editChild, deleteChild]
                }]))
            }


        }
    }

    makeId(length) { // returns a string with random characters from the list
        let result = '';
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const charactersLength = characters.length;
        let counter = 0;
        while (counter < length) {
            result += characters.charAt(Math.floor(Math.random() * charactersLength));
            counter += 1;
        }
        return result;
    }

    generateFormBoundary() {
        return `----WebKitFormBoundary${this.makeId(16)}`;
    }

    concatTypedArrays(...arrays) { // all arrays are TypedArray of same type
        const length = arrays.reduce((accum, array) => accum + array.length, 0);
        var resultArray = new (arrays[0].constructor)(length);

        let currentLength = 0;
        for (const array of arrays) {
            resultArray.set(array, currentLength);
            currentLength += array.length;
        }
        return resultArray;
    }

    parseMessageForWebhook(message) {
        // extract command and messsage to send from the message content
        const match = message.match(/^\/([^ ]+)[ ]+(.+)+|^\/([^ ]+)/is); // `/command message` or `/command`
        if (match) {
            const command = match[1] || match[3];

            const webhook = this.settings.webhooks.find(e => e.command && e.command == command); // find webhook by command
            if (!webhook) return undefined;

            const messageToSend = match[2] ? this.prepareMessageToSend(match[2]) : '';

            return { webhook, messageToSend };
        }
        return undefined;
    }

    prepareMessageToSend(string) {
        // webhooks can't send unicode emoji, so we replace them with text (🐖 -> :pig2:)
        string = this.replaceEmojies(string);
        // ... more?
        return string;
    }

    replaceEmojies(string) {
        const regExp = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/g; // unicode emoji
        const match = string.match(regExp);
        if (match) {
            for (const emoji of match) {
                const emojiName = this.emojiUtils.convertSurrogateToName(emoji);
                if (emojiName != '::') { // if surrogate is invalid, just in check
                    string = string.replace(emoji, emojiName);
                }
            }
        }
        return string;
    }

    makeWebhookRequest(url, options, toastMessage) {
        BdApi.Net.fetch(url, options).then(response => {
            if (response.ok) {
                BdApi.UI.showToast(`Webhook message succefully ${toastMessage}!`, { type: 'success', timeout: 1000 });
            } else {
                response.text().then(error => {
                    BdApi.UI.showToast(`Error during webhook request!\nError: ${error}`, { type: 'error', timeout: 5000 });
                });
            }
        }).catch(error => {
            BdApi.UI.showToast(`Error during webhook request!\n${error.name}: ${error.message}`, { type: 'error', timeout: 5000 });
        });
    }

    getSettingsPanel() {
        // simple menu (kill me)

        const html = BdApi.DOM.parseHTML('<div></div>');

        const webhooksList = BdApi.DOM.parseHTML(`<div id="webhooks_list"></div>`);


        html.appendChild(this.createButton('Add new', () => {

            this.settings.webhooks.push({ url: '', command: '', avatar_url: '', username: '', default_avatar_url: this.avatarUtils.getDefaultAvatarURL(), default_username: 'None', guild_id: '', channel_id: '' });
            const webhook = this.settings.webhooks[this.settings.webhooks.length - 1];
            const webhookElement = this.renderWebhook(webhook);
            webhooksList.appendChild(webhookElement);


        }));
        this.settings.webhooks.forEach((webhook, index) => {
            const webhookElement = this.renderWebhook(webhook);
            webhooksList.appendChild(webhookElement);
        });

        html.appendChild(webhooksList);
        return html;
    }

    renderWebhook(webhook) {


        const guildName = this.guildStore.getGuild(webhook.guild_id)?.name ?? '';
        const channelName = this.channelStore.getChannel(webhook.channel_id)?.name ?? '';

        const popoutHTML =
            `<div>
            <div>
                <div style="display: flex; justify-content: left; margin-top: 10px; margin-bottom: 10px; align-items: center;">
                    <img style="height: 32px; width: 32px; border-radius: 50%;" src="${webhook.avatar_url ? webhook.avatar_url : webhook.default_avatar_url}" id="webhook_avatar_url">
                    <div style="margin-left: 10px;">
                        <span style="color: white" aria-expanded="false" role="button" tabindex="0" id="webhook_username">
                            ${webhook.username ? webhook.username : webhook.default_username}
                        </span>
                        <span style="color: grey" id="webhook_command">
                            ${webhook.command ? `/${webhook.command}` : ''}
                        </span>
                    </div>
                    <div style="position: absolute; right: 0">
                        <span style="color: var(--header-primary)" id="webhook_guild_id">
                            ${guildName}
                        </span>
                        <span style="color: var(--channels-default)" id="webhook_channel_id">
                            ${channelName ? `#${channelName}` : ''}
                        </span>
                    </div>
                </div>
            </div>
        </div>`;



        const webhookElement = BdApi.DOM.parseHTML(popoutHTML);

        // handle settings
        webhookElement.addEventListener('click', (e) => {


            const settingsHtml = BdApi.DOM.parseHTML('<div style="gap: 10px; display: grid"></div>');


            const createLabel = (label) => {
                return BdApi.DOM.parseHTML(`<h1 style="color:#dddddd">${label}: </h1>`);
            }
            settingsHtml.appendChild(createLabel('Webhook URL'));
            settingsHtml.appendChild(this.createInput('Webhook URL', 'input_webhook_url', webhook.url));
            settingsHtml.appendChild(createLabel('Command'));
            settingsHtml.appendChild(this.createInput('Command', 'input_webhook_command', webhook.command));
            settingsHtml.appendChild(createLabel('Username'));
            settingsHtml.appendChild(this.createInput('Username', 'input_webhook_username', webhook.username));
            settingsHtml.appendChild(createLabel('Avatar URL'));
            settingsHtml.appendChild(this.createInput('Avatar URL', 'input_webhook_avatar_url', webhook.avatar_url));



            BdApi.showConfirmationModal('Webhook settings', this.wrapElement(settingsHtml), {
                confirmText: 'Save',
                cancelText: 'Delete',
                onConfirm: async () => {
                    const newWebhook = {
                        url: document.getElementById('input_webhook_url').value.trim(),
                        command: document.getElementById('input_webhook_command').value.trim(),
                        username: document.getElementById('input_webhook_username').value.trim(),
                        avatar_url: document.getElementById('input_webhook_avatar_url').value.trim(),
                    }; // get inputs values


                    const data = await this.fetchWebhookData(newWebhook.url);

                    if (data && !data.code) {

                        Object.assign(webhook, newWebhook);

                        webhook.default_username = data.name;
                        webhook.default_avatar_url = data.avatar ? `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.webp?size=128` : this.avatarUtils.getDefaultAvatarURL();
                        webhook.channel_id = data.channel_id;
                        webhook.guild_id = data.guild_id;
                        const elements = Array.from(webhookElement.querySelectorAll('span, img'));

                        elements.find(e => e.id == 'webhook_username').innerText = webhook.username ? webhook.username : webhook.default_username;
                        elements.find(e => e.id == 'webhook_command').innerText = webhook.command ? '/' + webhook.command : '';
                        elements.find(e => e.id == 'webhook_avatar_url').src = webhook.avatar_url ? webhook.avatar_url : webhook.default_avatar_url;
                        elements.find(e => e.id == 'webhook_guild_id').innerText = this.guildStore.getGuild(webhook.guild_id)?.name ?? '';

                        const channelName = this.channelStore.getChannel(webhook.channel_id)?.name;
                        elements.find(e => e.id == 'webhook_channel_id').innerText = channelName ? `#${channelName}` : '';
                        BdApi.UI.showToast('Webhook saved!', { type: 'success' });
                        this.saveSettings();

                    } else {
                        BdApi.UI.showToast('Invalid URL or Webhook with this URL is not existed!', { type: "danger" });
                    }


                },
                onCancel: () => {
                    webhookElement.innerHTML = ''; // visually delete it
                    this.deleteWebhook(webhook);
                }
            });
        })

        return webhookElement;
    }

    async fetchWebhookData(url) {
        /* GET request on webhook url returns webhook data (name, avatar, channelId, etc) */
        if (url.match(/https{0,1}:\/\/discord\.com\/api\/webhooks\/\d+\/.+/i)) {
            try {
                const data = JSON.parse(await (await fetch(url)).text());
                return data;
            } catch (error) {
                console.error(`Webhook fetch error: ${error}`); // just for sure
            }
        }
    }

    deleteWebhook(webhook) {
        this.settings.webhooks.splice(this.settings.webhooks.indexOf(webhook), 1);
        this.saveSettings();
    }

    saveSettings() {
        BdApi.saveData(this.name, 'settings', this.settings);
    }

    loadSettings() {
        // note: settings cached by BdApi, so if you want to manipulate settings
        // by editing the config in manual you should restart discord
        try {
            this.settings = BdApi.loadData(this.name, 'settings');
            if (!this.settings || !Array.isArray(this.settings.webhooks)) { // load defaults
                this.settings = { webhooks: [] };
                this.saveSettings();
            };
        } catch (error) {
            require('fs').writeFileSync(require('path').join(BdApi.Plugins.folder, `${this.name}.config.json`),
                JSON.stringify({ settings: { webhooks: [] } })); // BdApi.save/loadData can't work with empty files
            this.settings = { webhooks: [] };
            this.saveSettings();
        }
    }

    wrapElement(element) {
        const wrap = (elements) => {
            const domWrapper = BdApi.DOM.parseHTML(`<div class="dom-wrapper"></div>`);
            for (let e = 0; e < elements.length; e++) domWrapper.appendChild(elements[e]);
            return domWrapper;
        }
        if (Array.isArray(element)) element = wrap(element);
        return BdApi.React.createElement(BdApi.ReactUtils.wrapElement(element));
    }

    createButton(label, callback, id) {
        const ret = BdApi.DOM.parseHTML(`<button type="button" class="${this.buttonConstansts.button} ${this.buttonConstansts.lookFilled} ${this.buttonConstansts.colorBrand} ${this.buttonConstansts.sizeSmall} ${this.buttonConstansts.grow}" ${(id ? 'id="' + id + '"' : '')}><div class="contents-3ca1mk">${label}</div></button>`);
        if (callback) {
            ret.addEventListener('click', callback);
        }
        return ret;
    }

    createInput(label, id, defaultValue, callback) {
        const ret = BdApi.DOM.parseHTML(
            `<div class="${this.inputConstants.container} ${this.inputConstants.medium}">
				<div class="${this.inputConstants.inner}">
					<input type="text" class="${this.inputConstants.input}" name="message" placeholder="${label}" id="${id}" value="${defaultValue}"/>
				</div>
			</div>`
        );
        if (callback) {
            ret.addEventListener('input', callback);
        }
        return ret;
    }

    findWebpacks() {
        this.messageUtils = BdApi.Webpack.getByKeys('sendMessage', 'editMessage');
        this.buttonConstansts = BdApi.Webpack.getByKeys('lookBlank');
        this.inputConstants = BdApi.Webpack.getByKeys('input', 'icon', 'close', 'pointer');
        this.emojiUtils = BdApi.Webpack.getByKeys('getByName');
        this.avatarUtils = BdApi.Webpack.getByKeys('getDefaultAvatarURL');
        this.contextMenuClassess = BdApi.Webpack.getByKeys('icon', 'separator', 'submenu');
        this.guildStore = BdApi.Webpack.getStore('GuildStore');
        this.channelStore = BdApi.Webpack.getStore('ChannelStore')
    }

    stop() {
        this.unpatches.forEach(unpatch => unpatch());
        BdApi.Patcher.unpatchAll(this.name);
    }

}
