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
const COMMAND_LOG_CHANNEL_ID = '1558956324014915724';
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
function updateBotStatus() {
  if (!client.user) return;

  // Izračunava ukupan broj članova sa svih servera
  const totalMembers = client.guilds.cache
    .reduce((acc, guild) => acc + guild.memberCount, 0)
    .toLocaleString('en-US');

  client.user.setPresence({
    activities: [
      {
        name: `.help | ${totalMembers} članova`,
        type: ActivityType.Watching
      }
    ],
    status: 'online'
  });
}

client.once(Events.ClientReady, bot => {
  console.log(`Bot je online: ${bot.user.tag}`);

  // Postavlja status odmah pri paljenju
  updateBotStatus();

  // Osvežava broj članova na svakih 10 minuta
  setInterval(updateBotStatus, 10 * 60 * 1000);
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

// SVE KOMANDE
client.on(Events.MessageCreate, async message => {
  if (!message.guild || message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  let command = (args.shift() || '').toLowerCase();

  // LOGOVANJE KORIŠĆENIH KOMANDI
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

    logChannel.send({ embeds: [logEmbed] }).catch(console.error);
  }

// .invites
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  // Sprenačavamo dupliranje: ako poruka počinje sa komandom, reaguje samo jednom
  const content = message.content.trim();
  const args = content.split(/\s+/);
  const command = args[0].toLowerCase();

  if (command === '.invites' || command === '.invite' || command === '.i') {
    // Ako već postoji glavni handler, zaustavljamo ovaj da ne šalje duplu poruku
    if (message._handledByMain) return;
    message._handledByMain = true;

    try {
      const targetUser = message.mentions.users.first() || message.author;

      const guildInvites = await message.guild.invites.fetch();
      const userInvites = guildInvites.filter(i => i.inviter && i.inviter.id === targetUser.id);
      
      let totalUses = 0;
      userInvites.forEach(inv => {
        totalUses += inv.uses;
      });

      const invitesEmbed = new EmbedBuilder()
        .setColor(0xFF8C00)
        .setTitle('<:9437invite:1559292509719502938> Haos Client — Invites')
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
        .setDescription(`- Ukupno pozvanih članova: \`${totalUses}\`\n- **Korisnik:** <@${targetUser.id}>`)
        .setTimestamp();

      return message.reply({ embeds: [invitesEmbed] });
    } catch (error) {
      console.error('Greška pri preuzimanju pozivnica:', error);
      return message.reply('Došlo je do greške. Proveri da li bot ima permisiju Upravljanje serverom.');
    }
  }
});

if (command === 'mc' || command === 'membercount') {
    const memberCount = message.guild.memberCount;
    const guildIcon = message.guild.iconURL({ dynamic: true, size: 256 });

    const mcEmbed = new EmbedBuilder()
      .setColor(0xFF8C00)
      .setTitle('<:haostop:1559305680848949288> Haos Client — Membercount')
      .setThumbnail(guildIcon)
      .setDescription(
        `- **Server:** ${message.guild.name}\n` +
        `- **Ukupno članova:** \`${memberCount}\``
      )
      .setFooter({ text: 'Haos Client • Statistika Servera' })
      .setTimestamp();

    return message.reply({ embeds: [mcEmbed] });
  }
  
// SERVERINFO (.serverinfo)
  if (command === 'serverinfo') {
    try {
      const { guild } = message;
      const owner = await guild.fetchOwner();

      const serverEmbed = new EmbedBuilder()
        .setColor(0xFF8C00)
        .setTitle('<:276022clydebot:1558907359613419531> Haos Client — Server Info')
        .setThumbnail(guild.iconURL({ dynamic: true, size: 1024 }))
        .setDescription(
          `- **Naziv servera:** ${guild.name}\n` +
          `- **ID Servera:** \`${guild.id}\`\n` +
          `- **Vlasnik:** ${owner.user.tag} (${owner.user})\n` +
          `- **Kreiran:** <t:${Math.floor(guild.createdTimestamp / 1000)}:R>\n\n` +

          `**📊 Statistika:**\n` +
          `- **Ukupno članova:** \`${guild.memberCount}\`\n` +
          `- **Ukupno uloga (Roles):** \`${guild.roles.cache.size}\`\n` +
          `- **Ukupno kanala:** \`${guild.channels.cache.size}\`\n` +
          `- **Boost Nivo:** \`Level ${guild.premiumTier}\` (\`${guild.premiumSubscriptionCount || 0}\` boost-ova)`
        )
        .setTimestamp();

      return message.reply({ embeds: [serverEmbed] });

    } catch (error) {
      console.error(error);
      const errEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('<:276022clydebot:1558907359613419531> Haos Client — Greška')
        .setDescription('- Došlo je do greške prilikom pribavljanja informacija o serveru.');

      return message.reply({ embeds: [errEmbed] });
    }
  }

// USERINFO (.userinfo)
  if (command === 'userinfo') {
    try {
      const member = message.mentions.members.first() || message.member;
      const { user } = member;

      // Dobijanje uloga (bez @everyone)
      const roles = member.roles.cache
        .filter(r => r.id !== message.guild.id)
        .map(r => r.toString())
        .join(', ') || 'Nema uloga';

      const userEmbed = new EmbedBuilder()
        .setColor(0xFF8C00)
        .setTitle('<:276022clydebot:1558907359613419531> Haos Client — User Info')
        .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 1024 }))
        .setDescription(
          `- **Korisnik:** ${user.tag} (${user})\n` +
          `- **ID Korisnika:** \`${user.id}\`\n` +
          `- **Nalog napravljen:** <t:${Math.floor(user.createdTimestamp / 1000)}:R>\n` +
          `- **Pridružio se serveru:** <t:${Math.floor(member.joinedTimestamp / 1000)}:R>\n` +
          `- **Najviša uloga:** ${member.roles.highest}\n\n` +

          `**📜 Uloge [${member.roles.cache.size - 1}]:**\n` +
          `- ${roles}`
        )
        .setTimestamp();

      return message.reply({ embeds: [userEmbed] });

    } catch (error) {
      console.error(error);
      const errEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('<:276022clydebot:1558907359613419531> Haos Client — Greška')
        .setDescription('- Došlo je do greške prilikom pribavljanja informacija o korisniku.');

      return message.reply({ embeds: [errEmbed] });
    }
  }
  
 // AVATAR (.av / .avatar)
  if (['av', 'avatar'].includes(command)) {
    const member = message.mentions.users.first();
    const userId = member?.id || args[0]?.replace(/[<@!>]/g, '');
    let targetUser;

    try {
      targetUser = userId
        ? await client.users.fetch(userId, { force: true })
        : message.author;
    } catch {
      const errorEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('<:985760memberserver:1558975144016216094> Haos Client — Greška')
        .setDescription('- Ne mogu pronaći navedenog korisnika.');

      return message.reply({ embeds: [errorEmbed] });
    }

    const avatarURL = targetUser.displayAvatarURL({
      size: 4096,
      extension: 'png',
      forceStatic: false
    });

    const embed = new EmbedBuilder()
      .setColor(0xFF8C00)
      .setTitle('<:61048photosfolder:1558977971920838656> Haos Client — Avatar')
      .setDescription(
        `- Avatar korisnika: ${targetUser}\n` +
        `- [Direktan link do slike](${avatarURL})`
      )
      .setImage(avatarURL)
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }

  // BANNER (.banner)
  if (command === 'banner') {
    const member = message.mentions.users.first();
    const userId = member?.id || args[0]?.replace(/[<@!>]/g, '');
    let targetUser;

    try {
      targetUser = userId
        ? await client.users.fetch(userId, { force: true })
        : await client.users.fetch(message.author.id, { force: true });
    } catch {
      const errorEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('<:30748bannedrole:1558942653649916044> Haos Client — Greška')
        .setDescription('- Ne mogu pronaći navedenog korisnika.');

      return message.reply({ embeds: [errorEmbed] });
    }

    const bannerURL = targetUser.bannerURL({
      size: 4096,
      extension: 'png'
    });

    if (!bannerURL) {
      const noBannerEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('<:30748bannedrole:1558942653649916044> Haos Client — Greška')
        .setDescription(`- Korisnik ${targetUser} nema postavljen baner.`);

      return message.reply({ embeds: [noBannerEmbed] });
    }

    const embed = new EmbedBuilder()
      .setColor(0xFF8C00)
      .setTitle('<:61048photosfolder:1558977971920838656> Haos Client — Banner')
      .setDescription(
        `- Baner korisnika: ${targetUser}\n` +
        `- [Direktan link do slike](${bannerURL})`
      )
      .setImage(bannerURL)
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }

