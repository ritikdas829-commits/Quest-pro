import {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    SectionBuilder,
    ThumbnailBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags,
} from 'discord.js';
import { QuestClient } from '../quest/questClient.js';
import { TokenStore } from '../quest/tokenStore.js';
import { enableAutoquest, disableAutoquest, isAutoquestEnabled } from '../quest/autoquestStore.js';
import { PREFIX } from '../utils/config.js';

// ── TokenStore (shared instance via BOT_TOKEN as secret) ───────────────────
export function makeTokenStore(secret) {
    return new TokenStore(secret);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function sanitizeToken(raw) {
    return raw.trim()
        .replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '')
        .replace(/^`+|`+$/g, '')
        .replace(/^Bot\s+/i, '')
        .trim();
}

function isValidUserToken(token) {
    return token.length >= 50 && /^[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+$/.test(token);
}

// ── UI Builders (Component V2) ─────────────────────────────────────────────

function buildLinkModal() {
    const modal = new ModalBuilder()
        .setCustomId('link_token_modal')
        .setTitle('Link Your Discord Token');
    modal.addComponents(
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('link_token_input')
                .setLabel('Your Discord user token')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Paste your token here...')
                .setRequired(true),
        ),
    );
    return modal;
}

function buildLinkPrompt() {
    const c = new ContainerBuilder().setAccentColor(0xFEE75C);
    c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `# 🔗 Token Required\nYou need to link your Discord token before using quest commands.\n\nClick **Link Token** below — a popup will appear where you can paste your token.\n\n**How to get your token:**\n\`1.\` Open Discord in your **browser** (not the app)\n\`2.\` Press \`Ctrl+Shift+I\` → **Network** tab → filter \`XHR\`\n\`3.\` Send any message, click the request, find \`Authorization\` in headers\n\`4.\` Copy that value and paste it into the popup\n\n> ⚠️ This is your **user token**, NOT your bot token.`,
        ),
    );
    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
    c.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('link_prompt')
                .setLabel('🔗 Link Token')
                .setStyle(ButtonStyle.Primary),
        ),
    );
    return { components: [c], flags: MessageFlags.IsComponentsV2 };
}

function buildNoQuestsCard() {
    const c = new ContainerBuilder().setAccentColor(0x4F545C);
    c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `# 🔍 No Quests Available\nThere are no active, uncompleted quests on your account right now.`,
        ),
    );
    return { components: [c], flags: MessageFlags.IsComponentsV2 };
}

function buildExpiredTokenCard() {
    const c = new ContainerBuilder().setAccentColor(0xED4245);
    c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `# ❌ Token Expired\nYour saved token was rejected by Discord — it has likely expired.\n\n**Your token has been removed.** Re-link with \`/link\` or \`${PREFIX}link\`.`,
        ),
    );
    return { components: [c], flags: MessageFlags.IsComponentsV2 };
}

function buildErrorCard(err) {
    const msg = err?.message ?? String(err);
    const is401 = msg.includes('401');
    const c = new ContainerBuilder().setAccentColor(0xED4245);
    c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            is401
                ? `# ❌ Invalid or Expired Token\nRe-link your token with \`${PREFIX}link\`.`
                : `# ❌ Error\n${msg.slice(0, 800)}`,
        ),
    );
    return { components: [c], flags: MessageFlags.IsComponentsV2 };
}

