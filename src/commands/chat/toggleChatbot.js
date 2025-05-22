const databaseService = require('../../databaseService');

module.exports = {
    name: 'toggle_chatbot',
    async execute(interaction, client, sharedStates) {
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
            console.error(`[${interaction.channelId}] Error saving chatbot_enabled setting to DB:`, dbError);
            await interaction.reply(`Chatbot is now ${isNowChatbotEnabled ? "ENABLED" : "DISABLED"} for this channel. (Failed to save setting to DB)`);
        }
    }
};