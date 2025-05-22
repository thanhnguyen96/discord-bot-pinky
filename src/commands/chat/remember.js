const databaseService = require('../../databaseService');
const geminiService = require('../../geminiService');

const MAX_FETCH_LIMIT = 100;

module.exports = {
    name: 'remember',
    async execute(interaction, client, sharedStates) {
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

            const sortedMessages = Array.from(fetchedMessages.values()).reverse(); // Oldest first

            let savedCount = 0;
            let attemptedCount = 0;

            for (const message of sortedMessages) {
                if ((!message.content || message.content.trim() === "") && message.embeds.length === 0 && message.attachments.size === 0) {
                    continue; // Skip empty messages
                }
                attemptedCount++;
                // Assuming addChatMessage handles duplicates or updates appropriately, or simply adds.
                const result = await databaseService.addChatMessage(message.channelId, message.author.id, message.content, message.id, message.createdAt);
                if (result) { // Assuming addChatMessage returns a truthy value on success/new insert
                    savedCount++;
                }
            }

            geminiService.resetChatSession(interaction.channelId); // Refresh Gemini's context with newly added messages

            let replyMessage = `Fetched ${fetchedMessages.size} message(s). `;
            if (countOption > MAX_FETCH_LIMIT) {
                replyMessage += `(You requested ${countOption}, but I can fetch a maximum of ${MAX_FETCH_LIMIT} at a time). `;
            }
            replyMessage += `Attempted to save ${attemptedCount} non-empty message(s), successfully saved ${savedCount} new message(s) to history. My memory for this channel has been refreshed.`;

            await interaction.editReply(replyMessage);

        } catch (error) {
            console.error(`[${interaction.channelId}] Error processing /remember command:`, error);
            await interaction.editReply('Sorry, I encountered an error while trying to remember messages.');
        }
    }
};