const { PermissionsBitField } = require("discord.js");

module.exports = {
    name: 'clear',
    async execute(interaction, client, sharedStates) {
        if (!interaction.guild) {
            await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
            return;
        }
        if (!interaction.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
            await interaction.reply({ content: "I don't have permission to manage messages in this channel.", ephemeral: true });
            return;
        }
        try {
            await interaction.deferReply({ ephemeral: true });
            const fetched = await interaction.channel.messages.fetch({ limit: 99 }); // discord.js v13+ limit is 100, but 99 is safer for bulkDelete if some are filtered
            const messagesToDelete = fetched.filter(msg => !msg.pinned);

            if (messagesToDelete.size === 0) {
                await interaction.editReply({ content: "No messages found to clear (or all recent messages are pinned)." });
                return;
            }

            await interaction.channel.bulkDelete(messagesToDelete, true);
            await interaction.editReply({ content: `Successfully cleared ${messagesToDelete.size} messages.` });
        } catch (error) {
            console.error(`[${interaction.channelId}] Error clearing messages:`, error);
            await interaction.editReply({ content: "Failed to clear messages. Make sure I have the 'Manage Messages' permission and messages are not older than 14 days." });
        }
    }
};