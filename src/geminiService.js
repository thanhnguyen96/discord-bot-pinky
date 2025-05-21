const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
const config = require('./config');
const databaseService = require('./databaseService');

const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({
    model: "gemma-3-27b-it", // Or your preferred model
    safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    ],
});

const chatSessions = new Map(); // channelId -> ChatSession

function resetChatSession(channelId) {
    chatSessions.delete(channelId);
}

async function getGeminiChatResponse(channelId, currentPrompt, currentUserId, clientUserId) {
    console.log(`[${channelId}] Sending to Gemini: "${currentPrompt}" (User: ${currentUserId})`);
    let chatSession = chatSessions.get(channelId);

    if (!chatSession) {
        console.log(`[${channelId}] No active session. Fetching history and starting new chat session.`);
        const historyPayload = [
           { role: "user", parts: [{ text: `You're Pinky, a humorous, naughty Vietnamese girl in a Discord channel, chatting with me as a friend.
                                            Use Vietnamese only, be brief when necessary.
                                            My messages will be in '{userId}|{message}' format. Tag users with <@userId>.
                                            React with start your response with '<react:{discord_emoji}>'.` 
                                  }] },
           { role: "model", parts: [{ text: "Got it. I will remember this" }] }
        ];

        try {
            const dbHistory = await databaseService.getChatHistory(channelId, config.MAX_HISTORY_MESSAGES);
            dbHistory.forEach(msg => {
                if (msg.userId === clientUserId) { // Bot's own message
                    historyPayload.push({ role: "model", parts: [{ text: msg.message }] });
                } else { // User's message
                    historyPayload.push({ role: "user", parts: [{ text: `${msg.userId}|*|${msg.message}` }] });
                }
            });
            console.log(`[${channelId}] Loaded ${dbHistory.length} messages from DB for history. Total history parts: ${historyPayload.length}`);
        } catch (dbError) {
            console.error(`[${channelId}] Error fetching chat history from DB:`, dbError);
        }
        
        chatSession = geminiModel.startChat({ history: historyPayload });
        chatSessions.set(channelId, chatSession);
    }

    try {
        const result = await chatSession.sendMessage(currentPrompt);
        const response = result.response;

        if (response.promptFeedback && response.promptFeedback.blockReason) {
            console.warn(`[${channelId}] Gemini API blocked prompt:`, response.promptFeedback.blockReason, response.promptFeedback.safetyRatings);
            return `My safety filters prevented a response for that prompt (Reason: ${response.promptFeedback.blockReason}). Please try something else.`;
        }
        return response.text();
    } catch (error) {
        console.error(`[${channelId}] Error calling Gemini API:`, error);
        if (error.message && error.message.toLowerCase().includes("safety")) {
             return "My safety filters prevented a response. Please try something else.";
        }
        return "Sorry, I couldn't connect to the AI service or an error occurred during our conversation.";
    }
}

module.exports = {
    getGeminiChatResponse,
    resetChatSession,
};