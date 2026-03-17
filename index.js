require("dotenv").config();
process.env.TZ = process.env.TZ || "America/Sao_Paulo";

const fs = require("fs");
const path = require("path");
const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  ChannelType,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  InteractionType,
  MessageFlags
} = require("discord.js");

const {
  DISCORD_TOKEN,
  TICKET_PANEL_CHANNEL_ID,
  CATEGORY_DUVIDAS_ID,
  CATEGORY_ENCOMENDA_ID,
  CATEGORY_RECRUTAMENTO_ID,
  CATEGORY_RECRUTAMENTO_APROVADOS_ID,
  CATEGORY_DENUNCIAS_ID,
  RECRUIT_LOG_CHANNEL_ID,
  ROLE_VISITANTE_ID,
  ROLE_PRE_APROVADO_ID,
  RECRUIT_APPROVED_IMAGE_URL,
  RECRUIT_REJECTED_IMAGE_URL
} = process.env;

if (!DISCORD_TOKEN) {
  console.error("Faltou DISCORD_TOKEN no .env");
  process.exit(1);
}

const STORAGE_PATH = path.join(__dirname, "storage.json");
function readStorage() {
  try {
    return JSON.parse(fs.readFileSync(STORAGE_PATH, "utf8"));
  } catch {
    return { panelMessageId: null, ticketCounter: 0, c4Daily: {}, recruitAttempts: {} };
  }
}
function writeStorage(data) {
  fs.writeFileSync(STORAGE_PATH, JSON.stringify(data, null, 2), "utf8");
}
function nextTicketNumber() {
  const s = readStorage();
  s.ticketCounter = (s.ticketCounter || 0) + 1;
  writeStorage(s);
  return s.ticketCounter;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember]
});

/**
 * RECRUTAMENTO: VocÃª vai colar as 20 perguntas aqui depois.
 * IMPORTANTE: Deixe EXATAMENTE 20 itens.
 */
const RECRUIT_QUESTIONS = [
  { q: "Nome (in-game)" },
  { q: "Qual seu nivel?" },
  { q: "Quantos anos voce tem em Narnia?" },
  { q: "O que vc busca em nossa organizacao?" },
  { q: "Quais sao seus objetivos dentro da faccao?" },
  { q: "Já participou de alguma facção, corporação, mecânica ou hospital na cidade? Qual?" },
  { q: "Quanto tempo voce esta na cidade Nova Capital?" },
  { q: "Voce possui carro para fazer as atividades da fac? Se sim, quais?" },
  { q: "Se chamarem por um QRR na radio, o que vc faria?" },
  { q: "E permitido chegar apos um QRR iniciar?" },
  { q: "Quantas pessoas podem participar de uma lojinha?" },
  { q: "Se visse alguem na favela fazendo merda, o que voce faria?" },
  { q: "Qual sua especialidade: tiro ou fuga?" },
  { q: "Cite duas qualidades suas." },
  { q: "O que vc viu de diferente na Suíça pra querer fazer parte?" },
  { q: "Em uma situacao de desvantagem de 2x1, qual seria sua reacao?" },
  { q: "Quantas horas por dia voce consegue se dedicar na faccao?" },
  { q: "O que e powergaming?" },
  { q: "O que e revanger kill?" },
  { q: "O que e CL?" },
  { q: "O que e flaming?" },
  { q: "O que e OOC?" },
  { q: "O que e cop bait?" }
];
const RECRUIT_TIME_LIMIT_MS = 10 * 60 * 1000;
const RECRUIT_MAX_ATTEMPTS = 2;
const RECRUIT_SCHEDULE_LINES = [
  "Segunda-feira: 15:00 e 21:00",
  "Quinta-feira: 15:00 e 21:00",
  "Sexta-feira: 15:00 e 21:00",
  "Tolerancia maxima de atraso: 15 minutos."
];
const RECRUIT_DM_APPROVED_LINES = [
  "Voce foi aprovado na etapa inicial do recrutamento da Suíça.",
  "Leve 700k, sujo ou limpo, para a proxima etapa.",
  "",
  "Horarios de recrutamento:",
  ...RECRUIT_SCHEDULE_LINES
];
const RECRUIT_DM_CLOSED_LINES = [
  "O recrutamento da Suíça esta fechado neste momento.",
  "Ele abre na segunda-feira, ao meio-dia, horario de Brasilia, e fecha na sexta-feira as 18:00.",
  "",
  "Horarios de comparecimento:",
  ...RECRUIT_SCHEDULE_LINES
];
// ====== TABELA DE PREÃ‡OS (Civil x Aliado/Parceria) ======
const PRICE_TABLE = {
  "Colete":   { civil: 55000, aliado: 35000 },
  "Capuz":    { civil: 12500, aliado:  7500 },
  "C4":       { civil:  5500, aliado:  4500 },
  "Mochila":  { civil: 10000, aliado:  7000 },
  "Corda":    { civil:  7500, aliado:  4500 },
  "Joalheria":{ civil: 95000, aliado: 85000 },
  "Lojinha":  { civil: 60000, aliado: 55000 },
  "Banco":    { civil:165000, aliado:150000 }
};

const MAX_DISTINCT_ITEMS = 5;
const C4_DAILY_LIMIT = 10;
const DEFAULT_QTY_LIMIT = 9999;
const MENU_QTY_LIMIT = 25;

const PRICE_MODE_META = {
  civil: { label: "Civil" },
  aliado: { label: "Aliado / Parceria" }
};

const DELIVERY_MODE_META = {
  retirada: { label: "Retirada no ponto" },
  entrega: { label: "Entrega no local" },
  combinado: { label: "Ponto combinado" }
};

const PRIORITY_META = {
  normal: { label: "Normal" },
  urgente: { label: "Urgente" },
  agendado: { label: "Agendado" }
};

const PAYMENT_META = {
  dinheiro: { label: "Dinheiro" },
  pix: { label: "Pix" },
  combinado: { label: "A combinar" }
};

function brl(n) {
  return "R$ " + Number(n).toLocaleString("pt-BR");
}

function labelFrom(meta, key) {
  return meta[key]?.label || "-";
}

function maxQtyForItem(itemName) {
  return itemName === "C4" ? C4_DAILY_LIMIT : DEFAULT_QTY_LIMIT;
}

function menuQtyLimitForItem(itemName) {
  return Math.min(maxQtyForItem(itemName), MENU_QTY_LIMIT);
}

function orderConfigPlaceholder(order) {
  return [
    `Config: ${labelFrom(PRICE_MODE_META, order.priceMode)}`,
    labelFrom(DELIVERY_MODE_META, order.deliveryMode),
    labelFrom(PRIORITY_META, order.priority),
    labelFrom(PAYMENT_META, order.paymentMethod)
  ].join(" | ");
}

function buildOrderConfigOptions() {
  return [
    { label: "Cliente: Civil", value: "price:civil", description: "Usa tabela civil" },
    { label: "Cliente: Aliado/Parceria", value: "price:aliado", description: "Usa tabela com desconto" },
    { label: "Entrega: Retirada", value: "delivery:retirada", description: "Retira no ponto combinado" },
    { label: "Entrega: No local", value: "delivery:entrega", description: "Equipe leva ate voce" },
    { label: "Entrega: Ponto combinado", value: "delivery:combinado", description: "Encontrar em local neutro" },
    { label: "Prioridade: Normal", value: "priority:normal", description: "Fila padrao de atendimento" },
    { label: "Prioridade: Urgente", value: "priority:urgente", description: "Tentativa de prioridade alta" },
    { label: "Prioridade: Agendado", value: "priority:agendado", description: "Entrega no horario combinado" },
    { label: "Pagamento: Dinheiro", value: "payment:dinheiro", description: "Pagamento comum" },
    { label: "Pagamento: Pix", value: "payment:pix", description: "Pagamento por Pix" },
    { label: "Pagamento: A combinar", value: "payment:combinado", description: "Combinar no atendimento" }
  ];
}

function buildOrderConfigSummary(order) {
  return [
    `Tipo de cliente: **${labelFrom(PRICE_MODE_META, order.priceMode)}**`,
    `Entrega: **${labelFrom(DELIVERY_MODE_META, order.deliveryMode)}**`,
    `Prioridade: **${labelFrom(PRIORITY_META, order.priority)}**`,
    `Pagamento: **${labelFrom(PAYMENT_META, order.paymentMethod)}**`
  ].join("\n");
}

function todayKeyBR() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function sumOrder(order, priceMode) {
  let total = 0;
  let totalQty = 0;
  for (const it of order.items) {
    const unit = PRICE_TABLE[it.name][priceMode];
    total += unit * it.qty;
    totalQty += it.qty;
  }
  return { total, totalQty };
}