// PURGE / CLEAR (.purge / .clear)
  if (['purge', 'clear'].includes(command)) {
    // Provera dozvola za brisanje poruka
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      const noPermEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('<:30748bannedrole:1558942653649916044> Haos Client — Greška')
        .setDescription('- Nemate potrebne dozvole za brisanje poruka (`ManageMessages`).');

      return message.reply({ embeds: [noPermEmbed] });
    }

    const amount = parseInt(args[0]);

    // Provera da li je broj validan i u rasponu od 1 do 100
    if (isNaN(amount) || amount < 1 || amount > 100) {
      const usageEmbed = new EmbedBuilder()
        .setColor(0xFF8C00)
        .setTitle('<:78160deleteguild:1559152462680555660> Haos Client — Purge')
        .setDescription(
          '- Pogrešna upotreba komande!\n' +
          '- Navedite broj poruka za brisanje između **1** i **100**.\n' +
          '- Upotreba: `.purge` `[broj_poruka]` ili `.clear` `[broj_poruka]`'
        );

      return message.reply({ embeds: [usageEmbed] });
    }

    try {
      // Briše komandu koju je korisnik ukucao
      await message.delete().catch(() => {});

      // Briše zadati broj poruka
      const deletedMessages = await message.channel.bulkDelete(amount, true);

      const successEmbed = new EmbedBuilder()
        .setColor(0xFF8C00)
        .setTitle('<:6728_true:1558944305283080232> Haos Client — Purge')
        .setDescription(
          `- Uspešno obrisano **${deletedMessages.size}** poruka u kanalu ${message.channel}.\n` +
          `- **Moderator:** ${message.author}`
        )
        .setTimestamp();

      // Šalje potvrdu i briše je automatski posle 5 sekundi
      const replyMsg = await message.channel.send({ embeds: [successEmbed] });
      setTimeout(() => replyMsg.delete().catch(() => {}), 5000);

    } catch (error) {
      console.error(error);
      const errEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('<:30748bannedrole:1558942653649916044> Haos Client — Greška')
        .setDescription(
          '- Došlo je do greške prilikom brisanja poruka.\n' +
          '- **Napomena:** Discord ne dozvoljava brisanje poruka starijih od **14 dana**.'
        );

      return message.channel.send({ embeds: [errEmbed] });
    }
  }

