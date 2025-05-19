// Require the necessary discord.js classes
const { Client, GatewayIntentBits, REST, Routes, Partials, PermissionsBitField } = require("discord.js");
// Import the GoogleGenerativeAI class
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
require("dotenv").config(); // To use environment variables

// --- Prisma Client Setup ---
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const BOT_TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID; // Optional: Your Server ID for testing slash commands quickly
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

let enabledChatBot = true;
const MAX_HISTORY_MESSAGES = 20; // Number of past messages to fetch for context

if (!BOT_TOKEN || !CLIENT_ID || !GEMINI_API_KEY) {
    console.error("Error: BOT_TOKEN, CLIENT_ID, or GEMINI_API_KEY is missing from your .env file.");
    process.exit(1); // Exit if essential keys are missing
}

// --- Gemini AI Setup ---
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({
    model: "gemma-3-27b-it", // Or your preferred model like "gemini-pro"
    safetySettings: [
        {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
            category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
            category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
        },
    ],
});

// Store active chat sessions (channelId -> ChatSession)
const chatSessions = new Map();
const freeChatChannels = new Set(); // This will now be populated from DB on startup
// --- End Gemini AI Setup ---

// --- Prisma Database Functions ---
/**
 * Adds a chat message to the chatHistories table.
 * @param {string} channelId The ID of the channel where the message was sent.
 * @param {string} userId The ID of the user who sent the message.
 * @param {string} messageContent The content of the message.
 * @param {string} discordMessageId The original Discord message ID.
 * @param {Date} actualCreatedAt The original message creation timestamp (as a Date object).
 * @returns {Promise<object|null>} The created chat history entry, or null if skipped (e.g., duplicate).
 */
async function addChatMessage(channelId, userId, messageContent, discordMessageId, actualCreatedAt) {
  try {
    const newMessageEntry = await prisma.chatHistories.create({
      data: {
        discordMessageId: discordMessageId,
        channelId: channelId,
        userId: userId,
        message: messageContent,
        createdAt: actualCreatedAt, // Use the provided actual creation time
      },
    });
    // console.log('Successfully saved chat message to database:', newMessageEntry.id); // Less verbose logging
    return newMessageEntry;
  } catch (error) {
    if (error.code === 'P2002') { // Prisma unique constraint violation code (for @@unique)
      // console.log(`Message ${discordMessageId} in channel ${channelId} already exists. Skipping.`);
      return null; // Indicate skipped due to duplicate
    }
    console.error('Error saving chat message to database:', error);
    // Not re-throwing here to prevent bot crash, but logging is important
    // Return undefined implicitly for other errors
  }
}
// --- End Prisma Database Functions ---


// Create a new Client instance with necessary intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // Required to read message content
        GatewayIntentBits.GuildMembers, // If you need member information
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction] // Useful for events on older messages
});

// When the client is ready, run this code (only once)
client.once("ready", async (c) => {
    console.log(`Ready! Logged in as ${c.user.tag}`);
    console.log(`Chatbot is initially ${enabledChatBot ? "enabled" : "disabled"}.`);

    // Load channel settings from database
    try {
        const allSettings = await prisma.channelSettings.findMany();
        allSettings.forEach(setting => {
            if (setting.settings && typeof setting.settings === 'object' && setting.settings.isFreeChat === true) {
                freeChatChannels.add(setting.channelId);
            }
        });
        console.log(`Loaded ${freeChatChannels.size} free chat channel settings from the database.`);
    } catch (error) {
        console.error("Error loading channel settings from database:", error);
    }

    // Register slash commands
    await registerSlashCommands();

});

