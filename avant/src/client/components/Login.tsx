// Tela de login: entrar com nome e senha, ou criar conta. A primeira conta criada é a do administrador.
import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { BrandMark } from '../App';
import { PASSWORD_MAX, PASSWORD_RULE, validateName, validatePassword } from '../../shared/auth';

export interface LoginProps {
  /** Ainda não existe nenhuma conta: a primeira será do administrador. */
  firstAccount: boolean;
  /** Exige o código da equipe para criar conta. */
  needCode?: boolean;
  subtitle: string;
  login(name: string, password: string): Promise<void>;
  register(name: string, password: string, code: string): Promise<void>;
}

export function Login({ firstAccount, needCode = false, subtitle, login, register }: LoginProps) {
  const [mode, setMode] = useState<'entrar' | 'criar'>(firstAccount ? 'criar' : 'entrar');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const nameErr = validateName(name);
    if (nameErr) return setError(nameErr);
    if (mode === 'criar') {
      const pwErr = validatePassword(password);
      if (pwErr) return setError(pwErr);
      if (password !== confirm) return setError('As senhas não conferem.');
    } else if (!password) return setError('Informe sua senha.');
    setBusy(true);
    try {
      if (mode === 'criar') await register(name.trim(), password, code.trim());
      else await login(name.trim(), password);
    } catch (err: any) {
      setError(err?.message ?? 'Não foi possível entrar.');
      setBusy(false);
    }
  };

  const pwInput = (value: string, set: (v: string) => void, label: string, auto: string) => (
    <label className="field">
      <span>{label}</span>
      <span className="pw-wrap">
        <input className="input" type={show ? 'text' : 'password'} value={value} onChange={(e) => set(e.target.value)} maxLength={PASSWORD_MAX} autoComplete={auto} />
        <button type="button" className="icon-btn" onClick={() => setShow(!show)} aria-label={show ? 'Esconder senha' : 'Mostrar senha'} title={show ? 'Esconder senha' : 'Mostrar senha'}>
          {show ? <EyeOff /> : <Eye />}
        </button>
      </span>
    </label>
  );

  return (
    <div className="gate">
      <form className="gate-card" onSubmit={submit} noValidate>
        <BrandMark size={64} />
        <h1>{mode === 'entrar' ? 'Entrar no AVANT' : firstAccount ? 'Criar a conta do administrador' : 'Criar sua conta'}</h1>
        <p>{firstAccount ? 'Ainda não há contas. Esta primeira conta será a do administrador do sistema.' : subtitle}</p>
        {!firstAccount && (
          <div className="seg" role="tablist" aria-label="Entrar ou criar conta">
            <button type="button" role="tab" aria-selected={mode === 'entrar'} className={mode === 'entrar' ? 'on' : ''} onClick={() => (setMode('entrar'), setError(null))}>
              Entrar
            </button>
            <button type="button" role="tab" aria-selected={mode === 'criar'} className={mode === 'criar' ? 'on' : ''} onClick={() => (setMode('criar'), setError(null))}>
              Criar conta
            </button>
          </div>
        )}
        <label className="field">
          <span>Nome</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Ana Souza" autoFocus maxLength={60} autoComplete="username" />
        </label>
        {pwInput(password, setPassword, 'Senha', mode === 'criar' ? 'new-password' : 'current-password')}
        {mode === 'criar' && (
          <>
            {pwInput(confirm, setConfirm, 'Confirmar senha', 'new-password')}
            <p className="small muted pw-rule">{PASSWORD_RULE}</p>
            {needCode && (
              <label className="field">
                <span>Código da equipe</span>
                <input className="input" type="password" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
              </label>
            )}
          </>
        )}
        {error && (
          <p className="gate-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? 'Aguarde…' : mode === 'entrar' ? 'Entrar' : 'Criar conta e entrar'}
        </button>
      </form>
    </div>
  );
}
