const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ComponentType,
    StringSelectMenuBuilder
} = require('discord.js');
const { generateMenuMessage, repeatModeMap } = require('../../gui/musicMenuGUI');

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
            let replyContent = "❌ | Nothing is currently playing to show a menu for. Use `/play` to start some music!";
            const components = [];
            if (queue) { // Queue object exists but no current track (i.e., it's empty)
                 replyContent = "❌ | The queue is empty. Add some music to get started!";
                 components.push(new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('musicmenu_add_track')
                        .setLabel('➕ Add First Song')
                        .setStyle(ButtonStyle.Success)
                ));
            }
            return interaction.reply({ content, components, ephemeral: true });
        }
        if (interaction.member.voice.channel.id !== queue.channel?.id) {
            return interaction.reply({ content: "You must be in the same voice channel as the bot to use the music menu.", ephemeral: true });
        }

        const initialMenuPayload = await generateMenuMessage(interaction, player);
        const menuMessage = await interaction.reply({ ...initialMenuPayload, fetchReply: true });

        const collector = menuMessage.createMessageComponentCollector({
            filter: i => i.member.voice.channel && i.member.voice.channel.id === queue.channel?.id,
            time: 15 * 60 * 1000 // 15 minutes
        });

        // Store the active menu
        if (sharedStates.activeMusicMenus) {
            const existingMenuData = sharedStates.activeMusicMenus.get(interaction.guildId);
            if (existingMenuData && existingMenuData.collector) {
                existingMenuData.collector.stop('new_menu_created'); // This will trigger its 'end' event for cleanup
            }
            sharedStates.activeMusicMenus.set(interaction.guildId, { menuMessage, collector });
        }

        collector.on('collect', async i => {
            if (i.customId !== 'musicmenu_add_track') {
                await i.deferUpdate();
            }

            const currentQueue = player.nodes.get(i.guildId);

            if (!currentQueue) {
                await i.followUp({ content: "The music queue is no longer available.", ephemeral: true }).catch(() => {});
                collector.stop("queue_destroyed");
                await safeEdit(menuMessage, {
                    content: "Music session ended.",
                    embeds: [new EmbedBuilder().setTitle("🎶 Music Menu 🎶").setDescription("Session ended.").setColor(0xFF0000)],
                    components: []
                });
                return;
            }

            if (!i.member.voice.channel || i.member.voice.channel.id !== currentQueue.channel?.id) {
                await i.followUp({ content: "You must be in the same voice channel as the bot to use these controls.", ephemeral: true }).catch(() => {});
                return;
            }

            let result = { feedback: "", playbackEndedByAction: false, error: null };

            try {
                switch (i.customId) {
                    case 'musicmenu_pause_resume':
                        result = await handlePauseResume(currentQueue);
                        break;
                    case 'musicmenu_skip':
                        result = await handleSkip(currentQueue);
                        break;
                    case 'musicmenu_stop':
                        result = await handleStop(currentQueue);
                        break;
                    case 'musicmenu_volume':
                        if (i.isStringSelectMenu()) {
                            result = await handleVolumeChange(i, currentQueue);
                        }
                        break;
                    case 'musicmenu_repeat_mode':
                        if (i.isStringSelectMenu()) {
                            result = await handleRepeatModeChange(i, currentQueue);
                        }
                        break;
                    case 'musicmenu_add_track':
                        // handleShowAddTrackModal will handle its own interaction (i.showModal)
                        // and subsequent modalSubmitInteraction.
                        // It returns a result that might affect playbackEndedByAction for the main menu update.
                        result = await handleShowAddTrackModal(i, player);
                        // No deferUpdate() was called on 'i' for this customId,
                        // so updateMenuAndSendFeedback will use i.followUp for feedback if needed,
                        // or just update the menu.
                        break;
                    default:
                        console.warn(`[${i.guildId}] Unknown music menu interaction: ${i.customId}`);
                        result.feedback = "❓ | Unknown action.";
                        break;
                }
            } catch (error) {
                console.error(`[${i.guildId}] Error processing music menu interaction (${i.customId}):`, error);
                result.error = `An error occurred: ${error.message}`;
            }

            await updateMenuAndSendFeedback(i, menuMessage, player, result, collector);
        });

        collector.on('end', async (collected, reason) => {
            const activeReasonsHandledInCollect = ["stopped_by_user", "playback_ended", "queue_destroyed", "unexpected_queue_end", "modal_action_ended_playback", "playback_ended_empty_queue"];
            // Remove from active menus if this collector is the one stored
            if (sharedStates.activeMusicMenus && sharedStates.activeMusicMenus.get(interaction.guildId)?.collector === collector) {
                sharedStates.activeMusicMenus.delete(interaction.guildId);
            }
            if (!activeReasonsHandledInCollect.includes(reason)) { // Primarily for "time"
                try {
                    const finalPayload = await generateMenuMessage(interaction, player, { forceDisable: true });
                    const q = player.nodes.get(interaction.guildId);
                    let endContent = "Music menu timed out and is no longer active.";
                    if (!q || !q.currentTrack) {
                        endContent = "Music session ended or menu timed out.";
                        // Ensure embeds are an array
                        if (finalPayload.embeds && finalPayload.embeds.length > 0) {
                            finalPayload.embeds[0].setDescription(endContent).setColor(0xFFCC00);
                        } else {
                            finalPayload.embeds = [new EmbedBuilder().setTitle("🎶 Music Menu 🎶").setDescription(endContent).setColor(0xFFCC00)];
                        }
                    }

                    await safeEdit(menuMessage, {
                        content: q && q.currentTrack ? null : endContent, // Show content if music actually stopped
                        embeds: finalPayload.embeds,
                        components: finalPayload.components // These are already disabled by forceDisable
                    });
                } catch (editError) {
                    console.warn(`[${interaction.guildId}] MusicMenu: Could not edit message on collector end (reason: ${reason}): ${editError.message}`);
                }
            }
        });
    }
};

