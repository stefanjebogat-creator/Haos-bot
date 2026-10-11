
require('dotenv').config();

const fs = require('fs');
const {
  Client,
  GatewayIntentBits,
  Events,
  EmbedBuilder,
  PermissionFlagsBits,
  ActivityType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType
} = require('discord.js');

const PREFIX = '.';
const COLOR = '#F3994A';

const GW_EMOJI_TADA = '<a:Tada_Green:1558763174822678528>';
const GW_EMOJI_LOCK = '<a:lock_key:1558763080127873175>';
const GW_EMOJI_CHECK = '<a:RD_Tick:1558762990885412988>';
const GW_EMOJI_GIFT = '<a:gws:1558762599993188372>';
const GW_EMOJI_ARROW = '<a:ARROW_BLUE:1558762818386530415>';
const GW_REACTION = '1558763174822678528';
const GW_BANNER_URL = 'https://i.imgur.com/Mu8O3ZV.png';
const GW_COLOR = 0xFFA500;

const giveaways = new Map();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ]
});

function embed(title, description) {
  return new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

function reason(args) {
  return args.join(' ') || 'Nije naveden razlog.';
}

function durationMs(text) {
  const m = String(text || '').match(/^(\d+)(s|m|h|d)$/i);
  if (!m) return null;

  const unit = {
    s: 1000,
    m: 60000,
    h: 3600000,
    d: 86400000
  }[m[2].toLowerCase()];

  const ms = Number(m[1]) * unit;
  return Number(m[1]) > 0 && ms <= 604800000 ? ms : null;
}

// Giveaway trajanje: 30s, 10m, 2h, 1d, 1d2h30m
function parseGiveawayTime(input) {
  if (!input) return null;

  const regex = /(\d+)(d|h|m|s)/gi;
  let match;
  let total = 0;
  let consumed = '';
  const units = {
    d: 86400000,
    h: 3600000,
    m: 60000,
    s: 1000
  };

  while ((match = regex.exec(input)) !== null) {
    consumed += match[0];
    total += Number(match[1]) * units[match[2].toLowerCase()];
  }

  if (consumed.toLowerCase() !== input.toLowerCase()) return null;
  if (total < 10000 || total > 604800000) return null;

  return total;
}

function buildGiveawayEmbed(prize, winnersCount, endTimestamp, entriesCount, ended = false, winners = '') {
  const description = ended
    ? `${GW_EMOJI_GIFT} **Nagrada:** ${prize}\n\n` +
      `${GW_EMOJI_CHECK} **Pobednik/pobednici:**\n${winners || 'Nema pobednika.'}\n\n` +
      `${GW_EMOJI_ARROW} **Broj učesnika:** ${entriesCount}`
    : `${GW_EMOJI_GIFT} **Nagrada:** ${prize}\n\n` +
      `${GW_EMOJI_LOCK} **Pobednika:** ${winnersCount}\n` +
      `${GW_EMOJI_ARROW} **Završava se:** <t:${Math.floor(endTimestamp / 1000)}:R>\n\n` +
      `${GW_EMOJI_TADA} Reaguj ovom porukom da učestvuješ!\n\n` +
      `${GW_EMOJI_CHECK} **Učesnici:** ${entriesCount}`;

  const result = new EmbedBuilder()
    .setColor(GW_COLOR)
    .setTitle(ended ? '🎉 NAGRADNA IGRA JE ZAVRŠENA!' : `${GW_EMOJI_TADA} HAOS GIVEAWAY`)
    .setDescription(description)
    .setFooter({ text: 'HAOS CLIENT • GIVEAWAYS' })
    .setTimestamp();

  if (GW_BANNER_URL) result.setImage(GW_BANNER_URL);
  return result;
}

async function getGiveawayEntries(giveawayMessage) {
  const reaction =
    giveawayMessage.reactions.cache.get(GW_REACTION) ||
    giveawayMessage.reactions.cache.find(r => r.emoji.name === '🎉');

  if (!reaction) return [];

  const users = await reaction.users.fetch();
  return [...users.values()].filter(user => !user.bot);
}

async function finishNewGiveaway(messageId) {
  const giveaway = giveaways.get(messageId);
  if (!giveaway || giveaway.ended) return;

  giveaway.ended = true;
  clearTimeout(giveaway.timer);

  try {
    const channel = await client.channels.fetch(giveaway.channelId);
    if (!channel?.isTextBased()) {
      giveaways.delete(messageId);
      return;
    }

    const giveawayMessage = await channel.messages.fetch(messageId);
    const entrants = await getGiveawayEntries(giveawayMessage);
    const winners = [];

    while (entrants.length && winners.length < giveaway.winnersCount) {
      const index = Math.floor(Math.random() * entrants.length);
      winners.push(entrants.splice(index, 1)[0]);
    }

    const winnerMentions = winners.length
      ? winners.map(user => `<@${user.id}>`).join(', ')
      : 'Nema pobednika — niko nije učestvovao.';

    await giveawayMessage.edit({
      embeds: [
        buildGiveawayEmbed(
          giveaway.prize,
          giveaway.winnersCount,
          giveaway.endTimestamp,
          entrants.length + winners.length,
          true,
          winnerMentions
        )
      ]
    });

    await giveawayMessage.reply({
      content: winners.length
        ? `🎉 Čestitamo ${winnerMentions}! Osvojili ste **${giveaway.prize}**!`
        : 'Nagradna igra je završena bez pobednika.',
      allowedMentions: {
        users: winners.map(user => user.id)
      }
    });
  } catch (error) {
    console.error('Greška pri završavanju giveaway-a:', error);
  }

  giveaways.delete(messageId);
}

function loadWarnings() {
  try {
    return JSON.parse(fs.readFileSync('./warnings.json', 'utf8'));
  } catch {
    return {};
  }
}

function saveWarnings(data) {
  fs.writeFileSync('./warnings.json', JSON.stringify(data, null, 2));
}

function log(guild, title, description) {
  const channel = guild.channels.cache.get(process.env.LOG_CHANNEL_ID);

  if (channel?.isTextBased()) {
    channel.send({ embeds: [embed(title, description)] }).catch(() => {});
  }
}

async function dm(user, title, description) {
  try {
    await user.send({
      embeds: [
        embed(
          title,
          `**Server:** ${client.guilds.cache.first()?.name || 'HAOS'}\n${description}`
        )
      ]
    });
    return true;
  } catch {
    return false;
  }
}

async function confirmModeration(message, user, title, description) {
  const sent = await dm(
    user,
    'HAOS • Obaveštenje o moderaciji',
    `**Radnja:** ${title}\n**Moderator:** ${message.author.tag}\n**Razlog:** ${description}`
  );

  await message.reply({
    embeds: [
      embed(
        title,
        `**Član:** ${user.tag}\n**Razlog:** ${description}\n\n` +
        (sent
          ? '📩 Privatna poruka je poslata.'
          : '⚠️ Privatna poruka nije mogla biti poslata.')
      )
    ]
  });

  log(
    message.guild,
    title,
    `Član: ${user.tag}\nModerator: ${message.author.tag}\nRazlog: ${description}`
  );
}

// STATUS BOTA
function updateBotStatus(guild) {
  if (!guild || !client.user) return;

  client.user.setPresence({
    activities: [{
      name: `/haos ${guild.memberCount.toLocaleString('en-US')} members`,
      type: ActivityType.Watching
    }],
    status: 'online'
  });
}

client.once(Events.ClientReady, bot => {
  console.log(`Bot je online: ${bot.user.tag}`);
  const guild = bot.guilds.cache.first();
  if (guild) updateBotStatus(guild);
});

// WELCOME PORUKA
client.on(Events.GuildMemberAdd, async member => {
  updateBotStatus(member.guild);

  const channel = member.guild.channels.cache.get(
    process.env.WELCOME_CHANNEL_ID
  );

  if (!channel?.isTextBased()) return;

  const welcome = new EmbedBuilder()
    .setColor('#F39A4A')
    .setTitle('NOVI MEMBER')
    .setDescription(
      `<:haos_love:1530984544080232568> Ćao <@${member.id}>, dobrodošao/la na 🌴 ⨯ HAOS\n\n` +
      `<a:haos_mesec:1530984603479707861> Isprati [Informacije](https://discord.com/channels/1530299782738743306/1530976844956959893) & [obaveštenja](https://discord.com/channels/1530299782738743306/1530977278849180000) o serveru.\n` +
      `<:haos_zvezda:1531040788551700581> Podeli [boost](https://discord.com/channels/1530299782738743306/1530299852632887366) na serveru.\n` +
      `<:haos_majaba:1531052189915676772> Zabavi se u [chat](https://discord.com/channels/1530299782738743306/1530299783603028081)\n\n` +
      `<a:haos_vatra:1531053579039674400> Postani član <@&1530966431347245087> naše zajednice.`
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
  updateBotStatus(member.guild);
  log(member.guild, 'Član je napustio server', `Član: ${member.user.tag}`);
});

client.on(Events.GuildBanAdd, ban => {
  log(ban.guild, 'Član je banovan', `Član: ${ban.user.tag}`);
});

client.on(Events.GuildBanRemove, ban => {
  log(ban.guild, 'Ban je uklonjen', `Član: ${ban.user.tag}`);
});

// TICKET SISTEM — PANEL, OTVARANJE I ZATVARANJE
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton() || !interaction.guild) return;

  try {
    if (interaction.customId === 'haos_ticket_create') {
      const existing = interaction.guild.channels.cache.find(channel =>
        channel.type === ChannelType.GuildText &&
        channel.topic === `haos-ticket-owner:${interaction.user.id}`
      );

      if (existing) {
        return interaction.reply({
          content: `Već imaš otvoren ticket: ${existing}`,
          ephemeral: true
        });
      }

      const safeName = interaction.user.username
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 18) || 'member';

      const overwrites = [
        {
          id: interaction.guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks
          ]
        },
        {
          id: client.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageChannels
          ]
        }
      ];

      const supportRoleId = process.env.TICKET_SUPPORT_ROLE_ID;

      if (supportRoleId && interaction.guild.roles.cache.has(supportRoleId)) {
        overwrites.push({
          id: supportRoleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles
          ]
        });
      }

      const channelOptions = {
        name: `ticket-${safeName}`,
        type: ChannelType.GuildText,
        topic: `haos-ticket-owner:${interaction.user.id}`,
        permissionOverwrites: overwrites,
        reason: `Ticket otvorio/la ${interaction.user.tag}`
      };

      const categoryId = process.env.TICKET_CATEGORY_ID;
      const category = categoryId
        ? interaction.guild.channels.cache.get(categoryId)
        : null;

      if (category?.type === ChannelType.GuildCategory) {
        channelOptions.parent = category.id;
      }

      const ticketChannel = await interaction.guild.channels.create(channelOptions);

      const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('haos_ticket_close')
          .setLabel('Zatvori ticket')
          .setEmoji('🔒')
          .setStyle(ButtonStyle.Danger)
      );

      await ticketChannel.send({
        content: `${interaction.user}${supportRoleId ? ` <@&${supportRoleId}>` : ''}`,
        embeds: [
          embed(
            '🎫 HAOS • Staff Prijave',
            `Zdravo ${interaction.user}! Napiši detalje svoje prijave. Staff tim će ti odgovoriti ovde.\n\nKada završite razgovor, vlasnik ticketa ili staff može kliknuti na **Zatvori ticket**.`
          )
        ],
        components: [closeRow],
        allowedMentions: {
          users: [interaction.user.id],
          roles: supportRoleId ? [supportRoleId] : []
        }
      });

      log(
        interaction.guild,
        'Ticket otvoren',
        `Korisnik: ${interaction.user.tag}\nKanal: ${ticketChannel}`
      );

      return interaction.reply({
        content: `Ticket je otvoren: ${ticketChannel}`,
        ephemeral: true
      });
    }

    if (interaction.customId === 'haos_ticket_close') {
      const channel = interaction.channel;
      const ownerMatch = channel?.topic?.match(/^haos-ticket-owner:(\d+)$/);

      if (!ownerMatch) {
        return interaction.reply({
          content: 'Ovo nije prepoznat ticket kanal.',
          ephemeral: true
        });
      }

      const ownerId = ownerMatch[1];
      const supportRoleId = process.env.TICKET_SUPPORT_ROLE_ID;
      const isOwner = interaction.user.id === ownerId;

      const isStaff = Boolean(
        interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels) ||
        (
          supportRoleId &&
          interaction.member.roles?.cache?.has(supportRoleId)
        )
      );

      if (!isOwner && !isStaff) {
        return interaction.reply({
          content: 'Samo vlasnik ticketa ili staff može da ga zatvori.',
          ephemeral: true
        });
      }

      await interaction.reply({
        embeds: [
          embed(
            '🔒 Ticket se zatvara',
            `Ticket zatvara ${interaction.user}. Kanal će biti obrisan za 5 sekundi.`
          )
        ]
      });

      log(
        interaction.guild,
        'Ticket zatvoren',
        `Kanal: #${channel.name}\nZatvorio/la: ${interaction.user.tag}`
      );

      setTimeout(() => {
        channel.delete(`Ticket zatvorio/la ${interaction.user.tag}`)
          .catch(console.error);
      }, 5000);
    }
  } catch (error) {
    console.error('Greška u ticket sistemu:', error);

    const payload = {
      content: 'Greška u ticket sistemu. Proveri da bot ima dozvolu Manage Channels.',
      ephemeral: true
    };

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
});

