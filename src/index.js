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
  ROLE_PRE_APROVADO_ID
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
    return { panelMessageId: null, ticketCounter: 0, c4Daily: {} };
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
 * RECRUTAMENTO: Você vai colar as 20 perguntas aqui depois.
 * IMPORTANTE: Deixe EXATAMENTE 20 itens.
 */
const RECRUIT_QUESTIONS = [
  { q: "Nome completo no RP:", type: "text" },
  { q: "ID no jogo:", type: "text" },
  { q: "Idade real:", type: "text" },
  { q: "Nivel atual no servidor:", type: "level", min: 16 },
  { q: "Nick/usuario no Discord:", type: "text" },
  { q: "Possui microfone funcional?", type: "choice", valid: ["sim"] },
  {
    q: "Qual horario voce joga com mais frequencia?",
    type: "mcq",
    options: { a: "Manha", b: "Tarde", c: "Noite", d: "Madrugada" },
    correct: ["a", "b", "c", "d"]
  },
  { q: "Descreva-se em pelo menos tres palavras:", type: "minWords", min: 3 },
  {
    q: "O que e RDM?",
    type: "mcq",
    options: {
      a: "Matar sem motivo / sem contexto de RP",
      b: "Atropelar com carro em fuga",
      c: "Usar informacao de live",
      d: "Falar no Discord durante perseguicao"
    },
    correct: ["a"]
  },
  {
    q: "O que e VDM?",
    type: "mcq",
    options: {
      a: "Usar informacao OOC",
      b: "Matar com veiculo sem contexto",
      c: "Forcar acao impossivel",
      d: "Quebrar algema em animacao"
    },
    correct: ["b"]
  },
  {
    q: "Power Gaming significa:",
    type: "mcq",
    options: {
      a: "Usar carro como arma sem motivo",
      b: "Ignorar voz no radio",
      c: "Forcar acao irreal/impossivel no RP",
      d: "Ficar AFK em area neutra"
    },
    correct: ["c"]
  },
  {
    q: "Meta Gaming significa:",
    type: "mcq",
    options: {
      a: "Usar info de fora do RP no personagem",
      b: "Roubar banco sem plano",
      c: "Matar aliado no fogo cruzado",
      d: "Nao usar colete em acao"
    },
    correct: ["a"]
  },
  { q: "O que voce valoriza mais em faccao e por que?", type: "choiceText", valid: ["respeito", "lealdade", "disciplina"] },
  { q: "Como voce reage sob pressao em acao?", type: "keywords", valid: ["calmo", "tranquilo", "comunicacao", "foco"] },
  { q: "O que diferencia a Suica das outras faccoes?", type: "minWords", min: 5 },
  { q: "Ja participou de outra faccao? Qual e como foi sua saida?", type: "minWords", min: 5 },
  { q: "Por que quer entrar na Suica?", type: "minWords", min: 6 },
  { q: "Explique como voce trabalha em equipe:", type: "minWords", min: 6 },
  { q: "Se receber uma ordem com a qual nao concorda, como age?", type: "minWords", min: 6 },
  { q: "Esta disposto a seguir regras, hierarquia e disponibilidade?", type: "choice", valid: ["sim"] }
];

/**
 * Critério de aprovação:
 * - padrão: exige >= 70% (14/20) “aprováveis”
 * Como avaliar automaticamente RP é complexo, eu deixei um avaliador básico:
 * - Cada resposta precisa ter um tamanho mínimo (evita “sim/não”).
 * - Você pode adicionar palavras-chave por pergunta (opcional) depois.
 */
const PASS_THRESHOLD = 14; // 14/20 = 70%
const MIN_ANSWER_LEN = 18;
// ====== TABELA DE PREÇOS (Civil x Aliado/Parceria) ======
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
const DEFAULT_QTY_LIMIT = 999;
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
    .setFooter({ text: "Painel de encomenda • finalize quando estiver tudo correto" })
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

