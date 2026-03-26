import TelegramBot from "node-telegram-bot-api";
import { storage } from "./storage";

const ADMIN_USERNAME = "fwsports0";

function isAdmin(username?: string): boolean {
  return !!username && username.toLowerCase() === ADMIN_USERNAME.toLowerCase();
}

let bot: TelegramBot | null = null;
let adminChatId: number | null = null;

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

  // /pendentes
  if (text.match(/^\/pendentes$/)) {
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

      let message = `📋 *Bilhetes Pendentes (${pendingVerification.length})*\n\n`;
      for (const bet of pendingVerification.slice(0, 10)) {
        const date = new Date(bet.createdAt).toLocaleString("pt-BR");
        message += `🎫 \`${bet.id.slice(0, 8).toUpperCase()}\`\n`;
        message += `   💰 R$ ${bet.stake.toFixed(2)} → R$ ${bet.potentialWin.toFixed(2)}\n`;
        message += `   📅 ${date}\n\n`;
      }

      if (pendingVerification.length > 10) {
        message += `\n... e mais ${pendingVerification.length - 10} bilhetes`;
      }

      message += `\n\n✅ Use /verificar [código] para aprovar`;
      await bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
    } catch (error) {
      console.error("Erro ao buscar bilhetes pendentes:", error);
      await bot.sendMessage(chatId, "❌ Erro ao buscar bilhetes pendentes.");
    }
    return;
  }

  // /verificar
  const verificarMatch = text.match(/^\/verificar\s+(.+)$/);
  if (verificarMatch) {
    if (!isAdmin(username)) {
      await bot.sendMessage(chatId, "❌ Comando disponível apenas para administradores.");
      return;
    }

    const code = verificarMatch[1].trim().toLowerCase();
    console.log(`[Bot] Admin @${username} solicitou verificação do código: "${code}"`);

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

      console.log(`[Bot] Verificando bilhete ${bet.id} (admin: @${username})`);
      const updated = await storage.updateBetSlipVerified(bet.id, true);

      if (!updated) {
        console.error(`[Bot] Falha ao atualizar bilhete ${bet.id} no banco de dados`);
        await bot.sendMessage(chatId, `❌ Erro ao atualizar bilhete no banco de dados. Tente novamente.`);
        return;
      }

      console.log(`[Bot] Bilhete ${bet.id} verificado com sucesso`);

      await bot.sendMessage(chatId,
        `✅ *Bilhete Verificado!*\n\n` +
        `🎫 Código: \`${bet.id.slice(0, 8).toUpperCase()}\`\n` +
        `💰 Valor: R$ ${bet.stake.toFixed(2)}\n` +
        `🎯 Retorno: R$ ${bet.potentialWin.toFixed(2)}\n\n` +
        `O bilhete agora está ativo para apostas!`,
        { parse_mode: "Markdown" }
      );

      // Notificar cliente via API direta do Telegram
      if (bet.telegramChatId) {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (token) {
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
            console.log(`[Bot] Cliente ${bet.telegramChatId} notificado sobre verificação do bilhete ${bet.id}`);
          } catch (notifyErr) {
            console.error(`[Bot] Erro ao notificar cliente ${bet.telegramChatId}:`, notifyErr);
          }
        }
      } else {
        console.log(`[Bot] Bilhete ${bet.id} não tem telegramChatId — cliente não notificado.`);
      }
    } catch (error) {
      console.error("Erro ao verificar bilhete:", error);
      await bot.sendMessage(chatId, "❌ Erro ao verificar bilhete.");
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

  // Comando desconhecido iniciado com /
  if (text.startsWith("/")) {
    if (isAdmin(username)) {
      await bot.sendMessage(chatId, "❌ Comando desconhecido. Use /pendentes, /verificar [código] ou /status.");
    }
    return;
  }

  // Mensagem de texto comum (código de bilhete do cliente)
  if (isAdmin(username)) return;

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

    if (adminChatId && msg.photo) {
      const photo = msg.photo[msg.photo.length - 1];
      await bot.sendPhoto(adminChatId, photo.file_id, {
        caption:
          `🆕 *NOVO COMPROVANTE RECEBIDO*\n\n` +
          `👤 Usuário: @${username}\n` +
          `🎫 Bilhete: \`${bet.id.slice(0, 8).toUpperCase()}\`\n` +
          `💰 Valor: R$ ${bet.stake.toFixed(2)}\n` +
          `🎯 Retorno: R$ ${bet.potentialWin.toFixed(2)}\n\n` +
          `/verificar ${bet.id.slice(0, 8).toLowerCase()}`,
        parse_mode: "Markdown"
      });
      console.log(`[Bot] Admin ${adminChatId} notificado sobre comprovante do bilhete ${bet.id}`);
    } else {
      console.warn(`[Bot] adminChatId não definido — comprovante recebido mas admin não notificado.`);
    }
  } catch (error) {
    console.error("Erro ao processar comprovante:", error);
    await bot!.sendMessage(chatId, "❌ Erro ao processar comprovante. Tente novamente.");
  }
}

export async function processUpdate(update: TelegramBot.Update): Promise<void> {
  try {
    if (update.message?.photo) {
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

  // Carregar adminChatId persistido do banco de dados
  try {
    const saved = await storage.getSetting("admin_chat_id");
    if (saved) {
      adminChatId = parseInt(saved, 10);
      console.log("[Bot] adminChatId carregado do banco:", adminChatId);
    }
  } catch (err) {
    console.error("[Bot] Erro ao carregar adminChatId do banco:", err);
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
  if (bot && adminChatId) {
    try {
      await bot.sendMessage(adminChatId, message, { parse_mode: "Markdown" });
    } catch (error) {
      console.error("Erro ao notificar admin:", error);
    }
  }
}

export function getBot() {
  return bot;
}
