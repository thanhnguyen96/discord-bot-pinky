const { Collection } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

// Dynamically load command files
const commands = new Collection();
const commandFoldersPath = path.join(__dirname, '..', 'commands');

try {
    const commandFolders = fs.readdirSync(commandFoldersPath).filter(folder => 
        fs.statSync(path.join(commandFoldersPath, folder)).isDirectory()
    );

    for (const folder of commandFolders) {
        const commandsPath = path.join(commandFoldersPath, folder);
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            const command = require(filePath);
            if (command && 'name' in command && 'execute' in command) {
                commands.set(command.name, command);
                console.log(`[Commands] Loaded command: ${command.name} from ${folder}/${file}`);
            } else {
                console.warn(`[WARNING] The command at ${filePath} is missing a required "name" or "execute" property.`);
            }
        }
    }
} catch (error) {
    console.error("Error loading commands:", error);
}

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client, sharedStates) { // sharedStates for enabledChatBot, freeChatChannels
        if (!interaction.isChatInputCommand()) return;

        const command = commands.get(interaction.commandName);

        if (!command) {
            console.error(`[${interaction.guildId || 'DM'}/${interaction.channelId}] No command matching '${interaction.commandName}' was found.`);
            await interaction.reply({ content: "Sorry, I don't know how to handle that command or it's not registered properly.", ephemeral: true });
            return;
        }

        try {
            await command.execute(interaction, client, sharedStates);
        } catch (error) {
            console.error(`[${interaction.guildId || 'DM'}/${interaction.channelId}] Error executing command '${interaction.commandName}':`, error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
            } else {
                await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
            }
        }
    },
};