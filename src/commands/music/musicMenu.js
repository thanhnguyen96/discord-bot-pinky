const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType } = require('discord.js');

const repeatModeMap = { 0: 'Off', 1: 'Track', 2: 'Queue', 3: 'Autoplay' };

/**
 * Generates the message payload (embeds and components) for the music menu.
 * Assumes queue and currentTrack exist when called for an active menu.
 * @param {import('discord.js').Interaction} interactionOrMessage - The interaction or message object.
 * @param {import('discord-player').Player} player - The discord-player instance.
 * @param {object} options - Options for generation.
 * @param {boolean} [options.forceDisable=false] - Whether to force disable all components.
 * @returns {import('discord.js').InteractionReplyOptions | import('discord.js').MessageEditOptions}
 */
async function generateMenuMessage(interactionOrMessage, player, { forceDisable = false } = {}) {
    const guildId = interactionOrMessage.guildId;
    const queue = player.nodes.get(guildId);

    // This function is primarily called when a queue and current track are expected to be active.
    // If called when not active (e.g., for initial setup or after queue ends),
    // the calling logic should handle the "nothing playing" state.
    if (!queue || !queue.currentTrack) {
        // Fallback for safety, though command logic should prevent reaching here for an active menu update.
        const content = "❌ | Nothing is currently playing or the queue has ended.";
        const components = []; // No interactive components if nothing is playing.
        if (queue) { // If queue object exists (e.g. empty but bot in channel)
            components.push(new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('musicmenu_add_track') // Allow adding track even if queue is empty
                    .setLabel('➕ Add More Song')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(forceDisable)
            ));
        }
        return {
            content,
            embeds: [new EmbedBuilder().setTitle("🎶 Music Menu 🎶").setDescription(content).setColor(0xFF0000)],
            components,
            ephemeral: false // Keep consistent with menu's non-ephemeral nature
        };
    }

    const isPaused = queue.node.isPaused();
    const currentVolume = queue.node.volume;
    const currentRepeatMode = queue.repeatMode;

    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('🎶 Music Menu 🎶')
        .setDescription(`**Now Playing:**\n${queue.currentTrack.title}\nRequested by: ${queue.currentTrack.requestedBy.username}`)
        .setThumbnail(queue.currentTrack.thumbnail)
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
                .setDisabled(forceDisable || (queue.tracks.size === 0 && queue.repeatMode !== 2 && queue.repeatMode !== 3)), // Disable skip if nothing to skip to and not looping queue/autoplay
            new ButtonBuilder()
                .setCustomId('musicmenu_stop')
                .setLabel('⏹️ Stop')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(forceDisable)
        );

    const repeatModeOptions = [
        { label: '▶️ Mode: Off', value: '0' }, // Using discord-player GuildQueueRepeatMode values
        { label: '🔂 Mode: Track', value: '1' },
        { label: '🔁 Mode: Queue', value: '2' },
        { label: '🔁 Mode: Autoplay', value: '3' }, // Autoplay (if enabled/supported by extractor)
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
                .addOptions(volumeOptions.map(opt => ({ 
                    label: opt.label, 
                    value: opt.value, 
                    default: parseInt(opt.value) === currentVolume 
                })))
                .setDisabled(forceDisable),
        );

    return {
        embeds: [embed],
        components: [row1, row2, rowRepeatMode, row3],
        ephemeral: false
    };
}


