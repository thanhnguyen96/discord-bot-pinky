const databaseService = require('../databaseService');
const { registerSlashCommands } = require('../commandManager');

module.exports = {
    name: 'ready',
    once: true,
    async execute(readyClient, _clientFromIndex, actualSharedStates) { // sharedStates can hold freeChatChannels, enabledChatBot
        console.log(`Ready! Logged in as ${readyClient.user.tag}`);
        console.log(`Chatbot is initially ${actualSharedStates.enabledChatBot ? "enabled" : "disabled"}.`);

        try {
            const allSettings = await databaseService.loadChannelSettings();
            allSettings.forEach(setting => {
                if (setting.settings && typeof setting.settings === 'object' && setting.settings.isFreeChat === true) {
                    actualSharedStates.freeChatChannels.add(setting.channelId);
                }
            });
            console.log(`Loaded ${actualSharedStates.freeChatChannels.size} free chat channel settings from the database.`);
        } catch (error) {
            console.error("Error loading channel settings from database:", error);
        }
        await registerSlashCommands();
    },
};