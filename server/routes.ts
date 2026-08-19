_chance") {
          // Dupla Chance â€” "1X" (casa ou empate), "X2" (empate ou fora), "12" (casa ou fora)
          const ocTrim = oc.replace(/^double_chance[-:\s]*/i, "").trim();
          if (ocTrim === "1x") {
            selResult = homeGoals >= awayGoals ? "won" : "lost";
          } else if (ocTrim === "x2") {
            selResult = awayGoals >= homeGoals ? "won" : "lost";
          } else if (ocTrim === "12") {
            selResult = homeGoals !== awayGoals ? "won" : "lost";
          } else {
            resolved = false;
          }

        } else if (sel.marketKey === "totals") {
          // Mais/Menos Gols â€” outcome: "Mais 2.5", "Menos 1.5" etc.
          const maisMatch = oc.match(/^mais\s*([\d.]+)$/i);
          const menosMatch = oc.match(/^menos\s*([\d.]+)$/i);
          const total = homeGoals + awayGoals;
          if (maisMatch) {
            selResult = total > parseFloat(maisMatch[1]) ? "won" : "lost";
          } else if (menosMatch) {
            selResult = total < parseFloat(menosMatch[1]) ? "won" : "lost";
          } else {
            resolved = false;
          }

        } else if (mk === "results/both teams score") {
          // Resultado + Ambas Marcam (mercado combinado) â€” deve vir ANTES do BTTS genÃ©rico
          const raw = oc.replace(/^results\/both teams score-?/i, "").trim();
          const slash = raw.lastIndexOf("/");
          if (slash === -1) {
            resolved = false;
          } else {
            const resultPick = raw.slice(0, slash).toLowerCase().trim();
            const bttsPick   = raw.slice(slash + 1).toLowerCase().trim();
            const btts = homeGoals > 0 && awayGoals > 0;
            const bttsWon = bttsPick.includes("yes") || bttsPick.includes("sim") ? btts : !btts;
            let resultWon: boolean;
            if (resultPick === "home" || resultPick === "casa") resultWon = homeGoals > awayGoals;
            else if (resultPick === "away" || resultPick === "fora") resultWon = awayGoals > homeGoals;
            else resultWon = homeGoals === awayGoals;
            selResult = resultWon && bttsWon ? "won" : "lost";
          }

        } else if (mk.includes("both") || mk.includes("btts") || sel.marketKey === "Both Teams Score") {
          // Ambas as equipes marcam (BTTS) â€” diferencia 1Âº e 2Âº tempo
          let hG: number, aG: number;
          if (mk.includes("first half")) {
            hG = htHome; aG = htAway;
          } else if (mk.includes("second half")) {
            hG = homeGoals - htHome; aG = awayGoals - htAway;
          } else {
            hG = homeGoals; aG = awayGoals;
          }
          const btts = hG > 0 && aG > 0;
          const betYes = oc.includes("sim") || oc.includes("yes");
          selResult = (btts === betYes) ? "won" : "lost";

        } else if (mk.includes("ht/ft") || mk.includes("halftime") || sel.marketKey === "HT/FT Double" || mk === "ht_ft") {
          // HT/FT â€” API-Football usa "Home/Home", "Away/Draw" etc.
          // mk pode ser "ht_ft" (FootballGameCard) ou conter "ht/ft"
          const htActual = htHome > htAway ? "home" : htAway > htHome ? "away" : "draw";
          const ftActual = homeGoals > awayGoals ? "home" : awayGoals > homeGoals ? "away" : "draw";
          const raw = sel.outcome
            .replace(/^HT\/FT Double[-:\s]*/i, "")
            .replace(/^[^:]+:\s*ht_ft-/i, "")
            .trim();
          const slash = raw.lastIndexOf("/");
          if (slash !== -1) {
            const htPick = raw.slice(0, slash).trim().toLowerCase();
            const ftPick = raw.slice(slash + 1).trim().toLowerCase();
            const chk = (pick: string, actual: string) => {
              if (pick === actual) return true;
              if (pick === "draw" || pick === "empate" || pick === "x") return actual === "draw";
              if (actual === "home") return teamsMatch(pick, homeTeam);
              if (actual === "away") return teamsMatch(pick, awayTeam);
              return false;
            };
            selResult = chk(htPick, htActual) && chk(ftPick, ftActual) ? "won" : "lost";
          } else {
            resolved = false;
          }

        } else if (mk.includes("goals over") || mk.includes("goals under") || sel.marketKey === "Goals Over/Under") {
          // Total de gols â€” diferencia perÃ­odo (inteiro, 1Âº tempo, 2Âº tempo)
          let total: number;
          if (mk.includes("first half")) {
            total = htHome + htAway;
          } else if (mk.includes("second half")) {
            total = (homeGoals - htHome) + (awayGoals - htAway);
          } else {
            total = homeGoals + awayGoals;
          }
          // API-Football armazena Goals Over/Under como "Sim" (Over 2.5) ou "NÃ£o" (Under 2.5)
          if (oc.includes("sim")) {
            selResult = total > 2.5 ? "won" : "lost";
          } else if (oc.includes("nÃ£o") || oc.includes("nao")) {
            selResult = total <= 2.5 ? "won" : "lost";
          } else {
            const overMatch = oc.match(/over\s*(\d+\.?\d*)/i);
            const underMatch = oc.match(/under\s*(\d+\.?\d*)/i);
            if (overMatch) {
              selResult = total > parseFloat(overMatch[1]) ? "won" : "lost";
            } else if (underMatch) {
              selResult = total < parseFloat(underMatch[1]) ? "won" : "lost";
            } else {
              resolved = false;
            }
          }

        } else if (mk.includes("corner") || mk === "live_m20") {
          // Escanteios â€” busca estatÃ­sticas da API-Football (tambÃ©m extrai cartÃµes)
          // Usa resolvedFid para garantir que buscamos a fixture correta
          if (!arCornerCache.has(resolvedFid)) {
            try {
              const statsRes = await fetch(
                `${API_FOOTBALL_BASE}/fixtures/statistics?fixture=${resolvedFid}`,
                { headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY || "" } }
              );
              if (statsRes.ok) {
                const statsData = await statsRes.json();
                let homeC = 0; let awayC = 0;
                let homeYellow = 0; let homeRed = 0; let awayYellow = 0; let awayRed = 0;
                let foundCornerStat = false;
                for (const teamStat of statsData.response || []) {
                  const isHome = teamsMatch(teamStat.team?.name ?? "", homeTeam);
                  for (const s of teamStat.statistics || []) {
                    const rawVal = s.value;
                    const val = rawVal !== null && rawVal !== undefined ? parseInt(rawVal) || 0 : null;
                    if (s.type === "Corner Kicks" && val !== null) {
                      foundCornerStat = true;
                      if (isHome) homeC = val; else awayC = val;
                    }
                    if (s.type === "Yellow Cards" && val !== null) { if (isHome) homeYellow = val; else awayYellow = val; }
                    if (s.type === "Red Cards" && val !== null)    { if (isHome) homeRed = val; else awayRed = val; }
                  }
                }
                if (foundCornerStat && (homeC + awayC) > 0) {
                  arCornerCache.set(resolvedFid, homeC + awayC);
                  arCornerHomeCache.set(resolvedFid, homeC);
                  arCornerAwayCache.set(resolvedFid, awayC);
                  console.log(`    [auto-resolve] Stats fixture ${resolvedFid}: corners=${homeC + awayC} (${homeC}/${awayC}), cartÃµes=${homeYellow + homeRed * 2 + awayYellow + awayRed * 2} (${homeYellow + homeRed * 2}/${awayYellow + awayRed * 2})`);
                } else if (foundCornerStat) {
                  console.log(`    [auto-resolve] Stats fixture ${resolvedFid}: Corner Kicks retornou 0+0 â€” dados ainda nÃ£o prontos, mantendo pendente`);
                } else {
                  console.log(`    [auto-resolve] Stats fixture ${resolvedFid}: Corner Kicks nÃ£o encontrado na API â€” mantendo pendente`);
                }
                if (!arCardHomeCache.has(resolvedFid)) {
                  arCardHomeCache.set(resolvedFid, homeYellow + homeRed * 2);
                  arCardAwayCache.set(resolvedFid, awayYellow + awayRed * 2);
                }
              }
            } catch (e) {
              console.log(`    [auto-resolve] Erro ao buscar stats fixture ${resolvedFid}:`, e);
            }
          }

          // Escanteios 1Âº Tempo â€” sempre manual (admin decide ganhou/perdeu)
          if (mk.includes("first half")) {
            resolved = false;
            console.log(`    [auto-resolve] Corners 1ÂºT fixture ${resolvedFid}: resoluÃ§Ã£o manual pelo admin`);
          // Mercados complexos nÃ£o resolvÃ­veis automaticamente
          } else if (mk.includes("asian handicap") || mk.includes("last corner")) {
            resolved = false;
          // Corners 1x2 â€” quem teve mais escanteios
          } else if (mk.includes("1x2")) {
            const hc = arCornerHomeCache.get(resolvedFid);
            const ac = arCornerAwayCache.get(resolvedFid);
            if (hc !== undefined && ac !== undefined) {
              // Extrai sÃ³ a escolha (outcome pode ter prefixo "Corners 1x2-Home")
              const ocFull = oc.toLowerCase().trim();
              const ocTrim = ocFull.includes("-") ? ocFull.split("-").pop()!.trim() : ocFull;
              if (ocTrim === "home" || ocTrim === "casa") selResult = hc > ac ? "won" : "lost";
              else if (ocTrim === "away" || ocTrim === "fora" || ocTrim === "visitante") selResult = ac > hc ? "won" : "lost";
              else if (ocTrim === "draw" || ocTrim === "empate" || ocTrim === "x") selResult = hc === ac ? "won" : "lost";
              else resolved = false;
            } else {
              resolved = false;
            }
          // Corners Over/Under â€” jogo inteiro
          } else {
            const totalCorners = arCornerCache.get(resolvedFid);
            if (totalCorners !== undefined) {
              const overMatch = oc.match(/over\s*(\d+\.?\d*)/i);
              const underMatch = oc.match(/under\s*(\d+\.?\d*)/i);
              if (overMatch) {
                selResult = totalCorners > parseFloat(overMatch[1]) ? "won" : "lost";
              } else if (underMatch) {
                selResult = totalCorners < parseFloat(underMatch[1]) ? "won" : "lost";
              } else {
                resolved = false;
              }
            } else {
              resolved = false;
            }
          }

        } else if (mk.includes("exact") || sel.marketKey === "Exact Score") {
          // Placar exato
          const outcomeParts = sel.outcome.match(/(\d+)[:\-](\d+)/);
          if (outcomeParts) {
            const [, og, ag] = outcomeParts;
            selResult = parseInt(og) === homeGoals && parseInt(ag) === awayGoals ? "won" : "lost";
          } else {
            resolved = false;
          }

        } else if (mk === "first half winner") {
          // Vencedor do 1Âº Tempo
          const ocTrim = oc.toLowerCase().trim();
          if (ocTrim.includes("draw") || ocTrim.includes("empate") || ocTrim === "x") selResult = htHome === htAway ? "won" : "lost";
          else if (ocTrim.includes("home") || ocTrim.includes("casa")) selResult = htHome > htAway ? "won" : "lost";
          else if (ocTrim.includes("away") || ocTrim.includes("fora") || ocTrim.includes("visitante")) selResult = htAway > htHome ? "won" : "lost";
          else resolved = false;

        } else if (mk === "total - home" || mk === "total - away") {
          // Total de gols de um time especÃ­fico
          const teamGoals = mk === "total - home" ? homeGoals : awayGoals;
          const overMatch = oc.match(/over\s*(\d+\.?\d*)/i);
          const underMatch = oc.match(/under\s*(\d+\.?\d*)/i);
          if (overMatch)       selResult = teamGoals > parseFloat(overMatch[1]) ? "won" : "lost";
          else if (underMatch) selResult = teamGoals < parseFloat(underMatch[1]) ? "won" : "lost";
          else resolved = false;

        } else if ((mk.includes("cards") && !mk.includes("red card")) || mk === "live_m119") {
          // Mercados de cartÃµes â€” busca estatÃ­sticas da API-Football
          if (!arCardHomeCache.has(resolvedFid)) {
            try {
              const statsRes = await fetch(
                `${API_FOOTBALL_BASE}/fixtures/statistics?fixture=${resolvedFid}`,
                { headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY || "" } }
              );
              if (statsRes.ok) {
                const statsData = await statsRes.json();
                let homeYellow = 0; let homeRed = 0; let awayYellow = 0; let awayRed = 0;
                let homeC = 0; let awayC = 0;
                for (const teamStat of statsData.response || []) {
                  const isHome = teamsMatch(teamStat.team?.name ?? "", homeTeam);
                  for (const s of teamStat.statistics || []) {
                    const val = parseInt(s.value) || 0;
                    if (s.type === "Corner Kicks") { if (isHome) homeC = val; else awayC = val; }
                    if (s.type === "Yellow Cards") { if (isHome) homeYellow = val; else awayYellow = val; }
                    if (s.type === "Red Cards")    { if (isHome) homeRed = val; else awayRed = val; }
                  }
                }
                arCardHomeCache.set(resolvedFid, homeYellow + homeRed * 2);
                arCardAwayCache.set(resolvedFid, awayYellow + awayRed * 2);
                if (!arCornerCache.has(resolvedFid)) {
                  arCornerCache.set(resolvedFid, homeC + awayC);
                  arCornerHomeCache.set(resolvedFid, homeC);
                  arCornerAwayCache.set(resolvedFid, awayC);
                }
                console.log(`    [auto-resolve] CartÃµes fixture ${resolvedFid}: casa=${homeYellow + homeRed * 2}, fora=${awayYellow + awayRed * 2}`);
              }
            } catch (e) {
              console.log(`    [auto-resolve] Erro ao buscar cartÃµes fixture ${resolvedFid}:`, e);
            }
          }
          const homeCards = arCardHomeCache.get(resolvedFid) ?? null;
          const awayCards = arCardAwayCache.get(resolvedFid) ?? null;
          if (homeCards === null || awayCards === null) {
            resolved = false;
          } else {
            let cardTotal: number;
            if (mk === "cards - home" || mk === "home team total cards") cardTotal = homeCards;
            else if (mk === "cards - away" || mk === "away team total cards") cardTotal = awayCards;
            else cardTotal = homeCards + awayCards; // cards over/under
            const overMatch = oc.match(/over\s*(\d+\.?\d*)/i);
            const underMatch = oc.match(/under\s*(\d+\.?\d*)/i);
            if (overMatch)       { selResult = cardTotal > parseFloat(overMatch[1]) ? "won" : "lost"; console.log(`    [auto-resolve] CartÃµes Over ${overMatch[1]}: total=${cardTotal} â†’ ${selResult}`); }
            else if (underMatch) { selResult = cardTotal < parseFloat(underMatch[1]) ? "won" : "lost"; console.log(`    [auto-resolve] CartÃµes Under ${underMatch[1]}: total=${cardTotal} â†’ ${selResult}`); }
            else resolved = false;
          }

        } else if (mk.includes("team to score first") || mk.includes("score first") || mk.includes("red card")) {
          // Primeiro marcador ou CartÃ£o Vermelho â€” busca eventos da partida (cache unificado)
          if (!arFirstGoalCache.has(resolvedFid)) {
            try {
              const evRes = await fetch(
                `${API_FOOTBALL_BASE}/fixtures/events?fixture=${resolvedFid}`,
                { headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY || "" } }
              );
              if (evRes.ok) {
                const evData = await evRes.json();
                const events = evData.response || [];
                const goalEvents = events
                  .filter((e: any) => e.type === "Goal" && e.detail !== "Missed Penalty")
                  .sort((a: any, b: any) => (a.time?.elapsed ?? 999) - (b.time?.elapsed ?? 999));
                // "" = buscou mas nÃ£o houve gol (0x0), null = falha de fetch
                arFirstGoalCache.set(resolvedFid, goalEvents[0]?.team?.name ?? "");
                const redCards = events.filter((e: any) => e.type === "Card" && e.detail === "Red Card");
                arRedCardCache.set(resolvedFid, redCards.length > 0);
                const redCards1H = redCards.filter((e: any) => (e.time?.elapsed ?? 999) <= 45);
                arRedCard1HCache.set(resolvedFid, redCards1H.length > 0);
                console.log(`    [auto-resolve] eventos fixture ${resolvedFid}: 1Âºgol=${arFirstGoalCache.get(resolvedFid) || "nenhum"}, redCard=${arRedCardCache.get(resolvedFid)}, redCard1H=${arRedCard1HCache.get(resolvedFid)}`);
              } else {
                arFirstGoalCache.set(resolvedFid, null);
                arRedCardCache.set(resolvedFid, false);
                arRedCard1HCache.set(resolvedFid, false);
              }
            } catch (e) {
              arFirstGoalCache.set(resolvedFid, null);
              arRedCardCache.set(resolvedFid, false);
              arRedCard1HCache.set(resolvedFid, false);
            }
          }

          if (mk.includes("team to score first") || mk.includes("score first")) {
            const firstScorer = arFirstGoalCache.get(resolvedFid) ?? null;
            if (firstScorer === null) {
              // null = falha ao buscar â†’ mantÃ©m pendente
              resolved = false;
            } else {
              const ocLc = sel.outcome.toLowerCase().trim();
              const pickedNoGoal = ocLc.includes("no goal") || ocLc.includes("sem gol") || ocLc.includes("nenhum");
              const pickedHome = ocLc === "home" || ocLc === "casa" || ocLc.endsWith("-home") || ocLc.endsWith(" home") || teamsMatch(sel.outcome, homeTeam) || teamsMatch(sel.outcome, sel.homeTeam);
              const pickedAway = ocLc === "away" || ocLc === "fora" || ocLc === "visitante" || ocLc.endsWith("-away") || ocLc.endsWith(" away") || teamsMatch(sel.outcome, awayTeam) || teamsMatch(sel.outcome, sel.awayTeam);
              if (firstScorer === "") {
                // Jogo sem gols (0x0) â†’ todos perdem
                selResult = "lost";
              } else {
                const scoredHome = teamsMatch(firstScorer, homeTeam);
                const scoredAway = teamsMatch(firstScorer, awayTeam);
                if (pickedNoGoal)    selResult = "lost";
                else if (pickedHome) selResult = scoredHome ? "won" : "lost";
                else if (pickedAway) selResult = scoredAway ? "won" : "lost";
                else                 resolved = false;
              }
            }
          } else {
            // Red Card (jogo inteiro ou 1Âº tempo)
            const is1H = mk.includes("1st half") || mk.includes("first half");
            const hadRedCard = is1H
              ? (arRedCard1HCache.get(resolvedFid) ?? false)
              : (arRedCardCache.get(resolvedFid) ?? false);
            const outcomeLC = sel.outcome?.toLowerCase() ?? "";
            const pickedSim = outcomeLC.includes("sim") || outcomeLC.includes("yes");
            const pickedNao = outcomeLC.includes("nÃ£o") || outcomeLC.includes("nao") || outcomeLC.includes("no");
            if (pickedSim)      selResult = hadRedCard ? "won" : "lost";
            else if (pickedNao) selResult = hadRedCard ? "lost" : "won";
            else                resolved = false;
          }

        } else if (mk.startsWith("live_m")) {
          // Mercados ao vivo â€” lÃ³gica espelha checkSelectionResult
          const liveId = parseInt(mk.replace("live_m", ""));

          if (liveId === 1) {
            // 1X2 resultado final
            if (oc === "home" || oc === "1" || oc === "casa") selResult = homeGoals > awayGoals ? "won" : "lost";
            else if (oc === "draw" || oc === "x" || oc === "empate") selResult = homeGoals === awayGoals ? "won" : "lost";
            else if (oc === "away" || oc === "2" || oc === "fora" || oc === "visitante") selResult = awayGoals > homeGoals ? "won" : "lost";
            else resolved = false;

          } else if (liveId === 5 || liveId === 25) {
            // Gols Over/Under (tempo inteiro)
            const total = homeGoals + awayGoals;
            const overM = oc.match(/over\s*([\d.]+)/i);
            const underM = oc.match(/under\s*([\d.]+)/i);
            if (overM)       selResult = total > parseFloat(overM[1]) ? "won" : "lost";
            else if (underM) selResult = total < parseFloat(underM[1]) ? "won" : "lost";
            else resolved = false;

          } else if (liveId === 8) {
            // Ambas Marcam
            const btts = homeGoals > 0 && awayGoals > 0;
            if (oc === "yes" || oc === "sim") selResult = btts ? "won" : "lost";
            else if (oc === "no" || oc === "nÃ£o" || oc === "nao") selResult = btts ? "lost" : "won";
            else resolved = false;

          } else if (liveId === 13) {
            // Vencedor 1Âº Tempo
            if (oc === "home" || oc === "1" || oc === "casa") selResult = htHome > htAway ? "won" : "lost";
            else if (oc === "draw" || oc === "x" || oc === "empate") selResult = htHome === htAway ? "won" : "lost";
            else if (oc === "away" || oc === "2" || oc === "fora") selResult = htAway > htHome ? "won" : "lost";
            else resolved = false;

          } else if (liveId === 3) {
            // Vencedor 2Âº Tempo
            const h2Home = homeGoals - htHome;
            const h2Away = awayGoals - htAway;
            if (oc === "home" || oc === "1" || oc === "casa") selResult = h2Home > h2Away ? "won" : "lost";
            else if (oc === "draw" || oc === "x" || oc === "empate") selResult = h2Home === h2Away ? "won" : "lost";
            else if (oc === "away" || oc === "2" || oc === "fora") selResult = h2Away > h2Home ? "won" : "lost";
            else resolved = false;

          } else if (liveId === 6) {
            // Gols Over/Under 1Âº Tempo
            const htTotal = htHome + htAway;
            const overM = oc.match(/over\s*([\d.]+)/i);
            const underM = oc.match(/under\s*([\d.]+)/i);
            if (overM)       selResult = htTotal > parseFloat(overM[1]) ? "won" : "lost";
            else if (underM) selResult = htTotal < parseFloat(underM[1]) ? "won" : "lost";
            else resolved = false;

          } else if (liveId === 12) {
            // Dupla Chance
            if (oc === "home/draw" || oc === "1x") selResult = homeGoals >= awayGoals ? "won" : "lost";
            else if (oc === "draw/away" || oc === "x2") selResult = awayGoals >= homeGoals ? "won" : "lost";
            else if (oc === "home/away" || oc === "12") selResult = homeGoals !== awayGoals ? "won" : "lost";
            else resolved = false;

          } else if (liveId === 65) {
            // PrÃ³ximos 10 min â€” manual
            resolved = false;

          } else {
            resolved = false;
          }

        } else {
          resolved = false;
        }

        resolvedSelections.push(resolved ? { ...sel, result: selResult } : sel);
      }

      // Calcular status geral
      const allResolved = resolvedSelections.every(s => s.result !== "pending");
      const anyLost = resolvedSelections.some(s => s.result === "lost");
      const newStatus: "pending" | "won" | "lost" = allResolved ? (anyLost ? "lost" : "won") : "pending";

      // Salvar seleÃ§Ãµes resolvidas individualmente e status
      let updatedBet = bet;
      for (const sel of resolvedSelections) {
        if (sel.result !== "pending") {
          const r = await storage.updateSelectionResult(updatedBet.id, sel.id, sel.result as "won" | "lost");
          if (r) updatedBet = r;
        }
      }
      if (newStatus !== "pending") {
        const r = await storage.updateBetSlipStatus(updatedBet.id, newStatus);
        if (r) updatedBet = r;
      }

      const resolvedCount = resolvedSelections.filter(s => s.result !== "pending").length;
      res.json({ bet: updatedBet, resolvedCount, total: bet.selections.length, status: newStatus });

    } catch (error) {
      console.error("Error auto-resolving bet:", error);
      res.status(500).json({ error: "Erro ao resolver bilhete automaticamente." });
    }
  });

  // Admin: Atualizar status de verificaÃ§Ã£o (pagamento confirmado)
  app.patch("/api/admin/bets/:id/verified", async (req, res) => {
    try {
      const { id } = req.params;
      const { verified } = req.body;

      if (typeof verified !== "boolean") {
        return res.stfÖS¢7G&–ærÀ¢v•FVÔæÖS¢7G&–ærÀ¢‡D†öÖTvöÇ3¢çVÖ&W"ÂçVÆÂÒçVÆÂÀ¢‡Dv”vöÇ3¢çVÖ&W"ÂçVÆÂÒçVÆÂÀ¢F÷FÄ6÷&æW'3¢çVÖ&W"ÂçVÆÂÒçVÆÂÀ¢f—'7E66÷&W%FVÓ¢7G&–ærÂçVÆÂÒçVÆÂÀ¢†5&VD6&C¢&ööÆVâÂçVÆÂÒçVÆÂÀ¢†5&VD6&Cƒ¢&ööÆVâÂçVÆÂÒçVÆÂÀ¢†öÖT6÷&æW'3¢çVÖ&W"ÂçVÆÂÒçVÆÂÀ¢v”6÷&æW'3¢çVÖ&W"ÂçVÆÂÒçVÆÂÀ¢†öÖT6÷&æW'3ƒ¢çVÖ&W"ÂçVÆÂÒçVÆÂÀ¢v”6÷&æW'3ƒ¢çVÖ&W"ÂçVÆÂÒçVÆÂÀ¢†öÖT6&G3¢çVÖ&W"ÂçVÆÂÒçVÆÂÀ¢v”6&G3¢çVÖ&W"ÂçVÆÂÒçVÆÀ¢“¢&ööÆVâÂçVÆÂ°¢6öç7B÷WF6öÖRÒ6VÆV7F–öâæ÷WF6öÖSòçFôÆ÷vW$66R‚’óò"#°¢6öç7BÖ&¶WD¶W’Ò6VÆV7F–öâæÖ&¶WD¶W“òçFôÆ÷vW$66R‚’óò"#° ¢òò7WW"&ö÷7BfW&æó¢çVæ6&W6öÇf–FòWFöÖF–6ÖVçFP¢–b†Ö&¶WD¶W’ÓÓÒ&&ö÷7B"’&WGW&âçVÆÃ° ¢6öç6öÆRæÆör†6†V6µ6VÆV7F–öå&W7VÇC¢Ö³Ò"G¶Ö&¶WD¶W—Ò"÷WF6öÖSÒ"G·6VÆV7F–öâæ÷WF6öÖWÒ&“°¢6öç6öÆRæÆör†Æ6#¢G¶†öÖTvöÇ7ÒÒG¶v”vöÇ7ÒÂ…C¢G¶‡D†öÖTvöÇ7ÒÒG¶‡Dv”vöÇ7Ö“° ¢òò)H)H&W7VÇFFòƒ"†ƒ&‚’)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H ¢–b†Ö&¶WD¶W’ÓÓÒ&ƒ&‚"ÇÂÖ&¶WD¶W’æ–æ6ÇVFW2‚&ÖF6…÷v–ææW""’’°¢–b†÷WF6öÖRæ–æ6ÇVFW2‚&G&r"’ÇÂ÷WF6öÖRæ–æ6ÇVFW2‚&V×FR"’ÇÂ÷WF6öÖRÓÓÒ'‚"ÇÂ÷WF6öÖRæ–æ6ÇVFW2‚"ÖG&r"’’°¢&WGW&â†öÖTvöÇ2ÓÓÒv”vöÇ3°¢Ð¢òòf÷&ÖFò’Ôfö÷F&ÆÂf–fö÷F&ÆÄvÖT6&C¢%&W7VÇFFòf–æÃ¢ÖF6…÷v–ææW"Ô†öÖR ¢–b†÷WF6öÖRæ–æ6ÇVFW2‚"Ö†öÖR"’ÇÂ÷WF6öÖRÓÓÒ&†öÖR"’°¢6öç6öÆRæÆör†ƒ&‚öÖF6…÷v–ææW#¢†öÖRv–ç2‚G¶†öÖTvöÇ7ÒÒG¶v”vöÇ7Ò–“°¢&WGW&â†öÖTvöÇ2âv”vöÇ3°¢Ð¢–b†÷WF6öÖRæ–æ6ÇVFW2‚"Öv’"’ÇÂ÷WF6öÖRÓÓÒ&v’"’°¢6öç6öÆRæÆör†ƒ&‚öÖF6…÷v–ææW#¢v’v–ç2‚G¶†öÖTvöÇ7ÒÒG¶v”vöÇ7Ò–“°¢&WGW&âv”vöÇ2â†öÖTvöÇ3°¢Ð¢–b‡FV×4ÖF6‚‡6VÆV7F–öâæ÷WF6öÖRÂ†öÖUFVÔæÖR’ÇÂFV×4ÖF6‚‡6VÆV7F–öâæ÷WF6öÖRÂ6VÆV7F–öâæ†öÖUFVÒ’’°¢&WGW&â†öÖTvöÇ2âv”vöÇ3°¢Ð¢–b‡FV×4ÖF6‚‡6VÆV7F–öâæ÷WF6öÖRÂv•FVÔæÖR’ÇÂFV×4ÖF6‚‡6VÆV7F–öâæ÷WF6öÖRÂ6VÆV7F–öâæv•FVÒ’’°¢&WGW&âv”vöÇ2â†öÖTvöÇ3°¢Ð¢6öç6öÆRæÆör†ƒ&ƒ¢ì:6ò–FVçF–f–6÷RF–ÖRæò÷WF6öÖR"G·6VÆV7F–öâæ÷WF6öÖWÒ&“°¢&WGW&âfÇ6S°¢Ð ¢òò)H)H…BôeBF÷V&ÆR)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H ¢òò’Ôfö÷F&ÆÂ&WF÷&æfÆ÷&W26öÖò$†öÖRô†öÖR"Â$v’ôG&r"Â$G&rôv’"WF2à¢òòÖ&¶WD¶W’öFR6W"&‡BögBF÷V&ÆR"Â&‡EögB"„fö÷F&ÆÄvÖT6&B’÷R6öçFW"&†ÆgF–ÖR ¢–b†Ö&¶WD¶W’æ–æ6ÇVFW2‚&‡BögB"’ÇÂÖ&¶WD¶W’æ–æ6ÇVFW2‚&†ÆgF–ÖR"’ÇÂÖ&¶WD¶W’ÓÓÒ&‡BögBF÷V&ÆR"ÇÂÖ&¶WD¶W’ÓÓÒ&‡EögB"’°¢–b†‡D†öÖTvöÇ2ÓÓÒçVÆÂÇÂ‡Dv”vöÇ2ÓÓÒçVÆÂ’°¢6öç6öÆRæÆör†…BôeC¢FF÷2FR–çFW'fÆòì:6òF—7öì:×fV—6“°¢&WGW&âçVÆÃ°¢Ð¢6öç7B‡D7GVÂÒ‡D†öÖTvöÇ2â‡Dv”vöÇ2ò&†öÖR"¢‡Dv”vöÇ2â‡D†öÖTvöÇ2ò&v’"¢&G&r#°¢6öç7BgD7GVÂÒ†öÖTvöÇ2âv”vöÇ2ò&†öÖR"¢v”vöÇ2â†öÖTvöÇ2ò&v’"¢&G&r#° ¢òò&VÖ÷fR&Vf—†÷26öæ†V6–F÷2çFW2FRW‡G&—"÷2–6·3 ¢òò$…BôeBF÷V&ÆRÔ†öÖRô†öÖR"Â$–çFW'fÆòòf–æÃ¢‡EögBÔ†öÖRô†öÖR ¢6öç7B&rÒ6VÆV7F–öâæ÷WF6öÖP¢ç&WÆ6R‚õä…EÂôeBF÷V&ÆU²Ó¥Ç5Ò¢ö’Â""¢ç&WÆ6R‚õåµã¥Ò³¥Ç2¦‡EögBÒö’Â""¢çG&–Ò‚“°¢6öç7B6Æ6‚Ò&ræÆ7D–æFW„öb‚"ò"“°¢–b‡6Æ6‚ÓÓÒÓ’²6öç6öÆRæÆör†…BôeC¢&'&ì:6òVæ6öçG&FVÒ"G·&wÒ&“²&WGW&âfÇ6S²Ð ¢6öç7B‡E–6²Ò&rç6Æ–6RƒÂ6Æ6‚’çG&–Ò‚’çFôÆ÷vW$66R‚“°¢6öç7BgE–6²Ò&rç6Æ–6R‡6Æ6‚²’çG&–Ò‚’çFôÆ÷vW$66R‚“° ¢6öç7BÖF6†W5'BÒ‡–6³¢7G&–ærÂ7GVÃ¢7G&–ær’Óâ°¢–b‡–6²ÓÓÒ7GVÂ’&WGW&âG'VS°¢–b‡–6²ÓÓÒ&V×FR"ÇÂ–6²ÓÓÒ'‚"ÇÂ–6²ÓÓÒ&G&r"’&WGW&â7GVÂÓÓÒ&G&r#°¢–b†7GVÂÓÓÒ&†öÖR"’&WGW&âFV×4ÖF6‚‡–6²Â†öÖUFVÔæÖR“°¢–b†7GVÂÓÓÒ&v’"’&WGW&âFV×4ÖF6‚‡–6²Âv•FVÔæÖR“°¢&WGW&âfÇ6S°¢Ó° ¢6öç7B‡EvöâÒÖF6†W5'B†‡E–6²Â‡D7GVÂ“°¢6öç7BgEvöâÒÖF6†W5'B†gE–6²ÂgD7GVÂ“°¢6öç6öÆRæÆör†…BôeC¢–6³Ò"G¶‡E–6·ÒòG¶gE–6·Ò"Â7GVÃÒ"G¶‡D7GVÇÒòG¶gD7GVÇÒ"Âvöã¢G¶‡EvöâbbgEvöçÖ“°¢&WGW&â‡EvöâbbgEvöã°¢Ð ¢òò)H)HW66çFV–÷2)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H ¢6öç7B—46÷&æW$Ö·BÐ¢Ö&¶WD¶W’æ–æ6ÇVFW2‚&6÷&æW""’ÇÀ¢6VÆV7F–öâæÖ&¶WDæÖSòçFôÆ÷vW$66R‚’æ–æ6ÇVFW2‚&W66çFV–ò"’ÇÀ¢6VÆV7F–öâæÖ&¶WDæÖSòçFôÆ÷vW$66R‚’æ–æ6ÇVFW2‚&6÷&æW""“° ¢–b†—46÷&æW$Ö·B’°¢òò+¢FV×ò(	BW67FG26GW&F2òf—fòæò–çFW'fÆð¢–b†Ö&¶WD¶W’æ–æ6ÇVFW2‚&f—'7B†Æb"’’°¢–b††öÖT6÷&æW'3‚ÓÓÒçVÆÂÇÂv”6÷&æW'3‚ÓÓÒçVÆÂ’°¢6öç6öÆRæÆör†6÷&æW'2+¥C¢wV&FæFò6GW&òf—fòæò–çFW'fÆò†¦övò–æFì:6ò6†Vv÷Rò…B÷Rì:6ò6GW&Fò–“°¢&WGW&âçVÆÃ°¢Ð¢6öç7BF÷FÃ‚Ò†öÖT6÷&æW'3‚²v”6÷&æW'3ƒ°¢6öç7B÷fW$ÖF6‚Ò÷WF6öÖRæÖF6‚‚ö÷fW%Ç2¢…µÆBåÒ²’ö’“°¢6öç7BVæFW$ÖF6‚Ò÷WF6öÖRæÖF6‚‚÷VæFW%Ç2¢…µÆBåÒ²’ö’“°¢–b†÷fW$ÖF6‚’²6öç7BÂÒ'6TfÆöB†÷fW$ÖF6…³Ò“²6öç6öÆRæÆör†6÷&æW'2+¥C¢÷fW"G¶ÇÒ(	BG·F÷FÃ‡ÓâG¶ÇÓÒG·F÷FÃƒæÇÖ“²&WGW&âF÷FÃ‚âÃ²Ð¢–b‡VæFW$ÖF6‚’²6öç7BÂÒ'6TfÆöB‡VæFW$ÖF6…³Ò“²6öç6öÆRæÆör†6÷&æW'2+¥C¢VæFW"G¶ÇÒ(	BG·F÷FÃ‡ÓÂG¶ÇÓÒG·F÷FÃƒÆÇÖ“²&WGW&âF÷FÃ‚ÂÃ²Ð¢&WGW&âfÇ6S°¢Ð¢òòÖW&6F÷26ö×ÆW†÷2„†æF–66œ:F–6òÂ9¦ÇF–ÖòW66çFV–ò’(	Bì:6ò&W6öÇl:×fV—2WFöÖF–6ÖVçFP¢–b†Ö&¶WD¶W’æ–æ6ÇVFW2‚&6–â†æF–6"’ÇÂÖ&¶WD¶W’æ–æ6ÇVFW2‚&Æ7B6÷&æW""’’°¢6öç6öÆRæÆör†6÷&æW'2ÖW&6Fò6ö×ÆW†ò‚"G¶Ö&¶WD¶W—Ò"“¢ì:6ò&W6öÇl:×fVÂWFöÖF–6ÖVçFV“°¢&WGW&âçVÆÃ°¢Ð¢òò6÷&æW'2ƒ"(	B6ö×&W66çFV–÷266g2f—6—FçFP¢–b†Ö&¶WD¶W’æ–æ6ÇVFW2‚#ƒ""’’°¢–b††öÖT6÷&æW'2ÓÓÒçVÆÂÇÂv”6÷&æW'2ÓÓÒçVÆÂ’°¢6öç6öÆRæÆör†6÷&æW'2ƒ#¢FF÷2†öÖRöv’ì:6òF—7öì:×fV—6“°¢&WGW&âçVÆÃ°¢Ð¢òòò÷WF6öÖRöFR–æ6ÇV—"&Vf—†òFòÖW&6Fò†Wƒ¢$6÷&æW'2ƒ"Ô†öÖR"’(	BW‡G&’<;2W66öÆ†¢6öç7Bö3$gVÆÂÒ÷WF6öÖRçFôÆ÷vW$66R‚’çG&–Ò‚“°¢6öç7Bö3"Òö3$gVÆÂæ–æ6ÇVFW2‚"Ò"’òö3$gVÆÂç7Æ—B‚"Ò"’ç÷‚’çG&–Ò‚’¢ö3$gVÆÃ°¢–b†ö3"ÓÓÒ&†öÖR"ÇÂö3"ÓÓÒ&66"’²6öç6öÆRæÆör†6÷&æW'2ƒ#¢÷7F÷R66‚G¶†öÖT6÷&æW'7Òg2G¶v”6÷&æW'7Ò–“²&WGW&â†öÖT6÷&æW'2âv”6÷&æW'3²Ð¢–b†ö3"ÓÓÒ&v’"ÇÂö3"ÓÓÒ&f÷&"ÇÂö3"ÓÓÒ'f—6—FçFR"’²6öç6öÆRæÆör†6÷&æW'2ƒ#¢÷7F÷Rf÷&‚G¶v”6÷&æW'7Òg2G¶†öÖT6÷&æW'7Ò–“²&WGW&âv”6÷&æW'2â†öÖT6÷&æW'3²Ð¢–b†ö3"ÓÓÒ&G&r"ÇÂö3"ÓÓÒ&V×FR"ÇÂö3"ÓÓÒ'‚"’²6öç6öÆRæÆör†6÷&æW'2ƒ#¢÷7F÷RV×FR‚G¶†öÖT6÷&æW'7ÓÒG¶v”6÷&æW'7Ò–“²&WGW&â†öÖT6÷&æW'2ÓÓÒv”6÷&æW'3²Ð¢6öç6öÆRæÆör†6÷&æW'2ƒ#¢÷WF6öÖRì:6ò&V6öæ†V6–Fò"G¶÷WF6öÖWÒ&“°¢&WGW&âçVÆÃ°¢Ð¢òò6÷&æW'2÷fW"õVæFW"†¦övò–çFV—&ò¢–b‡F÷FÄ6÷&æW'2ÓÓÒçVÆÂ’°¢6öç6öÆRæÆör†6÷&æW'3¢W7FL:×7F–62ì:6òF—7öì:×fV—6“°¢&WGW&âçVÆÃ°¢Ð¢6öç7B÷fW$ÖF6‚Ò÷WF6öÖRæÖF6‚‚ö÷fW%Ç2¢…µÆBåÒ²’ö’“°¢6öç7BVæFW$ÖF6‚Ò÷WF6öÖRæÖF6‚‚÷VæFW%Ç2¢…µÆBåÒ²’ö’“°¢–b†÷fW$ÖF6‚’²6öç7BÂÒ'6TfÆöB†÷fW$ÖF6…³Ò“²6öç6öÆRæÆör†6÷&æW'3¢÷fW"G¶ÇÒ(	BG·F÷FÄ6÷&æW'7ÓâG¶ÇÓÒG·F÷FÄ6÷&æW'3æÇÖ“²&WGW&âF÷FÄ6÷&æW'2âÃ²Ð¢–b‡VæFW$ÖF6‚’²6öç7BÂÒ'6TfÆöB‡VæFW$ÖF6…³Ò“²6öç6öÆRæÆör†6÷&æW'3¢VæFW"G¶ÇÒ(	BG·F÷FÄ6÷&æW'7ÓÂG¶ÇÓÒG·F÷FÄ6÷&æW'3ÆÇÖ“²&WGW&âF÷FÄ6÷&æW'2ÂÃ²Ð¢6öç6öÆRæÆör†6÷&æW'3¢G,:6ò÷fW"õVæFW"ì:6ò–FVçF–f–6Fò(	BÖçFVæFòVæFVçFV“°¢&WGW&âçVÆÃ°¢Ð ¢òò)H)HF÷FÂFRvöÇ2÷fW"õVæFW"†–çFV—&òÂ+¢FV×òÂ,+¢FV×ò’)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H ¢–b†Ö&¶WD¶W’æ–æ6ÇVFW2‚&vöÇ2÷fW""’ÇÂÖ&¶WD¶W’æ–æ6ÇVFW2‚&vöÇ2VæFW""’ÇÂÖ&¶WD¶W’ÓÓÒ&vöÇ2÷fW"÷VæFW""’°¢òòFWFW&Ö–æ"W,:ÖöFò6÷'&WFð¢ÆWBvöÇ5Fô6†V6³¢çVÖ&W#°¢–b†Ö&¶WD¶W’æ–æ6ÇVFW2‚&f—'7B†Æb"’’°¢–b†‡D†öÖTvöÇ2ÓÓÒçVÆÂÇÂ‡Dv”vöÇ2ÓÓÒçVÆÂ’²6öç6öÆRæÆör†vöÇ2+¥C¢FF÷2…B–æF—7öì:×fV—6“²&WGW&âçVÆÃ²Ð¢vöÇ5Fô6†V6²Ò‡D†öÖTvöÇ2²‡Dv”vöÇ3°¢ÒVÇ6R–b†Ö&¶WD¶W’æ–æ6ÇVFW2‚'6V6öæB†Æb"’’°¢–b†‡D†öÖTvöÇ2ÓÓÒçVÆÂÇÂ‡Dv”vöÇ2ÓÓÒçVÆÂ’²6öç6öÆRæÆör†vöÇ2,+¥C¢FF÷2…B–æF—7öì:×fV—6“²&WGW&âçVÆÃ²Ð¢vöÇ5Fô6†V6²Ò††öÖTvöÇ2Ò‡D†öÖTvöÇ2’²†v”vöÇ2Ò‡Dv”vöÇ2“°¢ÒVÇ6R°¢vöÇ5Fô6†V6²ÒF÷FÄvöÇ3°¢Ð¢6öç6öÆRæÆör†vöÇ2÷fW"õVæFW#¢W,:ÖöFóÒ"G¶Ö&¶WD¶W—Ò"ÂvöÇ3ÒG¶vöÇ5Fô6†V6·Ö“°¢òò’Ôfö÷F&ÆÂW6%6–Ò"Ò÷fW""ãRR$ì:6ò"ÒVæFW""ãP¢–b†÷WF6öÖRæ–æ6ÇVFW2‚'6–Ò"’’&WGW&âvöÇ5Fô6†V6²â"ãS°¢–b†÷WF6öÖRæ–æ6ÇVFW2‚&ì:6ò"’ÇÂ÷WF6öÖRæ–æ6ÇVFW2‚&æò"’’&WGW&âvöÇ5Fô6†V6²ÃÒ"ãS°¢òòf÷&ÖFòW‡Ì:Ö6—Fò$÷fW"‚"ò%VæFW"‚ ¢6öç7B÷fW$ÖF6‚Ò÷WF6öÖRæÖF6‚‚ö÷fW%Ç2¢…µÆBåÒ²’ö’“°¢6öç7BVæFW$ÖF6‚Ò÷WF6öÖRæÖF6‚‚÷VæFW%Ç2¢…µÆBåÒ²’ö’“°¢–b†÷fW$ÖF6‚’²6öç7BÂÒ'6TfÆöB†÷fW$ÖF6…³Ò“²&WGW&âvöÇ5Fô6†V6²âÃ²Ð¢–b‡VæFW$ÖF6‚’²6öç7BÂÒ'6TfÆöB‡VæFW$ÖF6…³Ò“²&WGW&âvöÇ5Fô6†V6²ÂÃ²Ð¢&WGW&âfÇ6S°¢Ð ¢òò)H)H&W7VÇFFò²Ö&2Ö&6Ò†ÖW&6Fò6öÖ&–æFò’)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H ¢–b†Ö&¶WD¶W’ÓÓÒ'&W7VÇG2ö&÷F‚FV×266÷&R"’°¢òò÷WF6öÖS¢%&W7VÇG2ô&÷F‚FV×266÷&RÔ†öÖRõ–W2"(i"7G&—&Vf—‚(i"&†öÖR÷–W2 ¢6öç7B&rÒ÷WF6öÖRç&WÆ6R‚õç&W7VÇG5Âö&÷F‚FV×266÷&RÓòö’Â""’çG&–Ò‚“°¢6öç7B6Æ6‚Ò&ræÆ7D–æFW„öb‚"ò"“°¢–b‡6Æ6‚ÓÓÒÓ’²6öç6öÆRæÆör†&W7VÇFFò´%EE3¢6Æ6‚ì:6òVæ6öçG&FòVÒ"G·&wÒ&“²&WGW&âfÇ6S²Ð¢6öç7B&W7VÇE–6²Ò&rç6Æ–6RƒÂ6Æ6‚’çFôÆ÷vW$66R‚’çG&–Ò‚“°¢6öç7B'GG5–6²Ò&rç6Æ–6R‡6Æ6‚²’çFôÆ÷vW$66R‚’çG&–Ò‚“°¢6öç7B'GG2Ò†öÖTvöÇ2âbbv”vöÇ2â°¢6öç7B'GG5vöâÒ'GG5–6²æ–æ6ÇVFW2‚'–W2"’ÇÂ'GG5–6²æ–æ6ÇVFW2‚'6–Ò"’ò'GG2¢'GG3°¢ÆWB&W7VÇEvöã¢&ööÆVã°¢–b‡&W7VÇE–6²ÓÓÒ&†öÖR"ÇÂ&W7VÇE–6²ÓÓÒ&66"’&W7VÇEvöâÒ†öÖTvöÇ2âv”vöÇ3°¢VÇ6R–b‡&W7VÇE–6²ÓÓÒ&v’"ÇÂ&W7VÇE–6²ÓÓÒ&f÷&"’&W7VÇEvöâÒv”vöÇ2â†öÖTvöÇ3°¢VÇ6R&W7VÇEvöâÒ†öÖTvöÇ2ÓÓÒv”vöÇ3²òòG&röV×FP¢6öç6öÆRæÆör†&W7VÇFFò´%EE3¢–6³Ò"G·&W7VÇE–6·ÒòG¶'GG5–6·Ò"ÂÆ6#ÒG¶†öÖTvöÇ7ÒÒG¶v”vöÇ7ÒÂ'GG3ÒG¶'GG7ÒÂ&W7VÇEvöãÒG·&W7VÇEvöçÒÂ'GG5vöãÒG¶'GG5vöçÖ“°¢&WGW&â&W7VÇEvöâbb'GG5vöã°¢Ð ¢òò)H)HÖ&2Ö&6Ò„%EE2Â+¢FV×òÂ,+¢FV×ò’)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H ¢–b†Ö&¶WD¶W’æ–æ6ÇVFW2‚&&÷F‚FV×266÷&R"’ÇÂÖ&¶WD¶W’æ–æ6ÇVFW2‚&&÷F‚FV×2Fò66÷&R"’ÇÂÖ&¶WD¶W’æ–æ6ÇVFW2‚&'GG2"’’°¢ÆWB„s¢çVÖ&W"Âs¢çVÖ&W#°¢–b†Ö&¶WD¶W’æ–æ6ÇVFW2‚&f—'7B†Æb"’’°¢–b†‡D†öÖTvöÇ2ÓÓÒçVÆÂÇÂ‡Dv”vöÇ2ÓÓÒçVÆÂ’²6öç6öÆRæÆör†%EE2+¥C¢FF÷2…B–æF—7öì:×fV—6“²&WGW&âçVÆÃ²Ð¢„rÒ‡D†öÖTvöÇ3²rÒ‡Dv”vöÇ3°¢ÒVÇ6R–b†Ö&¶WD¶W’æ–æ6ÇVFW2‚'6V6öæB†Æb"’’°¢–b†‡D†öÖTvöÇ2ÓÓÒçVÆÂÇÂ‡Dv”vöÇ2ÓÓÒçVÆÂ’²6öç6öÆRæÆör†%EE2,+¥C¢FF÷2…B–æF—7öì:×fV—6“²&WGW&âçVÆÃ²Ð¢„rÒ†öÖTvöÇ2Ò‡D†öÖTvöÇ3²rÒv”vöÇ2Ò‡Dv”vöÇ3°¢ÒVÇ6R°¢„rÒ†öÖTvöÇ3²rÒv”vöÇ3°¢Ð¢6öç6öÆRæÆör†%EE3¢W,:ÖöFóÒ"G¶Ö&¶WD¶W—Ò"ÂvöÇ2G¶„wÒÒG¶wÖ“°¢–b†÷WF6öÖRæ–æ6ÇVFW2‚'–W2"’ÇÂ÷WF6öÖRæ–æ6ÇVFW2‚'6–Ò"’’&WGW&â„râbbrâ°¢–b†÷WF6öÖRæ–æ6ÇVFW2‚&æò"’ÇÂ÷WF6öÖRæ–æ6ÇVFW2‚&ì:6ò"’ÇÂ÷WF6öÖRæ–æ6ÇVFW2‚&æò"’’&WGW&â„rÓÓÒÇÂrÓÓÒ°¢&WGW&âfÇ6S°¢Ð ¢òò)H)HÆ6"W†Fò)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H ¢–b†Ö&¶WD¶W’æ–æ6ÇVFW2‚&W†7B66÷&R"’ÇÂÖ&¶WD¶W’æ–æ6ÇVFW2‚&6÷'&V7B66÷&R"’’°¢6öç7BÒÒ÷WF6öÖRæÖF6‚‚ò…ÆB²•Ç2¥³¥ÂÕÕÇ2¢…ÆB²’ò“°¢–b†Ò’°¢6öç7Bö²Ò'6T–çB†Õ³Ò’ÓÓÒ†öÖTvöÇ2bb'6T–çB†Õ³%Ò’ÓÓÒv”vöÇ3°¢6öç6öÆRæÆör†Æ6"W†Fó¢G¶Õ³×ÒÒG¶Õ³%×Òg2G¶†öÖTvöÇ7ÒÒG¶v”vöÇ7ÒÒG¶ö·Ö“°¢&WGW&âö³°¢Ð¢&WGW&âfÇ6S°¢Ð ¢òò)H)H6'L:6òfW&ÖVÆ†ò†¦övò–çFV—&ò÷R+¢FV×ò’)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H ¢–b†Ö&¶WD¶W’æ–æ6ÇVFW2‚'&VB6&B"’’°¢6öç7B—3‚ÒÖ&¶WD¶W’æ–æ6ÇVFW2‚#7B†Æb"’ÇÂÖ&¶WD¶W’æ–æ6ÇVFW2‚&f—'7B†Æb"“°¢6öç7B&5fÇVRÒ—3‚ò†5&VD6&C‚¢†5&VD6&C°¢–b‡&5fÇVRÓÓÒçVÆÂ’°¢6öç6öÆRæÆör†&VB6&BG¶—3‚ò"+¥B"¢"'Ó¢FF÷2FRWfVçF÷2ì:6òF—7öì:×fV—6“°¢&WGW&âçVÆÃ°¢Ð¢6öç7B–6¶VE6–ÒÒ÷WF6öÖRæ–æ6ÇVFW2‚'6–Ò"’ÇÂ÷WF6öÖRæ–æ6ÇVFW2‚'–W2"“°¢6öç7B–6¶VDæòÒ÷WF6öÖRæ–æ6ÇVFW2‚&ì:6ò"’ÇÂ÷WF6öÖRæ–æ6ÇVFW2‚&æò"’ÇÂ÷WF6öÖRæ–æ6ÇVFW2‚&æò"“°¢–b‡–6¶VE6–Ò’²6öç6öÆRæÆör†&VB6&BG¶—3‚ò"+¥B"¢"'Ó¢÷7F÷R6–ÒÂ†÷WfR6'L:6ó¢G·&5fÇVWÖ“²&WGW&â&5fÇVS²Ð¢–b‡–6¶VDæò’²6öç6öÆRæÆör†&VB6&BG¶—3‚ò"+¥B"¢"'Ó¢÷7F÷Rì:6òÂ†÷WfR6'L:6ó¢G·&5fÇVWÖ“²&WGW&â&5fÇVS²Ð¢&WGW&âfÇ6S°¢Ð ¢òò)H)H&–ÖV—&WV—RÖ&6")H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H ¢–b†Ö&¶WD¶W’æ–æ6ÇVFW2‚'FVÒFò66÷&Rf—'7B"’ÇÂÖ&¶WD¶W’æ–æ6ÇVFW2‚'66÷&Rf—'7B"’’°¢–b†f—'7E66÷&W%FVÒÓÓÒçVÆÂ’°¢òòçVÆÂÒfÆ†ò'W66"WfVçF÷2(i"ÖçL:–ÒVæFVçFP¢6öç6öÆRæÆör†FVÒFò66÷&Rf—'7C¢FF÷2FRWfVçF÷2ì:6òF—7öì:×fV—6“°¢&WGW&âçVÆÃ°¢Ð¢6öç7Bö4Æ2Ò6VÆV7F–öâæ÷WF6öÖRçFôÆ÷vW$66R‚’çG&–Ò‚“°¢6öç7B–6¶VDæôvöÂÒö4Æ2æ–æ6ÇVFW2‚&æòvöÂ"’ÇÂö4Æ2æ–æ6ÇVFW2‚'6VÒvöÂ"’ÇÂö4Æ2æ–æ6ÇVFW2‚&æVæ‡VÒ"“°¢6öç7B–6¶VD†öÖRÒö4Æ2ÓÓÒ&†öÖR"ÇÂö4Æ2ÓÓÒ&66"ÇÂö4Æ2æVæG5v—F‚‚"Ö†öÖR"’ÇÂö4Æ2æVæG5v—F‚‚"†öÖR"’ÇÂFV×4ÖF6‚‡6VÆV7F–öâæ÷WF6öÖRÂ†öÖUFVÔæÖR’ÇÂFV×4ÖF6‚‡6VÆV7F–öâæ÷WF6öÖRÂ6VÆV7F–öâæ†öÖUFVÒ“°¢6öç7B–6¶VDv’Òö4Æ2ÓÓÒ&v’"ÇÂö4Æ2ÓÓÒ&f÷&"ÇÂö4Æ2ÓÓÒ'f—6—FçFR"ÇÂö4Æ2æVæG5v—F‚‚"Öv’"’ÇÂö4Æ2æVæG5v—F‚‚"v’"’ÇÂFV×4ÖF6‚‡6VÆV7F–öâæ÷WF6öÖRÂv•FVÔæÖR’ÇÂFV×4ÖF6‚‡6VÆV7F–öâæ÷WF6öÖRÂ6VÆV7F–öâæv•FVÒ“°¢–b†f—'7E66÷&W%FVÒÓÓÒ""’°¢òòƒ(	B6VÒvöÇ3¢FöF÷2W&FVÐ¢6öç6öÆRæÆör†7B66÷&W#¢¦övò6VÒvöÇ2ƒƒ’(i"W&F–Fö“°¢&WGW&âfÇ6S°¢Ð¢6öç7B66÷&VD†öÖRÒFV×4ÖF6‚†f—'7E66÷&W%FVÒÂ†öÖUFVÔæÖR“°¢6öç7B66÷&VDv’ÒFV×4ÖF6‚†f—'7E66÷&W%FVÒÂv•FVÔæÖR“°¢–b‡–6¶VDæôvöÂ’²6öç6öÆRæÆör†7B66÷&W#¢÷7F÷R6VÒvöÂÖ2†÷WfRvöÂ(i"W&F–Fö“²&WGW&âfÇ6S²Ð¢–b‡–6¶VD†öÖR’²6öç6öÆRæÆör†7B66÷&W#¢÷7F÷R66ÂÖ&6÷RG¶f—'7E66÷&W%FV×Ó¢G·66÷&VD†öÖWÖ“²&WGW&â66÷&VD†öÖS²Ð¢–b‡–6¶VDv’’²6öç6öÆRæÆör†7B66÷&W#¢÷7F÷Rf—6—FçFRÂÖ&6÷RG¶f—'7E66÷&W%FV×Ó¢G·66÷&VDv—Ö“²&WGW&â66÷&VDv“²Ð¢6öç6öÆRæÆör†7B66÷&W#¢ì:6ò–FVçF–f–6÷RF–ÖRæò÷WF6öÖR"G·6VÆV7F–öâæ÷WF6öÖWÒ&“°¢&WGW&âfÇ6S°¢Ð ¢òò)H)HfVæ6VF÷"Fò+¢FV×ò)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H ¢–b†Ö&¶WD¶W’ÓÓÒ&f—'7B†Æbv–ææW""’°¢–b†‡D†öÖTvöÇ2ÓÓÒçVÆÂÇÂ‡Dv”vöÇ2ÓÓÒçVÆÂ’²6öç6öÆRæÆör†f—'7B†Æbv–ææW#¢FF÷2…B–æF—7öì:×fV—6“²&WGW&âçVÆÃ²Ð¢6öç7Bö3"Ò÷WF6öÖRçG&–Ò‚“°¢–b†ö3"æ–æ6ÇVFW2‚&G&r"’ÇÂö3"æ–æ6ÇVFW2‚&V×FR"’ÇÂö3"ÓÓÒ'‚"’²6öç7B"Ò‡D†öÖTvöÇ2ÓÓÒ‡Dv”vöÇ3²6öç6öÆRæÆör†d…s¢÷7F÷RV×FRÂ…CÒG¶‡D†öÖTvöÇ7ÒÒG¶‡Dv”vöÇ7Ò(i"G·'Ö“²&WGW&â#²Ð¢–b†ö3"æ–æ6ÇVFW2‚&†öÖR"’ÇÂö3"æ–æ6ÇVFW2‚&66"’’²6öç7B"Ò‡D†öÖTvöÇ2â‡Dv”vöÇ3²6öç6öÆRæÆör†d…s¢÷7F÷R66Â…CÒG¶‡D†öÖTvöÇ7ÒÒG¶‡Dv”vöÇ7Ò(i"G·'Ö“²&WGW&â#²Ð¢–b†ö3"æ–æ6ÇVFW2‚&v’"’ÇÂö3"æ–æ6ÇVFW2‚&f÷&"’ÇÂö3"æ–æ6ÇVFW2‚'f—6—FçFR"’’²6öç7B"Ò‡Dv”vöÇ2â‡D†öÖTvöÇ3²6öç6öÆRæÆör†d…s¢÷7F÷Rf÷&Â…CÒG¶‡D†öÖTvöÇ7ÒÒG¶‡Dv”vöÇ7Ò(i"G·'Ö“²&WGW&â#²Ð¢6öç6öÆRæÆör†d…s¢÷WF6öÖRì:6ò&V6öæ†V6–Fò"G¶÷WF6öÖWÒ&“²&WGW&âfÇ6S°¢Ð ¢òò)H)HF÷FÂFRvöÇ2FRVÒF–ÖR…F÷FÂÒ†öÖRòF÷FÂÒv’’)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H ¢–b†Ö&¶WD¶W’ÓÓÒ'F÷FÂÒ†öÖR"ÇÂÖ&¶WD¶W’ÓÓÒ'F÷FÂÒv’"’°¢6öç7BFVÔvöÇ2ÒÖ&¶WD¶W’ÓÓÒ'F÷FÂÒ†öÖR"ò†öÖTvöÇ2¢v”vöÇ3°¢6öç7B÷fW$ÒÒ÷WF6öÖRæÖF6‚‚ö÷fW%Ç2¢…ÆBµÂãõÆB¢’ö’“°¢6öç7BVæFW$ÒÒ÷WF6öÖRæÖF6‚‚÷VæFW%Ç2¢…ÆBµÂãõÆB¢’ö’“°¢–b†÷fW$Ò’²6öç7B"ÒFVÔvöÇ2â'6TfÆöB†÷fW$Õ³Ò“²6öç6öÆRæÆör†G¶Ö&¶WD¶W—Ó¢÷fW"G¶÷fW$Õ³×ÒÂvöÇ3ÒG·FVÔvöÇ7Ò(i"G·'Ö“²&WGW&â#²Ð¢–b‡VæFW$Ò’²6öç7B"ÒFVÔvöÇ2Â'6TfÆöB‡VæFW$Õ³Ò“²6öç6öÆRæÆör†G¶Ö&¶WD¶W—Ó¢VæFW"G·VæFW$Õ³×ÒÂvöÇ3ÒG·FVÔvöÇ7Ò(i"G·'Ö“²&WGW&â#²Ð¢6öç6öÆRæÆör†G¶Ö&¶WD¶W—Ó¢÷WF6öÖRì:6ò&V6öæ†V6–Fò"G¶÷WF6öÖWÒ&“²&WGW&âfÇ6S°¢Ð ¢òò)H)HÖW&6F÷2FR6'L;VW2„6&G2÷fW"õVæFW"Â6&G2Ò†öÖRÂ6&G2Òv’’)H)H)H)H ¢–b†Ö&¶WD¶W’æ–æ6ÇVFW2‚&6&G2"’bbÖ&¶WD¶W’æ–æ6ÇVFW2‚'&VB6&B"’’°¢–b††öÖT6&G2ÓÓÒçVÆÂÇÂv”6&G2ÓÓÒçVÆÂ’²6öç6öÆRæÆör†6&G3¢FF÷2FR6'L;VW2–æF—7öì:×fV—6“²&WGW&âçVÆÃ²Ð¢ÆWB6&EF÷FÃ¢çVÖ&W#°¢–b†Ö&¶WD¶W’ÓÓÒ&6&G2Ò†öÖR"ÇÂÖ&¶WD¶W’ÓÓÒ&†öÖRFVÒF÷FÂ6&G2"’6&EF÷FÂÒ†öÖT6&G3°¢VÇ6R–b†Ö&¶WD¶W’ÓÓÒ&6&G2Òv’"ÇÂÖ&¶WD¶W’ÓÓÒ&v’FVÒF÷FÂ6&G2"’6&EF÷FÂÒv”6&G3°¢VÇ6R6&EF÷FÂÒ†öÖT6&G2²v”6&G3²òò6&G2÷fW"÷VæFW ¢6öç7B÷fW$ÒÒ÷WF6öÖRæÖF6‚‚ö÷fW%Ç2¢…ÆBµÂãõÆB¢’ö’“°¢6öç7BVæFW$ÒÒ÷WF6öÖRæÖF6‚‚÷VæFW%Ç2¢…ÆBµÂãõÆB¢’ö’“°¢–b†÷fW$Ò’²6öç7B"Ò6&EF÷FÂâ'6TfÆöB†÷fW$Õ³Ò“²6öç6öÆRæÆör†6&G2÷fW"G¶÷fW$Õ³×Ó¢F÷FÃÒG¶6&EF÷FÇÒ(i"G·'Ö“²&WGW&â#²Ð¢–b‡VæFW$Ò’²6öç7B"Ò6&EF÷FÂÂ'6TfÆöB‡VæFW$Õ³Ò“²6öç6öÆRæÆör†6&G2VæFW"G·VæFW$Õ³×Ó¢F÷FÃÒG¶6&EF÷FÇÒ(i"G·'Ö“²&WGW&â#²Ð¢6öç6öÆRæÆör†6&G3¢÷WF6öÖRì:6ò&V6öæ†V6–Fò"G¶÷WF6öÖWÒ&“²&WGW&âfÇ6S°¢Ð ¢òò)H)HÖW&6F÷2òf—fò†Æ—fUöÒ¢’)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H ¢òòÖ&¶WD¶W’6Çfò6öÖò&Æ—fUöÓ"Â&Æ—fUöÓR"WF2â(	B÷WF6öÖW2<:6òfÆ÷&W2''WF÷0¢òòF’Ôfö÷F&ÆÃ¢$†öÖR"Â$G&r"Â$v’"Â$÷fW"ãR"Â%VæFW""ãR"Â%–W2"Â$æò"À¢òò$†öÖRôG&r"Â$vöÇ2ô÷fW"ãR"Â$6÷&æW'22Õv’ô÷fW"’ãR"Â$6&G2ô÷fW"BãR"WF2à¢–b†Ö&¶WD¶W’ç7F'G5v—F‚‚&Æ—fUöÒ"’’°¢6öç7BÆ—fT–BÒ'6T–çB†Ö&¶WD¶W’ç6Æ–6Rƒb’Â“°¢6öç7B—4†öÖTö2Ò÷WF6öÖRÓÓÒ&†öÖR#°¢6öç7B—4v”ö2Ò÷WF6öÖRÓÓÒ&v’#°¢6öç7B—4G&tö2Ò÷WF6öÖRÓÓÒ&G&r"ÇÂ÷WF6öÖRÓÓÒ'‚#°¢6öç7B÷fW$ÒÒ÷WF6öÖRæÖF6‚‚ö÷fW%Ç2¢…µÆBåÒ²’ö’“°¢6öç7BVæFW$ÒÒ÷WF6öÖRæÖF6‚‚÷VæFW%Ç2¢…µÆBåÒ²’ö’“° ¢òòÆ—fUöÓ¢&W7VÇFFòf–æÂƒƒ"¢–b†Æ—fT–BÓÓÒ’°¢–b†—4G&tö2’&WGW&â†öÖTvöÇ2ÓÓÒv”vöÇ3°¢–b†—4†öÖTö2’&WGW&â†öÖTvöÇ2âv”vöÇ3°¢–b†—4v”ö2’&WGW&âv”vöÇ2â†öÖTvöÇ3°¢6öç6öÆRæÆör†Æ—fRÓ¢÷WF6öÖRì:6ò&V6öæ†V6–Fò"G·6VÆV7F–öâæ÷WF6öÖWÒ&“²&WGW&âfÇ6S°¢Ð ¢òòÆ—fUöÓRòÆ—fUöÓ#S¢vöÇ2÷fW"õVæFW"‡FV×ò–çFV—&ò¢–b†Æ—fT–BÓÓÒRÇÂÆ—fT–BÓÓÒ#R’°¢–b†÷fW$Ò’&WGW&âF÷FÄvöÇ2â'6TfÆöB†÷fW$Õ³Ò“°¢–b‡VæFW$Ò’&WGW&âF÷FÄvöÇ2Â'6TfÆöB‡VæFW$Õ³Ò“°¢6öç6öÆRæÆör†Æ—fRÒG¶Æ—fT–GÓ¢÷WF6öÖRì:6ò&V6öæ†V6–Fò"G·6VÆV7F–öâæ÷WF6öÖWÒ&“²&WGW&âfÇ6S°¢Ð ¢òòÆ—fUöÓƒ¢Ö&2Ö&6Ò…–W2ôæò¢–b†Æ—fT–BÓÓÒ‚’°¢6öç7B'GG2Ò†öÖTvöÇ2âbbv”vöÇ2â°¢–b†÷WF6öÖRæ–æ6ÇVFW2‚'–W2"’ÇÂ÷WF6öÖRæ–æ6ÇVFW2‚'6–Ò"’’&WGW&â'GG3°¢–b†÷WF6öÖRæ–æ6ÇVFW2‚&æò"’ÇÂ÷WF6öÖRæ–æ6ÇVFW2‚&ì:6ò"’ÇÂ÷WF6öÖRæ–æ6ÇVFW2‚&æò"’’&WGW&â'GG3°¢6öç6öÆRæÆör†Æ—fRÓƒ¢÷WF6öÖRì:6ò&V6öæ†V6–Fò"G·6VÆV7F–öâæ÷WF6öÖWÒ&“²&WGW&âfÇ6S°¢Ð ¢òòÆ—fUöÓ3¢fVæ6VF÷"+¢FV×ð¢–b†Æ—fT–BÓÓÒ2’°¢–b†‡D†öÖTvöÇ2ÓÓÒçVÆÂÇÂ‡Dv”vöÇ2ÓÓÒçVÆÂ’²6öç6öÆRæÆör†Æ—fRÓ3¢FF÷2…B–æF—7öì:×fV—6“²&WGW&âçVÆÃ²Ð¢–b†—4G&tö2’&WGW&â‡D†öÖTvöÇ2ÓÓÒ‡Dv”vöÇ3°¢–b†—4†öÖTö2’&WGW&â‡D†öÖTvöÇ2â‡Dv”vöÇ3°¢–b†—4v”ö2’&WGW&â‡Dv”vöÇ2â‡D†öÖTvöÇ3°¢6öç6öÆRæÆör†Æ—fRÓ3¢÷WF6öÖRì:6ò&V6öæ†V6–Fò"G·6VÆV7F–öâæ÷WF6öÖWÒ&“²&WGW&âfÇ6S°¢Ð ¢òòÆ—fUöÓ3¢fVæ6VF÷",+¢FV×ð¢–b†Æ—fT–BÓÓÒ2’°¢–b†‡D†öÖTvöÇ2ÓÓÒçVÆÂÇÂ‡Dv”vöÇ2ÓÓÒçVÆÂ’²6öç6öÆRæÆör†Æ—fRÓ3¢FF÷2…B–æF—7öì:×fV—6“²&WGW&âçVÆÃ²Ð¢6öç7Bƒ"Ò†öÖTvöÇ2Ò‡D†öÖTvöÇ3°¢6öç7B"Òv”vöÇ2Ò‡Dv”vöÇ3°¢–b†—4G&tö2’&WGW&âƒ"ÓÓÒ#°¢–b†—4†öÖTö2’&WGW&âƒ"â#°¢–b†—4v”ö2’&WGW&â"âƒ#°¢6öç6öÆRæÆör†Æ—fRÓ3¢÷WF6öÖRì:6ò&V6öæ†V6–Fò"G·6VÆV7F–öâæ÷WF6öÖWÒ&“²&WGW&âfÇ6S°¢Ð ¢òòÆ—fUöÓc¢÷fW"õVæFW"+¢FV×ò†vöÇ2¢–b†Æ—fT–BÓÓÒb’°¢–b†‡D†öÖTvöÇ2ÓÓÒçVÆÂÇÂ‡Dv”vöÇ2ÓÓÒçVÆÂ’²6öç6öÆRæÆör†Æ—fRÓc¢FF÷2…B–æF—7öì:×fV—6“²&WGW&âçVÆÃ²Ð¢6öç7B‡EF÷FÂÒ‡D†öÖTvöÇ2²‡Dv”vöÇ3°¢–b†÷fW$Ò’&WGW&â‡EF÷FÂâ'6TfÆöB†÷fW$Õ³Ò“°¢–b‡VæFW$Ò’&WGW&â‡EF÷FÂÂ'6TfÆöB‡VæFW$Õ³Ò“°¢6öç6öÆRæÆör†Æ—fRÓc¢÷WF6öÖRì:6ò&V6öæ†V6–Fò"G·6VÆV7F–öâæ÷WF6öÖWÒ&“²&WGW&âfÇ6S°¢Ð ¢òòÆ—fUöÓ#¢GWÆ6†æ6R„†öÖRôG&rÂ†öÖRôv’ÂG&rôv’¢–b†Æ—fT–BÓÓÒ"’°¢–b‚†÷WF6öÖRæ–æ6ÇVFW2‚&†öÖR"’bb÷WF6öÖRæ–æ6ÇVFW2‚&G&r"’’ÇÂ÷WF6öÖRÓÓÒ#‚"’&WGW&â†öÖTvöÇ2ãÒv”vöÇ3°¢–b‚†÷WF6öÖRæ–æ6ÇVFW2‚&†öÖR"’bb÷WF6öÖRæ–æ6ÇVFW2‚&v’"’’ÇÂ÷WF6öÖRÓÓÒ#""’&WGW&â†öÖTvöÇ2ÓÒv”vöÇ3°¢–b‚†÷WF6öÖRæ–æ6ÇVFW2‚&G&r"’bb÷WF6öÖRæ–æ6ÇVFW2‚&v’"’’ÇÂ÷WF6öÖRÓÓÒ'ƒ""’&WGW&âv”vöÇ2ãÒ†öÖTvöÇ3°¢6öç6öÆRæÆör†Æ—fRÓ#¢÷WF6öÖRì:6ò&V6öæ†V6–Fò"G·6VÆV7F–öâæ÷WF6öÖWÒ&“²&WGW&âfÇ6S°¢Ð ¢òòÆ—fUöÓ#¢W66çFV–÷2÷fW"õVæFW ¢–b†Æ—fT–BÓÓÒ#’°¢–b‡F÷FÄ6÷&æW'2ÓÓÒçVÆÂ’²6öç6öÆRæÆör†Æ—fRÓ#¢FF÷2FRW66çFV–÷2–æF—7öì:×fV—6“²&WGW&âçVÆÃ²Ð¢–b†÷fW$Ò’&WGW&âF÷FÄ6÷&æW'2â'6TfÆöB†÷fW$Õ³Ò“°¢–b‡VæFW$Ò’&WGW&âF÷FÄ6÷&æW'2Â'6TfÆöB‡VæFW$Õ³Ò“°¢6öç6öÆRæÆör†Æ—fRÓ#¢÷WF6öÖRì:6ò&V6öæ†V6–Fò"G·6VÆV7F–öâæ÷WF6öÖWÒ&“²&WGW&âfÇ6S°¢Ð ¢òòÆ—fUöÓ“¢F÷FÂ6'L;VW2÷fW"õVæFW ¢–b†Æ—fT–BÓÓÒ’’°¢–b††öÖT6&G2ÓÓÒçVÆÂÇÂv”6&G2ÓÓÒçVÆÂ’²6öç6öÆRæÆör†Æ—fRÓ“¢FF÷2FR6'L;VW2–æF—7öì:×fV—6“²&WGW&âçVÆÃ²Ð¢6öç7BF÷FÄ6&G2Ò†öÖT6&G2²v”6&G3°¢–b†÷fW$Ò’&WGW&âF÷FÄ6&G2â'6TfÆöB†÷fW$Õ³Ò“°¢–b‡VæFW$Ò’&WGW&âF÷FÄ6&G2Â'6TfÆöB‡VæFW$Õ³Ò“°¢6öç6öÆRæÆör†Æ—fRÓ“¢÷WF6öÖRì:6ò&V6öæ†V6–Fò"G·6VÆV7F–öâæ÷WF6öÖWÒ&“²&WGW&âfÇ6S°¢Ð ¢òòÆ—fUöÓcS¢,;7†–Ö÷2Ö–â(	Bì:6ò&W6öÇl:×fVÂWFöÖF–6ÖVçFRÂFÖ–â&W6öÇfRÖçVÆÖVçFP¢–b†Æ—fT–BÓÓÒcR’°¢6öç6öÆRæÆör†Æ—fRÓcR…,;7†–Ö÷2Ö–â“¢wV&F&W6öÇ\:|:6òÖçVÆ“°¢&WGW&âçVÆÃ°¢Ð ¢òò÷WG&÷2Æ—fRÖ&¶WG2ì:6òÖVF÷2(i"FV—†VæFVçFR&&W6öÇ\:|:6òÖçVÀ¢6öç6öÆRæÆör†Æ—fRÖ&¶WB–CÒG¶Æ—fT–GÒì:6òÖVFòÂwV&F&W6öÇ\:|:6òÖçVÆ“°¢&WGW&âçVÆÃ°¢Ð ¢òò)H)HGWÆ6†æ6R)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H ¢–b†Ö&¶WD¶W’ÓÓÒ&F÷V&ÆUö6†æ6R"’°¢6öç7Bö5G&–ÒÒ÷WF6öÖRç&WÆ6R‚õæF÷V&ÆUö6†æ6U²Ó¥Ç5Ò¢ö’Â""’çG&–Ò‚“°¢–b†ö5G&–ÒÓÓÒ#‚"’²6öç7B"Ò†öÖTvöÇ2ãÒv”vöÇ3²6öç6öÆRæÆör†GWÆ6†æ6Rƒ¢G¶†öÖTvöÇ7ÒÒG¶v”vöÇ7Ò(i"G·'Ö“²&WGW&â#²Ð¢–b†ö5G&–ÒÓÓÒ'ƒ""’²6öç7B"Òv”vöÇ2ãÒ†öÖTvöÇ3²6öç6öÆRæÆör†GWÆ6†æ6Rƒ#¢G¶†öÖTvöÇ7ÒÒG¶v”vöÇ7Ò(i"G·'Ö“²&WGW&â#²Ð¢–b†ö5G&–ÒÓÓÒ#""’²6öç7B"Ò†öÖTvöÇ2ÓÒv”vöÇ3²6öç6öÆRæÆör†GWÆ6†æ6R#¢G¶†öÖTvöÇ7ÒÒG¶v”vöÇ7Ò(i"G·'Ö“²&WGW&â#²Ð¢6öç6öÆRæÆör†GWÆ6†æ6S¢÷WF6öÖRì:6ò&V6öæ†V6–Fò"G¶÷WF6öÖWÒ&“²&WGW&âfÇ6S°¢Ð ¢òò)H)HÖ—2ôÖVæ÷2vöÇ2‡F÷FÇ2’)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H ¢–b†Ö&¶WD¶W’ÓÓÒ'F÷FÇ2"’°¢6öç7BF÷FÂÒ†öÖTvöÇ2²v”vöÇ3°¢6öç7BÖ—4ÖF6‚Ò÷WF6öÖRæÖF6‚‚õæÖ—5Ç2¢…µÆBåÒ²’Bö’“°¢6öç7BÖVæ÷4ÖF6‚Ò÷WF6öÖRæÖF6‚‚õæÖVæ÷5Ç2¢…µÆBåÒ²’Bö’“°¢–b†Ö—4ÖF6‚’²6öç7B"ÒF÷FÂâ'6TfÆöB†Ö—4ÖF6…³Ò“²6öç6öÆRæÆör†F÷FÇ2Ö—2G¶Ö—4ÖF6…³×Ó¢F÷FÃÒG·F÷FÇÒ(i"G·'Ö“²&WGW&â#²Ð¢–b†ÖVæ÷4ÖF6‚’²6öç7B"ÒF÷FÂÂ'6TfÆöB†ÖVæ÷4ÖF6…³Ò“²6öç6öÆRæÆör†F÷FÇ2ÖVæ÷2G¶ÖVæ÷4ÖF6…³×Ó¢F÷FÃÒG·F÷FÇÒ(i"G·'Ö“²&WGW&â#²Ð¢6öç6öÆRæÆör†F÷FÇ3¢÷WF6öÖRì:6ò&V6öæ†V6–Fò"G¶÷WF6öÖWÒ&“²&WGW&âfÇ6S°¢Ð ¢6öç6öÆRæÆör†ÖW&6Fòì:6ò&V6öæ†V6–Fó¢Ö³Ò"G¶Ö&¶WD¶W—Ò"Â÷WF6öÖSÒ"G·6VÆV7F–öâæ÷WF6öÖWÒ&“°¢&WGW&âfÇ6S°§Ð  