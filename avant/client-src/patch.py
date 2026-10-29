#!/usr/bin/env python3
"""Gera public/index.html (AVANT compartilhado, com servidor) a partir do AVANT.original.html.

O AVANT.original.html é a versão "arquivo único", que guarda tudo no navegador de cada pessoa.
Este script troca APENAS três camadas, mantendo todas as telas e regras de negócio:

  1. Login/contas      -> contas reais no servidor (POST /api/auth/*, /api/users)
  2. Atividades equipe -> quadro compartilhado no servidor (GET/PUT /api/team), com mesclagem
  3. Armazenamento     -> a cópia do banco pessoal de cada conta fica no servidor (/api/data),
                          arquivos originais em /api/docfiles, anexos em /api/files,
                          preferências em /api/prefs; atualização "ao vivo" por /api/ping

Cada substituição confere que o trecho procurado existe exatamente uma vez; se o arquivo
original mudar, o script para em vez de gerar uma página quebrada.

Uso:  python3 client-src/patch.py
"""
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
SRC = HERE / "AVANT.original.html"
OUT = HERE.parent / "public" / "index.html"

s = SRC.read_text(encoding="utf8")


def once(text):
    if s.count(text) != 1:
        sys.exit(f"ERRO: trecho esperado 1 vez, encontrado {s.count(text)}x: {text[:80]!r}")


def sub(old, new):
    """Substitui um trecho que deve existir exatamente uma vez."""
    global s
    once(old)
    s = s.replace(old, new)


def sub_all(old, new, expected):
    global s
    if s.count(old) != expected:
        sys.exit(f"ERRO: {old[:60]!r} esperado {expected}x, encontrado {s.count(old)}x")
    s = s.replace(old, new)


def cut(start, end, new):
    """Troca tudo de `start` (inclusive) até `end` (exclusive)."""
    global s
    once(start)
    i = s.index(start)
    j = s.index(end, i)
    s = s[:i] + new + s[j:]


# ---------------------------------------------------------------------------------------
# 0. Regra da senha: no mínimo 7 caracteres (letra + número + especial, sem espaços)
# ---------------------------------------------------------------------------------------
sub(
    "e.length<4||e.length>7?`A senha deve ter de 4 a 7 caracteres.`",
    "e.length<7||e.length>64?`A senha deve ter no mínimo 7 caracteres.`",
)
sub_all("De 4 a 7 caracteres, com pelo menos", "No mínimo 7 caracteres, com pelo menos", 3)
sub_all("maxLength:7", "maxLength:64", 3)

# ---------------------------------------------------------------------------------------
# 1. Armazenamento local por conta + arquivos originais no servidor
# ---------------------------------------------------------------------------------------
sub("async function oz(e){try{let t=await az();", "async function __avOz0(e){try{let t=await az();")
sub("async function sz(e,t){try{let n=await az();", "async function __avSz0(e,t){try{let n=await az();")

