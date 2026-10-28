// Menu da conta (avatar): perfil, alterar a própria senha e sair.
import { KeyRound, LogOut, Palette, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { runtime, userName } from '../lib/runtime';
import { useStore } from '../lib/store';
import { Modal } from './ui';
import { PASSWORD_MAX, PASSWORD_RULE, validatePassword } from '../../shared/auth';

export function AccountMenu() {
  const auth = runtime.auth;
  const { toast } = useStore();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState<{ current: string; next: string; confirm: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const name = userName();

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const avatar = (
    <span className="avatar me" aria-hidden>
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
  if (!auth)
    return (
      <span title={name} aria-label={name}>
        {avatar}
      </span>
    );

  return (
    <div className="account" ref={ref}>
      <button className="account-btn" onClick={() => setOpen(!open)} aria-label={`Conta de ${name}`} aria-expanded={open} title={name}>
        {avatar}
      </button>
      {open && (
        <div className="account-pop" role="menu">
          <div className="ap-head">
            <strong>{name}</strong>
            <span className={`role-pill ${auth.me.role}`}>
              {auth.me.role === 'admin' && <ShieldCheck size={13} aria-hidden />}
              {auth.me.role === 'admin' ? 'Administrador' : 'Membro'}
            </span>
          </div>
          <button role="menuitem" onClick={() => (setOpen(false), window.dispatchEvent(new Event('avant:personalize')))}>
            <Palette aria-hidden /> Personalizar
          </button>
          <button role="menuitem" onClick={() => (setOpen(false), setPw({ current: '', next: '', confirm: '' }), setError(null))}>
            <KeyRound aria-hidden /> Alterar minha senha
          </button>
          <button role="menuitem" onClick={() => void auth.logout().then(() => location.reload())}>
            <LogOut aria-hidden /> Sair
          </button>
        </div>
      )}
      <Modal
        open={!!pw}
        title="Alterar minha senha"
        label="Alterar minha senha"
        onClose={() => setPw(null)}
        footer={
          <>
            <button className="btn" onClick={() => setPw(null)}>
              Cancelar
            </button>
            <button
              className="btn primary"
              onClick={async () => {
                if (!pw) return;
                const err = validatePassword(pw.next);
                if (err) return setError(err);
                if (pw.next !== pw.confirm) return setError('As senhas novas não conferem.');
                try {
                  await auth.changePassword(pw.current, pw.next);
                  toast('Senha alterada.');
                  setPw(null);
                } catch (e: any) {
                  setError(e?.message ?? 'Não foi possível alterar a senha.');
                }
              }}
            >
              Salvar
            </button>
          </>
        }
      >
        {pw && (
          <>
            {(['current', 'next', 'confirm'] as const).map((k) => (
              <label className="field" key={k}>
                <span>{k === 'current' ? 'Senha atual' : k === 'next' ? 'Nova senha' : 'Confirmar nova senha'}</span>
                <input className="input" type="password" value={pw[k]} maxLength={PASSWORD_MAX} onChange={(e) => setPw({ ...pw, [k]: e.target.value })} autoComplete={k === 'current' ? 'current-password' : 'new-password'} data-autofocus={k === 'current' || undefined} />
              </label>
            ))}
            <p className="small muted">{PASSWORD_RULE}</p>
            {error && <p className="gate-error">{error}</p>}
          </>
        )}
      </Modal>
    </div>
  );
}
