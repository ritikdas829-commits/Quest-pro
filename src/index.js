import 'dotenv/config';
import { Client, GatewayIntentBits, Collection, Partials } from 'discord.js';
import { readdirSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import deployCommands from './utils/deployCommands.js';
import { TokenStore } from './quest/tokenStore.js';
import * as dbModule from './utils/db.js';
import { handleButton as handlePremiumButton, handleModal as handlePremiumModal, buildPremiumLinkPanel } from './commands/premiumLink.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const col = {
    reset:  '\x1b[0m', bright: '\x1b[1m', cyan: '\x1b[96m',
    blue:   '\x1b[34m', white: '\x1b[97m', purple: '\x1b[35m',
    green:  '\x1b[92m', dim:   '\x1b[90m',
};

function banner() {
    const lines = [
        '',
        `${col.cyan}${col.bright}   ██████╗  ██████╗██╗   ██╗ ██╗${col.reset}`,
        `${col.cyan}${col.bright}  ██╔═══██╗██╔════╝██║   ██║███║${col.reset}`,
        `${col.blue}${col.bright}  ██║   ██║██║     ██║   ██║╚██║${col.reset}`,
        `${col.blue}${col.bright}  ██║▄▄ ██║██║     ╚██╗ ██╔╝ ██║${col.reset}`,
        `${col.white}${col.bright}  ╚██████╔╝╚██████╗ ╚████╔╝  ██║${col.reset}`,
        `${col.white}${col.bright}   ╚══▀▀═╝  ╚═════╝  ╚═══╝   ╚═╝${col.reset}`,
        '',
        `${col.dim}  ─────────────────────────────────────────────────${col.reset}`,
        `  ${col.green}●${col.reset} ${col.white}Quest Completer V1 - 5 Slots${col.reset}  ${col.dim}\vert{}${col.reset}   ${col.white}dsc.gg/synoraxdev${col.reset}`,
        `${col.dim}  ─────────────────────────────────────────────────${col.reset}`,
        '',
    ];
    for (const line of lines) process.stdout.write(line + '\n');
}

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) { console.error('DISCORD_TOKEN is not set.'); process.exit(1); }

// Safe MongoDB Connection
const connectDB = dbModule.connectDB || dbModule.default;
if (typeof connectDB === 'function') {
    try {
        await connectDB();
        console.log(`${col.green}● MongoDB Connected${col.reset}`);
    } catch (e) {
        console.warn(`${col.purple}● MongoDB Failed: ${e.message}${col.reset} — Bot chalega bina DB ke`);
    }
}

banner();
await deployCommands(TOKEN, process.env.DISCORD_CLIENT_ID);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMembers,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.User, Partials.GuildMember],
});

client.commands       = new Collection();
client.prefixCommands = new Collection();
client.tokenStore     = new TokenStore(TOKEN);
client.config         = { prefix: process.env.BOT_PREFIX };
client.prefix         = process.env.BOT_PREFIX;

client.getPrefix = function(guildId) {
    return process.env.BOT_PREFIX;
};

// Load Commands Dynamically
const commandFiles = readdirSync(join(__dirname, 'commands')).filter(f => f.endsWith('.js'));
for (const file of commandFiles) {
    const mod = await import(pathToFileURL(join(__dirname, 'commands', file)).href);
    if (mod.default) {
        const cmd = mod.default;
        if (cmd?.data)   client.commands.set(cmd.data.name, cmd);
        if (cmd?.prefix) client.prefixCommands.set(cmd.prefix, cmd);
    }
    for (const [key, cmd] of Object.entries(mod)) {
        if (['default', 'makeTokenStore', 'handleLinkModal', 'handleLinkPromptButton', 'runAutoquestForUser', 'buildPremiumLinkPanel', 'handleButton', 'handleModal'].includes(key)) continue;
        if (cmd?.data)   client.commands.set(cmd.data.name, cmd);
        if (cmd?.prefix) client.prefixCommands.set(cmd.prefix, cmd);
    }
}

// ── Interaction Create Handler ─────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isButton()) {
            if (
                interaction.customId.startsWith('link_slot_') ||
                interaction.customId.startsWith('unlink_slot_') ||
                interaction.customId.startsWith('select_slot_')
            ) {
                return await handlePremiumButton(interaction, client);
            }
        }

        if (interaction.isModalSubmit()) {
            if (interaction.customId.startsWith('link_modal_slot_')) {
                return await handlePremiumModal(interaction, client);
            }
        }

        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            await command.execute(interaction, client);
        }
    } catch (err) {
        console.error('❌ Interaction Error:', err);
        if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ An error occurred while executing this action.', ephemeral: true }).catch(() => {});
        }
    }
});

// ── Message Create Handler ────────────────────────────────────────────────
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const prefix = process.env.BOT_PREFIX;
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    try {
        const prefixCmd = client.prefixCommands.get(commandName);
        if (prefixCmd && typeof prefixCmd.prefixExecute === 'function') {
            return await prefixCmd.prefixExecute(message, args, client);
        }

        if (commandName === 'link') {
            const panel = await buildPremiumLinkPanel(message.guild.id, message.author.id, client.tokenStore, client);
            return await message.reply(panel);
        }

        if (commandName === 'unlink') {
            const slot = parseInt(args[0]);
            if (!slot || slot < 1 || slot > 5) {
                return await message.reply(`❌ Please specify a valid slot number (1 to 5). Example: \`${prefix}unlink 1\``);
            }
            await client.tokenStore.removeSlot(message.guild.id, message.author.id, slot);
            const panel = await buildPremiumLinkPanel(message.guild.id, message.author.id, client.tokenStore, client);
            return await message.reply({
                content: `✅ Slot #${slot} unlinked successfully! Here is your updated slot manager panel:`,
                ...panel
            });
        }
    } catch (err) {
        console.error(`❌ Prefix Error [${commandName}]:`, err);
        await message.reply(`❌ Error executing \`${prefix}${commandName}\`.`).catch(() => {});
    }
});

// Load Events
try {
    const eventFiles = readdirSync(join(__dirname, 'events')).filter(f => f.endsWith('.js'));
    for (const file of eventFiles) {
        const mod   = await import(pathToFileURL(join(__dirname, 'events', file)).href);
        const event = mod.default;
        if (event?.name && event?.execute) {
            if (event.once) {
                client.once(event.name, (...args) => event.execute(...args, client));
            } else {
                client.on(event.name, (...args) => event.execute(...args, client));
            }
        }
    }
} catch {}

client.login(TOKEN);