STORAGE = r'''
/* ===== AVANT servidor: infraestrutura de rede ===== */
var __avGen=null,__avOffline=!1,__avLost=!1,__avRetry=null;
class AvErr extends Error{constructor(m,status,code,extra){super(m);this.status=status;this.code=code;this.extra=extra}}
function __avSetOffline(b){if(__avOffline===b)return;__avOffline=b;ez({...ZR,offline:b})}
function __avSessionLost(){if(__avLost)return;__avLost=!0;try{Kz(`Sua sessão expirou. Entre novamente.`,`error`)}catch{}setTimeout(()=>location.reload(),1500)}
async function __avFetch(path,opts={}){
  const headers={"x-avant":"1",...(opts.headers||{})};
  let res;
  try{res=await fetch("/api"+path,{credentials:"same-origin",cache:"no-store",...opts,headers})}
  catch(e){__avSetOffline(!0);throw new AvErr("Sem conexão com o servidor.",0,"offline")}
  __avSetOffline(!1);
  if(res.status===401&&!path.startsWith("/auth/")){__avSessionLost();throw new AvErr("Sua sessão expirou. Entre novamente.",401,"nao_autenticado")}
  return res;
}
async function __avJson(path,opts={}){
  const headers={...(opts.headers||{})};
  let body=opts.body;
  if(body!==void 0&&!(body instanceof Uint8Array)&&typeof body!=="string"){headers["content-type"]="application/json";body=JSON.stringify(body)}
  const res=await __avFetch(path,{...opts,headers,body});
  let data=null;try{data=await res.json()}catch{}
  if(!res.ok)throw new AvErr(data?.message||"Não foi possível concluir a operação.",res.status,data?.code,data);
  return data;
}

/* ===== armazenamento: cache local por conta; originais de documentos no servidor ===== */
const __avLocalKey=k=>`u:${window.__avUid||"anon"}:${k}`;
async function oz(k){
  if(k.startsWith("file:")){
    try{
      const res=await __avFetch(`/docfiles/${k.slice(5)}`);
      if(!res.ok)return void 0;
      const bytes=new Uint8Array(await res.arrayBuffer());
      return{filename:decodeURIComponent(res.headers.get("x-filename")||"arquivo"),type:res.headers.get("x-mime")||"application/octet-stream",bytes};
    }catch{return void 0}
  }
  return __avOz0(__avLocalKey(k));
}
async function sz(k,v){
  if(k.startsWith("file:")){
    try{
      const res=await __avFetch(`/docfiles/${k.slice(5)}`,{method:"PUT",body:v.bytes,headers:{"x-filename":encodeURIComponent(v.filename||"arquivo"),"x-mime":v.type||"application/octet-stream"}});
      return res.ok;
    }catch{return!1}
  }
  return __avSz0(__avLocalKey(k),v);
}
async function __avHas(k){try{const res=await __avFetch(`/docfiles/${k.slice(5)}?head=1`);return res.ok}catch{return!1}}

/* ===== banco pessoal da conta: cópia no servidor, com controle de versão ===== */
var pz=null,mz=!1,hz=!1,gz=null;
async function dz(){
  const local=await oz("snapshot");
  let localBytes=null;
  try{localBytes=local?(local.gz?await nz(iz(local.b64)):iz(local.b64)):null}catch{localBytes=null}
  let res;
  try{res=await __avFetch("/data")}
  catch(e){
    if(e.status===401)throw e;
    ez({kind:"erro",offline:!0,message:"Sem conexão com o servidor. As alterações ficam neste navegador e serão enviadas quando a conexão voltar.",pending:!1});
    return{bytes:localBytes,confirmedEmpty:!1,cloudReady:!1};
  }
  if(res.status===204){
    __avGen=null;
    ez({kind:"nuvem",savedAt:null,pending:!1,offline:__avOffline});
    return{bytes:localBytes,confirmedEmpty:!localBytes,cloudReady:!0,localNewer:!!localBytes};
  }
  if(!res.ok){
    ez({kind:"erro",message:"Não foi possível ler os dados do servidor. Para não sobrescrever nada, as alterações desta sessão ficam só neste navegador.",pending:!1});
    return{bytes:localBytes,confirmedEmpty:!1,cloudReady:!1};
  }
  const gen=res.headers.get("x-gen")||null,savedAt=res.headers.get("x-saved-at")||null,isGz=res.headers.get("x-gz")==="1";
  let bytes=new Uint8Array(await res.arrayBuffer());
  if(isGz)bytes=await nz(bytes);
  __avGen=gen;
  const localNewer=!!(local&&localBytes&&savedAt&&local.savedAt>savedAt);
  ez({kind:"nuvem",savedAt,pending:localNewer,offline:__avOffline});
  return{bytes:localNewer?localBytes:bytes,confirmedEmpty:!1,cloudReady:!0,localNewer};
}
function _z(e){gz=e,ez({...ZR,pending:!0}),pz&&clearTimeout(pz),pz=setTimeout(yz,1200)}
function vz(){return ZR.pending}
function __avPutData(bytes,isGz,base,force){
  return __avFetch("/data",{method:"PUT",body:bytes,headers:{"x-gz":isGz?"1":"0","x-base-gen":base||"",...(force?{"x-force":"1"}:{})}});
}
async function yz(){
  if(!gz)return;
  if(mz){hz=!0;return}
  mz=!0;
  try{
    const savedAt=new Date().toISOString();
    const{data:t,gz:n}=await tz(gz());
    await sz("snapshot",{savedAt,b64:rz(t),gz:n});
    let res=await __avPutData(t,n,__avGen,!1);
    if(res.status===409){
      const info=await res.json().catch(()=>({}));
      try{Kz("Outro aparelho tinha salvo alterações antes. As suas alterações foram mantidas e substituíram as do outro aparelho.","error")}catch{}
      res=await __avPutData(t,n,info.gen||"",!0);
    }
    if(!res.ok){const j=await res.json().catch(()=>({}));throw new AvErr(j.message||"Falha ao salvar.",res.status)}
    const j=await res.json();
    __avGen=j.gen;
    __AVP.seenGen=j.gen;
    ez({kind:"nuvem",savedAt:j.savedAt,pending:!1,offline:__avOffline});
  }catch(e){
    if(e.status===401)return;
    ez({kind:"erro",offline:e.code==="offline",message:e.code==="offline"?"Sem conexão. As alterações estão salvas neste navegador e serão enviadas quando a conexão voltar.":`Falha ao salvar no servidor (${e.message}). As alterações estão salvas neste navegador e serão reenviadas.`,pending:!1});
    if(!__avRetry)__avRetry=setTimeout(()=>{__avRetry=null;yz()},8000);
  }finally{mz=!1;hz&&(hz=!1,yz())}
}

/* ===== "ao vivo": consulta leve a cada ~3 s (10 s se parado; pausa com a aba escondida) ===== */
var __AVP={dataCb:null,teamCbs:new Set(),teamTag:null,seenGen:null,timer:null,lastInput:Date.now(),running:!1,inflight:!1};
function fz(cb){__AVP.dataCb=cb;__avStartPoll()}
function __avInterval(){return Date.now()-__AVP.lastInput>9e4?1e4:3e3}
function __avSchedule(){clearTimeout(__AVP.timer);__AVP.timer=setTimeout(__avTick,__avInterval())}
function __avStartPoll(){
  if(__AVP.running)return;
  __AVP.running=!0;
  const bump=()=>{__AVP.lastInput=Date.now()};
  for(const ev of["pointerdown","keydown","scroll","touchstart"])window.addEventListener(ev,bump,{passive:!0});
  document.addEventListener("visibilitychange",()=>{if(!document.hidden){bump();__avTick(!0)}});
  window.addEventListener("online",()=>__avTick(!0));
  __avSchedule();
}
async function __avTick(now){
  clearTimeout(__AVP.timer);
  if(document.hidden&&now!==!0){__avSchedule();return}
  if(__AVP.inflight){__avSchedule();return}
  __AVP.inflight=!0;
  try{
    const j=await __avJson(`/ping?t=${encodeURIComponent(__AVP.teamTag??"")}&d=${encodeURIComponent(__avGen??"")}`);
    if(__AVP.teamCbs.size&&j.t!==__AVP.teamTag)for(const f of __AVP.teamCbs)f();
    if(j.d&&j.d!==__avGen&&j.d!==__AVP.seenGen&&!mz&&__AVP.dataCb){
      try{await __AVP.dataCb();__AVP.seenGen=j.d}catch{}
    }
  }catch{}finally{__AVP.inflight=!1;__avSchedule()}
}

/* ===== preferências ("Personalizar") salvas na conta ===== */
async function __avLoadPrefs(){
  try{
    const j=await __avJson("/prefs");
    if(j&&j.prefs){try{localStorage.setItem(Ca(),JSON.stringify(j.prefs))}catch{}}
    else{
      const loc=localStorage.getItem(Ca());
      if(loc)__avJson("/prefs",{method:"PUT",body:JSON.parse(loc)}).catch(()=>{});
    }
  }catch{}
  let t=null;
  window.__avSavePrefs=p=>{clearTimeout(t);t=setTimeout(()=>__avJson("/prefs",{method:"PUT",body:p}).catch(()=>{}),800)};
}
'''
cut("var cz=null,lz=null;", "async function bz(e){let t=await crypto.subtle.digest", STORAGE.strip() + "\n")
sub("await oz(`file:${o}`)?!0:await sz(", "await __avHas(`file:${o}`)?!0:await sz(")
sub("storage_path:d?`navegador:${o}`:`indisponivel`", "storage_path:d?`servidor:${o}`:`indisponivel`")
sub("localStorage.setItem(Ca(),JSON.stringify(n))", "localStorage.setItem(Ca(),JSON.stringify(n)),window.__avSavePrefs&&window.__avSavePrefs(n)")