// SVE KOMANDE
client.on(Events.MessageCreate, async message => {
  if (!message.guild || message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  let command = (args.shift() || '').toLowerCase();

  const aliases = {
    h: 'help',
    b: 'ban',
    ub: 'unban',
    k: 'kick',
    m: 'mute',
    um: 'unmute',
    w: 'warn',
    ws: 'warnings',
    gw: 'giveaway',
    egw: 'endgiveaway',
    rr: 'reroll',
    hb: 'hardban',
    hm: 'hardmute',
    hk: 'hardkick',
    sb: 'softban',
    ts: 'ticketsetup',
    gstart: 'gstart',
    gend: 'gend',
    greroll: 'greroll'
  };

  command = aliases[command] || command;
  if (!command) return;

  const member = message.member;
  const target = message.mentions.members.first();

  const hasPermission = permission => {
    if (member.permissions.has(permission)) return true;

    message.reply({
      embeds: [
        embed('Nemaš dozvolu', 'Nemaš potrebnu dozvolu za ovu komandu.')
      ]
    }).catch(() => {});

    return false;
  };

  try {
    // TICKET PANEL
    if (command === 'ticketsetup') {
      if (!hasPermission(PermissionFlagsBits.ManageGuild)) return;

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('haos_ticket_create')
          .setLabel('NAPRAVI TIKET')
          .setEmoji('🎟️')
          .setStyle(ButtonStyle.Primary)
      );

      const panel = new EmbedBuilder()
        .setColor('#43A047')
        .setTitle('Staff Prijave')
        .setDescription(
          '**STAFF PRIJAVE – REAGUJTE SA 🎟️, DA BI OTVORILI TIKET**'
        )
        .setFooter({
          text: 'TicketTool.xyz - Ticketing without clutter'
        });

      return message.channel.send({
        embeds: [panel],
        components: [row]
      });
    }

    // HELP
    if (['help', 'pomoc', 'pomoć'].includes(command)) {
      return message.reply({
        embeds: [
          embed(
            'HAOS • Komande',
            '**🛡️ MODERACIJA**\n' +
            '`.ban` / `.b @član [razlog]`\n' +
            '`.hardban` / `.hb @član [razlog]`\n' +
            '`.softban` / `.sb @član [razlog]`\n' +
            '`.unban` / `.ub ID [razlog]`\n' +
            '`.kick` / `.k @član [razlog]`\n' +
            '`.hardkick` / `.hk @član [razlog]`\n' +
            '`.mute` / `.m @član 10m [razlog]`\n' +
            '`.hardmute` / `.hm @član [razlog]`\n' +
            '`.unmute` / `.um @član`\n' +
            '`.warn` / `.w @član [razlog]`\n' +
            '`.warnings` / `.ws @član`\n\n' +
            '**🎉 NAGRADNE IGRE**\n' +
            '`.gstart 1h 2 Nitro` — pokreni giveaway\n' +
            '`.gend ID_poruke` — završi giveaway\n' +
            '`.greroll ID_poruke` — izaberi novog pobednika\n\n' +
            '**🎫 TICKETS**\n' +
            '`.ticketsetup` / `.ts` — postavi ticket panel\n\n' +
            '**ℹ️ OSTALO**\n' +
            '`.help` / `.h`'
          )
        ]
      });
    }

    // HARDBAN
    if (command === 'hardban') {
      if (!hasPermission(PermissionFlagsBits.BanMembers)) return;
      if (!target) {
        return message.reply('Upotreba: `.hardban @član [razlog]` ili `.hb @član [razlog]`');
      }
      if (!target.bannable) {
        return message.reply('Ne mogu da banujem ovog člana. Proveri uloge bota.');
      }

      const why = reason(args);
      await dm(target.user, 'HAOS • HARDBAN',
        `**Moderator:** ${message.author.tag}\n**Razlog:** ${why}`);

      await target.ban({
        deleteMessageSeconds: 604800,
        reason: `${why} | Hardban | Moderator: ${message.author.tag}`
      });

      log(message.guild, 'HARDBAN',
        `Član: ${target.user.tag}\nModerator: ${message.author.tag}\nRazlog: ${why}`);

      return message.reply({
        embeds: [
          embed('🔨 HARDBAN',
            `**Član:** ${target.user.tag}\n**Poruke obrisane:** do 7 dana\n**Razlog:** ${why}`)
        ]
      });
    }

    // SOFTBAN
    if (command === 'softban') {
      if (!hasPermission(PermissionFlagsBits.BanMembers)) return;
      if (!target) {
        return message.reply('Upotreba: `.softban @član [razlog]` ili `.sb @član [razlog]`');
      }
      if (!target.bannable) {
        return message.reply('Ne mogu da banujem ovog člana. Proveri uloge bota.');
      }

      const why = reason(args);
      const user = target.user;

      await target.ban({
        deleteMessageSeconds: 604800,
        reason: `${why} | Softban | Moderator: ${message.author.tag}`
      });

      await message.guild.members.unban(user.id, `Softban završen | ${why}`);

      await dm(user, 'HAOS • SOFTBAN',
        `Poruke iz poslednjih 7 dana su obrisane.\n**Moderator:** ${message.author.tag}\n**Razlog:** ${why}`);

      log(message.guild, 'SOFTBAN',
        `Član: ${user.tag}\nModerator: ${message.author.tag}\nRazlog: ${why}`);

      return message.reply({
        embeds: [
          embed('🧹 SOFTBAN',
            `**Korisnik:** ${user.tag}\nBan je odmah uklonjen, a poruke iz poslednjih 7 dana su obrisane.\n**Razlog:** ${why}`)
        ]
      });
    }

    // BAN
    if (command === 'ban') {
      if (!hasPermission(PermissionFlagsBits.BanMembers)) return;

      if (!target) {
        return message.reply('Upotreba: `.ban @član [razlog]`');
      }

      if (!target.bannable) {
        return message.reply('Ne mogu banovati ovog korisnika. Proveri uloge bota.');
      }

      const why = reason(args);

      try {
        await target.send({
          embeds: [
            embed(
              'HAOS • Banovanje',
              `Banovani ste sa servera **${message.guild.name}**.\n` +
              `**Moderator:** ${message.author.tag}\n**Razlog:** ${why}`
            )
          ]
        });
      } catch {}

      await target.ban({
        reason: `${why} | Moderator: ${message.author.tag}`
      });

      log(message.guild, 'BAN',
        `Član: ${target.user.tag}\nModerator: ${message.author.tag}\nRazlog: ${why}`);

      return message.reply({
        embeds: [
          embed('🔨 Haos Client — Ban',
            `**Član:** ${target.user.tag}\n**Razlog:** ${why}\n**Moderator:** ${message.author.tag}`)
        ]
      });
    }

    // UNBAN
    if (command === 'unban') {
      if (!hasPermission(PermissionFlagsBits.BanMembers)) return;

      const id = args.shift();
      if (!id || !/^\d{17,20}$/.test(id)) {
        return message.reply('Upotreba: `.unban ID [razlog]` ili `.ub ID [razlog]`');
      }

      const why = reason(args);
      const user = await client.users.fetch(id);
      await message.guild.members.unban(id, why);

      await dm(user, 'HAOS • Ban uklonjen',
        `Vaš ban na serveru je uklonjen.\n**Moderator:** ${message.author.tag}\n**Razlog:** ${why}`);

      log(message.guild, 'Ban je uklonjen',
        `Korisnik: ${user.tag}\nModerator: ${message.author.tag}\nRazlog: ${why}`);

      return message.reply({
        embeds: [
          embed('Ban je uklonjen',
            `**Korisnik:** ${user.tag}\n**Razlog:** ${why}`)
        ]
      });
    }

    // HARDKICK
    if (command === 'hardkick') {
      if (!hasPermission(PermissionFlagsBits.KickMembers)) return;
      if (!target) return message.reply('Upotreba: `.hardkick @član [razlog]` ili `.hk @član [razlog]`');
      if (!target.kickable) {
        return message.reply('Ne mogu da izbacim ovog člana. Proveri uloge bota.');
      }

      const why = reason(args);
      await dm(target.user, 'HAOS • HARDKICK',
        `**Moderator:** ${message.author.tag}\n**Razlog:** ${why}`);

      await target.kick(`${why} | Hardkick | Moderator: ${message.author.tag}`);

      log(message.guild, 'HARDKICK',
        `Član: ${target.user.tag}\nModerator: ${message.author.tag}\nRazlog: ${why}`);

      return message.reply({
        embeds: [
          embed('👢 HARDKICK',
            `**Član:** ${target.user.tag}\n**Razlog:** ${why}`)
        ]
      });
    }

    // KICK
    if (command === 'kick') {
      if (!hasPermission(PermissionFlagsBits.KickMembers)) return;
      if (!target) return message.reply('Upotreba: `.kick @član [razlog]`');
      if (!target.kickable) return message.reply('Ne mogu da izbacim ovog člana.');

      const why = reason(args);
      await dm(target.user, 'HAOS • Izbacivanje',
        `**Moderator:** ${message.author.tag}\n**Razlog:** ${why}`);

      await target.kick(`${why} | Moderator: ${message.author.tag}`);

      log(message.guild, 'Član je izbačen',
        `Član: ${target.user.tag}\nModerator: ${message.author.tag}\nRazlog: ${why}`);

      return message.reply({
        embeds: [
          embed('Član je izbačen',
            `**Član:** ${target.user.tag}\n**Razlog:** ${why}`)
        ]
      });
    }

    // HARDMUTE
    if (command === 'hardmute') {
      if (!hasPermission(PermissionFlagsBits.ModerateMembers)) return;
      if (!target) return message.reply('Upotreba: `.hardmute @član [razlog]` ili `.hm @član [razlog]`');
      if (!target.moderatable) {
        return message.reply('Ne mogu da utišam ovog člana. Proveri uloge bota.');
      }

      const why = reason(args);
      await target.timeout(28 * 24 * 60 * 60 * 1000,
        `${why} | Hardmute | Moderator: ${message.author.tag}`);

      return confirmModeration(message, target.user, 'HARDMUTE • 28 dana',
        `${why}\nTrajanje: 28 dana`);
    }

    // MUTE
    if (command === 'mute') {
      if (!hasPermission(PermissionFlagsBits.ModerateMembers)) return;
      if (!target || !args[0]) {
        return message.reply('Upotreba: `.mute @član 10m [razlog]`');
      }

      const text = args.shift();
      const ms = durationMs(text);

      if (!ms) return message.reply('Trajanje npr. `10m`, `2h` ili `7d` (najviše 7 dana).');
      if (!target.moderatable) return message.reply('Ne mogu da utišam ovog člana.');

      const why = reason(args);
      await target.timeout(ms, `${why} | Moderator: ${message.author.tag}`);

      return confirmModeration(message, target.user, 'Utišavanje',
        `${why}\nTrajanje: ${text}`);
    }

    // UNMUTE
    if (command === 'unmute') {
      if (!hasPermission(PermissionFlagsBits.ModerateMembers)) return;
      if (!target) return message.reply('Upotreba: `.unmute @član` ili `.um @član`');
      if (!target.moderatable) {
        return message.reply('Ne mogu da uklonim utišavanje ovom članu.');
      }

      await target.timeout(null, `Uklonio/la ${message.author.tag}`);

      return confirmModeration(message, target.user, 'Uklanjanje utišavanja',
        'Moderator je uklonio/la utišavanje.');
    }

    // WARN
    if (command === 'warn') {
      if (!hasPermission(PermissionFlagsBits.ModerateMembers)) return;
      if (!target) return message.reply('Upotreba: `.warn @član [razlog]` ili `.w @član [razlog]`');

      const why = reason(args);
      const data = loadWarnings();

      data[target.id] ||= [];
      data[target.id].push({
        razlog: why,
        moderator: message.author.tag,
        datum: new Date().toISOString()
      });

      saveWarnings(data);

      const sent = await dm(target.user, 'HAOS • Upozorenje',
        `Server: **${message.guild.name}**\n**Moderator:** ${message.author.tag}\n**Razlog:** ${why}`);

      return message.reply({
        embeds: [
          embed('Upozorenje dodato',
            `**Član:** ${target.user.tag}\n**Razlog:** ${why}\n**Ukupno upozorenja:** ${data[target.id].length}\n` +
            (sent ? '📩 DM je poslat.' : '⚠️ DM nije mogao biti poslat.'))
        ]
      });
    }

    // PREGLED UPOZORENJA
    if (command === 'warnings') {
      if (!hasPermission(PermissionFlagsBits.ModerateMembers)) return;
      if (!target) return message.reply('Upotreba: `.warnings @član` ili `.ws @član`');

      const list = loadWarnings()[target.id] || [];

      if (!list.length) {
        return message.reply({
          embeds: [embed('Upozorenja', 'Ovaj član nema zabeleženih upozorenja.')]
        });
      }

      return message.reply({
        embeds: [
          embed(
            `Upozorenja • ${target.user.tag}`,
            list.slice(-10).map((w, i) =>
              `**${i + 1}.** ${w.razlog}\nModerator: ${w.moderator}`
            ).join('\n\n')
          )
        ]
      });
    }

    // NOVI GIVEAWAY SISTEM
    if (command === 'gstart') {
      if (!hasPermission(PermissionFlagsBits.ManageGuild)) return;

      const timeInput = args.shift();
      const ms = parseGiveawayTime(timeInput);
      const winnersCount = Number(args.shift());
      const prize = args.join(' ').trim();

      if (!ms || !Number.isInteger(winnersCount) ||
          winnersCount < 1 || winnersCount > 20 || !prize) {
        return message.reply(
          'Upotreba: `.gstart 1h 2 Nitro`\n' +
          'Primer vremena: `30s`, `10m`, `2h`, `1d`, `1d2h30m`.\n' +
          'Trajanje mora biti od 10 sekundi do 7 dana.'
        );
      }

      const endTimestamp = Date.now() + ms;

      const giveawayMessage = await message.channel.send({
        embeds: [
          buildGiveawayEmbed(prize, winnersCount, endTimestamp, 0)
        ]
      });

      try {
        await giveawayMessage.react(GW_REACTION);
      } catch (error) {
        console.error('Custom giveaway emoji nije mogao da se doda:', error);
        await giveawayMessage.react('🎉').catch(() => {});
      }

      const giveaway = {
        messageId: giveawayMessage.id,
        channelId: message.channel.id,
        guildId: message.guild.id,
        prize,
        winnersCount,
        endTimestamp,
        ended: false,
        timer: null
      };

      giveaway.timer = setTimeout(
        () => finishNewGiveaway(giveawayMessage.id),
        ms
      );

      giveaways.set(giveawayMessage.id, giveaway);

      return message.reply({
        embeds: [
          embed(
            'Giveaway pokrenut',
            `${GW_EMOJI_CHECK} Nagradna igra je uspešno pokrenuta!\n` +
            `${GW_EMOJI_GIFT} **Nagrada:** ${prize}\n` +
            `${GW_EMOJI_ARROW} **Pobednika:** ${winnersCount}\n` +
            `**ID poruke:** \`${giveawayMessage.id}\``
          )
        ]
      });
    }

    // ZAVRŠI GIVEAWAY
    if (command === 'gend') {
      if (!hasPermission(PermissionFlagsBits.ManageGuild)) return;

      const messageId = args[0];
      if (!messageId) {
        return message.reply('Upotreba: `.gend ID_poruke`');
      }

      const giveaway = giveaways.get(messageId);
      if (!giveaway) {
        return message.reply(
          'Nisam pronašao aktivnu nagradnu igru. Giveaway mora biti pokrenut dok je bot online.'
        );
      }

      await finishNewGiveaway(messageId);

      return message.reply({
        embeds: [
          embed('Giveaway završen', `${GW_EMOJI_CHECK} Izvlačenje je završeno.`)
        ]
      });
    }

    // REROLL GIVEAWAY
    if (command === 'greroll') {
      if (!hasPermission(PermissionFlagsBits.ManageGuild)) return;

      const messageId = args[0];
      if (!messageId) {
        return message.reply('Upotreba: `.greroll ID_poruke`');
      }

      const giveaway = giveaways.get(messageId);

      if (giveaway && !giveaway.ended) {
        return message.reply('Ova nagradna igra još traje. Prvo je završi komandom `.gend ID_poruke`.');
      }

      let giveawayMessage;

      try {
        giveawayMessage = await message.channel.messages.fetch(messageId);
      } catch {
        return message.reply('Ne mogu da pronađem poruku. Koristi komandu u istom kanalu gde je giveaway.');
      }

      const entrants = await getGiveawayEntries(giveawayMessage);

      if (!entrants.length) {
        return message.reply('Nema učesnika za novo izvlačenje.');
      }

      const winner = entrants[Math.floor(Math.random() * entrants.length)];

      return message.reply({
        embeds: [
          embed(
            `${GW_EMOJI_TADA} Novi pobednik`,
            `Čestitamo <@${winner.id}>! Izvučen je novi pobednik.`
          )
        ],
        allowedMentions: { users: [winner.id] }
      });
    }

    // STARE GIVEAWAY KOMANDE — preusmeravanje na novi sistem
    if (command === 'giveaway') {
      return message.reply(
        'Koristi novi sistem: `.gstart 1h 2 Nitro`'
      );
    }

    if (command === 'endgiveaway') {
      return message.reply(
        'Koristi novu komandu: `.gend ID_poruke`'
      );
    }

    if (command === 'reroll') {
      return message.reply(
        'Koristi novu komandu: `.greroll ID_poruke`'
      );
    }

  } catch (err) {
    console.error('Greška u komandi:', err);

    message.reply({
      embeds: [
        embed('Greška', 'Komanda nije uspela. Proveri dozvole bota i konzolu.')
      ]
    }).catch(() => {});
  }
});

// ODGOVOR NA POMINJANJE BOTA
client.on(Events.MessageCreate, async message => {
  if (message.author.bot || !client.user) return;

  if (message.mentions.has(client.user) && !message.mentions.everyone) {
    const mentionEmbed = new EmbedBuilder()
      .setColor(0xFF8C00)
      .setTitle('<:276022clydebot:1558907359613419531> Haos Client — Mention')
      .setDescription(
        `- Ćao ${message.author}, ja sam personalizovani **Client** za **Haos** balkanski server.\n` +
        '- Koristim prefix `.`. Ukucaj `.help` za više informacija.'
      );

    await message.reply({ embeds: [mentionEmbed] }).catch(() => {});
  }
});

// PROVERA TOKENA I POKRETANJE
if (!process.env.DISCORD_TOKEN) {
  console.error('Nedostaje DISCORD_TOKEN u .env fajlu.');
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