async function handlePauseResume(queue) {
    if (!queue || !queue.currentTrack) {
        return { feedback: "❌ | Nothing is playing to pause/resume.", playbackEndedByAction: !queue };
    }
    const isPaused = queue.node.isPaused();
    const success = isPaused ? queue.node.resume() : queue.node.pause();
    if (success) {
        return { feedback: isPaused ? "▶️ | Resumed!" : "⏸️ | Paused!", playbackEndedByAction: false };
    }
    return { feedback: `❌ | Could not ${isPaused ? 'resume' : 'pause'}.`, error: "Operation failed" };
}

async function handleSkip(queue) {
    if (!queue || !queue.currentTrack) {
        return { feedback: "❌ | Nothing to skip.", playbackEndedByAction: !queue };
    }
    const skippedTrack = queue.currentTrack;
    const success = queue.node.skip();
    if (success) {
        let feedback = `⏭️ | Skipped **${skippedTrack.title}**.`;
        // If skipping last song and no loop that would add more tracks (e.g. queue loop, autoplay)
        const playbackEnded = !queue.currentTrack && queue.tracks.size === 0 && (queue.repeatMode === 0 || queue.repeatMode === 1);
        if (playbackEnded) feedback += "\nQueue has finished.";
        return { feedback, playbackEndedByAction: playbackEnded };
    }
    return { feedback: "❌ | Could not skip.", error: "Skip failed", playbackEndedByAction: !queue.currentTrack };
}

async function handleStop(queue) {
    if (!queue) return { feedback: "❌ | No queue to stop.", playbackEndedByAction: true};
    queue.delete(); // Stops music, clears tracks, and disconnects.
    return { feedback: "⏹️ | Music stopped, queue cleared.", playbackEndedByAction: true };
}

async function handleVolumeChange(interaction, queue) {
    if (!queue || !queue.currentTrack) {
        return { feedback: "❌ | Nothing is playing to change volume for.", playbackEndedByAction: !queue };
    }
    const volume = parseInt(interaction.values[0]);
    queue.node.setVolume(volume);
    return { feedback: `🔊 | Volume set to ${volume}%.`, playbackEndedByAction: false };
}

async function handleRepeatModeChange(interaction, queue) {
    if (!queue) return { feedback: "❌ | No queue to set repeat mode for.", playbackEndedByAction: true};

    const mode = parseInt(interaction.values[0]);
    const success = queue.setRepeatMode(mode); // discord-player v6 returns boolean
    if (success || queue.repeatMode === mode) { // Check actual mode if setRepeatMode is void
        return { feedback: `🔁 | Repeat mode: **${repeatModeMap[mode]}**.`, playbackEndedByAction: false };
    }
    return { feedback: `❌ | Could not set repeat mode to **${repeatModeMap[mode]}**.`, error: "Set repeat mode failed" };
}