# ---------------------------------------------------------------------------------------
# 2. Atividades da equipe: quadro compartilhado no servidor
# ---------------------------------------------------------------------------------------
TEAM = r'''function Mz(me){
  const subs=new Set(),errs=new Set(),last={};
  let people=[],tag=null,loaded=!1;
  const view=()=>people.map(p=>({id:p.id,name:(p.name||"Colaborador")+(p.removed?" (conta removida)":""),avatarUrl:null,isMe:p.id===me.id,items:p.items}));
  const emit=()=>{const v=view();subs.forEach(f=>f(v))};
  async function load(force){
    const res=await __avFetch("/team",{headers:tag&&!force?{"if-none-match":tag}:{}});
    if(res.status===304)return;
    if(!res.ok){const j=await res.json().catch(()=>({}));throw new AvErr(j.message||"Não foi possível ler o quadro da equipe.",res.status)}
    const j=await res.json();
    tag=j.tag;__AVP.teamTag=j.tag;
    people=j.people.sort((a,b)=>(a.removed?1:0)-(b.removed?1:0)||a.name.localeCompare(b.name,"pt-BR"));
    for(const p of people)last[p.id]=p.items;
    loaded=!0;emit();
  }
  const refresh=()=>load(!1).catch(e=>{if(e.status!==401&&e.code!=="offline")errs.forEach(f=>f(e.message))});
  async function save(uid,items){
    const base=last[uid]??[];
    const j=await __avJson(`/team/${uid}`,{method:"PUT",body:{base,items}});
    last[uid]=j.items;
    const p=people.find(x=>x.id===uid);if(p)p.items=j.items;
    emit();
    load(!0).catch(()=>{});
  }
  return{
    async me(){return{id:me.id,canWrite:!0,name:me.name,isOwner:me.role==="admin",canUpload:!0}},
    subscribe(cb,onErr){
      subs.add(cb);if(onErr)errs.add(onErr);
      __AVP.teamCbs.add(refresh);
      if(loaded){cb(view());refresh()}
      else load(!0).catch(e=>onErr&&onErr(e.message||"Falha ao ler as atividades da equipe."));
      return()=>{subs.delete(cb);if(onErr)errs.delete(onErr);if(!subs.size)__AVP.teamCbs.delete(refresh)};
    },
    async removePerson(id){await __avJson(`/team/${id}`,{method:"DELETE"});await load(!0)},
    saveMine:items=>save(me.id,items),
    saveFor:(id,items)=>save(id,items),
    async upload(f){
      const ext=(f.name.split(".").pop()??"").toLowerCase();
      if(["doc","docx","xls","xlsx","ppt","pptx"].includes(ext))throw Error(`"${f.name}": arquivos do Office não são aceitos como anexo. Salve como PDF e envie novamente.`);
      if(!Oz[ext])throw Error(`"${f.name}": formato não aceito. Use foto (PNG, JPG, GIF, WEBP), vídeo (MP4, WEBM), PDF ou texto (TXT, CSV, MD, JSON).`);
      if(f.size>4194304)throw Error(`"${f.name}" passa de 4 MB.`);
      return __avJson(`/files?name=${encodeURIComponent(f.name)}`,{method:"POST",body:new Uint8Array(await f.arrayBuffer())});
    },
    fileUrl(a){return`/api/files/${a.id}`},
    async download(a){
      const res=await __avFetch(`/files/${a.id}?download=1`);
      if(!res.ok)throw Error("Não foi possível obter o arquivo.");
      const u=URL.createObjectURL(await res.blob()),l=document.createElement("a");
      l.href=u;l.download=a.name;document.body.appendChild(l);l.click();l.remove();
      setTimeout(()=>URL.revokeObjectURL(u),6e4);
    }
  };
}
'''
cut("function Mz(e){let t=new Map,n=new Set,", "function Nz({firstAccount:e,", TEAM)

# ---------------------------------------------------------------------------------------
# 3. Contas: login por nome, no servidor
# ---------------------------------------------------------------------------------------
AUTH = r'''function Wz(me){
  return{
    me,
    async logout(){try{await __avFetch("/auth/logout",{method:"POST"})}catch{}},
    async listUsers(){return __avJson("/users")},
    async updateUser(id,patch){await __avJson(`/users/${id}`,{method:"PATCH",body:patch})},
    async removeUser(id){await __avJson(`/users/${id}`,{method:"DELETE"})},
    async changePassword(current,next){await __avJson("/auth/password",{method:"POST",body:{current,next}})}
  };
}
'''
cut("var Pz=`avant.contas`,Fz=`avant.sessao`;", "var Gz=document.getElementById(`root`)", AUTH)

