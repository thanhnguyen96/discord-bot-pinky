// Require the necessary discord.js classes
const { Client, GatewayIntentBits, REST, Routes, Partials, PermissionsBitField } = require("discord.js");
// Import the GoogleGenerativeAI class
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
require("dotenv").config(); // To use environment variables

const BOT_TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID; // Optional: Your Server ID for testing slash commands quickly
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

let enabledChatBot = true;

if (!BOT_TOKEN || !CLIENT_ID || !GEMINI_API_KEY) {
    console.error("Error: BOT_TOKEN, CLIENT_ID, or GEMINI_API_KEY is missing from your .env file.");
    process.exit(1); // Exit if essential keys are missing
}

// --- Gemini AI Setup ---
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({
    model: "gemma-3-27b-it", // Or your preferred model like "gemini-pro"
    // --- Safety Settings Example (customize as needed) ---
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
    // --- Generation Config Example (customize as needed) ---
    // generationConfig: {
    //   temperature: 0.7,
    //   topP: 0.9,
    //   topK: 40,
    //   maxOutputTokens: 2048, // Adjust as needed
    // }
});

// Store active chat sessions (channelId -> ChatSession)
const chatSessions = new Map();
const freeChatChannels = new Set();

// --- End Gemini AI Setup ---


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
client.once("ready", (c) => {
    console.log(`Ready! Logged in as ${c.user.tag}`);
    console.log(`Chatbot is initially ${enabledChatBot ? "enabled" : "disabled"}.`);
});

// Function to get Gemini's response using a chat session
async function getGeminiChatResponse(channelId, currentPrompt) {
    console.log(`[${channelId}] Sending to Gemini: "${currentPrompt}"`);
    let chatSession = chatSessions.get(channelId);

    if (!chatSession) {
        // Start a new chat session if one doesn't exist for this channel
        // You can pass an initial history to startChat if needed, e.g., a system prompt
        // For now, we start with an empty history for each new session.
        console.log(`[${channelId}] Starting new chat session.`);
        chatSession = geminiModel.startChat({
            history: [
               { role: "user", parts: [{ text: `In this conversation you are play as a Vietnamese girl (your name is Pinky), funny and entertaining, chat with me as a friend, briefly when necessary, please always use Vietnamese language, don't need translate to English. 
                                                My prompt in this conversation will be in format '{userId|userName|message}', each userId will be distinct, you should know who is chat will you.
                                                If you want to tag an user in your response, you should use this format <@{userId}>.Ex: <@123456789>` }] },
               { role: "model", parts: [{ text: "Tôi hiểu rồi. Tôi sẽ nhớ điều này" }] }
            ],
            // safetySettings: inherited from model, or override here
            // generationConfig: inherited from model, or override here
        });
        chatSessions.set(channelId, chatSession);
    }

    try {
        const result = await chatSession.sendMessage(currentPrompt);
        const response = result.response;

        if (response.promptFeedback && response.promptFeedback.blockReason) {
            console.warn(`[${channelId}] Gemini API blocked prompt:`, response.promptFeedback.blockReason, response.promptFeedback.safetyRatings);
            // Optionally, remove the last (problematic) user message and model response from history if the SDK doesn't do it.
            // This SDK's ChatSession typically manages history turns internally.
            return `My AI safety filters prevented a response for that prompt (Reason: ${response.promptFeedback.blockReason}). Please try something else.`;
        }

        const text = response.text();
        return text;
    } catch (error) {
        console.error(`[${channelId}] Error calling Gemini API:`, error);
        if (error.message && error.message.toLowerCase().includes("safety")) {
             return "My AI safety filters prevented a response. Please try something else.";
        }
        // If there's an error, we might want to reset the session for this channel
        // or implement more sophisticated error handling.
        // For now, we'll just return an error message.
        // chatSessions.delete(channelId); // Example: reset session on error
        // console.log(`[${channelId}] Chat session reset due to error.`);
        return "Sorry, I couldn't connect to the AI service or an error occurred during our conversation.";
    }
}