// --- EXACT ADVANCED QUEST SOLVER CARD (With Enroll, Stop, Refresh buttons & Logs) ---
export function buildQuestSolverCard(quest, phase = 'starting', progressData = {}, logs = []) {
    const cfg = quest.config;
    const msgs = cfg.messages;
    const appId = cfg.application.id;

    const thumbUrl = `https://cdn.discordapp.com/app-assets/${appId}/quest-assets/${cfg.assets.game_tile}.png`;
    const bannerUrl = cfg.assets.hero 
        ? `https://cdn.discordapp.com/app-assets/${appId}/quest-assets/${cfg.assets.hero}.png` 
        : thumbUrl;

    const enrolledDate = quest.enrolled_at ? new Date(quest.enrolled_at).toLocaleDateString('en-US') : '10/13/2026';
    const expiresDate = cfg.expires_at ? new Date(cfg.expires_at).toLocaleDateString('en-US') : '10/18/2026';

    const PHASE = {
        starting: { color: 0x2B2D31, title: 'Quest Solver' },
        done: { color: 0x57F287, title: 'Quest Solver' },
        failed: { color: 0xED4245, title: 'Quest Solver' },
    };
    const p = PHASE[phase] || PHASE.starting;
    const isDone = phase === 'done';

    // --- MAIN CONTAINER ---
    const c = new ContainerBuilder().setAccentColor(p.color);

    c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`# 🛡️ ${p.title}`),
    );
    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `• **Game:** ${msgs.game_title}\n` +
            `• **Publisher:** ${msgs.game_publisher}\n` +
            `• **Quest Name:** ${msgs.quest_name}\n` +
            `• **Enrolled At:** ${enrolledDate}\n` +
            `• **Expires At:** ${expiresDate}\n` +
            `• **Progress:**`
        ),
    );

    const desktopProgress = progressData.desktop ?? (isDone ? '100%' : '0%');
    const xboxProgress = progressData.xbox ?? (isDone ? '100%' : '100%');
    const psProgress = progressData.playstation ?? (isDone ? '100%' : '100%');

    c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `${isDone ? '✅' : '⏳'} **${isDone ? '100%' : desktopProgress}**\n` +
            `🖥️ **Desktop:** ${desktopProgress}\n` +
            `🟢 **Xbox:** ${xboxProgress}\n` +
            `🔵 **PlayStation:** ${psProgress}`
        ),
    );
    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    const rewardLines = cfg.rewards_config?.rewards?.map(r => 
        `• **${r.messages?.name ?? 'Quest Reward'}** 🎁`
    ).join('\n') || '• Acolyte Survivor Avatar Decoration 🎁';

    c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## Rewards:\n${rewardLines}`)
    );
    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    const taskConfig = cfg.task_config ?? cfg.task_config_v2;
    const taskLines = Object.entries(taskConfig?.tasks ?? {}).map(([type, t]) => {
        if (type === 'PLAY_ON_DESKTOP') return `• Play On Desktop for ${Math.ceil((t.target || 0) / 60)}m`;
        if (type === 'PLAY_ON_XBOX') return `• Play On Xbox ${t.target} times`;
        if (type === 'PLAY_ON_PLAYSTATION') return `• Play On Playstation ${t.target} times`;
        return `• ${type.replace(/_/g, ' ')} for${t.target}`;
    }).join('\n') || '• Play On Desktop for 15m';

    c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## Tasks:\n${taskLines}`)
    );
    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    // Banner Image
    c.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder().setURL(bannerUrl)
        )
    );
    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`✅ **${msgs.game_title}:${msgs.quest_name.slice(0, 25)}..**`)
    );
    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    // Action Buttons: Enroll, Stop, Refresh
    c.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`quest_enroll_${quest.id}`).setLabel('Enroll').setStyle(ButtonStyle.Primary).setEmoji('⚠️'),
            new ButtonBuilder().setCustomId(`quest_stop_${quest.id}`).setLabel('Stop').setStyle(ButtonStyle.Secondary).setEmoji('⏹️'),
            new ButtonBuilder().setCustomId(`quest_refresh_${quest.id}`).setLabel('Refresh').setStyle(ButtonStyle.Secondary).setEmoji('🔄'),
        ),
    );

    c.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel('View Quest').setStyle(ButtonStyle.Link).setURL(`https://discord.com/quests/${quest.id}`).setEmoji('🔗')
        ),
    );

    // --- LOGS CONTAINER ---
    const logContainer = new ContainerBuilder().setAccentColor(0x2B2D31);
    logContainer.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## 📄 Quest Logs`)
    );
    logContainer.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    const defaultLogs = `Quest selected\n[${new Date().toLocaleTimeString()}] Refreshed quests`;
    const formattedLogs = logs.length > 0 ? logs.slice(-5).join('\n') : defaultLogs;

    logContainer.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`\`\`\`ansi\n${formattedLogs}\n\`\`\``)
    );

    return { components: [c, logContainer], flags: MessageFlags.IsComponentsV2 };
}