GATE = r'''async function Xz(){
  try{
    const r=await __avFetch("/auth/me");
    if(r.ok){const u=(await r.json()).user;if(u)return u}
  }catch(e){
    if(e.code==="offline")throw Error("Sem conexão com o servidor. Verifique a internet e recarregue a página.");
  }
  const st=await __avJson("/auth/status").catch(()=>({firstAccount:!1,needCode:!1}));
  return new Promise(done=>Yz.render((0,q.jsx)(AvGate,{st,Gate:Nz,done})));
}
'''
cut("function Xz(){let e=Bz();", "async function Zz(){", GATE)

# ---------------------------------------------------------------------------------------
# 4. Indicador "● Ao vivo" no rodapé do menu
# ---------------------------------------------------------------------------------------
STATUS = r'''function qz(){
  let[e,t]=(0,x.useState)(null);
  (0,x.useEffect)(()=>$R(t),[]);
  if(!e)return null;
  const hhmm=v=>v?new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",hour:"2-digit",minute:"2-digit"}).format(new Date(v)):null;
  if(e.offline)return(0,q.jsx)("span",{title:"Sem conexão com o servidor. O AVANT tenta de novo sozinho.",style:{color:"#f3c775"},children:"Sem conexão"});
  if(e.kind==="local")return(0,q.jsx)("span",{title:e.reason,children:"Conectando…"});
  if(e.kind==="erro")return(0,q.jsx)("span",{title:e.message,style:{color:"#f3a59c"},children:"Atenção: falha ao salvar"});
  if(e.pending)return(0,q.jsx)("span",{title:"Salvando alterações",children:"Salvando…"});
  const at=hhmm(e.savedAt);
  return(0,q.jsxs)("span",{title:"O que a equipe altera aparece aqui em poucos segundos, sem recarregar."+(at?" Último salvamento seu: "+at+".":""),children:[(0,q.jsx)("span",{"aria-hidden":!0,style:{color:"#34d399",marginRight:6}} ,"●"),"Ao vivo"]});
}
'''
STATUS = STATUS.replace('style:{color:"#34d399",marginRight:6}} ,"●")', 'style:{color:"#34d399",marginRight:6},children:"●"})')
cut("function qz(){let[e,t]=(0,x.useState)(null);", "async function Jz(e){", STATUS)

# ---------------------------------------------------------------------------------------
# 5. Inicialização
# ---------------------------------------------------------------------------------------
sub(
    "if(!window.claude){let e=await Xz();Wi.userName=e.name,Wi.auth=Wz(e)}",
    "{let e=await Xz();window.__avUid=e.id;Wi.userName=e.name;Wi.auth=Wz(e);await __avLoadPrefs()}",
)
sub_all("maxUploadBytes:15728640", "maxUploadBytes:4194304", 1)
sub("r=vp(t)", "r=Wi.auth.me.is_first_admin?vp(t):!1")
sub("e.cloudReady&&e.bytes||n()", "e.cloudReady&&e.bytes&&!e.localNewer||n()")
sub("Wi.team=window.claude||!Wi.auth?kz():Mz(Wi.auth.me)", "Wi.team=Mz(Wi.auth.me)")
sub("!t.startsWith(`/_blob/`)&&", "!t.startsWith(`/_blob/`)&&!t.startsWith(`/api/files/`)&&")

# ---------------------------------------------------------------------------------------
# 6. Melhorias de uso: equipe, calendário, recuperar senha, busca, upload sem criar tarefas
# ---------------------------------------------------------------------------------------
AVX_JS = (HERE / "avx.js").read_text(encoding="utf8")
AVX_CSS = (HERE / "avx.css").read_text(encoding="utf8")

# componentes novos entram logo antes da tela de entrada (mesmo escopo do app)
sub("function Nz({firstAccount:e,needCode:t=!1,subtitle:n,login:r,register:i}){",
    AVX_JS + "\nfunction Nz({firstAccount:e,needCode:t=!1,subtitle:n,login:r,register:i,onForgot:avf}){")
sub("children:y?`Aguarde…`:a===`entrar`?`Entrar`:`Criar conta e entrar`})]})})}",
    "children:y?`Aguarde…`:a===`entrar`?`Entrar`:`Criar conta e entrar`}),a===`entrar`&&!e&&avf&&(0,q.jsx)(`button`,{className:`btn ghost`,type:`button`,onClick:avf,children:`Esqueci minha senha`})]})})}")

# ---- Nova tarefa: sem "Esforço", Impacto explicado, campos extras recolhidos, atribuição ----
sub("function El({draft:e,onChange:t,parentOptions:n}){", "function El({draft:e,onChange:t,parentOptions:n,share:avs}){")
sub("(0,q.jsx)(gl,{label:`Impacto`,children:", "(0,q.jsx)(gl,{label:`Impacto`,hint:__avImpactHelp,children:")
cut("(0,q.jsx)(gl,{label:`Esforço`,children:", "(0,q.jsx)(gl,{label:`Categoria`,children:", "")
# Responsável + Envolvidos + Categoria vão para "Mais detalhes"
RESP_START = "(0,q.jsx)(gl,{label:`Responsável`,children:(0,q.jsx)(`input`,{className:`input`,value:e.responsible,"
RESP_END = "(0,q.jsx)(gl,{label:`Impacto`,hint:__avImpactHelp,children:"
i0 = s.index(RESP_START); j0 = s.index(RESP_END, i0)
resp_block = s[i0:j0]
s = s[:i0] + s[j0:]
CAT_START = "(0,q.jsx)(gl,{label:`Categoria`,children:"
CAT_END = "(0,q.jsx)(gl,{label:`Próxima ação`,full:!0,children:"
i1 = s.index(CAT_START); j1 = s.index(CAT_END, i1)
cat_block = s[i1:j1]
s = s[:i1] + s[j1:]
sub("(0,q.jsx)(`datalist`,{id:`avant-people`,children:r?.people.map(e=>(0,q.jsx)(`option`,{value:e},e))}),(0,q.jsx)(`datalist`,{id:`avant-categories`",
    "avs&&(0,q.jsx)(AvShareFields,{draft:e,onChange:t}),(0,q.jsxs)(`details`,{className:`av-more`,children:[(0,q.jsx)(`summary`,{children:`Mais detalhes (responsável, envolvidos, categoria)`}),(0,q.jsxs)(`div`,{className:`form-grid`,children:[" + resp_block + cat_block + "]})]}),(0,q.jsx)(`datalist`,{id:`avant-people`,children:r?.people.map(e=>(0,q.jsx)(`option`,{value:e},e))}),(0,q.jsx)(`datalist`,{id:`avant-categories`")