function isWeekdayInBrazil() {
  // 0=domingo, 6=sábado
  const now = new Date();
  const day = now.getDay();
  return day >= 0 && day <= 5;
}

function makePanelEmbed() {
  return new EmbedBuilder()
    .setColor(0xE11D2E) // vermelho suíça
    .setTitle("🇨🇭 Central de Atendimento — Suíça")
    .setDescription(
      [
        "**Abra seu ticket pelo botão correto:**",
        "• **Dúvidas** — suporte geral (formulário obrigatório).",
        "• **Encomenda** — pedidos/serviços.",
        "• **Recrutamento** — seleção RP (somente **segunda a sexta**).",
        "• **Denúncias** — envie evidências (YouTube).",
        "",
        "**Regras rápidas:**",
        "• Um ticket por assunto.",
        "• Mantenha respeito e objetividade.",
        "• Responder recrutamento dentro do tempo."
      ].join("\n")
    )
    .setFooter({ text: "Suíça • Sistema automático de tickets" });
}

function makePanelButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_duvidas")
      .setLabel("Dúvidas")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("❓"),
    new ButtonBuilder()
      .setCustomId("ticket_encomenda")
      .setLabel("Encomenda")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("📦"),
    new ButtonBuilder()
      .setCustomId("ticket_recrutamento")
      .setLabel("Recrutamento")
      .setStyle(ButtonStyle.Success)
      .setEmoji("📝"),
    new ButtonBuilder()
      .setCustomId("ticket_denuncia")
      .setLabel("Denúncias")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🚨")
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
    topic: `Ticket ${ticketNo} • ${kind} • usuário=${user.id}`
  });

  const header = new EmbedBuilder()
    .setColor(0xE11D2E)
    .setTitle(`🇨🇭 Ticket: ${titleSuffix}`)
    .setDescription(
      [
        `**Usuário:** <@${user.id}>`,
        `**ID do Ticket:** \`${ticketNo}\``,
        "",
        "**Use os botões abaixo para gerenciar.**"
      ].join("\n")
    );

  const controls = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_close")
      .setLabel("Fechar")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🔒"),
    new ButtonBuilder()
      .setCustomId("ticket_delete")
      .setLabel("Apagar")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🗑️")
  );

  await ch.send({ embeds: [header], components: [controls] });
  return ch;
}

function makeRecruitStartButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("rec_start")
      .setLabel("Começar Recrutamento")
      .setStyle(ButtonStyle.Success)
      .setEmoji("✅"),
    new ButtonBuilder()
      .setCustomId("rec_cancel")
      .setLabel("Cancelar")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("❌")
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
 * Sessões em memória:
 * recSessions[channelId] = { userId, startedAt, deadline, index, answers: [] }
 */
const recSessions = new Map();
const orderSessions = new Map();

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

