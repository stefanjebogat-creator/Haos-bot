
require('dotenv').config();

const fs = require('fs');
const path = require('path');

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
const COMMAND_LOG_CHANNEL_ID = '1558956324014915724';
const WHITELIST_FILE = path.join(__dirname, 'whitelist.json');
const WARNINGS_FILE = path.join(__dirname, 'warnings.json');

// OBAVEZNO: ovde upiši svoj Discord USER ID.
const BOT_OWNER_IDS = ['UPISI_SVOJ_DISCORD_USER_ID'];

const GW_EMOJI = '<:haos_gw:1559207001735700550>';
const GW_EMOJI_ID = '1559207001735700550';
const GW_SAT = '<:haos_sat:1559206979170214000>';
const GW_NAGRADA = '<:haos_nagrada:1559206996253872208>';
const GW_TROFEJ = '<:haos_trofej:1559206993003028561>';
const GW_KRUNA = '<:haos_kruna:1559206986527285288>';
const GW_COLOR = '#F3994A';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

function embed(title, description) {
  return new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

function loadJSON(file, fallback = {}) {
  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
      return fallback;
    }

    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`Greška pri čitanju ${file}:`, error);
    return fallback;
  }
}

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function loadWhitelist() {
  const data = loadJSON(WHITELIST_FILE, []);
  return Array.isArray(data)
    ? data.filter(id => typeof id === 'string' && /^\d{17,22}$/.test(id))
    : [];
}

function saveWhitelist(ids) {
  saveJSON(WHITELIST_FILE, [...new Set(ids)]);
}

function isBotOwner(userId) {
  return BOT_OWNER_IDS.includes(userId);
}

function isWhitelisted(userId) {
  return isBotOwner(userId) || loadWhitelist().includes(userId);
}

