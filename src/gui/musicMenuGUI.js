const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');

const repeatModeMap = { 0: 'Off', 1: 'Track', 2: 'Queue', 3: 'Autoplay' };

/**
 * Generates the message payload (embeds and components) for the music menu.
 * Assumes queue and currentTrack exist when called for an active menu.
 * @param {import('discord.js').Interaction | import('discord.js').Message} interactionOrMessage - The interaction or message object.
 * @param {import('discord-player').Player} player - The discord-player instance.
 * @param {object} options - Options for generation.
 * @param {boolean} [options.forceDisable=false] - Whether to force disable all components.
 * @returns {import('discord.js').InteractionReplyOptions | import('discord.js').MessageEditOptions}
 */
async function generateMenuMessage(interactionOrMessage, player, { forceDisable = false } = {}) {
    const guildId = interactionOrMessage.guildId;
    const queue = player.nodes.get(guildId);

    if (!queue || !queue.currentTrack) {
        const embed = new EmbedBuilder()
            .setTitle("🎶 Music Menu 🎶")
            .setDescription("❌ | Queue is empty or playback has ended.")
            .setColor(0xFF0000);

        const components = [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('musicmenu_add_track')
                    .setLabel('➕ Add Song')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(forceDisable)
            )
        ];
        return {
            embeds: [embed],
            components,
            ephemeral: false
        };
    }

    const isPaused = queue.node.isPaused();
    const currentVolume = queue.node.volume;
    const currentRepeatMode = queue.repeatMode;

    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('🎶 Music Menu 🎶')
        .setDescription(`**Now Playing:**\n${queue.currentTrack.title}\nRequested by: ${queue.currentTrack.requestedBy.username}`)
        .setThumbnail(queue.currentTrack.thumbnail || null)
        .setFooter({ text: `Volume: ${currentVolume}% | Loop: ${repeatModeMap[currentRepeatMode] || 'N/A'} | Queue: ${queue.tracks.size} more` });

    let upcomingTracks = "Queue is empty after this song.";
    if (queue.tracks.size > 0) {
        upcomingTracks = queue.tracks.toArray().slice(0, 5).map((track, i) => {
            const title = track.title.length > 50 ? track.title.substring(0, 47) + "..." : track.title;
            return `${i + 1}. ${title}`;
        }).join('\n');
    }
    embed.addFields({ name: 'Up Next (Top 5)', value: upcomingTracks });

    const row1 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('musicmenu_pause_resume')
                .setLabel(isPaused ? '▶️ Resume' : '⏸️ Pause')
                .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Secondary)
                .setDisabled(forceDisable),
            new ButtonBuilder()
                .setCustomId('musicmenu_skip')
                .setLabel('⏭️ Skip')
                .setStyle(ButtonStyle.Primary)
                // Disable skip if queue is empty AND not in Queue or Autoplay loop mode
                // (Track loop on a single song still allows "skipping" to replay it)
                .setDisabled(forceDisable || (queue.tracks.size === 0 && queue.repeatMode !== 2 /* Queue */ && queue.repeatMode !== 3 /* Autoplay */)),
            new ButtonBuilder()
                .setCustomId('musicmenu_stop')
                .setLabel('⏹️ Stop')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(forceDisable)
        );

    const repeatModeOptions = [
        { label: '▶️ Mode: Off', value: '0' },
        { label: '🔂 Mode: Track', value: '1' },
        { label: '🔁 Mode: Queue', value: '2' },
        { label: '🔁 Mode: Autoplay', value: '3' },
    ];

    const row2 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('musicmenu_add_track')
                .setLabel('➕ Add More Song')
                .setStyle(ButtonStyle.Success)
                .setDisabled(forceDisable)
        );

    const rowRepeatMode = new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('musicmenu_repeat_mode')
                .setPlaceholder(`🔁 Mode: ${repeatModeMap[currentRepeatMode] || 'Off'}`)
                .addOptions(repeatModeOptions.map(opt => ({
                    label: opt.label,
                    value: opt.value,
                    default: parseInt(opt.value) === currentRepeatMode
                })))
                .setDisabled(forceDisable)
        );

    const volumeOptions = [
        { label: '10%', value: '10' }, { label: '25%', value: '25' }, { label: '50%', value: '50' },
        { label: '75%', value: '75' }, { label: '100%', value: '100' }, { label: '125%', value: '125' },
        { label: '150%', value: '150' }, { label: '200%', value: '200' },
    ].map(opt => ({ label: `Volume ${opt.label.startsWith('Volume') ? opt.label.split(' ')[1] : opt.label}`, value: opt.value }));

    const row3 = new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('musicmenu_volume')
                .setPlaceholder(`🔊 Volume (${currentVolume}%)`)
                .addOptions(volumeOptions.map(opt => ({ label: opt.label, value: opt.value, default: parseInt(opt.value) === currentVolume })))
                .setDisabled(forceDisable),
        );

    return {
        embeds: [embed],
        components: [row1, row2, rowRepeatMode, row3],
        ephemeral: false
    };
}

module.exports = {
    generateMenuMessage,
    repeatModeMap // Exporting this in case other GUI elements might use it, or for consistency
};