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

  // Salvar chatId do cliente no banco de dados
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

export function initTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    console.log("TELEGRAM_BOT_TOKEN não configurado. Bot do Telegram desativado.");
    return null;
  }

  if (process.env.NODE_ENV !== "production") {
    console.log("Ambiente de desenvolvimento — Bot do Telegram desativado (evitando conflito com produção).");
    return null;
  }

  bot = new TelegramBot(token, { polling: true });

  console.log("Bot do Telegram iniciado!");

  // Carregar adminChatId persistido do banco de dados
  storage.getSetting("admin_chat_id").then((saved) => {
    if (saved) {
      adminChatId = parseInt(saved, 10);
      console.log("[Bot] adminChatId carregado do banco:", adminChatId);
    }
  }).catch((err) => {
    console.error("[Bot] Erro ao carregar adminChatId do banco:", err);
  });

  // Se outra instância já está fazendo polling (409), esperar e tentar novamente
  bot.on("polling_error", (error: any) => {
    if (error.message?.includes("409 Conflict") || (error.code === "ETELEGRAM" && error.message?.includes("409"))) {
      console.log("[Bot] 409 Conflict: outra instância ativa. Aguardando 60s para tentar assumir o polling...");
      bot?.stopPolling();
      setTimeout(async () => {
        if (bot) {
          try {
            await bot.startPolling();
            console.log("[Bot] Polling retomado com sucesso.");
          } catch (e: any) {
            console.log("[Bot] Falha ao retomar polling:", e.message);
          }
        }
      }, 60000);
    } else {
      console.error("Erro de polling do Telegram:", error.message);
    }
  });

  // Comando /start (com suporte a deep link)
  bot.onText(/\/start ?(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const username = msg.from?.username;
    const betCodeParam = match?.[1]?.trim().toLowerCase();

    if (isAdmin(username)) {
      adminChatId = chatId;
      storage.setSetting("admin_chat_id", chatId.toString()).catch((err) => {
        console.error("[Bot] Erro ao salvar adminChatId no banco:", err);
      });
      await bot!.sendMessage(chatId,
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
        await bot!.sendMessage(chatId, "❌ Erro ao buscar bilhete. Tente novamente.");
      }
      return;
    }

    await bot!.sendMessage(chatId,
      `🎰 *FW Sports - Verificação de Pagamento*\n\n` +
      `Para verificar seu pagamento:\n\n` +
      `1️⃣ Envie o *código do bilhete* (ex: ABC12345)\n` +
      `2️⃣ Envie uma *foto do comprovante PIX*\n\n` +
      `Aguarde a confirmação do administrador.`,
      { parse_mode: "Markdown" }
    );
  });

  // Comando /pendentes (admin)
  bot.onText(/\/pendentes/, async (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from?.username;

    if (!isAdmin(username)) {
      await bot!.sendMessage(chatId, "❌ Comando disponível apenas para administradores.");
      return;
    }

    try {
      const allBets = await storage.getAllBetSlips();
      const pendingVerification = allBets.filter(bet => !bet.verified);

      if (pendingVerification.length === 0) {
        await bot!.sendMessage(chatId, "✅ Nenhum bilhete pendente de verificação!");
        return;
      }

      let message = `📋 *Bilhetes Pendentes de Verificação:*\n\n`;

      for (const bet of pendingVerification.slice(0, 10)) {
        const code = bet.id.slice(0, 8).toUpperCase();
        const date = new Date(bet.createdAt).toLocaleString("pt-BR");
        message += `🎫 \`${code}\`\n`;
        message += `   💰 R$ ${bet.stake.toFixed(2)} → R$ ${bet.potentialWin.toFixed(2)}\n`;
        message += `   📅 ${date}\n\n`;
      }

      if (pendingVerification.length > 10) {
        message += `\n... e mais ${pendingVerification.length - 10} bilhetes`;
      }

      message += `\n\n✅ Use /verificar [código] para aprovar`;

      await bot!.sendMessage(chatId, message, { parse_mode: "Markdown" });
    } catch (error) {
      console.error("Erro ao buscar bilhetes pendentes:", error);
      await bot!.sendMessage(chatId, "❌ Erro ao buscar bilhetes pendentes.");
    }
  });

  // Comando /verificar (admin)
  bot.onText(/\/verificar (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const username = msg.from?.username;

    if (!isAdmin(username)) {
      await bot!.sendMessage(chatId, "❌ Comando disponível apenas para administradores.");
      return;
    }

    const code = match?.[1]?.trim().toLowerCase();
    if (!code) {
      await bot!.sendMessage(chatId, "❌ Uso: /verificar [código do bilhete]");
      return;
    }

    try {
      const allBets = await storage.getAllBetSlips();
      const bet = allBets.find(b => b.id.toLowerCase().startsWith(code));

      if (!bet) {
        await bot!.sendMessage(chatId, `❌ Bilhete com código \`${code.toUpperCase()}\` não encontrado.`, { parse_mode: "Markdown" });
        return;
      }

      if (bet.verified) {
        await bot!.sendMessage(chatId, `⚠️ Bilhete \`${bet.id.slice(0, 8).toUpperCase()}\` já está verificado!`, { parse_mode: "Markdown" });
        return;
      }

      console.log(`[Bot] Verificando bilhete ${bet.id} (admin: ${username})`);
      const updated = await storage.updateBetSlipVerified(bet.id, true);

      if (!updated) {
        console.error(`[Bot] Falha ao atualizar bilhete ${bet.id} no banco de dados`);
        await bot!.sendMessage(chatId, `❌ Erro ao atualizar bilhete no banco de dados. Tente novamente.`);
        return;
      }

      console.log(`[Bot] Bilhete ${bet.id} verificado com sucesso`);

      // Confirmar para o admin
      await bot!.sendMessage(chatId,
        `✅ *Bilhete Verificado!*\n\n` +
        `🎫 Código: \`${bet.id.slice(0, 8).toUpperCase()}\`\n` +
        `💰 Valor: R$ ${bet.stake.toFixed(2)}\n` +
        `🎯 Retorno: R$ ${bet.potentialWin.toFixed(2)}\n\n` +
        `O bilhete agora está ativo para apostas!`,
        { parse_mode: "Markdown" }
      );

      // Notificar o cliente se tiver chatId salvo
      if (bet.telegramChatId) {
        const clientChatId = parseInt(bet.telegramChatId, 10);
        try {
          await bot!.sendMessage(clientChatId,
            `✅ *Pagamento Confirmado!*\n\n` +
            `🎫 Bilhete: \`${bet.id.slice(0, 8).toUpperCase()}\`\n` +
            `💰 Valor pago: R$ ${bet.stake.toFixed(2)}\n` +
            `🎯 Retorno potencial: R$ ${bet.potentialWin.toFixed(2)}\n\n` +
            `Seu bilhete está ativo! Boa sorte! 🍀`,
            { parse_mode: "Markdown" }
          );
          console.log(`[Bot] Cliente ${clientChatId} notificado sobre verificação do bilhete ${bet.id}`);
        } catch (notifyErr) {
          console.error(`[Bot] Erro ao notificar cliente ${clientChatId}:`, notifyErr);
        }
      } else {
        console.log(`[Bot] Bilhete ${bet.id} não tem telegramChatId — cliente não notificado.`);
      }
    } catch (error) {
      console.error("Erro ao verificar bilhete:", error);
      await bot!.sendMessage(chatId, "❌ Erro ao verificar bilhete.");
    }
  });

  // Comando /status (admin)
  bot.onText(/\/status/, async (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from?.username;

    if (!isAdmin(username)) {
      await bot!.sendMessage(chatId, "❌ Comando disponível apenas para administradores.");
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

      await bot!.sendMessage(chatId,
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
      await bot!.sendMessage(chatId, "❌ Erro ao buscar estatísticas.");
    }
  });

  // Receber mensagens de texto (códigos de bilhete)
  bot.on("message", async (msg) => {
    if (msg.text?.startsWith("/")) return;

    const chatId = msg.chat.id;
    const username = msg.from?.username;

    if (isAdmin(username)) return;

    if (msg.text && !msg.photo) {
      const code = msg.text.trim().toLowerCase();
      try {
        await linkBetToChat(chatId, code);
      } catch (error) {
        console.error("Erro ao buscar bilhete:", error);
        await bot!.sendMessage(chatId, "❌ Erro ao buscar bilhete. Tente novamente.");
      }
    }
  });

  // Receber fotos (comprovantes)
  bot.on("photo", async (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from?.username || "Usuário";

    if (isAdmin(msg.from?.username)) return;

    try {
      // Buscar bilhete vinculado ao chatId do cliente no banco de dados
      const allBets = await storage.getAllBetSlips();
      const bet = allBets.find(b => b.telegramChatId === chatId.toString() && !b.verified);

      if (!bet) {
        await bot!.sendMessage(chatId,
          `⚠️ Primeiro envie o *código do bilhete* antes de enviar o comprovante.`,
          { parse_mode: "Markdown" }
        );
        return;
      }

      // Confirmar recebimento para o usuário
      await bot!.sendMessage(chatId,
        `✅ *Comprovante Recebido!*\n\n` +
        `🎫 Bilhete: \`${bet.id.slice(0, 8).toUpperCase()}\`\n` +
        `💰 Valor: R$ ${bet.stake.toFixed(2)}\n\n` +
        `⏳ Aguarde a verificação do administrador.\n` +
        `Você receberá uma confirmação em breve!`,
        { parse_mode: "Markdown" }
      );

      // Notificar admin com a foto
      if (adminChatId && msg.photo) {
        const photo = msg.photo[msg.photo.length - 1];

        await bot!.sendPhoto(adminChatId, photo.file_id, {
          caption:
            `🆕 *NOVO COMPROVANTE RECEBIDO*\n\n` +
            `👤 Usuário: @${username}\n` +
            `🎫 Bilhete: \`${bet.id.slice(0, 8).toUpperCase()}\`\n` +
            `💰 Valor: R$ ${bet.stake.toFixed(2)}\n` +
            `🎯 Retorno: R$ ${bet.potentialWin.toFixed(2)}\n\n` +
            `✅ Para aprovar: /verificar ${bet.id.slice(0, 8).toLowerCase()}`,
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
  });

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