function buildOrderLines(order, priceMode) {
  if (!order.items.length) return "-";
  return order.items.map((it) => {
    const unit = PRICE_TABLE[it.name][priceMode];
    const sub = unit * it.qty;
    return `- **${it.name}** x${it.qty} - ${brl(unit)} (unit) => **${brl(sub)}**`;
  }).join("\n");
}

function buildEncomendaBuilderEmbed(order, userId) {
  const { total, totalQty } = sumOrder(order, order.priceMode);
  const principal = [...order.items].sort((a, b) => b.qty - a.qty)[0]?.name || "-";
  return new EmbedBuilder()
    .setColor(0xB91C1C)
    .setTitle("Central de Encomendas - Montagem do Pedido")
    .setDescription(
      [
        "1) Escolha item + quantidade e clique em **Adicionar**.",
        "2) Ajuste as configuracoes no menu **Tipo/Entrega/Prioridade/Pagamento**.",
        "3) Use **Remover** ou **Limpar** para corrigir rapido.",
        "4) Clique em **Finalizar Pedido** quando estiver tudo certo.",
        "",
        `**Regras:** C4 maximo **${C4_DAILY_LIMIT}** por dia | Outros itens sem limite diario | Maximo **${MAX_DISTINCT_ITEMS}** itens diferentes.`
      ].join("\n")
    )
    .addFields(
      { name: "Cliente", value: `<@${userId}>`, inline: true },
      { name: "Nome", value: order.customerName || "-", inline: true },
      { name: "ID no jogo", value: `\`${order.gameId}\``, inline: true },
      { name: "Telefone", value: `\`${order.phoneNumber || "-"}\``, inline: true },
      { name: "Local/Referencia", value: order.deliveryLocation || "-", inline: true },
      { name: "Itens diferentes", value: `**${order.items.length}/${MAX_DISTINCT_ITEMS}**`, inline: true },
      { name: "Selecao atual", value: `**${order.selectedItem}** x${order.selectedQty}`, inline: true },
      { name: "Quantidade total", value: `**${totalQty}**`, inline: true },
      { name: "Item principal", value: principal, inline: true },
      { name: "Configuracoes", value: buildOrderConfigSummary(order), inline: false },
      { name: "Observacoes", value: order.notes || "-", inline: false },
      { name: "Itens", value: buildOrderLines(order, order.priceMode), inline: false },
      { name: "Total parcial", value: `**${brl(total)}**`, inline: false }
    )
    .setFooter({ text: "Painel de encomenda â€¢ finalize quando estiver tudo correto" })
    .setTimestamp();
}

function buildEncomendaBuilderComponents(order) {
  const itemOptions = Object.keys(PRICE_TABLE).map((name) => ({
    label: name,
    value: name,
    description: `Preco unitario ${brl(PRICE_TABLE[name][order.priceMode])}`,
    default: name === order.selectedItem
  }));

  const qtyMenuLimit = menuQtyLimitForItem(order.selectedItem);
  const qtyOptions = Array.from({ length: qtyMenuLimit }, (_, i) => {
    const v = String(i + 1);
    return { label: v, value: v, default: Number(v) === order.selectedQty };
  });

  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("enc_select_item")
        .setPlaceholder(`Item atual: ${order.selectedItem}`)
        .addOptions(itemOptions)
    ),
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("enc_select_qty")
        .setPlaceholder(`Quantidade: ${order.selectedQty} (menu ate ${qtyMenuLimit})`)
        .addOptions(qtyOptions)
    ),
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("enc_select_config")
        .setPlaceholder(orderConfigPlaceholder(order))
        .addOptions(buildOrderConfigOptions())
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("enc_add_item").setLabel("Adicionar").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("enc_remove_item").setLabel("Remover").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("enc_clear_items").setLabel("Limpar").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("enc_set_qty").setLabel("Qtd Manual").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("enc_edit_details").setLabel("Editar Dados").setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("enc_add_note").setLabel("Observacoes").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("enc_finish").setLabel("Finalizar Pedido").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("enc_cancel_builder").setLabel("Cancelar").setStyle(ButtonStyle.Danger)
    )
  ];
}

function getRecruitScheduleStatus() {
  const now = new Date();
  const day = now.getDay();
  const minutes = now.getHours() * 60 + now.getMinutes();

  if (day === 6 || day === 0) {
    return { open: false, reason: "Recrutamento fechado aos sabados e domingos." };
  }

  if (day === 1 && minutes < 12 * 60) {
    return { open: false, reason: "Recrutamento abre na segunda-feira ao meio-dia, horario de Brasilia." };
  }

  if (day === 5 && minutes >= 18 * 60) {
    return { open: false, reason: "Recrutamento fecha na sexta-feira as 18:00, horario de Brasilia." };
  }

  return { open: true, reason: null };
}

function isRecruitmentOpen() {
  return getRecruitScheduleStatus().open;
}

function formatRecruitClosedMessage() {
  const status = getRecruitScheduleStatus();
  return [status.reason || "Recrutamento fechado no momento.", "", ...RECRUIT_DM_CLOSED_LINES].join("\n");
}

function getRecruitAttempts(userId) {
  const storage = readStorage();
  storage.recruitAttempts = storage.recruitAttempts || {};
  return Number(storage.recruitAttempts[userId] || 0);
}

function setRecruitAttempts(userId, attempts) {
  const storage = readStorage();
  storage.recruitAttempts = storage.recruitAttempts || {};
  if (attempts > 0) storage.recruitAttempts[userId] = attempts;
  else delete storage.recruitAttempts[userId];
  writeStorage(storage);
}

function incrementRecruitAttempts(userId) {
  const next = getRecruitAttempts(userId) + 1;
  setRecruitAttempts(userId, next);
  return next;
}

function clearRecruitAttempts(userId) {
  setRecruitAttempts(userId, 0);
}

function makePanelEmbed() {
  return new EmbedBuilder()
    .setColor(0xE11D2E)
    .setTitle("\u{1F1E8}\u{1F1ED} Central de Atendimento | Su\u00ED\u00E7a")
    .setDescription("Selecione abaixo a categoria correta para abrir um ticket privado com a equipe.")
    .addFields(
      {
        name: "\u2753 D\u00FAvidas",
        value: "Suporte geral, orienta\u00E7\u00F5es e ajuda com procedimentos.",
        inline: true
      },
      {
        name: "\u{1F4E6} Encomendas",
        value: "Pedidos, servi\u00E7os e acompanhamento do atendimento.",
        inline: true
      },
      {
        name: "\u{1F4DD} Recrutamento",
        value: "Sele\u00E7\u00E3o RP. Dispon\u00EDvel de segunda a sexta.",
        inline: true
      },
      {
        name: "\u{1F6A8} Den\u00FAncias",
        value: "Envie provas em v\u00EDdeo do YouTube e detalhes do caso.",
        inline: true
      },
      {
        name: "\u{1F4CB} Regras R\u00E1pidas",
        value: [
          "Um ticket por assunto.",
          "Mantenha respeito e objetividade.",
          "Responda dentro do prazo informado."
        ].join("\n"),
        inline: false
      }
    )
    .setFooter({ text: "Su\u00ED\u00E7a | Atendimento autom\u00E1tico" });
}

function makePanelButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_duvidas")
      .setLabel("D\u00FAvidas")
      .setStyle(ButtonStyle.Primary)
      .setEmoji({ name: "\u2753" }),
    new ButtonBuilder()
      .setCustomId("ticket_encomenda")
      .setLabel("Encomenda")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji({ name: "\u{1F4E6}" }),
    new ButtonBuilder()
      .setCustomId("ticket_recrutamento")
      .setLabel("Recrutamento")
      .setStyle(ButtonStyle.Success)
      .setEmoji({ name: "\u{1F4DD}" }),
    new ButtonBuilder()
      .setCustomId("ticket_denuncia")
      .setLabel("Den\u00FAncias")
      .setStyle(ButtonStyle.Danger)
      .setEmoji({ name: "\u{1F6A8}" })
  );
}

