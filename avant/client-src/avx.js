/* ===== AVANT Equipe: busca de tarefa, tarefas da equipe, calendário, recuperar senha ===== */
const __avNorm=s=>String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase();
const __avStatus={pendente:"Pendente",em_andamento:"Em andamento",concluida:"Concluída"};
const __avImpactHelp="O quanto isto muda o resultado. Alto: trava ou entrega algo importante. Médio: melhora uma entrega ou a rotina. Baixo: pode esperar sem prejuízo.";
const __avPalette=["#2f64c4","#c49a2c","#18794e","#b42318","#6941c6","#0e7490","#b25e09","#be185d","#4d7c0f","#475569"];
const __avColor=id=>{let h=0;for(const c of String(id||"?"))h=(h*31+c.charCodeAt(0))>>>0;return __avPalette[h%__avPalette.length]};
const __avInit=n=>String(n||"?").trim().split(/\s+/).slice(0,2).map(p=>p[0]).join("").toUpperCase();
const __avToday=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo"}).format(new Date());

/* ---- lista de pessoas com conta (para atribuir tarefas) ---- */
var __avDirCache=null;
function useAvDir(){
  const[l,setL]=x.useState(__avDirCache||[]);
  x.useEffect(()=>{let ok=!0;if(!__avDirCache)__avJson("/directory").then(d=>{__avDirCache=d;ok&&setL(d)}).catch(()=>{});return()=>{ok=!1}},[]);
  return l;
}

/* ---- tarefas da equipe: leitura com ETag e atualização a cada poucos segundos ---- */
function useAvTasks(){
  const[st,setSt]=x.useState({tasks:null,me:null,error:null});
  const tag=x.useRef(""),alive=x.useRef(!0),kick=x.useRef(null);
  const load=x.useCallback(async force=>{
    try{
      const res=await __avFetch("/shared-tasks",{headers:tag.current&&!force?{"if-none-match":tag.current}:{}});
      if(res.status===304)return;
      const j=await res.json();
      if(!res.ok)throw new AvErr(j?.message||"Não foi possível carregar as tarefas da equipe.",res.status);
      tag.current=j.tag;alive.current&&setSt({tasks:j.tasks,me:j.me,error:null});
    }catch(e){alive.current&&setSt(s=>({...s,error:e}))}
  },[]);
  kick.current=load;
  x.useEffect(()=>{
    alive.current=!0;load(!0);
    const t=setInterval(()=>{if(document.visibilityState==="visible")load(!1)},4000);
    const v=()=>document.visibilityState==="visible"&&load(!1);
    document.addEventListener("visibilitychange",v);
    return()=>{alive.current=!1;clearInterval(t);document.removeEventListener("visibilitychange",v)};
  },[load]);
  return{...st,reload:()=>load(!0)};
}

/* ---- campo de busca com lista só quando se digita (substitui listas enormes) ---- */
function AvPick({items,value,onPick,onCreate,placeholder,ariaLabel}){
  const[t,setT]=x.useState(""),[open,setOpen]=x.useState(!1),[act,setAct]=x.useState(0),ref=x.useRef(null);
  const cur=value!==null&&value!==void 0&&value!==""?items.find(i=>String(i.id)===String(value)):null;
  const term=__avNorm(t).trim();
  const res=term?items.filter(i=>__avNorm(i.label).includes(term)).slice(0,8):[];
  const canCreate=!!onCreate&&t.trim().length>=2&&!res.some(i=>__avNorm(i.label)===term);
  const total=res.length+(canCreate?1:0);
  x.useEffect(()=>{
    if(!open)return;
    const f=e=>{if(!ref.current?.contains(e.target))setOpen(!1)};
    document.addEventListener("mousedown",f);return()=>document.removeEventListener("mousedown",f);
  },[open]);
  const pick=i=>{setT("");setOpen(!1);onPick(i?i.id:null)};
  const create=()=>{const n=t.trim();setT("");setOpen(!1);onCreate(n)};
  if(cur)return(0,q.jsxs)("span",{className:"avp-chip",children:[(0,q.jsx)("span",{className:"avp-chip-t",title:cur.label,children:cur.label}),(0,q.jsx)("button",{type:"button",className:"avp-x","aria-label":"Remover vínculo",onClick:()=>pick(null),children:"×"})]});
  return(0,q.jsxs)("div",{className:"avp",ref:ref,children:[
    (0,q.jsx)("input",{className:"input avp-in",value:t,placeholder:placeholder||"Buscar…","aria-label":ariaLabel||"Buscar",
      onChange:e=>{setT(e.target.value);setOpen(!0);setAct(0)},onFocus:()=>t&&setOpen(!0),
      onKeyDown:e=>{
        if(e.key==="ArrowDown"){e.preventDefault();setAct(a=>Math.min(a+1,Math.max(total-1,0)))}
        else if(e.key==="ArrowUp"){e.preventDefault();setAct(a=>Math.max(a-1,0))}
        else if(e.key==="Enter"){e.preventDefault();if(act<res.length&&res[act])pick(res[act]);else if(canCreate)create()}
        else if(e.key==="Escape"){setOpen(!1)}
      }}),
    open&&t.trim()&&(0,Vi.createPortal)((0,q.jsxs)("ul",{className:"avp-list",role:"listbox",style:(()=>{const r=ref.current?.getBoundingClientRect();return r?{position:"fixed",left:r.left,top:r.bottom+4,width:Math.max(r.width,260),right:"auto"}:void 0})(),children:[
      res.map((i,n)=>(0,q.jsx)("li",{role:"option","aria-selected":n===act,className:n===act?"on":"",onMouseDown:e=>{e.preventDefault();pick(i)},onMouseEnter:()=>setAct(n),children:i.label},i.id)),
      res.length===0&&!canCreate&&(0,q.jsx)("li",{className:"avp-empty",children:"Nada encontrado. Digite ao menos 2 letras para criar."}),
      canCreate&&(0,q.jsxs)("li",{role:"option","aria-selected":act===res.length,className:"avp-new"+(act===res.length?" on":""),onMouseDown:e=>{e.preventDefault();create()},onMouseEnter:()=>setAct(res.length),children:["+ Criar tarefa “",t.trim(),"”"]})
    ]}),document.body)
  ]});
}