module.exports = {
    name: 'music_menu',
    description: 'Displays an interactive music menu.',
    async execute(interaction, client, sharedStates) {
        const player = sharedStates.player;

        if (!interaction.inGuild()) {
            return interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
        }
        if (!interaction.member.voice.channel) {
            return interaction.reply({ content: "You need to be in a voice channel to use this command.", ephemeral: true });
        }
        if (!player) {
            console.warn(`[${interaction.guildId}] Player instance not available for music_menu command.`);
            return interaction.reply({ content: "The music player is not available. Please try again later.", ephemeral: true });
        }

        const queue = player.nodes.get(interaction.guildId);
        if (!queue || !queue.currentTrack) {
            // Offer to start playing if queue exists but is empty, or just say nothing is playing
            let content = "❌ | Nothing is currently playing to show a menu for. Use `/play` to start some music!";
            const components = [];
            if (queue) { // Queue object exists but no current track (i.e., it's empty)
                 content = "❌ | The queue is empty. Add some music to get started!";
                 components.push(new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('musicmenu_add_track') // Allow adding track
                        .setLabel('➕ Add First Song')
                        .setStyle(ButtonStyle.Success)
                ));
            }
            return interaction.reply({ content, components, ephemeral: true });
        }
        if (interaction.member.voice.channel.id !== queue.channel?.id) {
            return interaction.reply({ content: "You need to be in the same voice channel as me to use the music menu.", ephemeral: true });
        }

        const initialMenuPayload = await generateMenuMessage(interaction, player);
        const menuMessage = await interaction.reply(initialMenuPayload);

        const collector = menuMessage.createMessageComponentCollector({
            filter: i => i.member.voice.channel && i.member.voice.channel.id === queue.channel?.id,
            time: 15 * 60 * 1000 // 15 minutes
        });

        collector.on('collect', async i => {
            // If the interaction is to show a modal (musicmenu_add_track),
            // i.showModal() will be its own acknowledgement.
            // For other interactions, deferUpdate to allow editing the original message.
            if (i.customId !== 'musicmenu_add_track') {
                await i.deferUpdate(); 
            }

            const currentQueue = player.nodes.get(i.guildId);
            if (!currentQueue) { // Queue might have been destroyed
                await i.followUp({ content: "The music queue is no longer available.", ephemeral: true });
                collector.stop("queue_destroyed");
                // Edit message to reflect inactive state
                await menuMessage.edit({ 
                    content: "Music session ended.", 
                    embeds: [new EmbedBuilder().setTitle("🎶 Music Menu 🎶").setDescription("Session ended.").setColor(0xFF0000)], 
                    components: [] 
                });
                return;
            }
            if (!i.member.voice.channel || i.member.voice.channel.id !== currentQueue.channel?.id) {
                await i.followUp({ content: "You must be in the same voice channel as the bot to use these controls.", ephemeral: true });
                return;
            }

            let actionFeedback = "";
            let playbackEnded = false;

            try {
                if (i.customId === 'musicmenu_pause_resume') {
                    if (!currentQueue.currentTrack) {
                        actionFeedback = "❌ | Nothing is playing to pause/resume.";
                        playbackEnded = true; // Treat as if playback ended if no track
                    } else {
                        const isPaused = currentQueue.node.isPaused();
                        if (isPaused) {
                            currentQueue.node.resume();
                            actionFeedback = "▶️ | Resumed the music!";
                        } else {
                            currentQueue.node.pause();
                            actionFeedback = "⏸️ | Paused the music!";
                        }
                    }
                } else if (i.customId === 'musicmenu_skip') {
                    if (!currentQueue.currentTrack) {
                        actionFeedback = "❌ | Nothing to skip.";
                        playbackEnded = true;
                    } else {
                        const skippedTrack = currentQueue.currentTrack;
                        const success = currentQueue.node.skip();
                        if (success) {
                            actionFeedback = `⏭️ | Skipped **${skippedTrack.title}**.`;
                            if (!currentQueue.currentTrack && currentQueue.tracks.size === 0 && currentQueue.repeatMode === 0) { // Skipped last song, no loop
                                playbackEnded = true;
                                actionFeedback += "\nQueue has finished.";
                            }
                        } else {
                            actionFeedback = "❌ | Could not skip the track (queue might be empty or an error occurred).";
                            if (!currentQueue.currentTrack) playbackEnded = true;
                        }
                    }
                } else if (i.customId === 'musicmenu_stop') {
                    actionFeedback = "⏹️ | Music stopped, queue cleared, and I've left the voice channel.";
                    currentQueue.delete(); // Stops music, clears tracks, and disconnects.
                    playbackEnded = true; // Mark for collector stop and final message edit
                } else if (i.customId === 'musicmenu_volume') {
                    if (i.isStringSelectMenu()) {
                        if (!currentQueue.currentTrack) {
                             actionFeedback = "❌ | Nothing is playing to change volume for.";
                             playbackEnded = true;
                        } else {
                            const volume = parseInt(i.values[0]);
                            currentQueue.node.setVolume(volume);
                            actionFeedback = `🔊 | Volume set to ${volume}%.`;
                        }
                    }
                } else if (i.customId === 'musicmenu_repeat_mode') {
                    if (i.isStringSelectMenu()) {
                        // currentQueue is guaranteed to exist here by checks at the start of 'collect'
                        const mode = parseInt(i.values[0]);
                        const oldMode = currentQueue.repeatMode; // Store old mode for comparison/feedback
                        currentQueue.setRepeatMode(mode); // Attempt to set the mode

                        // Check if the mode was actually changed.
                        // This is more reliable if setRepeatMode's return value is inconsistent (e.g., undefined on success)
                        // or if it doesn't throw an error on a soft failure.
                        if (currentQueue.repeatMode === mode) {
                            actionFeedback = `🔁 | Repeat mode set to **${repeatModeMap[mode]}**.`;
                        } else {
                            actionFeedback = `❌ | Tried to set repeat mode to **${repeatModeMap[mode]}**, but it's still **${repeatModeMap[oldMode]}**.`;
                        }
                    } else {
                        actionFeedback = "❌ | Invalid interaction type for repeat mode.";
                    }
                } else if (i.customId === 'musicmenu_add_track') {
                    // For 'musicmenu_add_track', i.showModal() is the direct reply to interaction 'i'.
                    // No prior deferUpdate() on 'i' is needed or allowed for this specific customId.
                    const modal = new ModalBuilder()
                        .setCustomId(`musicmenu_addtrack_modal_${i.id}`) // CRITICAL: Set customId for the modal
                        .setTitle('Add Track to Queue');
                    const songInput = new TextInputBuilder()
                        .setCustomId('song_query_input')
                        .setLabel("Song Name or YouTube URL")
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('e.g., Never Gonna Give You Up or YouTube link')
                        .setRequired(true);
                    modal.addComponents(new ActionRowBuilder().addComponents(songInput));
                    await i.showModal(modal);
                    // From this point, 'i' (the ButtonInteraction) has been handled.
                    // Subsequent logic will deal with modalSubmitInteraction.
                    
                    let modalActionFeedback = ""; // Specific feedback for this modal interaction

                    try {
                        const modalSubmitInteraction = await i.awaitModalSubmit({
                            filter: mi => mi.customId === `musicmenu_addtrack_modal_${i.id}` && mi.user.id === i.user.id,
                            time: 60000 
                        });
                        // modalSubmitInteraction is a *new* interaction (ModalSubmitInteraction).
                        await modalSubmitInteraction.deferUpdate(); // Acknowledge the modal submission itself.
                        const query = modalSubmitInteraction.fields.getTextInputValue('song_query_input');

                        // Re-fetch the queue to ensure it's still valid after awaitModalSubmit
                        const liveQueue = player.nodes.get(i.guildId);

                        if (!liveQueue) {
                            modalActionFeedback = "❌ | The music queue is no longer available to add tracks to.";
                            playbackEnded = true; // Mark for collector stop and final message edit
                            actionFeedback = "Music session ended while trying to add a track."; // For the main finalEmbed
                        } else {
                            const searchResult = await player.search(query, { requestedBy: i.user });

                            if (!searchResult || !searchResult.hasTracks()) {
                                modalActionFeedback = `❌ | No results found for \`${query}\`!`;
                            } else {
                                const trackToAdd = searchResult.tracks[0];
                                liveQueue.addTrack(searchResult.playlist ? searchResult.playlist : trackToAdd); // Use liveQueue
                                modalActionFeedback = searchResult.playlist ? `🎶 | Queued playlist **${searchResult.playlist.title}**` : `🎶 | Queued **${trackToAdd.title}**`;

                                if (!liveQueue.connection) { // If bot wasn't connected
                                    try {
                                        await liveQueue.connect(i.member.voice.channel);
                                    } catch (connectErr) {
                                        console.error(`[${i.guildId}] Error connecting to VC for add track:`, connectErr);
                                        modalActionFeedback += "\n⚠️ | Could not join your voice channel.";
                                        // Menu will update based on liveQueue's state.
                                    }
                                }
                                
                                // Only attempt to play if connection is established
                                if (liveQueue.connection && !liveQueue.node.isPlaying() && !liveQueue.node.isPaused()) {
                                    try {
                                        await liveQueue.node.play();
                                    } catch (playErr) {
                                        console.error(`[${i.guildId}] Error auto-playing after add track:`, playErr);
                                        modalActionFeedback += " (But I couldn't start playing automatically)";
                                    }
                                } else if (!liveQueue.connection && (!liveQueue.node.isPlaying() && !liveQueue.node.isPaused())) {
                                    // Connection failed, "Could not join" is already in modalActionFeedback.
                                }
                            }
                        }
                        if (modalActionFeedback) { // Send feedback from modal interaction
                           await modalSubmitInteraction.followUp({ content: modalActionFeedback, ephemeral: true });
                        }
                    } catch (err) { // Modal timeout or other error during modal processing
                        if (err.code === 'InteractionCollectorError' && err.message.toLowerCase().includes('time')) {
                            // Modal timed out (or user dismissed), no explicit error message needed for this.
                        } else {
                            console.error(`[${i.guildId}] Error during add track modal processing:`, err);
                            // If modalSubmitInteraction was defined and deferred, attempt to use it for feedback.
                            // The original button interaction 'i' was already handled by showModal.
                            if (typeof modalSubmitInteraction !== 'undefined' && (modalSubmitInteraction.deferred || modalSubmitInteraction.replied)) {
                               await modalSubmitInteraction.followUp({ content: '❌ | An error occurred while processing your song request.', ephemeral: true }).catch(e => {
                                   console.error(`[${i.guildId}] MusicMenu: Error sending follow-up for modal processing error: ${e.message}`);
                               });
                           }
                        }
                    }
                    // Clear main actionFeedback as modal interaction handles its own feedback.
                    // The menu update will happen based on playbackEnded or the general update logic.
                    if (!playbackEnded) actionFeedback = ""; // Avoid main loop sending generic feedback if modal had specific one or no error
                }

                if (playbackEnded) {
                    collector.stop(i.customId === 'musicmenu_stop' ? "stopped_by_user" : "playback_ended");
                    const finalEmbed = new EmbedBuilder()
                        .setTitle("🎶 Music Menu 🎶")
                        .setDescription(actionFeedback || "Playback has ended or was stopped.")
                        .setColor(0xFF0000);
                    
                    const finalComponents = menuMessage.components.map(row =>
                        new ActionRowBuilder().addComponents(
                            row.components.map(c => {
                                if (c.type === ComponentType.Button) return ButtonBuilder.from(c).setDisabled(true);
                                if (c.type === ComponentType.StringSelectMenu) return StringSelectMenuBuilder.from(c).setDisabled(true);
                                return c; // Should not happen
                            })
                        )
                    );
                    await menuMessage.edit({ embeds: [finalEmbed], components: finalComponents });
                    if (actionFeedback && i.customId !== 'musicmenu_stop') { // Stop button already implies its action
                         await i.followUp({ content: actionFeedback, ephemeral: true });
                    }
                } else {
                    // If queue still exists and playing, update the menu
                    const q = player.nodes.get(i.guildId); // Re-fetch to be absolutely sure
                    if (q && q.currentTrack) {
                        const updatedMenuPayload = await generateMenuMessage(i, player);
                        await menuMessage.edit(updatedMenuPayload);
                    } else { // Something unexpected happened, queue died
                         collector.stop("unexpected_queue_end");
                         await menuMessage.edit({ 
                            content: "Music session unexpectedly ended.", 
                            embeds: [new EmbedBuilder().setTitle("🎶 Music Menu 🎶").setDescription("Session ended.").setColor(0xFF0000)], 
                            components: [] 
                        });
                    }
                    if (actionFeedback) {
                        await i.followUp({ content: actionFeedback, ephemeral: true });
                    }
                }

            } catch (error) {
                console.error(`[${i.guildId}] Error processing music menu interaction (${i.customId}):`, error);
                await i.followUp({ content: `❌ | An error occurred: ${error.message}`, ephemeral: true }).catch(() => {});
            }
        });

        collector.on('end', async (collected, reason) => {
            // Reasons like "stopped_by_user", "playback_ended", "queue_destroyed", "unexpected_queue_end"
            // mean the message was likely already updated and components disabled by the 'collect' event.
            // This 'end' handler is primarily for 'time' or other unhandled stops.
            if (reason === "time" || (reason !== "stopped_by_user" && reason !== "playback_ended" && reason !== "queue_destroyed" && reason !== "unexpected_queue_end")) {
                try {
                    const finalPayload = await generateMenuMessage(interaction, player, { forceDisable: true });
                    const q = player.nodes.get(interaction.guildId);
                    let endContent = "Music menu timed out and is no longer active.";
                    if (!q || !q.currentTrack) {
                        endContent = "Music session ended or menu timed out.";
                        finalPayload.embeds = [new EmbedBuilder().setTitle("🎶 Music Menu 🎶").setDescription(endContent).setColor(0xFFCC00)];
                    }
                    
                    await menuMessage.edit({
                        content: q && q.currentTrack ? null : endContent, // Show content if music actually stopped
                        embeds: finalPayload.embeds,
                        components: finalPayload.components // These are already disabled by forceDisable
                    }).catch(e => console.warn(`[${interaction.guildId}] MusicMenu: Error editing message on collector timeout: ${e.message}`));
                } catch (editError) {
                    console.warn(`[${interaction.guildId}] MusicMenu: Could not edit message on collector end (reason: ${reason}): ${editError.message}`);
                }
            }
        });
    }
};