// NUKE (.nuke)
  if (command === 'nuke') {
    // Provera dozvola za upravljanje kanalima
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      const noPermEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('<:30748bannedrole:1558942653649916044> Haos Client — Greška')
        .setDescription('- Nemate potrebne dozvole za brisanje i kreiranje kanala (`ManageChannels`).');

      return message.reply({ embeds: [noPermEmbed] });
    }

    // Embed za potvrdu
    const confirmEmbed = new EmbedBuilder()
      .setColor(0xFF8C00)
      .setTitle('<:816232alerted:1559287275119054849> Haos Client — Nuke Potvrda')
      .setDescription(
        '- Da li ste sigurni da želite obrisati i klonirati ovaj kanal?\n' +
        '- Ova akcija je trajna i obrisaće sve poruke u kanalu!'
      );

    // Kreiranje dugmića
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('confirm_nuke')
        .setLabel('Potvrdi Nuke')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('cancel_nuke')
        .setLabel('Otkaži')
        .setStyle(ButtonStyle.Secondary)
    );

    const replyMsg = await message.reply({ embeds: [confirmEmbed], components: [row] });

    // Sakupljač klikova na dugmad (traje 30 sekundi)
    const filter = (interaction) => interaction.user.id === message.author.id;
    const collector = replyMsg.createMessageComponentCollector({ filter, time: 30000, max: 1 });

    collector.on('collect', async (interaction) => {
      if (interaction.customId === 'confirm_nuke') {
        try {
          const channel = message.channel;
          const position = channel.position;

          // Odgovara interakciji da ne izbaci error
          await interaction.reply({ content: '- Kanal se nukuje...', ephemeral: true });

          // Klonira kanal sa istim podešavanjima
          const newChannel = await channel.clone({
            position: position,
            reason: `Nuke komanda potvrdjena od strane ${message.author.tag}`
          });

          // Briše stari kanal
          await channel.delete(`Nuke komanda potvrdjena od strane ${message.author.tag}`);

          // Poruka i slika u novom kanalu
          const nukeEmbed = new EmbedBuilder()
            .setColor(0xFF8C00)
            .setTitle('<:4301boom:1559281123056549888> Haos Client — Nuke')
            .setDescription(
              `- Ovaj kanal je uspešno očišćen !\n` +
              `- **Moderator:** ${message.author}`
            )
            .setTimestamp();

          return newChannel.send({ embeds: [nukeEmbed] });

        } catch (error) {
          console.error(error);
        }
      } else if (interaction.customId === 'cancel_nuke') {
        const cancelEmbed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('<:30748bannedrole:1558942653649916044> — Otkazano')
          .setDescription('- Nuke proces je uspešno otkazan.');

        return interaction.update({ embeds: [cancelEmbed], components: [] });
      }
    });

    collector.on('end', (collected, reason) => {
      // Ako niko nije kliknuo na vreme
      if (reason === 'time' && replyMsg.editable) {
        const timeoutEmbed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('<:30748bannedrole:1558942653649916044> Haos Client — Isteklo Vreme')
          .setDescription('- Vreme za potvrdu je isteklo. Nuke je otkazan.');

        replyMsg.edit({ embeds: [timeoutEmbed], components: [] }).catch(() => {});
      }
    });
  }
  
  // OPOMENA + TIMEOUT
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

    // Promeni 10 u 15 ako želiš timeout od 15 minuta
    const timeoutMinutes = 10;

    try {
      await target.timeout(
        timeoutMinutes * 60 * 1000,
        `Opomena od ${message.author.tag}: ${reason}`
      );

      const embed = new EmbedBuilder()
        .setColor('#F1C40F')
        .setTitle('⚠️ OPOMENA')
        .addFields(
          { name: '👤 Član', value: `${target.user.tag} (${target.id})` },
          { name: '🛡️ Moderator', value: message.author.tag },
          { name: '📝 Razlog', value: reason },
          { name: '🔇 Timeout', value: `${timeoutMinutes} minuta` }
        )
        .setTimestamp()
        .setFooter({ text: 'HAOS Client • Moderacija' });

      await target.send({ embeds: [embed] }).catch(() => null);
      await message.channel.send({ embeds: [embed] });

      return message.reply(
        `✅ ${target} je opomenut i dobio je timeout od ${timeoutMinutes} minuta.`
      );
    } catch (error) {
      console.error('Greška pri opominjanju:', error);
      return message.reply(
        '❌ Nisam uspeo da opomenem člana. Proveri dozvole bota i njegovu ulogu.'
      );
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
    gstart: 'giveaway',
    gend: 'endgiveaway',
    greroll: 'reroll',
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

  if (command === 'help' || command === 'h') {
    const helpEmbed = new EmbedBuilder()
      .setColor(0xFF8C00)
      .setTitle('<:komande:1559305414003392622> Haos Client — Komande')
      .setDescription(
        '- Dobrodošli u meni pomoći za **Haos Client** bot.\n' +
        '- Pregled svih dostupnih komandi grupisanih po kategorijama:\n\n' +

        // KATEGORIJA: MODERACIJA
        '<:haosmod:1559305155755638804> **Moderacija & Administracija**\n' +
        '- `.warn` `[@korisnik]` `[razlog]` — Daje opomenu korisniku\n' +
        '- `.warnings` `[@korisnik]` — Prikazuje listu opomena za korisnika\n' +
        '- `.purge` / `.clear` `[broj]` — Masovno briše poruke (1-100)\n' +
        '- `.nuke` — Briše sav sadržaj i klonira trenutni kanal\n' +
        '- `.kick` `[@korisnik]` `[razlog]` — Izbacuje korisnika sa servera\n' +
        '- `.ban` `[@korisnik]` `[razlog]` — Banuje korisnika sa servera\n' +
        '- `.mute` / `.timeout` `[@korisnik]` `[vreme]` — Stavlja korisnika na hlađenje\n\n' +

        // KATEGORIJA: OPŠTE
        '<:haoschat:1559305206259392562> **Opšte & Informacije**\n' +
        '- `.help` — Prikazuje ovaj meni pomoći\n' +
        '- `.invites` / `.invite` / `.i` `[@korisnik]` — Prikazuje broj pozivnica korisnika\n' +
        '- `.mc` / `.membercount` — Prikazuje ukupan broj članova servera\n' +
        '- `.userinfo` `[@korisnik]` — Prikazuje informacije o korisniku\n' +
        '- `.serverinfo` — Prikazuje informacije o serveru\n' +
        '- `.avatar` / `.av` `[@korisnik]` — Prikazuje avatar korisnika\n' +
        '- `.banner` `[@korisnik]` — Prikazuje baner korisnika'
      )
      .setFooter({ text: 'Haos Client • Zvanični Meni' })
      .setTimestamp();

    return message.reply({ embeds: [helpEmbed] });
  }
  
    // ==========================================
    // HAOS GIVEAWAY SISTEM
    // ==========================================

    const GW_EMOJI = '<:haos_gw:1559207001735700550>';
    const GW_SAT = '<:haos_sat:1559206979170214000>';
    const GW_NAGRADA = '<:haos_nagrada:1559206996253872208>';
    const GW_TROFEJ = '<:haos_trofej:1559206993003028561>';
    const GW_KRUNA = '<:haos_kruna:1559206986527285288>';
    const GW_EMOJI_ID = '1559207001735700550';
    const GW_COLOR = '#F3994A';

    // POKRETANJE: .gstart 10m 1 Nitro
    if (['gstart', 'giveaway'].includes(command)) {
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
          `${GW_NAGRADA} **NAGRADA**\n` +
          `> ${prize}\n\n` +
          `${GW_TROFEJ} **BROJ POBEDNIKA**\n` +
          `> ${winnersCount}\n\n` +
          `${GW_KRUNA} **ORGANIZATOR**\n` +
          `> ${message.author}\n\n` +
          `${GW_SAT} **ZAVRŠAVA SE**\n` +
          `> <t:${Math.floor(endAt / 1000)}:R>\n\n` +
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
        console.error('Greška pri pokretanju giveaway-a:', error);

        if (giveawayMessage) {
          await giveawayMessage.delete().catch(() => {});
        }

        return message.reply(
          '❌ Giveaway nije pokrenut. Proveri dozvole bota i pristup HAOS emodžiju.'
        );
      }

      // POTVRDA SE BRIŠE POSLE 5 SEKUNDI
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

      setTimeout(() => {
        confirmation.delete().catch(() => {});
      }, 5000);

      // AUTOMATSKO ZAVRŠAVANJE
      setTimeout(async () => {
        try {
          const freshMessage = await message.channel.messages.fetch(giveawayMessage.id);
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
            const noWinnerEmbed = new EmbedBuilder()
              .setColor('#808080')
              .setTitle(`${GW_EMOJI} GIVEAWAY ZAVRŠEN`)
              .setDescription(
                `${GW_NAGRADA} **NAGRADA**\n${prize}\n\n` +
                '❌ Niko nije učestvovao, pobednik nije izvučen.'
              )
              .setFooter({ text: 'HAOS • Giveaway sistem' })
              .setTimestamp();

            await message.channel.send({ embeds: [noWinnerEmbed] });
            return;
          }

          const shuffled = [...participants].sort(() => Math.random() - 0.5);
          const winners = shuffled.slice(0, Math.min(winnersCount, shuffled.length));
          const winnerMentions = winners.map(user => `<@${user.id}>`).join(', ');

          const resultEmbed = new EmbedBuilder()
            .setColor(GW_COLOR)
            .setTitle(`${GW_EMOJI} GIVEAWAY ZAVRŠEN`)
            .setDescription(
              `${GW_TROFEJ} **POBEDNIK${winners.length > 1 ? 'CI' : ''}**\n` +
              `${winnerMentions}\n\n` +
              `${GW_NAGRADA} **NAGRADA**\n` +
              `${prize}\n\n` +
              `${GW_KRUNA} **ČESTITAMO!**\n` +
              'Hvala svima koji su učestvovali u giveaway-u.'
            )
            .addFields({
              name: `${GW_SAT} GIVEAWAY`,
              value: `[Klikni ovde da vidiš giveaway](${freshMessage.url})`
            })
            .setThumbnail(winners[0].displayAvatarURL({ size: 256 }))
            .setFooter({
              text: 'HAOS • Giveaway sistem',
              iconURL: client.user.displayAvatarURL()
            })
            .setTimestamp();

          await message.channel.send({
            content: `${GW_EMOJI} Čestitamo ${winnerMentions}!`,
            embeds: [resultEmbed],
            allowedMentions: { users: winners.map(user => user.id) }
          });
        } catch (error) {
          console.error('Automatsko završavanje giveaway-a:', error);
        }
      }, duration);
    }

    // RUČNO ZAVRŠAVANJE: .gend ID_PORUKE
    // NOVO IZVLAČENJE: .greroll ID_PORUKE
    if (['gend', 'endgiveaway', 'greroll', 'reroll'].includes(command)) {
      if (!hasPermission(PermissionFlagsBits.ManageGuild)) return;

      const isReroll = ['greroll', 'reroll'].includes(command);
      const messageId = args[0];

      if (!messageId || !/^\d{17,22}$/.test(messageId)) {
        return message.reply(
          `Upotreba: \`.${isReroll ? 'greroll' : 'gend'} ID_PORUKE\``
        );
      }

      try {
        const giveawayMsg = await message.channel.messages.fetch(messageId);
        const originalEmbed = giveawayMsg.embeds[0];

        if (
          giveawayMsg.author.id !== client.user.id ||
          !originalEmbed?.title?.includes('GIVEAWAY')
        ) {
          return message.reply(
            '❌ Nisam pronašao giveaway poruku ovog bota u ovom kanalu.'
          );
        }

        const isEnded = originalEmbed.footer?.text === 'GIVEAWAY ZAVRŠEN';

        if (isReroll && !isEnded) {
          return message.reply(
            '❌ Prvo završi giveaway komandom `.gend ID_PORUKE`.'
          );
        }

        if (!isReroll && isEnded) {
          return message.reply('❌ Giveaway je već završen.');
        }

        const reaction = giveawayMsg.reactions.cache.get(GW_EMOJI_ID);

        if (!reaction) {
          return message.reply(
            '❌ Na giveaway poruci nije pronađena HAOS reakcija.'
          );
        }

        const users = await reaction.users.fetch();
        const participants = [...users.values()].filter(user => !user.bot);

        if (participants.length === 0) {
          if (!isReroll) {
            await giveawayMsg.edit({
              embeds: [
                EmbedBuilder.from(originalEmbed)
                  .setColor('#808080')
                  .setFooter({ text: 'GIVEAWAY ZAVRŠEN' })
              ]
            });
          }

          return message.reply('❌ Nema učesnika za izvlačenje.');
        }

        const description = originalEmbed.description || '';
        const prizeMatch = description.match(/\*\*NAGRADA\*\*\s*\n>\s*(.+)/i);
        const prize = prizeMatch?.[1]?.trim() || 'Giveaway nagrada';

        const countMatch = description.match(
          /\*\*BROJ POBEDNIKA\*\*\s*\n>\s*(\d+)/i
        );
        const winnersCount = Math.max(1, Number(countMatch?.[1] || 1));

        const shuffled = [...participants].sort(() => Math.random() - 0.5);
        const winners = shuffled.slice(
          0,
          Math.min(isReroll ? 1 : winnersCount, shuffled.length)
        );

        if (!isReroll) {
          await giveawayMsg.edit({
            embeds: [
              EmbedBuilder.from(originalEmbed)
                .setColor('#808080')
                .setFooter({ text: 'GIVEAWAY ZAVRŠEN' })
            ]
          });
        }

        const winnerMentions = winners.map(user => `<@${user.id}>`).join(', ');

        const resultEmbed = new EmbedBuilder()
          .setColor(GW_COLOR)
          .setTitle(
            `${GW_EMOJI} ${isReroll ? 'NOVO IZVLAČENJE' : 'GIVEAWAY ZAVRŠEN'}`
          )
          .setDescription(
            `${GW_TROFEJ} **POBEDNIK${winners.length > 1 ? 'CI' : ''}**\n` +
            `${winnerMentions}\n\n` +
            `${GW_NAGRADA} **NAGRADA**\n` +
            `${prize}\n\n` +
            `${GW_KRUNA} **ČESTITAMO!**\n` +
            'Hvala svima koji su učestvovali u giveaway-u.'
          )
          .addFields({
            name: `${GW_SAT} GIVEAWAY`,
            value: `[Klikni ovde da vidiš giveaway](${giveawayMsg.url})`
          })
          .setThumbnail(winners[0].displayAvatarURL({ size: 256 }))
          .setFooter({
            text: 'HAOS • Giveaway sistem',
            iconURL: client.user.displayAvatarURL()
          })
          .setTimestamp();

        return message.channel.send({
          content: `${GW_EMOJI} Čestitamo ${winnerMentions}!`,
          embeds: [resultEmbed],
          allowedMentions: { users: winners.map(user => user.id) }
        });
      } catch (error) {
        console.error('Greška u giveaway komandi:', error);

        return message.reply(
          '❌ Nisam uspeo da pronađem poruku. Proveri ID poruke, kanal i dozvole bota.'
        );
      }
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
        .setTitle('<:7191_unban_hammer:1559151627213217852> Haos Client — Ban')
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

    // WARN (.warn)
  if (command === 'warn') {
    // Provera dozvola za moderatora
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      const noPermEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('<:30748bannedrole:1558942653649916044> Haos Client — Greška')
        .setDescription('- Nemate potrebne dozvole za opominjanje članova.');

      return message.reply({ embeds: [noPermEmbed] });
    }

    const member = message.mentions.members.first();
    const reason = args.slice(1).join(' ') || 'Nije naveden razlog';

    // Provera da li je korisnik označen
    if (!member) {
      const usageEmbed = new EmbedBuilder()
        .setColor(0xFF8C00)
        .setTitle('<:276022clydebot:1558907359613419531> Haos Client — Warn')
        .setDescription(
          '- Pogrešna upotreba komande!\n' +
          '- Upotreba: `.warn` `[@korisnik]` `[razlog]`'
        );

      return message.reply({ embeds: [usageEmbed] });
    }

    // Zaštita: Ne možeš opomenuti sebe ili bota
    if (member.id === message.author.id) {
      const selfWarnEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('<:30748bannedrole:1558942653649916044> Haos Client — Greška')
        .setDescription('- Ne možete opomenuti sami sebe.');

      return message.reply({ embeds: [selfWarnEmbed] });
    }

    try {
      // Slanje privatne poruke opomenutom korisniku (opciono)
      const dmEmbed = new EmbedBuilder()
        .setColor(0xFF8C00)
        .setTitle('<:233446highwarning:1559143434206314557> Haos Client — Opomena')
        .setDescription(
          `- Dobili ste opomenu na serveru **${message.guild.name}**!\n` +
          `- **Razlog:** \`${reason}\`\n` +
          `- **Moderator:** ${message.author.tag}`
        )
        .setTimestamp();

      await member.send({ embeds: [dmEmbed] }).catch(() => {
        // Ignoriše grešku ako korisnik ima ugašene Privatne Poruke (DM)
      });

      // Potvrda u kanalu gde je izvršena komanda
      const successEmbed = new EmbedBuilder()
        .setColor(0xFF8C00)
        .setTitle('\<:6728_true:1558944305283080232> Haos Client — Warn')
        .setDescription(
          `- Uspešno opomenut korisnik: ${member.user}\n` +
          `- **Razlog:** \`${reason}\`\n` +
          `- **Moderator:** ${message.author}`
        )
        .setTimestamp();

      return message.reply({ embeds: [successEmbed] });

    } catch (error) {
      console.error(error);
      const errEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('<:30748bannedrole:1558942653649916044> Haos Client — Greška')
        .setDescription('- Došlo je do greške prilikom slanja opomene.');

      return message.reply({ embeds: [errEmbed] });
    }
  }

    // WARNINGS (.warnings / .warns)
  if (['warnings', 'warns'].includes(command)) {
    // Provera dozvola za moderatora
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      const noPermEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('<:276022clydebot:1558907359613419531> Haos Client — Greška')
        .setDescription('- Nemate potrebne dozvole za pregled opomena.');

      return message.reply({ embeds: [noPermEmbed] });
    }

    const member = message.mentions.members.first() || message.member;
    const userWarns = warningsDB.get(member.id) || [];

    // Ako korisnik nema nijednu opomenu
    if (userWarns.length === 0) {
      const noWarnsEmbed = new EmbedBuilder()
        .setColor(0xFF8C00)
        .setTitle('<:276022clydebot:1558907359613419531> Haos Client — Opomene')
        .setDescription(`- Korisnik ${member.user} nema nijednu aktivnu opomenu.`)
        .setTimestamp();

      return message.reply({ embeds: [noWarnsEmbed] });
    }

    // Formatiranje liste opomena
    const warnList = userWarns.map((w, index) => 
      `- **#${index + 1}** | **Razlog:** \`${w.reason}\` | **Moderator:** ${w.moderator}`
    ).join('\n');

    const warnsEmbed = new EmbedBuilder()
      .setColor(0xFF8C00)
      .setTitle('<:276022clydebot:1558907359613419531> Haos Client — Opomene')
      .setDescription(
        `- **Korisnik:** ${member.user}\n` +
        `- **Ukupno opomena:** \`${userWarns.length}\`\n\n` +
        `**Lista opomena:**\n${warnList}`
      )
      .setTimestamp();

    return message.reply({ embeds: [warnsEmbed] });
  }
    

  // ODGOVOR NA POMINJANJE BOTA (Tagovanje)
  if (message.mentions.has(client.user) && !message.mentions.everyone) {
    const mentionEmbed = new EmbedBuilder()
      .setColor(0xFF8C00)
      .setTitle('<:276022clydebot:1558907359613419531> Haos Client — Mention')
      .setDescription(
        `- Ćao ${message.author}, ja sam personalizovani **Client** za **Haos** balkanski server.\n` +
        `- Koristim prefix \`.\`. Ukucaj \`.help\` za više informacija.`
      );

    await message.reply({ embeds: [mentionEmbed] }).catch(() => {});
  }

}); // ZATVARA GLAVNI client.on(Events.MessageCreate)


// PROVERA TOKENA I POKRETANJE
if (!process.env.DISCORD_TOKEN) {
  console.error('Nedostaje DISCORD_TOKEN u .env fajlu.');
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
