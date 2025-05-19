require("dotenv").config();

module.exports = {
    BOT_TOKEN: process.env.BOT_TOKEN,
    CLIENT_ID: process.env.CLIENT_ID,
    GUILD_ID: process.env.GUILD_ID, // Optional: Your Server ID for testing slash commands quickly
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    MAX_HISTORY_MESSAGES: 20, // Number of past messages to fetch for context
};

// Validate essential keys
if (!module.exports.BOT_TOKEN || !module.exports.CLIENT_ID || !module.exports.GEMINI_API_KEY) {
    console.error("Error: BOT_TOKEN, CLIENT_ID, or GEMINI_API_KEY is missing from your .env file.");
    process.exit(1);
}