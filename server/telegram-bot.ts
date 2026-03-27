import TelegramBot from "node-telegram-bot-api";
import { storage } from "./storage";

const ADMIN_USERNAME = "fwsports0";

function isAdmin(username?: string): boolean {
  return !!username && username.toLowerCase() === ADMIN_USERNAME.toLowerCase();
}

function escapeMd(text: string): string {
  return text.replace(/[_*[\]`]/g, (ch) => `\\${ch}`);
}

let bot: TelegramBot | null = null;
let adminChatId: number | null = null;
let groupChatId: number | null = null;

// Mapa de clientes aguardando envio da chave PIX: chatId -> betId
const awaitingPix: Record<string, string> = {};

// Destino de notificações: grupo tem prioridade, senão vai para o chat privado do admin
function notifyTarget(): number | null {
  return groupChatId ?? adminChatId;
}

async function linkBetToChat(chatId: number, code: string): Promise<void> {
  const allBets = await storage.getAllBetSlips();
  const bet = allBets.find(b => b.id.toLowerCase().startsWith(code));

  if (!bet) {
    await bot!.sendMessage(chatId,
      `❌ Bilhete \`${code.toUpperCase()}\` não encontrado.\n\nVerifique o código e tente novamente.`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  if (bet.verified) {
    await bot!.sendMessage(chatId,
      `✅ *Bilhete já verificado!*\n\n` +
      `🎫 Código: \`${bet.id.slice(0, 8).toUpperCase()}\`\n` +
      `💰 Valor: R$ ${bet.stake.toFixed(2)}\n` +
      `🎯 Retorno: R$ ${bet.potentialWin.toFixed(2)}\n\n` +
      `Seu bilhete está ativo! Boa sorte! 🍀`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  await storage.updateBetSlipTelegramChatId(bet.id, chatId.toString());
  console.log(`[Bot] chatId ${chatId} vinculado ao bilhete ${bet.id}`);

  await bot!.sendMessage(chatId,
    `🎫 *Bilhete Encontrado!*\n\n` +
    `Código: \`${bet.id.slice(0, 8).toUpperCase()}\`\n` +
    `💰 Valor a pagar: *R$ ${bet.stake.toFixed(2)}*\n` +
    `🎯 Retorno potencial: R$ ${bet.potentialWin.toFixed(2)}\n\n` +
    `📸 *Agora envie uma foto do comprovante PIX* para confirmar o pagamento.`,
    { parse_mode: "Markdown" }
  );
}

async function handleUpdate(update: TelegramBot.Update): Promise<void> {
  if (!bot) return;

  const msg = update.message;
  if (!msg) return;

  const chatId = msg.chat.id;
  const username = msg.from?.username;
  const text = msg.text || "";

  console.log(`[Bot] Mensagem recebida de @${username || "desconhecido"} (${chatId}): "${text.slice(0, 80)}"`);

  // /start
  if (text.match(/^\/start ?(.*)$/)) {
    const betCodeParam = text.replace(/^\/start ?/, "").trim().toLowerCase();

    if (isAdmin(username)) {
      adminChatId = chatId;
      storage.setSetting("admin_chat_id", chatId.toString()).catch((err) => {
        console.error("[Bot] Erro ao salvar adminChatId no banco:", err);
      });
      await bot.sendMessage(chatId,
        `🔐 *Olá Admin!*\n\n` +
        `Você está configurado como administrador.\n\n` +
        `*Comandos disponíveis:*\n` +
        `📋 /pendentes - Ver bilhetes pendentes de verificação\n` +
        `✅ /verificar [código] - Marcar bilhete como verificado/pago\n` +
        `📊 /status - Ver estatísticas\n\n` +
        `Você receberá notificações quando usuários enviarem comprovantes.`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    if (betCodeParam) {
      try {
        await linkBetToChat(chatId, betCodeParam);
      } catch (error) {
        console.error("Erro ao buscar bilhete:", error);
        await bot.sendMessage(chatId, "❌ Erro ao buscar bilhete. Tente novamente.");
      }
      return;
    }

    await bot.sendMessage(chatId,
      `🎰 *FW Sports - Verificação de Pagamento*\n\n` +
      `Para verificar seu pagamento:\n\n` +
      `1️⃣ Envie o *código do bilhete* (ex: ABC12345)\n` +
      `2️⃣ Envie uma *foto do comprovante PIX*\n\n` +
      `Aguarde a confirmação do administrador.`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  // /pendentes (ou /verificar sem código)
  if (text.match(/^\/pendentes$/) || text.match(/^\/verificar$/)) {
    if (!isAdmin(username)) {
      await bot.sendMessage(chatId, "❌ Comando disponível apenas para administradores.");
      return;
    }
    try {
      const allBets = await storage.getAllBetSlips();
      const pendingVerification = allBets.filter(b => !b.verified && b.status === "pending");

      if (pendingVerification.length === 0) {
        await bot.sendMessage(chatId, "✅ Nenhum bilhete pendente de verificação.");
        return;
      }

      const shown = pendingVerification.slice(0, 10);

      // Um botão por bilhete na inline keyboard
      const inlineKeyboard = shown.map(bet => {
        const date = new Date(bet.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
        return [{
          text: `✅ ${bet.id.slice(0, 8).toUpperCase()} — R$ ${bet.stake.toFixed(2)} (${date})`,
          callback_data: `verificar:${bet.id.slice(0, 8).toLowerCase()}`
        }];
      });

      let message = `📋 *Bilhetes Pendentes (${pendingVerification.length})*\n\n`;
      for (const bet of shown) {
        const date = new Date(bet.createdAt).toLocaleString("pt-BR");
        message += `🎫 \`${bet.id.slice(0, 8).toUpperCase()}\` — R$ ${bet.stake.toFixed(2)} → R$ ${bet.potentialWin.toFixed(2)}\n`;
        message += `   📅 ${date}\n\n`;
      }

      if (pendingVerification.length > 10) {
        message += `_... e mais ${pendingVerification.length - 10} bilhetes_\n`;
      }

      await bot.sendMessage(chatId, message, {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: inlineKeyboard }
      });
    } catch (error) {
      console.error("Erro ao buscar bilhetes pendentes:", error);
      await bot.sendMessage(chatId, "❌ Erro ao buscar bilhetes pendentes.");
    }
    return;
  }

  // /verificar <código> — mostra detalhes do bilhete com botão de confirmação
  const verificarMatch = text.match(/^\/verificar\s+(.+)$/);
  if (verificarMatch) {
    if (!isAdmin(username)) {
      await bot.sendMessage(chatId, "❌ Comando disponível apenas para administradores.");
      return;
    }

    const code = verificarMatch[1].trim().toLowerCase();
    console.log(`[Bot] Admin @${username} buscou bilhete: "${code}"`);

    try {
      const allBets = await storage.getAllBetSlips();
      const bet = allBets.find(b => b.id.toLowerCase().startsWith(code));

      if (!bet) {
        await bot.sendMessage(chatId, `❌ Bilhete com código \`${code.toUpperCase()}\` não encontrado.`, { parse_mode: "Markdown" });
        return;
      }

      if (bet.verified) {
        await bot.sendMessage(chatId, `⚠️ Bilhete \`${bet.id.slice(0, 8).toUpperCase()}\` já está verificado!`, { parse_mode: "Markdown" });
        return;
      }

      // Mostrar detalhes com botão de confirmação
      const date = new Date(bet.createdAt).toLocaleString("pt-BR");
      await bot.sendMessage(chatId,
        `🎫 *Detalhes do Bilhete*\n\n` +
        `Código: \`${bet.id.slice(0, 8).toUpperCase()}\`\n` +
        `💰 Valor: R$ ${bet.stake.toFixed(2)}\n` +
        `🎯 Retorno potencial: R$ ${bet.potentialWin.toFixed(2)}\n` +
        `📅 Criado: ${date}\n\n` +
        `Clique no botão para verificar:`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [[{
              text: "✅ Verificar Bilhete",
              callback_data: `verificar:${bet.id.slice(0, 8).toLowerCase()}`
            }]]
          }
        }
      );
    } catch (error) {
      console.error("Erro ao buscar bilhete:", error);
      await bot.sendMessage(chatId, "❌ Erro ao buscar bilhete.");
    }
    return;
  }

  // /status
  if (text.match(/^\/status$/)) {
    if (!isAdmin(username)) {
      await bot.sendMessage(chatId, "❌ Comando disponível apenas para administradores.");
      return;
    }
    try {
      const allBets = await storage.getAllBetSlips();
      const verified = allBets.filter(b => b.verified);
      const pending = allBets.filter(b => !b.verified);
      const won = allBets.filter(b => b.status === "won");
      const lost = allBets.filter(b => b.status === "lost");
      const totalStake = allBets.reduce((sum, b) => sum + b.stake, 0);
      const verifiedStake = verified.reduce((sum, b) => sum + b.stake, 0);

      await bot.sendMessage(chatId,
        `📊 *Estatísticas do Sistema*\n\n` +
        `📝 Total de bilhetes: ${allBets.length}\n` +
        `✅ Verificados/Pagos: ${verified.length}\n` +
        `⏳ Pendentes verificação: ${pending.length}\n\n` +
        `🏆 Ganhos: ${won.length}\n` +
        `❌ Perdidos: ${lost.length}\n\n` +
        `💰 Total apostado: R$ ${totalStake.toFixed(2)}\n` +
        `💵 Valor verificado: R$ ${verifiedStake.toFixed(2)}`,
        { parse_mode: "Markdown" }
      );
    } catch (error) {
      console.error("Erro ao buscar status:", error);
      await bot.sendMessage(chatId, "❌ Erro ao buscar estatísticas.");
    }
    return;
  }

  // /setgrupo — registra o grupo atual como destino de notificações
  if (text.match(/^\/setgrupo$/)) {
    if (!isAdmin(username)) {
      await bot.sendMessage(chatId, "❌ Apenas o administrador pode configurar o grupo.");
      return;
    }
    const chatType = msg.chat.type;
    if (chatType === "private") {
      await bot.sendMessage(chatId, "❌ Use este comando dentro de um grupo, não no chat privado.");
      return;
    }
    groupChatId = chatId;
    await storage.setSetting("group_chat_id", chatId.toString()).catch(() => {});
    await bot.sendMessage(chatId,
      `✅ *Grupo configurado com sucesso!*\n\n` +
      `Todas as notificações de comprovantes serão enviadas aqui.\n` +
      `Os comandos continuam funcionando tanto aqui quanto no chat privado.`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  // /ganhou <código> — notifica cliente que ganhou e pede chave PIX
  const ganhouMatch = text.match(/^\/ganhou\s+(.+)$/);
  if (ganhouMatch) {
    if (!isAdmin(username)) {
      await bot.sendMessage(chatId, "❌ Comando disponível apenas para administradores.");
      return;
    }
    const code = ganhouMatch[1].trim().toLowerCase();
    try {
      const allBets = await storage.getAllBetSlips();
      const bet = allBets.find(b => b.id.toLowerCase().startsWith(code));
      if (!bet) {
        await bot.sendMessage(chatId, `❌ Bilhete \`${code.toUpperCase()}\` não encontrado.`, { parse_mode: "Markdown" });
        return;
      }
      if (!bet.telegramChatId) {
        await bot.sendMessage(chatId, `⚠️ Bilhete \`${bet.id.slice(0, 8).toUpperCase()}\` não possui chat vinculado. O cliente precisa ter interagido com o bot.`, { parse_mode: "Markdown" });
        return;
      }
      const clientChatId = parseInt(bet.telegramChatId, 10);
      const token = process.env.TELEGRAM_BOT_TOKEN!;
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: clientChatId,
          text:
            `🏆 *Parabéns! Você ganhou!*\n\n` +
            `🎫 Bilhete: \`${bet.id.slice(0, 8).toUpperCase()}\`\n` +
            `💰 Valor apostado: R$ ${bet.stake.toFixed(2)}\n` +
            `🎯 Retorno: *R$ ${bet.potentialWin.toFixed(2)}*\n\n` +
            `Para receber seu pagamento, *envie sua chave PIX* (CPF, e-mail, telefone ou chave aleatória):`,
          parse_mode: "Markdown",
        }),
      });
      awaitingPix[bet.telegramChatId] = bet.id;
      await bot.sendMessage(chatId, `✅ Mensagem de ganho enviada para o cliente do bilhete \`${bet.id.slice(0, 8).toUpperCase()}\`.\nAguardando chave PIX do cliente.`, { parse_mode: "Markdown" });
    } catch (error) {
      console.error("Erro ao enviar mensagem de ganho:", error);
      await bot.sendMessage(chatId, "❌ Erro ao enviar mensagem. Tente novamente.");
    }
    return;
  }

  // Comando desconhecido iniciado com /
  if (text.startsWith("/")) {
    if (isAdmin(username)) {
      await bot.sendMessage(chatId,
        "❌ Comando desconhecido. Comandos disponíveis:\n" +
        "/pendentes — bilhetes aguardando verificação\n" +
        "/verificar [código] — verificar bilhete\n" +
        "/ganhou [código] — notificar cliente vencedor\n" +
        "/status — estatísticas\n" +
        "/setgrupo — configurar grupo de notificações"
      );
    }
    return;
  }

  // Mensagem de texto comum de cliente
  if (isAdmin(username)) return;

  const chatIdStr = chatId.toString();

  // Cliente está aguardando envio da chave PIX (após /ganhou)
  if (awaitingPix[chatIdStr]) {
    const betId = awaitingPix[chatIdStr];
    delete awaitingPix[chatIdStr];
    const pixKey = text.trim();

    try {
      const allBets = await storage.getAllBetSlips();
      const bet = allBets.find(b => b.id === betId);
      const token = process.env.TELEGRAM_BOT_TOKEN!;

      // Encaminhar chave PIX ao grupo (ou admin)
      const target = notifyTarget();
      if (target) {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: target,
            text:
              `💳 *CHAVE PIX RECEBIDA*\n\n` +
              `🎫 Bilhete: \`${betId.slice(0, 8).toUpperCase()}\`\n` +
              `👤 Usuário: @${escapeMd(username || "desconhecido")}\n` +
              (bet ? `🎯 Valor a pagar: *R$ ${bet.potentialWin.toFixed(2)}*\n` : "") +
              `🔑 Chave PIX: \`${escapeMd(pixKey)}\``,
            parse_mode: "Markdown",
          }),
        });
      }

      // Confirmar para o cliente
      await bot.sendMessage(chatId,
        `✅ *Chave PIX recebida com sucesso!*\n\n` +
        (bet ? `💰 Pagamento de *R$ ${bet.potentialWin.toFixed(2)}* será processado em breve.\n\n` : "") +
        `Obrigado por jogar na FW Sports! 🏆`,
        { parse_mode: "Markdown" }
      );
    } catch (error) {
      console.error("Erro ao processar chave PIX:", error);
      await bot.sendMessage(chatId, "❌ Erro ao registrar sua chave PIX. Tente novamente.");
    }
    return;
  }

  // Código de bilhete
  try {
    await linkBetToChat(chatId, text.trim().toLowerCase());
  } catch (error) {
    console.error("Erro ao buscar bilhete:", error);
    await bot.sendMessage(chatId, "❌ Erro ao buscar bilhete. Tente novamente.");
  }
}