function buildQuestInfoCard(quest, phase, claimed = 0, failReason = '') {
    const cfg  = quest.config;
    const msgs = cfg.messages;
    const appId = cfg.application.id;
    const thumbUrl = `https://cdn.discordapp.com/app-assets/${appId}/quest-assets/${cfg.assets.game_tile}.png`;

    const TASK_META = {
        PLAY_ON_DESKTOP:       { icon: '🖥️', label: 'Play on Desktop' },
        WATCH_VIDEO:           { icon: '🎬', label: 'Watch Video' },
        STREAM_ON_DESKTOP:     { icon: '📺', label: 'Stream on Desktop' },
        PLAY_ACTIVITY:         { icon: '🎮', label: 'Play Activity' },
        WATCH_VIDEO_ON_MOBILE: { icon: '📱', label: 'Watch Video on Mobile' },
    };

    const taskLines = Object.entries((cfg.task_config ?? cfg.task_config_v2)?.tasks ?? {}).map(([type, task]) => {
        const meta = TASK_META[type] ?? { icon: '⚙️', label: type };
        let dur = '';
        if (type === 'PLAY_ON_DESKTOP' || type === 'STREAM_ON_DESKTOP') {
            dur = `  •  **${Math.ceil(task.target / 60)} min**`;
        } else if (type === 'WATCH_VIDEO' || type === 'WATCH_VIDEO_ON_MOBILE') {
            const s = task.target;
            dur = s >= 60 ? `  •  **${Math.ceil(s / 60)} min**` : `  •  **${s}s**`;
        }
        return `${meta.icon}${meta.label}${dur}${phase === 'done' ? '  ✅' : ''}`;
    });

    const rewardLines = cfg.rewards_config.rewards.map((r) => {
        let line = `**${r.messages.name}**`;
        if (r.orb_quantity) line += `  ✦ *(${r.orb_quantity} Orbs)*`;
        else if (r.quantity) line += `  *(${r.quantity}d Nitro)*`;
        return line;
    });

    const expiresEpoch = Math.floor(new Date(cfg.expires_at).getTime() / 1000);
    const daysLeft = Math.max(0, Math.ceil((new Date(cfg.expires_at).getTime() - Date.now()) / 86400000));

    const PHASE = {
        starting: { color: 0x5865F2, title: '⚙️  Solving Quest...',  bar: '`░░░░░░░░░░`  **0%**  —  *Working on it...*' },
        done:     { color: 0x57F287, title: '✅  Quest Complete!',    bar: '`██████████`  **100%**' },
        failed:   { color: 0xED4245, title: '❌  Quest Failed',       bar: '' },
    };

    const p = PHASE[phase];
    const progressText = phase === 'failed' && failReason
        ? `\`░░░░░░░░░░\`  **0%**\n\`\`\`\n${failReason.slice(0, 300)}\n\`\`\``
        : p.bar;

    const footerNote = phase === 'done' && claimed > 0
        ? `-# 🎁 ${claimed} reward(s) claimed`
        : phase === 'starting'
        ? `-# Quest Bot  •  Please wait...`
        : phase === 'failed'
        ? `-# Requires manual completion in the Discord app`
        : '';

    const c = new ContainerBuilder().setAccentColor(p.color);

    c.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# ${p.title}\n### ${msgs.quest_name}\n*${msgs.game_title}*  •  ${msgs.game_publisher}`,
                ),
            )
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbUrl)),
    );

    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `📋 **Task**\n${taskLines.join('\n') || '*Unknown task*'}\n\n` +
            `📅 **Expires**  <t:${expiresEpoch}:R>  *(${daysLeft}d left)*\n\n` +
            `📊 **Progress**\n${progressText || '`░░░░░░░░░░`  0%'}\n\n` +
            `🎁 **Reward**\n${rewardLines.join('\n') || '*No rewards listed*'}`,
        ),
    );

    if (footerNote) {
        c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
        c.addTextDisplayComponents(new TextDisplayBuilder().setContent(footerNote));
    }

    return { components: [c], flags: MessageFlags.IsComponentsV2 };
}

// ── Quest Runners ──────────────────────────────────────────────────────────

