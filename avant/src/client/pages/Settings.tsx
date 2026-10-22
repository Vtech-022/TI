import { Database, Keyboard, MonitorSmartphone, Plug } from 'lucide-react';
import { SHORTCUTS } from '../components/Overlays';
import { Panel } from '../components/ui';
import { longDate } from '../lib/format';
import { useStore } from '../lib/store';

export default function SettingsPage() {
  const { meta, prefs, setPrefs } = useStore();
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Sistema</div>
          <h1>Configurações</h1>
          <p>Preferências de interface, dados e integrações. Integrações externas só aparecem como ativas depois de configuradas, autorizadas e testadas.</p>
        </div>
      </div>
      <div className="grid cols-2">
        <Panel title="Interface" icon={<MonitorSmartphone />}>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
            <input type="checkbox" checked={prefs.reduceMotion} onChange={(e) => setPrefs({ reduceMotion: e.target.checked })} />
            Reduzir animações (a preferência do sistema operacional também é respeitada)
          </label>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="checkbox" checked={prefs.sidebarCollapsed} onChange={(e) => setPrefs({ sidebarCollapsed: e.target.checked })} />
            Menu lateral recolhido
          </label>
          <p className="small muted" style={{ marginTop: 12 }}>
            Preferências de interface ficam salvas neste navegador.
          </p>
        </Panel>
        <Panel title="Dados e fuso horário" icon={<Database />}>
          <dl className="kv">
            <dt>Fuso horário</dt>
            <dd>{meta?.tz}</dd>
            <dt>Data de referência</dt>
            <dd>{meta ? longDate(meta.today) : '—'}</dd>
            <dt>Armazenamento</dt>
            <dd>SQLite local (data/avant.db) e arquivos originais em data/uploads</dd>
            <dt>Limite por arquivo</dt>
            <dd>{meta?.max_upload_mb} MB</dd>
            <dt>Formatos interpretados</dt>
            <dd>{meta?.supported_formats.map((f) => f.ext).join(', ')}</dd>
          </dl>
          <div className="btn-row" style={{ marginTop: 14 }}>
            <a className="btn" href="/api/export">
              Baixar cópia de segurança (JSON)
            </a>
          </div>
        </Panel>
        <Panel title="Integrações" icon={<Plug />} flush>
          <table className="data">
            <tbody>
              {meta?.integrations.map((i) => (
                <tr key={i.name}>
                  <td>{i.name}</td>
                  <td>
                    <span className="badge neutral">Não configurada</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small muted" style={{ padding: '10px 18px 14px' }}>
            A captura funciona por texto colado e arquivos importados, sem acesso automático a WhatsApp, e-mail ou calendários. A interpretação usa regras locais; nenhum dado é enviado a serviços de IA.
          </p>
        </Panel>
        <Panel title="Atalhos de teclado" icon={<Keyboard />} flush>
          <table className="data">
            <tbody>
              {SHORTCUTS.map(([k, v]) => (
                <tr key={k}>
                  <td style={{ width: 170 }}>
                    <kbd>{k}</kbd>
                  </td>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </>
  );
}