function normalize(str) {
  return (str || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function countWords(str) {
  const clean = String(str || "").trim();
  if (!clean) return 0;
  return clean.split(/\s+/).length;
}

const AFFIRMATIVE_TERMS = ["sim", "ss", "yes", "claro", "com certeza", "positivo", "pode crer", "ok", "blz", "certeza"];
const NEGATIVE_TERMS = ["nao", "não", "n", "negativo", "jamais", "nunca"];

function tokenizeNormalized(str) {
  return normalize(str)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function expandRecruitTerms(terms = []) {
  const expanded = new Set();
  for (const term of terms) {
    const n = normalize(term);
    expanded.add(n);
    if (n.endsWith("s")) expanded.add(n.slice(0, -1));
    if (n.includes(" ")) {
      for (const part of n.split(" ").filter(Boolean)) expanded.add(part);
    }
    if (n === "sim") AFFIRMATIVE_TERMS.forEach((t) => expanded.add(normalize(t)));
    if (n === "nao" || n === "não") NEGATIVE_TERMS.forEach((t) => expanded.add(normalize(t)));
  }
  return [...expanded];
}

function hasAnyTerm(answerNormalized, terms = []) {
  if (!terms.length) return false;
  const tokens = tokenizeNormalized(answerNormalized);
  return terms.some((term) => {
    const t = normalize(term);
    if (!t) return false;
    if (answerNormalized.includes(t)) return true;
    return tokens.some((tk) => tk === t || (t.length >= 4 && tk.startsWith(t)));
  });
}

function inferQuestionHints(qText) {
  const q = normalize(qText || "");
  if (q.includes("rdm")) return ["matar sem motivo", "sem motivo", "sem contexto", "aleatorio", "sem rp"];
  if (q.includes("vdm")) return ["atropelar", "veiculo", "arma", "matar com carro", "usar carro"];
  if (q.includes("power gaming")) return ["forcar acao", "acao impossivel", "sem chance", "irreal"];
  if (q.includes("meta gaming")) return ["informacao de fora", "discord", "stream", "ooc", "fora do rp"];
  if (q.includes("trabalhar em equipe")) return ["equipe", "grupo", "comunicar", "ajudar", "coordenar"];
  return [];
}

function extractLevel(answer) {
  const match = normalize(answer).match(/\d+/);
  return match ? parseInt(match[0], 10) : NaN;
}

function gradeRecruitment(answers) {
  let score = 0;
  const details = [];

  RECRUIT_QUESTIONS.forEach((qObj, i) => {
    const rawAnswer = answers[i] || "";
    const answer = normalize(rawAnswer);
    const words = countWords(rawAnswer || "");
    const hints = inferQuestionHints(qObj.q);
    let ok = false;
    let reason = "nao atendeu criterio";

    switch (qObj.type) {

      case "text":
        ok = answer.length >= 4 && words >= 2;
        reason = ok ? "resposta textual valida" : "resposta curta";
        break;

      case "choice": {
        const validTerms = expandRecruitTerms(qObj.valid || []);
        const hasNegative = hasAnyTerm(answer, NEGATIVE_TERMS);
        ok = hasAnyTerm(answer, validTerms) && !hasNegative;
        reason = ok ? "confirmou criterio da pergunta" : "nao confirmou criterio";
        break;
      }

      case "choiceText": {
        const validTerms = expandRecruitTerms(qObj.valid || []);
        ok = hasAnyTerm(answer, validTerms) || (words >= 5 && hasAnyTerm(answer, hints));
        reason = ok ? "linha de raciocinio compativel" : "nao demonstrou o criterio esperado";
        break;
      }

      case "keywords": {
        const validTerms = expandRecruitTerms([...(qObj.valid || []), ...hints]);
        ok = hasAnyTerm(answer, validTerms) || words >= 8;
        reason = ok ? "identificou conceito-chave" : "faltaram conceitos-chave";
        break;
      }

      case "minWords": {
        const min = Number(qObj.min || 5);
        const semanticHint = hasAnyTerm(answer, hints);
        ok = words >= min || (words >= Math.max(3, min - 2) && semanticHint);
        reason = ok ? "resposta completa" : `resposta insuficiente (min ${min} palavras)`;
        break;
      }

      case "level": {
        const level = extractLevel(rawAnswer);
        ok = !isNaN(level) && level >= qObj.min;
        reason = ok ? `nivel ${level} dentro do minimo` : "nivel abaixo do minimo";
        break;
      }

      case "mcq": {
        const answerLetter = tokenizeNormalized(answer).find((t) => ["a", "b", "c", "d"].includes(t));
        const correctLetters = (qObj.correct || []).map((c) => normalize(c));
        const optionText = qObj.options || {};
        const byLetter = answerLetter && correctLetters.includes(answerLetter);
        const byText = correctLetters.some((letter) => {
          const txt = normalize(optionText[letter] || "");
          return txt && answer.includes(txt);
        });
        ok = Boolean(byLetter || byText);
        reason = ok ? "alternativa correta" : "alternativa incorreta";
        break;
      }

      default:
        ok = answer.length > 0;
        reason = ok ? "resposta recebida" : "sem resposta";
    }

    if (ok) score++;
    details.push({
      index: i + 1,
      question: qObj.q,
      answer: rawAnswer || "-",
      ok,
      reason
    });
  });

  const passed = score >= 14; // 70%
  return { passed, score, details };
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
  if (!panelChannel) return { ok: false, reason: "Canal do painel não encontrado." };

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
  // Opcional: tenta garantir painel ao iniciar (se o bot tiver permissão)
  // Comentado pra evitar spam se faltarem permissões.
  // await ensurePanel(client.guilds.cache.first());
});

client.on("interactionCreate", async (interaction) => {
  try {
    // Slash /setup
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "setup") {
        const r = await ensurePanel(interaction);
        if (!r.ok) {
          return interaction.reply({ content: `❌ Não consegui criar/atualizar o painel: ${r.reason}`, ephemeral: true });
        }
        return interaction.reply({ content: `✅ Painel configurado/atualizado com sucesso. (mensagem: ${r.messageId})`, ephemeral: true });
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
        return interaction.reply({ content: "Painel de encomenda expirado.", ephemeral: true });
      }
      if (interaction.user.id !== order.userId) {
        return interaction.reply({ content: "Somente o dono do pedido pode editar.", ephemeral: true });
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

    // Botões
    if (interaction.isButton()) {
      const { customId } = interaction;

      // Painel: abrir tickets
      if (customId === "ticket_duvidas") {
        const modal = new ModalBuilder()
          .setCustomId("modal_duvidas")
          .setTitle("Dúvidas — Formulário");

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
          .setLabel("Assunto da dúvida (explique)")
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
          .setTitle("Denúncia — Formulário");

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
          .setLabel("Link do vídeo no YouTube")
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
        // Só segunda a sexta
        if (!isWeekdayInBrazil()) {
          return interaction.reply({
            content: "⛔ **Recrutamento fechado no fim de semana.**\nVolte **segunda-feira** para abrir seu recrutamento.",
            ephemeral: true
          });
        }

        await interaction.reply({ content: "✅ Abrindo seu ticket de **Recrutamento**...", ephemeral: true });

        const ch = await createTicketChannel(
          interaction.guild,
          interaction.user,
          "recrutamento",
          CATEGORY_RECRUTAMENTO_ID,
          "Recrutamento"
        );

        const intro = new EmbedBuilder()
          .setColor(0x22C55E)
          .setTitle("📝 Recrutamento Suíça — Etapa 1 (Automática)")
          .setDescription(
            [
              "**Como funciona:**",
              "• Clique em **Começar Recrutamento**.",
              "• Você terá **15 minutos** para responder **20 perguntas**.",
              "• Responda com atenção. Respostas vazias/curtas podem reprovar.",
              "",
              "**Ao final:**",
              "• Se aprovado: você recebe **Pré-aprovado**, e será informado da **2ª etapa no privado**.",
              "• Se reprovado: o ticket será apagado e você poderá tentar novamente (2ª chance)."
            ].join("\n")
          )
          .setFooter({ text: "Suíça • Recrutamento automatizado" });

        await ch.send({ content: `<@${interaction.user.id}>`, embeds: [intro], components: [makeRecruitStartButtons()] });
        return;
      }

      if (customId === "enc_add_item") {
        const ch = interaction.channel;
        if (!ch) return;
        const order = orderSessions.get(ch.id);
        if (!order) {
          return interaction.reply({ content: "Painel de encomenda expirado.", ephemeral: true });
        }
        if (interaction.user.id !== order.userId) {
          return interaction.reply({ content: "Somente o dono do pedido pode editar.", ephemeral: true });
        }
        const existingItem = order.items.find((x) => x.name === order.selectedItem);
        if (!existingItem && order.items.length >= MAX_DISTINCT_ITEMS) {
          return interaction.reply({ content: `Limite: no maximo ${MAX_DISTINCT_ITEMS} itens diferentes.`, ephemeral: true });
        }

        const nextQty = (existingItem?.qty || 0) + order.selectedQty;
        if (order.selectedItem === "C4" && nextQty > C4_DAILY_LIMIT) {
          return interaction.reply({ content: `C4 permite no maximo ${C4_DAILY_LIMIT} unidades por pedido.`, ephemeral: true });
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
          return interaction.reply({ content: "Painel de encomenda expirado.", ephemeral: true });
        }
        if (interaction.user.id !== order.userId) {
          return interaction.reply({ content: "Somente o dono do pedido pode editar.", ephemeral: true });
        }

        const nextItems = order.items.filter((x) => x.name !== order.selectedItem);
        if (nextItems.length === order.items.length) {
          return interaction.reply({ content: `${order.selectedItem} nao esta no carrinho.`, ephemeral: true });
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
          return interaction.reply({ content: "Painel de encomenda expirado.", ephemeral: true });
        }
        if (interaction.user.id !== order.userId) {
          return interaction.reply({ content: "Somente o dono do pedido pode editar.", ephemeral: true });
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
          return interaction.reply({ content: "Painel de encomenda expirado.", ephemeral: true });
        }
        if (interaction.user.id !== order.userId) {
          return interaction.reply({ content: "Somente o dono do pedido pode editar.", ephemeral: true });
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
          return interaction.reply({ content: "Painel de encomenda expirado.", ephemeral: true });
        }
        if (interaction.user.id !== order.userId) {
          return interaction.reply({ content: "Somente o dono do pedido pode editar.", ephemeral: true });
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
          return interaction.reply({ content: "Painel de encomenda expirado.", ephemeral: true });
        }
        if (interaction.user.id !== order.userId) {
          return interaction.reply({ content: "Somente o dono do pedido pode editar.", ephemeral: true });
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
          return interaction.reply({ content: "Painel de encomenda expirado.", ephemeral: true });
        }
        if (interaction.user.id !== order.userId) {
          return interaction.reply({ content: "Somente o dono do pedido pode finalizar.", ephemeral: true });
        }
        if (!order.items.length) {
          return interaction.reply({ content: "Adicione pelo menos 1 item antes de finalizar.", ephemeral: true });
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
              ephemeral: true
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
          .setFooter({ text: "Suica • Encomendas • Assumir / Marcar Pronto / Fechar" })
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
          return interaction.reply({ content: "Painel de encomenda expirado.", ephemeral: true });
        }
        if (interaction.user.id !== order.userId && !interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageChannels)) {
          return interaction.reply({ content: "Somente o dono do pedido pode cancelar.", ephemeral: true });
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
          return interaction.reply({ content: "Voce nao tem permissao para assumir encomendas.", ephemeral: true });
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
        return interaction.reply({ content: "Encomenda assumida com sucesso.", ephemeral: true });
      }

      if (customId === "enc_pronto_adm") {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageChannels)) {
          return interaction.reply({ content: "Voce nao tem permissao para marcar encomendas como prontas.", ephemeral: true });
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

        const topic = ch.topic || "";
        const match = topic.match(/usu.rio=(\d+)/);
        const userId = match ? match[1] : null;

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

        return interaction.reply({ content: "Encomenda marcada como pronta e ticket bloqueado para o cliente.", ephemeral: true });
      }

      // Controles gerais de ticket
      if (customId === "ticket_close") {
        // “Fechar”: trava envio do usuário (mantém leitura)
        const ch = interaction.channel;
        if (!ch || ch.type !== ChannelType.GuildText) return;

        const topic = ch.topic || "";
        const match = topic.match(/usuário=(\d+)/);
        const userId = match ? match[1] : null;

        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageChannels)) {
          return interaction.reply({ content: "❌ Você não tem permissão para fechar tickets.", ephemeral: true });
        }

        if (userId) {
          await ch.permissionOverwrites.edit(userId, {
            SendMessages: false,
            AttachFiles: false
          }).catch(() => {});
        }

        await interaction.reply({ content: "🔒 Ticket **fechado** (usuário não pode mais enviar mensagens).", ephemeral: true });
        orderSessions.delete(ch.id);
        return;
      }

      if (customId === "ticket_delete") {
        const ch = interaction.channel;
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageChannels)) {
          return interaction.reply({ content: "❌ Você não tem permissão para apagar tickets.", ephemeral: true });
        }
        await interaction.reply({ content: "🗑️ Apagando ticket...", ephemeral: true });
        deleteSession(ch.id);
        orderSessions.delete(ch.id);
        await safeDeleteChannel(ch);
        return;
      }

      // Recrutamento: iniciar/cancelar
      if (customId === "rec_cancel") {
        const ch = interaction.channel;
        if (!ch) return;

        // Só o dono do ticket ou staff (ManageChannels)
        const isStaff = interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageChannels);
        const topic = ch.topic || "";
        const match = topic.match(/usuário=(\d+)/);
        const ownerId = match ? match[1] : null;

        if (!isStaff && interaction.user.id !== ownerId) {
          return interaction.reply({ content: "❌ Você não pode cancelar o recrutamento de outra pessoa.", ephemeral: true });
        }

        await interaction.reply({ content: "❌ Recrutamento cancelado. Apagando ticket...", ephemeral: true });
        deleteSession(ch.id);
        orderSessions.delete(ch.id);
        await safeDeleteChannel(ch);
        return;
      }

      if (customId === "rec_start") {
        const ch = interaction.channel;
        if (!ch) return;

        // valida dono
        const topic = ch.topic || "";
        const match = topic.match(/usuário=(\d+)/);
        const ownerId = match ? match[1] : null;

        if (interaction.user.id !== ownerId) {
          return interaction.reply({ content: "❌ Apenas o dono do ticket pode iniciar o recrutamento.", ephemeral: true });
        }

        if (!isWeekdayInBrazil()) {
          return interaction.reply({
            content: "⛔ **Recrutamento fechado no fim de semana.** Volte **segunda-feira**.",
            ephemeral: true
          });
        }

        // Previne iniciar duas vezes
        if (getSession(ch.id)) {
          return interaction.reply({ content: "⚠️ O recrutamento já foi iniciado neste ticket.", ephemeral: true });
        }

        // Confere 20 perguntas
        const totalQuestions = Array.isArray(RECRUIT_QUESTIONS) ? RECRUIT_QUESTIONS.length : 0;
        if (totalQuestions < 10) {
          return interaction.reply({
            content: "? ERRO: O array RECRUIT_QUESTIONS esta invalido.",
            ephemeral: true
          });
        }

        const startedAt = Date.now();
        const deadline = startedAt + 15 * 60 * 1000;

        setSession(ch.id, {
          userId: interaction.user.id,
          startedAt,
          deadline,
          totalQuestions,
          index: 0,
          answers: []
        });

        await interaction.reply({
          content: "✅ **Recrutamento iniciado!** Você tem **15 minutos**.\nVou enviar a **Pergunta 1** agora.",
          ephemeral: true
        });

        await ch.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0x22C55E)
              .setTitle("⏳ Cronômetro iniciado: 15 minutos")
              .setDescription("Responda **neste canal**. Uma pergunta por vez.")
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

        await interaction.reply({ content: "Pedido recebido. Criando seu ticket de Encomenda...", ephemeral: true });

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

        await interaction.reply({ content: "✅ Formulário recebido. Criando seu ticket de **Dúvidas**...", ephemeral: true });

        const ch = await createTicketChannel(
          interaction.guild,
          interaction.user,
          "duvidas",
          CATEGORY_DUVIDAS_ID,
          "Dúvidas"
        );

        const embed = new EmbedBuilder()
          .setColor(0x3B82F6)
          .setTitle("❓ Dúvidas — Formulário")
          .addFields(
            { name: "ID", value: `\`${duvId}\``, inline: true },
            { name: "Nome", value: duvNome, inline: true },
            { name: "Assunto", value: duvAssunto }
          )
          .setFooter({ text: "Aguarde um responsável responder." });

        await ch.send({ embeds: [embed] });
        return;
      }

      if (id === "modal_denuncia") {
        const nome = interaction.fields.getTextInputValue("den_nome").trim();
        const uid = interaction.fields.getTextInputValue("den_id").trim();
        const denunciado = interaction.fields.getTextInputValue("den_denunciado").trim();
        const youtube = interaction.fields.getTextInputValue("den_youtube").trim();

        // validação simples de link
        const okLink = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(youtube);

        if (!okLink) {
          return interaction.reply({
            content: "❌ O link enviado não parece ser do **YouTube**. Envie um link válido (youtube.com ou youtu.be).",
            ephemeral: true
          });
        }

        await interaction.reply({ content: "✅ Denúncia recebida. Criando seu ticket de **Denúncias**...", ephemeral: true });

        const ch = await createTicketChannel(
          interaction.guild,
          interaction.user,
          "denuncia",
          CATEGORY_DENUNCIAS_ID,
          "Denúncias"
        );

        const embed = new EmbedBuilder()
          .setColor(0xEF4444)
          .setTitle("🚨 Denúncia — Formulário")
          .addFields(
            { name: "Seu nome", value: nome, inline: true },
            { name: "Seu ID", value: `\`${uid}\``, inline: true },
            { name: "Denunciado", value: denunciado },
            { name: "Vídeo (YouTube)", value: youtube }
          )
          .setFooter({ text: "Se necessário, envie mais detalhes/prints aqui." });

        await ch.send({ embeds: [embed] });
        return;
      }
    }
  } catch (err) {
    console.error("interactionCreate error:", err);
    if (interaction.isRepliable()) {
      try {
        await interaction.reply({ content: "❌ Ocorreu um erro interno. Verifique os logs do bot.", ephemeral: true });
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

    // Só o dono do recrutamento pode responder
    if (message.author.id !== session.userId) return;

    // Timeout
    if (Date.now() > session.deadline) {
      await ch.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xEF4444)
            .setTitle("⛔ Tempo esgotado")
            .setDescription("Você não respondeu dentro de **15 minutos**. O ticket será apagado e você pode tentar novamente.")
        ]
      });
      deleteSession(ch.id);
      setTimeout(() => safeDeleteChannel(ch), 4000);
      return;
    }

    // guarda resposta
    const content = message.content.trim();
    session.answers.push(content);

    const currentIndex = session.index;
    const nextIndex = currentIndex + 1;
    const totalQuestions = session.totalQuestions || RECRUIT_QUESTIONS.length;

    // avançar
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

    // finalizou 20 respostas
    deleteSession(ch.id);

    const { passed, score, details } = gradeRecruitment(session.answers);
    const memberProfile = await message.guild.members.fetch(message.author.id).catch(() => null);
    const nick = memberProfile?.nickname || memberProfile?.displayName || "-";

    // Log profissional e organizado
    const logChannel = await message.guild.channels.fetch(RECRUIT_LOG_CHANNEL_ID).catch(() => null);
    if (logChannel) {
      const summary = new EmbedBuilder()
        .setColor(passed ? 0x16A34A : 0xDC2626)
        .setTitle(passed ? "Recrutamento - Aprovado" : "Recrutamento - Reprovado")
        .addFields(
          { name: "Candidato", value: `<@${message.author.id}>`, inline: true },
          { name: "Tag", value: `\`${message.author.tag}\``, inline: true },
          { name: "Nick no servidor", value: nick, inline: true },
          { name: "ID Discord", value: `\`${message.author.id}\``, inline: true },
          { name: "Canal", value: `<#${ch.id}>`, inline: true },
          { name: "Resultado", value: `**${passed ? "Aprovado" : "Reprovado"}**`, inline: true },
          { name: "Pontuacao", value: `**${score}/${session.totalQuestions || RECRUIT_QUESTIONS.length}**`, inline: true },
          { name: "Aproveitamento", value: `**${Math.round((score / (session.totalQuestions || RECRUIT_QUESTIONS.length)) * 100)}%**`, inline: true }
        )
        .setTimestamp();

      await logChannel.send({ embeds: [summary] });

      const perEmbed = 4;
      for (let i = 0; i < details.length; i += perEmbed) {
        const chunk = details.slice(i, i + perEmbed);
        const embed = new EmbedBuilder()
          .setColor(0x1F2937)
          .setTitle(`Respostas ${i + 1}-${Math.min(i + perEmbed, details.length)}`);

        for (const d of chunk) {
          const status = d.ok ? "CORRETA" : "ERRADA";
          embed.addFields({
            name: `Q${String(d.index).padStart(2, "0")} - ${status}`,
            value: [
              `**Pergunta:** ${truncateForEmbed(d.question, 140)}`,
              `**Resposta:** ${truncateForEmbed(d.answer, 160)}`,
              `**Analise:** ${d.reason}`
            ].join("\n"),
            inline: false
          });
        }

        await logChannel.send({ embeds: [embed] });
      }
    }

    if (!passed) {
      await ch.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xEF4444)
            .setTitle("❌ Reprovado")
            .setDescription(
              [
                `Sua pontuação foi **${score}/20**.`,
                "",
                "**Este ticket será apagado agora.**",
                "Você pode tentar novamente para sua **segunda chance**."
              ].join("\n")
            )
        ]
      });

      // apaga ticket
      setTimeout(() => safeDeleteChannel(ch), 4000);
      return;
    }

    // aprovado: da cargo de pre-aprovado automaticamente
    const member = memberProfile;
    let preRoleAdded = false;

    if (member) {
      if (ROLE_VISITANTE_ID) {
        await member.roles.remove(ROLE_VISITANTE_ID).catch(() => {});
      }

      if (ROLE_PRE_APROVADO_ID) {
        preRoleAdded = await member.roles.add(ROLE_PRE_APROVADO_ID).then(() => true).catch(() => false);
      }
    }

    // Ticket aprovado: renomeia e move para categoria de aprovados
    try {
      const topic = ch.topic || "";
      const ticketNo = (topic.match(/Ticket\\s*(\\d+)/i) || [null, "0000"])[1];
      const approvedName = `aprovado-${ticketNo}-${sanitizeChannelName(message.author.username)}`.slice(0, 95);
      await ch.setName(approvedName).catch(() => {});
      if (CATEGORY_RECRUTAMENTO_APROVADOS_ID) {
        await ch.setParent(CATEGORY_RECRUTAMENTO_APROVADOS_ID).catch(() => {});
      }
    } catch {}

    await ch.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x22C55E)
          .setTitle("✅ Aprovado — Parabéns!")
          .setDescription(
            [
              `Pontuação: **${score}/20**`,
              "",
              preRoleAdded ? "Voce recebeu o cargo **Pre-aprovado** e avancou para a **2a etapa**." : "Voce foi aprovado, mas o cargo **Pre-aprovado** nao foi aplicado automaticamente.",
              "**Verifique sua DM** agora."
            ].join("\n")
          )
      ]
    });

    await message.author.send(
      [
        "🇨🇭 **Suíça — Recrutamento**",
        "",
        "✅ Você foi **aprovado** na **Etapa 1**.",
        "📩 **Próximo passo (Etapa 2):** aguarde instruções de um responsável ou siga o procedimento definido pela liderança.",
        "",
        "Se sua DM estiver fechada, abra e avise no ticket."
      ].join("\n")
    ).catch(async () => {
      await ch.send("⚠️ Não consegui te mandar DM (provavelmente fechada). Abra a DM e avise aqui.");
    });

  } catch (err) {
    console.error("messageCreate error:", err);
  }
});

client.login(DISCORD_TOKEN);














