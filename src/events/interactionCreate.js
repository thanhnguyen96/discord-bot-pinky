const { PermissionsBitField } = require("discord.js");
const databaseService = require('../databaseService');
const geminiService = require('../geminiService'); // For resetChatSession

const MAX_FETCH_LIMIT = 100;

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client, sharedStates) { // sharedStates for enabledChatBot, freeChatChannels
        if (!interaction.isChatInputCommand()) return;

        const { commandName } = interaction;
        // The 'client' parameter is passed from index.js but interaction.client can also be used.
        // For consistency, we can pass it to handlers if they need it, or they can use interaction.client.

        switch (commandName) {
            case "toggle_chatbot":
                await handleToggleChatbot(interaction, sharedStates);
                break;
            case "toggle_free_chat":
                await handleToggleFreeChat(interaction, sharedStates);
                break;
            case "reset_chat":
                await handleResetChat(interaction);
                break;
            case "remember":
                await handleRemember(interaction);
                break;
            case "clear":
                await handleClear(interaction);
                break;
            default:
                console.log(`[interactionCreate] Unhandled command: ${commandName}`);
                await interaction.reply({ content: "Sorry, I don't know how to handle that command.", ephemeral: true });
        }
    },
};

async function handleToggleChatbot(interaction, sharedStates) {
    const channelId = interaction.channelId;
    let isNowChatbotEnabled;

    if (!sharedStates.chatbotEnabledChannels.has(channelId)) {
        sharedStates.chatbotEnabledChannels.add(channelId);
        isNowChatbotEnabled = true;
    } else {
        sharedStates.chatbotEnabledChannels.delete(channelId);
        isNowChatbotEnabled = false;
    }
    try {
        const currentDbSettings = await databaseService.getChannelSetting(channelId);
        const newSettings = { ...(currentDbSettings?.settings || {}), isChatbotEnabled: isNowChatbotEnabled };

        await databaseService.upsertChannelSetting(channelId, newSettings);
        await interaction.reply(`Chatbot is now ${isNowChatbotEnabled ? "ENABLED" : "DISABLED"} for this channel. Settings saved.`);
    } catch (dbError) {
        console.error("Error saving chatbot_enabled setting to DB:", dbError);
        await interaction.reply(`Chatbot is now ${isNowChatbotEnabled ? "ENABLED" : "DISABLED"} for this channel. (Failed to save setting to DB)`);
    }
}

async function handleToggleFreeChat(interaction, sharedStates) {
    const channelId = interaction.channelId;
    let isNowFreeChat;
    if (!sharedStates.freeChatChannels.has(channelId)) {
        sharedStates.freeChatChannels.add(channelId);
        isNowFreeChat = true;
    } else {
        sharedStates.freeChatChannels.delete(channelId);
        isNowFreeChat = false;
    }

    try {
        // Fetch current settings to merge, or simplify if only isFreeChat is stored
        const currentDbSettings = await databaseService.getChannelSetting(channelId);
        const newSettings = { ...(currentDbSettings?.settings || {}), isFreeChat: isNowFreeChat };

        await databaseService.upsertChannelSetting(channelId, newSettings);
        await interaction.reply(`Free chat is now ${isNowFreeChat ? "ENABLED" : "DISABLED"} for this channel. Settings saved.`);
    } catch (dbError) {
        console.error("Error saving free_chat setting to DB:", dbError);
        await interaction.reply(`Free chat is now ${isNowFreeChat ? "ENABLED" : "DISABLED"} for this channel. (Failed to save setting to DB)`);
    }
}

async function handleResetChat(interaction) {
    geminiService.resetChatSession(interaction.channelId);
    await databaseService.clearChatHistory(interaction.channelId);
    console.log(`[${interaction.channelId}] Cleared DB history and active session on reset command.`);
    await interaction.reply({ content: "Chat session for this channel has been reset, and all associated chat history from the database for this channel has been cleared.", ephemeral: true });
}

async function handleClear(interaction) {
    if (!interaction.guild) {
        await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
        return;
    }
    if (!interaction.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        await interaction.reply({ content: "I don't have permission to manage messages in this channel.", ephemeral: true });
        return;
    }
    try {
        await interaction.deferReply({ ephemeral: true });
        const fetched = await interaction.channel.messages.fetch({ limit: 99 });
        const messagesToDelete = fetched.filter(msg => !msg.pinned);

        if (messagesToDelete.size === 0) {
            await interaction.editReply({ content: "No messages found to clear (or all recent messages are pinned)." });
            return;
        }

        await interaction.channel.bulkDelete(messagesToDelete, true);
        await interaction.editReply({ content: `Successfully cleared ${messagesToDelete.size} messages.` });
    } catch (error) {
        console.error("Error clearing messages:", error);
        await interaction.editReply({ content: "Failed to clear messages. Make sure I have the 'Manage Messages' permission." });
    }
}

async function handleRemember(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const countOption = interaction.options.getInteger('count');
    if (countOption <= 0) {
        await interaction.editReply("Please provide a positive number of messages to remember.");
        return;
    }

    const actualFetchCount = Math.min(countOption, MAX_FETCH_LIMIT);

    try {
        const fetchedMessages = await interaction.channel.messages.fetch({ limit: actualFetchCount });

        if (fetchedMessages.size === 0) {
            await interaction.editReply("No messages found to remember in this channel.");
            return;
        }

        const sortedMessages = Array.from(fetchedMessages.values()).reverse();

        let savedCount = 0;
        let attemptedCount = 0;

        for (const message of sortedMessages) {
            if ((!message.content || message.content.trim() === "") && message.embeds.length === 0 && message.attachments.size === 0) {
                continue;
            }
            attemptedCount++;

            const result = await databaseService.addChatMessage(message.channelId, message.author.id, message.content, message.id, message.createdAt);
            if (result) { 
                savedCount++;
            }
        }

        geminiService.resetChatSession(interaction.channelId);

        let replyMessage = `Fetched ${fetchedMessages.size} message(s). `;
        if (countOption > MAX_FETCH_LIMIT) {
            replyMessage += `(You requested ${countOption}, but I can fetch a maximum of ${MAX_FETCH_LIMIT} at a time). `;
        }
        replyMessage += `Attempted to save ${attemptedCount} non-empty message(s), successfully saved ${savedCount} new message(s) to history. My memory for this channel has been refreshed.`;

        await interaction.editReply(replyMessage);

    } catch (error) {
        console.error('Error processing /remember command:', error);
        await interaction.editReply('Sorry, I encountered an error while trying to remember messages.');
    }
}