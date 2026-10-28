// Administração de usuários: só aparece para administradores.
import { KeyRound, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ConfirmDialog, Empty, Modal, Panel, Skeleton } from '../components/ui';
import { dateBr, localDate } from '../lib/format';
import { isAdmin, runtime } from '../lib/runtime';
import { useStore } from '../lib/store';
import { PASSWORD_MAX, PASSWORD_RULE, validatePassword } from '../../shared/auth';

type User = Awaited<ReturnType<NonNullable<typeof runtime.auth>['listUsers']>>[number];

export default function Users() {
  const { toast, fail } = useStore();
  const auth = runtime.auth;
  const [users, setUsers] = useState<User[] | null>(null);
  const [reset, setReset] = useState<User | null>(null);
  const [newPw, setNewPw] = useState('');
  const [remove, setRemove] = useState<User | null>(null);
  const [pwError, setPwError] = useState<string | null>(null);

  const load = () => auth?.listUsers().then(setUsers).catch(fail);
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!auth || !isAdmin()) return <Empty title="Área restrita ao administrador" />;
  const admins = users?.filter((u) => u.role === 'admin').length ?? 0;

  const setRole = async (u: User, role: User['role']) => {
    try {
      await auth.updateUser(u.id, { role });
      toast(role === 'admin' ? `${u.name} agora é administrador(a).` : `${u.name} agora é membro.`);
      void load();
    } catch (e) {
      fail(e);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">Administração</span>
          <h1>Usuários</h1>
          <p>Quem tem acesso ao AVANT. Administradores gerenciam contas e podem alterar os cartões de toda a equipe; membros alteram só os próprios.</p>
        </div>
      </div>
      <Panel title="Contas" count={users?.length} flush>
        {!users ? (
          <Skeleton rows={4} />
        ) : (
          <div className="table-wrap">
            <table className="data soft">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Perfil</th>
                  <th>Criada em</th>
                  <th style={{ textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const self = u.id === auth.me.id;
                  const lastAdmin = u.role === 'admin' && admins <= 1;
                  return (
                    <tr key={u.id}>
                      <td className="td-title">
                        {u.name}
                        {self && <span className="muted small"> (você)</span>}
                      </td>
                      <td>
                        <span className={`role-pill ${u.role}`}>
                          {u.role === 'admin' ? <ShieldCheck size={14} aria-hidden /> : <UserRound size={14} aria-hidden />}
                          {u.role === 'admin' ? 'Administrador' : 'Membro'}
                        </span>
                      </td>
                      <td className="muted">{dateBr(localDate(u.created_at))}</td>
                      <td>
                        <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
                          {u.role === 'membro' ? (
                            <button className="btn sm" onClick={() => setRole(u, 'admin')}>
                              Tornar administrador
                            </button>
                          ) : (
                            <button className="btn sm" disabled={lastAdmin} title={lastAdmin ? 'É preciso ter pelo menos um administrador' : undefined} onClick={() => setRole(u, 'membro')}>
                              Tornar membro
                            </button>
                          )}
                          <button className="btn sm" onClick={() => (setReset(u), setNewPw(''), setPwError(null))}>
                            <KeyRound size={14} /> Nova senha
                          </button>
                          <button className="btn sm danger" disabled={self || lastAdmin} title={self ? 'Você não pode excluir a própria conta' : undefined} onClick={() => setRemove(u)}>
                            <Trash2 size={14} /> Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Modal
        open={!!reset}
        title={`Nova senha para ${reset?.name ?? ''}`}
        label="Definir nova senha"
        onClose={() => setReset(null)}
        footer={
          <>
            <button className="btn" onClick={() => setReset(null)}>
              Cancelar
            </button>
            <button
              className="btn primary"
              onClick={async () => {
                const err = validatePassword(newPw);
                if (err) return setPwError(err);
                try {
                  await auth.updateUser(reset!.id, { password: newPw });
                  toast(`Senha de ${reset!.name} alterada. Informe a nova senha a ela pessoalmente.`);
                  setReset(null);
                } catch (e) {
                  fail(e);
                }
              }}
            >
              Salvar senha
            </button>
          </>
        }
      >
        <label className="field">
          <span>Nova senha</span>
          <input className="input" value={newPw} onChange={(e) => setNewPw(e.target.value)} maxLength={PASSWORD_MAX} autoComplete="new-password" data-autofocus />
        </label>
        <p className="small muted">{PASSWORD_RULE}</p>
        {pwError && <p className="gate-error">{pwError}</p>}
      </Modal>

      <ConfirmDialog
        open={!!remove}
        title="Excluir conta"
        message={`A conta de ${remove?.name ?? ''} será excluída e a pessoa não poderá mais entrar. Os cartões que ela registrou continuam no quadro.`}
        confirmLabel="Excluir conta"
        danger
        onCancel={() => setRemove(null)}
        onConfirm={async () => {
          try {
            await auth.removeUser(remove!.id);
            toast(`Conta de ${remove!.name} excluída.`);
            setRemove(null);
            void load();
          } catch (e) {
            fail(e);
          }
        }}
      />
    </div>
  );
}
