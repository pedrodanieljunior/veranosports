// VERSÃO DE DEBUG — completamente estática, sem fetch, sem estado, sem hooks nativos
// Para isolar se o freeze vem desta view ou do nível acima (ProfileModal/Copa)

import { ChevronLeft } from "lucide-react";

interface Props { onBack: () => void; }

export function ConfiguracoesView({ onBack }: Props) {
  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800">
        <ChevronLeft className="w-4 h-4" /> Voltar
      </button>
      <div className="rounded-xl border border-blue-100 bg-white/80 p-4">
        <p className="text-sm font-semibold text-gray-700 mb-1">Teste de debug</p>
        <p className="text-xs text-gray-500">Esta tela está totalmente estática (sem fetch, sem estado). Se ainda travar, o problema é no modal, não aqui.</p>
      </div>
    </div>
  );
}
