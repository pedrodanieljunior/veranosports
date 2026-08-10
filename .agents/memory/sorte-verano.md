---
name: Sorte Verano Lucky Numbers
description: Sistema de números da sorte vinculado ao Clube Verano — geração automática ao pagar bônus semanal, 5 períodos de apuração, aba no admin.
---

# Sorte Verano

## Schema
- Tabela: `sorte_verano_numbers` (criada via SQL direto, não drizzle-kit push — este é interativo)
- Colunas: id, user_id, number (5-digit padded text, único globalmente), period_id (1-5), club_level (1-4), created_at
- Constantes exportadas de `shared/schema.ts`: `SORTE_VERANO_PERIODS`, `SORTE_VERANO_NUMBERS_PER_LEVEL`, type `SorteVeranoNumber`

## Lógica de negócio
- Números por nível: Bronze=1, Prata=2, Ouro=3, Diamante=4
- Gerados automaticamente no `checkAndAwardClubFw` após pagar o bônus
- Gerados para TODOS os períodos com janela de coleta ativa na data atual
- Unicidade global: busca todos os números existentes antes de gerar (pode ser lento com muitos registros — otimizar se necessário)

## Períodos de apuração
1. 10/08–31/08/2026, sorteio 01/09/2026
2. 07/09–28/09/2026, sorteio 29/09/2026
3. 05/10–26/10/2026, sorteio 27/10/2026
4. 02/11–30/11/2026, sorteio 01/12/2026
5. 10/08–21/12/2026, sorteio 23/12/2026

## Endpoints
- `GET /api/sorte-verano` — números do usuário autenticado
- `GET /api/admin/sorte-verano` — todos os números com userName e userPhone (admin)

## Frontend
- ProfileModal.tsx: View type inclui "sorte", menu item após "Convite", componente `SorteVeranoView`
- Admin.tsx: tab "sorte" com componente `SorteVeranoTab` — mostra cards por período + tabela filtrável

**Why:** drizzle-kit push é interativo; usar SQL direto (`node -e "..."`) para criar tabelas novas em dev.