async function handlePhotoUpdate(update: TelegramBot.Update): Promise<void> {
  if (!bot) return;

  const msg = update.message;
  if (!msg?.photo) return;

  const chatId = msg.chat.id;
  const username = msg.from?.username || "Usuário";
  const safeUsername = escapeMd(username);

  if (isAdmin(msg.from?.username)) return;

  console.log(`[Bot] Foto recebida de @${username} (${chatId})`);

  try {
    const allBets = await storage.getAllBetSlips();
    const bet = allBets.find(b => b.telegramChatId === chatId.toString() && !b.verified);

    if (!bet) {
      await bot.sendMessage(chatId,
        `⚠️ Primeiro envie o *código do bilhete* antes de enviar o comprovante.`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    await bot.sendMessage(chatId,
      `✅ *Comprovante Recebido!*\n\n` +
      `🎫 Bilhete: \`${bet.id.slice(0, 8).toUpperCase()}\`\n` +
      `💰 Valor: R$ ${bet.stake.toFixed(2)}\n\n` +
      `⏳ Aguarde a verificação do administrador.\n` +
      `Você receberá uma confirmação em breve!`,
      { parse_mode: "Markdown" }
    );

    const target = notifyTarget();
    if (target && msg.photo) {
      const photo = msg.photo[msg.photo.length - 1];
      const betCode = bet.id.slice(0, 8).toLowerCase();
      await bot.sendPhoto(target, photo.file_id, {
        caption:
          `🆕 *NOVO COMPROVANTE RECEBIDO*\n\n` +
          `👤 Usuário: @${safeUsername}\n` +
          `🎫 Bilhete: \`${bet.id.slice(0, 8).toUpperCase()}\`\n` +
          `💰 Valor: R$ ${bet.stake.toFixed(2)}\n` +
          `🎯 Retorno: R$ ${bet.potentialWin.toFixed(2)}`,
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[
            {
              text: "✅ Verificar Bilhete",
              callback_data: `verificar:${betCode}`
            }
          ]]
        }
      });
      console.log(`[Bot] Destino ${target} notificado sobre comprovante do bilhete ${bet.id}`);
    } else {
      console.warn(`[Bot] Nenhum destino configurado — comprovante recebido mas não encaminhado. Use /setgrupo no grupo ou /start no chat privado.`);
    }
  } catch (error) {
    console.error("Erro ao processar comprovante:", error);
    await bot!.sendMessage(chatId, "❌ Erro ao processar comprovante. Tente novamente.");
  }
}

