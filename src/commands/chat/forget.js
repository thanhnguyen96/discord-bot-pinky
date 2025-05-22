const databaseService = require('../../databaseService');
const geminiService = require('../../geminiService');

module.exports = {
    name: 'forget',
    async execute(interaction, client, sharedStates) {
        geminiService.resetChatSession(interaction.channelId);
        await databaseService.clearChatHistory(interaction.channelId);
        console.log(`[${interaction.channelId}] Cleared DB history and active session on forget command.`);
        await interaction.reply({ content: "Chat session for this channel has been reset, and all associated chat history from the database for this channel has been cleared.", ephemeral: true });
    }
};