async function runQuestOne(userId, tokenStore, send) {
    const token = tokenStore.get(userId);
    if (!token) { await send(buildLinkPrompt()); return false; }

    const qc = new QuestClient(token);
    try {
        const manager = await qc.fetchQuests();
        const valid = manager.filterQuestsValid();
        if (valid.length === 0) { await send(buildNoQuestsCard()); return false; }

        // Dropdown ko bypass karke directly Quest Solver card show karega
        const quest = valid[0];
        const logs = [];
        const log = (m) => { console.log(m); logs.push(m); };

        const progressMsg = await send(buildQuestSolverCard(quest, 'starting', {}, logs));

        const questDone = await manager.doingQuest(quest, log);

        if (!questDone) {
            await progressMsg.edit(buildQuestSolverCard(quest, 'failed', {}, logs));
            return false;
        }

        const claimed = await manager.claimRewards(log).catch(() => 0);
        await progressMsg.edit(buildQuestSolverCard(quest, 'done', { desktop: '100%' }, logs));
        return true;

    } catch (err) {
        const msg = err?.message ?? String(err);
        if (msg.includes('401') && tokenStore.has(userId)) {
            tokenStore.remove(userId); disableAutoquest(userId);
            await send(buildExpiredTokenCard()).catch(() => {});
        } else {
            await send(buildErrorCard(err)).catch(() => {});
        }
        return false;
    }
}