sub("effort:e?.effort??``,", "effort:e?.effort??``,__assignee:``,__scope:`individual`,")
sub("let n=Dl(wl()),r=Oa(),i=_l(),[a,o]=(0,x.useState)(!1),s=()=>n.dirty?o(!0):t();",
    "let n=Dl(wl()),r=Oa(),i=_l(),avn=ir(),[a,o]=(0,x.useState)(!1),s=()=>n.dirty?o(!0):t();")
sub("onClick:async()=>{let e=await r(()=>Yi.post(`/api/tasks`,Tl(n.value)),`Tarefa criada.`);e&&(n.reset(wl()),t(),i(e.id))}",
    "onClick:async()=>{if(__avIsShared(n.value)){let e=await r(()=>__avCreateShared(n.value),n.value.__assignee?`Tarefa enviada.`:`Tarefa criada para a equipe.`);e&&(n.reset(wl()),t(),avn(`/tarefas-equipe`));return}let e=await r(()=>Yi.post(`/api/tasks`,Tl(n.value)),`Tarefa criada.`);e&&(n.reset(wl()),t(),i(e.id))}")
sub("children:(0,q.jsx)(El,{draft:n.value,onChange:n.setValue})}),(0,q.jsx)(pl,{open:a,title:`Descartar nova tarefa?`",
    "children:(0,q.jsx)(El,{draft:n.value,onChange:n.setValue,share:!0})}),(0,q.jsx)(pl,{open:a,title:`Descartar nova tarefa?`")

# ---- Detalhe da tarefa: menos informação de uma vez ----
sub("(0,q.jsx)(`dt`,{children:`Esforço`}),(0,q.jsx)(`dd`,{children:D.effort?Zc[D.effort]:(0,q.jsx)(rl,{c:`desconhecida`})}),", "")
sub("(0,q.jsxs)(`div`,{className:`section`,children:[(0,q.jsx)(`h3`,{children:`Por que esta prioridade`}),", "(0,q.jsxs)(AvSec,{title:`Por que esta prioridade`,children:[")
sub("(0,q.jsxs)(`div`,{className:`section`,children:[(0,q.jsxs)(`h3`,{children:[(0,q.jsx)(ps,{size:12}),` Dependências`]}),", "(0,q.jsxs)(AvSec,{title:`Dependências`,children:[")
sub("D.original_text&&(0,q.jsxs)(`div`,{className:`section`,children:[(0,q.jsx)(`h3`,{children:`Texto original`}),", "D.original_text&&(0,q.jsxs)(AvSec,{title:`Texto original`,children:[")

# ---- Lista: subtarefas junto da tarefa principal ----
sub("function bl({task:e,rank:t,why:n,showProject:r=!0,compact:i}){", "function bl({task:e,rank:t,why:n,showProject:r=!0,compact:i,child:avc}){")
sub("className:`task-row prio-${o?`none`:e.effective_priority}${o?` is-done`:``}${e.is_blocked?` is-blocked`:``}`", "className:`task-row prio-${o?`none`:e.effective_priority}${o?` is-done`:``}${e.is_blocked?` is-blocked`:``}${avc?` task-child`:``}`")
sub("m.map(e=>(0,q.jsx)(bl,{task:e,why:c.sort?void 0:", "__avNest(m).map(e=>(0,q.jsx)(bl,{task:e,child:e.__child,why:c.sort?void 0:")
# excluir várias
sub("function fd(){let[e,t]=Fi(),{meta:n}=Ea(),", "function fd(){let[e,t]=Fi(),{meta:n}=Ea(),[avB,setAvB]=(0,x.useState)(!1),")
sub("(0,q.jsxs)(`button`,{className:`btn primary`,onClick:()=>i(!0),children:[(0,q.jsx)(Gs,{size:16}),` Nova tarefa`]})]}),(0,q.jsxs)(`div`,{className:`filterbar`",
    "(0,q.jsxs)(`div`,{className:`btn-row`,children:[(0,q.jsx)(`button`,{className:`btn`,onClick:()=>setAvB(!0),children:`Selecionar e excluir`}),(0,q.jsxs)(`button`,{className:`btn primary`,onClick:()=>i(!0),children:[(0,q.jsx)(Gs,{size:16}),` Nova tarefa`]})]})]}),(0,q.jsxs)(`div`,{className:`filterbar`")
sub("(0,q.jsx)(Nl,{open:r,onClose:()=>i(!1)})]})}var pd=", "(0,q.jsx)(Nl,{open:r,onClose:()=>i(!1)}),(0,q.jsx)(AvBulk,{open:avB,onClose:()=>setAvB(!1)})]})}var pd=")

