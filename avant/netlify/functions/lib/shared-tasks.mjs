// Tarefas compartilhadas da equipe: regras puras (validação, visibilidade e permissões).
// Ficam separadas do servidor para poderem ser testadas sem rede.

export const STATUS = ["pendente", "em_andamento", "concluida"];
export const KINDS = ["fazer", "validar"];
export const VISIBILITY = ["individual", "equipe"];
export const IMPACTS = ["baixo", "medio", "alto"];

export const TASK_LIMITS = { tasks: 4000, subtasks: 40, title: 200, text: 2000 };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const str = (v, max) => String(v ?? "").trim().slice(0, max);

function fail(message, code = "tarefa") {
  const e = new Error(message);
  e.status = 400;
  e.code = code;
  throw e;
}

function validDate(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string" || !DATE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) fail("Data inválida.");
  return v;
}

/** Limpa e valida o conteúdo enviado ao criar/editar uma tarefa. Devolve só campos conhecidos. */
export function cleanTaskInput(input, { partial = false } = {}) {
  const out = {};
  const has = (k) => input[k] !== undefined;
  if (!partial || has("title")) {
    const t = str(input.title, TASK_LIMITS.title);
    if (t.length < 2) fail("Dê um título à tarefa (pelo menos 2 letras).");
    out.title = t;
  }
  if (has("description")) out.description = str(input.description, TASK_LIMITS.text);
  if (has("visibility")) {
    if (!VISIBILITY.includes(input.visibility)) fail("Visibilidade inválida.");
    out.visibility = input.visibility;
  }
  if (has("kind")) {
    if (!KINDS.includes(input.kind)) fail("Tipo inválido.");
    out.kind = input.kind;
  }
  if (has("status")) {
    if (!STATUS.includes(input.status)) fail("Situação inválida.");
    out.status = input.status;
  }
  if (has("impact")) {
    if (input.impact !== null && input.impact !== "" && !IMPACTS.includes(input.impact)) fail("Impacto inválido.");
    out.impact = input.impact || null;
  }
  if (has("due_date")) out.due_date = validDate(input.due_date);
  if (has("due_time")) {
    if (input.due_time && !TIME.test(input.due_time)) fail("Horário inválido.");
    out.due_time = input.due_time || null;
  }
  if (has("assignee")) out.assignee = input.assignee ? String(input.assignee) : null;
  if (has("note")) out.note = str(input.note, TASK_LIMITS.text);
  if (has("origin")) out.origin = input.origin === "espera" ? "espera" : "tarefa";
  if (has("subtasks")) {
    if (!Array.isArray(input.subtasks)) fail("Subtarefas inválidas.");
    if (input.subtasks.length > TASK_LIMITS.subtasks) fail(`No máximo ${TASK_LIMITS.subtasks} subtarefas por tarefa.`);
    out.subtasks = input.subtasks.map((s, i) => {
      const title = str(s?.title, TASK_LIMITS.title);
      if (title.length < 1) fail("Toda subtarefa precisa de um título.");
      return { id: str(s?.id, 40) || `s${i + 1}`, title, done: !!s?.done };
    });
  }
  return out;
}

/** Quem pode ver: dono, responsável, administrador ou todos (quando a visibilidade é "equipe"). */
export function canSee(task, user) {
  return task.visibility === "equipe" || task.owner === user.id || task.assignee === user.id || user.role === "admin";
}

export const canManage = (task, user) => task.owner === user.id || user.role === "admin";

/** O responsável (que não é o dono) só mexe no andamento: situação, subtarefas marcadas e observação. */
export const ASSIGNEE_FIELDS = ["status", "subtasks", "note"];

export function assigneeCanApply(task, patch) {
  const keys = Object.keys(patch);
  if (!keys.every((k) => ASSIGNEE_FIELDS.includes(k))) return false;
  if (patch.subtasks) {
    // só pode marcar/desmarcar: a lista (ids e títulos) tem de continuar a mesma
    const a = (task.subtasks ?? []).map((s) => `${s.id}|${s.title}`).join("\n");
    const b = patch.subtasks.map((s) => `${s.id}|${s.title}`).join("\n");
    if (a !== b) return false;
  }
  return true;
}