function log(guild, title, description) {
  if (!guild) return;

  const channel = guild.channels.cache.get(
    process.env.LOG_CHANNEL_ID
  );

  if (channel?.isTextBased()) {
    channel.send({
      embeds: [embed(title, description)]
    }).catch(() => {});
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

function durationMs(value) {
  const match = String(value || '').match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return null;

  const units = {
    s: 1000,
    m: 60000,
    h: 3600000,
    d: 86400000
  };

  const duration = Number(match[1]) * units[match[2].toLowerCase()];

  return Number(match[1]) > 0 && duration <= 7 * 86400000
    ? duration
    : null;
}

function updateBotStatus() {
  if (!client.user) return;

  const guild = client.guilds.cache.get('1530299782738743306');
  const count = guild ? guild.memberCount : 0;

  client.user.setPresence({
    activities: [{
      name: `Ukupno članova ${count} 👥`,
      type: ActivityType.Watching
    }],
    status: 'online'
  });
}

client.once(Events.ClientReady, bot => {
  console.log(`Bot je online: ${bot.user.tag}`);
  updateBotStatus();
  setInterval(updateBotStatus, 5 * 60 * 1000);
});

// WELCOME PORUKA
client.on(Events.GuildMemberAdd, async member => {
  updateBotStatus();

  const channel = member.guild.channels.cache.get(
    process.env.WELCOME_CHANNEL_ID
  );

  if (!channel?.isTextBased()) return;

  const welcome = new EmbedBuilder()
    .setColor('#F39A4A')
    .setTitle('NOVI MEMBER')
    .setDescription(
      `<:haos_love:1530984544080232568> Ćao <@${member.id}>, dobrodošao/la na 🌴 ⨯ HAOS\n\n` +
      `<a:haos_mesec:1530984603479707861> Isprati [Informacije](https://discord.com/channels/1530299782738743306/1530976844956958993) & [obaveštenja](https://discord.com/channels/1530299782738743306/1530977278849188000) o serveru.\n` +
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
    allowedMentions: {
      users: [member.id],
      roles: []
    }
  }).catch(console.error);
});

client.on(Events.GuildMemberRemove, member => {
  updateBotStatus();
  log(member.guild, 'Član je napustio server', `Član: ${member.user.tag}`);
});

client.on(Events.GuildBanAdd, ban => {
  log(ban.guild, 'Član je banovan', `Član: ${ban.user.tag}`);
});

client.on(Events.GuildBanRemove, ban => {
  log(ban.guild, 'Ban je uklonjen', `Član: ${ban.user.tag}`);
});

// KOMANDE
client.on(Events.MessageCreate, async message => {
  if (!message.guild || message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  let command = (args.shift() || '').toLowerCase();

  const logChannel = message.guild.channels.cache.get(
    COMMAND_LOG_CHANNEL_ID
  );

  if (logChannel) {
    const logEmbed = new EmbedBuilder()
      .setColor('#3498DB')
      .setTitle('📋 Korišćena komanda')
      .addFields(
        {
          name: '👤 Korisnik',
          value: `${message.author.tag} (${message.author.id})`
        },
        {
          name: '⚙️ Komanda',
          value: `\`${message.content.slice(0, 1000)}\``
        },
        {
          name: '📍 Kanal',
          value: `${message.channel}`
        }
      )
      .setTimestamp();

    logChannel.send({ embeds: [logEmbed] }).catch(() => {});
  }

  const aliases = {
    h: 'help',
    b: 'ban',
    ub: 'unban',
    k: 'kick',
    m: 'mute',
    um: 'unmute',
    w: 'warn',
    ws: 'warnings',
    av: 'avatar',
    gw: 'giveaway',
    gstart: 'giveaway',
    egw: 'endgiveaway',
    gend: 'endgiveaway',
    rr: 'reroll',
    greroll: 'reroll',
    hb: 'hardban',
    hm: 'hardmute',
    hk: 'hardkick',
    sb: 'softban',
    ts: 'ticketsetup',
    i: 'invites'
  };

  command = aliases[command] || command;

  // WHITELIST KOMANDE — SAMO VLASNIK BOTA
  if (['wladd', 'wlremove', 'wllist'].includes(command)) {
    if (!isBotOwner(message.author.id)) {
      return message.reply(
        '⛔ Samo vlasnik bota može upravljati whitelistom.'
      );
    }

    if (command === 'wllist') {
      const ids = loadWhitelist();

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR)
            .setTitle('🔐 HAOS • Whitelist')
            .setDescription(
              ids.length
                ? ids.map((id, i) =>
                    `**${i + 1}.** <@${id}> — \`${id}\``
                  ).join('\n')
                : 'Whitelist je prazna.'
            )
            .setFooter({
              text: `Ukupno ovlašćenih: ${ids.length}`
            })
        ]
      });
    }

    const userId = message.mentions.users.first()?.id || args[0];

    if (!userId || !/^\d{17,22}$/.test(userId)) {
      return message.reply(
        `Upotreba: \`.${command} @član\` ili \`.${command} ID\``
      );
    }

    if (isBotOwner(userId)) {
      return message.reply('ℹ️ Vlasnik bota je već ovlašćen.');
    }

    const ids = loadWhitelist();

    if (command === 'wladd') {
      if (ids.includes(userId)) {
        return message.reply('ℹ️ Korisnik je već na whitelisti.');
      }

      ids.push(userId);
      saveWhitelist(ids);

      return message.reply(`✅ <@${userId}> je dodat na whitelistu.`);
    }

    const updated = ids.filter(id => id !== userId);

    if (updated.length === ids.length) {
      return message.reply('ℹ️ Korisnik nije na whitelisti.');
    }

    saveWhitelist(updated);

    return message.reply(`✅ <@${userId}> je uklonjen sa whiteliste.`);
  }

  const protectedCommands = new Set([
    'ticketsetup',
    'giveaway',
    'endgiveaway',
    'reroll',
    'ban',
    'unban',
    'kick',
    'hardban',
    'softban',
    'hardkick',
    'mute',
    'unmute',
    'hardmute',
    'warn',
    'warnings',
    'opomena',
    'purge',
    'clear',
    'nuke'
  ]);

  if (
    protectedCommands.has(command) &&
    !isWhitelisted(message.author.id)
  ) {
    return message.reply(
      '🔒 Nisi na HAOS whitelisti i ne možeš koristiti ovu komandu.'
    );
  }

  const member = message.member;
  const target = message.mentions.members.first();

  const hasPermission = permission => {
    if (member.permissions.has(permission)) return true;

    message.reply({
      embeds: [
        embed(
          'Nemaš dozvolu',
          'Nemaš potrebnu dozvolu za ovu komandu.'
        )
      ]
    }).catch(() => {});

    return false;
  };

  // INVITES
  if (['invites', 'invite', 'i'].includes(command)) {
    try {
      const targetUser = message.mentions.users.first() || message.author;
      const invites = await message.guild.invites.fetch();

      const totalUses = invites
        .filter(invite => invite.inviter?.id === targetUser.id)
        .reduce((total, invite) => total + (invite.uses || 0), 0);

      const invitesEmbed = new EmbedBuilder()
        .setColor(0xFF8C00)
        .setTitle('Haos Client — Invites')
        .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
        .setDescription(
          `- Ukupno pozvanih članova: \`${totalUses}\`\n` +
          `- **Korisnik:** ${targetUser}`
        );

      return message.reply({ embeds: [invitesEmbed] });
    } catch (error) {
      console.error(error);
      return message.reply(
        '❌ Proveri da li bot ima dozvolu Upravljanje serverom.'
      );
    }
  }

  // MEMBERCOUNT
  if (['mc', 'membercount'].includes(command)) {
    const mcEmbed = new EmbedBuilder()
      .setColor(0xFF8C00)
      .setTitle('Haos Client — Membercount')
      .setThumbnail(message.guild.iconURL({ size: 256 }))
      .setDescription(
        `- **Server:** ${message.guild.name}\n` +
        `- **Ukupno članova:** \`${message.guild.memberCount}\``
      )
      .setFooter({ text: 'Haos Client • Statistika servera' });

    return message.reply({ embeds: [mcEmbed] });
  }

  // SERVERINFO
  if (command === 'serverinfo') {
    const guild = message.guild;

    try {
      const owner = await guild.fetchOwner();

      const serverEmbed = new EmbedBuilder()
        .setColor(0xFF8C00)
        .setTitle('Haos Client — Server Info')
        .setThumbnail(guild.iconURL({ size: 1024 }))
        .setDescription(
          `- **Naziv servera:** ${guild.name}\n` +
          `- **ID servera:** \`${guild.id}\`\n` +
          `- **Vlasnik:** ${owner.user.tag}\n` +
          `- **Kreiran:** <t:${Math.floor(guild.createdTimestamp / 1000)}:R>\n\n` +
          `**📊 Statistika:**\n` +
          `- **Ukupno članova:** \`${guild.memberCount}\`\n` +
          `- **Ukupno uloga:** \`${guild.roles.cache.size}\`\n` +
          `- **Ukupno kanala:** \`${guild.channels.cache.size}\`\n` +
          `- **Boost nivo:** \`${guild.premiumTier}\`\n` +
          `- **Boostovi:** \`${guild.premiumSubscriptionCount || 0}\``
        );

      return message.reply({ embeds: [serverEmbed] });
    } catch (error) {
      console.error(error);
      return message.reply('❌ Greška pri prikazivanju informacija o serveru.');
    }
  }

  // USERINFO
  if (command === 'userinfo') {
    const userMember =
      message.mentions.members.first() || message.member;
    const user = userMember.user;

    const roles = userMember.roles.cache
      .filter(role => role.id !== message.guild.id)
      .map(role => role.toString())
      .join(', ') || 'Nema uloga';

    const userEmbed = new EmbedBuilder()
      .setColor(0xFF8C00)
      .setTitle('Haos Client — User Info')
      .setThumbnail(user.displayAvatarURL({ size: 1024 }))
      .setDescription(
        `- **Korisnik:** ${user.tag} (${user})\n` +
        `- **ID:** \`${user.id}\`\n` +
        `- **Nalog napravljen:** <t:${Math.floor(user.createdTimestamp / 1000)}:R>\n` +
        `- **Pridružio se:** <t:${Math.floor(userMember.joinedTimestamp / 1000)}:R>\n` +
        `- **Najviša uloga:** ${userMember.roles.highest}\n\n` +
        `**📜 Uloge [${userMember.roles.cache.size - 1}]:**\n${roles}`
      )
      .setTimestamp();

    return message.reply({ embeds: [userEmbed] });
  }

  // AVATAR
  if (command === 'avatar') {
    const userId = message.mentions.users.first()?.id ||
      args[0]?.replace(/[<@!>]/g, '');

    let user;

    try {
      user = userId
        ? await client.users.fetch(userId, { force: true })
        : message.author;
    } catch {
      return message.reply('❌ Ne mogu pronaći korisnika.');
    }

    const url = user.displayAvatarURL({
      size: 4096,
      extension: 'png'
    });

    const avatarEmbed = new EmbedBuilder()
      .setColor(0xFF8C00)
      .setTitle('Haos Client — Avatar')
      .setDescription(`[Otvori avatar](${url})`)
      .setImage(url);

    return message.reply({ embeds: [avatarEmbed] });
  }

  // BANNER
  if (command === 'banner') {
    const userId = message.mentions.users.first()?.id ||
      args[0]?.replace(/[<@!>]/g, '') ||
      message.author.id;

    let user;

    try {
      user = await client.users.fetch(userId, { force: true });
    } catch {
      return message.reply('❌ Ne mogu pronaći korisnika.');
    }

    const url = user.bannerURL({ size: 4096, extension: 'png' });

    if (!url) {
      return message.reply('❌ Korisnik nema postavljen baner.');
    }

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xFF8C00)
          .setTitle('Haos Client — Banner')
          .setImage(url)
          .setDescription(`[Otvori baner](${url})`)
      ]
    });
  }

  // PURGE / CLEAR
  if (['purge', 'clear'].includes(command)) {
    if (!hasPermission(PermissionFlagsBits.ManageMessages)) return;

    const amount = Number.parseInt(args[0], 10);

    if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
      return message.reply('❌ Upotreba: `.purge 1-100`');
    }

    try {
      const deleted = await message.channel.bulkDelete(amount, true);
      const notice = await message.channel.send(
        `✅ Obrisano je ${deleted.size} poruka.`
      );

      setTimeout(() => notice.delete().catch(() => {}), 5000);
    } catch (error) {
      console.error(error);
      return message.reply(
        '❌ Nisam uspeo da obrišem poruke. Proveri dozvole bota.'
      );
    }

    return;
  }

  // WARN
  if (command === 'warn') {
    if (!hasPermission(PermissionFlagsBits.ModerateMembers)) return;

    const targetMember = message.mentions.members.first();

    if (!targetMember) {
      return message.reply('❌ Upotreba: `.warn @član razlog`');
    }

    if (targetMember.id === message.author.id || targetMember.user.bot) {
      return message.reply('❌ Ne možeš opomenuti sebe ili bota.');
    }

    const why = args.slice(1).join(' ') || 'Nije naveden razlog.';
    const warnings = loadJSON(WARNINGS_FILE, {});

    warnings[targetMember.id] ||= [];
    warnings[targetMember.id].push({
      reason: why,
      moderator: message.author.id,
      date: new Date().toISOString()
    });

    saveJSON(WARNINGS_FILE, warnings);

    await targetMember.send({
      embeds: [
        embed(
          '⚠️ Opomena',
          `Dobili ste opomenu na serveru **${message.guild.name}**.\n**Razlog:** ${why}`
        )
      ]
    }).catch(() => {});

    return message.reply({
      embeds: [
        embed(
          '⚠️ Opomena evidentirana',
          `**Član:** ${targetMember}\n` +
          `**Razlog:** ${why}\n` +
          `**Ukupno opomena:** ${warnings[targetMember.id].length}`
        )
      ]
    });
  }

  // WARNINGS
  if (command === 'warnings') {
    if (!hasPermission(PermissionFlagsBits.ModerateMembers)) return;

    const user = message.mentions.users.first() || message.author;
    const warnings = loadJSON(WARNINGS_FILE, {})[user.id] || [];

    const description = warnings.length
      ? warnings.slice(-10).map((warning, i) =>
          `**${i + 1}.** ${warning.reason}\n` +
          `Moderator: <@${warning.moderator}> • ` +
          `<t:${Math.floor(new Date(warning.date).getTime() / 1000)}:R>`
        ).join('\n\n')
      : 'Ovaj korisnik nema evidentiranih opomena.';

    return message.reply({
      embeds: [embed(`⚠️ Opomene — ${user.tag}`, description)]
    });
  }

  // KICK / BAN / MUTE / UNBAN
  if ([
    'kick', 'hardkick', 'ban', 'hardban', 'softban',
    'mute', 'hardmute', 'unmute', 'unban'
  ].includes(command)) {
    const permission = ['kick', 'hardkick'].includes(command)
      ? PermissionFlagsBits.KickMembers
      : ['mute', 'hardmute', 'unmute'].includes(command)
        ? PermissionFlagsBits.ModerateMembers
        : command === 'unban'
          ? PermissionFlagsBits.BanMembers
          : PermissionFlagsBits.BanMembers;

    if (!hasPermission(permission)) return;

    const targetMember = message.mentions.members.first();
    const rawTarget = args[0]?.replace(/[<@!>]/g, '');
    const why = args.slice(1).join(' ') || 'Nije naveden razlog.';

    try {
      if (command === 'unban') {
        if (!rawTarget || !/^\d{17,22}$/.test(rawTarget)) {
          return message.reply('❌ Upotreba: `.unban ID razlog`');
        }

        await message.guild.members.unban(rawTarget, why);
        return message.reply(`✅ Ban je uklonjen za ID \`${rawTarget}\`.`);
      }

      if (command === 'unmute') {
        if (!targetMember) {
          return message.reply('❌ Upotreba: `.unmute @član`');
        }

        await targetMember.timeout(null, why);
        return message.reply(`✅ Uklonjen je timeout za ${targetMember}.`);
      }

      if (['mute', 'hardmute'].includes(command)) {
        if (!targetMember) {
          return message.reply('❌ Upotreba: `.mute @član 10m razlog`');
        }

        const duration = durationMs(args[1]);

        if (!duration) {
          return message.reply(
            '❌ Vreme mora biti npr. `10m`, `2h` ili `1d` (najviše 7 dana).'
          );
        }

        await targetMember.timeout(duration, why);
        await dm(
          targetMember.user,
          '🔇 Timeout',
          `**Trajanje:** ${args[1]}\n**Razlog:** ${why}`
        );

        return message.reply(
          `✅ ${targetMember} je dobio timeout od ${args[1]}.`
        );
      }

      if (['kick', 'hardkick'].includes(command)) {
        if (!targetMember) {
          return message.reply('❌ Upotreba: `.kick @član razlog`');
        }

        if (!targetMember.kickable) {
          return message.reply(
            '❌ Ne mogu da izbacim ovog člana zbog hijerarhije uloga ili dozvola.'
          );
        }

        await dm(targetMember.user, '👢 Izbačen sa servera', `**Razlog:** ${why}`);
        await targetMember.kick(why);

        return message.reply(
          `✅ ${targetMember.user.tag} je izbačen sa servera. Razlog: ${why}`
        );
      }

      if (['ban', 'hardban', 'softban'].includes(command)) {
        if (!targetMember) {
          return message.reply('❌ Upotreba: `.ban @član razlog`');
        }

        if (!targetMember.bannable) {
          return message.reply(
            '❌ Ne mogu da banujem ovog člana zbog hijerarhije uloga ili dozvola.'
          );
        }

        await dm(
          targetMember.user,
          command === 'softban' ? '🧹 Softban' : '🔨 Ban',
          `**Razlog:** ${why}`
        );

        await targetMember.ban({
          reason: why,
          deleteMessageSeconds: command === 'softban' ? 7 * 86400 : 0
        });

        return message.reply(
          `✅ ${targetMember.user.tag} je ${command === 'softban' ? 'softbanovan' : 'banovan'}. Razlog: ${why}`
        );
      }
    } catch (error) {
      console.error(`Komanda ${command} nije uspela:`, error);
      return message.reply(
        '❌ Komanda nije uspela. Proveri dozvole bota, hijerarhiju uloga i ID korisnika.'
      );
    }
  }

  // NUKE
  if (command === 'nuke') {
    if (!hasPermission(PermissionFlagsBits.ManageChannels)) return;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('confirm_nuke')
        .setLabel('Potvrdi')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('cancel_nuke')
        .setLabel('Otkaži')
        .setStyle(ButtonStyle.Secondary)
    );

    const replyMsg = await message.reply({
      embeds: [
        embed(
          '⚠️ HAOS Client — Potvrda Nuke',
          'Da li si siguran da želiš da obrišeš i ponovo napraviš ovaj kanal?'
        )
      ],
      components: [row]
    });

    const collector = replyMsg.createMessageComponentCollector({
      time: 30000
    });

    collector.on('collect', async interaction => {
      if (interaction.user.id !== message.author.id) {
        return interaction.reply({
          content: '❌ Samo osoba koja je pokrenula komandu može potvrditi ovu akciju.',
          ephemeral: true
        });
      }

      if (interaction.customId === 'cancel_nuke') {
        return interaction.update({
          embeds: [embed('❌ HAOS Client — Otkazano', 'Nuke proces je otkazan.')],
          components: []
        });
      }

      if (interaction.customId === 'confirm_nuke') {
        try {
          const oldChannel = message.channel;
          const newChannel = await oldChannel.clone();

          await newChannel.setPosition(oldChannel.position).catch(() => {});
          await oldChannel.delete('Nuke komanda');

          await newChannel.send({
            embeds: [
              embed(
                '💥 HAOS Client — Nuke',
                `Kanal je ponovo napravljen.\n**Moderator:** ${message.author}`
              )
            ]
          });
        } catch (error) {
          console.error(error);
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: '❌ Nuke nije uspeo. Proveri dozvole bota.',
              ephemeral: true
            }).catch(() => {});
          }
        }
      }
    });

    collector.on('end', (collected, reason) => {
      if (reason === 'time') {
        replyMsg.edit({
          embeds: [
            embed('⏰ HAOS Client — Isteklo vreme', 'Nuke je otkazan.')
          ],
          components: []
        }).catch(() => {});
      }
    });

    return;
  }

  // OPOMENA + TIMEOUT
  if (command === 'opomena') {
    if (!hasPermission(PermissionFlagsBits.ModerateMembers)) return;

    const targetMember = message.mentions.members.first();

    if (!targetMember) {
      return message.reply('❌ Upotreba: `.opomena @član razlog`');
    }

    if (targetMember.id === message.author.id || targetMember.user.bot) {
      return message.reply('❌ Ne možeš opomenuti sebe ili bota.');
    }

    const why = args.slice(1).join(' ') || 'Nije naveden razlog.';

    try {
      await targetMember.timeout(
        10 * 60 * 1000,
        `Opomena od ${message.author.tag}: ${why}`
      );

      const warningEmbed = new EmbedBuilder()
        .setColor('#F1C40F')
        .setTitle('⚠️ OPOMENA')
        .addFields(
          {
            name: '👤 Član',
            value: `${targetMember.user.tag} (${targetMember.id})`
          },
          {
            name: '🛡️ Moderator',
            value: message.author.tag
          },
          {
            name: '📝 Razlog',
            value: why
          },
          {
            name: '🔇 Timeout',
            value: '10 minuta'
          }
        )
        .setTimestamp()
        .setFooter({ text: 'HAOS Client • Moderacija' });

      await targetMember.send({ embeds: [warningEmbed] }).catch(() => {});
      await message.channel.send({ embeds: [warningEmbed] });

      return message.reply(
        `✅ ${targetMember} je opomenut i dobio je timeout od 10 minuta.`
      );
    } catch (error) {
      console.error(error);
      return message.reply(
        '❌ Nisam uspeo da opomenem člana. Proveri dozvole bota.'
      );
    }
  }

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
      .setDescription('**STAFF PRIJAVE – KLIKNITE NA 🎟️ DA OTVORITE TIKET**')
      .setFooter({ text: 'HAOS Client • Ticket sistem' });

    return message.channel.send({
      embeds: [panel],
      components: [row]
    });
  }

  // HELP
  if (command === 'help') {
    const helpEmbed = new EmbedBuilder()
      .setColor(0xFF8C00)
      .setTitle('📋 Haos Client — Komande')
      .setDescription(
        '**Moderacija i administracija**\n' +
        '`.warn @član razlog` — Opomena\n' +
        '`.warnings @član` — Pregled opomena\n' +
        '`.purge broj` / `.clear broj` — Brisanje poruka\n' +
        '`.nuke` — Ponovno pravljenje kanala\n' +
        '`.kick @član razlog` — Izbacivanje\n' +
        '`.ban @član razlog` — Banovanje\n' +
        '`.mute @član 10m` — Timeout\n' +
        '`.unmute @član` — Uklanjanje timeouta\n\n' +
        '**Informacije**\n' +
        '`.invites [@član]` — Broj pozivnica\n' +
        '`.mc` — Broj članova\n' +
        '`.userinfo [@član]` — Informacije o korisniku\n' +
        '`.serverinfo` — Informacije o serveru\n' +
        '`.avatar [@član]` — Avatar\n' +
        '`.banner [@član]` — Baner\n\n' +
        '**Giveaway**\n' +
        '`.gstart 10m 1 Nitro` — Pokretanje\n' +
        '`.gend ID` — Završavanje\n' +
        '`.greroll ID` — Novo izvlačenje\n\n' +
        '**Whitelist**\n' +
        '`.wladd @član` — Dodavanje\n' +
        '`.wlremove @član` — Uklanjanje\n' +
        '`.wllist` — Pregled'
      )
      .setFooter({ text: 'HAOS Client • Meni komandi' });

    return message.reply({ embeds: [helpEmbed] });
  }

  // GIVEAWAY — .gstart 10m 1 Nitro
  if (command === 'giveaway') {
    if (!hasPermission(PermissionFlagsBits.ManageGuild)) return;

    const durationText = args[0];
    const winnersCount = Number.parseInt(args[1], 10);
    const prize = args.slice(2).join(' ').trim();
    const match = durationText?.match(/^(\d+)(s|m|h|d)$/i);

    if (!match || !Number.isInteger(winnersCount) || winnersCount < 1 || !prize) {
      return message.reply('Upotreba: `.gstart 10m 1 Nitro`');
    }

    const units = {
      s: 1000,
      m: 60000,
      h: 3600000,
      d: 86400000
    };

    const duration = Number(match[1]) * units[match[2].toLowerCase()];

    if (duration < 10000 || duration > 30 * 86400000) {
      return message.reply('❌ Trajanje mora biti od 10 sekundi do 30 dana.');
    }

    const endAt = Date.now() + duration;

    const startEmbed = new EmbedBuilder()
      .setColor(GW_COLOR)
      .setTitle(`${GW_EMOJI} HAOS GIVEAWAY`)
      .setDescription(
        `${GW_NAGRADA} **NAGRADA**\n> ${prize}\n\n` +
        `${GW_TROFEJ} **BROJ POBEDNIKA**\n> ${winnersCount}\n\n` +
        `${GW_KRUNA} **ORGANIZATOR**\n> ${message.author}\n\n` +
        `${GW_SAT} **ZAVRŠAVA SE**\n> <t:${Math.floor(endAt / 1000)}:R>\n\n` +
        '━━━━━━━━━━━━━━━━━━━━\n' +
        `Reaguj sa ${GW_EMOJI} da učestvuješ!`
      )
      .setFooter({ text: 'HAOS • Giveaway sistem' })
      .setTimestamp(new Date(endAt));

    let giveawayMessage;

    try {
      giveawayMessage = await message.channel.send({
        content: '@everyone',
        embeds: [startEmbed],
        allowedMentions: { parse: ['everyone'] }
      });

      await giveawayMessage.react(GW_EMOJI);
    } catch (error) {
      console.error(error);

      if (giveawayMessage) {
        await giveawayMessage.delete().catch(() => {});
      }

      return message.reply(
        '❌ Giveaway nije pokrenut. Proveri dozvole bota i pristup HAOS emodžiju.'
      );
    }

    const confirmation = await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(GW_COLOR)
          .setDescription(
            `${GW_EMOJI} **Giveaway je uspešno pokrenut!**\n` +
            `${GW_NAGRADA} **Nagrada:** ${prize}\n` +
            `🔗 [Otvori giveaway](${giveawayMessage.url})`
          )
      ]
    });

    setTimeout(() => confirmation.delete().catch(() => {}), 5000);

    setTimeout(async () => {
      try {
        const freshMessage = await message.channel.messages.fetch(
          giveawayMessage.id
        );

        const currentEmbed = freshMessage.embeds[0];

        if (!currentEmbed || currentEmbed.footer?.text === 'GIVEAWAY ZAVRŠEN') {
          return;
        }

        const reaction = freshMessage.reactions.cache.get(GW_EMOJI_ID);
        let participants = [];

        if (reaction) {
          const users = await reaction.users.fetch();
          participants = [...users.values()].filter(user => !user.bot);
        }

        await freshMessage.edit({
          embeds: [
            EmbedBuilder.from(currentEmbed)
              .setColor('#808080')
              .setFooter({ text: 'GIVEAWAY ZAVRŠEN' })
          ]
        });

        if (participants.length === 0) {
          return message.channel.send({
            embeds: [
              new EmbedBuilder()
                .setColor('#808080')
                .setTitle(`${GW_EMOJI} GIVEAWAY ZAVRŠEN`)
                .setDescription(
                  `${GW_NAGRADA} **NAGRADA**\n${prize}\n\n` +
                  '❌ Niko nije učestvovao, pobednik nije izvučen.'
                )
                .setFooter({ text: 'HAOS • Giveaway sistem' })
                .setTimestamp()
            ]
          });
        }

        const shuffled = [...participants].sort(() => Math.random() - 0.5);
        const winners = shuffled.slice(
          0,
          Math.min(winnersCount, shuffled.length)
        );

        const winnerMentions = winners
          .map(user => `<@${user.id}>`)
          .join(', ');

        const resultEmbed = new EmbedBuilder()
          .setColor(GW_COLOR)
          .setTitle(`${GW_EMOJI} GIVEAWAY ZAVRŠEN`)
          .setDescription(
            `${GW_TROFEJ} **POBEDNIK${winners.length > 1 ? 'CI' : ''}**\n` +
            `${winnerMentions}\n\n` +
            `${GW_NAGRADA} **NAGRADA**\n${prize}\n\n` +
            `${GW_KRUNA} **ČESTITAMO!**\nHvala svima koji su učestvovali!`
          )
          .setFooter({ text: 'HAOS • Giveaway sistem' })
          .setTimestamp();

        await message.channel.send({
          content: winnerMentions,
          embeds: [resultEmbed],
          allowedMentions: { users: winners.map(user => user.id) }
        });
      } catch (error) {
        console.error('Greška pri završavanju giveaway-a:', error);
      }
    }, duration);

    return;
  }

  // RUČNO ZAVRŠAVANJE / REROLL
  if (['endgiveaway', 'reroll'].includes(command)) {
    if (!hasPermission(PermissionFlagsBits.ManageGuild)) return;

    const giveawayId = args[0];

    if (!giveawayId) {
      return message.reply(
        `Upotreba: \`.${command === 'endgiveaway' ? 'gend' : 'greroll'} ID_PORUKE\``
      );
    }

    let giveawayMessage;

    try {
      giveawayMessage = await message.channel.messages.fetch(giveawayId);
    } catch {
      return message.reply(
        '❌ Ne mogu da pronađem giveaway poruku u ovom kanalu. Proveri ID poruke.'
      );
    }

    const reaction = giveawayMessage.reactions.cache.get(GW_EMOJI_ID);

    if (!reaction) {
      return message.reply('❌ Na toj poruci nisam pronašao giveaway reakciju.');
    }

    let participants = [];

    try {
      const users = await reaction.users.fetch();
      participants = [...users.values()].filter(user => !user.bot);
    } catch {
      return message.reply('❌ Nisam uspeo da učitam učesnike giveaway-a.');
    }

    if (participants.length === 0) {
      return message.reply('❌ Nema učesnika za izvlačenje.');
    }

    const winner = participants[
      Math.floor(Math.random() * participants.length)
    ];

    if (command === 'endgiveaway') {
      await giveawayMessage.edit({
        embeds: [
          EmbedBuilder.from(giveawayMessage.embeds[0])
            .setColor('#808080')
            .setFooter({ text: 'GIVEAWAY ZAVRŠEN' })
        ]
      }).catch(() => {});
    }

    const resultEmbed = new EmbedBuilder()
      .setColor(GW_COLOR)
      .setTitle(
        command === 'reroll'
          ? `${GW_EMOJI} NOVO IZVLAČENJE`
          : `${GW_EMOJI} GIVEAWAY ZAVRŠEN`
      )
      .setDescription(
        `${GW_NAGRADA} **NAGRADA**\n` +
        'Pobednik je izvučen iz učesnika giveaway-a.\n\n' +
        `${GW_TROFEJ} **POBEDNIK**\n<@${winner.id}>\n\n` +
        `${GW_KRUNA} **ČESTITAMO!**`
      )
      .setFooter({ text: 'HAOS • Giveaway sistem' })
      .setTimestamp();

    return message.channel.send({
      content: `<@${winner.id}>`,
      embeds: [resultEmbed],
      allowedMentions: { users: [winner.id] }
    });
  }
});