# ---- Aguardando terceiros: pedir para uma pessoa do sistema ----
sub("expected_at:``,follow_up_at:``,note:``};function Cd(){", "expected_at:``,follow_up_at:``,note:``,__assignee:``,__kind:`fazer`};function Cd(){")
sub("(0,q.jsx)(gl,{label:`Tarefa relacionada`,children:(0,q.jsxs)(`select`,{className:`select`,value:c.task_id,", "!c.id&&(0,q.jsx)(AvWaitAssign,{value:c,onChange:l}),(0,q.jsx)(gl,{label:`Tarefa relacionada`,children:(0,q.jsxs)(`select`,{className:`select`,value:c.task_id,")
sub("await i(()=>c.id?Yi.patch(`/api/waits/${c.id}`,e):Yi.post(`/api/waits`,e),c.id?`Pendência atualizada.`:`Pendência registrada.`)&&l(null)",
    "await i(async()=>{let r0=c.id?await Yi.patch(`/api/waits/${c.id}`,e):await Yi.post(`/api/waits`,e);if(!c.id&&c.__assignee)await __avWaitShared(c);return r0},c.id?`Pendência atualizada.`:c.__assignee?`Pendência registrada e enviada para a pessoa.`:`Pendência registrada.`)&&l(null)")

# ---- Menu da conta: gerar código de recuperação ----
sub("(0,q.jsxs)(`button`,{role:`menuitem`,onClick:()=>void e.logout().then(()=>location.reload()),children:[(0,q.jsx)(xs,{\"aria-hidden\":!0}),` Sair`]})",
    "(0,q.jsxs)(`button`,{role:`menuitem`,onClick:()=>(r(!1),window.dispatchEvent(new Event(`prumo:code`))),children:[(0,q.jsx)(ss,{\"aria-hidden\":!0}),` Código de recuperação`]}),(0,q.jsxs)(`button`,{role:`menuitem`,onClick:()=>void e.logout().then(()=>location.reload()),children:[(0,q.jsx)(xs,{\"aria-hidden\":!0}),` Sair`]})")
sub("(0,q.jsx)(`button`,{className:`fab`,onClick:()=>f(!0),\"aria-label\":`Nova tarefa`", "(0,q.jsx)(AvCodeModal,{}),(0,q.jsx)(`button`,{className:`fab`,onClick:()=>f(!0),\"aria-label\":`Nova tarefa`")

# ---- Projetos (antes "Frentes de trabalho"), cores por pessoa, remover contas excluídas do ranking ----
sub_all("Frentes de trabalho", "Projetos", 3)
sub("function zc(e){let t=0;for(let n of e)", "function zc(e){let avc=window.__avProjColors&&window.__avProjColors[e];if(avc)return avc;let t=0;for(let n of e)")
sub("return{...e,...JSON.parse(localStorage.getItem(Ca())??`{}`)}}catch{return e}}", "let avp={...e,...JSON.parse(localStorage.getItem(Ca())??`{}`)};window.__avProjColors=avp.projectColors||{};return avp}catch{return e}}")
sub("u(t=>{let n={...t,...e};try{", "u(t=>{let n={...t,...e};window.__avProjColors=n.projectColors||{};try{")
# Projetos: botão "Cores" e borda colorida no cartão
sub("(0,q.jsxs)(`button`,{className:`btn primary`,onClick:()=>a({...Bu}),children:[(0,q.jsx)(Gs,{size:16}),` Novo projeto`]})]}),(0,q.jsx)(ll,{error:t}),e?",
    "(0,q.jsxs)(`div`,{className:`btn-row`,children:[(0,q.jsx)(`button`,{className:`btn`,onClick:()=>avc(!0),children:`Cores dos projetos`}),(0,q.jsxs)(`button`,{className:`btn primary`,onClick:()=>a({...Bu}),children:[(0,q.jsx)(Gs,{size:16}),` Novo projeto`]})]})]}),(0,q.jsx)(ll,{error:t}),(0,q.jsx)(AvColorsModal,{open:avo,onClose:()=>avc(!1)}),e?")
sub("function Hu(){let{data:e,error:t}=Da(`/api/projects`),n=ir(),r=Oa(),[i,a]=(0,x.useState)(null);", "function Hu(){let{data:e,error:t}=Da(`/api/projects`),n=ir(),r=Oa(),[i,a]=(0,x.useState)(null),[avo,avc]=(0,x.useState)(!1);")
sub("(0,q.jsxs)(`button`,{className:`panel kpi`,style:{textAlign:`left`,padding:18},onClick:()=>n(`/projetos/${e.id}`)", "(0,q.jsxs)(`button`,{className:`panel kpi`,style:{textAlign:`left`,padding:18,borderLeft:`6px solid ${zc(e.name)}`},onClick:()=>n(`/projetos/${e.id}`)")
# Ranking: administrador remove contas excluídas
sub("e.name]})}),ed.map(t=>(0,q.jsx)(`td`,{className:`mono`", "e.name,Wi.auth?.me?.role===`admin`&&/ \\(conta removida\\)$/.test(e.name)&&(0,q.jsx)(`button`,{className:`av-rm`,title:`Remover do histórico da equipe`,onClick:t=>{t.stopPropagation(),confirm(`Remover ${e.name.replace(` (conta removida)`,``)} do histórico e do ranking? Os cartões dela serão apagados do quadro da equipe.`)&&Wi.team.removePerson(e.id).catch(t=>alert(t.message))},children:`Remover`})]})}),ed.map(t=>(0,q.jsx)(`td`,{className:`mono`")

