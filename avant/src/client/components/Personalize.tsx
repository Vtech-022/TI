// Painel "Personalizar": cada pessoa escolhe papel de parede, cor, fonte, tamanho do texto e tema.
// As mudanças aparecem na hora e ficam guardadas para essa pessoa neste navegador.
import { Check, Monitor, Moon, RotateCcw, Sun } from 'lucide-react';
import { DEFAULT_LOOK, FONTS, SCALES, useStore } from '../lib/store';
import { Modal } from './ui';
import { WALLPAPERS } from './Wallpaper';

const COLORS = [
  { hex: '#2f6bff', name: 'Azul' },
  { hex: '#7b4dff', name: 'Violeta' },
  { hex: '#d6409f', name: 'Rosa' },
  { hex: '#e5484d', name: 'Vermelho' },
  { hex: '#f76808', name: 'Laranja' },
  { hex: '#c28b00', name: 'Dourado' },
  { hex: '#1f9d55', name: 'Verde' },
  { hex: '#0f9e9e', name: 'Turquesa' },
  { hex: '#0b6e99', name: 'Petróleo' },
  { hex: '#475467', name: 'Grafite' }
];

const INTENSITY = [
  { value: 0.4, label: 'Suave' },
  { value: 0.7, label: 'Média' },
  { value: 1, label: 'Forte' }
];

export function Personalize({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { prefs, setPrefs } = useStore();
  return (
    <Modal
      open={open}
      title="Personalizar"
      label="Personalizar a aparência"
      onClose={onClose}
      className="modal-personalize"
      footer={
        <>
          <button className="btn ghost" onClick={() => setPrefs({ ...DEFAULT_LOOK, theme: 'sistema' })} style={{ marginRight: 'auto' }}>
            <RotateCcw size={15} /> Restaurar padrão
          </button>
          <button className="btn primary" onClick={onClose}>
            Pronto
          </button>
        </>
      }
    >
      <p className="small muted" style={{ marginTop: -6 }}>
        Do seu jeito: as mudanças aparecem na hora e valem só para você.
      </p>

      <section className="pz-sec">
        <h3>Papel de parede</h3>
        <div className="pz-walls">
          {WALLPAPERS.map((w) => (
            <button key={w.key} className={`pz-wall${prefs.wallpaper === w.key ? ' on' : ''}`} onClick={() => setPrefs({ wallpaper: w.key })} aria-pressed={prefs.wallpaper === w.key}>
              <span className={`pz-thumb wp-${w.key}`} aria-hidden>
                <i />
                <i />
                <i />
              </span>
              <strong>{w.label}</strong>
              <small>{w.hint}</small>
            </button>
          ))}
        </div>
        {prefs.wallpaper !== 'nenhum' && (
          <div className="pz-row">
            <span>Intensidade</span>
            <div className="seg compact">
              {INTENSITY.map((i) => (
                <button key={i.value} className={prefs.wallpaperIntensity === i.value ? 'on' : ''} onClick={() => setPrefs({ wallpaperIntensity: i.value })}>
                  {i.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <label className="pz-check">
          <input type="checkbox" checked={prefs.reduceMotion} onChange={(e) => setPrefs({ reduceMotion: e.target.checked })} />
          Deixar o fundo parado (sem animação)
        </label>
      </section>

      <section className="pz-sec">
        <h3>Cor principal</h3>
        <div className="pz-colors">
          {COLORS.map((c) => (
            <button key={c.hex} className={`pz-color${prefs.accent.toLowerCase() === c.hex ? ' on' : ''}`} style={{ background: c.hex }} onClick={() => setPrefs({ accent: c.hex })} aria-label={c.name} title={c.name}>
              {prefs.accent.toLowerCase() === c.hex && <Check aria-hidden />}
            </button>
          ))}
          <label className={`pz-color custom${COLORS.some((c) => c.hex === prefs.accent.toLowerCase()) ? '' : ' on'}`} title="Outra cor">
            <input type="color" value={prefs.accent} onChange={(e) => setPrefs({ accent: e.target.value })} aria-label="Escolher outra cor" />
          </label>
        </div>
      </section>

      <section className="pz-sec">
        <h3>Fonte</h3>
        <div className="pz-fonts">
          {FONTS.map((f) => (
            <button key={f.key} className={`pz-font${prefs.font === f.key ? ' on' : ''}`} style={{ fontFamily: f.css }} onClick={() => setPrefs({ font: f.key })} aria-pressed={prefs.font === f.key}>
              <span className="pz-aa">Aa</span>
              {f.label}
            </button>
          ))}
        </div>
      </section>

      <div className="pz-two">
        <section className="pz-sec">
          <h3>Tamanho do texto</h3>
          <div className="seg">
            {SCALES.map((s) => (
              <button key={s.value} className={prefs.scale === s.value ? 'on' : ''} onClick={() => setPrefs({ scale: s.value })} style={{ fontSize: 12 * s.value }}>
                {s.label}
              </button>
            ))}
          </div>
        </section>
        <section className="pz-sec">
          <h3>Tema</h3>
          <div className="seg">
            {(
              [
                ['claro', 'Claro', Sun],
                ['escuro', 'Escuro', Moon],
                ['sistema', 'Automático', Monitor]
              ] as const
            ).map(([k, label, Icon]) => (
              <button key={k} className={prefs.theme === k ? 'on' : ''} onClick={() => setPrefs({ theme: k })}>
                <Icon size={14} aria-hidden /> {label}
              </button>
            ))}
          </div>
        </section>
      </div>
    </Modal>
  );
}