async function runQuestAll(userId, tokenStore, send) {
    const token = tokenStore.get(userId);
    if (!token) { await send(buildLinkPrompt()); return false; }

    const qc = new QuestClient(token);
    try {
        const manager = await qc.fetchQuests();
        const valid = manager.filterQuestsValid();
        if (valid.length === 0) { await send(buildNoQuestsCard()); return false; }

        // Questall ke liye bhi naya updated solver card approach render karega
        const progressMsgs = await Promise.all(valid.map((q) => send(buildQuestSolverCard(q, 'starting'))));

        const questLogs = valid.map(() => []);
        const questResults = await Promise.allSettled(
            valid.map((quest, i) => {
                const log = (m) => { console.log(m); questLogs[i].push(m); };
                return manager.doingQuest(quest, log);
            }),
        );

        const completed = valid.filter((_, i) => questResults[i].status === 'fulfilled' && questResults[i].value === true);
        const skipped   = valid.filter((_, i) => questResults[i].status === 'rejected' || (questResults[i].status === 'fulfilled' && questResults[i].value === false));

        await Promise.allSettled(skipped.map((q) => {
            const idx = valid.indexOf(q);
            const failLogs = questLogs[idx].filter(l => l.startsWith('[FAIL]'));
            const reason = questResults[idx].status === 'rejected'
                ? questResults[idx].reason?.message ?? 'Unknown error'
                : failLogs.slice(-2).join('\n') || questLogs[idx].slice(-3).join('\n') || 'Could not be completed automatically.';
            return progressMsgs[idx].edit(buildQuestSolverCard(q, 'failed', {}, questLogs[idx]));
        }));

        if (completed.length === 0) {
            const c = new ContainerBuilder().setAccentColor(0xFEE75C);
            c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ⚠️ No Quests Auto-Completed\nAll quests require manual completion via the Discord desktop or mobile app.`));
            await send({ components: [c], flags: MessageFlags.IsComponentsV2 });
            return false;
        }

        const claimed = await manager.claimRewards(console.log).catch(() => 0);
        const claimedPer = completed.length > 0 ? Math.floor(claimed / completed.length) : 0;

        await Promise.allSettled(completed.map((q, i) => {
            const idx = valid.indexOf(q);
            return progressMsgs[idx].edit(buildQuestSolverCard(q, 'done', { desktop: '100%' }, questLogs[idx]));
        }));
        return true;

    } catch (err) {
        const msg = err?.message ?? String(err);
        if (msg.includes('401') && tokenStore.has(userId)) {
            tokenStore.remove(userId); disableAutoquest(userId);
            await send(buildExpiredTokenCard()).catch(() => {});
        } else {
            await send(buildErrorCard(err)).catch(() => {});
        }
        return false;
    }
}

async function runQuestList(userId, tokenStore, send) {
    const token = tokenStore.get(userId);
    if (!token) { await send(buildLinkPrompt()); return; }

    const qc = new QuestClient(token);
    try {
        const manager = await qc.fetchQuests();
        const all = manager.list();
        if (all.length === 0) { await send(buildNoQuestsCard()); return; }

        const TASK_META = {
            PLAY_ON_DESKTOP:       { icon: '🖥️', label: 'Play on Desktop' },
            WATCH_VIDEO:           { icon: '🎬', label: 'Watch Video' },
            STREAM_ON_DESKTOP:     { icon: '📺', label: 'Stream on Desktop' },
            PLAY_ACTIVITY:         { icon: '🎮', label: 'Play Activity' },
            WATCH_VIDEO_ON_MOBILE: { icon: '📱', label: 'Watch Video on Mobile' },
        };

        for (const q of all.slice(0, 10)) {
            const cfg = q.config;
            const msgs = cfg.messages;
            const appId = cfg.application.id;
            const thumbUrl = `https://cdn.discordapp.com/app-assets/${appId}/quest-assets/${cfg.assets.game_tile}.png`;
            const expiresEpoch = Math.floor(new Date(cfg.expires_at).getTime() / 1000);
            const daysLeft = Math.max(0, Math.ceil((new Date(cfg.expires_at).getTime() - Date.now()) / 86400000));

            const st = q.isCompleted() ? { color: 0x57F287, icon: '✅', label: 'Completed' }
                : q.isExpired()        ? { color: 0xED4245, icon: '🔴', label: 'Expired' }
                : q.isEnrolledQuest()  ? { color: 0xFEE75C, icon: '⏳', label: 'In Progress' }
                :                        { color: 0x5865F2, icon: '🔵', label: 'Available' };

            const taskLines = Object.entries((cfg.task_config ?? cfg.task_config_v2)?.tasks ?? {}).map(([type, task]) => {
                const meta = TASK_META[type] ?? { icon: '⚙️', label: type };
                let dur = '';
                if (type === 'PLAY_ON_DESKTOP' || type === 'STREAM_ON_DESKTOP') dur = `  •  **${Math.ceil(task.target / 60)} min**`;
                else if (type === 'WATCH_VIDEO' || type === 'WATCH_VIDEO_ON_MOBILE') {
                    const s = task.target;
                    dur = s >= 60 ? `  •  **${Math.ceil(s / 60)} min**` : `  •  **${s}s**`;
                }
                return `${meta.icon} ${meta.label}${dur}`;
            });

            const rewardLines = cfg.rewards_config.rewards.map((r) => {
                let line = `**${r.messages.name}**`;
                if (r.orb_quantity) line += `  ✦ *(${r.orb_quantity} Orbs)*`;
                else if (r.quantity) line += `  *(${r.quantity}d Nitro)*`;
                return line;
            });

            const c = new ContainerBuilder().setAccentColor(st.color);
            c.addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `# ${st.icon}  ${msgs.quest_name}\n*${msgs.game_title}*  •  ${msgs.game_publisher}`,
                        ),
                    )
                    .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbUrl)),
            );
            c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
            c.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `📊 **Status:** ${st.label}   📅 **Expires:** <t:${expiresEpoch}:R> *(${daysLeft}d)*\n\n` +
                    `📋 **Task**\n${taskLines.join('\n') || '*Unknown*'}\n\n` +
                    `🎁 **Reward**\n${rewardLines.join('\n') || '*No rewards listed*'}`,
                ),
            );
            await send({ components: [c], flags: MessageFlags.IsComponentsV2 });
        }

        if (all.length > 10) {
            const c = new ContainerBuilder().setAccentColor(0x4F545C);
            c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# …and **${all.length - 10}** more quest(s) not shown.`));
            await send({ components: [c], flags: MessageFlags.IsComponentsV2 });
        }

    } catch (err) {
        await send(buildErrorCard(err)).catch(() => {});
    }
}