async function handleCallbackQuery(update: TelegramBot.Update): Promise<void> {
  if (!bot) return;
  const cb = update.callback_query;
  if (!cb) return;

  const chatId = cb.message?.chat.id;
  const messageId = cb.message?.message_id;
  const username = cb.from?.username;
  const safeUsername = escapeMd(username || "");
  const data = cb.data || "";

  // Sempre responder o callback para remover o "carregando" no Telegram
  const token = process.env.TELEGRAM_BOT_TOKEN!;
  const answerCallback = (text: string, showAlert = false) =>
    fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: cb.id, text, show_alert: showAlert }),
    });

  if (!data.startsWith("verificar:")) {
    await answerCallback("Ação desconhecida.");
    return;
  }

  if (!isAdmin(username)) {
    await answerCallback("❌ Apenas o administrador pode verificar bilhetes.", true);
    return;
  }

  const code = data.replace("verificar:", "").trim().toLowerCase();
  console.log(`[Bot] Admin @${username} clicou em Verificar para código: "${code}"`);

  try {
    const allBets = await storage.getAllBetSlips();
    const bet = allBets.find(b => b.id.toLowerCase().startsWith(code));

    if (!bet) {
      await answerCallback(`❌ Bilhete ${code.toUpperCase()} não encontrado.`, true);
      return;
    }

    if (bet.verified) {
      await answerCallback(`⚠️ Bilhete já estava verificado!`, true);
      // Remover botão da mensagem
      if (chatId && messageId) {
        await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } }),
        });
      }
      return;
    }

    const updated = await storage.updateBetSlipVerified(bet.id, true);
    if (!updated) {
      await answerCallback("❌ Erro ao atualizar no banco. Tente novamente.", true);
      return;
    }

    console.log(`[Bot] Bilhete ${bet.id} verificado via botão pelo admin @${username}`);

    // Responder callback com sucesso
    await answerCallback(`✅ Bilhete ${bet.id.slice(0, 8).toUpperCase()} verificado!`);

    // Editar legenda da foto para mostrar que foi verificado e remover o botão
    if (chatId && messageId) {
      await fetch(`https://api.telegram.org/bot${token}/editMessageCaption`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          caption:
            `✅ *BILHETE VERIFICADO*\n\n` +
            `🎫 Bilhete: \`${bet.id.slice(0, 8).toUpperCase()}\`\n` +
            `💰 Valor: R$ ${bet.stake.toFixed(2)}\n` +
            `🎯 Retorno: R$ ${bet.potentialWin.toFixed(2)}\n\n` +
            `Verificado por @${safeUsername}`,
          parse_mode: "Markdown",
          reply_markup: { inline_keyboard: [] },
        }),
      });
    }

    // Notificar cliente via API direta do Telegram
    if (bet.telegramChatId) {
      try {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: parseInt(bet.telegramChatId, 10),
            text:
              `✅ *Pagamento Confirmado!*\n\n` +
              `🎫 Bilhete: \`${bet.id.slice(0, 8).toUpperCase()}\`\n` +
              `💰 Valor pago: R$ ${bet.stake.toFixed(2)}\n` +
              `🎯 Retorno potencial: R$ ${bet.potentialWin.toFixed(2)}\n\n` +
              `Seu bilhete está ativo! Boa sorte! 🍀`,
            parse_mode: "Markdown",
          }),
        });
        console.log(`[Bot] Cliente ${bet.telegramChatId} notificado via botão`);
      } catch (notifyErr) {
        console.error(`[Bot] Erro ao notificar cliente:`, notifyErr);
      }
    }
  } catch (error) {
    console.error("Erro ao processar callback de verificação:", error);
    await answerCallback("❌ Erro interno. Tente novamente.", true);
  }
}