/* ---- campos extras da "Nova tarefa": quem faz e quem vê ---- */
function AvShareFields({draft,onChange}){
  const dir=useAvDir();
  const me=window.__avUid;
  return(0,q.jsxs)(q.Fragment,{children:[
    (0,q.jsx)(gl,{label:"Atribuir a",hint:"Escolha alguém que já tem login. A tarefa aparece na lista dessa pessoa.",children:(0,q.jsxs)("select",{className:"select",value:draft.__assignee,onChange:e=>onChange({...draft,__assignee:e.target.value}),children:[
      (0,q.jsx)("option",{value:"",children:"Eu mesmo(a)"}),
      dir.filter(d=>d.id!==me).map(d=>(0,q.jsx)("option",{value:d.id,children:d.name},d.id))]})}),
    (0,q.jsx)(gl,{label:"Quem pode ver",hint:draft.__scope==="equipe"?"Toda a equipe vê esta tarefa no calendário e na lista da equipe.":(draft.__assignee?"Só você e quem recebeu veem.":"Só você vê (tarefa individual)."),children:(0,q.jsxs)("select",{className:"select",value:draft.__scope,onChange:e=>onChange({...draft,__scope:e.target.value}),children:[
      (0,q.jsx)("option",{value:"individual",children:draft.__assignee?"Só eu e quem recebe":"Só eu (individual)"}),
      (0,q.jsx)("option",{value:"equipe",children:"Toda a equipe"})]})})
  ]});
}
/* A tarefa só vai para o servidor da equipe quando tem outro responsável ou é da equipe; senão continua individual. */
const __avIsShared=d=>!!d&&(d.__scope==="equipe"||!!d.__assignee);
async function __avCreateShared(d){
  const note=[d.next_action&&("Próxima ação: "+d.next_action.trim())].filter(Boolean).join("\n");
  return __avJson("/shared-tasks",{method:"POST",body:{
    title:d.title.trim(),description:(d.description||"").trim(),note,
    assignee:d.__assignee||null,visibility:d.__scope==="equipe"?"equipe":"individual",
    due_date:d.due_date||null,due_time:d.due_date&&d.due_time?d.due_time:null,impact:d.impact||null}});
}

/* ---- Pessoa do sistema na tela "Aguardando terceiros" ---- */
function AvWaitAssign({value,onChange}){
  const dir=useAvDir();
  const me=window.__avUid;
  return(0,q.jsxs)(q.Fragment,{children:[
    (0,q.jsx)(gl,{label:"Pedir para uma pessoa do sistema (opcional)",hint:"A pessoa vê no painel dela e pode marcar como feita.",children:(0,q.jsxs)("select",{className:"select",value:value.__assignee||"",onChange:e=>{const p=dir.find(d=>d.id===e.target.value);onChange({...value,__assignee:e.target.value,party:value.party||(p?p.name:"")})},children:[
      (0,q.jsx)("option",{value:"",children:"Ninguém (só acompanhar)"}),
      dir.filter(d=>d.id!==me).map(d=>(0,q.jsx)("option",{value:d.id,children:d.name},d.id))]})}),
    value.__assignee&&(0,q.jsx)(gl,{label:"O que a pessoa deve fazer",children:(0,q.jsxs)("select",{className:"select",value:value.__kind||"fazer",onChange:e=>onChange({...value,__kind:e.target.value}),children:[
      (0,q.jsx)("option",{value:"fazer",children:"Fazer este trabalho"}),
      (0,q.jsx)("option",{value:"validar",children:"Validar / aprovar"})]})})
  ]});
}
async function __avWaitShared(w){
  if(!w.__assignee)return null;
  const kind=w.__kind==="validar"?"validar":"fazer";
  return __avJson("/shared-tasks",{method:"POST",body:{
    title:(kind==="validar"?"Validar: ":"")+w.description.trim(),description:"Pedido registrado em Aguardando Terceiros.",
    assignee:w.__assignee,visibility:"individual",kind,origin:"espera",
    due_date:w.expected_at||w.follow_up_at||null}});
}

/* ---- Subtarefas junto da tarefa principal (lista) ---- */
function __avNest(list){
  if(!list)return list;
  const ids=new Set(list.map(t=>t.id));
  const kids=new Map();
  for(const t of list)if(t.parent_id&&ids.has(t.parent_id))kids.set(t.parent_id,[...(kids.get(t.parent_id)||[]),t]);
  const out=[];
  for(const t of list){
    if(t.parent_id&&ids.has(t.parent_id))continue;
    out.push(t);
    for(const c of kids.get(t.id)||[])out.push({...c,__child:!0});
  }
  return out;
}

