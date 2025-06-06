const { REST, Routes, PermissionsBitField, ApplicationCommandOptionType } = require("discord.js");
const config = require('./config');

const commands = [
    {
        name: "toggle_chatbot",
        description: "Toggle the chatbot for the current channel (responds on mention or if free_chat is also on).",
    },
    {
        name: "forget",
        description: "Resets the chatbot's conversation history for this channel.",
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
    {
        name: "remember",
        description: "Fetches recent messages and saves them to the bot's memory for this channel.",
        options: [
            {
                name: "count",
                description: "Number of recent messages to remember (max 100).",
                type: ApplicationCommandOptionType.Integer, // Type 4 for INTEGER
                required: true,
            },
        ],
    },
    {
        name: "play",
        description: "Plays audio from a YouTube URL in your voice channel.",
        options: [
            {
                name: "query",
                description: "The Song Name or YouTube URL of the video/playlist to play.",
                type: ApplicationCommandOptionType.String,
                required: true,
            },
        ],
    },
    {
        name: "stop",
        description: "Stops the music, clears the queue, and disconnects the bot.",
    },
    {
        name: "skip",
        description: "Skips the current song.",
    },
    {
        name: "pause",
        description: "Pauses or resumes the current song.",
    },
    {
        name: "music_menu",
        description: "Displays an interactive music menu.",
    },

];

const rest = new REST({ version: "10" }).setToken(config.BOT_TOKEN);

async function registerSlashCommands() {
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);
        if (config.GUILD_ID) {
            await rest.put(Routes.applicationGuildCommands(config.CLIENT_ID, config.GUILD_ID), {
                body: commands,
            });
            console.log(`Successfully reloaded application (/) commands for guild ${config.GUILD_ID}.`);
        } else {
            await rest.put(Routes.applicationCommands(config.CLIENT_ID), { body: commands });
            console.log("Successfully reloaded global application (/) commands.");
        }
    } catch (error) {
        console.error("Error refreshing application commands:", error);
    }
}

module.exports = {
    commands, // Exporting commands array in case it's needed elsewhere, though interactionCreate handles them by name
    registerSlashCommands,
};