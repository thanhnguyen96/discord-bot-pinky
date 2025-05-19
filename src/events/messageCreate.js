const databaseService = require('../databaseService');
const geminiService = require('../geminiService');

module.exports = {
    name: 'messageCreate',
    async execute(message, client, sharedStates) { // sharedStates for enabledChatBot, freeChatChannels
        if (message.author.bot) return;

        const isFreeChatChannel = sharedStates.freeChatChannels.has(message.channelId);
        const isMentioned = message.mentions.users.has(client.user.id);

        if (sharedStates.enabledChatBot && (isFreeChatChannel || isMentioned)) {
            let prompt = message.content;
            if (isMentioned && !isFreeChatChannel) {
                prompt = message.content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
            } else {
                prompt = message.content.trim();
            }

            if (!prompt && isMentioned && !isFreeChatChannel) {
                message.reply("You mentioned me! What can I help you with today?");
                return;
            }
            if (!prompt && !isMentioned && isFreeChatChannel) {
                return;
            }

            try {
                await databaseService.addChatMessage(message.channel.id, message.author.id, prompt, message.id, message.createdAt);
                await message.channel.sendTyping();

                const geminiFormattedPrompt = `${message.author.id}|${prompt}`;
                const geminiResponse = await geminiService.getGeminiChatResponse(message.channel.id, geminiFormattedPrompt, message.author.id, client.user.id);

                if (geminiResponse) {
                    let sentMessageForDBLogging;
                    const MAX_LENGTH = 2000;
                    if (geminiResponse.length <= MAX_LENGTH) {
                        sentMessageForDBLogging = await message.reply(geminiResponse);
                    } else {
                        const messageChunks = [];
                        for (let i = 0; i < geminiResponse.length; i += MAX_LENGTH) {
                            messageChunks.push(geminiResponse.substring(i, i + MAX_LENGTH));
                        }
                        for (let i = 0; i < messageChunks.length; i++) {
                            const chunk = messageChunks[i];
                            const sentChunkMessage = await message.channel.send(chunk);
                            if (i === 0) {
                                sentMessageForDBLogging = sentChunkMessage;
                            }
                        }
                    }
                    if (sentMessageForDBLogging) {
                        await databaseService.addChatMessage(message.channel.id, client.user.id, geminiResponse, sentMessageForDBLogging.id, sentMessageForDBLogging.createdAt);
                    } else {
                        console.warn(`[${message.channel.id}] Could not get a sent message reference for DB logging of bot response. Logging with synthetic ID and current time.`);
                        await databaseService.addChatMessage(message.channel.id, client.user.id, geminiResponse, `synthetic_bot_${Date.now()}`, new Date());
                    }
                } else {
                    await message.reply("I received an empty or no response from the AI. Please try again.");
                }
            } catch (error) {
                console.error("Error processing Gemini response or sending message:", error);
                await message.reply("Sorry, something went wrong while I was thinking.");
            }
        }
    },
};