/* ---- Tarefa da equipe: cartão ---- */
function AvTaskCard({t,me,isAdmin,dir,onChanged,onEdit}){
  const[open,setOpen]=x.useState(!1),[busy,setBusy]=x.useState(!1);
  const{toast,fail}=Ea();
  const mine=t.owner===me||isAdmin,toMe=t.assignee===me;
  const can=mine||toMe;
  const today=__avToday();
  const overdue=t.due_date&&t.due_date<today&&t.status!=="concluida";
  const subs=t.subtasks||[],done=subs.filter(s=>s.done).length;
  const patch=async body=>{setBusy(!0);try{await __avJson("/shared-tasks/"+t.id,{method:"PATCH",body});await onChanged()}catch(e){fail(e)}finally{setBusy(!1)}};
  const del=async()=>{if(!confirm("Excluir a tarefa “"+t.title+"”?"))return;setBusy(!0);try{await __avJson("/shared-tasks/"+t.id,{method:"DELETE"});toast("Tarefa excluída.");await onChanged()}catch(e){fail(e)}finally{setBusy(!1)}};
  const who=t.assignee_name||"Sem responsável";
  return(0,q.jsxs)("li",{className:"avt-card"+(t.status==="concluida"?" is-done":""),children:[
    (0,q.jsxs)("div",{className:"avt-main",children:[
      (0,q.jsx)("span",{className:"avt-av",style:{background:__avColor(t.assignee||t.owner)},title:who,"aria-hidden":!0,children:__avInit(t.assignee_name||t.owner_name)}),
      (0,q.jsxs)("div",{className:"avt-body",children:[
        (0,q.jsx)("div",{className:"avt-title",children:t.title}),
        (0,q.jsxs)("div",{className:"avt-meta",children:[
          (0,q.jsx)("span",{children:toMe?"Para você":"Responsável: "+who}),
          t.owner!==me&&(0,q.jsx)("span",{children:"De: "+t.owner_name}),
          t.kind==="validar"&&(0,q.jsx)("span",{className:"badge neutral",children:"Validar"}),
          t.visibility==="equipe"?(0,q.jsx)("span",{className:"badge neutral",children:"Equipe"}):(0,q.jsx)("span",{className:"badge neutral",children:"Individual"}),
          t.due_date&&(0,q.jsx)("span",{className:"badge "+(overdue?"overdue":"neutral"),children:(overdue?"Atrasada · ":"Prazo ")+na(t.due_date)+(t.due_time?" "+t.due_time:"")}),
          t.impact&&(0,q.jsx)("span",{className:"badge neutral",children:"Impacto "+({alto:"alto",medio:"médio",baixo:"baixo"}[t.impact]||t.impact)}),
          subs.length>0&&(0,q.jsx)("button",{type:"button",className:"avt-link",onClick:()=>setOpen(o=>!o),children:done+"/"+subs.length+" subtarefas "+(open?"▲":"▼")})
        ]}),
        t.description&&(0,q.jsx)("div",{className:"small muted avt-desc",children:t.description}),
        t.note&&(0,q.jsx)("div",{className:"small muted avt-desc",children:t.note}),
        t.status==="concluida"&&t.done_by&&(0,q.jsx)("div",{className:"small muted",children:"Concluída por "+t.done_by}),
        open&&subs.length>0&&(0,q.jsx)("ul",{className:"avt-subs",children:subs.map(s=>(0,q.jsx)("li",{children:(0,q.jsxs)("label",{children:[(0,q.jsx)("input",{type:"checkbox",checked:!!s.done,disabled:busy||!can,onChange:e=>patch({subtasks:subs.map(z=>z.id===s.id?{...z,done:e.target.checked}:z)})}),(0,q.jsx)("span",{style:{textDecoration:s.done?"line-through":"none"},children:s.title})]})},s.id))})
      ]}),
      (0,q.jsxs)("div",{className:"avt-actions",children:[
        can&&(0,q.jsx)("select",{className:"select avt-st",value:t.status,disabled:busy,"aria-label":"Situação",onChange:e=>patch({status:e.target.value}),children:Object.entries(__avStatus).map(([k,v])=>(0,q.jsx)("option",{value:k,children:v},k))}),
        mine&&(0,q.jsx)("button",{className:"btn sm ghost",onClick:()=>onEdit(t),children:"Editar"}),
        mine&&(0,q.jsx)("button",{className:"btn sm ghost",onClick:del,disabled:busy,children:"Excluir"})
      ]})
    ]})
  ]});
}

