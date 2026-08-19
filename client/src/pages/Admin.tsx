 "text-red-400", icon: <AlertOctagon className="w-6 h-6" />, bg: "bg-red-500/10 border-red-500/30" };
    return { label: "Defender integralmente", color: "text-red-500", icon: <Siren className="w-6 h-6" />, bg: "bg-red-600/15 border-red-500/40" };
  };

  const acao = ifaFinal > 0 ? getAcao(ifaFinal) : null;
  const hasResult = aporteNum > 0 && oddNum > 0 && caixaNum > 0;

  const betsNeedingDefense = useMemo(() => {
    if (!pendingBets.length || caixaNum <= 0) return [];
    const allLucro = pendingBets.reduce((sum, b) => sum + Math.max(0, (b.stake ?? 0) * (b.totalOdds ?? 1) - (b.stake ?? 0)), 0);
    return pendingBets
      .map(bet => {
        const o = bet.totalOdds ?? 1;
        const s = bet.stake ?? 0;
        const prob = o > 0 ? (1 / o) * 100 : 0;
        const lucro = Math.max(0, s * o - s);
        const impact = caixaNum > 0 ? (lucro / caixaNum) * 100 : 0;
        const ipB = getIP(prob);
        const icB = getIC(impact);
        const ifaB = ipB * icB;

        const sels: any[] = Array.isArray(bet.selections) ? bet.selections : [];
        const gameIds = new Set(sels.map((s: any) => s.gameId).filter(Boolean));
        const correlatedCount = pendingBets.filter(b => {
          if (b.id === bet.id) return false;
          return (Array.isArray(b.selections) ? b.selections : []).some((s: any) => gameIds.has(s.gameId));
        }).length;
        const eventExposure = pendingBets
          .filter(b => (Array.isArray(b.selections) ? b.selections : []).some((s: any) => gameIds.has(s.gameId)))
          .reduce((sum, b) => sum + Math.max(0, (b.stake ?? 0) * (b.totalOdds ?? 1) - (b.stake ?? 0)), 0);
        const expPct = caixaNum > 0 ? (eventExposure / caixaNum) * 100 : 0;
        const clientConc = allLucro > 0 ? lucro / allLucro : 0;
        const otherCount = pendingBets.filter(b => b.id !== bet.id).length;

        const feRawB =
          (correlatedCount >= 1 ? 1 : 0) +
          (correlatedCount >= 2 ? 2 : 0) +
          (expPct > 6 ? 1 : 0) +
          (expPct > 10 ? 2 : 0) +
          (clientConc > 0.3 ? 1 : 0) +
          (otherCount < 5 ? 1 : 0);
        const feB = Math.min(feRawB, 5);
        const ifaTotal = Math.min(ifaB + feB, 25);

        return { bet, ifa: ifaTotal, acao: getAcao(ifaTotal) };
      })
      .filter(({ ifa }) => ifa >= 17)
      .sort((a, b) => b.ifa - a.ifa);
  }, [pendingBets, caixaNum]);

  const scaleRows = [
    { range: "1â€“4", lo: 1, hi: 4, label: "NÃ£o defender", color: "bg-green-500" },
    { range: "5â€“8", lo: 5, hi: 8, label: "Deixar a variÃ¢ncia atuar", color: "bg-blue-500" },
    { range: "9â€“12", lo: 9, hi: 12, label: "Monitorar", color: "bg-yellow-500" },
    { range: "13â€“16", lo: 13, hi: 16, label: "Avaliar hedge", color: "bg-orange-500" },
    { range: "17â€“20", lo: 17, hi: 20, label: "Defender parcialmente", color: "bg-red-400" },
    { range: "21â€“25", lo: 21, hi: 25, label: "Defender integralmente", color: "bg-red-600" },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="w-5 h-5 text-red-400" />
              Bilhetes para Defender
              {betsNeedingDefense.length > 0 && (
                <Badge className="bg-red-500/20 text-red-300 border-red-500/30 text-xs">
                  {betsNeedingDefense.length}
                </Badge>
              )}
            </CardTitle>
            <span className="text-[11px] text-muted-foreground">Caixa base: R$ {caixaNum.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Bilhetes pendentes com IFA â‰¥ 17 calculado automaticamente. Ajuste o caixa no motor de decisÃ£o abaixo.</p>
        </CardHeader>
        <CardContent>
          {caixaNum <= 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground gap-2">
              <Calculator className="w-10 h-10 opacity-20" />
              <p className="text-sm">Informe o caixa atual no motor de decisÃ£o abaixo para calcular automaticamente.</p>
            </div>
          ) : betsNeedingDefense.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground gap-2">
              <CheckCircle2 className="w-10 h-10 text-green-500 opacity-40" />
              <p className="text-sm font-medium text-green-400">Nenhum bilhete requer defesa no momento</p>
              <p className="text-xs">Todos os bilhetes pendentes tÃªm IFA abaixo de 17.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {betsNeedingDefense.map(({ bet, ifa, acao: betAcao }) => {
                const isExpanded = expandedDefensaId === bet.id;
                const sels: any[] = Array.isArray(bet.selections) ? bet.selections : [];
                const isIntegral = ifa > 20;
                return (
                  <div
                    key={bet.id}
                    className={`rounded-lg border transition-colors ${
                      isIntegral
                        ? "border-red-500/40 bg-red-600/10"
                        : "border-red-400/30 bg-red-500/8"
                    }`}
                  >
                    <div className="flex items-center gap-1 px-3 py-2.5">
                      <div className={`shrink-0 w-10 h-10 rounded-lg flex flex-col items-center justify-center ${isIntegral ? "bg-red-600/30 border border-red-500/40" : "bg-red-400/20 border border-red-400/30"}`}>
                        <span className={`text-[10px] font-medium opacity-70 leading-none ${isIntegral ? "text-red-300" : "text-red-400"}`}>IFA</span>
                        <span className={`text-base font-black leading-tight ${isIntegral ? "text-red-300" : "text-red-400"}`}>{ifa}</span>
                      </div>
                      <button onClick={() => handleSelectBet(bet)} className="flex-1 text-left px-3 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-sm text-foreground">#{(bet.id ?? "").slice(0, 8).toUpperCase()}</span>
                          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${isIntegral ? "bg-red-600/30 text-red-300" : "bg-red-400/20 text-red-400"}`}>{betAcao.label}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                          <span>R$ {(bet.stake ?? 0).toFixed(2).replace(".", ",")}</span>
                          <span>Odds {fmtOdds(bet.totalOdds)}x</span>
                          <span>Retorno R$ {(bet.potentialWin ?? 0).toFixed(2).replace(".", ",")}</span>
                          {sels.length > 0 && <span>{sels.length} seleÃ§{sels.length === 1 ? "Ã£o" : "Ãµes"}</span>}
                        </div>
                      </button>
                      {sels.length > 0 && (
                        <button onClick={() => setExpandedDefensaId(prev => prev === bet.id ? null : bet.id)} className="px-2 py-2 text-muted-foreground hover:text-foreground transition-colors shrink-0" data-testid={`button-expand-defensa-decisao-${bet.id}`}>
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                    {isExpanded && sels.length > 0 && (
                      <div className="mx-3 mb-3 space-y-0">
                        {sels.map((sel: any, idx: number) => (
                          <div key={sel.id ?? idx} className="flex gap-2">
                            <div className="flex flex-col items-center w-4 shrink-0 pt-1">
                              <div className={`w-2 h-2 rounded-full shrink-0 ${isIntegral ? "bg-red-400" : "bg-red-400/70"}`} />
                              {idx < sels.length - 1 && <div className="w-px flex-1 mt-0.5 bg-red-500/30" style={{ minHeight: "20px" }} />}
                            </div>
                            <div className="flex-1 mb-1.5 rounded px-2.5 py-2 text-[11px] bg-red-500/10 border border-red-500/20">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <p className="font-semibold leading-tight text-red-200">{sel.outcomeName ?? sel.outcome ?? sel.market ?? "â€”"}</p>
                                  <p className="text-muted-foreground text-[10px] mt-0.5 truncate">
                                    {[sel.homeTeam ?? sel.team, sel.awayTeam].filter(Boolean).join(" x ")}
                                    {sel.marketKey && <span className="ml-1 opacity-60">Â· {sel.marketKey}</span>}
                                  </p>
                                </div>
                                <span className="font-bold text-xs shrink-0 text-red-300">{fmtOdds(sel.odds)}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                        <div className="ml-6 rounded px-2.5 py-1.5 text-[11px] flex justify-between items-center bg-red-500/15 border border-red-500/30">
                          <span className="text-muted-foreground">{sels.length} seleÃ§{sels.length === 1 ? "Ã£o" : "Ãµes"} Â· odd total</span>
                          <span className="font-bold text-red-300">{fmtOdds(bet.totalOdds)}x</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="w-5 h-5 text-blue-400" />
            Motor de DecisÃ£o
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-5">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Preencher a partir de bilhete pendente
                    {pendingBets.length > 0 && <span className="ml-1.5 text-muted-foreground/60">({pendingBets.length})</span>}
                  </label>
                  <button
                    onClick={() => refetchPendingBets()}
                    disabled={isFetchingBets}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                    data-testid="button-refresh-pending-bets-decisao"
                  >
                    <RefreshCw className={`w-3 h-3 ${isFetchingBets ? "animate-spin" : ""}`} />
                    Atualizar
                  </button>
                </div>
              {pendingBets.length > 0 && (
                  <ScrollArea className="h-56 rounded border border-border">
                    <div className="p-1 space-y-1">
                      {pendingBets.slice(0, 30).map(bet => {
                        const isSelected = selectedBetId === bet.id;
                        const isExpanded = expandedBetId === bet.id;
                        const sels: any[] = Array.isArray(bet.selections) ? bet.selections : [];
                        return (
                          <div
                            key={bet.id}
                            className={`rounded border transition-colors ${
                              isSelected
                                ? "bg-blue-500/20 border-blue-500/40"
                                : "border-transparent hover:border-border hover:bg-muted/40"
                            }`}
                          >
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleSelectBet(bet)}
                                className={`flex-1 text-left px-3 py-2 text-xs transition-colors ${isSelected ? "text-blue-300" : "text-muted-foreground hover:text-foreground"}`}
                                data-testid={`button-select-bet-decisao-${bet.id}`}
                              >
                                <span className="font-mono font-semibold">#{(bet.id ?? "").slice(0, 8).toUpperCase()}</span>
                                <span className="ml-2">R$ {(bet.stake ?? 0).toFixed(2).replace(".", ",")}</span>
                                <span className={`ml-2 ${isSelected ? "text-blue-400" : "text-muted-foreground"}`}>Odds {fmtOdds(bet.totalOdds)}x</span>
                                {sels.length > 0 && (
                                  <span className={`ml-2 text-[10px] ${isSelected ? "text-blue-400/70" : "text-muted-foreground/60"}`}>{sels.length} seleÃ§{sels.length === 1 ? "Ã£o" : "Ãµes"}</span>
                                )}
                              </button>
                              {sels.length > 0 && (
                                <button
                                  onClick={(e) => toggleExpand(bet.id, e)}
                                  className={`px-2 py-2 transition-colors ${isSelected ? "text-blue-400 hover:text-blue-300" : "text-muted-foreground hover:text-foreground"}`}
                                  data-testid={`button-expand-bet-decisao-${bet.id}`}
                                >
                                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                </button>
                              )}
                            </div>
                            {isExpanded && sels.length > 0 && (
                              <div className="mx-2 mb-2 space-y-0">
                                {sels.map((sel: any, idx: number) => (
                                  <div key={sel.id ?? idx} className="flex gap-2">
                                    <div className="flex flex-col items-center w-4 shrink-0 pt-1">
                                      <div className={`w-2 h-2 rounded-full shrink-0 ${isSelected ? "bg-blue-400" : "bg-muted-foreground/50"}`} />
                                      {idx < sels.length - 1 && (
                                        <div className={`w-px flex-1 mt-0.5 ${isSelected ? "bg-blue-500/40" : "bg-border"}`} style={{ minHeight: "20px" }} />
                                      )}
                                    </div>
                                    <div className={`flex-1 mb-1.5 rounded px-2.5 py-2 text-[11px] ${isSelected ? "bg-blue-500/10 border border-blue-500/20" : "bg-muted/30 border border-border/60"}`}>
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0 flex-1">
                                          <p className={`font-semibold leading-tight ${isSelected ? "text-blue-200" : "text-foreground"}`}>
                                            {sel.outcomeName ?? sel.outcome ?? sel.market ?? "â€”"}
                                          </p>
                                          <p className="text-muted-foreground text-[10px] mt-0.5 truncate">
                                            {[sel.homeTeam ?? sel.team, sel.awayTeam].filter(Boolean).join(" x ")}
                                            {sel.marketKey && <span className="ml-1 opacity-60">Â· {sel.marketKey}</span>}
                                          </p>
                                        </div>
                                        <span className={`font-bold text-xs shrink-0 ${isSelected ? "text-blue-300" : "text-foreground"}`}>
                                          {fmtOdds(sel.odds)}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                                <div className={`ml-6 rounded px-2.5 py-1.5 text-[11px] flex justify-between items-center ${isSelected ? "bg-blue-500/15 border border-blue-500/30" : "bg-muted/50 border border-border"}`}>
                                  <span className="text-muted-foreground">{sels.length} seleÃ§{sels.length === 1 ? "Ã£o" : "Ãµes"} Â· odd total</span>
                                  <span className={`font-bold ${isSelected ? "text-blue-300" : "text-foreground"}`}>{fmtOdds(bet.totalOdds)}x</span>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
              )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Aporte (R$)</label>
                  <Input
                    value={aporte}
                    onChange={(e) => { setAporte(e.target.value); setSelectedBetId(null); }}
                    placeholder="Ex: 200"
                    data-testid="input-decisao-aporte"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Odd Verano</label>
                  <Input
                    value={odd}
                    onChange={(e) => { setOdd(e.target.value); setSelectedBetId(null); }}
                    placeholder="Ex: 9.38"
                    data-testid="input-decisao-odd"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <label className="text-sm font-medium">Caixa atual (R$)</label>
                    {caixaIsSnapshot && (
                      <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded px-1.5 py-0.5">
                        <History className="w-3 h-3" />
                        snapshot do bilhete
                      </span>
                    )}
                    {caixaIsCurrent && !caixaIsSnapshot && (
                      <span className="flex items-center gap-1 text-[10px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5">
                        <RefreshCw className="w-3 h-3" />
                        caixa atual
                      </span>
                    )}
                  </div>
                  <Input
                    value={caixa}
                    onChange={(e) => { setCaixa(e.target.value); setCaixaIsSnapshot(false); setCaixaIsCurrent(false); }}
                    placeholder="Ex: 50000"
                    data-testid="input-decisao-caixa"
                    className={caixaIsSnapshot ? "border-emerald-500/40 bg-emerald-500/5" : caixaIsCurrent ? "border-amber-500/40 bg-amber-500/5" : ""}
                  />
                  {caixaIsSnapshot && (
                    <p className="text-[10px] text-emerald-400/70">Caixa lÃ­quido no momento da aposta</p>
                  )}
                  {caixaIsCurrent && !caixaIsSnapshot && (
                    <p className="text-[10px] text-amber-400/70">Sem snapshot â€” usando caixa atual</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <FlaskConical className="w-3.5 h-3.5 text-cyan-400" />
                    Fator de ExposiÃ§Ã£o (FE) â€” agravantes operacionais
                  </label>
                  <div className="flex items-center gap-2 shrink-0">
                    {autoAnalyzed && (
                      <span className="flex items-center gap-1 text-[10px] font-medium text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 rounded px-1.5 py-0.5">
                        <Brain className="w-3 h-3" />
                        Auto
                      </span>
                    )}
                    {(feCorrelacaoBilhetes || feAltaCorrelacao || feExposicao6 || feExposicao10 || feConcentracaoCliente || feBaixaRecuperacao) && (
                      <button
                        onClick={clearFE}
                        className="text-[10px] text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                </div>
                <div className="rounded-lg border border-border divide-y divide-border/60">
                  {[
                    { state: feCorrelacaoBilhetes, setter: setFeCorrelacaoBilhetes, label: "CorrelaÃ§Ã£o de bilhetes", desc: "HÃ¡ outro bilhete dependente do mesmo resultado", pts: "+1" },
                    { state: feAltaCorrelacao, setter: setFeAltaCorrelacao, label: "Alta correlaÃ§Ã£o", desc: "Dois ou mais bilhetes podem vencer juntos", pts: "+2" },
                    { state: feExposicao6, setter: setFeExposicao6, label: "ExposiÃ§Ã£o por evento >6%", desc: "Soma do lucro lÃ­quido do evento supera 6% do caixa", pts: "+1" },
                    { state: feExposicao10, setter: setFeExposicao10, label: "ExposiÃ§Ã£o crÃ­tica >10%", desc: "Soma do lucro lÃ­quido do evento supera 10% do caixa", pts: "+2" },
                    { state: feConcentracaoCliente, setter: setFeConcentracaoCliente, label: "ConcentraÃ§Ã£o de cliente", desc: "Cliente representa parcela muito alta da exposiÃ§Ã£o ativa", pts: "+1" },
                    { state: feBaixaRecuperacao, setter: setFeBaixaRecuperacao, label: "Baixa recuperaÃ§Ã£o", desc: "Pouco volume de outros clientes para repor eventual perda", pts: "+1" },
                  ].map(({ state, setter, label, desc, pts }) => (
                    <label
                      key={label}
                      className={`flex items-start gap-3 cursor-pointer px-3 py-2.5 transition-colors ${state ? "bg-cyan-500/8" : "hover:bg-muted/30"}`}
                    >
                      <input
                        type="checkbox"
                        checked={state}
                        onChange={(e) => setter(e.target.checked)}
                        className="mt-0.5 accent-cyan-400 w-4 h-4 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{label}</span>
                          <span className="text-xs font-bold text-cyan-400">{pts}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{desc}</p>
                      </div>
                    </label>
                  ))}
                  <div className="flex justify-between items-center px-3 py-2 bg-muted/20">
                    <span className="text-xs text-muted-foreground">FE total (mÃ¡x. 5)</span>
                    <Badge className={`${fe > 0 ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/30" : "bg-muted/60 text-muted-foreground border-border"}`}>
                      FE = {feRaw > 5 ? `${feRaw} â†’ limitado a 5` : fe}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {!hasResult ? (
                <div className="h-full flex flex-col items-center justify-center gap-3 text-center py-16 text-muted-foreground">
                  <Calculator className="w-14 h-14 opacity-15" />
                  <p className="text-sm leading-relaxed">Preencha o aporte, a odd e o caixa<br />para ver a anÃ¡lise completa.</p>
                </div>
         "’Â“°¢6öç7BVæF–ætW‡÷7W&RÒvd&WG2æf–ÇFW"†"Óâ"ç7FGW2ÓÓÒ'VæF–ær"’ç&VGV6R‚‡2Â"’Óâ2²–D÷WDöb†"’Â“°¢6öç7B†÷W6U&öf—BÒF÷FÅ7F¶RÒF÷FÅ–D÷WC° ¢6öç7B6VÆV7FVEW6W$æÖRÒveW6W$f–ÇFW"ÓÓÒ&ÆÂ"ò%FöF÷2÷2W7\:&–÷2"¢†ÆÅW6W'2æf–æB‡RÓâRæ7bÓÓÒveW6W$f–ÇFW"“òææÖRóòveW6W$f–ÇFW"“° ¢&WGW&â€¢ÆF—b6Æ74æÖSÒ'76R×’ÓR#à¢²ò¢f–ÇG&÷2¢÷Ð¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"§W7F–g’Ö&WGvVVâfÆW‚×w&vÓ2#à¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"vÓ"fÆW‚×w&#à¢Å÷÷fW"÷Vã×¶veW6W%÷÷fW$÷VçÒöä÷Vä6†ævS×·6WDveW6W%÷÷fW$÷VçÓà¢Å÷÷fW%G&–vvW"46†–ÆCà¢Æ'WGFöà¢&öÆSÒ&6öÖ&ö&÷‚ ¢&–ÖW‡æFVC×¶veW6W%÷÷fW$÷VçÐ¢FF×FW7F–CÒ'6VÆV7BÖw&f–6÷2×W6W" ¢6Æ74æÖSÒ'rÕ³##…Ò‚Ó’FW‡B×‡2fÆW‚—FV×2Ö6VçFW"§W7F–g’Ö&WGvVVâ&÷VæFVBÖÖB&÷&FW"&÷&FW"Ö&÷&FW"&rÖ&6¶w&÷VæB‚Ó2’ÓãRFW‡BÖf÷&Vw&÷VæBfö7W3¦÷WFÆ–æRÖæöæRfö7W3§&–ærÓfö7W3§&–ær×&–Ö'’ ¢à¢Ç7â6Æ74æÖSÒ'G'Væ6FR#ç·6VÆV7FVEW6W$æÖWÓÂ÷7ãà¢Ä6†Wg&öç5WF÷vâ6Æ74æÖSÒ&ÖÂÓ"‚Ó2ãRrÓ2ãR6‡&–æ²Ó÷6—G’ÓS"óà¢Âö'WGFöãà¢Âõ÷÷fW%G&–vvW#à¢Å÷÷fW$6öçFVçB6Æ74æÖSÒ'rÕ³#ƒ…ÒÓ#à¢Ä6öÖÖæCà¢Ä6öÖÖæD–çWBÆ6V†öÆFW#Ò$'W66"W7\:&–òâââ"6Æ74æÖSÒ'FW‡B×‡2"FF×FW7F–CÒ&–çWB×6V&6‚Öw&f–6÷2×W6W""óà¢Ä6öÖÖæDÆ—7Cà¢Ä6öÖÖæDV×G“äæVæ‡VÒW7\:&–òVæ6öçG&FòãÂô6öÖÖæDV×G“à¢Ä6öÖÖæDw&÷Wà¢Ä6öÖÖæD—FVÐ¢fÇVSÒ%FöF÷2÷2W7\:&–÷2 ¢öå6VÆV7C×²‚’Óâ²6WDveW6W$f–ÇFW"‚&ÆÂ"“²6WDveW6W%÷÷fW$÷Vâ†fÇ6R“²×Ð¢FF×FW7F–CÒ&÷F–öâÖw&f–6÷2×W6W"ÖÆÂ ¢à¢Ä6†V6²6Æ74æÖS×¶×"Ó"‚ÓBrÓBG¶veW6W$f–ÇFW"ÓÓÒ&ÆÂ"ò&÷6—G’Ó"¢&÷6—G’Ó'ÖÒóà¢FöF÷2÷2W7\:&–÷0¢Âô6öÖÖæD—FVÓà¢¶ÆÅW6W'2æÖ‡RÓâ€¢Ä6öÖÖæD—FVÐ¢¶W“×·Ræ7gÐ¢fÇVS×¶G·RææÖWÒG·Ræ7gÖÐ¢öå6VÆV7C×²‚’Óâ²6WDveW6W$f–ÇFW"‡Ræ7b“²6WDveW6W%÷÷fW$÷Vâ†fÇ6R“²×Ð¢FF×FW7F–C×¶÷F–öâÖw&f–6÷2×W6W"ÒG·Ræ7gÖÐ¢à¢Ä6†V6²6Æ74æÖS×¶×"Ó"‚ÓBrÓBG¶veW6W$f–ÇFW"ÓÓÒRæ7bò&÷6—G’Ó"¢&÷6—G’Ó'ÖÒóà¢·RææÖWÒ‡·Ræ7gÒ¢Âô6öÖÖæD—FVÓà¢’—Ð¢Âô6öÖÖæDw&÷Wà¢Âô6öÖÖæDÆ—7Cà¢Âô6öÖÖæCà¢Âõ÷÷fW$6öçFVçCà¢Âõ÷÷fW#à¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"vÓãR#à¢Æ–çW@¢G—SÒ&FFR ¢fÇVS×¶vdFFTg&ö×Ð¢öä6†ævS×¶RÓâ6WDvdFFTg&öÒ†RçF&vWBçfÇVR—Ð¢FF×FW7F–CÒ&–çWBÖw&f–6÷2ÖFFRÖg&öÒ ¢6Æ74æÖSÒ'’ÓãR‚Ó"FW‡B×‡2&÷VæFVBÖÖB&÷&FW"&÷&FW"Ö&÷&FW"&rÖ&6¶w&÷VæBFW‡BÖf÷&Vw&÷VæBfö7W3¦÷WFÆ–æRÖæöæRfö7W3§&–ærÓfö7W3§&–ær×&–Ö'’ ¢óà¢Ç7â6Æ74æÖSÒ'FW‡B×‡2FW‡BÖ×WFVBÖf÷&Vw&÷VæB#æL:“Â÷7ãà¢Æ–çW@¢G—SÒ&FFR ¢fÇVS×¶vdFFUF÷Ð¢öä6†ævS×¶RÓâ6WDvdFFUFò†RçF&vWBçfÇVR—Ð¢FF×FW7F–CÒ&–çWBÖw&f–6÷2ÖFFR×Fò ¢6Æ74æÖSÒ'’ÓãR‚Ó"FW‡B×‡2&÷VæFVBÖÖB&÷&FW"&÷&FW"Ö&÷&FW"&rÖ&6¶w&÷VæBFW‡BÖf÷&Vw&÷VæBfö7W3¦÷WFÆ–æRÖæöæRfö7W3§&–ærÓfö7W3§&–ær×&–Ö'’ ¢óà¢²†vdFFTg&öÒÇÂvdFFUFòÇÂveW6W$f–ÇFW"ÓÒ&ÆÂ"’bb€¢Æ'WGFöà¢öä6Æ–6³×²‚’Óâ²6WDvdFFTg&öÒ‚""“²6WDvdFFUFò‚""“²6WDveW6W$f–ÇFW"‚&ÆÂ"“²×Ð¢FF×FW7F–CÒ&'WGFöâÖw&f–6÷2Ö6ÆV" ¢6Æ74æÖSÒ'FW‡B×‡2FW‡BÖ×WFVBÖf÷&Vw&÷VæB†÷fW#§FW‡BÖf÷&Vw&÷VæB‚Ó"’ÓãR&÷VæFVBÖÖB&÷&FW"&÷&FW"Ö&÷&FW"&rÖ&6¶w&÷VæB†÷fW#¦&rÖ×WFVBG&ç6—F–öâÖ6öÆ÷'2 ¢à¢Æ–× ¢Âö'WGFöãà¢—Ð¢ÂöF—cà¢ÂöF—cà¢Ç6Æ74æÖSÒ'FW‡B×‡2FW‡BÖ×WFVBÖf÷&Vw&÷VæB#à¢æÆ—6æFó¢Ç7â6Æ74æÖSÒ&föçB×6VÖ–&öÆBFW‡BÖf÷&Vw&÷VæB#ç·6VÆV7FVEW6W$æÖWÓÂ÷7ãà¢Â÷à¢ÂöF—cà ¢¶veW6W$f–ÇFW"ÓÒ&ÆÂ"bb€¢ÆF—b6Æ74æÖSÒ&w&–Bw&–BÖ6öÇ2Ó"6Ó¦w&–BÖ6öÇ2Ó2vÓ2#à¢Ä6&Cà¢Ä6&D6öçFVçB6Æ74æÖSÒ'Ó2#à¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"vÓ"Ö"Ó#ãÄ'&÷uW6—&6ÆR6Æ74æÖSÒ'rÓR‚ÓRFW‡BÖ&ÇVRÓC"óãÇ6Æ74æÖSÒ'FW‡B×‡2FW‡BÖ×WFVBÖf÷&Vw&÷VæB#äFW;76—F÷3Â÷ãÂöF—cà¢Ç6Æ74æÖSÒ'FW‡BÖÆrföçBÖ&öÆBFW‡BÖ&ÇVRÓC"FF×FW7F–CÒ'FW‡BÖw&f–6÷2×W6W"ÖFW÷6—G2#çµ"B†veW6W$FW÷6—G2—ÓÂ÷à¢Âô6&D6öçFVçCà¢Âô6&Cà¢Ä6&Cà¢Ä6&D6öçFVçB6Æ74æÖSÒ'Ó2#à¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"vÓ"Ö"Ó#ãÄ'&÷tF÷vä6—&6ÆR6Æ74æÖSÒ'rÓR‚ÓRFW‡BÖ÷&ævRÓC"óãÇ6Æ74æÖSÒ'FW‡B×‡2FW‡BÖ×WFVBÖf÷&Vw&÷VæB#å6VW3Â÷ãÂöF—cà¢Ç6Æ74æÖSÒ'FW‡BÖÆrföçBÖ&öÆBFW‡BÖ÷&ævRÓC"FF×FW7F–CÒ'FW‡BÖw&f–6÷2×W6W"×v—F†G&vÇ2#çµ"B†veW6W%v—F†G&vÇ2—ÓÂ÷à¢Âô6&D6öçFVçCà¢Âô6&Cà¢Ä6&Cà¢Ä6&D6öçFVçB6Æ74æÖSÒ'Ó2#à¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"vÓ"Ö"Ó#à¢¶veW6W%&VÅ&öf—BâòÅG&VæF–æuW6Æ74æÖSÒ'rÓR‚ÓRFW‡BÖw&VVâÓC"óâ¢veW6W%&VÅ&öf—BÂòÅG&VæF–ætF÷vâ6Æ74æÖSÒ'rÓR‚ÓRFW‡B×&VBÓC"óâ¢Å¦6Æ74æÖSÒ'rÓR‚ÓRFW‡BÖ&ÇVRÓC"óçÐ¢Ç6Æ74æÖSÒ'FW‡B×‡2FW‡BÖ×WFVBÖf÷&Vw&÷VæB#äÇV7&ò&VÃÂ÷à¢ÂöF—cà¢Ç6Æ74æÖS×¶FW‡BÖÆrföçBÖ&öÆBG¶veW6W%&VÅ&öf—Bâò'FW‡BÖw&VVâÓC"¢veW6W%&VÅ&öf—BÂò'FW‡B×&VBÓC"¢'FW‡BÖ&ÇVRÓC'ÖÒFF×FW7F–CÒ'FW‡BÖw&f–6÷2×W6W"×&VÂ×&öf—B#çµ"B†veW6W%&VÅ&öf—B—ÓÂ÷à¢Âô6&D6öçFVçCà¢Âô6&Cà¢ÂöF—cà¢—Ð ¢¶&WG4ÆöF–ærò€¢ÆF—b6Æ74æÖSÒ'FW‡BÖ6VçFW"’ÓFW‡BÖ×WFVBÖf÷&Vw&÷VæBFW‡B×6Ò#ä6'&VvæFòFF÷2ââãÂöF—cà¢’¢F÷FÄ&WG2ÓÓÒò€¢ÆF—b6Æ74æÖSÒ'FW‡BÖ6VçFW"’ÓFW‡BÖ×WFVBÖf÷&Vw&÷VæBFW‡B×6Ò#äæVæ‡VÒ&–Æ†WFRVæ6öçG&Fò&òf–ÇG&ò6VÆV6–öæFòãÂöF—cà¢’¢€¢Ãà¢²ò¢µ’6&G2Æ–æ†¢÷Ð¢ÆF—b6Æ74æÖSÒ&w&–Bw&–BÖ6öÇ2Ó"6Ó¦w&–BÖ6öÇ2ÓBvÓ2#à¢µ°¢²–6öã¢Ä6ÆVæF$F—26Æ74æÖSÒ'rÓR‚ÓRFW‡B×&–Ö'’"óâÂÆ&VÃ¢%F÷FÂFR&–Æ†WFW2"ÂfÇVS¢F÷FÄ&WG2çFõ7G&–ær‚’ÒÀ¢²–6öã¢ÅG&÷‡’6Æ74æÖSÒ'rÓR‚ÓRFW‡BÖw&VVâÓC"óâÂÆ&VÃ¢$væ†÷2òW&F–F÷2òVæFVçFW2ò66‚÷WB"ÂfÇVS¢Ç7ããÇ7â6Æ74æÖSÒ'FW‡BÖw&VVâÓC#ç·vöä&WG7ÓÂ÷7ãâòÇ7â6Æ74æÖSÒ'FW‡B×&VBÓC#ç¶Æ÷7D&WG7ÓÂ÷7ãâòÇ7â6Æ74æÖSÒ'FW‡B×–VÆÆ÷rÓC#ç·VæF–æt&WG7ÓÂ÷7ãâòÇ7â6Æ74æÖSÒ'FW‡B×W'ÆRÓC#ç¶÷F†W$&WG7ÓÂ÷7ããÂ÷7ãâÒÀ¢²–6öã¢ÅF&vWB6Æ74æÖSÒ'rÓR‚ÓRFW‡BÖw&VVâÓC"óâÂÆ&VÃ¢%F†FR6W'Fò"ÂfÇVS¢5B‡vöä&WG2Â&W6öÇfVD&WG2’ÒÀ¢²–6öã¢Å„6—&6ÆR6Æ74æÖSÒ'rÓR‚ÓRFW‡B×&VBÓC"óâÂÆ&VÃ¢%F†FRW'&÷2"ÂfÇVS¢5B†Æ÷7D&WG2Â&W6öÇfVD&WG2’ÒÀ¢ÒæÖ‚‡²–6öâÂÆ&VÂÂfÇVRÒ’Óâ€¢Ä6&B¶W“×¶Æ&VÇÓà¢Ä6&D6öçFVçB6Æ74æÖSÒ'Ó2#à¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"vÓ"Ö"Ó#ç¶–6öçÓÇ6Æ74æÖSÒ'FW‡BÕ³…ÒÆVF–ær×F–v‡BFW‡BÖ×WFVBÖf÷&Vw&÷VæB#ç¶Æ&VÇÓÂ÷ãÂöF—cà¢Ç6Æ74æÖSÒ'FW‡BÖÆrföçBÖ&öÆB#ç·fÇVWÓÂ÷à¢Âô6&D6öçFVçCà¢Âô6&Cà¢’—Ð¢ÂöF—cà ¢²ò¢µ’6&G2Æ–æ†"¢÷Ð¢ÆF—b6Æ74æÖSÒ&w&–Bw&–BÖ6öÇ2Ó"6Ó¦w&–BÖ6öÇ2ÓBvÓ2#à¢µ°¢²–6öã¢Ä'&÷uW6—&6ÆR6Æ74æÖSÒ'rÓR‚ÓRFW‡BÖ&ÇVRÓC"óâÂÆ&VÃ¢%F÷FÂ÷7FFò"ÂfÇVS¢"B‡F÷FÅ7F¶R’Â6öÆ÷#¢'FW‡BÖ&ÇVRÓC"ÒÀ¢²–6öã¢Ä'&÷tF÷vä6—&6ÆR6Æ74æÖSÒ'rÓR‚ÓRFW‡B×&VBÓC"óâÂÆ&VÃ¢$&–Æ†WFW2v÷2"ÂfÇVS¢"B‡F÷FÅ–D÷WB’Â6öÆ÷#¢'FW‡B×&VBÓC"ÒÀ¢²–6öã¢†÷W6U&öf—BãÒòÅG&VæF–æuW6Æ74æÖSÒ'rÓR‚ÓRFW‡BÖw&VVâÓC"óâ¢ÅG&VæF–ætF÷vâ6Æ74æÖSÒ'rÓR‚ÓRFW‡B×&VBÓC"óâÂÆ&VÃ¢$ÇV7&ò„66’"ÂfÇVS¢"B††÷W6U&öf—B’Â6öÆ÷#¢†÷W6U&öf—BãÒò'FW‡BÖw&VVâÓC"¢'FW‡B×&VBÓC"ÒÀ¢²–6öã¢ÄÆW'EG&–ævÆR6Æ74æÖSÒ'rÓR‚ÓRFW‡B×–VÆÆ÷rÓC"óâÂÆ&VÃ¢$W‡÷6œ:|:6òVæFVçFR"ÂfÇVS¢"B‡VæF–ætW‡÷7W&R’Â6öÆ÷#¢'FW‡B×–VÆÆ÷rÓC"ÒÀ¢ÒæÖ‚‡²–6öâÂÆ&VÂÂfÇVRÂ6öÆ÷"Ò’Óâ€¢Ä6&B¶W“×¶Æ&VÇÓà¢Ä6&D6öçFVçB6Æ74æÖSÒ'Ó2#à¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"vÓ"Ö"Ó#ç¶–6öçÓÇ6Æ74æÖSÒ'FW‡B×‡2FW‡BÖ×WFVBÖf÷&Vw&÷VæB#ç¶Æ&VÇÓÂ÷ãÂöF—cà¢Ç6Æ74æÖS×¶FW‡BÖÆrföçBÖ&öÆBG¶6öÆ÷'ÖÓç·fÇVWÓÂ÷à¢Âô6&D6öçFVçCà¢Âô6&Cà¢’—Ð¢ÂöF—cà ¢²ò¢w,:f–6ó¢væ†÷2‚W&F–F÷2¢÷Ð¢Ä6&Cà¢Ä6&D†VFW"6Æ74æÖSÒ'"Ó"#à¢Ä6&EF—FÆR6Æ74æÖSÒ'FW‡B×6ÒfÆW‚—FV×2Ö6VçFW"vÓ"#à¢Å–T6†'B6Æ74æÖSÒ'rÓB‚ÓBFW‡B×&–Ö'’"óà¢&VÆ:|:6òFR&–Æ†WFW2væ†÷2RW&F–F÷0¢Âô6&EF—FÆSà¢Âô6&D†VFW#à¢Ä6&D6öçFVçB6Æ74æÖSÒ'Ó2#à¢Å&W7öç6—fT6öçF–æW"v–GFƒÒ#R"†V–v‡C×³#Óà¢Ä&$6†'BFF×¶vevöäÆ÷7DFFÒÖ&v–ã×·²F÷¢BÂ&–v‡C¢‚ÂÆVgC¢Â&÷GFöÓ¢×Óà¢ÆFVg3à¢ÆÆ–æV$w&F–VçB–CÒ&vdvæ†÷4w&F–VçB"ƒÒ#"“Ò#"ƒ#Ò#"“#Ò##à¢Ç7F÷öfg6WCÒ#R"7F÷6öÆ÷#Ò"3FFSƒ"7F÷÷6—G“×³Òóà¢Ç7F÷öfg6WCÒ#R"7F÷6öÆ÷#Ò"3Sƒ6B"7F÷÷6—G“×³Òóà¢ÂöÆ–æV$w&F–VçCà¢ÆÆ–æV$w&F–VçB–CÒ&veW&F–F÷4w&F–VçB"ƒÒ#"“Ò#"ƒ#Ò#"“#Ò##à¢Ç7F÷öfg6WCÒ#R"7F÷6öÆ÷#Ò"6cƒss"7F÷÷6—G“×³Òóà¢Ç7F÷öfg6WCÒ#R"7F÷6öÆ÷#Ò"6#“32"7F÷÷6—G“×³Òóà¢ÂöÆ–æV$w&F–VçCà¢ÆÆ–æV$w&F–VçB–CÒ&veVæFVçFW4w&F–VçB"ƒÒ#"“Ò#"ƒ#Ò#"“#Ò##à¢Ç7F÷öfg6WCÒ#R"7F÷6öÆ÷#Ò"6fFSCr"7F÷÷6—G“×³Òóà¢Ç7F÷öfg6WCÒ#R"7F÷6öÆ÷#Ò"66†B"7F÷÷6—G“×³Òóà¢ÂöÆ–æV$w&F–VçCà¢ÆÆ–æV$w&F–VçB–CÒ&vd66„÷WDw&F–VçB"ƒÒ#"“Ò#"ƒ#Ò#"“#Ò##à¢Ç7F÷öfg6WCÒ#R"7F÷6öÆ÷#Ò"6s†&f"7F÷÷6—G“×³Òóà¢Ç7F÷öfg6WCÒ#R"7F÷6öÆ÷#Ò"3fC#†C’"7F÷÷6—G“×³Òóà¢ÂöÆ–æV$w&F–VçCà¢ÂöFVg3à¢Ä6'FW6–äw&–B7G&ö¶TF6†'&“Ò#22"7G&ö¶SÒ"3332"óà¢Å„†—2FF¶W“Ò&æÖR"F–6³×·²föçE6—¦S¢×Ò7G&ö¶SÒ"3ccb"óà¢Å”†—2F–6³×·²föçE6—¦S¢×Ò7G&ö¶SÒ"3ccb"ÆÆ÷tFV6–ÖÇ3×¶fÇ6WÒóà¢ÅFööÇF—7W'6÷#×·²f–ÆÃ¢'G&ç7&VçB"×Ò6W&F÷#Ò""f÷&ÖGFW#×²‡c¢çVÖ&W"’Óâ¶G·gÒ&–Æ†WFW6Â"%×Ò6öçFVçE7G–ÆS×·²&6¶w&÷VæC¢"3"Â&÷&FW#¢#‚6öÆ–B3332"Â&÷&FW%&F—W3¢‚Â6öÆ÷#¢"6ffb"×ÒÆ&VÅ7G–ÆS×·²6öÆ÷#¢"6ffb"×Ò—FVÕ7G–ÆS×·²6öÆ÷#¢"6ffb"×Òóà¢Ä&"FF¶W“Ò'fÇVR"&F—W3×µ³2Â2ÂÂ×Óà¢¶vevöäÆ÷7DFFæÖ‚†VçG'’Â’’Óâ€¢Ä6VÆÂ¶W“×¶—Òf–ÆÃ×¶VçG'’æw&F–VçDf–ÆÇÒóà¢’—Ð¢Âô&#à¢Âô&$6†'Cà¢Âõ&W7öç6—fT6öçF–æW#à¢Âô6&D6öçFVçCà¢Âô6&Cà ¢²ò¢w,:f–6ó¢VçG&F‚&WF÷&æòòÆöævòFòFV×ò¢÷Ð¢Ä6&Cà¢Ä6&D†VFW"6Æ74æÖSÒ'"Ó"#à¢Ä6&EF—FÆR6Æ74æÖSÒ'FW‡B×6ÒfÆW‚—FV×2Ö6VçFW"vÓ"#à¢Ä&$6†'C"6Æ74æÖSÒ'rÓB‚ÓBFW‡B×&–Ö'’"óà¢fÆ÷"÷7FFòR&WF÷&æò÷"F–¢Âô6&EF—FÆSà¢Âô6&D†VFW#à¢Ä6&D6öçFVçB6Æ74æÖSÒ'Ó2#à¢Å&W7öç6—fT6öçF–æW"v–GFƒÒ#R"†V–v‡C×³##Óà¢Ä&$6†'BFF×¶vdF–Ç”FFÒÖ&v–ã×·²F÷¢BÂ&–v‡C¢‚ÂÆVgC¢Â&÷GFöÓ¢×Óà¢ÆFVg3à¢ÆÆ–æV$w&F–VçB–CÒ&vdVçG&Fw&F–VçB"ƒÒ#"“Ò#"ƒ#Ò#"“#Ò##à¢Ç7F÷öfg6WCÒ#R"7F÷6öÆ÷#Ò"3cVf"7F÷÷6—G“×³Òóà¢Ç7F÷öfg6WCÒ#R"7F÷6öÆ÷#Ò"3CFVC‚"7F÷÷6—G“×³Òóà¢ÂöÆ–æV$w&F–VçCà¢ÆÆ–æV$w&F–VçB–CÒ&ve&WF÷&æôw&F–VçB"ƒÒ#"“Ò#"ƒ#Ò#"“#Ò##à¢Ç7F÷öfg6WCÒ#R"7F÷6öÆ÷#Ò"3FFSƒ"7F÷÷6—G“×³Òóà¢Ç7F÷öfg6WCÒ#R"7F÷6öÆ÷#Ò"3Sƒ6B"7F÷÷6—G“×³Òóà¢ÂöÆ–æV$w&F–VçCà¢ÂöFVg3à¢Ä6'FW6–äw&–B7G&ö¶TF6†'&“Ò#22"7G&ö¶SÒ"3332"óà¢Å„†—2FF¶W“Ò&FFR"F–6³×·²föçE6—¦S¢×Ò7G&ö¶SÒ"3ccb"óà¢Å”†—2F–6³×·²föçE6—¦S¢×Ò7G&ö¶SÒ"3ccb"F–6´f÷&ÖGFW#×·bÓâ"BG²‡bò’çFôf—†VBƒ—Ö¶Òóà¢ÅFööÇF—f÷&ÖGFW#×²‡c¢çVÖ&W"’Óâ"B‡b—Ò6öçFVçE7G–ÆS×·²&6¶w&÷VæC¢"3"Â&÷&FW#¢#‚6öÆ–B3332"Â&÷&FW%&F—W3¢‚Â6öÆ÷#¢"6ffb"×ÒÆ&VÅ7G–ÆS×·²6öÆ÷#¢"6ffb"×Ò—FVÕ7G–ÆS×·²6öÆ÷#¢"6ffb"×Òóà¢ÄÆVvVæBóà¢Ä&"FF¶W“Ò$VçG&F"f–ÆÃÒ'W&Â‚6vdVçG&Fw&F–VçB’"&F—W3×µ³2Â2ÂÂ×Òóà¢Ä&"FF¶W“Ò%&WF÷&æò"f–ÆÃÒ'W&Â‚6ve&WF÷&æôw&F–VçB’"&F—W3×µ³2Â2ÂÂ×Òóà¢Âô&$6†'Cà¢Âõ&W7öç6—fT6öçF–æW#à¢Âô6&D6öçFVçCà¢Âô6&Cà ¢²ò¢w,:f–6ó¢WföÇ\:|:6òFòÇV7&òFòW7\:&–ò¢÷Ð¢Ä6&Cà¢Ä6&D†VFW"6Æ74æÖSÒ'"Ó"#à¢Ä6&EF—FÆR6Æ74æÖSÒ'FW‡B×6ÒfÆW‚—FV×2Ö6VçFW"vÓ"#à¢ÅG&VæF–æuW6Æ74æÖSÒ'rÓB‚ÓBFW‡B×&–Ö'’"óà¢WföÇ\:|:6òFòÇV7&ò…W7\:&–ò’÷"F–¢Âô6&EF—FÆSà¢Âô6&D†VFW#à¢Ä6&D6öçFVçB6Æ74æÖSÒ'Ó2#à¢Å&W7öç6—fT6öçF–æW"v–GFƒÒ#R"†V–v‡C×³#Óà¢ÄÆ–æT6†'BFF×¶vdF–Ç”FFÒÖ&v–ã×·²F÷¢BÂ&–v‡C¢‚ÂÆVgC¢Â&÷GFöÓ¢×Óà¢ÆFVg3à¢ÆÆ–æV$w&F–VçB–CÒ&vdÇV7&õW7V&–ôw&F–VçB"ƒÒ#"“Ò#"ƒ#Ò#"“#Ò##à¢Ç7F÷öfg6WC×¶vdÇV7&õW7V&–ôw&F–VçDöfg6WGÒ7F÷6öÆ÷#Ò"3#&3SVR"7F÷÷6—G“×³Òóà¢Ç7F÷öfg6WC×¶vdÇV7&õW7V&–ôw&F–VçDöfg6WGÒ7F÷6öÆ÷#Ò"6VcCCCB"7F÷÷6—G“×³Òóà¢ÂöÆ–æV$w&F–VçCà¢ÂöFVg3à¢Ä6'FW6–äw&–B7G&ö¶TF6†'&“Ò#22"7G&ö¶SÒ"3332"óà¢Å„†—2FF¶W“Ò&FFR"F–6³×·²föçE6—¦S¢×Ò7G&ö¶SÒ"3ccb"óà¢Å”†—2F–6³×·²föçE6—¦S¢×Ò7G&ö¶SÒ"3ccb"F–6´f÷&ÖGFW#×·bÓâ"BG²‡bò’çFôf—†VBƒ—Ö¶Òóà¢ÅFööÇF—f÷&ÖGFW#×²‡c¢çVÖ&W"’Óâ"B‡b—Ò6öçFVçE7G–ÆS×·²&6¶w&÷VæC¢"3"Â&÷&FW#¢#‚6öÆ–B3332"Â&÷&FW%&F—W3¢‚Â6öÆ÷#¢"6ffb"×ÒÆ&VÅ7G–ÆS×·²6öÆ÷#¢"6ffb"×Ò—FVÕ7G–ÆS×·²6öÆ÷#¢"6ffb"×Òóà¢ÄÆ–æP¢G—SÒ&Ööæ÷FöæR ¢FF¶W“Ò$ÇV7&õW7V&–ò ¢7G&ö¶SÒ'W&Â‚6vdÇV7&õW7V&–ôw&F–VçB’ ¢7G&ö¶Uv–GFƒ×³'Ð¢F÷C×²‡&÷3¢ç’’Óâ°¢6öç7B²7‚Â7’Â–ÆöBÂ–æFW‚ÒÒ&÷3°¢&WGW&âÆ6—&6ÆR¶W“×¶F÷B×W7V&–òÒG¶–æFW‡ÖÒ7ƒ×¶7‡Ò7“×¶7—Ò#×³7Òf–ÆÃ×·–ÆöBäÇV7&õW7V&–òãÒò"3#&3SVR"¢"6VcCCCB'Ò7G&ö¶SÒ&æöæR"óã°¢×Ð¢óà¢ÂôÆ–æT6†'Cà¢Âõ&W7öç6—fT6öçF–æW#à¢Âô6&D6öçFVçCà¢Âô6&Cà ¢²ò¢w,:f–6ó¢WföÇ\:|:6òFòÇV7&ò¢÷Ð¢Ä6&Cà¢Ä6&D†VFW"6Æ74æÖSÒ'"Ó"#à¢Ä6&EF—FÆR6Æ74æÖSÒ'FW‡B×6ÒfÆW‚—FV×2Ö6VçFW"vÓ"#à¢ÅG&VæF–æuW6Æ74æÖSÒ'rÓB‚ÓBFW‡B×&–Ö'’"óà¢WföÇ\:|:6òFòÇV7&ò„66’÷"F–¢Âô6&EF—FÆSà¢Âô6&D†VFW#à¢Ä6&D6öçFVçB6Æ74æÖSÒ'Ó2#à¢Å&W7öç6—fT6öçF–æW"v–GFƒÒ#R"†V–v‡C×³#Óà¢ÄÆ–æT6†'BFF×¶vdF–Ç”FFÒÖ&v–ã×·²F÷¢BÂ&–v‡C¢‚ÂÆVgC¢Â&÷GFöÓ¢×Óà¢ÆFVg3à¢ÆÆ–æV$w&F–VçB–CÒ&vdÇV7&ôw&F–VçB"ƒÒ#"“Ò#"ƒ#Ò#"“#Ò##à¢Ç7F÷öfg6WC×¶vdÇV7&ôw&F–VçDöfg6WGÒ7F÷6öÆ÷#Ò"3#&3SVR"7F÷÷6—G“×³Òóà¢Ç7F÷öfg6WC×¶vdÇV7&ôw&F–VçDöfg6WGÒ7F÷6öÆ÷#Ò"6VcCCCB"7F÷÷6—G“×³Òóà¢ÂöÆ–æV$w&F–VçCà¢ÂöFVg3à¢Ä6'FW6–äw&–B7G&ö¶TF6†'&“Ò#22"7G&ö¶SÒ"3332"óà¢Å„†—2FF¶W“Ò&FFR"F–6³×·²föçE6—¦S¢×Ò7G&ö¶SÒ"3ccb"óà¢Å”†—2F–6³×·²föçE6—¦S¢×Ò7G&ö¶SÒ"3ccb"F–6´f÷&ÖGFW#×·bÓâ"BG²‡bò’çFôf—†VBƒ—Ö¶Òóà¢ÅFööÇF—f÷&ÖGFW#×²‡c¢çVÖ&W"’Óâ"B‡b—Ò6öçFVçE7G–ÆS×·²&6¶w&÷VæC¢"3"Â&÷&FW#¢#‚6öÆ–B3332"Â&÷&FW%&F—W3¢‚Â6öÆ÷#¢"6ffb"×ÒÆ&VÅ7G–ÆS×·²6öÆ÷#¢"6ffb"×Ò—FVÕ7G–ÆS×·²6öÆ÷#¢"6ffb"×Òóà¢ÄÆ–æP¢G—SÒ&Ööæ÷FöæR ¢FF¶W“Ò$ÇV7&ò ¢7G&ö¶SÒ'W&Â‚6vdÇV7&ôw&F–VçB’ ¢7G&ö¶Uv–GFƒ×³'Ð¢F÷C×²‡&÷3¢ç’’Óâ°¢6öç7B²7‚Â7’Â–ÆöBÂ–æFW‚ÒÒ&÷3°¢&WGW&âÆ6—&6ÆR¶W“×¶F÷BÒG¶–æFW‡ÖÒ7ƒ×¶7‡Ò7“×¶7—Ò#×³7Òf–ÆÃ×·–ÆöBäÇV7&òãÒò"3#&3SVR"¢"6VcCCCB'Ò7G&ö¶SÒ&æöæR"óã°¢×Ð¢óà¢ÂôÆ–æT6†'Cà¢Âõ&W7öç6—fT6öçF–æW#à¢Âô6&D6öçFVçCà¢Âô6&Cà ¢²ò¢&æ¶–ærFRW7\:&–÷2(	B–FVçF–f–6:|:6òFRW&f–Â÷FVæ6–Â¢÷Ð¢¶veW6W$f–ÇFW"ÓÓÒ&ÆÂ"bb€¢Ä6&Cà¢Ä6&D†VFW"6Æ74æÖSÒ'"Ó"#à¢Ä6&EF—FÆR6Æ74æÖSÒ'FW‡B×6ÒfÆW‚—FV×2Ö6VçFW"vÓ"#à¢Å7F"6Æ74æÖSÒ'rÓB‚ÓBFW‡B×–VÆÆ÷rÓC"óà¢&æ¶–ærFRW7\:&–÷2„ÖG&—¢FRVÆ–FFR¢Âô6&EF—FÆSà¢Ç6Æ74æÖSÒ'FW‡B×‡2FW‡BÖ×WFVBÖf÷&Vw&÷VæB#à¢W7\:&–÷26öÒR²&–Æ†WFW2&W6öÇf–F÷2<:6ò6Æ76–f–6F÷2VÒB6FVv÷&–2‡föÇVÖR9r$ô’’R÷&FVæF÷2÷"66÷&RFR–×7FòƒCRF†FR6W'Fò²cRföÇVÖR’â6FVv÷&–W6ò$ô’‡&WF÷&æòvò;r÷7FFò’6öÖòf–ÇG&òFRVÆ–FFR(	Bì:6òVæ2föÇVÖRà¢Â÷à¢Âô6&D†VFW#à¢Ä6&D6öçFVçB6Æ74æÖSÒ'Ó2#à¢ÆF—b6Æ74æÖSÒ&fÆW‚fÆW‚×w&v×‚ÓBv×’ÓãRÖ"Ó2FW‡B×‡2#à¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"vÓãR#à¢Ä&FvRf&–çCÒ&FW7G'V7F—fR"6Æ74æÖSÒ'FW‡BÕ³…Ò&rÖVÖW&ÆBÓSó#FW‡BÖVÖW&ÆBÓC&÷&FW"ÖVÖW&ÆBÓSóC†÷fW#¦&rÖVÖW&ÆBÓSó##äVÆ—FSÂô&FvSà¢Ç7â6Æ74æÖSÒ'FW‡BÖ×WFVBÖf÷&Vw&÷VæB#åföÇVÖRÇFò‡F÷#RR’²$ô’ÇFò²66÷&R(šRc(	B&WFW"…d•ò&VæVl:Ö6–÷2“Â÷7ãà¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"vÓãR#à¢Ä&FvRf&–çCÒ&FW7G'V7F—fR"6Æ74æÖSÒ'FW‡BÕ³…Ò&rÖ7–âÓSó#FW‡BÖ7–âÓC&÷&FW"Ö7–âÓSóC†÷fW#¦&rÖ7–âÓSó##å&VÖ—VÓÂô&FvSà¢Ç7â6Æ74æÖSÒ'FW‡BÖ×WFVBÖf÷&Vw&÷VæB#åföÇVÖRÇFò²$ô’ÇFò²66÷&R²#Â'Òc(	B&WFW"…d•ò&VæVl:Ö6–÷2“Â÷7ãà¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"vÓãR#à¢Ä&FvRf&–çCÒ&FW7G'V7F—fR"6Æ74æÖSÒ'FW‡BÕ³…Ò&r×–VÆÆ÷rÓSó#FW‡B×–VÆÆ÷rÓC&÷&FW"×–VÆÆ÷rÓSóC†÷fW#¦&r×–VÆÆ÷rÓSó##å÷FVæ6–ÃÂô&FvSà¢Ç7â6Æ74æÖSÒ'FW‡BÖ×WFVBÖf÷&Vw&÷VæB#åföÇVÖR&—†òöÜ:–F–ò²$ô’ÇFò(	B–æ6VçF—f"†VÖVçF"Æ–Ö—FR“Â÷7ãà¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"vÓãR#à¢Ä&FvRf&–çCÒ&FW7G'V7F—fR"6Æ74æÖSÒ'FW‡BÕ³…Ò&r×&VBÓSó#FW‡B×&VBÓC&÷&FW"×&VBÓSóC†÷fW#¦&r×&VBÓSó##ä&ÆV–FR&—66óÂô&FvSà¢Ç7â6Æ74æÖSÒ'FW‡BÖ×WFVBÖf÷&Vw&÷VæB#åföÇVÖRÇFò²$ô’&—†ò(	BÖöæ—F÷&ÖVçFò&W7öç<:fVÃÂ÷7ãà¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"vÓãR#à¢Ä&FvRf&–çCÒ&FW7G'V7F—fR"6Æ74æÖSÒ'FW‡BÕ³…Ò&r×6ÆFRÓSó#FW‡B×6ÆFRÓC&÷&FW"×6ÆFRÓSóC†÷fW#¦&r×6ÆFRÓSó##ä÷7FF÷"67VÃÂô&FvSà¢Ç7â6Æ74æÖSÒ'FW‡BÖ×WFVBÖf÷&Vw&÷VæB#åföÇVÖR&—†ò²$ô’&—†ò(	BÖ&¶WF–ær‡&VVæv¦ÖVçFò“Â÷7ãà¢ÂöF—cà¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&÷fW&fÆ÷r×‚ÖWFò#à¢ÇF&ÆR6Æ74æÖSÒ'rÖgVÆÂFW‡B×‡2#à¢ÇF†VCà¢ÇG"6Æ74æÖSÒ&&÷&FW"Ö"&÷&FW"Ö&÷&FW"FW‡BÖ×WFVBÖf÷&Vw&÷VæB#à¢ÇF‚6Æ74æÖSÒ'FW‡BÖÆVgB’Ó""Ó2#åW7\:&–óÂ÷Fƒà¢ÇF‚6Æ74æÖSÒ'FW‡BÖ6VçFW"’Ó"‚Ó"#ä&–Æ†WFW3Â÷Fƒà¢ÇF‚6Æ74æÖSÒ'FW‡BÖ6VçFW"’Ó"‚Ó"FW‡BÖw&VVâÓC#ävæ†÷3Â÷Fƒà¢ÇF‚6Æ74æÖSÒ'FW‡BÖ6VçFW"’Ó"‚Ó"FW‡B×&VBÓC#åW&F–F÷3Â÷Fƒà¢ÇF‚6Æ74æÖSÒ'FW‡BÖ6VçFW"’Ó"‚Ó"#åF†6W'FóÂ÷Fƒà¢ÇF‚6Æ74æÖSÒ'FW‡B×&–v‡B’Ó"‚Ó"#ä÷7FFóÂ÷Fƒà¢ÇF‚6Æ74æÖSÒ'FW‡B×&–v‡B’Ó"‚Ó"#äÇV7&ò„66“Â÷Fƒà¢ÇF‚6Æ74æÖSÒ'FW‡BÖ6VçFW"’Ó"‚Ó"#å66÷&SÂ÷Fƒà¢ÇF‚6Æ74æÖSÒ'FW‡BÖ6VçFW"’Ó"ÂÓ"#åW&f–ÃÂ÷Fƒà¢Â÷G#à¢Â÷F†VCà¢ÇF&öG“à¢¶veW6W%&æ¶–æræÖ‡RÓâ€¢ÇG"¶W“×·RçW6W$–GÒ6Æ74æÖSÒ&&÷&FW"Ö"&÷&FW"Ö&÷&FW"óC†÷fW#¦&rÖ×WFVBó3#à¢ÇFB6Æ74æÖSÒ'’Ó""Ó2föçBÖÖVF—VÒ#à¢Æ'WGFöâ6Æ74æÖSÒ&†÷fW#§VæFW&Æ–æRFW‡BÖÆVgB"öä6Æ–6³×²‚’Óâ6WDveW6W$f–ÇFW"‡RçW6W$–B—ÒFF×FW7F–C×¶Æ–æ²Öw&f–6÷2×W6W"ÒG·RçW6W$–GÖÓà¢·RææÖWÐ¢Âö'WGFöãà¢Â÷FCà¢ÇFB6Æ74æÖSÒ'FW‡BÖ6VçFW"’Ó"‚Ó"#ç·RçF÷FÇÓÂ÷FCà¢ÇFB6Æ74æÖSÒ'FW‡BÖ6VçFW"’Ó"‚Ó"FW‡BÖw&VVâÓC#ç·RçvöçÓÂ÷FCà¢ÇFB6Æ74æÖSÒ'FW‡BÖ6VçFW"’Ó"‚Ó"FW‡B×&VBÓC#ç·RæÆ÷7GÓÂ÷FCà¢ÇFB6Æ74æÖSÒ'FW‡BÖ6VçFW"’Ó"‚Ó"#çµ5B‡RçvöâÂRç&W6öÇfVB—ÓÂ÷FCà¢ÇFB6Æ74æÖSÒ'FW‡B×&–v‡B’Ó"‚Ó"föçBÖÖöæò#çµ"B‡Rç7F¶R—ÓÂ÷FCà¢ÇFB6Æ74æÖS×¶FW‡B×&–v‡B’Ó"‚Ó"föçBÖÖöæòföçBÖ&öÆBG·Rç&öf—BãÒò'FW‡BÖw&VVâÓC"¢'FW‡B×&VBÓC'ÖÓçµ"B‡Rç&öf—B—ÓÂ÷FCà¢ÇFB6Æ74æÖSÒ'FW‡BÖ6VçFW"’Ó"‚Ó"föçBÖÖöæò#ç·Ræ–×7E66÷&RÓÒçVÆÂò‡Ræ–×7E66÷&R¢’çFôf—†VBƒ’¢Ç7â6Æ74æÖSÒ'FW‡BÖ×WFVBÖf÷&Vw&÷VæB#î(	CÂ÷7ãçÓÂ÷FCà¢ÇFB6Æ74æÖSÒ'FW‡BÖ6VçFW"’Ó"ÂÓ"#à¢·Rç&öf–ÆUVG&çBÓÓÒ&VÆ—FR"ò€¢Ä&FvRf&–çCÒ&FW7G'V7F—fR"6Æ74æÖSÒ'FW‡BÕ³…Ò&rÖVÖW&ÆBÓSó#FW‡BÖVÖW&ÆBÓC&÷&FW"ÖVÖW&ÆBÓSóC†÷fW#¦&rÖVÖW&ÆBÓSó#"FF×FW7F–C×¶&FvR×&öf–ÆRÖVÆ—FRÒG·RçW6W$–GÖÓäVÆ—FSÂô&FvSà¢’¢Rç&öf–ÆUVG&çBÓÓÒ'&VÖ—VÒ"ò€¢Ä&FvRf&–çCÒ&FW7G'V7F—fR"6Æ74æÖSÒ'FW‡BÕ³…Ò&rÖ7–âÓSó#FW‡BÖ7–âÓC&÷&FW"Ö7–âÓSóC†÷fW#¦&rÖ7–âÓSó#"FF×FW7F–C×¶&FvR×&öf–ÆR×&VÖ—VÒÒG·RçW6W$–GÖÓå&VÖ—VÓÂô&FvSà¢’¢Rç&öf–ÆUVG&çBÓÓÒ'÷FVæ6–Â"ò€¢Ä&FvRf&–çCÒ&FW7G'V7F—fR"6Æ74æÖSÒ'FW‡BÕ³…Ò&r×–VÆÆ÷rÓSó#FW‡B×–VÆÆ÷rÓC&÷&FW"×–VÆÆ÷rÓSóC†÷fW#¦&r×–VÆÆ÷rÓSó#"FF×FW7F–C×¶&FvR×&öf–ÆR×÷FVæ6–ÂÒG·RçW6W$–GÖÓå÷FVæ6–ÃÂô&FvSà¢’¢Rç&öf–ÆUVG&çBÓÓÒ&&ÆV–÷&—66ò"ò€¢Ä&FvRf&–çCÒ&FW7G'V7F—fR"6Æ74æÖSÒ'FW‡BÕ³…Ò&r×&VBÓSó#FW‡B×&VBÓC&÷&FW"×&VBÓSóC†÷fW#¦&r×&VBÓSó#"FF×FW7F–C×¶&FvR×&öf–ÆRÖ&ÆV–×&—66òÒG·RçW6W$–GÖÓä&ÆV–FR&—66óÂô&FvSà¢’¢Rç&öf–ÆUVG&çBÓÓÒ&67VÂ"ò€¢Ä&FvRf&–çCÒ&FW7G'V7F—fR"6Æ74æÖSÒ'FW‡BÕ³…Ò&r×6ÆFRÓSó#FW‡B×6ÆFRÓC&÷&FW"×6ÆFRÓSóC†÷fW#¦&r×6ÆFRÓSó#"FF×FW7F–C×¶&FvR×&öf–ÆRÖ67VÂÒG·RçW6W$–GÖÓä÷7FF÷"67VÃÂô&FvSà¢’¢€¢Ç7â6Æ74æÖSÒ'FW‡BÖ×WFVBÖf÷&Vw&÷VæB#î(	CÂ÷7ãà¢—Ð¢Â÷FCà¢Â÷G#à¢’—Ð¢Â÷F&öG“à¢Â÷F&ÆSà¢ÂöF—cà¢Âô6&D6öçFVçCà¢Âô6&Cà¢—Ð¢Âóà¢—Ð¢ÂöF—cà¢“°§Ð