// TICKET SISTEM
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton()) return;

  if (interaction.customId === 'haos_ticket_create') {
    const guild = interaction.guild;

    if (!guild) {
      return interaction.reply({
        content: '❌ Ova komanda može da se koristi samo na serveru.',
        ephemeral: true
      });
    }

    const existingChannel = guild.channels.cache.find(channel =>
      channel.type === ChannelType.GuildText &&
      channel.topic === `haos-ticket-${interaction.user.id}`
    );

    if (existingChannel) {
      return interaction.reply({
        content: `❌ Već imaš otvoren tiket: ${existingChannel}`,
        ephemeral: true
      });
    }

    try {
      const ticketChannel = await guild.channels.create({
        name: `ticket-${interaction.user.username}`
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '-')
          .slice(0, 90),
        type: ChannelType.GuildText,
        topic: `haos-ticket-${interaction.user.id}`,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel]
          },
          {
            id: interaction.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.AttachFiles
            ]
          },
          {
            id: client.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.ReadMessageHistory
            ]
          }
        ]
      });

      const ticketEmbed = new EmbedBuilder()
        .setColor('#43A047')
        .setTitle('🎟️ HAOS — Tiket')
        .setDescription(
          `Zdravo ${interaction.user}!\n\n` +
          'Objasni svoj problem ili napiši zbog čega želiš da se prijaviš. ' +
          'Član osoblja će ti odgovoriti čim bude u mogućnosti.'
        )
        .setFooter({ text: 'HAOS Client • Ticket sistem' })
        .setTimestamp();

      const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('haos_ticket_close')
          .setLabel('Zatvori tiket')
          .setEmoji('🔒')
          .setStyle(ButtonStyle.Danger)
      );

      await ticketChannel.send({
        content: `${interaction.user}`,
        embeds: [ticketEmbed],
        components: [closeRow]
      });

      return interaction.reply({
        content: `✅ Tvoj tiket je napravljen: ${ticketChannel}`,
        ephemeral: true
      });
    } catch (error) {
      console.error(error);

      return interaction.reply({
        content: '❌ Nisam uspeo da napravim tiket. Proveri dozvole bota.',
        ephemeral: true
      });
    }
  }

  if (interaction.customId === 'haos_ticket_close') {
    const channel = interaction.channel;

    if (!channel || channel.type !== ChannelType.GuildText) {
      return interaction.reply({
        content: '❌ Ne mogu da zatvorim ovaj kanal.',
        ephemeral: true
      });
    }

    if (!channel.topic?.startsWith('haos-ticket-')) {
      return interaction.reply({
        content: '❌ Ovo nije HAOS tiket kanal.',
        ephemeral: true
      });
    }

    const ticketOwnerId = channel.topic.replace('haos-ticket-', '');
    const isOwner = interaction.user.id === ticketOwnerId;
    const canManage = interaction.memberPermissions?.has(
      PermissionFlagsBits.ManageChannels
    );

    if (!isOwner && !canManage) {
      return interaction.reply({
        content: '❌ Samo autor tiketa ili moderator može da ga zatvori.',
        ephemeral: true
      });
    }

    await interaction.reply({
      content: '🔒 Tiket će biti zatvoren za 5 sekundi.',
      ephemeral: true
    });

    setTimeout(() => {
      channel.delete('HAOS tiket zatvoren').catch(console.error);
    }, 5000);
  }
});

// POKRETANJE BOTA
client.login(process.env.DISCORD_TOKEN);
