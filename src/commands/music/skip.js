module.exports = {
    name: 'skip',
    description: 'Skips the current song.',
    async execute(interaction, client, sharedStates) {
        const player = sharedStates.player;

        if (!interaction.inGuild()) {
            return interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
        }
        if (!interaction.member.voice.channel) {
            return interaction.reply({ content: "You need to be in a voice channel to use this command.", ephemeral: true });
        }
        if (!player) {
            console.warn(`[${interaction.guildId}] Player instance not available for skip command.`);
            return interaction.reply({ content: "The music player is not available. Please try again later.", ephemeral: true });
        }

        const queue = player.nodes.get(interaction.guildId);

        if (!queue) {
            return interaction.reply({ content: "❌ | I'm not currently playing any music in this server.", ephemeral: true });
        }
        if (interaction.member.voice.channel.id !== queue.channel?.id) {
            return interaction.reply({ content: "You need to be in the same voice channel as me to skip songs.", ephemeral: true });
        }
        if (!queue.node.isPlaying()) {
            return interaction.reply({ content: "❌ | There is no music currently playing to skip.", ephemeral: true });
        }
        
        await interaction.deferReply();

        try {
            const currentTrack = queue.currentTrack;
            if (!currentTrack) { 
                 // This should ideally be caught by !queue.node.isPlaying(), but as a safeguard:
                 return interaction.followUp({ content: "❌ | Hmm, I thought something was playing, but I can't find the current track details.", ephemeral: true });
            }
            
            const success = queue.node.skip(); // Attempts to skip the current track

            if (success) {
                await interaction.followUp({ content: `⏭️ | Skipped **${currentTrack.title}**.` });
            } else {
                await interaction.followUp({ content: "❌ | Could not skip the track. The queue might be empty or an error occurred.", ephemeral: true });
            }
        } catch (e) {
            console.error(`[${interaction.guildId}] Error in skip command:`, e);
            await interaction.followUp({ content: `❌ | Something went wrong while trying to skip: ${e.message}`, ephemeral: true });
        }
    }
};