async function handleShowAddTrackModal(interaction, player) {
    const modal = new ModalBuilder()
        .setCustomId(`musicmenu_addtrack_modal_${interaction.id}`)
        .setTitle('Add Track to Queue');
    const songInput = new TextInputBuilder()
        .setCustomId('song_query_input')
        .setLabel("Song Name or YouTube URL")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g., Never Gonna Give You Up or YouTube link')
        .setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(songInput));
    await interaction.showModal(modal);

    try {
        const modalSubmitInteraction = await interaction.awaitModalSubmit({
            filter: mi => mi.customId === `musicmenu_addtrack_modal_${interaction.id}` && mi.user.id === interaction.user.id,
            time: 60000
        });
        await modalSubmitInteraction.deferUpdate(); // Acknowledge modal submission

        const query = modalSubmitInteraction.fields.getTextInputValue('song_query_input');
        const liveQueue = player.nodes.get(interaction.guildId);

        let modalFeedback = "";
        let playbackPotentiallyEnded = !liveQueue;

        if (!liveQueue) {
            modalFeedback = "❌ | Music queue is no longer available.";
        } else {
            const searchResult = await player.search(query, { requestedBy: interaction.user });
            if (!searchResult || !searchResult.hasTracks()) {
                modalFeedback = `❌ | No results for \`${query}\`!`;
            } else {
                liveQueue.addTrack(searchResult.playlist ? searchResult.playlist : searchResult.tracks[0]);
                modalFeedback = searchResult.playlist ? `🎶 | Queued playlist **${searchResult.playlist.title}**` : `🎶 | Queued **${searchResult.tracks[0].title}**`;

                if (!liveQueue.connection) {
                    try {
                        await liveQueue.connect(interaction.member.voice.channel);
                    } catch (connectErr) {
                        console.error(`[${interaction.guildId}] Error connecting to VC for add track:`, connectErr);
                        modalFeedback += "\n⚠️ | Could not join your voice channel.";
                    }
                }
                if (liveQueue.connection && !liveQueue.node.isPlaying() && !liveQueue.node.isPaused()) {
                    try {
                        await liveQueue.node.play();
                    } catch (playErr) {
                        console.error(`[${interaction.guildId}] Error auto-playing after add track:`, playErr);
                        modalFeedback += " (But couldn't start playing automatically)";
                    }
                }
            }
        }
        await modalSubmitInteraction.followUp({ content: modalFeedback, ephemeral: true }).catch(() => {});
        return { feedback: "", playbackEndedByAction: playbackPotentiallyEnded }; // Main menu will refresh

    } catch (err) {
        if (!(err.code === 'InteractionCollectorError' && err.message.toLowerCase().includes('time'))) { // Modal timeout
            console.error(`[${interaction.guildId}] Error in add track modal processing:`, err);
            // No followUp here as modalSubmitInteraction might not be available or replied to.
            // The main menu will refresh, and if an error occurred, it will be logged.
        }
        const currentQueueState = player.nodes.get(interaction.guildId);
        return { feedback: "", playbackEndedByAction: !currentQueueState, error: "Modal processing error" };
    }
}

async function updateMenuAndSendFeedback(interaction, menuMessage, player, result, collector) {
    const { feedback, playbackEndedByAction, error } = result;

    if (error && feedback) { // If error occurred, ensure feedback reflects it or is generic
        await interaction.followUp({ content: feedback || `❌ | An error occurred: ${error}`, ephemeral: true }).catch(() => {});
    } else if (error) {
        await interaction.followUp({ content: `❌ | An error occurred: ${error}`, ephemeral: true }).catch(() => {});
    } else if (feedback && interaction.customId !== 'musicmenu_add_track') { // Add track modal handles its own primary feedback
        await interaction.followUp({ content: feedback, ephemeral: true }).catch(() => {});
    }


    const currentQueue = player.nodes.get(interaction.guildId);
    const shouldStopCollector = playbackEndedByAction || !currentQueue || (!currentQueue.currentTrack && currentQueue.tracks.size === 0 && currentQueue.repeatMode === 0);

    if (shouldStopCollector) {
        let reason = "playback_ended";
        if (playbackEndedByAction && interaction.customId === 'musicmenu_stop') reason = "stopped_by_user";
        else if (!currentQueue) reason = "queue_destroyed";

        collector.stop(reason);

        const finalPayload = await generateMenuMessage(interaction, player, { forceDisable: true });
        let description = feedback || "Playback has ended or was stopped.";
        if (!currentQueue) description = "Music session ended.";

        if (finalPayload.embeds && finalPayload.embeds.length > 0) {
            finalPayload.embeds[0].setDescription(description).setColor(0xFF0000);
        } else {
            finalPayload.embeds = [new EmbedBuilder().setTitle("🎶 Music Menu 🎶").setDescription(description).setColor(0xFF0000)];
        }
        await safeEdit(menuMessage, finalPayload);

    } else if (currentQueue && (currentQueue.currentTrack || currentQueue.tracks.size > 0 || currentQueue.repeatMode !==0 )) { // Still active
        const updatedMenuPayload = await generateMenuMessage(interaction, player);
        await safeEdit(menuMessage, updatedMenuPayload);
    } else { // Queue exists but is truly empty and no loops will restart it
        collector.stop("playback_ended_empty_queue");
        const finalPayload = await generateMenuMessage(interaction, player, { forceDisable: true }); // GUI will show empty state
        await safeEdit(menuMessage, finalPayload);
    }
}

async function safeEdit(message, payload) {
    try {
        await message.edit(payload);
    } catch (e) {
        console.warn(`[${message.guildId}] MusicMenu: Error editing message: ${e.message}`);
    }
}
