module.exports = {
    name: 'stop',
    description: 'Stops the music, clears the queue, and disconnects the bot.',
    async execute(interaction, client, sharedStates) {
        const player = sharedStates.player;

        if (!interaction.inGuild()) {
            return interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
        }
        if (!interaction.member.voice.channel) {
            return interaction.reply({ content: "You need to be in a voice channel to use this command.", ephemeral: true });
        }
        if (!player) {
            console.warn(`[${interaction.guildId}] Player instance not available for stop command.`);
            return interaction.reply({ content: "The music player is not available. Please try again later.", ephemeral: true });
        }

        const queue = player.nodes.get(interaction.guildId);

        if (!queue) {
            return interaction.reply({ content: "❌ | I'm not playing anything or not in a voice channel in this server.", ephemeral: true });
        }

        if (interaction.member.voice.channel.id !== queue.channel?.id) {
            return interaction.reply({ content: "You need to be in the same voice channel as me to stop the music.", ephemeral: true });
        }

        await interaction.deferReply();
        try {
            queue.delete(); // Stops music, clears tracks, and disconnects.
            await interaction.followUp({ content: "⏹️ | Music stopped, queue cleared, and I've left the voice channel." });
        } catch (e) {
            console.error(`[${interaction.guildId}] Error in stop command:`, e);
            // Check if interaction can still be replied to, though deferReply should ensure followUp is fine
            if (interaction.replied || interaction.deferred) {
                 await interaction.followUp({ content: `❌ | Something went wrong while trying to stop: ${e.message}`, ephemeral: true });
            } else {
                 await interaction.reply({ content: `❌ | Something went wrong while trying to stop: ${e.message}`, ephemeral: true });
            }
        }
    }
};