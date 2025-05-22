module.exports = {
    name: 'pause',
    description: 'Pauses or resumes the current song.',
    async execute(interaction, client, sharedStates) {
        const player = sharedStates.player;

        if (!interaction.inGuild()) {
            return interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
        }
        if (!interaction.member.voice.channel) {
            return interaction.reply({ content: "You need to be in a voice channel to use this command.", ephemeral: true });
        }
        if (!player) {
            console.warn(`[${interaction.guildId}] Player instance not available for pause command.`);
            return interaction.reply({ content: "The music player is not available. Please try again later.", ephemeral: true });
        }

        const queue = player.nodes.get(interaction.guildId);

        if (!queue) {
            return interaction.reply({ content: "❌ | I'm not currently playing any music in this server.", ephemeral: true });
        }
        if (interaction.member.voice.channel.id !== queue.channel?.id) {
            return interaction.reply({ content: "You need to be in the same voice channel as me to pause/resume.", ephemeral: true });
        }

        // Check if something is actively playing or already paused
        if (!queue.node.isPlaying() && !queue.node.isPaused()) {
            return interaction.reply({ content: "❌ | Nothing is currently playing or paused to toggle.", ephemeral: true });
        }

        await interaction.deferReply();

        try {
            let replyMessage;
            const isPaused = queue.node.isPaused();

            if (isPaused) {
                const success = queue.node.resume();
                replyMessage = success ? "▶️ | Resumed the music!" : "❌ | Could not resume the music.";
            } else { // If not paused, and it passed the check above, it must be playing
                const success = queue.node.pause();
                replyMessage = success ? "⏸️ | Paused the music!" : "❌ | Could not pause the music.";
            }
            // Make error messages ephemeral
            await interaction.followUp({ content: replyMessage, ephemeral: replyMessage.startsWith("❌") });
        } catch (e) {
            console.error(`[${interaction.guildId}] Error in pause command:`, e);
            await interaction.followUp({ content: `❌ | Something went wrong: ${e.message}`, ephemeral: true });
        }
    }
};