function sanitizeChannelName(str) {
  return str
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

function buildTicketTopic(ticketNo, kind, userId) {
  return `ticket=${ticketNo};kind=${kind};user=${userId}`;
}

function getTicketNumberFromTopic(topic) {
  const text = String(topic || "");
  const nextFormat = text.match(/(?:^|[;,\s])ticket=(\d+)/i);
  if (nextFormat) return nextFormat[1];

  const legacyFormat = text.match(/Ticket\s*(\d+)/i);
  return legacyFormat ? legacyFormat[1] : "0000";
}

async function createTicketChannel(guild, user, kind, categoryId, titleSuffix) {
  const ticketNo = String(nextTicketNumber()).padStart(4, "0");
  const base = `suica-${kind}-${ticketNo}-${sanitizeChannelName(user.username)}`;
  const channelName = base.slice(0, 95);

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionsBitField.Flags.ViewChannel]
    },
    {
      id: user.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.AttachFiles
      ]
    },
    {
      // Bot
      id: guild.members.me.id,
      allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels]
    }
  ];

  const ch = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: categoryId || null,
    permissionOverwrites: overwrites,
    topic: buildTicketTopic(ticketNo, kind, user.id)
  });

  const header = new EmbedBuilder()
    .setColor(0xE11D2E)
    .setTitle(`\u{1F1E8}\u{1F1ED} Ticket | ${titleSuffix}`)
    .setDescription("Seu atendimento foi aberto com sucesso. Use este canal para falar com a equipe.")
    .addFields(
      { name: "Usu\u00E1rio", value: `<@${user.id}>`, inline: true },
      { name: "Ticket", value: `#${ticketNo}`, inline: true },
      { name: "Categoria", value: titleSuffix, inline: true }
    )
    .setFooter({ text: "Use os bot\u00F5es abaixo para gerenciar o ticket." })
    .setTimestamp();

  const controls = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_close")
      .setLabel("Fechar")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji({ name: "\u{1F512}" }),
    new ButtonBuilder()
      .setCustomId("ticket_delete")
      .setLabel("Apagar")
      .setStyle(ButtonStyle.Danger)
      .setEmoji({ name: "\u{1F5D1}\uFE0F" })
  );

  await ch.send({ embeds: [header], components: [controls] });
  return ch;
}

function makeRecruitStartButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("rec_start")
      .setLabel("Iniciar recrutamento")
      .setStyle(ButtonStyle.Success)
      .setEmoji({ name: "\u2705" }),
    new ButtonBuilder()
      .setCustomId("rec_cancel")
      .setLabel("Cancelar")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji({ name: "\u274C" })
  );
}

function formatRecruitQuestion(qObj, index, total) {
  if (!qObj) return "Pergunta indisponivel.";
  const head = `**Pergunta ${index + 1}/${total}**\n${qObj.q}`;
  if (qObj.type !== "mcq" || !qObj.options) return head;

  const opt = qObj.options;
  return [
    head,
    "",
    `A) ${opt.a || "-"}`,
    `B) ${opt.b || "-"}`,
    `C) ${opt.c || "-"}`,
    `D) ${opt.d || "-"}`,
    "",
    "_Responda com a letra (A/B/C/D) ou texto equivalente._"
  ].join("\n");
}

/**
 * SessÃµes em memÃ³ria:
 * recSessions[channelId] = { userId, startedAt, deadline, index, answers: [] }
 */
const recSessions = new Map();
const orderSessions = new Map();
const pendingRecruitReviews = new Map();

async function refreshOrderBuilderMessage(channel, order) {
  if (!channel || channel.type !== ChannelType.GuildText) return;
  const messages = await channel.messages.fetch({ limit: 20 }).catch(() => null);
  if (!messages) return;

  const panel = messages.find((m) =>
    m.author.id === client.user.id &&
    m.components?.some((row) => row.components?.some((c) => c.customId === "enc_add_item"))
  );

  if (!panel) return;
  await panel.edit({
    embeds: [buildEncomendaBuilderEmbed(order, order.userId)],
    components: buildEncomendaBuilderComponents(order)
  }).catch(() => {});
}

function getSession(channelId) {
  return recSessions.get(channelId);
}
function setSession(channelId, s) {
  recSessions.set(channelId, s);
}
function deleteSession(channelId) {
  recSessions.delete(channelId);
}

function getOwnerIdFromTopic(topic) {
  const text = String(topic || "");

  const nextFormat = text.match(/(?:^|[;,\s])user=(\d{17,20})\b/i);
  if (nextFormat) return nextFormat[1];

  const legacyFormat = text.match(/=(\d{17,20})\b/);
  if (legacyFormat) return legacyFormat[1];

  const trailingId = text.match(/\b(\d{17,20})\b(?!.*\b\d{17,20}\b)/);
  return trailingId ? trailingId[1] : null;
}

async function resolveTicketOwnerId(channel) {
  if (!channel) return null;

  const fromTopic = getOwnerIdFromTopic(channel.topic || "");
  if (fromTopic) return fromTopic;

  const botId = channel.guild?.members?.me?.id;
  const memberOverwrite = channel.permissionOverwrites?.cache?.find((overwrite) =>
    overwrite.type === 1 &&
    overwrite.id !== botId &&
    overwrite.allow.has(PermissionsBitField.Flags.ViewChannel)
  );

  if (memberOverwrite) return memberOverwrite.id;

  const messages = await channel.messages.fetch({ limit: 20 }).catch(() => null);
  if (!messages) return null;

  const ordered = [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  for (const message of ordered) {
    const mention = String(message.content || "").match(/<@!?(\d{17,20})>/);
    if (mention && mention[1] !== botId) {
      return mention[1];
    }
  }

  return null;
}

async function sendRecruitClosedDM(user) {
  await user.send(formatRecruitClosedMessage()).catch(() => {});
}

async function disableRecruitReviewButtons(message) {
  if (!message?.components?.length) return;
  const rows = message.components.map((row) => {
    const nextRow = ActionRowBuilder.from(row);
    nextRow.setComponents(row.components.map((component) => ButtonBuilder.from(component).setDisabled(true)));
    return nextRow;
  });
  await message.edit({ components: rows }).catch(() => {});
}

async function resetRecruitTicketForRetry(channel, userId, attempt) {
  await channel.permissionOverwrites.edit(userId, {
    SendMessages: true,
    AttachFiles: true
  }).catch(() => {});

  await channel.send({
    content: `<@${userId}>`,
    embeds: [
      new EmbedBuilder()
        .setColor(0xF59E0B)
        .setTitle("Recrutamento reprovado")
        .setDescription(
          [
            `Sua tentativa ${attempt - 1}/${RECRUIT_MAX_ATTEMPTS} foi reprovada.`,
            "Voce ainda tem uma segunda chance.",
            "Clique em **Iniciar recrutamento** para responder novamente."
          ].join("\n")
        )
    ],
    components: [makeRecruitStartButtons()]
  }).catch(() => {});
}

async function finalizeApprovedRecruitment(guild, channel, user) {
  const member = await guild.members.fetch(user.id).catch(() => null);
  let preRoleAdded = false;

  if (member) {
    if (ROLE_VISITANTE_ID) {
      await member.roles.remove(ROLE_VISITANTE_ID).catch(() => {});
    }

    if (ROLE_PRE_APROVADO_ID) {
      preRoleAdded = await member.roles.add(ROLE_PRE_APROVADO_ID).then(() => true).catch(() => false);
    }
  }

  clearRecruitAttempts(user.id);

  try {
    const topic = channel.topic || "";
    const ticketNo = getTicketNumberFromTopic(topic);
    const approvedName = `aprovado-${ticketNo}-${sanitizeChannelName(user.username)}`.slice(0, 95);
    await channel.setName(approvedName).catch(() => {});
    if (CATEGORY_RECRUTAMENTO_APROVADOS_ID) {
      await channel.setParent(CATEGORY_RECRUTAMENTO_APROVADOS_ID).catch(() => {});
    }
  } catch {}

  await channel.permissionOverwrites.edit(user.id, {
    SendMessages: false,
    AttachFiles: false
  }).catch(() => {});

  const approvedImage = String(RECRUIT_APPROVED_IMAGE_URL || "").trim();
  const approvedEmbed = new EmbedBuilder()
    .setColor(0x22C55E)
    .setTitle("Aprovado")
    .setDescription(
      [
        preRoleAdded ? "Voce recebeu o cargo **Pre-aprovado**." : "Voce foi aprovado, mas o cargo **Pre-aprovado** nao foi aplicado automaticamente.",
        "Leve **700k** sujo ou limpo para a proxima etapa.",
        "Os horarios foram enviados na sua DM."
      ].join("\n")
    );

  if (/^https?:\/\/\S+/i.test(approvedImage)) {
    approvedEmbed.setImage(approvedImage);
  }

  await channel.send({ embeds: [approvedEmbed] }).catch(() => {});

  await user.send(RECRUIT_DM_APPROVED_LINES.join("\n")).catch(async () => {
    await channel.send("Nao consegui te enviar DM. Abra sua DM e chame um recrutador.").catch(() => {});
  });
}

function makeRecruitReviewButtons(reviewId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`rec_review_approve:${reviewId}`)
      .setLabel("Aprovar")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`rec_review_reject:${reviewId}`)
      .setLabel("Reprovar")
      .setStyle(ButtonStyle.Danger)
  );
}

