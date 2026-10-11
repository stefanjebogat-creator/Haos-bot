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
const giveaways = new Map();

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

// TICKET
  if (command === 'ticket') {
    const channelName = `ticket-${message.author.username}`.toLowerCase();

    // Provera da li već postoji tiket kanal
    const existingChannel = message.guild.channels.cache.find(c => c.name === channelName);
    if (existingChannel) {
      const alreadyOpenEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('<:276022clydebot:1558907359613419531> Haos Client — Greška')
        .setDescription(`- Već imate otvoren tiket kanal: ${existingChannel}`);

      return message.reply({ embeds: [alreadyOpenEmbed] });
    }

    try {
      // Kreiranje privatnog kanala za tiket
      const ticketChannel = await message.guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          {
            id: message.guild.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: message.author.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory
            ],
          },
          {
            id: client.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ManageChannels
            ],
          },
        ],
      });

      // Poruka unutar novootvorenog tiketa
      const ticketEmbed = new EmbedBuilder()
        .setColor(0xFF8C00)
        .setTitle('<:276022clydebot:1558907359613419531> Haos Client — Tiket')
        .setDescription(
          `- Dobrodošli u vaš tiket, ${message.author}!\n` +
          `- **Opišite vaš problem ili razlog otvaranja tiketa.**\n` +
          `- Ubrzo će vam se neko od osoblja pridružiti.\n` +
          `- Za zatvaranje tiketa ukucajte \`.close\``
        )
        .setTimestamp();

      await ticketChannel.send({ content: `${message.author}`, embeds: [ticketEmbed] });

      // Potvrda korisniku u kanalu gde je ukucao .ticket
      const successEmbed = new EmbedBuilder()
        .setColor(0xFF8C00)
        .setTitle('<:276022clydebot:1558907359613419531> Haos Client — Tiket')
        .setDescription(`- Uspešno ste otvorili tiket! Možete pristupiti ovde: ${ticketChannel}`);

      return message.reply({ embeds: [successEmbed] });

    } catch (error) {
      console.error(error);
      const errorEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('<:276022clydebot:1558907359613419531> Haos Client — Greška')
        .setDescription('- Došlo je do greške prilikom kreiranja tiketa. Proverite da li bot ima **Manage Channels** dozvolu.');

      return message.reply({ embeds: [errorEmbed] });
    }
  }

