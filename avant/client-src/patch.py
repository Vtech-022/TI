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
  return new Promise(done=>Yz.render((0,q.jsx)(Nz,{
    firstAccount:st.firstAccount,needCode:st.needCode,
    subtitle:"Seu sistema de rotina e acompanhamento do trabalho. Entre com seu nome e senha ou crie sua conta.",
    login:async(name,pw)=>{const j=await __avJson("/auth/login",{method:"POST",body:{name,password:pw}});done(j.user)},
    register:async(name,pw,code)=>{const j=await __avJson("/auth/register",{method:"POST",body:{name,password:pw,code}});done(j.user)}
  })));
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

# título da aba
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(s, encoding="utf8")
print(f"OK: {OUT} ({len(s):,} caracteres)")