function buildRecruitAnswersEmbeds(session, user) {
  const embeds = [];
  const summary = new EmbedBuilder()
    .setColor(0x2563EB)
    .setTitle("Recrutamento - Aguardando avaliacao")
    .addFields(
      { name: "Candidato", value: `<@${user.id}>`, inline: true },
      { name: "Tag", value: `\`${user.tag}\``, inline: true },
      { name: "Tentativa", value: `**${session.attempt}/${RECRUIT_MAX_ATTEMPTS}**`, inline: true },
      { name: "Ticket", value: `<#${session.channelId}>`, inline: true },
      { name: "Perguntas", value: `**${session.answers.length}/${session.totalQuestions}**`, inline: true },
      { name: "Status", value: "Aguardando decisao do recrutador.", inline: true }
    )
    .setTimestamp();
  embeds.push(summary);

  const perEmbed = 4;
  for (let i = 0; i < session.answers.length; i += perEmbed) {
    const embed = new EmbedBuilder()
      .setColor(0x1F2937)
      .setTitle(`Respostas ${i + 1}-${Math.min(i + perEmbed, session.answers.length)}`);

    for (let j = i; j < Math.min(i + perEmbed, session.answers.length); j++) {
      embed.addFields({
        name: `Q${j + 1} - ${truncateForEmbed(RECRUIT_QUESTIONS[j]?.q || "Pergunta", 120)}`,
        value: truncateForEmbed(session.answers[j] || "-", 900),
        inline: false
      });
    }

    embeds.push(embed);
  }

  return embeds;
}

async function handleRecruitReviewDecision(interaction, decision, reviewId) {
  const review = pendingRecruitReviews.get(reviewId);
  if (!review) {
    return interaction.reply({ content: "Esta avaliacao nao esta mais disponivel.", flags: MessageFlags.Ephemeral });
  }

  if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageChannels)) {
    return interaction.reply({ content: "Voce nao tem permissao para avaliar recrutamentos.", flags: MessageFlags.Ephemeral });
  }

  // Defer to avoid "Unknown interaction" when processing takes >3s
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});
  }

  pendingRecruitReviews.delete(reviewId);
  await disableRecruitReviewButtons(interaction.message);

  const guild = interaction.guild;
  const channel = guild ? await guild.channels.fetch(review.channelId).catch(() => null) : null;
  const user = await client.users.fetch(review.userId).catch(() => null);

  if (!guild || !channel || !user) {
    if (interaction.deferred) {
      return interaction.editReply({ content: "Nao consegui localizar ticket ou candidato para finalizar a avaliacao." });
    } else {
      return interaction.reply({ content: "Nao consegui localizar ticket ou candidato para finalizar a avaliacao.", flags: MessageFlags.Ephemeral });
    }
  }

  const embeds = interaction.message.embeds.map((embed, index) => {
    const next = EmbedBuilder.from(embed);
    if (index === 0) {
      next.setColor(decision === "approve" ? 0x16A34A : 0xDC2626);
      next.spliceFields(5, 1, {
        name: "Status",
        value: decision === "approve" ? `Aprovado por <@${interaction.user.id}>.` : `Reprovado por <@${interaction.user.id}>.`,
        inline: true
      });
    }
    return next;
  });
  await interaction.message.edit({ embeds }).catch(() => {});

  if (decision === "approve") {
    await finalizeApprovedRecruitment(guild, channel, user);
    return interaction.editReply({ content: `Candidato <@${user.id}> aprovado.` });
  }

  const attempts = incrementRecruitAttempts(user.id);
  deleteSession(channel.id);

  if (attempts < RECRUIT_MAX_ATTEMPTS) {
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xEF4444)
          .setTitle("Reprovado")
          .setDescription("Seu recrutamento foi reprovado nesta tentativa. Voce pode tentar mais uma vez.")
      ]
    }).catch(() => {});

    await resetRecruitTicketForRetry(channel, user.id, attempts + 1);
    return interaction.editReply({ content: `Candidato <@${user.id}> reprovado. Segunda chance liberada.` });
  }

  const reprovedImage = String(RECRUIT_REJECTED_IMAGE_URL || "").trim();
  const reprovedEmbed = new EmbedBuilder()
    .setColor(0xEF4444)
    .setTitle("Reprovado")
    .setDescription("Voce atingiu o limite de tentativas. O ticket sera encerrado.");

  if (/^https?:\/\/\S+/i.test(reprovedImage)) {
    reprovedEmbed.setImage(reprovedImage);
  }

  await channel.send({ embeds: [reprovedEmbed] }).catch(() => {});
  await user.send("Seu recrutamento foi reprovado nas duas tentativas. Aguarde orientacao da lideranca para uma nova abertura.").catch(() => {});
  setTimeout(() => safeDeleteChannel(channel), 4000);
  return interaction.editReply({ content: `Candidato <@${user.id}> reprovado em definitivo.` });
}

