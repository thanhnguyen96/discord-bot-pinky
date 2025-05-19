const prisma = require('./prismaClient');

/**
 * Adds a chat message to the chatHistories table.
 * @param {string} channelId The ID of the channel where the message was sent.
 * @param {string} userId The ID of the user who sent the message.
 * @param {string} messageContent The content of the message.
 * @param {string} discordMessageId The original Discord message ID.
 * @param {Date} actualCreatedAt The original message creation timestamp (as a Date object).
 * @returns {Promise<object|null>} The created chat history entry, or null if skipped (e.g., duplicate).
 */
async function addChatMessage(channelId, userId, messageContent, discordMessageId, actualCreatedAt) {
  try {
    const newMessageEntry = await prisma.chatHistories.create({
      data: {
        discordMessageId: discordMessageId,
        channelId: channelId,
        userId: userId,
        message: messageContent,
        createdAt: actualCreatedAt,
      },
    });
    return newMessageEntry;
  } catch (error) {
    if (error.code === 'P2002') {
      return null; 
    }
    console.error('Error saving chat message to database:', error);
  }
}

async function getChatHistory(channelId, limit) {
    return prisma.chatHistories.findMany({
        where: { channelId: channelId },
        orderBy: { createdAt: 'asc' },
        take: limit,
    });
}

async function clearChatHistory(channelId) {
    return prisma.chatHistories.deleteMany({ where: { channelId: channelId } });
}

async function loadChannelSettings() {
    return prisma.channelSettings.findMany();
}

async function upsertChannelSetting(channelId, settingsData) {
    return prisma.channelSettings.upsert({
        where: { channelId: channelId },
        update: { settings: settingsData },
        create: { channelId: channelId, settings: settingsData },
    });
}

module.exports = {
    addChatMessage,
    getChatHistory,
    clearChatHistory,
    loadChannelSettings,
    upsertChannelSetting,
};