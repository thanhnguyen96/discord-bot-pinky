const { PermissionsBitField } = require("discord.js");
const databaseService = require('../databaseService');
const geminiService = require('../geminiService'); // For resetChatSession
const prisma = require('../prismaClient'); // For direct prisma access if needed

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
        const currentDbSettings = await prisma.channelSettings.findUnique({ where: { channelId } });
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
        const currentDbSettings = await prisma.channelSettings.findUnique({ where: { channelId } });
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
            case "clear":
                await handleClear(interaction);
                break;
            default:
                console.log(`[interactionCreate] Unhandled command: ${commandName}`);
                await interaction.reply({ content: "Sorry, I don't know how to handle that command.", ephemeral: true });
        }
    },
};