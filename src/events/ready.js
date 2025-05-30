const databaseService = require("../databaseService");
const { registerSlashCommands } = require("../commandManager");
const { YoutubeiExtractor } = require("discord-player-youtubei");
const playerEventHandler = require('./playerHandler'); // Import the new handler

module.exports = {
  name: 'ready',
  once: true,
  async execute(readyClient, _clientFromIndex, actualSharedStates) {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);
    if (actualSharedStates.player) {
      try {
        await actualSharedStates.player.extractors.register(YoutubeiExtractor, {})
        console.log(
          "Successfully registered YouTubei extractor for discord-player."
        );
      } catch (error) {
        console.error("Error registering YouTubei extractor:", error);
      }
      // Initialize player event handlers
      playerEventHandler.initialize(actualSharedStates.player, actualSharedStates, readyClient);
    } else {
      console.warn(
        "Player instance not found in sharedStates during ready event. Music playback might not work."
      );
    }

    try {
      const allSettings = await databaseService.loadChannelSettings();
      allSettings.forEach((setting) => {
        if (
          setting.settings &&
          typeof setting.settings === "object" &&
          setting.settings.isFreeChat === true
        ) {
          actualSharedStates.freeChatChannels.add(setting.channelId);
        }
        if (
          setting.settings &&
          typeof setting.settings === "object" &&
          setting.settings.isChatbotEnabled === true
        ) {
          actualSharedStates.chatbotEnabledChannels.add(setting.channelId);
        }
      });
      console.log(
        `Loaded ${actualSharedStates.freeChatChannels.size} free chat channel settings from the database.`
      );
      console.log(
        `Loaded ${actualSharedStates.chatbotEnabledChannels.size} chatbot enabled channel settings from the database.`
      );
    } catch (error) {
      console.error("Error loading channel settings from database:", error);
    }
    await registerSlashCommands();
  },
};