async function runTokenCheck(userId, tokenStore, replyFn) {
    const token = tokenStore.get(userId);

    if (!token) {
        const c = new ContainerBuilder().setAccentColor(0xFEE75C);
        c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# No Token Saved\nYou don't have a saved token. Use \`${PREFIX}link\` to save one.`));
        await replyFn({ components: [c], flags: MessageFlags.IsComponentsV2 });
        return;
    }

    let valid = false, accountName = '';
    try {
        const res = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: token } });
        valid = res.ok;
        if (res.ok) {
            const data = await res.json();
            accountName = data.global_name || data.username || '';
        }
    } catch { valid = false; }

    const c = new ContainerBuilder().setAccentColor(valid ? 0x57F287 : 0xED4245);
    c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            valid
                ? `# ✅ Token is Valid\nLinked as **"${accountName}"**.\n\nYour saved token is working correctly.`
                : `# ❌ Token Invalid or Expired\nYour saved token was rejected by Discord.\nUse \`${PREFIX}unlink\` then \`${PREFIX}link\` to save a fresh token.`,
        ),
    );
    await replyFn({ components: [c], flags: MessageFlags.IsComponentsV2 });
    if (!valid) tokenStore.remove(userId);
}

async function runAutoquestToggle(userId, tokenStore, replyFn) {
    if (isAutoquestEnabled(userId)) {
        disableAutoquest(userId);
        const c = new ContainerBuilder().setAccentColor(0xFEE75C);
        c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🤖 Auto-Quest Disabled\nI'll no longer auto-run new quests for you.\nUse \`${PREFIX}autoquest\` again to turn it back on.`));
        await replyFn({ components: [c], flags: MessageFlags.IsComponentsV2 });
        return;
    }
    if (!tokenStore.has(userId)) {
        const c = new ContainerBuilder().setAccentColor(0xED4245);
        c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ❌ No Saved Token\nAuto-Quest needs your Discord user token.\n\n**Use \`${PREFIX}link\` first**, then run \`${PREFIX}autoquest\` again.`));
        await replyFn({ components: [c], flags: MessageFlags.IsComponentsV2 });
        return;
    }
    enableAutoquest(userId);
    const c = new ContainerBuilder().setAccentColor(0x57F287);
    c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `# 🤖 Auto-Quest Enabled!\nEvery new Discord quest that drops will be **auto-completed for you** in the background.\n\nI'll DM you a summary once each quest finishes.\n\nUse \`${PREFIX}autoquest\` again to turn this off.\n\n-# Keep your saved token fresh with \`${PREFIX}tokencheck\`.`,
        ),
    );
    await replyFn({ components: [c], flags: MessageFlags.IsComponentsV2 });
}

// ── Slash + Prefix exports ─────────────────────────────────────────────────

export const questCmd = {
    data: new SlashCommandBuilder().setName('quest').setDescription('Pick and complete one Discord quest'),
    prefix: 'quest',
    async execute(interaction, client) {
        const ts = client.tokenStore;
        await interaction.deferReply();
        await runQuestOne(interaction.user.id, ts, (opts) => interaction.followUp(opts));
    },
    async prefixExecute(message, _args, client) {
        await runQuestOne(message.author.id, client.tokenStore, (opts) => message.channel.send(opts));
    },
};

export const questAllCmd = {
    data: new SlashCommandBuilder().setName('questall').setDescription('Complete all quests at once'),
    prefix: 'questall',
    async execute(interaction, client) {
        await interaction.deferReply();
        await runQuestAll(interaction.user.id, client.tokenStore, (opts) => interaction.followUp(opts));
    },
    async prefixExecute(message, _args, client) {
        await runQuestAll(message.author.id, client.tokenStore, (opts) => message.channel.send(opts));
    },
};

export const questListCmd = {
    data: new SlashCommandBuilder().setName('questlist').setDescription('List all Discord quests and their status'),
    prefix: 'questlist',
    async execute(interaction, client) {
        await interaction.deferReply();
        await runQuestList(interaction.user.id, client.tokenStore, (opts) => interaction.followUp(opts));
    },
    async prefixExecute(message, _args, client) {
        await runQuestList(message.author.id, client.tokenStore, (opts) => message.channel.send(opts));
    },
};

export const tokenCheckCmd = {
    data: new SlashCommandBuilder().setName('tokencheck').setDescription('Check whether your saved Discord token is still valid'),
    prefix: 'tokencheck',
    async execute(interaction, client) {
        await interaction.deferReply({ flags: 64 });
        await runTokenCheck(interaction.user.id, client.tokenStore, (opts) => interaction.editReply(opts));
    },
    async prefixExecute(message, _args, client) {
        await runTokenCheck(message.author.id, client.tokenStore, (opts) => message.reply(opts));
    },
};