function normalize(str) {
  return (str || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function truncateForEmbed(text, max = 220) {
  const clean = String(text || "-").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 3) + "...";
}

async function safeDeleteChannel(channel) {
  try {
    await channel.delete("Ticket encerrado/apagado pelo sistema.");
  } catch {}
}

async function ensurePanel(interactionOrGuild) {
  const guild = interactionOrGuild.guild ?? interactionOrGuild;
  const storage = readStorage();

  const panelChannel = await guild.channels.fetch(TICKET_PANEL_CHANNEL_ID).catch(() => null);
  if (!panelChannel) return { ok: false, reason: "Canal do painel nÃ£o encontrado." };

  // Se tem messageId salva, tenta editar/confirmar
  if (storage.panelMessageId) {
    const msg = await panelChannel.messages.fetch(storage.panelMessageId).catch(() => null);
    if (msg) {
      await msg.edit({ embeds: [makePanelEmbed()], components: [makePanelButtons()] }).catch(() => {});
      return { ok: true, messageId: msg.id };
    }
  }

  // Cria novo painel
  const newMsg = await panelChannel.send({ embeds: [makePanelEmbed()], components: [makePanelButtons()] });
  storage.panelMessageId = newMsg.id;
  writeStorage(storage);
  return { ok: true, messageId: newMsg.id };
}

client.on("clientReady", async () => {
  console.log(`Logado como ${client.user.tag}`);
  // Opcional: tenta garantir painel ao iniciar (se o bot tiver permissÃ£o)
  // Comentado pra evitar spam se faltarem permissÃµes.
  // await ensurePanel(client.guilds.cache.first());
});

client.on("interactionCreate", async (interaction) => {
  try {
    // Slash /setup
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "setup") {
        const r = await ensurePanel(interaction);
        if (!r.ok) {
          return interaction.reply({ content: `âŒ NÃ£o consegui criar/atualizar o painel: ${r.reason}`, flags: MessageFlags.Ephemeral });
        }
        return interaction.reply({ content: `âœ… Painel configurado/atualizado com sucesso. (mensagem: ${r.messageId})`, flags: MessageFlags.Ephemeral });
      }
    }

    // Select menus
    if (interaction.isStringSelectMenu()) {
      const { customId } = interaction;
      if (customId !== "enc_select_item" && customId !== "enc_select_qty" && customId !== "enc_select_config") return;

      const ch = interaction.channel;
      if (!ch) return;
      const order = orderSessions.get(ch.id);
      if (!order) {
        return interaction.reply({ content: "Painel de encomenda expirado.", flags: MessageFlags.Ephemeral });
      }
      if (interaction.user.id !== order.userId) {
        return interaction.reply({ content: "Somente o dono do pedido pode editar.", flags: MessageFlags.Ephemeral });
      }

      if (customId === "enc_select_item") {
        order.selectedItem = interaction.values[0];
        const max = maxQtyForItem(order.selectedItem);
        if (order.selectedQty > max) order.selectedQty = max;
      } else if (customId === "enc_select_qty") {
        const qty = parseInt(interaction.values[0], 10) || 1;
        order.selectedQty = Math.min(qty, maxQtyForItem(order.selectedItem));
      } else if (customId === "enc_select_config") {
        const [type, value] = String(interaction.values[0] || "").split(":");
        if (type === "price" && (value === "civil" || value === "aliado")) {
          order.priceMode = value;
        } else if (type === "delivery" && DELIVERY_MODE_META[value]) {
          order.deliveryMode = value;
        } else if (type === "priority" && PRIORITY_META[value]) {
          order.priority = value;
        } else if (type === "payment" && PAYMENT_META[value]) {
          order.paymentMethod = value;
        }
      }

      orderSessions.set(ch.id, order);
      await interaction.update({
        embeds: [buildEncomendaBuilderEmbed(order, order.userId)],
        components: buildEncomendaBuilderComponents(order)
      });
      return;
    }

    // BotÃµes
    if (interaction.isButton()) {
      const { customId } = interaction;

      // Painel: abrir tickets
      if (customId === "ticket_duvidas") {
        const modal = new ModalBuilder()
          .setCustomId("modal_duvidas")
          .setTitle("DÃºvidas â€” FormulÃ¡rio");

        const idInput = new TextInputBuilder()
          .setCustomId("duv_id")
          .setLabel("Seu ID (no servidor/jogo)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(30);

        const nomeInput = new TextInputBuilder()
          .setCustomId("duv_nome")
          .setLabel("Seu nome")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(60);

        const assuntoInput = new TextInputBuilder()
          .setCustomId("duv_assunto")
          .setLabel("Assunto da dÃºvida (explique)")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(900);

        modal.addComponents(
          new ActionRowBuilder().addComponents(idInput),
          new ActionRowBuilder().addComponents(nomeInput),
          new ActionRowBuilder().addComponents(assuntoInput)
        );

        return interaction.showModal(modal);
      }

      if (customId === "ticket_denuncia") {
        const modal = new ModalBuilder()
          .setCustomId("modal_denuncia")
          .setTitle("DenÃºncia â€” FormulÃ¡rio");

        const nome = new TextInputBuilder()
          .setCustomId("den_nome")
          .setLabel("Seu nome")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(60);

        const id = new TextInputBuilder()
          .setCustomId("den_id")
          .setLabel("Seu ID")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(30);

        const denunciado = new TextInputBuilder()
          .setCustomId("den_denunciado")
          .setLabel("Nome/ID do denunciado")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(80);

        const youtube = new TextInputBuilder()
          .setCustomId("den_youtube")
          .setLabel("Link do vÃ­deo no YouTube")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(200);

        modal.addComponents(
          new ActionRowBuilder().addComponents(nome),
          new ActionRowBuilder().addComponents(id),
          new ActionRowBuilder().addComponents(denunciado),
          new ActionRowBuilder().addComponents(youtube)
        );

        return interaction.showModal(modal);
      }

      if (customId === "ticket_encomenda") {
        const modal = new ModalBuilder()
          .setCustomId("modal_encomenda")
          .setTitle("Encomenda - Pedido");

        const nomeInput = new TextInputBuilder()
          .setCustomId("enc_nome")
          .setLabel("Seu nome")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(80);

        const idInput = new TextInputBuilder()
          .setCustomId("enc_id")
          .setLabel("Seu ID no jogo")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(30);

        const phoneInput = new TextInputBuilder()
          .setCustomId("enc_telefone")
          .setLabel("Numero de telefone")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(30);

        const localInput = new TextInputBuilder()
          .setCustomId("enc_local")
          .setLabel("Local de entrega/referencia (opcional)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(100);

        modal.addComponents(
          new ActionRowBuilder().addComponents(nomeInput),
          new ActionRowBuilder().addComponents(idInput),
          new ActionRowBuilder().addComponents(phoneInput),
          new ActionRowBuilder().addComponents(localInput)
        );

        return interaction.showModal(modal);
      }

      if (customId === "ticket_recrutamento") {
        if (!isRecruitmentOpen()) {
          await sendRecruitClosedDM(interaction.user);
          return interaction.reply({
            content: formatRecruitClosedMessage(),
            flags: MessageFlags.Ephemeral
          });
        }

        const attempts = getRecruitAttempts(interaction.user.id);
        if (attempts >= RECRUIT_MAX_ATTEMPTS) {
          return interaction.reply({
            content: "Voce ja utilizou as duas tentativas de recrutamento. Aguarde a lideranca liberar uma nova chance.",
            flags: MessageFlags.Ephemeral
          });
        }

        await interaction.reply({ content: "Abrindo seu ticket de recrutamento...", flags: MessageFlags.Ephemeral });

        const ch = await createTicketChannel(
          interaction.guild,
          interaction.user,
          "recrutamento",
          CATEGORY_RECRUTAMENTO_ID,
          "Recrutamento"
        );

        const intro = new EmbedBuilder()
          .setColor(0x16A34A)
          .setTitle("\u{1F3AF} Recrutamento Su\u00ED\u00E7a | Etapa 1")
          .setDescription("Quando estiver pronto, clique no bot\u00E3o abaixo para iniciar sua avalia\u00E7\u00E3o.")
          .addFields(
            { name: "Tempo", value: `**${Math.round(RECRUIT_TIME_LIMIT_MS / 60000)} minutos**`, inline: true },
            { name: "Perguntas", value: `**${RECRUIT_QUESTIONS.length}**`, inline: true },
            { name: "Tentativas", value: `**${RECRUIT_MAX_ATTEMPTS}**`, inline: true },
            {
              name: "Importante",
              value: [
                "Suas respostas ser\u00E3o enviadas para avalia\u00E7\u00E3o do recrutador.",
                "Se houver reprova\u00E7\u00E3o na primeira tentativa, o sistema pode liberar uma segunda chance.",
                "Se for aprovado, voc\u00EA recebe as instru\u00E7\u00F5es no privado."
              ].join("\n"),
              inline: false
            }
          )
          .setFooter({ text: "Su\u00ED\u00E7a | Recrutamento semiautom\u00E1tico" });

        await ch.send({ content: `<@${interaction.user.id}>`, embeds: [intro], components: [makeRecruitStartButtons()] });
        return;
      }

      if (customId === "enc_add_item") {
        const ch = interaction.channel;
        if (!ch) return;
        const order = orderSessions.get(ch.id);
        if (!order) {
          return interaction.reply({ content: "Painel de encomenda expirado.", flags: MessageFlags.Ephemeral });
        }
        if (interaction.user.id !== order.userId) {
          return interaction.reply({ content: "Somente o dono do pedido pode editar.", flags: MessageFlags.Ephemeral });
        }
        const existingItem = order.items.find((x) => x.name === order.selectedItem);
        if (!existingItem && order.items.length >= MAX_DISTINCT_ITEMS) {
          return interaction.reply({ content: `Limite: no maximo ${MAX_DISTINCT_ITEMS} itens diferentes.`, flags: MessageFlags.Ephemeral });
        }

        const nextQty = (existingItem?.qty || 0) + order.selectedQty;
        if (order.selectedItem === "C4" && nextQty > C4_DAILY_LIMIT) {
          return interaction.reply({ content: `C4 permite no maximo ${C4_DAILY_LIMIT} unidades por pedido.`, flags: MessageFlags.Ephemeral });
        }

        if (existingItem) {
          existingItem.qty = nextQty;
        } else {
          order.items.push({ name: order.selectedItem, qty: order.selectedQty });
        }

        orderSessions.set(ch.id, order);
        await interaction.update({
          embeds: [buildEncomendaBuilderEmbed(order, order.userId)],
          components: buildEncomendaBuilderComponents(order)
        });
        return;
      }

      if (customId === "enc_remove_item") {
        const ch = interaction.channel;
        if (!ch) return;
        const order = orderSessions.get(ch.id);
        if (!order) {
          return interaction.reply({ content: "Painel de encomenda expirado.", flags: MessageFlags.Ephemeral });
        }
        if (interaction.user.id !== order.userId) {
          return interaction.reply({ content: "Somente o dono do pedido pode editar.", flags: MessageFlags.Ephemeral });
        }

        const nextItems = order.items.filter((x) => x.name !== order.selectedItem);
        if (nextItems.length === order.items.length) {
          return interaction.reply({ content: `${order.selectedItem} nao esta no carrinho.`, flags: MessageFlags.Ephemeral });
        }

        order.items = nextItems;
        orderSessions.set(ch.id, order);
        await interaction.update({
          embeds: [buildEncomendaBuilderEmbed(order, order.userId)],
          components: buildEncomendaBuilderComponents(order)
        });
        return;
      }

      if (customId === "enc_clear_items") {
        const ch = interaction.channel;
        if (!ch) return;
        const order = orderSessions.get(ch.id);
        if (!order) {
          return interaction.reply({ content: "Painel de encomenda expirado.", flags: MessageFlags.Ephemeral });
        }
        if (interaction.user.id !== order.userId) {
          return interaction.reply({ content: "Somente o dono do pedido pode editar.", flags: MessageFlags.Ephemeral });
        }

        order.items = [];
        orderSessions.set(ch.id, order);
        await interaction.update({
          embeds: [buildEncomendaBuilderEmbed(order, order.userId)],
          components: buildEncomendaBuilderComponents(order)
        });
        return;
      }

      if (customId === "enc_set_qty") {
        const ch = interaction.channel;
        if (!ch) return;
        const order = orderSessions.get(ch.id);
        if (!order) {
          return interaction.reply({ content: "Painel de encomenda expirado.", flags: MessageFlags.Ephemeral });
        }
        if (interaction.user.id !== order.userId) {
          return interaction.reply({ content: "Somente o dono do pedido pode editar.", flags: MessageFlags.Ephemeral });
        }

        const modal = new ModalBuilder()
          .setCustomId("modal_enc_qty")
          .setTitle("Definir quantidade");

        const qtyInput = new TextInputBuilder()
          .setCustomId("enc_qty_value")
          .setLabel(`Quantidade (${order.selectedItem} max ${maxQtyForItem(order.selectedItem)})`)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(9);

        modal.addComponents(new ActionRowBuilder().addComponents(qtyInput));
        return interaction.showModal(modal);
      }

      if (customId === "enc_edit_details") {
        const ch = interaction.channel;
        if (!ch) return;
        const order = orderSessions.get(ch.id);
        if (!order) {
          return interaction.reply({ content: "Painel de encomenda expirado.", flags: MessageFlags.Ephemeral });
        }
        if (interaction.user.id !== order.userId) {
          return interaction.reply({ content: "Somente o dono do pedido pode editar.", flags: MessageFlags.Ephemeral });
        }

        const modal = new ModalBuilder()
          .setCustomId("modal_enc_details")
          .setTitle("Editar dados do pedido");

        const nomeInput = new TextInputBuilder()
          .setCustomId("enc_edit_nome")
          .setLabel("Nome")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(80)
          .setValue(order.customerName || "-");

        const idInput = new TextInputBuilder()
          .setCustomId("enc_edit_id")
          .setLabel("ID no jogo")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(30)
          .setValue(order.gameId || "-");

        const phoneInput = new TextInputBuilder()
          .setCustomId("enc_edit_telefone")
          .setLabel("Telefone")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(30)
          .setValue(order.phoneNumber || "-");

        const localInput = new TextInputBuilder()
          .setCustomId("enc_edit_local")
          .setLabel("Local/referencia")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(100);

        if (order.deliveryLocation) {
          localInput.setValue(order.deliveryLocation);
        }

        modal.addComponents(
          new ActionRowBuilder().addComponents(nomeInput),
          new ActionRowBuilder().addComponents(idInput),
          new ActionRowBuilder().addComponents(phoneInput),
          new ActionRowBuilder().addComponents(localInput)
        );

        return interaction.showModal(modal);
      }

      if (customId === "enc_add_note") {
        const ch = interaction.channel;
        if (!ch) return;
        const order = orderSessions.get(ch.id);
        if (!order) {
          return interaction.reply({ content: "Painel de encomenda expirado.", flags: MessageFlags.Ephemeral });
        }
        if (interaction.user.id !== order.userId) {
          return interaction.reply({ content: "Somente o dono do pedido pode editar.", flags: MessageFlags.Ephemeral });
        }

        const modal = new ModalBuilder()
          .setCustomId("modal_enc_note")
          .setTitle("Observacoes do pedido");

        const noteInput = new TextInputBuilder()
          .setCustomId("enc_note_value")
          .setLabel("Detalhes extras (horario, referencia, etc)")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(500);

        if (order.notes) {
          noteInput.setValue(order.notes);
        }

        modal.addComponents(new ActionRowBuilder().addComponents(noteInput));
        return interaction.showModal(modal);
      }

      if (customId === "enc_finish") {
        const ch = interaction.channel;
        if (!ch) return;
        const order = orderSessions.get(ch.id);
        if (!order) {
          return interaction.reply({ content: "Painel de encomenda expirado.", flags: MessageFlags.Ephemeral });
        }
        if (interaction.user.id !== order.userId) {
          return interaction.reply({ content: "Somente o dono do pedido pode finalizar.", flags: MessageFlags.Ephemeral });
        }
        if (!order.items.length) {
          return interaction.reply({ content: "Adicione pelo menos 1 item antes de finalizar.", flags: MessageFlags.Ephemeral });
        }

        const wantsC4 = order.items.find((x) => x.name === "C4");
        if (wantsC4) {
          const storage = readStorage();
          storage.c4Daily = storage.c4Daily || {};
          const dayKey = todayKeyBR();
          storage.c4Daily[dayKey] = storage.c4Daily[dayKey] || {};
          const already = storage.c4Daily[dayKey][interaction.user.id] || 0;

          if (already + wantsC4.qty > C4_DAILY_LIMIT) {
            const remaining = Math.max(0, C4_DAILY_LIMIT - already);
            return interaction.reply({
              content:
                `Limite diario de C4: ${C4_DAILY_LIMIT} por pessoa.\n` +
                `Voce ja pediu hoje: ${already}.\n` +
                `Disponivel ainda hoje: ${remaining}.`,
              flags: MessageFlags.Ephemeral
            });
          }

          storage.c4Daily[dayKey][interaction.user.id] = already + wantsC4.qty;
          writeStorage(storage);
        }

        const { total, totalQty } = sumOrder(order, order.priceMode);
        const principal = [...order.items].sort((a, b) => b.qty - a.qty)[0]?.name || "-";
        const itemLines = buildOrderLines(order, order.priceMode);

        const embed = new EmbedBuilder()
          .setColor(0x991B1B)
          .setTitle(`Pedido de Encomenda - ${interaction.user.username}`)
          .addFields(
            { name: "Comprador", value: `<@${interaction.user.id}>`, inline: true },
            { name: "Nome", value: order.customerName || "-", inline: true },
            { name: "ID no jogo", value: `\`${order.gameId}\``, inline: true },
            { name: "Telefone", value: `\`${order.phoneNumber || "-"}\``, inline: true },
            { name: "Local/Referencia", value: order.deliveryLocation || "-", inline: true },
            { name: "Tipo de cliente", value: labelFrom(PRICE_MODE_META, order.priceMode), inline: true },
            { name: "Entrega", value: labelFrom(DELIVERY_MODE_META, order.deliveryMode), inline: true },
            { name: "Prioridade", value: labelFrom(PRIORITY_META, order.priority), inline: true },
            { name: "Pagamento", value: labelFrom(PAYMENT_META, order.paymentMethod), inline: true },
            { name: "Status", value: "Aguardando atendimento", inline: true },
            { name: "Quantidade total", value: `**${totalQty}**`, inline: true },
            { name: "Item principal", value: principal, inline: true },
            { name: "Observacoes", value: order.notes || "-", inline: false },
            { name: "Itens solicitados", value: itemLines, inline: false },
            { name: "Total do pedido", value: `**${brl(total)}**`, inline: false }
          )
          .setFooter({ text: "Suica â€¢ Encomendas â€¢ Assumir / Marcar Pronto / Fechar" })
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("enc_assumir_adm")
            .setLabel("Assumir (ADM)")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId("enc_pronto_adm")
            .setLabel("Marcar Pronto (ADM)")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId("ticket_close")
            .setLabel("Fechar")
            .setStyle(ButtonStyle.Danger)
        );

        orderSessions.delete(ch.id);
        await interaction.update({ embeds: [embed], components: [row] });
        return;
      }

      if (customId === "enc_cancel_builder") {
        const ch = interaction.channel;
        if (!ch) return;
        const order = orderSessions.get(ch.id);
        if (!order) {
          return interaction.reply({ content: "Painel de encomenda expirado.", flags: MessageFlags.Ephemeral });
        }
        if (interaction.user.id !== order.userId && !interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageChannels)) {
          return interaction.reply({ content: "Somente o dono do pedido pode cancelar.", flags: MessageFlags.Ephemeral });
        }

        orderSessions.delete(ch.id);
        await interaction.update({
          embeds: [
            new EmbedBuilder()
              .setColor(0x6B7280)
              .setTitle("Encomenda cancelada")
              .setDescription("O painel de montagem do pedido foi cancelado.")
          ],
          components: []
        });
        return;
      }

      if (customId === "enc_assumir_adm") {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageChannels)) {
          return interaction.reply({ content: "Voce nao tem permissao para assumir encomendas.", flags: MessageFlags.Ephemeral });
        }

        const msg = interaction.message;
        if (!msg || !msg.embeds?.length) return;

        const embed = EmbedBuilder.from(msg.embeds[0]);
        const fields = [...(embed.data.fields || [])];
        const statusIndex = fields.findIndex(f => f.name === "Status");
        const statusValue = `Assumido por <@${interaction.user.id}>`;

        if (statusIndex >= 0) {
          fields[statusIndex] = { ...fields[statusIndex], value: statusValue, inline: true };
        } else {
          fields.push({ name: "Status", value: statusValue, inline: true });
        }

        embed.setFields(fields);
        await msg.edit({ embeds: [embed] }).catch(() => {});
        return interaction.reply({ content: "Encomenda assumida com sucesso.", flags: MessageFlags.Ephemeral });
      }

      if (customId === "enc_pronto_adm") {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageChannels)) {
          return interaction.reply({ content: "Voce nao tem permissao para marcar encomendas como prontas.", flags: MessageFlags.Ephemeral });
        }

        const ch = interaction.channel;
        const msg = interaction.message;
        if (!ch || !msg || !msg.embeds?.length || ch.type !== ChannelType.GuildText) return;

        const embed = EmbedBuilder.from(msg.embeds[0]);
        const fields = [...(embed.data.fields || [])];
        const statusIndex = fields.findIndex(f => f.name === "Status");
        const statusValue = `Pronto por <@${interaction.user.id}>`;

        if (statusIndex >= 0) {
          fields[statusIndex] = { ...fields[statusIndex], value: statusValue, inline: true };
        } else {
          fields.push({ name: "Status", value: statusValue, inline: true });
        }

        embed.setFields(fields);

        const updatedRows = msg.components.map((row) => {
          const disabledRow = ActionRowBuilder.from(row);
          const newComponents = row.components.map((c) => {
            if (c.customId === "enc_assumir_adm" || c.customId === "enc_pronto_adm") {
              return ButtonBuilder.from(c).setDisabled(true);
            }
            return ButtonBuilder.from(c);
          });
          disabledRow.setComponents(newComponents);
          return disabledRow;
        });

        await msg.edit({ embeds: [embed], components: updatedRows }).catch(() => {});

        const userId = await resolveTicketOwnerId(ch);

        if (userId) {
          await ch.permissionOverwrites.edit(userId, {
            SendMessages: false,
            AttachFiles: false
          }).catch(() => {});

          const user = await client.users.fetch(userId).catch(() => null);
          if (user) {
            await user.send(
              [
                "Seu pedido de encomenda foi marcado como **PRONTO**.",
                `Servidor: **${interaction.guild?.name || "Suica"}**`,
                `Canal do ticket: <#${ch.id}>`,
                "",
                "Se precisar de ajuste, fale com a equipe de atendimento."
              ].join("\n")
            ).catch(() => {});
          }
        }

        return interaction.reply({ content: "Encomenda marcada como pronta e ticket bloqueado para o cliente.", flags: MessageFlags.Ephemeral });
      }

      // Controles gerais de ticket
      if (customId === "ticket_close") {
        // â€œFecharâ€: trava envio do usuÃ¡rio (mantÃ©m leitura)
        const ch = interaction.channel;
        if (!ch || ch.type !== ChannelType.GuildText) return;

        const userId = getOwnerIdFromTopic(ch.topic || "");

        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageChannels)) {
          return interaction.reply({ content: "âŒ VocÃª nÃ£o tem permissÃ£o para fechar tickets.", flags: MessageFlags.Ephemeral });
        }

        if (userId) {
          await ch.permissionOverwrites.edit(userId, {
            SendMessages: false,
            AttachFiles: false
          }).catch(() => {});
        }

        await interaction.reply({ content: "ðŸ”’ Ticket **fechado** (usuÃ¡rio nÃ£o pode mais enviar mensagens).", flags: MessageFlags.Ephemeral });

        orderSessions.delete(ch.id);
        return;
      }

      if (customId === "ticket_delete") {
        const ch = interaction.channel;
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageChannels)) {
          return interaction.reply({ content: "âŒ VocÃª nÃ£o tem permissÃ£o para apagar tickets.", flags: MessageFlags.Ephemeral });
        }
        await interaction.reply({ content: "ðŸ—‘ï¸ Apagando ticket...", flags: MessageFlags.Ephemeral });
        deleteSession(ch.id);

        orderSessions.delete(ch.id);
        await safeDeleteChannel(ch);
        return;
      }

            if (customId.startsWith("rec_review_approve:")) {
        const reviewId = customId.split(":")[1];
        return handleRecruitReviewDecision(interaction, "approve", reviewId);
      }

      if (customId.startsWith("rec_review_reject:")) {
        const reviewId = customId.split(":")[1];
        return handleRecruitReviewDecision(interaction, "reject", reviewId);
      }

      // Recrutamento: iniciar/cancelar
      if (customId === "rec_cancel") {
        const ch = interaction.channel;
        if (!ch) return;

        // SÃ³ o dono do ticket ou staff (ManageChannels)
        const isStaff = interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageChannels);
        const ownerId = await resolveTicketOwnerId(ch);

        if (!isStaff && interaction.user.id !== ownerId) {
          return interaction.reply({ content: "\u274C Voc\u00EA n\u00E3o pode cancelar o recrutamento de outra pessoa.", flags: MessageFlags.Ephemeral });
        }

        await interaction.reply({ content: "\u274C Recrutamento cancelado. Apagando ticket...", flags: MessageFlags.Ephemeral });
        deleteSession(ch.id);

        orderSessions.delete(ch.id);
        await safeDeleteChannel(ch);
        return;
      }

      if (customId === "rec_start") {
        const ch = interaction.channel;
        if (!ch) return;

        const ownerId = await resolveTicketOwnerId(ch);
        if (interaction.user.id !== ownerId) {
          return interaction.reply({
            content: ownerId
              ? `Apenas o dono do ticket pode iniciar o recrutamento. Dono esperado: <@${ownerId}>.`
              : "Nao consegui identificar o dono do ticket. Feche e abra um novo ticket de recrutamento.",
            flags: MessageFlags.Ephemeral
          });
        }

        if (!isRecruitmentOpen()) {
          await sendRecruitClosedDM(interaction.user);
          return interaction.reply({ content: formatRecruitClosedMessage(), flags: MessageFlags.Ephemeral });
        }

        if (getSession(ch.id)) {
          return interaction.reply({ content: "O recrutamento ja foi iniciado neste ticket.", flags: MessageFlags.Ephemeral });
        }

        const attempts = getRecruitAttempts(interaction.user.id);
        if (attempts >= RECRUIT_MAX_ATTEMPTS) {
          return interaction.reply({ content: "Voce nao possui mais tentativas disponiveis.", flags: MessageFlags.Ephemeral });
        }

        const totalQuestions = Array.isArray(RECRUIT_QUESTIONS) ? RECRUIT_QUESTIONS.length : 0;
        if (!totalQuestions) {
          return interaction.reply({ content: "As perguntas do recrutamento nao estao configuradas.", flags: MessageFlags.Ephemeral });
        }

        const startedAt = Date.now();
        const deadline = startedAt + RECRUIT_TIME_LIMIT_MS;

        setSession(ch.id, {
          channelId: ch.id,
          userId: interaction.user.id,
          startedAt,
          deadline,
          totalQuestions,
          index: 0,
          attempt: attempts + 1,
          answers: []
        });

        await interaction.reply({
          content: `Recrutamento iniciado. Voce tem ${Math.round(RECRUIT_TIME_LIMIT_MS / 60000)} minutos e esta na tentativa ${attempts + 1}/${RECRUIT_MAX_ATTEMPTS}.`,
          flags: MessageFlags.Ephemeral
        });

        await ch.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0x22C55E)
              .setTitle("Cronometro iniciado")
              .setDescription("Responda neste canal. O recrutador vai analisar suas respostas quando terminar.")
          ]
        });

        await ch.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0xEAB308)
              .setTitle(`Pergunta 1/${totalQuestions}`)
              .setDescription(formatRecruitQuestion(RECRUIT_QUESTIONS[0], 0, totalQuestions))
          ]
        });

        return;
      }

      return;
    }

    // Modais
    if (interaction.type === InteractionType.ModalSubmit) {
      const id = interaction.customId;

      if (id === "modal_enc_qty") {
        const ch = interaction.channel;
        if (!ch) return;
        const order = orderSessions.get(ch.id);
        if (!order) {
          return interaction.reply({ content: "Painel de encomenda expirado.", flags: MessageFlags.Ephemeral });
        }
        if (interaction.user.id !== order.userId) {
          return interaction.reply({ content: "Somente o dono do pedido pode editar.", flags: MessageFlags.Ephemeral });
        }

        const raw = interaction.fields.getTextInputValue("enc_qty_value").trim();
        const qty = parseInt(raw, 10);
        if (!Number.isFinite(qty) || qty <= 0) {
          return interaction.reply({ content: "Quantidade invalida.", flags: MessageFlags.Ephemeral });
        }

        const qtyLimit = maxQtyForItem(order.selectedItem);
        if (qty > qtyLimit) {
          return interaction.reply({
            content: `${order.selectedItem} permite no maximo ${qtyLimit}.`,
            flags: MessageFlags.Ephemeral
          });
        }

        order.selectedQty = qty;
        orderSessions.set(ch.id, order);
        await interaction.reply({
          content: `Quantidade definida para ${order.selectedItem}: ${qty}.`,
          flags: MessageFlags.Ephemeral
        });
        await refreshOrderBuilderMessage(ch, order);
        return;
      }

      if (id === "modal_enc_details") {
        const ch = interaction.channel;
        if (!ch) return;
        const order = orderSessions.get(ch.id);
        if (!order) {
          return interaction.reply({ content: "Painel de encomenda expirado.", flags: MessageFlags.Ephemeral });
        }
        if (interaction.user.id !== order.userId) {
          return interaction.reply({ content: "Somente o dono do pedido pode editar.", flags: MessageFlags.Ephemeral });
        }

        order.customerName = interaction.fields.getTextInputValue("enc_edit_nome").trim();
        order.gameId = interaction.fields.getTextInputValue("enc_edit_id").trim();
        order.phoneNumber = interaction.fields.getTextInputValue("enc_edit_telefone").trim();
        order.deliveryLocation = interaction.fields.getTextInputValue("enc_edit_local").trim();

        orderSessions.set(ch.id, order);
        await interaction.reply({ content: "Dados do pedido atualizados.", flags: MessageFlags.Ephemeral });
        await refreshOrderBuilderMessage(ch, order);
        return;
      }

      if (id === "modal_enc_note") {
        const ch = interaction.channel;
        if (!ch) return;
        const order = orderSessions.get(ch.id);
        if (!order) {
          return interaction.reply({ content: "Painel de encomenda expirado.", flags: MessageFlags.Ephemeral });
        }
        if (interaction.user.id !== order.userId) {
          return interaction.reply({ content: "Somente o dono do pedido pode editar.", flags: MessageFlags.Ephemeral });
        }

        order.notes = interaction.fields.getTextInputValue("enc_note_value").trim();
        orderSessions.set(ch.id, order);
        await interaction.reply({ content: "Observacoes atualizadas.", flags: MessageFlags.Ephemeral });
        await refreshOrderBuilderMessage(ch, order);
        return;
      }

      if (id === "modal_encomenda") {
        const customerName = interaction.fields.getTextInputValue("enc_nome").trim();
        const gameId = interaction.fields.getTextInputValue("enc_id").trim();
        const phoneNumber = interaction.fields.getTextInputValue("enc_telefone").trim();
        const deliveryLocation = interaction.fields.getTextInputValue("enc_local").trim();
        const priceMode = "civil";

        await interaction.reply({ content: "Pedido recebido. Criando seu ticket de Encomenda...", flags: MessageFlags.Ephemeral });

        const ch = await createTicketChannel(
          interaction.guild,
          interaction.user,
          "encomenda",
          CATEGORY_ENCOMENDA_ID,
          "Encomenda"
        );

        const order = {
          userId: interaction.user.id,
          customerName,
          gameId,
          phoneNumber,
          deliveryLocation,
          priceMode,
          deliveryMode: "retirada",
          priority: "normal",
          paymentMethod: "dinheiro",
          notes: "",
          items: [],
          selectedItem: Object.keys(PRICE_TABLE)[0],
          selectedQty: 1
        };
        orderSessions.set(ch.id, order);

        await ch.send({
          content: `<@${interaction.user.id}>`,
          embeds: [buildEncomendaBuilderEmbed(order, interaction.user.id)],
          components: buildEncomendaBuilderComponents(order)
        });
        return;
      }

      if (id === "modal_duvidas") {
        const duvId = interaction.fields.getTextInputValue("duv_id").trim();
        const duvNome = interaction.fields.getTextInputValue("duv_nome").trim();
        const duvAssunto = interaction.fields.getTextInputValue("duv_assunto").trim();

        await interaction.reply({ content: "âœ… FormulÃ¡rio recebido. Criando seu ticket de **DÃºvidas**...", flags: MessageFlags.Ephemeral });

        const ch = await createTicketChannel(
          interaction.guild,
          interaction.user,
          "duvidas",
          CATEGORY_DUVIDAS_ID,
          "DÃºvidas"
        );

        const embed = new EmbedBuilder()
          .setColor(0x3B82F6)
          .setTitle("â“ DÃºvidas â€” FormulÃ¡rio")
          .addFields(
            { name: "ID", value: `\`${duvId}\``, inline: true },
            { name: "Nome", value: duvNome, inline: true },
            { name: "Assunto", value: duvAssunto }
          )
          .setFooter({ text: "Aguarde um responsÃ¡vel responder." });

        await ch.send({ embeds: [embed] });
        return;
      }

      if (id === "modal_denuncia") {
        const nome = interaction.fields.getTextInputValue("den_nome").trim();
        const uid = interaction.fields.getTextInputValue("den_id").trim();
        const denunciado = interaction.fields.getTextInputValue("den_denunciado").trim();
        const youtube = interaction.fields.getTextInputValue("den_youtube").trim();

        // validaÃ§Ã£o simples de link
        const okLink = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(youtube);

        if (!okLink) {
          return interaction.reply({
            content: "âŒ O link enviado nÃ£o parece ser do **YouTube**. Envie um link vÃ¡lido (youtube.com ou youtu.be).",
            flags: MessageFlags.Ephemeral
          });
        }

        await interaction.reply({ content: "âœ… DenÃºncia recebida. Criando seu ticket de **DenÃºncias**...", flags: MessageFlags.Ephemeral });

        const ch = await createTicketChannel(
          interaction.guild,
          interaction.user,
          "denuncia",
          CATEGORY_DENUNCIAS_ID,
          "DenÃºncias"
        );

        const embed = new EmbedBuilder()
          .setColor(0xEF4444)
          .setTitle("ðŸš¨ DenÃºncia â€” FormulÃ¡rio")
          .addFields(
            { name: "Seu nome", value: nome, inline: true },
            { name: "Seu ID", value: `\`${uid}\``, inline: true },
            { name: "Denunciado", value: denunciado },
            { name: "VÃ­deo (YouTube)", value: youtube }
          )
          .setFooter({ text: "Se necessÃ¡rio, envie mais detalhes/prints aqui." });

        await ch.send({ embeds: [embed] });
        return;
      }
    }
  } catch (err) {
    console.error("interactionCreate error:", err);
    if (interaction.isRepliable()) {
      try {
        await interaction.reply({ content: "âŒ Ocorreu um erro interno. Verifique os logs do bot.", flags: MessageFlags.Ephemeral });
      } catch {}
    }
  }
});

