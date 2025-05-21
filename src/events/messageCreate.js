const databaseService = require('../databaseService');
const geminiService = require('../geminiService');

module.exports = {
    name: 'messageCreate',
    async execute(message, client, sharedStates) { // sharedStates for enabledChatBot, freeChatChannels
        if (message.author.bot) return;
        const isChatbotEnabledInChannel = sharedStates.chatbotEnabledChannels.has(message.channelId);
        const isFreeChatChannel = sharedStates.freeChatChannels.has(message.channelId);
        const isMentioned = message.mentions.users.has(client.user.id);

        if (isChatbotEnabledInChannel && (isFreeChatChannel || isMentioned)) {
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
                const originalGeminiResponse = await geminiService.getGeminiChatResponse(message.channel.id, geminiFormattedPrompt, message.author.id, client.user.id);

                let responseToSend = originalGeminiResponse;
                let userMessageReacted = false;
                const reactPattern = /^<react:([^>]+)>/;
                if (originalGeminiResponse) {
                    const reactMatch = originalGeminiResponse.match(reactPattern);
                    if (reactMatch) {
                        const emojiToReact = reactMatch[1];
                        try {
                            await message.react(emojiToReact);
                            console.log(`[${message.channel.id}] Reacted to user message ${message.id} with ${emojiToReact}`);
                            userMessageReacted = true;
                        } catch (reactError) {
                            console.error(`[${message.channel.id}] Failed to react to user message ${message.id} with ${emojiToReact}:`, reactError);
                        }
                        responseToSend = originalGeminiResponse.replace(reactPattern, '').trim();
                    }
                }

                if (responseToSend) {
                    let sentMessageForDBLogging;
                    const MAX_LENGTH = 2000;
                    if (responseToSend.length <= MAX_LENGTH) {
                        sentMessageForDBLogging = await message.reply(responseToSend);
                    } else {
                        const messageChunks = [];
                        for (let i = 0; i < responseToSend.length; i += MAX_LENGTH) {
                            messageChunks.push(responseToSend.substring(i, i + MAX_LENGTH));
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
                        await databaseService.addChatMessage(message.channel.id, client.user.id, responseToSend, sentMessageForDBLogging.id, sentMessageForDBLogging.createdAt);
                    } else {
                        console.warn(`[${message.channel.id}] Could not get a sent message reference for DB logging of bot response. Logging with synthetic ID and current time.`);
                        await databaseService.addChatMessage(message.channel.id, client.user.id, responseToSend, `synthetic_bot_${Date.now()}`, new Date());
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