/* ---- Criar / editar tarefa da equipe ---- */
function AvTaskModal({open,task,onClose,onSaved,defaults}){
  const dir=useAvDir(),{toast,fail}=Ea();
  const blank={title:"",description:"",assignee:"",visibility:"equipe",kind:"fazer",due_date:"",due_time:"",impact:"",subtasks:[]};
  const[d,setD]=x.useState(blank),[sub,setSub]=x.useState(""),[busy,setBusy]=x.useState(!1);
  x.useEffect(()=>{if(open){setD(task?{title:task.title,description:task.description||"",assignee:task.assignee||"",visibility:task.visibility,kind:task.kind,due_date:task.due_date||"",due_time:task.due_time||"",impact:task.impact||"",subtasks:(task.subtasks||[]).map(s=>({...s}))}:{...blank,...(defaults||{})});setSub("")}},[open,task,defaults]);
  const set=k=>e=>setD({...d,[k]:e.target.value});
  const addSub=()=>{const t=sub.trim();if(!t)return;setD({...d,subtasks:[...d.subtasks,{id:"s"+Date.now().toString(36)+d.subtasks.length,title:t,done:!1}]});setSub("")};
  const save=async()=>{
    setBusy(!0);
    try{
      const body={...d,assignee:d.assignee||null,due_date:d.due_date||null,due_time:d.due_date&&d.due_time?d.due_time:null,impact:d.impact||null};
      if(task)await __avJson("/shared-tasks/"+task.id,{method:"PATCH",body});else await __avJson("/shared-tasks",{method:"POST",body});
      toast(task?"Tarefa atualizada.":"Tarefa criada.");onSaved();onClose();
    }catch(e){fail(e)}finally{setBusy(!1)}
  };
  return(0,q.jsx)(dl,{open,title:task?"Editar tarefa da equipe":"Nova tarefa da equipe",onClose,footer:(0,q.jsxs)(q.Fragment,{children:[
    (0,q.jsx)("button",{className:"btn",onClick:onClose,children:"Cancelar"}),
    (0,q.jsx)("button",{className:"btn primary",disabled:busy||d.title.trim().length<2,onClick:save,children:task?"Salvar":"Criar tarefa"})]}),
    children:(0,q.jsxs)("div",{className:"form-grid",children:[
      (0,q.jsx)(gl,{label:"Título",full:!0,children:(0,q.jsx)("input",{className:"input",value:d.title,onChange:set("title"),"data-autofocus":!0,maxLength:200})}),
      (0,q.jsx)(gl,{label:"Atribuir a",children:(0,q.jsxs)("select",{className:"select",value:d.assignee,onChange:set("assignee"),children:[(0,q.jsx)("option",{value:"",children:"Ninguém ainda"}),dir.map(p=>(0,q.jsx)("option",{value:p.id,children:p.name},p.id))]})}),
      (0,q.jsx)(gl,{label:"Quem pode ver",children:(0,q.jsxs)("select",{className:"select",value:d.visibility,onChange:set("visibility"),children:[(0,q.jsx)("option",{value:"equipe",children:"Toda a equipe"}),(0,q.jsx)("option",{value:"individual",children:"Só eu e quem recebe"})]})}),
      (0,q.jsx)(gl,{label:"A pessoa deve",children:(0,q.jsxs)("select",{className:"select",value:d.kind,onChange:set("kind"),children:[(0,q.jsx)("option",{value:"fazer",children:"Fazer"}),(0,q.jsx)("option",{value:"validar",children:"Validar / aprovar"})]})}),
      (0,q.jsx)(gl,{label:"Impacto",hint:__avImpactHelp,children:(0,q.jsxs)("select",{className:"select",value:d.impact,onChange:set("impact"),children:[(0,q.jsx)("option",{value:"",children:"Não informado"}),(0,q.jsx)("option",{value:"alto",children:"Alto"}),(0,q.jsx)("option",{value:"medio",children:"Médio"}),(0,q.jsx)("option",{value:"baixo",children:"Baixo"})]})}),
      (0,q.jsx)(gl,{label:"Prazo",children:(0,q.jsx)("input",{className:"input",type:"date",value:d.due_date,onChange:set("due_date")})}),
      (0,q.jsx)(gl,{label:"Horário (opcional)",children:(0,q.jsx)("input",{className:"input",type:"time",value:d.due_time,onChange:set("due_time"),disabled:!d.due_date})}),
      (0,q.jsx)(gl,{label:"Descrição (opcional)",full:!0,children:(0,q.jsx)("textarea",{className:"textarea",rows:2,value:d.description,onChange:set("description"),maxLength:2000})}),
      (0,q.jsxs)("div",{className:"field full",children:[(0,q.jsx)("span",{children:"Subtarefas"}),
        d.subtasks.length>0&&(0,q.jsx)("ul",{className:"avt-subs edit",children:d.subtasks.map(s=>(0,q.jsxs)("li",{children:[(0,q.jsx)("span",{children:s.title}),(0,q.jsx)("button",{type:"button",className:"avp-x","aria-label":"Remover subtarefa",onClick:()=>setD({...d,subtasks:d.subtasks.filter(z=>z.id!==s.id)}),children:"×"})]},s.id))}),
        (0,q.jsxs)("div",{className:"btn-row",children:[(0,q.jsx)("input",{className:"input",style:{flex:1},placeholder:"Nova subtarefa",value:sub,onChange:e=>setSub(e.target.value),onKeyDown:e=>{if(e.key==="Enter"){e.preventDefault();addSub()}},"aria-label":"Nova subtarefa"}),(0,q.jsx)("button",{type:"button",className:"btn sm",onClick:addSub,children:"Adicionar"})]})]})
    ]})});
}

/* ---- Página: Tarefas da equipe ---- */
function AvTeamTasks(){
  const{tasks,me,error,reload}=useAvTasks();
  const dir=useAvDir();
  const[tab,setTab]=x.useState("paramim"),[search,setSearch]=x.useState(""),[modal,setModal]=x.useState(null);
  const role=Wi.auth?.me?.role,isAdmin=role==="admin";
  const term=__avNorm(search).trim();
  const filtered=(tasks||[]).filter(t=>{
    if(term&&!__avNorm([t.title,t.description,t.assignee_name,t.owner_name].join(" ")).includes(term))return!1;
    const open=t.status!=="concluida";
    if(tab==="paramim")return open&&t.assignee===me;
    if(tab==="minhas")return open&&t.owner===me;
    if(tab==="equipe")return open;
    return!open;
  });
  const count=k=>(tasks||[]).filter(t=>{const o=t.status!=="concluida";return k==="paramim"?o&&t.assignee===me:k==="minhas"?o&&t.owner===me:k==="equipe"?o:!o}).length;
  const tabs=[["paramim","Para mim"],["minhas","Criei"],["equipe","Todas abertas"],["feitas","Concluídas"]];
  return(0,q.jsxs)(q.Fragment,{children:[
    (0,q.jsxs)("div",{className:"page-head",children:[(0,q.jsxs)("div",{children:[(0,q.jsx)("div",{className:"eyebrow",children:"Equipe"}),(0,q.jsx)("h1",{children:"Tarefas da equipe"}),(0,q.jsx)("p",{children:"Tarefas que você passa para alguém com login, ou que a equipe toda enxerga. Quem recebe vê na própria lista e marca como feita."})]}),
      (0,q.jsx)("button",{className:"btn primary",onClick:()=>setModal({}),children:"+ Nova tarefa da equipe"})]}),
    (0,q.jsx)(ll,{error}),
    (0,q.jsxs)("div",{className:"toolbar",children:[
      (0,q.jsx)("div",{className:"seg",role:"group","aria-label":"Filtro",children:tabs.map(([k,l])=>(0,q.jsxs)("button",{"aria-pressed":tab===k,onClick:()=>setTab(k),children:[l," ",(0,q.jsx)("span",{className:"muted",children:count(k)})]},k))}),
      (0,q.jsx)("input",{className:"input grow",placeholder:"Buscar por tarefa ou pessoa","aria-label":"Buscar tarefas da equipe",value:search,onChange:e=>setSearch(e.target.value)})]}),
    !tasks?(0,q.jsx)(cl,{rows:4}):filtered.length===0?(0,q.jsx)(ol,{title:tab==="paramim"?"Nada atribuído a você":"Nenhuma tarefa aqui",children:tab==="paramim"?"Quando alguém passar uma tarefa para você, ela aparece aqui.":"Crie uma tarefa da equipe para começar."}):
      (0,q.jsx)("ul",{className:"avt-list",children:filtered.map(t=>(0,q.jsx)(AvTaskCard,{t,me,isAdmin,dir,onChanged:reload,onEdit:setModal},t.id))}),
    (0,q.jsx)(AvTaskModal,{open:!!modal,task:modal&&modal.id?modal:null,onClose:()=>setModal(null),onSaved:reload})
  ]});
}