// Function to get Gemini's response using a chat session
async function getGeminiChatResponse(channelId, currentPrompt, currentUserId) { // Added currentUserId
    console.log(`[${channelId}] Sending to Gemini: "${currentPrompt}" (User: ${currentUserId})`);
    let chatSession = chatSessions.get(channelId);

    if (!chatSession) {
        console.log(`[${channelId}] No active session. Fetching history and starting new chat session.`);
        
        // Initial system prompts
        const historyPayload = [
           { role: "user", parts: [{ text: `In this conversation you are play as a Vietnamese girl (your name is Pinky), funny and entertaining, chat with me as a friend, briefly when necessary, please always use Vietnamese language, don't need translate to English. 
                                            My prompt in this conversation will be in format '{userId|nickname|message}', each userId will be distinct, you should know who is chat will you.
                                            If you want to tag an user in your response, you should use this format <@{userId}> (never use format <@{nickname}>).Ex: <@717916401142071297>` }] },
           { role: "model", parts: [{ text: "Tôi hiểu rồi. Tôi sẽ nhớ điều này" }] }
        ];

        try {
            const dbHistory = await prisma.chatHistories.findMany({
                where: { channelId: channelId },
                orderBy: { createdAt: 'asc' }, // Get messages in chronological order
                take: MAX_HISTORY_MESSAGES, // Limit the number of messages fetched
            });

            dbHistory.forEach(msg => {
                if (msg.userId === client.user.id) { // Bot's own message
                    historyPayload.push({ role: "model", parts: [{ text: msg.message }] });
                } else { // User's message
                    // Adhere to the specified format, using '*' as a placeholder for historical userName
                    historyPayload.push({ role: "user", parts: [{ text: `${msg.userId}|*|${msg.message}` }] });
                }
            });
            console.log(`[${channelId}] Loaded ${dbHistory.length} messages from DB for history. Total history parts: ${historyPayload.length}`);

        } catch (dbError) {
            console.error(`[${channelId}] Error fetching chat history from DB:`, dbError);
            // Continue without DB history if fetching fails
        }
        
        chatSession = geminiModel.startChat({
            history: historyPayload,
        });
        chatSessions.set(channelId, chatSession);
    }

    try {
        const result = await chatSession.sendMessage(currentPrompt); // currentPrompt is already formatted
        const response = result.response;

        if (response.promptFeedback && response.promptFeedback.blockReason) {
            console.warn(`[${channelId}] Gemini API blocked prompt:`, response.promptFeedback.blockReason, response.promptFeedback.safetyRatings);
            return `My AI safety filters prevented a response for that prompt (Reason: ${response.promptFeedback.blockReason}). Please try something else.`;
        }

        const text = response.text();
        return text;
    } catch (error) {
        console.error(`[${channelId}] Error calling Gemini API:`, error);
        if (error.message && error.message.toLowerCase().includes("safety")) {
             return "My AI safety filters prevented a response. Please try something else.";
        }
        // chatSessions.delete(channelId); // Optionally reset session on error
        // console.log(`[${channelId}] Chat session reset due to error.`);
        return "Sorry, I couldn't connect to the AI service or an error occurred during our conversation.";
    }
}

// Respond to messages when the bot is mentioned
client.on("messageCreate", async (message) => {
    if (message.author.bot) return; // Ignore messages from other bots or itself

    const isFreeChatChannel = freeChatChannels.has(message.channelId);
    const isMentioned = message.mentions.users.has(client.user.id);

    if (enabledChatBot && (isFreeChatChannel || isMentioned)) {
        let prompt = message.content;
        if (isMentioned && !isFreeChatChannel) { // Only strip mention if it's not a free chat channel (where mention isn't required)
            prompt = message.content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
        } else {
            prompt = message.content.trim();
        }


        if (!prompt && isMentioned && !isFreeChatChannel) { // Only reply with help if directly mentioned and no other content
            message.reply("You mentioned me! What can I help you with today?");
            return;
        }
        if (!prompt && !isMentioned && isFreeChatChannel) { // Empty message in free chat channel
            return; // Do nothing for empty messages in free chat
        }


        try {
            // Log user's message to DB
            // We store the 'prompt' which is the cleaned message content
            await addChatMessage(message.channel.id, message.author.id, prompt, message.id, message.createdAt);

            await message.channel.sendTyping(); // Show "Bot is typing..."

            // Construct the prompt for Gemini, including userId and userName
            const geminiFormattedPrompt = `${message.author.id}|${message.author.username}|${prompt}`;
            const geminiResponse = await getGeminiChatResponse(message.channel.id, geminiFormattedPrompt, message.author.id);

            if (geminiResponse) {
                let sentMessageForDBLogging; // Store the first message object sent by the bot for logging
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
                        if (i === 0) { // Use the first chunk's ID and createdAt for the DB log of the full response
                            sentMessageForDBLogging = sentChunkMessage;
                        }
                    }
                }
                // Log bot's response to DB AFTER sending
                if (sentMessageForDBLogging) {
                    await addChatMessage(message.channel.id, client.user.id, geminiResponse, sentMessageForDBLogging.id, sentMessageForDBLogging.createdAt);
                } else {
                    // Fallback if no message was sent or reference not captured (should be rare)
                    console.warn(`[${message.channel.id}] Could not get a sent message reference for DB logging of bot response. Logging with synthetic ID and current time.`);
                    await addChatMessage(message.channel.id, client.user.id, geminiResponse, `synthetic_bot_${Date.now()}`, new Date());
                }
            } else {
                await message.reply("I received an empty or no response from the AI. Please try again.");
            }
        } catch (error) {
            console.error("Error processing Gemini response or sending message:", error);
            await message.reply("Sorry, something went wrong while I was thinking.");
        }
    }
});

