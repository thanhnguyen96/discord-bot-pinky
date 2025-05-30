// src/events/playerHandler.js
const { generateMenuMessage } = require('../gui/musicMenuGUI');
const { EmbedBuilder } = require('discord.js');

async function safeEdit(message, payload) {
    if (!message || !message.guildId || !message.channel) return;
    try {
        const fetchedMessage = await message.channel.messages.fetch(message.id).catch(() => null);
        if (fetchedMessage) {
            await fetchedMessage.edit(payload);
        } else {
            console.warn(`[${message.guildId}] PlayerHandler: Menu message ${message.id} not found for editing.`);
            // Consider removing from activeMusicMenus if message is confirmed gone,
            // but this function doesn't have direct access to sharedStates for that.
            // The calling event handlers (disconnect, error) will handle removal.
        }
    } catch (e) {
        if (e.code !== 10008 && e.code !== 50001) { // 10008: Unknown Message, 50001: Missing Access
             console.warn(`[${message.guildId}] PlayerHandler: Error editing menu message ${message.id}: ${e.message}`);
        }
    }
}

module.exports = {
    name: 'playerHandler',
    async initialize(player, sharedStates, client) {
        if (!player || !player.events) {
            console.error("Player instance or player.events is not available for playerHandler.");
            return;
        }

        player.events.on('playerStart', async (queue, track) => {
            console.log(`[${queue.guild.id}] Player Event: playerStart - ${track.title}`);
            const menuData = sharedStates.activeMusicMenus?.get(queue.guild.id);
            if (menuData && menuData.menuMessage) {
                try {
                    const mockInteraction = { guildId: queue.guild.id, client: client, user: track.requestedBy };
                    const updatedPayload = await generateMenuMessage(mockInteraction, player);
                    await safeEdit(menuData.menuMessage, updatedPayload);
                } catch (error) {
                    console.error(`[${queue.guild.id}] Error updating menu on playerStart:`, error);
                }
            }
        });

        player.events.on('queueEnd', async (queue) => {
            console.log(`[${queue.guild.id}] Player Event: queueEnd`);
            const menuData = sharedStates.activeMusicMenus?.get(queue.guild.id);
            if (menuData && menuData.menuMessage) {
                try {
                    const mockInteraction = { guildId: queue.guild.id, client: client, user: client.user };
                    const updatedPayload = await generateMenuMessage(mockInteraction, player, { forceDisable: true });
                    if (updatedPayload.embeds && updatedPayload.embeds[0]) {
                        updatedPayload.embeds[0].setDescription("✅ | Queue has finished! Add more songs or use `/play`.").setColor(0x00FF00);
                    } else {
                         updatedPayload.embeds = [new EmbedBuilder().setTitle("🎶 Music Menu 🎶").setDescription("✅ | Queue has finished!").setColor(0x00FF00)];
                    }
                    await safeEdit(menuData.menuMessage, updatedPayload);
                    // The collector might time out on its own, or be stopped if user interacts.
                    // If we want to aggressively stop it: menuData.collector?.stop('queue_ended_globally');
                } catch (error) {
                    console.error(`[${queue.guild.id}] Error updating menu on queueEnd:`, error);
                }
            }
        });

        player.events.on('disconnect', async (queue) => {
            console.log(`[${queue.guild.id}] Player Event: disconnect`);
            const menuData = sharedStates.activeMusicMenus?.get(queue.guild.id);
            if (menuData && menuData.menuMessage) {
                try {
                    const mockInteraction = { guildId: queue.guild.id, client: client, user: client.user };
                    const updatedPayload = await generateMenuMessage(mockInteraction, player, { forceDisable: true });
                     if (updatedPayload.embeds && updatedPayload.embeds[0]) {
                        updatedPayload.embeds[0].setDescription("⏹️ | I've been disconnected. The music session has ended.").setColor(0xFF0000);
                    } else {
                         updatedPayload.embeds = [new EmbedBuilder().setTitle("🎶 Music Menu 🎶").setDescription("⏹️ | Disconnected.").setColor(0xFF0000)];
                    }
                    await safeEdit(menuData.menuMessage, updatedPayload);
                    menuData.collector?.stop('bot_disconnected');
                    sharedStates.activeMusicMenus.delete(queue.guild.id);
                } catch (error) {
                    console.error(`[${queue.guild.id}] Error updating menu on disconnect:`, error);
                }
            }
        });
        
        player.events.on('error', (queue, error) => {
            console.error(`[${queue.guild.id}] Player Error:`, error.message);
            const menuData = sharedStates.activeMusicMenus?.get(queue.guild.id);
            if (menuData && menuData.menuMessage) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle("🎶 Music Menu - Error 🎶")
                    .setDescription(`⚠️ | A player error occurred: ${error.message.substring(0, 200)}`)
                    .setColor(0xFF0000);
                safeEdit(menuData.menuMessage, { embeds: [errorEmbed], components: [] });
                menuData.collector?.stop('player_error');
                sharedStates.activeMusicMenus.delete(queue.guild.id);
            }
        });
        console.log("Player event handlers initialized.");
    }
};