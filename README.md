# Pinky Discord Bot

Pinky is a multi-functional Discord bot featuring AI-powered chat capabilities via Google Gemini, music playback, message management, and persistent channel settings. It's built with Node.js, Discord.js, Prisma for database interaction, and supports Docker for easy deployment.

## Features

*   **AI Chatbot (Google Gemini):**
    *   Engage in conversations with Pinky.
    *   Responds to mentions or in "free chat" enabled channels.
    *   Remembers conversation history per channel.
    *   Ability to "forget" history for a channel.
    *   Ability to "remember" recent messages to build context.
    *   Customizable persona (Vietnamese, humorous, naughty).
    *   Can react to messages based on AI response.
*   **Music Playback:**
    *   Play songs and playlists from YouTube.
    *   Interactive music menu with controls for:
        *   Pause/Resume
        *   Skip
        *   Stop (clears queue and disconnects)
        *   Volume adjustment
        *   Repeat modes (Off, Track, Queue, Autoplay)
        *   Add tracks directly from the menu.
    *   Slash commands for `play`, `stop`, `skip`, `pause`.
*   **Channel Management:**
    *   Toggle chatbot functionality per channel.
    *   Toggle "free chat" mode per channel (bot responds to all messages).
    *   Clear messages in a channel (requires permissions).
*   **Database Integration (PostgreSQL with Prisma):**
    *   Persists chat history.
    *   Saves channel-specific settings (chatbot enabled, free chat enabled).
*   **Docker Support:**
    *   Includes a `Dockerfile` for containerized deployment.
*   **Graceful Shutdown:** Ensures Prisma client disconnects properly.

## Prerequisites

*   Node.js (v20 or higher recommended, as per `Dockerfile`)
*   npm (usually comes with Node.js)
*   A Discord Bot Token and Client ID
*   A Google Gemini API Key
*   A running PostgreSQL database instance.
*   Docker (optional, for containerized deployment)

## Setup and Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/thanhnguyen96/discord-bot-pinky.git
    cd discord-bot-pinky
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set up environment variables:**
    Copy the example environment file and fill in your credentials:
    ```bash
    cp .env.example .env
    ```
    Open `.env` and update the following variables:
    *   `BOT_TOKEN`: Your Discord bot token.
    *   `CLIENT_ID`: Your Discord application's client ID.
    *   `GEMINI_API_KEY`: Your Google Gemini API key.
    *   `POSTGRES_USER`: Your PostgreSQL username.
    *   `POSTGRES_PASSWORD`: Your PostgreSQL password.
    *   `POSTGRES_DB`: Your PostgreSQL database name.
    *   `DATABASE_URL`: The connection string for your PostgreSQL database.
        *   For local development, it might look like: `postgresql://your_postgres_user:your_postgres_password@localhost:5432/your_postgres_db?schema=public` (adjust port if necessary, e.g., `5435`).
        *   For Docker setups (if using Docker Compose with a `db` service), it might be: `postgresql://your_postgres_user:your_postgres_password@db:5432/your_postgres_db?schema=public`.
    *   `GUILD_ID` (Optional): Your Discord server ID for faster registration of slash commands during development. Remove or leave blank for global command registration.

4.  **Set up the database with Prisma:**
    Ensure your `DATABASE_URL` in `.env` is correctly pointing to your PostgreSQL database.

    Generate Prisma Client:
    ```bash
    npx prisma generate
    ```
    Apply database migrations:
    ```bash
    npx prisma migrate deploy
    ```

## Running the Bot

### Locally

```bash
npm start
```

### Using Docker

1.  **Build the Docker image:**
    ```bash
    docker build -t pinky-bot .
    ```

2.  **Run the Docker container:**
    Make sure your PostgreSQL database is accessible from the Docker container. If your database is also running in Docker (e.g., via Docker Compose), ensure they are on the same network.

    You'll need to pass the environment variables to the container. One way is using an `.env` file with `docker run --env-file .env ...`:
    ```bash
    docker run --env-file .env -d --name pinky-bot-container pinky-bot
    ```
    *(Note: For a production Docker setup, consider using Docker Compose for easier management of the bot and its database.)*

    The `CMD` in the `Dockerfile` (`npx prisma migrate deploy && node index.js`) will automatically apply migrations and then start the bot.

## Available Slash Commands

The bot registers the following slash commands:

*   `/toggle_chatbot`: Toggle the chatbot for the current channel.
*   `/forget`: Resets the chatbot's conversation history for this channel.
*   `/toggle_free_chat`: Toggle free chat in the current channel (bot responds to all messages).
*   `/clear`: Clear up to 100 messages in the current channel (requires Manage Messages permission).
*   `/remember count:<number>`: Fetches recent messages and saves them to the bot's memory for this channel.
*   `/play query:<song_name_or_url>`: Plays audio from a YouTube URL or search query in your voice channel.
*   `/stop`: Stops the music, clears the queue, and disconnects the bot.
*   `/skip`: Skips the current song.
*   `/pause`: Pauses or resumes the current song.
*   `/music_menu`: Displays an interactive music menu.

## Database

This project uses Prisma as an ORM to interact with a PostgreSQL database.

*   **Schema:** The database schema is defined in `prisma/schema.prisma`.
*   **Migrations:** Migrations are located in the `prisma/migrations` directory.
    *   To create a new migration after schema changes (development): `npx prisma migrate dev --name <migration_name>`
    *   To apply migrations (production/deployment): `npx prisma migrate deploy`
    *   To generate Prisma Client: `npx prisma generate`

The database stores:
*   `chatHistories`: Records of chat messages for AI context.
*   `channelSettings`: Per-channel settings like `isChatbotEnabled` and `isFreeChat`.

## Environment Variables

All necessary environment variables are listed in `.env.example`. Ensure you have a `.env` file with these variables configured correctly.

Key variables include:
*   `BOT_TOKEN`
*   `CLIENT_ID`
*   `GEMINI_API_KEY`
*   `DATABASE_URL`
*   `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` (used to construct `DATABASE_URL` or for Docker Compose setups)
*   `GUILD_ID` (optional)

## Project Structure

```
discord-bot-pinky/
├── prisma/                  # Prisma schema and migrations
│   ├── migrations/
│   └── schema.prisma
├── src/                     # Source code
│   ├── commands/            # Slash command handlers (categorized)
│   │   ├── chat/
│   │   └── music/
│   ├── events/              # Discord event handlers
│   ├── gui/                 # GUI generation (e.g., music menu)
│   ├── commandManager.js    # Registers slash commands
│   ├── config.js            # Loads and validates .env variables
│   ├── databaseService.js   # Prisma database interaction logic
│   ├── geminiService.js     # Google Gemini API interaction
│   └── prismaClient.js      # Prisma client instance
├── .env                     # Local environment variables (ignored by git)
├── .env.example             # Example environment variables
├── Dockerfile               # Docker configuration
├── index.js                 # Main application entry point
├── package.json
└── README.md                # This file
```

## Contributing

Contributions are welcome! Please feel free to submit a pull request or open an issue.

## License

This project is licensed under the ISC License - see the `package.json` file for details.