# ---- Tela inicial enxuta: só o dia, números, horas e quem está online ----
cut("(0,q.jsxs)(`div`,{className:`dh-chips`", "]}),(0,q.jsx)(Fu,{done:u.doneToday.length,total:m})", "")
cut("p.length>0&&(0,q.jsxs)(q.Fragment,{children:[(0,q.jsxs)(`h3`,{className:`day-sec suggest`", "u.doneToday.length>0&&(0,q.jsxs)(q.Fragment,{children:[(0,q.jsx)(`h3`,{className:`day-sec done`", "")
sub("(0,q.jsxs)(`div`,{className:`day-grid`,children:[(0,q.jsxs)(`section`,{className:`day-list-card`", "(0,q.jsx)(AvOnline,{}),(0,q.jsxs)(`div`,{className:`day-grid`,children:[(0,q.jsxs)(`div`,{className:`av-col`,children:[(0,q.jsxs)(`section`,{className:`day-list-card`")
sub("(0,q.jsx)(cl,{rows:5})]}),(0,q.jsxs)(`div`,{className:`day-side`,children:[", "(0,q.jsx)(cl,{rows:5})]}),(0,q.jsx)(AvHomeDash,{done:u.doneToday.length,total:m,late:u.late.length,doing:u.doing.length,waiting:u.waiting})]}),(0,q.jsxs)(`div`,{className:`day-side`,children:[")
cut("(0,q.jsxs)(`div`,{className:`day-bottom`,", "]})}function zu({value:e,onChange:t})", "")
# foto de perfil: botão da conta, menu e janela
sub("children:l.trim().charAt(0).toUpperCase()});return e?", "children:(0,q.jsx)(AvPhoto,{id:window.__avUid,name:l,fallback:l.trim().charAt(0).toUpperCase()})});return e?")
sub("(0,q.jsxs)(`button`,{role:`menuitem`,onClick:()=>(r(!1),window.dispatchEvent(new Event(`prumo:code`)))", "(0,q.jsxs)(`button`,{role:`menuitem`,onClick:()=>(r(!1),window.dispatchEvent(new Event(`prumo:avatar`))),children:[(0,q.jsx)(ac,{\"aria-hidden\":!0}),` Foto de perfil`]}),(0,q.jsxs)(`button`,{role:`menuitem`,onClick:()=>(r(!1),window.dispatchEvent(new Event(`prumo:code`)))")
sub("(0,q.jsx)(AvCodeModal,{}),", "(0,q.jsx)(AvCodeModal,{}),(0,q.jsx)(AvAvatarModal,{}),")

# ---- Menu, rotas e painel ----
sub("{to:`/equipe`,label:`Atividades da equipe`,icon:Nc,section:`Equipe`},", "{to:`/equipe`,label:`Atividades da equipe`,icon:Nc,section:`Equipe`},{to:`/tarefas-equipe`,label:`Tarefas da equipe`,icon:hs},{to:`/calendario-equipe`,label:`Calendário da equipe`,icon:no},")
sub("{path:`equipe`,element:(0,q.jsx)(yd,{})},", "{path:`equipe`,element:(0,q.jsx)(yd,{})},{path:`tarefas-equipe`,element:(0,q.jsx)(AvTeamTasks,{})},{path:`calendario-equipe`,element:(0,q.jsx)(AvCalendar,{})},")
sub("return(0,q.jsxs)(`div`,{className:`myday`,children:[(0,q.jsxs)(`section`,{className:`day-hero`", "return(0,q.jsxs)(`div`,{className:`myday`,children:[(0,q.jsx)(AvMine,{}),(0,q.jsxs)(`section`,{className:`day-hero`")

# ---- Arquivos e Documentos: busca, ver, vincular; upload nunca cria tarefa ----
sub("function Eu(){let{data:e,error:t}=Da(`/api/documents`),{data:n}=Da(`/api/tasks?include_closed=1`),",
    "function Eu(){let{data:avAll,error:t}=Da(`/api/documents`),[avq,setAvq]=(0,x.useState)(``),e=avAll&&avAll.filter(d=>!avq.trim()||__avNorm(d.filename).includes(__avNorm(avq))),{data:n}=Da(`/api/tasks?include_closed=1`),")
sub("`${t.name}: importado e texto extraído.`", "`${t.name}: importado. Clique em “Ver” para abrir e ligar ao projeto ou tarefa.`")
sub("(0,q.jsx)(ll,{error:t}),(0,q.jsx)(sl,{title:`Arquivos`,", "(0,q.jsx)(ll,{error:t}),(0,q.jsx)(`input`,{className:`input`,style:{maxWidth:420,marginBottom:12},placeholder:`Pesquisar arquivo pelo nome…`,\"aria-label\":`Pesquisar arquivo`,value:avq,onChange:e=>setAvq(e.target.value)}),(0,q.jsx)(sl,{title:`Arquivos`,")
cut("e.parse_status===`ok`&&(0,q.jsxs)(`button`,{className:`btn sm`,title:`Enviar o texto para a Captura Inteligente`",
    "(0,q.jsx)(`a`,{className:`btn sm ghost`,href:`/api/documents/${e.id}/file`",
    "(0,q.jsx)(`button`,{className:`btn sm`,onClick:()=>d({doc:String(e.id)}),children:`Ver`}),")
cut("(0,q.jsx)(`td`,{children:(0,q.jsxs)(`select`,{className:`select`,style:{height:30,minWidth:150,maxWidth:220},value:e.task_id??``,",
    "(0,q.jsx)(`td`,{className:`small`,children:pa(e.created_at)})",
    "(0,q.jsx)(`td`,{children:(0,q.jsx)(AvPick,{items:(n??[]).map(t=>({id:t.id,label:t.title})),value:e.task_id,placeholder:`Buscar tarefa…`,ariaLabel:`Tarefa do documento`,onPick:id=>c(()=>Yi.patch(`/api/documents/${e.id}`,{task_id:id?Number(id):null}),`Vínculo atualizado.`),onCreate:title=>c(async()=>{let t=await Yi.post(`/api/tasks`,{title,project_id:e.project_id||null});await Yi.patch(`/api/documents/${e.id}`,{task_id:t.id});return t},`Tarefa criada e vinculada.`)})}),")
sub("v.data&&(0,q.jsxs)(q.Fragment,{children:[(0,q.jsxs)(`p`,{className:`small muted`,style:{marginBottom:10},children:[v.data.document.mime,",
    "v.data&&(0,q.jsxs)(q.Fragment,{children:[(0,q.jsx)(AvDocLink,{doc:v.data.document,projects:r?.projects??[],tasks:n??[],onSaved:()=>{v.reload();o()}}),(0,q.jsxs)(`p`,{className:`small muted`,style:{marginBottom:10},children:[v.data.document.mime,")