// Respond to messages when the bot is mentioned
client.on("messageCreate", async (message) => {
    if (message.author.bot) return; // Ignore messages from other bots or itself

    // Check if the chatbot is enabled AND if the bot was mentioned
    if (enabledChatBot && (freeChatChannels.has(message.channelId) || message.mentions.users.has(client.user.id))) {
        // Extract the prompt (message content excluding the bot's mention)
        const prompt = message.content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();

        if (!prompt) {
            message.reply("You mentioned me! What can I help you with today?");
            return;
        }

        try {
            await message.channel.sendTyping(); // Show "Bot is typing..."

            const geminiResponse = await getGeminiChatResponse(message.channel.id, message.author.id + "|" + message.author.username + "|" + prompt);

            if (geminiResponse) {
                const MAX_LENGTH = 2000;
                if (geminiResponse.length <= MAX_LENGTH) {
                    await message.reply(geminiResponse);
                } else {
                    const messageChunks = [];
                    for (let i = 0; i < geminiResponse.length; i += MAX_LENGTH) {
                        messageChunks.push(geminiResponse.substring(i, i + MAX_LENGTH));
                    }
                    for (const chunk of messageChunks) {
                        await message.channel.send(chunk);
                    }
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
        description: "Toggle the Gemini chatbot (on mention) on or off.",
    },
    {
        name: "reset_chat",
        description: "Resets the Gemini chatbot's conversation history for this channel.",
    },
    {
        name: "toggle_free_chat",
        description: "Toggle free chat in the current channel."
    },
    {
        name: "clear",
        description: "Clear up to 100 messages in the current channel (requires permissions).",
        default_member_permissions: String(PermissionsBitField.Flags.ManageMessages), // Ensure bot has this too
    },
];

const rest = new REST({ version: "10" }).setToken(BOT_TOKEN);

(async () => {
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);
        if (GUILD_ID) {
            await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
                body: commands,
            });
            console.log(
                `Successfully reloaded application (/) commands for guild ${GUILD_ID}.`
            );
        } else {
            await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
            console.log("Successfully reloaded global application (/) commands.");
        }
    } catch (error) {
        console.error("Error refreshing application commands:", error);
    }
})();

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName } = interaction;
    if (commandName === "toggle_chatbot") {
        enabledChatBot = !enabledChatBot;
        await interaction.reply(`Gemini chatbot (on mention) is now ${enabledChatBot ? "ENABLED" : "DISABLED"}.`)
    }
    else if (commandName === "toggle_free_chat") {
        if( !freeChatChannels.has(interaction.channelId)) {
            freeChatChannels.add(interaction.channelId);
        }
        else {
            freeChatChannels.delete(interaction.channelId);
        }
        await interaction.reply(`Free chat is now ${freeChatChannels.has(interaction.channelId) ? "ENABLED" : "DISABLED"} for this channel`)
    } else if (commandName === "reset_chat") {
        if (chatSessions.has(interaction.channelId)) {
            chatSessions.delete(interaction.channelId);
            await interaction.reply({ content: "Chat history with Gemini for this channel has been reset.", ephemeral: true });
        } else {
            await interaction.reply({ content: "No active chat history to reset for this channel.", ephemeral: true });
        }
    } else if (commandName === "clear") {
        // Permission check already handled by default_member_permissions for slash commands if user lacks it.
        // This check is more for the bot's own permissions.
        if (!interaction.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
             await interaction.reply({ content: "I don't have permission to manage messages in this channel.", ephemeral: true });
             return;
        }
        try {
            // Defer reply as fetching and deleting can take time
            await interaction.deferReply({ ephemeral: true });
            const fetched = await interaction.channel.messages.fetch({ limit: 99 }); // Fetch up to 99, as bulkDelete can't delete the command message itself easily.
            const messagesToDelete = fetched.filter(msg => !msg.pinned); // Don't delete pinned messages

            if (messagesToDelete.size === 0) {
                await interaction.editReply({ content: "No messages found to clear (or all recent messages are pinned)." });
                return;
            }

            await interaction.channel.bulkDelete(messagesToDelete, true); // true filters messages older than 2 weeks
            await interaction.editReply({ content: `Successfully cleared ${messagesToDelete.size} messages.`});
        } catch (error) {
            console.error("Error clearing messages:", error);
            await interaction.editReply({ content: "Failed to clear messages. Make sure I have the 'Manage Messages' permission." });
        }
    }
});

// Log in to Discord with your client's token
client.login(BOT_TOKEN);