export const autoquestCmd = {
    data: new SlashCommandBuilder().setName('autoquest').setDescription('Auto-complete every new quest the moment it drops'),
    prefix: 'autoquest',
    async execute(interaction, client) {
        await interaction.deferReply({ flags: 64 });
        await runAutoquestToggle(interaction.user.id, client.tokenStore, (opts) => interaction.editReply(opts));
    },
    async prefixExecute(message, _args, client) {
        await runAutoquestToggle(message.author.id, client.tokenStore, (opts) => message.reply(opts));
    },
};

// ── Link / Unlink ──────────────────────────────────────────────────────────

export const linkCmd = {
    data: new SlashCommandBuilder().setName('link').setDescription('Save your Discord token so you never have to enter it again'),
    prefix: 'link',

    async execute(interaction, client) {
        await interaction.showModal(buildLinkModal());
    },

    async prefixExecute(message, args, client) {
        const ts = client.tokenStore;
        const inlineToken = args.join('').trim();

        if (inlineToken) {
            try { await message.delete(); } catch {}
            const token = sanitizeToken(inlineToken);

            const sendDM = async (payload) => {
                const user = await client.users.fetch(message.author.id).catch(() => null);
                const dm = await user?.createDM().catch(() => null);
                await dm?.send(payload).catch(() => {});
            };

            if (!isValidUserToken(token)) {
                await sendDM((() => {
                    const c = new ContainerBuilder().setAccentColor(0xED4245);
                    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ❌ Invalid Token Format\nThat doesn't look like a valid Discord token. Copy the **Authorization** header value exactly.`));
                    return { components: [c], flags: MessageFlags.IsComponentsV2 };
                })());
                return;
            }

            let accountName = '', verifyOk = false;
            try {
                const res = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: token } });
                verifyOk = res.ok;
                if (res.ok) {
                    const data = await res.json();
                    accountName = data.global_name || data.username || '';
                }
            } catch {}

            if (!verifyOk) {
                await sendDM((() => {
                    const c = new ContainerBuilder().setAccentColor(0xED4245);
                    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ❌ Token Rejected by Discord\nMake sure you copied the \`Authorization\` header and try again.`));
                    return { components: [c], flags: MessageFlags.IsComponentsV2 };
                })());
                return;
            }

            ts.save(message.author.id, token);
            const c = new ContainerBuilder().setAccentColor(0x57F287);
            c.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# ✅ Token Linked!\nLinked as **"${accountName}"**.\n\nYou can now use \`${PREFIX}quest\`, \`${PREFIX}questall\`, and \`${PREFIX}questlist\`.\nTo remove it, use \`${PREFIX}unlink\`.`,
                ),
            );
            await sendDM({ components: [c], flags: MessageFlags.IsComponentsV2 });
            return;
        }

        await message.reply(buildLinkPrompt());
    },
};

export const unlinkCmd = {
    data: new SlashCommandBuilder().setName('unlink').setDescription('Remove your saved Discord token'),
    prefix: 'unlink',

    async execute(interaction, client) {
        const ts = client.tokenStore;
        const removed = ts.remove(interaction.user.id);
        disableAutoquest(interaction.user.id);
        const c = new ContainerBuilder().setAccentColor(removed ? 0xFEE75C : 0x4F545C);
        c.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                removed
                    ? `# 🔓 Token Unlinked\nYour saved token has been removed.`
                    : `# No Token Saved\nYou don't have a saved token.`,
            ),
        );
        await interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    },

    async prefixExecute(message, _args, client) {
        const ts = client.tokenStore;
        const removed = ts.remove(message.author.id);
        disableAutoquest(message.author.id);
        const c = new ContainerBuilder().setAccentColor(removed ? 0xFEE75C : 0x4F545C);
        c.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                removed
                    ? `# 🔓 Token Unlinked\nYour saved token has been removed.`
                    : `# No Token Saved\nYou don't have a saved token.`,
            ),
        );
        await message.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
    },
};