export async function processUpdate(update: TelegramBot.Update): Promise<void> {
  try {
    if (update.callback_query) {
      await handleCallbackQuery(update);
    } else if (update.message?.photo) {
      await handlePhotoUpdate(update);
    } else if (update.message) {
      await handleUpdate(update);
    }
  } catch (err) {
    console.error("[Bot] Erro ao processar update:", err);
  }
}

export async function initTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    console.log("TELEGRAM_BOT_TOKEN não configurado. Bot do Telegram desativado.");
    return null;
  }

  // Criar instância sem polling (webhook vai alimentar updates)
  bot = new TelegramBot(token, { polling: false });

  // Carregar adminChatId e groupChatId persistidos do banco de dados
  try {
    const savedAdmin = await storage.getSetting("admin_chat_id");
    if (savedAdmin) {
      adminChatId = parseInt(savedAdmin, 10);
      console.log("[Bot] adminChatId carregado do banco:", adminChatId);
    }
    const savedGroup = await storage.getSetting("group_chat_id");
    if (savedGroup) {
      groupChatId = parseInt(savedGroup, 10);
      console.log("[Bot] groupChatId carregado do banco:", groupChatId);
    }
  } catch (err) {
    console.error("[Bot] Erro ao carregar configurações do banco:", err);
  }

  // Detectar URL de produção automaticamente
  const explicitUrl = process.env.TELEGRAM_WEBHOOK_URL;
  const replitDomain = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  const webhookBase = explicitUrl || (replitDomain ? `https://${replitDomain}` : null);

  if (webhookBase) {
    try {
      // Remover webhook antigo antes de configurar novo (evita conflito)
      await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, { method: "POST" });
      const webhookEndpoint = `${webhookBase}/api/telegram-webhook`;
      await bot.setWebHook(webhookEndpoint, { drop_pending_updates: false });
      console.log(`[Bot] Webhook configurado: ${webhookEndpoint}`);
    } catch (err) {
      console.error("[Bot] Erro ao configurar webhook:", err);
    }
  } else {
    // Fallback: polling (sem URL de produção disponível)
    console.log("[Bot] URL de produção não detectada — usando polling como fallback.");
    bot = new TelegramBot(token, { polling: true });

    let retryDelay = 10000;
    bot.on("polling_error", (error: any) => {
      if (error.message?.includes("409") || (error.code === "ETELEGRAM" && error.message?.includes("409"))) {
        console.log(`[Bot] 409 Conflict: aguardando ${retryDelay / 1000}s...`);
        bot?.stopPolling();
        setTimeout(async () => {
          if (bot) {
            try {
              await bot.startPolling();
              retryDelay = 10000;
              console.log("[Bot] Polling retomado.");
            } catch (e: any) {
              retryDelay = Math.min(retryDelay * 2, 60000);
            }
          }
        }, retryDelay);
      } else {
        console.error("Erro de polling:", error.message);
      }
    });

    // Com polling, registrar handlers diretamente
    bot.on("message", async (msg) => {
      await processUpdate({ update_id: 0, message: msg });
    });
  }

  console.log("[Bot] Telegram iniciado!");
  return bot;
}

export async function notifyAdmin(message: string) {
  const target = notifyTarget();
  if (bot && target) {
    try {
      await bot.sendMessage(target, message, { parse_mode: "Markdown" });
    } catch (error) {
      console.error("Erro ao notificar admin:", error);
    }
  }
}

export function getBot() {
  return bot;
}