// SVE KOMANDE
client.on(Events.MessageCreate, async message => {
  if (!message.guild || message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  let command = (args.shift() || '').toLowerCase();

  // AVATAR KOMANDE: .av i .avatar
  if (['av', 'avatar'].includes(command)) {
    const member = message.mentions.users.first();
    const userId = member?.id || args[0]?.replace(/[<@!>]/g, '');
    let targetUser;

    try {
      targetUser = userId
        ? await client.users.fetch(userId, { force: true })
        : message.author;
    } catch {
      return message.reply('❌ Ne mogu da pronađem tog korisnika.');
    }

    const avatarURL = targetUser.displayAvatarURL({
      size: 4096,
      extension: 'png',
      forceStatic: false
    });

    const embed = new EmbedBuilder()
      .setColor('#3498DB')
      .setTitle(`Avatar korisnika ${targetUser.username}`)
      .setImage(avatarURL)
      .setURL(avatarURL)
      .setFooter({ text: `Zatražio: ${message.author.username}` });

    return message.reply({ embeds: [embed] });
  }

  // BANNER KOMANDA: .banner
  if (command === 'banner') {
    const member = message.mentions.users.first();
    const userId = member?.id || args[0]?.replace(/[<@!>]/g, '');
    let targetUser;

    try {
      targetUser = userId
        ? await client.users.fetch(userId, { force: true })
        : await client.users.fetch(message.author.id, { force: true });
    } catch {
      return message.reply('❌ Ne mogu da pronađem tog korisnika.');
    }

    const bannerURL = targetUser.bannerURL({
      size: 4096,
      extension: 'png'
    });

    if (!bannerURL) {
      return message.reply('❌ Ovaj korisnik nema Discord banner.');
    }

    const embed = new EmbedBuilder()
      .setColor('#3498DB')
      .setTitle(`Banner korisnika ${targetUser.username}`)
      .setImage(bannerURL)
      .setURL(bannerURL)
      .setFooter({ text: `Zatražio: ${message.author.username}` });

    return message.reply({ embeds: [embed] });
  }

  // OPOMENA
  if (command === 'opomena') {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply('❌ Nemaš dozvolu za izdavanje opomena.');
    }

    const target = message.mentions.members.first();

    if (!target) {
      return message.reply('❌ Upotreba: `.opomena @član razlog`');
    }

    if (target.id === message.author.id) {
      return message.reply('❌ Ne možeš samog sebe da opomeneš.');
    }

    if (target.user.bot) {
      return message.reply('❌ Ne možeš da opomeneš bota.');
    }

    const reason = args.slice(1).join(' ') || 'Nije naveden razlog';

    const embed = new EmbedBuilder()
      .setColor('#F1C40F')
      .setTitle('⚠️ OPOMENA')
      .addFields(
        {
          name: '👤 Član',
          value: `${target.user.tag} (${target.id})`
        },
        {
          name: '🛡️ Moderator',
          value: `${message.author.tag}`
        },
        {
          name: '📝 Razlog',
          value: reason
        }
      )
      .setTimestamp()
      .setFooter({ text: 'HAOS Client • Moderacija' });

    try {
      await target.send({ embeds: [embed] }).catch(() => null);

      await message.channel.send({ embeds: [embed] });

      return message.reply(`✅ Član ${target} je opomenut.`);
    } catch (error) {
      console.error('Greška pri izdavanju opomene:', error);
      return message.reply('❌ Došlo je do greške pri izdavanju opomene.');
    }
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
    gw: 'giveaway',
    egw: 'endgiveaway',
    rr: 'reroll',
    hb: 'hardban',
    hm: 'hardmute',
    hk: 'hardkick',
    sb: 'softban',
    ts: 'ticketsetup'
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
    // TICKET PANEL — STAFF PRIJAVE
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
  if (command === 'help') {
    const helpEmbed = new EmbedBuilder()
      .setColor(0xFF8C00)
      .setTitle('<:276022clydebot:1558907359613419531> Haos Client — Komande')
      .setDescription(
        '**Moderacija:**\n' +
        '- `.ban` - Banovanje korisnika sa servera\n' +
        '- `.unban` - Uklanjanje bana preko ID-ja\n\n' +
        '**Utility & Media:**\n' +
        '- `.ticket` - Otvaranje privatnog tiketa\n' +
        '- `.av` - Prikaz avatara korisnika\n' +
        '- `.banner` - Prikaz banera korisnika'
      )
      .setTimestamp();

    return message.reply({ embeds: [helpEmbed] });
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

   
   // BAN KOMANDA
  if (command === 'ban') {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      const noPermEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('<:30748bannedrole:1558942653649916044> Haos Client — Greška')
        .setDescription('- Nemate potrebne dozvole za korišćenje komande `.ban`.');
      
      return message.reply({ embeds: [noPermEmbed] });
    }

    const target = message.mentions.members.first();
    const reason = args.slice(1).join(' ') || 'Nije naveden razlog';

    if (!target) {
      const noTargetEmbed = new EmbedBuilder()
        .setColor(0xFF8C00)
        .setTitle('<:276022clydebot:1558907359613419531> Haos Client — Ban')
        .setDescription(
          `- Pogrešna upotreba komande!\n` +
          `- Upotreba: \`.ban\` \`@član\` \`[razlog]\``
        );

      return message.reply({ embeds: [noTargetEmbed] });
    }

    if (!target.bannable) {
      const cantBanEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('<:30748bannedrole:1558942653649916044> Haos Client — Greška')
        .setDescription(`- Ne mogu banovati korisnika ${target}. Njegova uloga je iznad moje.`);

      return message.reply({ embeds: [cantBanEmbed] });
    }

    try {
      try {
        const dmEmbed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('\<:649327ban:1558943591534166087> Haos Client — Banovanje')
          .setDescription(
            `- Banovani ste sa servera **${message.guild.name}**.\n` +
            `- **Moderator:** ${message.author.tag}\n` +
            `- **Razlog:** \`${reason}\``
          );
        await target.send({ embeds: [dmEmbed] });
      } catch (err) {
        // Ignoriše se ako korisnik ima ugašen DM
      }

      await target.ban({ reason: `${reason} | Moderator: ${message.author.tag}` });

      const successEmbed = new EmbedBuilder()
        .setColor(0xFF8C00)
        .setTitle('<:6728_true:1558944305283080232> Haos Client — Ban')
        .setDescription(
          `- Član **${target.user.tag}** je uspešno banovan.\n` +
          `- **Razlog:** \`${reason}\`\n` +
          `- **Moderator:** ${message.author}`
        )
        .setTimestamp();

    return message.reply({ embeds: [successEmbed] });
    } catch (error) {
      console.error(error);
      return message.reply('- Došlo je do greške prilikom banovanja korisnika.');
    }
  }

   // UNBAN
  if (command === 'unban') {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      const noPermEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('<:30748bannedrole:1558942653649916044> Haos Client — Greška')
        .setDescription('- Nemate potrebne dozvole za korišćenje komande `.unban`.');
      
      return message.reply({ embeds: [noPermEmbed] });
    }

    const userId = args[0];
    const reason = args.slice(1).join(' ') || 'Nije naveden razlog';

    if (!userId) {
      const noIdEmbed = new EmbedBuilder()
        .setColor(0xFF8C00)
        .setTitle('<:276022clydebot:1558907359613419531> Haos Client — Unban')
        .setDescription(
          `- Pogrešna upotreba komande!\n` +
          `- Upotreba: \`.unban\` \`[ID_korisnika]\` \`[razlog]\``
        );

      return message.reply({ embeds: [noIdEmbed] });
    }

    try {
      const user = await message.guild.members.unban(userId, `${reason} | Moderator: ${message.author.tag}`);

      const successEmbed = new EmbedBuilder()
        .setColor(0xFF8C00)
        .setTitle('<:6728_true:1558944305283080232> Haos Client — Unban')
        .setDescription(
          `- Uspešno sklonjen ban za korisnika **${user ? user.tag : userId}**.\n` +
          `- **Razlog:** \`${reason}\`\n` +
          `- **Moderator:** ${message.author}`
        )
        .setTimestamp();

      return message.reply({ embeds: [successEmbed] });
    } catch (error) {
      console.error(error);
      
      const errorEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('<:30748bannedrole:1558942653649916044> Haos Client — Greška')
        .setDescription(`- Ne mogu skloniti ban. Proverite da li je ID (\`${userId}\`) tačan ili da li je taj korisnik uopšte banovan.`);

      return message.reply({ embeds: [errorEmbed] });
    }
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

    // HARDMUTE — 28 DANA
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

    // GIVEAWAY
    if (command === 'giveaway') {
      if (!hasPermission(PermissionFlagsBits.ManageGuild)) return;

      const ms = durationMs(args.shift());
      const winnersCount = Number(args.shift());
      const prize = args.join(' ');

      if (!ms || !Number.isInteger(winnersCount) ||
          winnersCount < 1 || winnersCount > 20 || !prize) {
        return message.reply('Upotreba: `.giveaway 10m 1 Nitro 1 mesec`');
      }

      const endsAt = Date.now() + ms;

      const post = await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR)
            .setTitle('🎉 NAGRADNA IGRA 🎉')
            .setDescription(
              `**🎁 Nagrada:** ${prize}\n\n` +
              `**🏆 Broj pobednika:** ${winnersCount}\n` +
              `**👤 Organizator:** ${message.author}\n\n` +
              `Reaguj sa 🎉 da učestvuješ!\n\n` +
              `**⏰ Završava se:** <t:${Math.floor(endsAt / 1000)}:R>`
            )
            .setFooter({ text: 'HAOS • Nagradne igre' })
            .setTimestamp(endsAt)
        ]
      });

      await post.react('🎉');

      const finish = async () => {
        try {
          const reaction = post.reactions.cache.get('🎉');
          const fetched = reaction ? await reaction.users.fetch() : new Map();
          const entrants = [...fetched.values()].filter(u => !u.bot);
          const winners = [];

          while (entrants.length && winners.length < winnersCount) {
            winners.push(
              entrants.splice(Math.floor(Math.random() * entrants.length), 1)[0]
            );
          }

          const names = winners.length
            ? winners.map(u => `<@${u.id}>`).join(', ')
            : 'Nema pobednika — niko nije učestvovao.';

          await post.edit({
            embeds: [
              embed(
                '🎉 NAGRADNA IGRA JE ZAVRŠENA!',
                `**🎁 Nagrada:** ${prize}\n\n` +
                `**🏆 Pobednik/pobednici:**\n${names}\n\n` +
                `**👥 Broj učesnika:** ${[...fetched.values()].filter(u => !u.bot).length}`
              )
            ]
          });

          await post.reply({
            embeds: [
              embed(
                '🏆 REZULTAT NAGRADNE IGRE',
                winners.length
                  ? `🎉 Čestitamo ${names}!\nOsvojili ste **${prize}**!`
                  : 'Nagradna igra je završena bez pobednika.'
              )
            ],
            allowedMentions: { parse: [] }
          });
        } catch (e) {
          console.error('Greška pri završavanju nagradne igre:', e);
        }

        giveaways.delete(post.id);
      };

      const timer = setTimeout(finish, ms);
      giveaways.set(post.id, { timer, finish });

      return message.reply({
        embeds: [embed('Nagradna igra pokrenuta', `🎉 Nagrada: **${prize}**`)]
      });
    }

    // END GIVEAWAY
    if (command === 'endgiveaway') {
      if (!hasPermission(PermissionFlagsBits.ManageGuild)) return;

      const giveaway = giveaways.get(args[0]);
      if (!giveaway) {
        return message.reply('Nisam pronašao aktivnu nagradnu igru. Koristi ID poruke nagradne igre.');
      }

      clearTimeout(giveaway.timer);
      await giveaway.finish();

      return message.reply({
        embeds: [embed('Nagradna igra završena', 'Izvlačenje je završeno.')]
      });
    }

    // REROLL
    if (command === 'reroll') {
      if (!hasPermission(PermissionFlagsBits.ManageGuild)) return;

      const messageId = args[0];
      if (!messageId) return message.reply('Upotreba: `.reroll ID_poruke` ili `.rr ID_poruke`');

      const giveawayMessage = await message.channel.messages.fetch(messageId).catch(() => null);
      if (!giveawayMessage) {
        return message.reply('Ne mogu da pronađem poruku nagradne igre u ovom kanalu.');
      }

      const reaction = giveawayMessage.reactions.cache.get('🎉');
      if (!reaction) return message.reply('Na toj poruci nema 🎉 reakcije.');

      const users = await reaction.users.fetch();
      const entrants = [...users.values()].filter(user => !user.bot);

      if (!entrants.length) return message.reply('Nema učesnika za novo izvlačenje.');

      const winner = entrants[Math.floor(Math.random() * entrants.length)];

      return message.reply({
        embeds: [
          embed('🎉 Novi pobednik', `Čestitamo <@${winner.id}>! Izvučen je novi pobednik.`)
        ],
        allowedMentions: { users: [winner.id] }
      });
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
