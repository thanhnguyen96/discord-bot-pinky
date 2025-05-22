const { PermissionsBitField } = require("discord.js");

module.exports = {
    name: 'play',
    async execute(interaction, client, sharedStates) {
        const player = sharedStates.player;

        if (!interaction.inGuild()) {
            return interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
        }
        if (!interaction.member.voice.channel) {
            return interaction.reply({ content: "You need to be in a voice channel to play music!", ephemeral: true });
        }
        if (!player) {
            console.warn(`[${interaction.guildId}] Player instance not available for play command.`);
            return interaction.reply({ content: "The music player is not available. Please try again later or contact the bot owner.", ephemeral: true });
        }

        const voiceChannel = interaction.member.voice.channel;
        // Check bot's permissions to join and speak if it's not already in a channel or in a different channel
        const currentVoiceChannel = interaction.guild.members.me.voice.channel;
        if (!currentVoiceChannel || currentVoiceChannel.id !== voiceChannel.id) {
            const permissions = voiceChannel.permissionsFor(client.user);
            if (!permissions.has(PermissionsBitField.Flags.Connect)) {
                return interaction.reply({ content: "I don't have permission to connect to your voice channel!", ephemeral: true });
            }
            if (!permissions.has(PermissionsBitField.Flags.Speak)) {
                return interaction.reply({ content: "I don't have permission to speak in your voice channel!", ephemeral: true });
            }
        }

        await interaction.deferReply();
        const query = interaction.options.getString('query', true);

        try {
            const searchResult = await player.search(query, {
                requestedBy: interaction.user,
            });

            if (!searchResult || !searchResult.hasTracks()) {
                return interaction.followUp({ content: `❌ | No results found for \`${query}\`! Please check the URL or query.`, ephemeral: true });
            }

            const queue = player.nodes.create(interaction.guild, {
                metadata: {
                    channel: interaction.channel,
                    client: client, // or interaction.client
                    requestedBy: interaction.user,
                },
                leaveOnEmptyCooldown: 300000, // 5 minutes
                leaveOnEndCooldown: 300000,   // 5 minutes
                leaveOnStopCooldown: 300000,  // 5 minutes
                selfDeaf: true,
                volume: 80,
                leaveOnEmpty: true,
                leaveOnEnd: true,
                leaveOnStop: true,
            });

            try {
                if (!queue.connection) await queue.connect(voiceChannel);
            } catch (err) {
                console.error(`[${interaction.guildId}] Error connecting to voice channel:`, err);
                player.nodes.delete(interaction.guildId);
                return interaction.followUp({ content: "❌ | Could not join your voice channel! Please check my permissions.", ephemeral: true });
            }

            const track = searchResult.tracks[0];
            queue.addTrack(searchResult.playlist ? searchResult.playlist : track);
            
            let replyMessage = searchResult.playlist ? `🎶 | Queued playlist **${searchResult.playlist.title}** (${searchResult.playlist.tracks.length} tracks)` : `🎶 | Queued **${track.title}**`;

            if (!queue.node.isPlaying() && !queue.node.isPaused()) {
                await queue.node.play();
            }
            return interaction.followUp(replyMessage);
        } catch (e) {
            console.error(`[${interaction.guildId}] Error in play command:`, e);
            return interaction.followUp({ content: `❌ | Something went wrong while trying to play the music: ${e.message}`, ephemeral: true });
        }
    }
};