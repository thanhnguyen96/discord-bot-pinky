// Require the necessary discord.js classes
const { Client, GatewayIntentBits, Partials } = require("discord.js");
const fs = require('node:fs');
const path = require('node:path');
const prisma = require('./src/prismaClient'); // For shutdown
const config = require('./src/config'); // Loads .env and validates

// Shared states that can be modified by commands and used by event handlers
const sharedStates = {
    enabledChatBot: true,
    freeChatChannels: new Set(),
};

// Create a new Client instance with necessary intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // Required to read message content
        GatewayIntentBits.GuildMembers, // If you need member information
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction] // Useful for events on older messages
});

// Load event handlers
const eventsPath = path.join(__dirname, 'src', 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client, sharedStates));
    } else {
        client.on(event.name, (...args) => event.execute(...args, client, sharedStates));
    }
}

// Log in to Discord with your client's token
client.login(config.BOT_TOKEN);

// Graceful shutdown for Prisma Client
async function shutdown(signal) {
    console.log(`\nReceived ${signal}. Shutting down gracefully...`);
    await prisma.$disconnect();
    console.log('Prisma Client disconnected.');
    process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