/* ---- "Atribuídas a mim" no painel Meu dia ---- */
function AvMine(){
  const{tasks,me}=useAvTasks();
  const nav=ir();
  const mine=(tasks||[]).filter(t=>t.assignee===me&&t.status!=="concluida");
  if(!tasks||mine.length===0)return null;
  const today=__avToday();
  return(0,q.jsx)(sl,{title:"Atribuídas a você pela equipe",count:mine.length,accent:!0,actions:(0,q.jsx)("button",{className:"btn sm",onClick:()=>nav("/tarefas-equipe"),children:"Abrir"}),children:
    (0,q.jsx)("ul",{className:"avt-mini",children:mine.slice(0,5).map(t=>(0,q.jsxs)("li",{onClick:()=>nav("/tarefas-equipe"),children:[(0,q.jsx)("strong",{children:t.title}),(0,q.jsxs)("span",{className:"small muted",children:[" · de "+t.owner_name,t.due_date?" · prazo "+na(t.due_date):""," ",t.due_date&&t.due_date<today?"(atrasada)":""]})]},t.id))})});
}

/* ---- Página: Calendário da equipe ---- */
function AvCalendar(){
  const{tasks,me,error,reload}=useAvTasks();
  const dir=useAvDir();
  const todayS=__avToday();
  const[ym,setYm]=x.useState(()=>todayS.slice(0,7)),[sel,setSel]=x.useState(todayS),[who,setWho]=x.useState(""),[addOpen,setAddOpen]=x.useState(!1);
  const[y,m]=ym.split("-").map(Number);
  const first=new Date(Date.UTC(y,m-1,1)),startDow=first.getUTCDay();
  const dim=new Date(Date.UTC(y,m,0)).getUTCDate();
  const iso=d=>`${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  const vis=(tasks||[]).filter(t=>t.due_date&&(!who||t.assignee===who||(!t.assignee&&t.owner===who)));
  const byDay=new Map();
  for(const t of vis)byDay.set(t.due_date,[...(byDay.get(t.due_date)||[]),t]);
  const move=n=>{const d=new Date(Date.UTC(y,m-1+n,1));setYm(`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`)};
  const months=["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  const cells=[];for(let i=0;i<startDow;i++)cells.push(null);for(let d=1;d<=dim;d++)cells.push(d);
  const day=byDay.get(sel)||[];
  const groups=new Map();
  for(const t of day){const k=t.assignee_name||t.owner_name;groups.set(k,[...(groups.get(k)||[]),t])}
  const nav=ir();
  return(0,q.jsxs)(q.Fragment,{children:[
    (0,q.jsx)("div",{className:"page-head",children:(0,q.jsxs)("div",{children:[(0,q.jsx)("div",{className:"eyebrow",children:"Equipe"}),(0,q.jsx)("h1",{children:"Calendário da equipe"}),(0,q.jsx)("p",{children:"O que cada pessoa tem para fazer em cada dia. Aparecem as tarefas da equipe com prazo (as individuais só para quem pode ver)."})]})}),
    (0,q.jsx)(ll,{error}),
    (0,q.jsxs)("div",{className:"toolbar",children:[
      (0,q.jsxs)("div",{className:"btn-row",role:"group","aria-label":"Mês",style:{flexWrap:"nowrap"},children:[(0,q.jsx)("button",{className:"btn sm",onClick:()=>move(-1),"aria-label":"Mês anterior",children:"‹"}),(0,q.jsx)("button",{className:"btn sm",onClick:()=>{setYm(todayS.slice(0,7));setSel(todayS)},children:"Hoje"}),(0,q.jsx)("button",{className:"btn sm",onClick:()=>move(1),"aria-label":"Próximo mês",children:"›"})]}),
      (0,q.jsx)("strong",{className:"avc-title",children:months[m-1]+" de "+y}),(0,q.jsx)("span",{style:{flex:1}}),(0,q.jsx)("button",{className:"btn primary",onClick:()=>setAddOpen(!0),children:"+ Nova tarefa em "+na(sel)}),
      (0,q.jsxs)("select",{className:"select",value:who,onChange:e=>setWho(e.target.value),"aria-label":"Pessoa",children:[(0,q.jsx)("option",{value:"",children:"Todas as pessoas"}),dir.map(p=>(0,q.jsx)("option",{value:p.id,children:p.name+(p.id===me?" (você)":"")},p.id))]})]}),
    (0,q.jsxs)("div",{className:"avc",children:[
      (0,q.jsx)("div",{className:"avc-grid",role:"grid","aria-label":"Calendário",children:[
        ["dom","seg","ter","qua","qui","sex","sáb"].map(w=>(0,q.jsx)("div",{className:"avc-dow",children:w},w)),
        cells.map((d,i)=>{
          if(!d)return(0,q.jsx)("div",{className:"avc-cell empty"},"e"+i);
          const k=iso(d),list=byDay.get(k)||[];
          return(0,q.jsxs)("button",{type:"button",className:"avc-cell"+(k===todayS?" today":"")+(k===sel?" sel":""),onClick:()=>setSel(k),"aria-label":d+" de "+months[m-1]+", "+list.length+" tarefa(s)",children:[
            (0,q.jsx)("span",{className:"avc-n",children:d}),
            (0,q.jsxs)("span",{className:"avc-dots",children:[list.slice(0,4).map(t=>(0,q.jsx)("i",{style:{background:__avColor(t.assignee||t.owner),opacity:t.status==="concluida"?.35:1}},t.id)),list.length>4&&(0,q.jsx)("em",{children:"+"+(list.length-4)})]})
          ]},k);
        })]}),
      (0,q.jsxs)("section",{className:"avc-day panel","aria-live":"polite",children:[
        (0,q.jsxs)("div",{className:"panel-head",children:[(0,q.jsx)("h2",{children:na(sel)+(sel===todayS?" · hoje":"")}),(0,q.jsx)("button",{className:"btn sm",onClick:()=>setAddOpen(!0),children:"+ Adicionar"})]}),
        (0,q.jsx)("div",{className:"panel-body",children:!tasks?(0,q.jsx)(cl,{rows:3}):day.length===0?(0,q.jsx)("p",{className:"small muted",children:"Nada marcado para este dia."}):[...groups.entries()].map(([name,list])=>(0,q.jsxs)("div",{className:"avc-grp",children:[
          (0,q.jsxs)("div",{className:"avc-who",children:[(0,q.jsx)("span",{className:"avt-av sm",style:{background:__avColor(list[0].assignee||list[0].owner)},"aria-hidden":!0,children:__avInit(name)}),(0,q.jsx)("strong",{children:name})]}),
          (0,q.jsx)("ul",{children:list.map(t=>(0,q.jsxs)("li",{className:t.status==="concluida"?"is-done":"",onClick:()=>nav("/tarefas-equipe"),children:[t.due_time&&(0,q.jsx)("span",{className:"mono small",children:t.due_time+" "}),t.title,(0,q.jsx)("span",{className:"small muted",children:" · "+__avStatus[t.status]+(t.kind==="validar"?" · validar":"")})]},t.id))})]},name))})
      ]})
    ]}),
    (0,q.jsx)(AvTaskModal,{open:addOpen,task:null,defaults:{due_date:sel,assignee:who||""},onClose:()=>setAddOpen(!1),onSaved:reload})
  ]});
}

/* ---- Recuperar senha (tela de entrada) ---- */
function AvRecover({onBack,onDone}){
  const[name,setName]=x.useState(""),[code,setCode]=x.useState(""),[pw,setPw]=x.useState(""),[pw2,setPw2]=x.useState(""),[err,setErr]=x.useState(null),[busy,setBusy]=x.useState(!1),[show,setShow]=x.useState(!1);
  const submit=async e=>{
    e.preventDefault();setErr(null);
    const ne=Rl(name);if(ne)return setErr(ne);
    const pe=Ll(pw);if(pe)return setErr(pe);
    if(pw!==pw2)return setErr("As senhas não conferem.");
    setBusy(!0);
    try{const r=await __avJson("/auth/recover",{method:"POST",body:{name:name.trim(),code,next:pw}});onDone(r)}
    catch(e2){setErr(e2?.message||"Não foi possível redefinir a senha.");setBusy(!1)}
  };
  return(0,q.jsx)("div",{className:"gate",children:(0,q.jsxs)("form",{className:"gate-card",onSubmit:submit,noValidate:!0,children:[
    (0,q.jsx)(fu,{size:64}),(0,q.jsx)("h1",{children:"Recuperar senha"}),
    (0,q.jsx)("p",{children:"Informe seu nome e o código de recuperação que apareceu quando você criou a conta. Se não tiver o código, peça ao administrador para definir uma nova senha."}),
    (0,q.jsxs)("label",{className:"field",children:[(0,q.jsx)("span",{children:"Nome"}),(0,q.jsx)("input",{className:"input",value:name,onChange:e=>setName(e.target.value),autoFocus:!0,maxLength:60,autoComplete:"username"})]}),
    (0,q.jsxs)("label",{className:"field",children:[(0,q.jsx)("span",{children:"Código de recuperação"}),(0,q.jsx)("input",{className:"input mono",value:code,onChange:e=>setCode(e.target.value.toUpperCase()),placeholder:"XXXX-XXXX-XXXX",maxLength:16,autoComplete:"off"})]}),
    (0,q.jsxs)("label",{className:"field",children:[(0,q.jsx)("span",{children:"Nova senha"}),(0,q.jsx)("input",{className:"input",type:show?"text":"password",value:pw,onChange:e=>setPw(e.target.value),maxLength:64,autoComplete:"new-password"})]}),
    (0,q.jsxs)("label",{className:"field",children:[(0,q.jsx)("span",{children:"Confirmar nova senha"}),(0,q.jsx)("input",{className:"input",type:show?"text":"password",value:pw2,onChange:e=>setPw2(e.target.value),maxLength:64,autoComplete:"new-password"})]}),
    (0,q.jsxs)("label",{className:"small",style:{display:"flex",gap:8,alignItems:"center"},children:[(0,q.jsx)("input",{type:"checkbox",checked:show,onChange:e=>setShow(e.target.checked)}),"Mostrar senhas"]}),
    (0,q.jsx)("p",{className:"small muted pw-rule",children:"No mínimo 7 caracteres, com pelo menos uma letra, um número e um caractere especial (ex.: Av@2026)."}),
    err&&(0,q.jsx)("p",{className:"gate-error",role:"alert",children:err}),
    (0,q.jsx)("button",{className:"btn primary",type:"submit",disabled:busy,children:busy?"Aguarde…":"Redefinir e entrar"}),
    (0,q.jsx)("button",{className:"btn ghost",type:"button",onClick:onBack,children:"Voltar para entrar"})
  ]})});
}

/* ---- Mostra o código de recuperação uma única vez (após criar conta / recuperar / gerar novo) ---- */
function AvCodeScreen({code,title,onContinue}){
  const[ok,setOk]=x.useState(!1),[copied,setCopied]=x.useState(!1);
  const copy=async()=>{try{await navigator.clipboard.writeText(code);setCopied(!0)}catch{}};
  return(0,q.jsx)("div",{className:"gate",children:(0,q.jsxs)("div",{className:"gate-card",role:"dialog","aria-label":"Código de recuperação",children:[
    (0,q.jsx)(fu,{size:64}),(0,q.jsx)("h1",{children:title||"Guarde seu código de recuperação"}),
    (0,q.jsx)("p",{children:"Se você esquecer a senha, este código permite criar uma nova sem depender de ninguém. Ele aparece só desta vez: anote ou tire um print e guarde em local seguro."}),
    (0,q.jsx)("div",{className:"avt-code mono","aria-label":"Código",children:code}),
    (0,q.jsx)("button",{className:"btn",type:"button",onClick:copy,children:copied?"Copiado!":"Copiar código"}),
    (0,q.jsxs)("label",{className:"small",style:{display:"flex",gap:8,alignItems:"center"},children:[(0,q.jsx)("input",{type:"checkbox",checked:ok,onChange:e=>setOk(e.target.checked)}),"Guardei o código em local seguro"]}),
    (0,q.jsx)("button",{className:"btn primary",type:"button",disabled:!ok,onClick:onContinue,children:"Continuar"})
  ]})});
}

/* ---- Excluir várias tarefas de uma vez ---- */
function AvBulk({open,onClose}){
  const{data:all,loading}=Da(open?"/api/tasks?include_closed=1":null);
  const{refresh,toast}=Ea();
  const[sel,setSel]=x.useState(()=>new Set()),[term,setTerm]=x.useState(""),[busy,setBusy]=x.useState(!1);
  x.useEffect(()=>{if(!open){setSel(new Set());setTerm("")}},[open]);
  const n=__avNorm(term).trim();
  const list=(all||[]).filter(t=>!n||__avNorm(t.title+" "+(t.project_name||"")).includes(n));
  const allOn=list.length>0&&list.every(t=>sel.has(t.id));
  const toggle=id=>setSel(s=>{const z=new Set(s);z.has(id)?z.delete(id):z.add(id);return z});
  const toggleAll=()=>setSel(s=>{const z=new Set(s);allOn?list.forEach(t=>z.delete(t.id)):list.forEach(t=>z.add(t.id));return z});
  const run=async()=>{
    const chosen=(all||[]).filter(t=>sel.has(t.id));
    if(!chosen.length)return;
    if(!confirm("Excluir "+chosen.length+" tarefa(s)? Dá para desfazer pelo Histórico.")) return;
    setBusy(!0);let ok=0,bad=0;
    for(const t of [...chosen.filter(z=>z.parent_id),...chosen.filter(z=>!z.parent_id)]){
      try{await Yi.del("/api/tasks/"+t.id,{confirm:!0});ok++}catch{bad++}
    }
    setBusy(!1);setSel(new Set());refresh();
    toast(ok+" tarefa(s) excluída(s)."+(bad?" "+bad+" não puderam ser excluídas (confira se têm subtarefas não marcadas).":""),bad?"error":"ok");
    if(!bad)onClose();
  };
  return(0,q.jsx)(dl,{open,title:"Selecionar e excluir tarefas",onClose,className:"modal-xl",footer:(0,q.jsxs)(q.Fragment,{children:[
    (0,q.jsx)("span",{className:"small muted",style:{marginRight:"auto",alignSelf:"center"},children:sel.size+" selecionada(s)"}),
    (0,q.jsx)("button",{className:"btn",onClick:onClose,children:"Fechar"}),
    (0,q.jsx)("button",{className:"btn danger",disabled:busy||sel.size===0,onClick:run,children:busy?"Excluindo…":"Excluir selecionadas"})]}),
    children:(0,q.jsxs)(q.Fragment,{children:[
      (0,q.jsxs)("div",{className:"btn-row",style:{marginBottom:10},children:[
        (0,q.jsx)("input",{className:"input",style:{flex:1},placeholder:"Filtrar pelo título ou projeto","aria-label":"Filtrar tarefas",value:term,onChange:e=>setTerm(e.target.value)}),
        (0,q.jsx)("button",{className:"btn",type:"button",onClick:toggleAll,disabled:!list.length,children:allOn?"Desmarcar todas":"Marcar todas"+(n?" do filtro":"")})]}),
      loading&&!all?(0,q.jsx)(cl,{rows:5}):list.length===0?(0,q.jsx)("p",{className:"muted small",children:"Nenhuma tarefa encontrada."}):
      (0,q.jsx)("ul",{className:"avb-list",children:list.map(t=>(0,q.jsx)("li",{children:(0,q.jsxs)("label",{children:[(0,q.jsx)("input",{type:"checkbox",checked:sel.has(t.id),onChange:()=>toggle(t.id)}),(0,q.jsxs)("span",{className:"avb-t",children:[t.title,(0,q.jsxs)("span",{className:"small muted",children:[(t.project_name?" · "+t.project_name:"")+(t.parent_title?" › "+t.parent_title:"")+(t.status==="concluida"?" · concluída":"")]})]})]})},t.id))})
    ]})});
}

/* ---- Vincular documento a projeto ou tarefa (dentro da janela do documento) ---- */
function AvDocLink({doc,projects,tasks,onSaved}){
  const run=Oa();
  const save=(body,msg)=>run(()=>Yi.patch("/api/documents/"+doc.id,body),msg).then(r=>{r!==void 0&&onSaved()});
  return(0,q.jsxs)("div",{className:"form-grid",style:{marginBottom:12},children:[
    (0,q.jsx)(gl,{label:"Projeto de origem",children:(0,q.jsxs)("select",{className:"select",value:doc.project_id??"",onChange:e=>save({project_id:e.target.value?Number(e.target.value):null},"Vínculo atualizado."),children:[(0,q.jsx)("option",{value:"",children:"—"}),projects.map(p=>(0,q.jsx)("option",{value:p.id,children:p.name},p.id))]})}),
    (0,q.jsx)(gl,{label:"Tarefa de origem",hint:"Digite para buscar. Não cria nada sozinho.",children:(0,q.jsx)(AvPick,{items:tasks.map(t=>({id:t.id,label:t.title})),value:doc.task_id,placeholder:"Buscar tarefa…",ariaLabel:"Tarefa do documento",onPick:id=>save({task_id:id?Number(id):null},"Vínculo atualizado."),onCreate:title=>run(async()=>{const t=await Yi.post("/api/tasks",{title,project_id:doc.project_id||null});await Yi.patch("/api/documents/"+doc.id,{task_id:t.id});return t},"Tarefa criada e vinculada.").then(r=>{r!==void 0&&onSaved()})})})
  ]});
}

/* ---- Tela de entrada: entrar / criar / recuperar / mostrar código ---- */
function AvGate({st,Gate,done}){
  const[view,setView]=x.useState("main"),[pend,setPend]=x.useState(null);
  const finish=(user,code,title)=>{if(code){setPend({user,code,title});setView("code")}else done(user)};
  if(view==="code"&&pend)return(0,q.jsx)(AvCodeScreen,{code:pend.code,title:pend.title,onContinue:()=>done(pend.user)});
  if(view==="recover")return(0,q.jsx)(AvRecover,{onBack:()=>setView("main"),onDone:r=>finish(r.user,r.recoveryCode,"Guarde seu novo código de recuperação")});
  return(0,q.jsx)(Gate,{firstAccount:st.firstAccount,needCode:st.needCode,
    subtitle:"Seu sistema de rotina e acompanhamento do trabalho. Entre com seu nome e senha ou crie sua conta.",
    onForgot:()=>setView("recover"),
    login:async(name,pw)=>{const j=await __avJson("/auth/login",{method:"POST",body:{name,password:pw}});done(j.user)},
    register:async(name,pw,code)=>{const j=await __avJson("/auth/register",{method:"POST",body:{name,password:pw,code}});finish(j.user,j.recoveryCode,"Guarde seu código de recuperação")}});
}

/* ---- Seção recolhível (detalhe da tarefa) ---- */
function AvSec({title,children,open}){
  return(0,q.jsxs)("details",{className:"section av-sec",open:!!open,children:[(0,q.jsx)("summary",{children:(0,q.jsx)("h3",{children:title})}),children]});
}

/* ---- Menu da conta: gerar o código de recuperação (para contas criadas antes desse recurso) ---- */
function AvCodeModal(){
  const[open,setOpen]=x.useState(!1),[pw,setPw]=x.useState(""),[code,setCode]=x.useState(""),[err,setErr]=x.useState(""),[busy,setBusy]=x.useState(!1);
  x.useEffect(()=>{const f=()=>{setPw("");setCode("");setErr("");setOpen(!0)};window.addEventListener("prumo:code",f);return()=>window.removeEventListener("prumo:code",f)},[]);
  const go=async e=>{
    e&&e.preventDefault();setErr("");setBusy(!0);
    try{const r=await __avJson("/auth/recovery-code",{method:"POST",body:{current:pw}});setCode(r.recoveryCode);setPw("")}
    catch(x2){setErr(x2?.message||"Não foi possível gerar o código.")}finally{setBusy(!1)}
  };
  return(0,q.jsx)(dl,{open,title:"Código de recuperação de senha",onClose:()=>setOpen(!1),footer:code?(0,q.jsx)("button",{className:"btn primary",onClick:()=>setOpen(!1),children:"Guardei o código"}):(0,q.jsxs)(q.Fragment,{children:[(0,q.jsx)("button",{className:"btn",onClick:()=>setOpen(!1),children:"Cancelar"}),(0,q.jsx)("button",{className:"btn primary",disabled:busy||!pw,onClick:go,children:busy?"Aguarde…":"Gerar código"})]}),
    children:code?(0,q.jsxs)(q.Fragment,{children:[(0,q.jsx)("p",{className:"small",children:"Guarde este código em local seguro. Ele aparece só desta vez e substitui o código anterior."}),(0,q.jsx)("div",{className:"avt-code mono",children:code})]}):
      (0,q.jsxs)("form",{onSubmit:go,children:[(0,q.jsx)("p",{className:"small muted",children:"Com este código você cria uma nova senha se esquecer a atual, sem precisar de ninguém. Confirme sua senha para gerar um."}),(0,q.jsxs)("label",{className:"field",children:[(0,q.jsx)("span",{children:"Senha atual"}),(0,q.jsx)("input",{className:"input",type:"password",value:pw,onChange:e=>setPw(e.target.value),autoComplete:"current-password","data-autofocus":!0,maxLength:64})]}),err&&(0,q.jsx)("p",{className:"gate-error",role:"alert",children:err})]})});
}
