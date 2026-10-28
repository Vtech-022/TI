// Mesclagem de três vias dos cartões de "Atividades da equipe".
//
// O cliente envia a lista que ele ESPERA ver depois da alteração (`next`) e a lista
// de onde partiu (`base`). O servidor aplica apenas a DIFERENÇA base → next sobre a
// versão atual (`current`), cartão a cartão (pelo id). Assim, duas pessoas mexendo no
// mesmo quadro ao mesmo tempo não apagam o trabalho uma da outra.
//
//  - cartão novo no `next`            → entra (se já não existir);
//  - cartão alterado em relação à base → a versão do cliente prevalece naquele cartão;
//  - cartão que estava na base e sumiu → é removido;
//  - cartões novos de outras pessoas  → são preservados;
//  - a ordem do cliente é respeitada.

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function mergeCards(current, base, next) {
  const cur = new Map(current.map((c) => [c.id, c]));
  const bas = new Map(base.map((c) => [c.id, c]));
  const nxt = new Map(next.map((c) => [c.id, c]));

  const out = [];
  const used = new Set();

  for (const card of next) {
    const inBase = bas.get(card.id);
    const inCur = cur.get(card.id);
    let chosen;
    if (!inBase) {
      // cartão criado pelo cliente
      chosen = card;
    } else if (!same(inBase, card)) {
      // cliente alterou este cartão
      chosen = card;
    } else if (inCur) {
      // cliente não mexeu: vale a versão mais nova do servidor
      chosen = inCur;
    } else {
      // o cliente não mexeu, mas alguém removeu no servidor: respeita a remoção
      continue;
    }
    out.push(chosen);
    used.add(card.id);
  }

  // cartões que só existem no servidor
  for (const card of current) {
    if (used.has(card.id)) continue;
    if (bas.has(card.id) && !nxt.has(card.id)) continue; // cliente removeu
    out.push(card);
  }
  return out;
}