# Captura Inteligente: enviar arquivo só importa; mostra "Ver documento"
sub("i.parse_status===`ok`?(a.push(`${i.filename}: texto extraído e original preservado.`),await w(s,i.id,i.filename)):a.push(`${i.filename}: ${i.parse_error}`)",
    "i.parse_status===`ok`?a.push({text:`${i.filename}: importado e original preservado. Nenhuma tarefa foi criada.`,id:i.id}):a.push(`${i.filename}: ${i.parse_error}`)")
sub("_.map((e,t)=>(0,q.jsx)(`li`,{children:e},t))", "_.map((e,t)=>(0,q.jsx)(`li`,{children:typeof e==`string`?e:[e.text,` `,(0,q.jsx)(`a`,{href:`/arquivos?doc=${e.id}`,children:`Ver documento e ligar ao projeto ou tarefa`})]},t))")

# estilos novos
sub("</style>", AVX_CSS + "\n</style>") if s.count("</style>") == 1 else None


# ---- Novo nome (Zênite) e novo logotipo (azul, branco e amarelo) ----
import re as _re, urllib.parse as _up
LOGO_SVG = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs>'
            '<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f86ff"/><stop offset="0.55" stop-color="#2447d6"/><stop offset="1" stop-color="#14267f"/></linearGradient>'
            '<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#ffd34d"/></linearGradient>'
            '<radialGradient id="h" cx="0.3" cy="0.2" r="0.8"><stop offset="0" stop-color="#ffffff" stop-opacity="0.35"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient></defs>'
            '<rect x="2" y="2" width="60" height="60" rx="18" fill="url(#g)"/><rect x="2" y="2" width="60" height="60" rx="18" fill="url(#h)"/>'
            '<ellipse cx="32" cy="33" rx="25" ry="9.5" transform="rotate(-28 32 33)" fill="none" stroke="#ffffff" stroke-opacity="0.5" stroke-width="2"/>'
            '<path d="M32 9C33.6 23.5 40.5 30.4 55 32C40.5 33.6 33.6 40.5 32 55C30.4 40.5 23.5 33.6 9 32C23.5 30.4 30.4 23.5 32 9Z" fill="url(#s)"/>'
            '<circle cx="50.5" cy="20.5" r="3.2" fill="#ffd34d"/></svg>')
NEW_FU = ("function fu({size:e=44}){return(0,q.jsxs)(`svg`,{viewBox:`0 0 64 64`,width:e,height:e,\"aria-hidden\":!0,className:`brand-mark`,children:[(0,q.jsxs)(`defs`,{children:["
          "(0,q.jsxs)(`linearGradient`,{id:`avant-g`,x1:`0`,y1:`0`,x2:`1`,y2:`1`,children:[(0,q.jsx)(`stop`,{offset:`0`,stopColor:`#4f86ff`}),(0,q.jsx)(`stop`,{offset:`.55`,stopColor:`#2447d6`}),(0,q.jsx)(`stop`,{offset:`1`,stopColor:`#14267f`})]}),"
          "(0,q.jsxs)(`linearGradient`,{id:`avant-s`,x1:`0`,y1:`0`,x2:`0`,y2:`1`,children:[(0,q.jsx)(`stop`,{offset:`0`,stopColor:`#fff`}),(0,q.jsx)(`stop`,{offset:`1`,stopColor:`#ffd34d`})]}),"
          "(0,q.jsxs)(`radialGradient`,{id:`avant-h`,cx:`.3`,cy:`.2`,r:`.8`,children:[(0,q.jsx)(`stop`,{offset:`0`,stopColor:`#fff`,stopOpacity:`.35`}),(0,q.jsx)(`stop`,{offset:`1`,stopColor:`#fff`,stopOpacity:`0`})]})]}),"
          "(0,q.jsx)(`rect`,{x:`2`,y:`2`,width:`60`,height:`60`,rx:`18`,fill:`url(#avant-g)`}),(0,q.jsx)(`rect`,{x:`2`,y:`2`,width:`60`,height:`60`,rx:`18`,fill:`url(#avant-h)`}),"
          "(0,q.jsx)(`ellipse`,{cx:`32`,cy:`33`,rx:`25`,ry:`9.5`,transform:`rotate(-28 32 33)`,fill:`none`,stroke:`#fff`,strokeOpacity:`.5`,strokeWidth:`2`}),"
          "(0,q.jsx)(`path`,{d:`M32 9C33.6 23.5 40.5 30.4 55 32C40.5 33.6 33.6 40.5 32 55C30.4 40.5 23.5 33.6 9 32C23.5 30.4 30.4 23.5 32 9Z`,fill:`url(#avant-s)`}),"
          "(0,q.jsx)(`circle`,{cx:`50.5`,cy:`20.5`,r:`3.2`,fill:`#ffd34d`})]})}")
_i = s.index("function fu({size:e=44}){"); _j = s.index("function ", _i + 10)
s = s[:_i] + NEW_FU + s[_j:]
_m = _re.search(r'<link rel="icon" type="image/svg\+xml" href="data:image/svg\+xml,[^"]*">', s)
s = s[:_m.start()] + '<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,' + _up.quote(LOGO_SVG, safe="") + '">' + s[_m.end():]
s = s.replace("AVANT", "Zênite")
s = s.replace("className:`rb-word`,children:`avant`", "className:`rb-word`,children:`zênite`")
s = s.replace("Central Inteligente de Gestão", "Central de Acompanhamento do Trabalho")
s = s.replace("<title>Zênite</title>", "<title>Zênite · Central de Trabalho</title>")

# título da aba
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(s, encoding="utf8")
print(f"OK: {OUT} ({len(s):,} caracteres)")