// --- Slash Command Setup ---
const commands = [
    {
        name: "toggle_chatbot",
        description: "Toggle the Gemini chatbot (on mention/free_chat) on or off.",
    },
    {
        name: "reset_chat",
        description: "Resets the Gemini chatbot's conversation history for this channel.",
    },
    {
        name: "toggle_free_chat",
        description: "Toggle free chat in the current channel (bot responds to all messages)."
    },
    {
        name: "clear",
        description: "Clear up to 100 messages in the current channel (requires permissions).",
        default_member_permissions: String(PermissionsBitField.Flags.ManageMessages),
    },
];

const rest = new REST({ version: "10" }).setToken(BOT_TOKEN);

async function registerSlashCommands() {
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);
        if (GUILD_ID) {
            await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
                body: commands,
            });
            console.log(`Successfully reloaded application (/) commands for guild ${GUILD_ID}.`);
        } else {
            await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
            console.log("Successfully reloaded global application (/) commands.");
        }
    } catch (error) {
        console.error("Error refreshing application commands:", error);
    }
}

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === "toggle_chatbot") {
        enabledChatBot = !enabledChatBot;
        await interaction.reply(`Gemini chatbot is now ${enabledChatBot ? "ENABLED" : "DISABLED"}.`)
    }
    else if (commandName === "toggle_free_chat") {
        if( !freeChatChannels.has(interaction.channelId)) {
            freeChatChannels.add(interaction.channelId);
        } else {
            freeChatChannels.delete(interaction.channelId);
        }

        const isNowFreeChat = freeChatChannels.has(interaction.channelId);

        try {
            await prisma.channelSettings.upsert({
                where: { channelId: interaction.channelId },
                update: {
                    settings: {
                        // To preserve other potential settings, you might fetch first, then merge
                        // For now, we assume isFreeChat is the only setting or we overwrite.
                        // A safer update would be:
                        // settings: { ...(currentSettings.settings || {}), isFreeChat: isNowFreeChat }
                        isFreeChat: isNowFreeChat
                    }
                },
                create: {
                    channelId: interaction.channelId,
                    settings: { isFreeChat: isNowFreeChat }
                }
            });
            await interaction.reply(`Free chat is now ${isNowFreeChat ? "ENABLED" : "DISABLED"} for this channel. Settings saved.`);
        } catch (dbError) {
            console.error("Error saving free_chat setting to DB:", dbError);
            await interaction.reply(`Free chat is now ${isNowFreeChat ? "ENABLED" : "DISABLED"} for this channel. (Failed to save setting to DB)`);
        }

    } else if (commandName === "reset_chat") {
        // Note: This does not reset channelSettings like isFreeChat.
        if (chatSessions.has(interaction.channelId)) {
            chatSessions.delete(interaction.channelId);
        }
        //Clear all message in database
        await prisma.chatHistories.deleteMany({ where: { channelId: interaction.channelId } });
        console.log(`[${interaction.channelId}] Cleared DB history on reset command.`);
        await interaction.reply({ content: "Chat session with Gemini for this channel has been reset, and all associated chat history from the database for this channel has been cleared.", ephemeral: true });
    } else if (commandName === "clear") {
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
            await interaction.editReply({ content: `Successfully cleared ${messagesToDelete.size} messages.`});
        } catch (error) {
            console.error("Error clearing messages:", error);
            await interaction.editReply({ content: "Failed to clear messages. Make sure I have the 'Manage Messages' permission." });
        }
    }
});

// Log in to Discord with your client's token
client.login(BOT_TOKEN);

// Graceful shutdown for Prisma Client
async function shutdown(signal) {
    console.log(`\nReceived ${signal}. Shutting down gracefully...`);
    await prisma.$disconnect();
    console.log('Prisma Client disconnected.');
    process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
