const databaseService = require('../../databaseService');

module.exports = {
    name: 'toggle_free_chat',
    async execute(interaction, client, sharedStates) {
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
            const currentDbSettings = await databaseService.getChannelSetting(channelId);
            const newSettings = { ...(currentDbSettings?.settings || {}), isFreeChat: isNowFreeChat };

            await databaseService.upsertChannelSetting(channelId, newSettings);
            await interaction.reply(`Free chat is now ${isNowFreeChat ? "ENABLED" : "DISABLED"} for this channel. Settings saved.`);
        } catch (dbError) {
            console.error(`[${interaction.channelId}] Error saving free_chat setting to DB:`, dbError);
            await interaction.reply(`Free chat is now ${isNowFreeChat ? "ENABLED" : "DISABLED"} for this channel. (Failed to save setting to DB)`);
        }
    }
};