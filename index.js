
require('dotenv').config();

const fs = require('fs');
const {
  Client,
  GatewayIntentBits,
  Events,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType
} = require('discord.js');

const PREFIX = '.';
const COLOR = 0xF3994A;
const EMOJI = '🎉';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const DATA_FILE = './haos-data.json';
let data = {
  warnings: {},
  messages: {},
  giveaways: {}
};

const timers = new Map();

try {
  if (fs.existsSync(DATA_FILE)) {
    data = {
      ...data,
      ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
    };
  }
} catch (error) {
  console.error('Greška pri učitavanju podataka:', error);
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function makeEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

function getReason(args) {
  return args.join(' ') || 'Nije naveden razlog.';
}

function parseDuration(value) {
  const match = String(value || '').match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return null;

  const units = {
    s: 1000,
    m: 60000,
    h: 3600000,
    d: 86400000
  };

  const result = Number(match[1]) * units[match[2].toLowerCase()];

  return Number(match[1]) > 0 && result <= 604800000
    ? result
    : null;
}

function getPermission(message, permission) {
  if (message.member.permissions.has(permission)) return true;

  message.reply({
    embeds: [
      makeEmbed('Nemaš dozvolu', 'Nemaš potrebnu dozvolu za ovu komandu.')
    ]
  }).catch(() => {});

  return false;
}

function writeLog(guild, title, description) {
  const channelId = process.env.LOG_CHANNEL_ID;
  if (!channelId) return;

  const channel = guild.channels.cache.get(channelId);

  if (channel?.isTextBased()) {
    channel.send({
      embeds: [makeEmbed(title, description)]
    }).catch(() => {});
  }
}

async function sendDM(user, title, description) {
  try {
    await user.send({
      embeds: [makeEmbed(title, description)]
    });
    return true;
  } catch {
    return false;
  }
}

function memberKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

// WELCOME
client.on(Events.GuildMemberAdd, async member => {
  const channelId = process.env.WELCOME_CHANNEL_ID;
  if (!channelId) return;

  const channel = member.guild.channels.cache.get(channelId);
  if (!channel?.isTextBased()) return;

  const welcome = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('NOVI MEMBER')
    .setDescription(
      `Ćao <@${member.id}>, dobrodošao/la na 🌴 ⨯ HAOS!\n\n` +
      'Isprati informacije i obaveštenja o serveru i zabavi se u našoj zajednici.'
    )
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setFooter({
      text: `#${member.guild.memberCount} member`,
      iconURL: member.guild.iconURL() || undefined
    });

  await channel.send({
    embeds: [welcome],
    allowedMentions: { users: [member.id], roles: [] }
  }).catch(console.error);
});

client.on(Events.GuildMemberRemove, member => {
  writeLog(
    member.guild,
    'Član je napustio server',
    `Član: ${member.user.tag}`
  );
});

client.on(Events.GuildBanAdd, ban => {
  writeLog(ban.guild, 'Član je banovan', `Član: ${ban.user.tag}`);
});

client.on(Events.GuildBanRemove, ban => {
  writeLog(ban.guild, 'Ban je uklonjen', `Član: ${ban.user.tag}`);
});

// BROJANJE PORUKA ZA GIVEAWAY USLOVE
client.on(Events.MessageCreate, message => {
  if (!message.guild || message.author.bot) return;

  const key = memberKey(message.guild.id, message.author.id);
  data.messages[key] = (data.messages[key] || 0) + 1;

  // Čuvanje broja poruka na disku
  saveData();
});

// GIVEAWAY: PROVERA USLOVA
async function getEligibleUsers(guild, giveaway, post) {
  const reaction = post.reactions.cache.get(giveaway.emoji || EMOJI);
  if (!reaction) return [];

  const users = await reaction.users.fetch();
  const eligible = [];

  for (const user of users.values()) {
    if (user.bot) continue;

    try {
      const member = await guild.members.fetch(user.id);

      if (
        giveaway.roleId &&
        !member.roles.cache.has(giveaway.roleId)
      ) continue;

      if (giveaway.requireVoice && !member.voice.channelId) continue;

      const count = data.messages[memberKey(guild.id, user.id)] || 0;
      if (count < (giveaway.minMessages || 0)) continue;

      eligible.push(user);
    } catch {
      // Član više nije na serveru
    }
  }

  return eligible;
}

function chooseWinners(users, count) {
  const pool = [...users];
  const winners = [];

  while (pool.length && winners.length < count) {
    const index = Math.floor(Math.random() * pool.length);
    winners.push(pool.splice(index, 1)[0]);
  }

  return winners;
}

async function finishGiveaway(guild, giveaway) {
  if (!giveaway || giveaway.status !== 'active') return;

  const channel = await guild.channels.fetch(giveaway.channelId).catch(() => null);
  if (!channel?.isTextBased()) return;

  const post = await channel.messages.fetch(giveaway.messageId).catch(() => null);
  if (!post) return;

  const eligible = await getEligibleUsers(guild, giveaway, post);
  const winners = chooseWinners(eligible, giveaway.winnersCount);

  giveaway.status = 'ended';
  giveaway.winnerIds = winners.map(user => user.id);
  saveData();

  const winnerText = winners.length
    ? winners.map(user => `<@${user.id}>`).join(', ')
    : 'Nema pobednika koji ispunjava uslove.';

  await post.edit({
    embeds: [
      makeEmbed(
        '🎉 GIVEAWAY ZAVRŠEN',
        `**🎁 Nagrada:** ${giveaway.prize}\n\n` +
        `**🏆 Pobednik/pobednici:**\n${winnerText}\n\n` +
        `**👥 Broj kvalifikovanih učesnika:** ${eligible.length}\n` +
        `**👤 Organizator:** <@${giveaway.hostId}>`
      ).setFooter({ text: 'HAOS • Giveaway' })
    ]
  }).catch(console.error);

  await post.reply({
    embeds: [
      makeEmbed(
        '🏆 REZULTAT GIVEAWAY-A',
        winners.length
          ? `Čestitamo ${winnerText}! Osvojili ste **${giveaway.prize}**.`
          : 'Nagradna igra je završena bez pobednika.'
      )
    ],
    allowedMentions: { users: winners.map(user => user.id) }
  }).catch(console.error);

  const timer = timers.get(giveaway.messageId);
  if (timer) clearTimeout(timer);
  timers.delete(giveaway.messageId);
}

function scheduleGiveaway(guild, giveaway) {
  const oldTimer = timers.get(giveaway.messageId);
  if (oldTimer) clearTimeout(oldTimer);

  if (giveaway.status !== 'active') return;

  const delay = Math.max(0, giveaway.endsAt - Date.now());

  const timer = setTimeout(() => {
    finishGiveaway(guild, giveaway).catch(console.error);
  }, delay);

  timers.set(giveaway.messageId, timer);
}

// KOMANDE
client.on(Events.MessageCreate, async message => {
  if (!message.guild || message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const [mainText, ...optionParts] = message.content
    .slice(PREFIX.length)
    .trim()
    .split('|');

  const args = mainText.trim().split(/\s+/);
  const command = (args.shift() || '').toLowerCase();

  if (!command) return;

  const target = message.mentions.members.first();

  try {
    // HELP
    if (['help', 'pomoc', 'pomoć'].includes(command)) {
      return message.reply({
        embeds: [
          makeEmbed(
            '🌴 HAOS • KOMANDE',
            '**🛡️ MODERACIJA**\n' +
            '`.ban @član [razlog]`\n' +
            '`.unban ID [razlog]`\n' +
            '`.kick @član [razlog]`\n' +
            '`.mute @član 10m [razlog]`\n' +
            '`.unmute @član`\n' +
            '`.warn @član [razlog]`\n' +
            '`.warnings @član`\n' +
            '`.clear 20`\n' +
            '`.lock` / `.unlock`\n' +
            '`.slowmode 5` / `.slowmode off`\n\n' +
            '**🎉 GIVEAWAY**\n' +
            '`.gstart 10m 1 Nitro`\n' +
            '`.gend ID_poruke`\n' +
            '`.greroll ID_poruke [broj_pobednika]`\n\n' +
            '**Opcionalni giveaway uslovi**\n' +
            '`| role:ID_uloge`\n' +
            '`| vc`\n' +
            '`| minmsgs:50`\n\n' +
            'Primer: `.gstart 1h 2 Nitro | role:123456789012345678 | vc | minmsgs:50`'
          )
        ]
      });
    }

    // BAN
    if (command === 'ban') {
      if (!getPermission(message, PermissionFlagsBits.BanMembers)) return;
      if (!target) return message.reply('Upotreba: `.ban @član [razlog]`');
      if (!target.bannable) {
        return message.reply('Ne mogu da banujem ovog člana. Proveri uloge bota.');
      }

      const why = getReason(args);
      await sendDM(target.user, 'HAOS • Banovanje', `Razlog: ${why}`);
      await target.ban({
        reason: `${why} | Moderator: ${message.author.tag}`
      });

      writeLog(message.guild, 'Ban', `${target.user.tag}\nRazlog: ${why}`);
      return message.reply({
        embeds: [makeEmbed('Član je banovan', `**Član:** ${target.user.tag}\n**Razlog:** ${why}`)]
      });
    }

    // UNBAN
    if (command === 'unban') {
      if (!getPermission(message, PermissionFlagsBits.BanMembers)) return;

      const id = args.shift();
      if (!id || !/^\d{17,20}$/.test(id)) {
        return message.reply('Upotreba: `.unban ID [razlog]`');
      }

      const why = getReason(args);
      const user = await client.users.fetch(id);
      await message.guild.members.unban(id, why);

      await sendDM(user, 'HAOS • Ban uklonjen', `Razlog: ${why}`);
      return message.reply({
        embeds: [makeEmbed('Ban je uklonjen', `Korisnik: ${user.tag}\nRazlog: ${why}`)]
      });
    }

    // KICK
    if (command === 'kick') {
      if (!getPermission(message, PermissionFlagsBits.KickMembers)) return;
      if (!target) return message.reply('Upotreba: `.kick @član [razlog]`');
      if (!target.kickable) return message.reply('Ne mogu da izbacim ovog člana.');

      const why = getReason(args);
      await sendDM(target.user, 'HAOS • Izbacivanje', `Razlog: ${why}`);
      await target.kick(`${why} | Moderator: ${message.author.tag}`);

      writeLog(message.guild, 'Kick', `${target.user.tag}\nRazlog: ${why}`);
      return message.reply({
        embeds: [makeEmbed('Član je izbačen', `${target.user.tag}\nRazlog: ${why}`)]
      });
    }

    // MUTE
    if (command === 'mute') {
      if (!getPermission(message, PermissionFlagsBits.ModerateMembers)) return;
      if (!target || !args[0]) {
        return message.reply('Upotreba: `.mute @član 10m [razlog]`');
      }

      const timeText = args.shift();
      const ms = parseDuration(timeText);
      if (!ms) return message.reply('Trajanje mora biti npr. `10m`, `2h` ili `1d`.');

      if (!target.moderatable) return message.reply('Ne mogu da utišam ovog člana.');

      const why = getReason(args);
      await target.timeout(ms, `${why} | Moderator: ${message.author.tag}`);
      await sendDM(target.user, 'HAOS • Mute', `Trajanje: ${timeText}\nRazlog: ${why}`);

      writeLog(message.guild, 'Mute', `${target.user.tag}\nTrajanje: ${timeText}\nRazlog: ${why}`);
      return message.reply({
        embeds: [makeEmbed('Član je utišan', `${target.user.tag}\nTrajanje: ${timeText}\nRazlog: ${why}`)]
      });
    }

    // UNMUTE
    if (command === 'unmute') {
      if (!getPermission(message, PermissionFlagsBits.ModerateMembers)) return;
      if (!target) return message.reply('Upotreba: `.unmute @član`');
      if (!target.moderatable) return message.reply('Ne mogu da uklonim mute ovom članu.');

      await target.timeout(null, `Uklonio ${message.author.tag}`);
      return message.reply({
        embeds: [makeEmbed('Mute uklonjen', `Član: ${target.user.tag}`)]
      });
    }

    // WARN
    if (command === 'warn') {
      if (!getPermission(message, PermissionFlagsBits.ModerateMembers)) return;
      if (!target) return message.reply('Upotreba: `.warn @član [razlog]`');

      const why = getReason(args);
      const key = memberKey(message.guild.id, target.id);

      data.warnings[key] ||= [];
      data.warnings[key].push({
        reason: why,
        moderator: message.author.tag,
        date: new Date().toISOString()
      });
      saveData();

      await sendDM(target.user, 'HAOS • Upozorenje', `Razlog: ${why}`);
      writeLog(message.guild, 'Warn', `${target.user.tag}\nRazlog: ${why}`);

      return message.reply({
        embeds: [
          makeEmbed(
            'Upozorenje dodato',
            `Član: ${target.user.tag}\nRazlog: ${why}\n` +
            `Ukupno upozorenja: ${data.warnings[key].length}`
          )
        ]
      });
    }

    // WARNINGS
    if (command === 'warnings') {
      if (!getPermission(message, PermissionFlagsBits.ModerateMembers)) return;
      if (!target) return message.reply('Upotreba: `.warnings @član`');

      const list = data.warnings[memberKey(message.guild.id, target.id)] || [];
      const description = list.length
        ? list.slice(-10).map((warning, index) =>
            `**${index + 1}.** ${warning.reason}\nModerator: ${warning.moderator}`
          ).join('\n\n')
        : 'Ovaj član nema upozorenja.';

      return message.reply({
        embeds: [makeEmbed(`Upozorenja • ${target.user.tag}`, description)]
      });
    }

    // CLEAR MESSAGES
    if (command === 'clear') {
      if (!getPermission(message, PermissionFlagsBits.ManageMessages)) return;

      const amount = Number(args[0]);
      if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
        return message.reply('Upotreba: `.clear 1-100`');
      }

      const deleted = await message.channel.bulkDelete(amount, true);
      const notice = await message.channel.send({
        embeds: [makeEmbed('Poruke obrisane', `Obrisano poruka: ${deleted.size}`)]
      });

      setTimeout(() => notice.delete().catch(() => {}), 5000);
      return;
    }

    // LOCK CHANNEL
    if (command === 'lock' || command === 'unlock') {
      if (!getPermission(message, PermissionFlagsBits.ManageChannels)) return;

      const locked = command === 'lock';
      await message.channel.permissionOverwrites.edit(
        message.guild.roles.everyone,
        { SendMessages: !locked }
      );

      return message.channel.send({
        embeds: [
          makeEmbed(
            locked ? '🔒 Kanal zaključan' : '🔓 Kanal otključan',
            locked
              ? `Kanal je zaključao ${message.author}.`
              : `Kanal je otključao ${message.author}.`
          )
        ]
      });
    }

    // SLOWMODE
    if (command === 'slowmode') {
      if (!getPermission(message, PermissionFlagsBits.ManageChannels)) return;

      const value = args[0]?.toLowerCase();
      const seconds = value === 'off' ? 0 : Number(value);

      if (!Number.isInteger(seconds) || seconds < 0 || seconds > 21600) {
        return message.reply('Upotreba: `.slowmode 5` ili `.slowmode off` (0–21600 sekundi).');
      }

      await message.channel.setRateLimitPerUser(seconds);
      return message.reply({
        embeds: [
          makeEmbed(
            'Slowmode podešen',
            seconds ? `Razmak između poruka: ${seconds} sekundi.` : 'Slowmode je isključen.'
          )
        ]
      });
    }

    // START GIVEAWAY
    if (['gstart', 'giveaway'].includes(command)) {
      if (!getPermission(message, PermissionFlagsBits.ManageGuild)) return;

      const duration = parseDuration(args.shift());
      const winnersCount = Number(args.shift());
      const prize = args.join(' ').trim();

      if (
        !duration ||
        !Number.isInteger(winnersCount) ||
        winnersCount < 1 ||
        winnersCount > 20 ||
        !prize
      ) {
        return message.reply(
          'Upotreba: `.gstart 10m 1 Nitro`\n' +
          'Opcioni uslovi se dodaju posle znaka `|`.'
        );
      }

      const options = optionParts.map(value => value.trim());
      const giveaway = {
        guildId: message.guild.id,
        channelId: message.channel.id,
        messageId: null,
        hostId: message.author.id,
        prize,
        winnersCount,
        endsAt: Date.now() + duration,
        status: 'active',
        winnerIds: [],
        roleId: null,
        requireVoice: false,
        minMessages: 0,
        emoji: EMOJI
      };

      for (const option of options) {
        if (/^vc$/i.test(option)) giveaway.requireVoice = true;

        const roleMatch = option.match(/^role:(\d{17,20})$/i);
        if (roleMatch) giveaway.roleId = roleMatch[1];

        const messagesMatch = option.match(/^minmsgs:(\d+)$/i);
        if (messagesMatch) giveaway.minMessages = Number(messagesMatch[1]);

        const emojiMatch = option.match(/^emoji:(.+)$/i);
        if (emojiMatch) giveaway.emoji = emojiMatch[1].trim();
      }

      if (giveaway.roleId && !message.guild.roles.cache.has(giveaway.roleId)) {
        return message.reply('Uloga iz `role:ID` nije pronađena na serveru.');
      }

      const requirements = [];
      if (giveaway.roleId) requirements.push(`<@&${giveaway.roleId}>`);
      if (giveaway.requireVoice) requirements.push('Moraš biti u voice kanalu');
      if (giveaway.minMessages) {
        requirements.push(`Najmanje ${giveaway.minMessages} poruka`);
      }

      const endsAt = Math.floor(giveaway.endsAt / 1000);

      const post = await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR)
            .setTitle('🎁 NEW GIVEAWAY')
            .setDescription(
              `**Nagrada:** ${prize}\n\n` +
              `**Pobednici:** ${winnersCount}\n` +
              `**Završava se:** <t:${endsAt}:R>\n` +
              `**Organizator:** ${message.author}\n\n` +
              `Reaguj sa ${giveaway.emoji} da učestvuješ!\n\n` +
              (requirements.length
                ? `**Uslovi:**\n${requirements.map(item => `• ${item}`).join('\n')}`
                : '**Uslovi:** Nema dodatnih uslova.')
            )
            .setFooter({ text: 'HAOS • Giveaway' })
            .setTimestamp(giveaway.endsAt)
        ]
      });

      giveaway.messageId = post.id;
      data.giveaways[post.id] = giveaway;
      saveData();

      await post.react(giveaway.emoji);
      scheduleGiveaway(message.guild, giveaway);

      return message.reply({
        embeds: [
          makeEmbed(
            'Giveaway pokrenut!',
            `Nagrada: **${prize}**\nID poruke: \`${post.id}\``
          )
        ]
      });
    }

    // END GIVEAWAY
    if (['gend', 'endgiveaway'].includes(command)) {
      if (!getPermission(message, PermissionFlagsBits.ManageGuild)) return;

      const id = args[0];
      const giveaway = data.giveaways[id];

      if (!giveaway || giveaway.status !== 'active') {
        return message.reply('Nisam pronašao aktivan giveaway. Proveri ID poruke.');
      }

      const guild = await client.guilds.fetch(giveaway.guildId);
      await finishGiveaway(guild, giveaway);

      return message.reply({
        embeds: [makeEmbed('Giveaway završen', 'Izvlačenje je završeno.')]
      });
    }

    // REROLL GIVEAWAY
    if (['greroll', 'reroll'].includes(command)) {
      if (!getPermission(message, PermissionFlagsBits.ManageGuild)) return;

      const id = args[0];
      const count = args[1] === undefined ? 1 : Number(args[1]);
      const giveaway = data.giveaways[id];

      if (!giveaway || giveaway.status !== 'ended') {
        return message.reply('Nisam pronašao završen giveaway sa tim ID-jem.');
      }

      if (!Number.isInteger(count) || count < 1 || count > 20) {
        return message.reply('Broj pobednika mora biti između 1 i 20.');
      }

      const guild = await client.guilds.fetch(giveaway.guildId);
      const channel = await guild.channels.fetch(giveaway.channelId);
      if (!channel?.isTextBased()) {
        return message.reply('Kanal nagradne igre nije pronađen.');
      }

      const post = await channel.messages.fetch(id);
      const eligible = await getEligibleUsers(guild, giveaway, post);
      const previous = new Set(giveaway.winnerIds || []);
      const newEntrants = eligible.filter(user => !previous.has(user.id));
      const winners = chooseWinners(newEntrants, count);

      if (!winners.length) {
        return message.reply('Nema novih učesnika za ponovno izvlačenje.');
      }

      giveaway.winnerIds.push(...winners.map(user => user.id));
      saveData();

      const mentions = winners.map(user => `<@${user.id}>`).join(', ');

      return message.channel.send({
        embeds: [
          makeEmbed(
            '🎉 GIVEAWAY REROLL',
            `Novi pobednik/pobednici: ${mentions}\nNagrada: **${giveaway.prize}**`
          )
        ],
        allowedMentions: { users: winners.map(user => user.id) }
      });
    }
  } catch (error) {
    console.error(`Greška u komandi ${command}:`, error);

    message.reply({
      embeds: [
        makeEmbed(
          'Greška',
          'Komanda nije uspela. Proveri dozvole bota i konzolu PebbleHost-a.'
        )
      ]
    }).catch(() => {});
  }
});

// POMEN BOTA
client.on(Events.MessageCreate, async message => {
  if (message.author.bot || !client.user) return;

  if (
    message.mentions.has(client.user) &&
    !message.mentions.everyone &&
    !message.content.startsWith(PREFIX)
  ) {
    const mentionEmbed = makeEmbed(
      '🤖 Haos Client',
      `Ćao ${message.author}!\nPrefix mi je \`.\`.\nZa spisak komandi ukucaj \`.help\`.`
    );

    await message.reply({ embeds: [mentionEmbed] }).catch(() => {});
  }
});

// OBNAVLJANJE GIVEAWAY-A POSLE RESTARTA
client.once(Events.ClientReady, async bot => {
  console.log(`Bot je online: ${bot.user.tag}`);

  for (const giveaway of Object.values(data.giveaways)) {
    if (giveaway.status !== 'active') continue;

    try {
      const guild = await client.guilds.fetch(giveaway.guildId);
      scheduleGiveaway(guild, giveaway);
    } catch (error) {
      console.error('Ne mogu da obnovim giveaway:', error);
    }
  }
});

// PROVERA TOKENA
if (!process.env.DISCORD_TOKEN) {
  console.error('Nedostaje DISCORD_TOKEN u .env fajlu.');
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