// Recrutamento: capturar respostas por mensagens
client.on("messageCreate", async (message) => {
  try {
    if (!message.guild || message.author.bot) return;

    const ch = message.channel;
    const session = getSession(ch.id);
    if (!session) return;
    if (message.author.id !== session.userId) return;

    if (Date.now() > session.deadline) {
      await ch.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xEF4444)
            .setTitle("Tempo esgotado")
            .setDescription("Voce nao respondeu dentro do tempo limite. O ticket sera apagado e voce podera tentar novamente.")
        ]
      });
      deleteSession(ch.id);
      setTimeout(() => safeDeleteChannel(ch), 4000);
      return;
    }

    const contentAnswer = message.content.trim();
    session.answers.push(contentAnswer);

    const currentIndex = session.index;
    const nextIndex = currentIndex + 1;
    const totalQuestions = session.totalQuestions || RECRUIT_QUESTIONS.length;

    if (nextIndex < totalQuestions) {
      session.index = nextIndex;
      setSession(ch.id, session);

      await ch.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xEAB308)
            .setTitle(`Pergunta ${nextIndex + 1}/${totalQuestions}`)
            .setDescription(formatRecruitQuestion(RECRUIT_QUESTIONS[nextIndex], nextIndex, totalQuestions))
        ]
      });
      return;
    }

    deleteSession(ch.id);

    await ch.permissionOverwrites.edit(message.author.id, {
      SendMessages: false,
      AttachFiles: false
    }).catch(() => {});

    const logChannel = await message.guild.channels.fetch(RECRUIT_LOG_CHANNEL_ID).catch(() => null);
    if (!logChannel) {
      await ch.send("Nao encontrei o canal de logs do recrutamento. Avise a lideranca.");
      return;
    }

    const reviewId = `${ch.id}-${Date.now()}`;
    pendingRecruitReviews.set(reviewId, {
      channelId: ch.id,
      userId: message.author.id,
      attempt: session.attempt,
      answers: [...session.answers]
    });

    const reviewSession = {
      ...session,
      channelId: ch.id
    };
    const embeds = buildRecruitAnswersEmbeds(reviewSession, message.author);

    await logChannel.send({
      content: `Novo recrutamento enviado por <@${message.author.id}>.`,
      embeds,
      components: [makeRecruitReviewButtons(reviewId)]
    });

    await ch.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x2563EB)
          .setTitle("Respostas enviadas")
          .setDescription("Seu formulario foi enviado para avaliacao. Aguarde a decisao de um recrutador neste ticket.")
      ]
    });
  } catch (err) {
    console.error("messageCreate error:", err);
  }
});

process.on("unhandledRejection", (err) => {
  if (err?.code === 10062) return;
  console.error("Unhandled Rejection:", err);
});

client.on("error", (err) => {
  if (err?.code === 10062) return;
  console.error("Discord client error:", err);
});

client.login(DISCORD_TOKEN);









