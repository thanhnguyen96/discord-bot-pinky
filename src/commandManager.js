const { REST, Routes, PermissionsBitField } = require("discord.js");
const config = require('./config');

const commands = [
    {
        name: "toggle_chatbot",
        description: "Toggle the chatbot (on mention/free_chat) on or off.",
    },
    {
        name: "reset_chat",
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