// ── Modal Submit Handler (called from interactionCreate) ───────────────────
export async function handleLinkModal(interaction, client) {
    const ts = client.tokenStore;
    const raw = interaction.fields.getTextInputValue('link_token_input');
    const token = sanitizeToken(raw);

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!isValidUserToken(token)) {
        const c = new ContainerBuilder().setAccentColor(0xED4245);
        c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ❌ Invalid Token Format\nThat doesn't look like a valid Discord token. Copy the **Authorization** header value exactly.`));
        await interaction.editReply({ components: [c], flags: MessageFlags.IsComponentsV2 });
        return;
    }

    let accountName = '', verifyOk = false;
    try {
        const res = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: token } });
        verifyOk = res.ok;
        if (res.ok) {
            const data = await res.json();
            accountName = data.global_name || data.username || '';
        }
    } catch {}

    if (!verifyOk) {
        const c = new ContainerBuilder().setAccentColor(0xED4245);
        c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ❌ Token Rejected by Discord\nMake sure you copied the \`Authorization\` header and try again.`));
        await interaction.editReply({ components: [c], flags: MessageFlags.IsComponentsV2 });
        return;
    }

    ts.save(interaction.user.id, token);
    const c = new ContainerBuilder().setAccentColor(0x57F287);
    c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `# ✅ Token Linked!\nLinked as **"${accountName}"**.\n\nYou can now use \`/quest\`, \`/questall\`, and \`/questlist\`.\nTo remove it, use \`/unlink\`.`,
        ),
    );
    await interaction.editReply({ components: [c], flags: MessageFlags.IsComponentsV2 });
}

// ── Button: link_prompt handler (called from interactionCreate) ────────────
export async function handleLinkPromptButton(interaction) {
    await interaction.showModal(buildLinkModal());
}

// ── AutoQuest runner (called from questWatcher) ────────────────────────────
export async function runAutoquestForUser(userId, quest, tokenStore, discordClient) {
    const token = tokenStore.get(userId);
    if (!token) { disableAutoquest(userId); return; }

    const { QuestClient: QC } = await import('../quest/questClient.js');
    const { Quest: Q } = await import('../quest/quest.js');
    const qc = new QC(token);
    const logs = [];
    const log = (m) => { console.log(`[AutoQuest:${userId}]`, m); logs.push(m); };

    try {
        const manager = await qc.fetchQuests();
        let live = manager.get(quest.id);
        if (!live) {
            live = Q.create({ id: quest.id, config: quest.config, user_status: null, targeted_content: quest.targetedContent, preview: quest.preview });
        }
        if (live.isCompleted() || live.isExpired()) return;

        await manager.doingQuest(live, log);

        let claimManager = manager;
        try { claimManager = await qc.fetchQuests(); } catch { if (!manager.hasQuest(live.id)) manager.upsert(live); }

        const claimed = await claimManager.claimRewards(log).catch(() => 0);

        try {
            const user = await discordClient.users.fetch(userId);
            const dm = await user.createDM();
            const c = new ContainerBuilder().setAccentColor(0x57F287);
            c.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# 🤖 Auto-Quest Complete!\n**${live.config.messages.quest_name}** has been completed automatically.\n${claimed > 0 ? `🎁 **${claimed}** reward(s) claimed.\n` : ''}\nUse \`${PREFIX}autoquest\` to disable.`,
                ),
            );
            await dm.send({ components: [c], flags: MessageFlags.IsComponentsV2 });
        } catch {}

    } catch (err) {
        const msg = err?.message ?? String(err);
        console.error(`[AutoQuest:${userId}] Error:`, msg);
        if (msg.includes('401')) {
            tokenStore.remove(userId);
            disableAutoquest(userId);
            try {
                const user = await discordClient.users.fetch(userId);
                const dm = await user.createDM();
                const c = new ContainerBuilder().setAccentColor(0xED4245);
                c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🤖 Auto-Quest Paused\nYour saved token expired. Run \`${PREFIX}link\` to re-link, then \`${PREFIX}autoquest\` to re-enable.`));
                await dm.send({ components: [c], flags: MessageFlags.IsComponentsV2 });
            } catch {}
        }
    }
}
