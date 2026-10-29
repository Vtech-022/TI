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
function AvTeamTasks({embedded}){
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
    embedded?(0,q.jsxs)("div",{className:"avt-embed-head",children:[(0,q.jsxs)("div",{children:[(0,q.jsx)("h2",{children:"Tarefas da equipe"}),(0,q.jsx)("p",{className:"small muted",children:"Passe tarefas para alguém com login ou para a equipe toda. Quem recebe vê na própria lista e marca como feita."})]}),(0,q.jsx)("button",{className:"btn primary",onClick:()=>setModal({}),children:"+ Nova tarefa da equipe"})]}):
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
const __avMonths=["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const __avDows=["dom","seg","ter","qua","qui","sex","sáb"];
const __avTint=(hex,a)=>{const h=String(hex||"#2f64c4").replace("#","");const n=parseInt(h.length===3?h.replace(/./g,c=>c+c):h,16);return`rgba(${n>>16&255},${n>>8&255},${n&255},${a})`};
function AvCalendar(){
  const{tasks:shared,me,error,reload}=useAvTasks();
  const mine=Da("/api/tasks?include_closed=1");
  const open=_l();
  const dir=useAvDir();
  const todayS=__avToday();
  const[ym,setYm]=x.useState(()=>todayS.slice(0,7)),[sel,setSel]=x.useState(todayS),[who,setWho]=x.useState(""),[addOpen,setAddOpen]=x.useState(!1),[colorsOpen,setColorsOpen]=x.useState(!1);
  const[y,m]=ym.split("-").map(Number);
  const startDow=new Date(Date.UTC(y,m-1,1)).getUTCDay(),dim=new Date(Date.UTC(y,m,0)).getUTCDate();
  const iso=d=>`${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  const myName=Wi.userName||"Eu";
  /* junta as tarefas da equipe com as minhas (as minhas usam a cor do projeto) */
  const items=[];
  for(const t of shared||[]){
    if(!t.due_date)continue;
    const pid=t.assignee||t.owner;
    if(who&&pid!==who)continue;
    items.push({key:"s"+t.id,title:t.title,date:t.due_date,time:t.due_time,done:t.status==="concluida",status:t.status,who:pid,whoName:t.assignee_name||t.owner_name||"Sem responsável",color:__avColor(pid),kind:"shared",validar:t.kind==="validar",subs:t.subtasks||[]});
  }
  if(!who||who===me)for(const t of mine.data||[]){
    if(!t.due_date||t.status==="cancelada")continue;
    items.push({key:"l"+t.id,title:t.title,date:t.due_date,time:t.due_time,done:t.status==="concluida",status:t.status,who:me,whoName:myName,color:t.project_name?zc(t.project_name):"#2f64c4",project:t.project_name,kind:"local",localId:t.id,subs:[]});
  }
  const byDay=new Map();
  for(const it of items)byDay.set(it.date,[...(byDay.get(it.date)||[]),it]);
  for(const l of byDay.values())l.sort((a,b)=>(a.done-b.done)||String(a.time||"99").localeCompare(String(b.time||"99")));
  const move=n=>{const d=new Date(Date.UTC(y,m-1+n,1));setYm(`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`)};
  const cells=[];for(let i=0;i<startDow;i++)cells.push(null);for(let d=1;d<=dim;d++)cells.push(d);
  const day=byDay.get(sel)||[];
  const openCount=day.filter(i=>!i.done).length;
  const goItem=it=>{if(it.kind==="local")open(it.localId);else nav("/tarefas-equipe")};
  const nav=ir();
  const stLabel=it=>it.done?"Concluída":it.status==="em_andamento"?"Em andamento":"Pendente";
  return(0,q.jsxs)(q.Fragment,{children:[
    (0,q.jsxs)("div",{className:"page-head",children:[(0,q.jsxs)("div",{children:[(0,q.jsx)("div",{className:"eyebrow",children:"Equipe"}),(0,q.jsx)("h1",{children:"Calendário da equipe"}),(0,q.jsx)("p",{children:"O que cada pessoa tem para fazer em cada dia. Suas tarefas aparecem com a cor do projeto."})]}),
      (0,q.jsxs)("div",{className:"btn-row",children:[(0,q.jsx)("button",{className:"btn",onClick:()=>setColorsOpen(!0),children:"Cores dos projetos"}),(0,q.jsx)("button",{className:"btn primary",onClick:()=>setAddOpen(!0),children:"+ Nova tarefa"})]})]}),
    (0,q.jsx)(ll,{error}),
    (0,q.jsxs)("div",{className:"avc2",children:[
      (0,q.jsxs)("section",{className:"avc2-main panel",children:[
        (0,q.jsxs)("div",{className:"avc2-head",children:[
          (0,q.jsxs)("div",{className:"avc2-title",children:[(0,q.jsx)("strong",{children:__avMonths[m-1]}),(0,q.jsx)("span",{children:y})]}),
          (0,q.jsxs)("div",{className:"avc2-ctl",children:[
            (0,q.jsxs)("select",{className:"select",value:who,onChange:e=>setWho(e.target.value),"aria-label":"Pessoa",children:[(0,q.jsx)("option",{value:"",children:"Todas as pessoas"}),dir.map(p=>(0,q.jsx)("option",{value:p.id,children:p.name+(p.id===me?" (você)":"")},p.id))]}),
            (0,q.jsx)("button",{className:"avc2-round",onClick:()=>move(-1),"aria-label":"Mês anterior",children:"‹"}),
            (0,q.jsx)("button",{className:"avc2-today",onClick:()=>{setYm(todayS.slice(0,7));setSel(todayS)},children:"Hoje"}),
            (0,q.jsx)("button",{className:"avc2-round",onClick:()=>move(1),"aria-label":"Próximo mês",children:"›"})]})]}),
        (0,q.jsxs)("div",{className:"avc2-grid",role:"grid","aria-label":"Calendário",children:[
          __avDows.map(w=>(0,q.jsx)("div",{className:"avc2-dow",children:w},w)),
          cells.map((d,i)=>{
            if(!d)return(0,q.jsx)("div",{className:"avc2-cell empty"},"e"+i);
            const k=iso(d),list=byDay.get(k)||[],dow=(startDow+d-1)%7;
            return(0,q.jsxs)("button",{type:"button",className:"avc2-cell"+(k===todayS?" today":"")+(k===sel?" sel":"")+(dow===0||dow===6?" wknd":"")+(list.length?" has":""),onClick:()=>setSel(k),onDoubleClick:()=>{setSel(k);setAddOpen(!0)},"aria-label":d+" de "+__avMonths[m-1]+", "+list.length+" tarefa(s)",children:[
              (0,q.jsx)("span",{className:"avc2-n",children:d}),
              (0,q.jsxs)("span",{className:"avc2-chips",children:[list.slice(0,2).map(it=>(0,q.jsx)("span",{className:"avc2-chip"+(it.done?" done":""),style:{background:__avTint(it.color,.2),borderLeftColor:it.color},title:it.title,children:it.title},it.key)),list.length>2&&(0,q.jsx)("em",{className:"avc2-more",children:"+"+(list.length-2)+" mais"})]}),
              (0,q.jsx)("span",{className:"avc2-faces",children:[...new Map(list.map(it=>[it.who,it])).values()].slice(0,3).map(it=>(0,q.jsx)("i",{style:{background:it.color},title:it.whoName,children:__avInit(it.whoName)},it.who))})
            ]},k);
          })]})]}),
      (0,q.jsxs)("aside",{className:"avc2-side","aria-live":"polite",children:[
        (0,q.jsxs)("div",{className:"avc2-side-head",children:[(0,q.jsxs)("div",{children:[(0,q.jsx)("small",{children:sel===todayS?"Hoje":__avDows[new Date(sel+"T12:00:00Z").getUTCDay()]}),(0,q.jsx)("h2",{children:na(sel)})]}),(0,q.jsx)("button",{className:"btn sm primary",onClick:()=>setAddOpen(!0),children:"+ Adicionar"})]}),
        (0,q.jsx)("div",{className:"avc2-count",children:!shared&&!mine.data?"Carregando…":day.length===0?"Nada marcado para este dia.":openCount+" em aberto · "+(day.length-openCount)+" concluída(s)"}),
        (0,q.jsx)("ul",{className:"avc2-list",children:day.map(it=>(0,q.jsxs)("li",{className:"avc2-card"+(it.done?" done":""),style:{borderLeftColor:it.color,background:__avTint(it.color,.1)},onClick:()=>goItem(it),children:[
          (0,q.jsxs)("div",{className:"avc2-card-top",children:[(0,q.jsx)("strong",{children:it.title}),(0,q.jsx)("span",{className:"avc2-st",children:stLabel(it)})]}),
          (0,q.jsxs)("div",{className:"avc2-card-meta",children:[(0,q.jsx)("i",{style:{background:it.color},children:__avInit(it.whoName)}),(0,q.jsx)("span",{children:it.whoName}),it.time&&(0,q.jsx)("span",{className:"mono",children:it.time}),it.project&&(0,q.jsx)("span",{className:"avc2-proj",style:{color:it.color},children:it.project}),it.validar&&(0,q.jsx)("span",{className:"avc2-proj",children:"validar"})]}),
          it.subs.length>0&&(0,q.jsx)("div",{className:"avc2-bar",title:it.subs.filter(s=>s.done).length+"/"+it.subs.length+" subtarefas",children:(0,q.jsx)("span",{style:{width:Math.round(100*it.subs.filter(s=>s.done).length/it.subs.length)+"%",background:it.color}})})]},it.key))}),
        (0,q.jsx)("button",{className:"btn ghost sm",style:{marginTop:10},onClick:()=>nav("/tarefas-equipe"),children:"Abrir Tarefas da equipe"})
      ]})]}),
    (0,q.jsx)(AvTaskModal,{open:addOpen,task:null,defaults:{due_date:sel,assignee:who&&who!==me?who:""},onClose:()=>setAddOpen(!1),onSaved:reload}),
    (0,q.jsx)(AvColorsModal,{open:colorsOpen,onClose:()=>setColorsOpen(!1)})
  ]});
}

/* ---- Cores dos projetos (cada pessoa escolhe as suas) ---- */
const __avSwatches=["#2f64c4","#0e7490","#18794e","#4d7c0f","#c49a2c","#b25e09","#b42318","#be185d","#6941c6","#475569","#e11d48","#0ea5e9"];
function AvColorsModal({open,onClose}){
  const{data:projects}=Da(open?"/api/projects":null);
  const{prefs,setPrefs}=Ea();
  const colors=prefs.projectColors||{};
  const setColor=(name,c)=>{const n={...colors};if(c)n[name]=c;else delete n[name];window.__avProjColors=n;setPrefs({projectColors:n})};
  return(0,q.jsx)(dl,{open,title:"Cores dos projetos",onClose,footer:(0,q.jsx)("button",{className:"btn primary",onClick:onClose,children:"Pronto"}),
    children:!projects?(0,q.jsx)(cl,{rows:4}):projects.length===0?(0,q.jsx)("p",{className:"muted small",children:"Você ainda não tem projetos."}):
      (0,q.jsxs)(q.Fragment,{children:[(0,q.jsx)("p",{className:"small muted",style:{marginBottom:10},children:"A cor escolhida aparece nos seus projetos, nas etiquetas das tarefas e no calendário. Só você vê as suas escolhas."}),
        (0,q.jsx)("ul",{className:"avcol-list",children:projects.map(p=>(0,q.jsxs)("li",{children:[
          (0,q.jsx)("span",{className:"avcol-name",children:[(0,q.jsx)("i",{style:{background:zc(p.name)}}),p.name]}),
          (0,q.jsxs)("span",{className:"avcol-sw",children:[__avSwatches.map(c=>(0,q.jsx)("button",{type:"button",className:"avcol-dot"+(zc(p.name).toLowerCase()===c?" on":""),style:{background:c},"aria-label":"Cor "+c+" para "+p.name,onClick:()=>setColor(p.name,c)},c)),
            (0,q.jsx)("input",{type:"color",className:"avcol-pick","aria-label":"Outra cor para "+p.name,value:/^#[0-9a-f]{6}$/i.test(zc(p.name))?zc(p.name):"#2f64c4",onChange:e=>setColor(p.name,e.target.value)}),
            colors[p.name]&&(0,q.jsx)("button",{type:"button",className:"btn sm ghost",onClick:()=>setColor(p.name,null),children:"Padrão"})]})]},p.id))})]})});
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
  const fn=doc.filename||"documento",m=doc.mime||"",ext=(fn.split(".").pop()||"").toLowerCase();
  const app=/^docx?$|^rtf$|^odt$/.test(ext)?"Word":/^xlsx?$|^csv$|^ods$/.test(ext)?"Excel":/^pptx?$|^odp$/.test(ext)?"PowerPoint":null;
  const href="/api/documents/"+doc.id+"/file";
  const inline=/pdf|image\/|text\/plain/.test(m);
  return(0,q.jsxs)("div",{className:"form-grid",style:{marginBottom:12},children:[
    (0,q.jsxs)("div",{className:"btn-row",style:{gridColumn:"1/-1",gap:8,flexWrap:"wrap"},children:[
      app&&(0,q.jsx)("a",{className:"btn primary",href,download:fn,title:"Baixa o arquivo original e abre no "+app+" do seu computador",children:"Abrir no "+app}),
      inline&&(0,q.jsx)("a",{className:"btn primary",href,target:"_blank",rel:"noopener",title:"Abre o documento em tela cheia numa nova aba",children:"Abrir em tela cheia"}),
      !app&&!inline&&(0,q.jsx)("a",{className:"btn primary",href,download:fn,children:"Abrir no programa de origem"}),
      app&&(0,q.jsx)("span",{className:"small muted",style:{alignSelf:"center"},children:"Abre o arquivo original no programa instalado (o navegador pode pedir para escolher “Abrir”)."})]}),
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

/* ---- Dica do menu lateral (fixa, sempre legível, não é cortada pela rolagem do menu) ---- */
(function(){
  if(typeof document==="undefined")return;
  let tip=null;
  const hide=()=>{if(tip){tip.remove();tip=null}};
  document.addEventListener("mouseover",e=>{
    const el=e.target&&e.target.closest?e.target.closest(".rail-item[data-tip]"):null;
    if(!el){hide();return}
    hide();
    const r=el.getBoundingClientRect();
    tip=document.createElement("div");tip.className="avtip";tip.textContent=el.getAttribute("data-tip");
    tip.style.left=(r.right+12)+"px";tip.style.top=(r.top+r.height/2)+"px";
    document.body.appendChild(tip);
  });
  document.addEventListener("mouseleave",hide,!0);
  document.addEventListener("click",hide,!0);
  document.addEventListener("scroll",hide,!0);
})();

/* ===== Presença (quem está online), horas do dia e foto de perfil ===== */
const __avPS={data:null,at:0,subs:new Set(),timer:null,busy:!1};
async function __avPSLoad(){
  if(__avPS.busy)return;__avPS.busy=!0;
  try{const d=await __avJson("/presence");__avPS.data=d;__avPS.at=Date.now();__avPS.subs.forEach(f=>f())}catch{}finally{__avPS.busy=!1}
}
function usePresence(){
  const[,tick]=x.useState(0);
  x.useEffect(()=>{
    const f=()=>tick(n=>n+1);__avPS.subs.add(f);
    if(!__avPS.timer){__avPSLoad();__avPS.timer=setInterval(()=>{if(document.visibilityState==="visible")__avPSLoad()},20000)}
    else if(__avPS.data)f();
    const t=setInterval(f,30000); /* o relógio de horas anda sozinho entre uma consulta e outra */
    return()=>{__avPS.subs.delete(f);clearInterval(t);if(!__avPS.subs.size&&__avPS.timer){clearInterval(__avPS.timer);__avPS.timer=null}};
  },[]);
  const d=__avPS.data;
  const lag=d?Date.now()-__avPS.at:0;
  const people=d?d.people.map(p=>({...p,worked_ms:p.worked_ms+(p.working?lag:0)})):null;
  return{people,reload:__avPSLoad};
}
const __avHM=ms=>{const m=Math.floor(Math.max(0,ms)/60000);return m<60?m+"min":Math.floor(m/60)+"h"+String(m%60).padStart(2,"0")};

/* foto (se tiver) ou iniciais coloridas */
function AvPhoto({id,name,fallback,size}){
  const{people}=usePresence();
  const p=people&&people.find(z=>z.id===id);
  const[bad,setBad]=x.useState(!1);
  const st=size?{width:size,height:size}:void 0;
  if(p&&p.av&&!bad)return(0,q.jsx)("img",{className:"av-img",src:"/api/avatar/"+id+"?v="+p.av,alt:"",style:st,onError:()=>setBad(!0)});
  return(0,q.jsx)("span",{className:"av-ini",style:{...(st||{}),background:__avColor(id)},"aria-hidden":!0,children:fallback??__avInit(name)});
}

/* ---- Horas do dia (cronômetro que a pessoa liga e pausa) ---- */
function AvWorkTimer(){
  const{people,reload}=usePresence();
  const me=window.__avUid;
  const p=people&&people.find(z=>z.id===me);
  const[busy,setBusy]=x.useState(!1);
  const{fail}=Ea();
  const go=async a=>{setBusy(!0);try{await __avJson("/presence/work",{method:"POST",body:{action:a}});await reload()}catch(e){fail(e)}finally{setBusy(!1)}};
  const working=!!(p&&p.working);
  return(0,q.jsxs)("div",{className:"avw"+(working?" on":""),children:[
    (0,q.jsxs)("div",{className:"avw-time",children:[(0,q.jsx)("small",{children:"Horas hoje"}),(0,q.jsx)("strong",{className:"mono",children:p?__avHM(p.worked_ms):"—"})]}),
    (0,q.jsx)("button",{className:"avw-btn",disabled:busy||!p,onClick:()=>go(working?"stop":"start"),title:working?"Pausa o cronômetro de hoje":"Liga o cronômetro enquanto você trabalha",children:working?"⏸ Pausar":"▶ Iniciar"}),
    (0,q.jsx)("span",{className:"avw-hint",children:working?"Contando… pausa sozinho se você sair do sistema.":"Ligue ao começar o expediente."})]});
}

/* ---- Painel de números do dia (animado) ---- */
function __avCount(v){
  const[n,setN]=x.useState(0);
  x.useEffect(()=>{
    if(window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches){setN(v);return}
    let raf,t0=performance.now(),from=0;const D=900;
    const f=t=>{const k=Math.min(1,(t-t0)/D);setN(Math.round(from+(v-from)*(1-Math.pow(1-k,3))));if(k<1)raf=requestAnimationFrame(f)};
    raf=requestAnimationFrame(f);return()=>cancelAnimationFrame(raf);
  },[v]);
  return n;
}
function AvHomeDash({lists,waiting}){
  const L=lists||{done:[],todo:[],late:[]};
  const cats=[
    {k:"done",label:"Concluídas",n:L.done.length,g:["var(--accent)","color-mix(in srgb,var(--accent) 60%,#fff)"],tips:L.done},
    {k:"todo",label:"A fazer hoje",n:L.todo.length,g:["var(--accent2,#9ad0ff)","color-mix(in srgb,var(--accent2,#9ad0ff) 55%,#fff)"],tips:L.todo},
    {k:"late",label:"Atrasadas",n:L.late.length,g:["#ff5c8a","#ffa3b8"],tips:L.late},
    {k:"wait",label:"Aguardando terceiros",n:waiting||0,g:["color-mix(in srgb,var(--avhero,#18181c) 60%,#fff 30%)","color-mix(in srgb,var(--avhero,#18181c) 40%,#fff 50%)"],tips:[]}
  ];
  const sum=cats.reduce((s,c)=>s+c.n,0);
  const[hv,setHv]=x.useState(null),[go,setGo]=x.useState(!1);
  x.useEffect(()=>{const t=setTimeout(()=>setGo(!0),80);return()=>clearTimeout(t)},[]);
  const totalDay=L.done.length+L.todo.length+L.late.length;
  const nDone=__avCount(L.done.length);
  const pct=totalDay?Math.round(100*L.done.length/totalDay):0;
  const R=74,C=2*Math.PI*R,GAP=sum>1?14:0;
  let acc=0;
  const segs=cats.filter(c=>c.n>0).map(c=>{const len=Math.max(1,C*c.n/sum-GAP);const s={...c,len,off:acc};acc+=C*c.n/sum;return s});
  const cur=hv?cats.find(c=>c.k===hv):null;
  return(0,q.jsx)("section",{className:"avh panel avh2","aria-label":"Seu dia em números",children:(0,q.jsxs)("div",{className:"avh2-wrap",children:[
    (0,q.jsxs)("div",{className:"avh2-donut",onMouseLeave:()=>setHv(null),children:[
      (0,q.jsxs)("svg",{viewBox:"0 0 200 200",role:"img","aria-label":L.done.length+" concluídas, "+L.todo.length+" a fazer, "+L.late.length+" atrasadas, "+(waiting||0)+" aguardando",children:[
        (0,q.jsx)("defs",{children:cats.map(c=>(0,q.jsxs)("linearGradient",{id:"avg-"+c.k,x1:"0",y1:"0",x2:"1",y2:"1",children:[(0,q.jsx)("stop",{offset:"0",stopColor:c.g[0]}),(0,q.jsx)("stop",{offset:"1",stopColor:c.g[1]})]},c.k))}),
        (0,q.jsx)("circle",{cx:"100",cy:"100",r:R,fill:"none",stroke:"#ffffff0d",strokeWidth:"22"}),
        segs.map((s,i)=>(0,q.jsx)("circle",{className:"avh2-seg"+(hv===s.k?" on":hv?" dim":""),cx:"100",cy:"100",r:R,fill:"none",stroke:"url(#avg-"+s.k+")",strokeWidth:"22",strokeLinecap:"round",
          strokeDasharray:go?s.len+" "+(C-s.len):"0 "+C,strokeDashoffset:-s.off-GAP/2,transform:"rotate(-90 100 100)",style:{transitionDelay:i*140+"ms","--glow":s.g[0]},onMouseEnter:()=>setHv(s.k)},s.k)),
        (0,q.jsx)("circle",{cx:"100",cy:"100",r:"54",fill:"url(#avh2-core)"}),
        (0,q.jsx)("defs",{children:(0,q.jsxs)("radialGradient",{id:"avh2-core",cx:"35%",cy:"30%",r:"80%",children:[(0,q.jsx)("stop",{offset:"0",stopColor:"color-mix(in srgb,var(--avhero,#18181c) 100%,#fff 12%)"}),(0,q.jsx)("stop",{offset:"1",stopColor:"color-mix(in srgb,var(--avhero,#18181c) 55%,#000)"})]})}),
        (0,q.jsx)("circle",{cx:"100",cy:"100",r:"54",fill:"none",stroke:"#ffffff1c",strokeWidth:"1"})]}),
      (0,q.jsx)("div",{className:"avh2-center",children:cur?(0,q.jsxs)(q.Fragment,{children:[(0,q.jsx)("strong",{children:cur.n}),(0,q.jsx)("small",{children:cur.label})]}):(0,q.jsxs)(q.Fragment,{children:[(0,q.jsx)("strong",{children:pct+"%"}),(0,q.jsx)("small",{children:"do dia"})]})})]}),
    (0,q.jsxs)("div",{className:"avh2-info",children:[
      (0,q.jsx)("h2",{children:"Seu dia em números"}),
      (0,q.jsxs)("div",{className:"avh2-big",children:[(0,q.jsx)("b",{children:nDone}),(0,q.jsx)("span",{children:"/"+totalDay}),(0,q.jsx)("em",{children:"atividades concluídas hoje"})]}),
      (0,q.jsx)("ul",{className:"avh2-legend",children:cats.map(c=>(0,q.jsxs)("li",{className:hv===c.k?"on":"",onMouseEnter:()=>setHv(c.k),onMouseLeave:()=>setHv(null),title:c.tips.length?c.label+":\n• "+c.tips.slice(0,8).join("\n• "):c.label,children:[(0,q.jsx)("i",{style:{background:"linear-gradient(135deg,"+c.g[0]+","+c.g[1]+")",boxShadow:"0 0 12px color-mix(in srgb,"+c.g[0]+" 55%,transparent)"}}),(0,q.jsx)("span",{children:c.label}),(0,q.jsx)("b",{children:c.n})]},c.k))})]})]})});
}

/* ---- Quem está online: faixa vertical centralizada; clicar abre a conversa ---- */
function AvOnline(){
  const{people}=usePresence();
  const{peers}=useChatSummary();
  if(!people)return null;
  const me=window.__avUid;
  const list=[...people].sort((a,b)=>(b.online?1:0)-(a.online?1:0));
  const shown=list.slice(0,9),extra=list.length-shown.length;
  const total=Object.values(peers).reduce((s,v)=>s+v.unread,0);
  const open=id=>window.dispatchEvent(new CustomEvent("prumo:chat",{detail:{peer:id}}));
  return(0,q.jsxs)("aside",{className:"avo-strip","aria-label":"Equipe online",children:[
    shown.map(p=>{const u=peers[p.id]&&peers[p.id].unread;return(0,q.jsxs)("button",{className:"avo-face"+(p.online?"":" off"),disabled:p.id===me,onClick:()=>open(p.id),title:p.name+(p.id===me?" (você)":" · clique para conversar")+(p.online?" · online":" · offline"),children:[(0,q.jsx)(AvPhoto,{id:p.id,name:p.name,size:38}),(0,q.jsx)("i",{className:"avo-dot"+(p.online?" on":"")}),u>0&&(0,q.jsx)("b",{className:"avc-badge avo-unread",children:u})]},p.id)}),
    extra>0&&(0,q.jsx)("span",{className:"avo-more",title:extra+" pessoas a mais",children:"+"+extra})]});
}

/* ---- Anotações do dia recolhidas (menos poluição na tela inicial) ---- */
function AvNotes({children}){
  return(0,q.jsxs)("details",{className:"av-more2",children:[(0,q.jsx)("summary",{children:"Anotações do dia"}),children]});
}

/* ---- Foto de perfil: escolher, reduzir e enviar ---- */
function AvAvatarModal(){
  const[open,setOpen]=x.useState(!1),[busy,setBusy]=x.useState(!1),[err,setErr]=x.useState("");
  const{people,reload}=usePresence();
  const me=window.__avUid,p=people&&people.find(z=>z.id===me);
  x.useEffect(()=>{const f=()=>{setErr("");setOpen(!0)};window.addEventListener("prumo:avatar",f);return()=>window.removeEventListener("prumo:avatar",f)},[]);
  const pick=async file=>{
    setErr("");if(!file)return;
    if(!/^image\/(jpeg|png|webp)$/.test(file.type)){setErr("Use uma foto JPG, PNG ou WEBP.");return}
    setBusy(!0);
    try{
      const bmp=await createImageBitmap(file);
      const S=192,cv=document.createElement("canvas");cv.width=cv.height=S;
      const side=Math.min(bmp.width,bmp.height),sx=(bmp.width-side)/2,sy=(bmp.height-side)/2;
      cv.getContext("2d").drawImage(bmp,sx,sy,side,side,0,0,S,S);
      const blob=await new Promise(r=>cv.toBlob(r,"image/jpeg",.85));
      const bytes=new Uint8Array(await blob.arrayBuffer());
      await __avJson("/avatar",{method:"PUT",body:bytes});
      await reload();setOpen(!1);
    }catch(e){setErr(e?.message||"Não foi possível enviar a foto.")}finally{setBusy(!1)}
  };
  const remove=async()=>{setBusy(!0);try{await __avJson("/avatar",{method:"DELETE"});await reload();setOpen(!1)}catch(e){setErr(e?.message||"Erro ao remover.")}finally{setBusy(!1)}};
  return(0,q.jsx)(dl,{open,title:"Foto de perfil",onClose:()=>setOpen(!1),footer:(0,q.jsx)("button",{className:"btn",onClick:()=>setOpen(!1),children:"Fechar"}),
    children:(0,q.jsxs)("div",{style:{display:"flex",flexDirection:"column",alignItems:"center",gap:12},children:[
      (0,q.jsx)("div",{className:"av-big",children:(0,q.jsx)(AvPhoto,{id:me,name:Wi.userName||"?",size:120})}),
      (0,q.jsx)("p",{className:"small muted",style:{textAlign:"center"},children:"A foto aparece para a equipe em “Equipe agora” e no seu perfil. Ela é recortada em quadrado e reduzida automaticamente."}),
      (0,q.jsxs)("label",{className:"btn primary",style:{cursor:"pointer"},children:[busy?"Enviando…":"Escolher foto",(0,q.jsx)("input",{type:"file",accept:"image/jpeg,image/png,image/webp",hidden:!0,disabled:busy,onChange:e=>{pick(e.target.files&&e.target.files[0]);e.target.value=""}})]}),
      p&&p.av>0&&(0,q.jsx)("button",{className:"btn ghost",disabled:busy,onClick:remove,children:"Remover foto"}),
      err&&(0,q.jsx)("p",{className:"gate-error",role:"alert",children:err})]})});
}


/* ===== ícones de linha (sem emojis) ===== */
const __avPaths={
  edit:["M12 20h9","M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"],
  trash:["M3 6h18","M8 6V4h8v2","M19 6l-1 14H6L5 6","M10 11v6","M14 11v6"],
  clip:["M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"],
  send:["M22 2L11 13","M22 2l-7 20-4-9-9-4 20-7z"],
  file:["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z","M14 2v6h6"],
  chat:["M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"],
  smile:["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z","M8 14s1.5 2 4 2 4-2 4-2","M9 9h.01","M15 9h.01"],
  mic:["M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z","M19 10v2a7 7 0 0 1-14 0v-2","M12 19v3"],
  stop:["M6 6h12v12H6z"],
  x:["M18 6L6 18","M6 6l12 12"]
};
function AvIcon({n,s}){return(0,q.jsx)("svg",{width:s||16,height:s||16,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"1.9",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":!0,children:__avPaths[n].map((d,i)=>(0,q.jsx)("path",{d},i))})}

/* ===== Conversas (estilo Teams) ===== */
const __avCS={data:null,subs:new Set(),timer:null};
async function __avCSLoad(){try{const d=await __avJson("/chat");__avCS.data=d;__avCS.subs.forEach(f=>f())}catch{}}
function useChatSummary(){
  const[,tick]=x.useState(0);
  x.useEffect(()=>{
    const f=()=>tick(n=>n+1);__avCS.subs.add(f);
    if(!__avCS.timer){__avCSLoad();__avCS.timer=setInterval(()=>{if(document.visibilityState==="visible")__avCSLoad()},6000)}else if(__avCS.data)f();
    return()=>{__avCS.subs.delete(f);if(!__avCS.subs.size&&__avCS.timer){clearInterval(__avCS.timer);__avCS.timer=null}};
  },[]);
  return{peers:(__avCS.data&&__avCS.data.peers)||{},reload:__avCSLoad};
}
const __avSize=b=>b<1024?b+" B":b<1048576?(b/1024).toFixed(0)+" KB":b<1073741824?(b/1048576).toFixed(1)+" MB":(b/1073741824).toFixed(2)+" GB";
const __avClock=ms=>{const d=new Date(ms),h=new Date().toDateString()===d.toDateString();return h?d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}):d.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"})+" "+d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})};
async function __avSendFile(peer,file,onProg){
  const CH=4*1024*1024,n=Math.max(1,Math.ceil(file.size/CH));
  const{id}=await __avJson("/chat/upload",{method:"POST",body:{peer,name:file.name,type:file.type||"application/octet-stream",size:file.size,chunks:n}});
  for(let i=0;i<n;i++){
    const buf=new Uint8Array(await file.slice(i*CH,(i+1)*CH).arrayBuffer());
    let tries=0;
    for(;;){try{await __avJson("/chat/upload/"+id+"/"+i,{method:"PUT",body:buf});break}catch(e){if(++tries>3||(e&&e.status&&e.status<500&&e.status!==0))throw e;await new Promise(r=>setTimeout(r,800*tries))}}
    onProg&&onProg((i+1)/n);
  }
  return id;
}

function AvMsgFile({f,mine}){
  const url=location.origin+"/api/chat/file/"+f.id; /* URL absoluta: o app intercepta links que começam com /api/ */
  if(/^audio\//.test(f.type))return(0,q.jsxs)("div",{className:"avc-audio",children:[(0,q.jsx)("audio",{controls:!0,preload:"metadata",src:url}),(0,q.jsx)("a",{href:url+"?download=1",download:f.name,className:"avc-dl",children:"baixar"})]});
  if(/^image\/(png|jpeg|gif|webp)$/.test(f.type))return(0,q.jsx)("a",{href:url,target:"_blank",rel:"noopener",children:(0,q.jsx)("img",{className:"avc-img",src:url,alt:f.name})});
  return(0,q.jsxs)("a",{className:"avc-file",href:url+"?download=1",download:f.name,title:"Baixar "+f.name,children:[(0,q.jsx)("span",{className:"avc-ico","aria-hidden":!0,children:(0,q.jsx)(AvIcon,{n:"file",s:20})}),(0,q.jsxs)("span",{className:"avc-fn",children:[(0,q.jsx)("strong",{children:f.name}),(0,q.jsx)("small",{children:__avSize(f.size)+" · baixar"})]})]});
}

function AvThread({peer,onBack}){
  const me=window.__avUid;
  const{people}=usePresence();
  const{reload}=useChatSummary();
  const who=people&&people.find(p=>p.id===peer);
  const[msgs,setMsgs]=x.useState([]),[text,setText]=x.useState(""),[up,setUp]=x.useState(null),[err,setErr]=x.useState("");
  const[edit,setEdit]=x.useState(null);const taRef=x.useRef(null),[rec,setRec]=x.useState(null);
  const startRec=async()=>{
    setErr("");
    if(!navigator.mediaDevices||!window.MediaRecorder){setErr("Este navegador não grava áudio.");return}
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:!0});
      const mime=["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg"].find(m=>MediaRecorder.isTypeSupported&&MediaRecorder.isTypeSupported(m))||"";
      const mr=new MediaRecorder(stream,mime?{mimeType:mime}:void 0),chunks=[];
      mr.ondataavailable=e=>e.data&&e.data.size&&chunks.push(e.data);
      const r={mr,stream,chunks,t0:Date.now(),send:!1};
      mr.onstop=async()=>{stream.getTracks().forEach(z=>z.stop());setRec(null);
        if(!r.send||!chunks.length)return;
        const type=(mr.mimeType||mime||"audio/webm").split(";")[0],ext=type.includes("mp4")?"m4a":type.includes("ogg")?"ogg":"webm";
        const d=new Date(),name="Mensagem de voz "+String(d.getHours()).padStart(2,"0")+"h"+String(d.getMinutes()).padStart(2,"0")+"."+ext;
        await sendFiles([new File(chunks,name,{type})]);
      };
      mr.start(250);setRec(r);
    }catch(e){setErr(e&&e.name==="NotAllowedError"?"Permita o uso do microfone no navegador (cadeado ao lado do endereço) para gravar.":"Não foi possível acessar o microfone.")}
  };
  const stopRec=send=>{if(!rec)return;rec.send=send;try{rec.mr.stop()}catch{}};
  x.useEffect(()=>()=>{if(rec){rec.send=!1;try{rec.mr.stop()}catch{}}},[rec]);
  const last=x.useRef(0),box=x.useRef(null),stick=x.useRef(!0),fileIn=x.useRef(null);
  const sig=x.useRef("");
  const pull=x.useCallback(async()=>{
    try{
      const r=await __avJson("/chat/"+peer+"?read=1");
      const s=r.msgs.map(z=>z.id+":"+(z.edited||0)).join(",");
      if(s!==sig.current){sig.current=s;setMsgs(r.msgs);reload()}
    }catch{}
  },[peer]);
  x.useEffect(()=>{window.__avChatPeer=peer;return()=>{if(window.__avChatPeer===peer)window.__avChatPeer=null}},[peer]);
  x.useEffect(()=>{sig.current="";setMsgs([]);setEdit(null);pull();const t=setInterval(()=>{if(document.visibilityState==="visible")pull()},3000);return()=>clearInterval(t)},[peer]);
  x.useEffect(()=>{const b=box.current;if(b&&stick.current)b.scrollTop=b.scrollHeight},[msgs,up]);
  const send=async(t,fid)=>{
    const r=await __avJson("/chat/"+peer,{method:"POST",body:{text:t,...(fid?{file:{id:fid}}:{})}});
    last.current=Math.max(last.current,r.msg.at);stick.current=!0;
    setMsgs(m=>m.some(z=>z.id===r.msg.id)?m:[...m,r.msg]);reload();
  };
  const sendText=async e=>{e&&e.preventDefault();const t=text.trim();if(!t&&!edit)return;setErr("");
    if(edit){try{await __avJson("/chat/"+peer+"/"+edit.id,{method:"PATCH",body:{text:t}});setEdit(null);setText("");sig.current="";await pull()}catch(x2){setErr(x2?.message||"Não foi possível editar.")}return}
    setText("");try{await send(t)}catch(x2){setText(t);setErr(x2?.message||"Não foi possível enviar.")}};
  const del=async m=>{if(!confirm("Apagar esta mensagem para os dois? Não dá para desfazer."))return;try{await __avJson("/chat/"+peer+"/"+m.id,{method:"DELETE"});sig.current="";if(edit&&edit.id===m.id){setEdit(null);setText("")}await pull()}catch(x2){setErr(x2?.message||"Não foi possível apagar.")}};
  const sendFiles=async files=>{
    setErr("");
    for(const f of files){
      if(!f.size){setErr("“"+f.name+"” está vazio.");continue}
      try{setUp({name:f.name,p:0});const fid=await __avSendFile(peer,f,p=>setUp({name:f.name,p}));await send("",fid)}
      catch(x2){setErr("Falha ao enviar “"+f.name+"”: "+(x2?.message||"tente de novo."))}
    }
    setUp(null);
  };
  return(0,q.jsxs)("div",{className:"avc-thread",onDragOver:e=>e.preventDefault(),onDrop:e=>{e.preventDefault();e.dataTransfer.files.length&&sendFiles([...e.dataTransfer.files])},children:[
    (0,q.jsxs)("header",{className:"avc-head",children:[(0,q.jsx)("button",{className:"avc-x",onClick:onBack,"aria-label":"Voltar às conversas",children:"‹"}),
      (0,q.jsxs)("span",{className:"avo-face",children:[(0,q.jsx)(AvPhoto,{id:peer,name:who?who.name:"?",size:34}),(0,q.jsx)("i",{className:"avo-dot"+(who&&who.online?" on":"")})]}),
      (0,q.jsxs)("span",{className:"avc-who",children:[(0,q.jsx)("strong",{children:who?who.name:"Conversa"}),(0,q.jsx)("small",{children:who&&who.online?"Online agora":"Offline"})]})]}),
    (0,q.jsxs)("div",{className:"avc-msgs",ref:box,onScroll:e=>{const b=e.target;stick.current=b.scrollHeight-b.scrollTop-b.clientHeight<60},children:[
      msgs.length===0&&(0,q.jsx)("p",{className:"avc-empty",children:"Diga olá! Você também pode arrastar arquivos para cá."}),
      msgs.map(m=>(0,q.jsxs)("div",{className:"avc-row"+(m.from===me?" mine":""),children:[
        m.from===me&&(0,q.jsxs)("span",{className:"avc-act",children:[(m.text||!m.file)&&(0,q.jsx)("button",{type:"button",title:"Editar mensagem","aria-label":"Editar mensagem",onClick:()=>{setEdit(m);setText(m.text||"")},children:(0,q.jsx)(AvIcon,{n:"edit",s:15})}),(0,q.jsx)("button",{type:"button",title:"Apagar mensagem","aria-label":"Apagar mensagem",onClick:()=>del(m),children:(0,q.jsx)(AvIcon,{n:"trash",s:15})})]}),
        (0,q.jsxs)("div",{className:"avc-bub",children:[m.file&&(0,q.jsx)(AvMsgFile,{f:m.file,mine:m.from===me}),m.text&&(0,q.jsx)("span",{className:"avc-txt",children:m.text}),(0,q.jsx)("time",{children:(m.edited?"editada · ":"")+__avClock(m.at)})]})]},m.id)),
      up&&(0,q.jsxs)("div",{className:"avc-row mine",children:[(0,q.jsxs)("div",{className:"avc-bub avc-up",children:["Enviando "+up.name+"… "+Math.round(up.p*100)+"%",(0,q.jsx)("i",{style:{width:Math.round(up.p*100)+"%"}})]})]})]}),
    err&&(0,q.jsx)("p",{className:"avc-err",role:"alert",children:err}),
    edit&&(0,q.jsxs)("p",{className:"avc-editing",children:["Editando mensagem ",(0,q.jsx)("button",{type:"button",onClick:()=>{setEdit(null);setText("")},children:"cancelar"})]}),
    (0,q.jsxs)("form",{className:"avc-form",onSubmit:sendText,children:[
      (0,q.jsx)("button",{type:"button",className:"avc-clip",title:"Anexar arquivos de qualquer tipo e tamanho",onClick:()=>fileIn.current&&fileIn.current.click(),"aria-label":"Anexar arquivo",children:(0,q.jsx)(AvIcon,{n:"clip",s:18})}),
      (0,q.jsx)("input",{ref:fileIn,type:"file",multiple:!0,hidden:!0,onChange:e=>{const fl=[...e.target.files];e.target.value="";fl.length&&sendFiles(fl)}}),
      (0,q.jsx)(AvEmoji,{onPick:em=>{const ta=taRef.current;if(!ta){setText(s=>s+em);return}const a=ta.selectionStart??text.length,b=ta.selectionEnd??text.length;const nv=text.slice(0,a)+em+text.slice(b);setText(nv);requestAnimationFrame(()=>{ta.focus();ta.selectionStart=ta.selectionEnd=a+em.length})}}),
      rec?(0,q.jsx)(AvRecBar,{rec,onCancel:()=>stopRec(!1),onSend:()=>stopRec(!0)}):(0,q.jsx)("textarea",{ref:taRef,value:text,rows:1,placeholder:"Escreva uma mensagem",maxLength:4000,"aria-label":"Mensagem",onChange:e=>setText(e.target.value),onKeyDown:e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendText()}}}),
      !rec&&(text.trim()?(0,q.jsx)("button",{type:"submit",className:"avc-send","aria-label":"Enviar",children:(0,q.jsx)(AvIcon,{n:"send",s:17})}):(0,q.jsx)("button",{type:"button",className:"avc-send avc-mic",title:"Gravar mensagem de voz","aria-label":"Gravar mensagem de voz",onClick:startRec,children:(0,q.jsx)(AvIcon,{n:"mic",s:18})}))]})]});
}

function AvChat(){
  const[open,setOpen]=x.useState(!1),[peer,setPeer]=x.useState(null);
  const{people}=usePresence();
  const{peers}=useChatSummary();
  const[qs,setQs]=x.useState("");
  x.useEffect(()=>{const f=e=>{setPeer((e.detail&&e.detail.peer)||null);setOpen(!0)};window.addEventListener("prumo:chat",f);return()=>window.removeEventListener("prumo:chat",f)},[]);
  if(!open)return null;
  const me=window.__avUid;
  const list=(people||[]).filter(p=>p.id!==me&&p.name.toLowerCase().includes(qs.toLowerCase())).sort((a,b)=>{
    const la=peers[a.id]?peers[a.id].last.at:0,lb=peers[b.id]?peers[b.id].last.at:0;
    return lb-la||(b.online-a.online)||a.name.localeCompare(b.name,"pt-BR")});
  return(0,q.jsxs)("section",{className:"avc-panel",role:"dialog","aria-label":"Conversas",children:[
    peer?(0,q.jsx)(AvThread,{peer,onBack:()=>setPeer(null)}):
    (0,q.jsxs)("div",{className:"avc-list",children:[
      (0,q.jsx)("header",{className:"avc-head",children:(0,q.jsx)("strong",{style:{flex:1},children:"Conversas"})}),
      (0,q.jsx)("input",{className:"input avc-search",placeholder:"Buscar pessoa…","aria-label":"Buscar pessoa",value:qs,onChange:e=>setQs(e.target.value)}),
      (0,q.jsxs)("ul",{children:[list.map(p=>{const s=peers[p.id];return(0,q.jsx)("li",{children:(0,q.jsxs)("button",{className:"avc-item",onClick:()=>setPeer(p.id),children:[
        (0,q.jsxs)("span",{className:"avo-face",children:[(0,q.jsx)(AvPhoto,{id:p.id,name:p.name,size:38}),(0,q.jsx)("i",{className:"avo-dot"+(p.online?" on":"")})]}),
        (0,q.jsxs)("span",{className:"avc-who",children:[(0,q.jsx)("strong",{children:p.name}),(0,q.jsx)("small",{children:s?((s.last.from===me?"Você: ":"")+(s.last.file?"Arquivo: "+s.last.file:s.last.text)):(p.online?"Online":"Offline")})]}),
        s&&s.unread>0&&(0,q.jsx)("b",{className:"avc-badge",children:s.unread})]})},p.id)}),list.length===0&&(0,q.jsx)("li",{className:"small muted",style:{padding:12},children:"Ninguém encontrado."})]})]}),
    (0,q.jsx)("button",{className:"avc-close",onClick:()=>setOpen(!1),"aria-label":"Fechar conversas",children:"×"})]});
}

/* ===== Paletas de cores prontas (cada pessoa escolhe a sua) ===== */
/* ===== Estilos de cor em gradiente — cada um funciona no modo claro E no escuro =====
   A pessoa escolhe só as 2 cores do gradiente; fundo, cartões e letras são calculados
   a partir do modo (claro fica claro, escuro fica escuro) e com contraste garantido. */
const __avThemes=[
  {key:"padrao",name:"Padrão Zênite",a:"#2563eb",b:"#f5b301",tip:"Azul com amarelo"},
  {key:"aurora",name:"Aurora boreal",a:"#0ea5a4",b:"#6366f1",tip:"Verde-água para índigo"},
  {key:"porsol",name:"Pôr do sol",a:"#f97316",b:"#e11d74",tip:"Laranja para rosa"},
  {key:"oceano",name:"Oceano",a:"#1d4ed8",b:"#06b6d4",tip:"Azul para ciano"},
  {key:"floresta",name:"Floresta",a:"#047857",b:"#84cc16",tip:"Esmeralda para lima"},
  {key:"ametista",name:"Ametista",a:"#7c3aed",b:"#db2777",tip:"Violeta para magenta"},
  {key:"grafite",name:"Grafite",a:"#475569",b:"#3b82f6",tip:"Cinza com azul, discreto"}
];
const __avPalettes=__avThemes;
const __avHex=h=>/^#[0-9a-f]{6}$/i.test(h||"");
const __avRgb=h=>[1,3,5].map(i=>parseInt(h.substr(i,2),16));
const __avToHex=c=>"#"+c.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,"0")).join("");
const __avMix=(a,b,w)=>{const x1=__avRgb(a),x2=__avRgb(b);return __avToHex(x1.map((v,i)=>v*w+x2[i]*(1-w)))};
function __avLum(h){if(!__avHex(h))return 0;const c=__avRgb(h).map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)});return .2126*c[0]+.7152*c[1]+.0722*c[2]}
function __avContrast(a,b){const x1=__avLum(a)+.05,x2=__avLum(b)+.05;return x1>x2?x1/x2:x2/x1}
function __avInk(l,dark){
  const root=document.documentElement,st=root.style;
  const A=__avHex(l.accent)?l.accent:"#2563eb",B=__avHex(l.accent2)?l.accent2:"#f5b301";
  let bg,card,h1,h2;
  if(dark){bg=__avMix(A,"#0a0b0e",.06);card=__avMix(A,"#16181c",.07);h1=__avMix(A,"#000000",.62);h2=__avMix(B,"#000000",.5)}
  else{bg=__avMix(A,"#f6f7fa",.05);card="#ffffff";h1=__avMix(A,"#000000",.92);h2=__avMix(__avMix(A,B,.45),"#000000",.92)}
  const heroLight=Math.max(__avLum(h1),__avLum(h2))>.42;
  const ci=dark?["#eef0f4","#b7bbc5","#868b96"]:["#14161b","#454a55","#6b717d"];
  const hi=heroLight?["#14161b","#2f333b"]:["#ffffff","#ffffffcc"];
  [["--avbg",bg],["--avcard",card],["--avhero",h1],["--avhero1",h1],["--avhero2",h2],["--avink",ci[0]],["--avink2",ci[1]],["--avink3",ci[2]],["--avbgink",ci[0]],["--avbgink2",ci[1]],["--avheroink",hi[0]],["--avheroink2",hi[1]]].forEach(([k,v])=>st.setProperty(k,v));
  root.classList.add("av-themed");
  root.classList.toggle("av-cardlight",!dark);
  root.classList.toggle("av-herolight",heroLight);
}
function AvPalettes({n,r}){
  const pick=p=>r({palette:p.key,accent:p.a,accent2:p.b});
  const A=__avHex(n.accent)?n.accent:"#2563eb",B=__avHex(n.accent2)?n.accent2:"#f5b301";
  return(0,q.jsxs)("section",{className:"pz-sec",children:[(0,q.jsx)("h3",{children:"Estilo de cores"}),
    (0,q.jsx)("p",{className:"small muted",style:{margin:"-4px 0 10px"},children:"Cada estilo é um gradiente de duas cores e funciona no modo claro e no escuro (botão de lua/sol no topo). As letras ajustam o contraste sozinhas. Vale só para você."}),
    (0,q.jsx)("div",{className:"avth-grid",children:__avThemes.map(p=>(0,q.jsxs)("button",{className:"avth"+(n.palette===p.key?" on":""),"aria-pressed":n.palette===p.key,onClick:()=>pick(p),children:[
      (0,q.jsx)("span",{className:"avth-grad",style:{background:"linear-gradient(135deg,"+p.a+","+p.b+")"}}),
      (0,q.jsxs)("span",{className:"avth-modes",children:[(0,q.jsxs)("i",{className:"lt",children:[(0,q.jsx)("b",{style:{background:"linear-gradient(135deg,"+__avMix(p.a,"#000000",.92)+","+__avMix(__avMix(p.a,p.b,.45),"#000000",.92)+")"}}),"Claro"]}),(0,q.jsxs)("i",{className:"dk",children:[(0,q.jsx)("b",{style:{background:"linear-gradient(135deg,"+__avMix(p.a,"#000000",.62)+","+__avMix(p.b,"#000000",.5)+")"}}),"Escuro"]})]}),
      (0,q.jsxs)("span",{className:"avth-name",children:[(0,q.jsx)("strong",{children:p.name}),(0,q.jsx)("small",{children:p.tip})]})]},p.key))}),
    (0,q.jsxs)("div",{className:"avth-own",children:[(0,q.jsx)("strong",{children:"Monte o seu gradiente"}),
      (0,q.jsxs)("div",{className:"avp-custom",children:[
        [["accent","Cor 1",A],["accent2","Cor 2",B]].map(([k,l,v])=>(0,q.jsxs)("label",{className:"avp-pick",children:[(0,q.jsx)("input",{type:"color","aria-label":l,value:v,onChange:e=>r({[k]:e.target.value,palette:"custom"})}),(0,q.jsx)("span",{children:l})]},k)),
        (0,q.jsx)("span",{className:"avth-prev",style:{background:"linear-gradient(135deg,"+A+","+B+")"}}),
        (0,q.jsx)("button",{type:"button",className:"btn sm ghost",onClick:()=>pick(__avThemes[0]),children:"Voltar ao padrão"})]})]})]});
}

/* ===== Animação ao trocar entre modo claro e escuro =====
   Leve: um único círculo animado só com transform/opacity (roda na GPU, sem recalcular o layout
   nem tirar "foto" da página), que cobre a troca de cores e some em seguida. */
(function(){
  if(typeof document==="undefined")return;
  document.addEventListener("click",e=>{
    const b=e.target&&e.target.closest?e.target.closest('button[aria-label^="Ativar modo"]'):null;
    if(!b)return;
    if(window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches)return;
    const toDark=/escuro/.test(b.getAttribute("aria-label")||"");
    const r=b.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
    const rad=Math.ceil(Math.hypot(Math.max(cx,innerWidth-cx),Math.max(cy,innerHeight-cy)));
    const old=document.querySelector(".av-wave");old&&old.remove();
    const ov=document.createElement("div");
    ov.className="av-wave";
    ov.style.cssText="width:"+rad*2+"px;height:"+rad*2+"px;left:"+(cx-rad)+"px;top:"+(cy-rad)+"px;background:"+(toDark?"#0b0c18":"#f4f6fb");
    document.documentElement.classList.add("av-switching");
    document.body.appendChild(ov);
    const kill=()=>{ov.remove();document.documentElement.classList.remove("av-switching")};
    ov.addEventListener("animationend",kill);
    setTimeout(kill,1200);
  },!0);
})();

/* ===== Notificações: novas tarefas da equipe e novas mensagens ===== */
function __avDing(){
  try{const A=window.AudioContext||window.webkitAudioContext;if(!A)return;const c=__avDing.c||(__avDing.c=new A());
    const o=c.createOscillator(),g=c.createGain();o.type="sine";o.frequency.setValueAtTime(880,c.currentTime);o.frequency.exponentialRampToValueAtTime(1320,c.currentTime+.12);
    g.gain.setValueAtTime(.0001,c.currentTime);g.gain.exponentialRampToValueAtTime(.08,c.currentTime+.02);g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+.35);
    o.connect(g).connect(c.destination);o.start();o.stop(c.currentTime+.36)}catch{}
}
function __avNotify(title,body,onClick,tag){
  try{
    if(window.Notification&&Notification.permission==="granted"&&(document.visibilityState!=="visible"||!document.hasFocus())){
      const n=new Notification(title,{body,tag,icon:"/favicon.ico",silent:!1});
      n.onclick=()=>{window.focus();onClick&&onClick();n.close()};
    }
  }catch{}
  window.dispatchEvent(new CustomEvent("prumo:notify",{detail:{title,body,onClick}}));
  __avDing();
}
function AvNotifier(){
  const{peers}=useChatSummary();
  const{people}=usePresence();
  const prev=x.useRef(null);
  const[toasts,setToasts]=x.useState([]);
  const nav=ir();
  /* mensagens */
  x.useEffect(()=>{
    const me=window.__avUid;if(!me||!__avCS.data)return;
    const cur={};for(const[k,v]of Object.entries(peers))cur[k]=v.unread;
    if(prev.current){
      for(const[k,n]of Object.entries(cur)){
        const before=prev.current[k]||0;
        if(n>before){
          const open=window.__avChatPeer===k&&document.visibilityState==="visible";
          if(open)continue;
          const who=(people||[]).find(p=>p.id===k);const l=peers[k].last;
          __avNotify("Nova mensagem de "+(who?who.name:"um colega"),l.file?"Arquivo: "+l.file:l.text,()=>window.dispatchEvent(new CustomEvent("prumo:chat",{detail:{peer:k}})),"chat-"+k);
        }
      }
    }
    prev.current=cur;
    const total=Object.values(cur).reduce((s,v)=>s+v,0);
    const base=document.title.replace(/^\(\d+\)\s*/,"");document.title=total?"("+total+") "+base:base;
  },[peers]);
  /* tarefas da equipe */
  x.useEffect(()=>{
    let tag="",stop=!1;const me=window.__avUid;if(!me)return;
    const key="av:seenTasks:"+me;
    let seen=null;try{seen=new Set(JSON.parse(localStorage.getItem(key)||"null")||[])}catch{seen=null}
    const save=()=>{try{localStorage.setItem(key,JSON.stringify([...seen].slice(-3000)))}catch{}};
    const tick=async()=>{
      if(stop||document.visibilityState==="hidden"&&Math.random()<.5)return;
      try{
        const res=await __avFetch("/shared-tasks",{headers:tag?{"if-none-match":tag}:{}});
        if(res.status===304||!res.ok)return;
        const j=await res.json();tag=j.tag;
        if(!seen){seen=new Set(j.tasks.map(t=>t.id));save();return}
        const fresh=j.tasks.filter(t=>!seen.has(t.id));
        fresh.forEach(t=>seen.add(t.id));if(fresh.length)save();
        for(const t of fresh.filter(t=>t.owner!==me).slice(0,5)){
          const mine=t.assignee===me;
          __avNotify(mine?(t.owner_name||"Alguém")+" atribuiu uma tarefa a você":"Nova tarefa da equipe",t.title+(t.due_date?" · prazo "+t.due_date.split("-").reverse().join("/"):""),()=>nav("/tarefas-equipe"),"task-"+t.id);
        }
      }catch{}
    };
    tick();const iv=setInterval(tick,20000);
    return()=>{stop=!0;clearInterval(iv)};
  },[]);
  /* avisos dentro do site (canto inferior) */
  x.useEffect(()=>{
    const f=e=>{const id=Math.random().toString(36).slice(2);setToasts(a=>[...a.slice(-2),{id,...e.detail}]);setTimeout(()=>setToasts(a=>a.filter(z=>z.id!==id)),7000)};
    window.addEventListener("prumo:notify",f);return()=>window.removeEventListener("prumo:notify",f);
  },[]);
  return(0,q.jsx)("div",{className:"avn-stack","aria-live":"polite",children:toasts.map(t=>(0,q.jsxs)("button",{className:"avn-toast",onClick:()=>{t.onClick&&t.onClick();setToasts(a=>a.filter(z=>z.id!==t.id))},children:[
    (0,q.jsx)("span",{className:"avn-ico",children:(0,q.jsx)(AvIcon,{n:/mensagem/i.test(t.title)?"chat":"file",s:18})}),
    (0,q.jsxs)("span",{className:"avn-txt",children:[(0,q.jsx)("strong",{children:t.title}),(0,q.jsx)("small",{children:t.body})]})]},t.id))});
}
/* convite para ativar as notificações do navegador */
function AvNotifyAsk(){
  const has=typeof window!=="undefined"&&"Notification"in window;
  const[st,setSt]=x.useState(has?Notification.permission:"unsupported");
  const[hide,setHide]=x.useState(()=>{try{return localStorage.getItem("av:notifyAsk")==="no"}catch{return!1}});
  x.useEffect(()=>{const f=()=>{if(has)Notification.requestPermission().then(setSt)};window.addEventListener("prumo:notifyask",f);return()=>window.removeEventListener("prumo:notifyask",f)},[]);
  if(!has||st!=="default"||hide)return null;
  return(0,q.jsxs)("div",{className:"avn-ask",children:[(0,q.jsx)("span",{className:"avn-ico",children:(0,q.jsx)(AvIcon,{n:"chat",s:18})}),
    (0,q.jsx)("span",{children:"Receba aviso de novas tarefas da equipe e de mensagens, mesmo com o Zênite em outra aba."}),
    (0,q.jsx)("button",{className:"btn sm primary",onClick:()=>Notification.requestPermission().then(setSt),children:"Ativar notificações"}),
    (0,q.jsx)("button",{className:"btn sm ghost",onClick:()=>{try{localStorage.setItem("av:notifyAsk","no")}catch{}setHide(!0)},children:"Agora não"})]});
}


/* ---- Seletor de emojis e barra de gravação de voz (chat) ---- */
const __avEmojis="😀 😂 😊 😍 🥰 😎 🤔 😅 😢 😭 😡 😴 🙏 👍 👎 👏 🙌 💪 👀 🤝 ✅ ❌ ⚠️ ❤️ 💙 💛 🔥 ⭐ 🎉 🚀 📌 📎 📅 ⏰ 📊 📝 💡 ☕ 🍕 🎂".split(" ");
function AvEmoji({onPick}){
  const[open,setOpen]=x.useState(!1),box=x.useRef(null);
  x.useEffect(()=>{if(!open)return;const f=e=>{box.current&&!box.current.contains(e.target)&&setOpen(!1)};document.addEventListener("mousedown",f);return()=>document.removeEventListener("mousedown",f)},[open]);
  return(0,q.jsxs)("div",{className:"avc-emo",ref:box,children:[
    (0,q.jsx)("button",{type:"button",className:"avc-clip",title:"Emojis","aria-label":"Inserir emoji","aria-expanded":open,onClick:()=>setOpen(o=>!o),children:(0,q.jsx)(AvIcon,{n:"smile",s:18})}),
    open&&(0,q.jsx)("div",{className:"avc-emo-pop",role:"listbox","aria-label":"Emojis",children:__avEmojis.map(e=>(0,q.jsx)("button",{type:"button",role:"option",onClick:()=>{onPick(e)},children:e},e))})]});
}
function AvRecBar({rec,onCancel,onSend}){
  const[,tick]=x.useState(0);
  x.useEffect(()=>{const t=setInterval(()=>tick(n=>n+1),500);return()=>clearInterval(t)},[]);
  const s=Math.floor((Date.now()-rec.t0)/1000);
  return(0,q.jsxs)("div",{className:"avc-rec",role:"status",children:[
    (0,q.jsx)("button",{type:"button",className:"avc-clip",title:"Cancelar gravação","aria-label":"Cancelar gravação",onClick:onCancel,children:(0,q.jsx)(AvIcon,{n:"x",s:17})}),
    (0,q.jsx)("i",{className:"avc-rec-dot"}),(0,q.jsx)("span",{children:"Gravando "+Math.floor(s/60)+":"+String(s%60).padStart(2,"0")}),
    (0,q.jsx)("button",{type:"button",className:"avc-send",title:"Parar e enviar","aria-label":"Parar e enviar áudio",onClick:onSend,children:(0,q.jsx)(AvIcon,{n:"send",s:17})})]});
}

/* ===== Agenda de hoje: compromissos + tarefas que vencem hoje (minhas e da equipe) ===== */
function AvAgendaToday({events,mine,today,go}){
  const{tasks,me}=useAvTasks();
  const openTask=_l();
  const items=[];
  (events||[]).forEach(e=>items.push({k:"e"+e.id,time:e.all_day?"":fa(e.start_at),title:e.title,sub:e.location||"",tag:"Compromisso",cls:"ev",onClick:()=>go("/agenda?evento="+e.id)}));
  (mine||[]).forEach(t=>items.push({k:"t"+t.id,time:t.due_time||"",title:t.title,sub:t.project_name||"",tag:"Minha tarefa",cls:"mine",onClick:()=>openTask(t.id)}));
  (tasks||[]).filter(t=>t.due_date===today&&t.status!=="concluida"&&t.status!=="cancelada"&&(t.assignee===me||t.owner===me||!t.assignee)).forEach(t=>items.push({k:"s"+t.id,time:t.due_time||"",title:t.title,sub:t.assignee_name?"Responsável: "+t.assignee_name:"Equipe",tag:"Equipe",cls:"team",onClick:()=>go("/tarefas-equipe")}));
  items.sort((a,b)=>(a.time||"99").localeCompare(b.time||"99"));
  if(!items.length)return(0,q.jsx)("p",{className:"small muted",style:{padding:"4px 20px 16px"},children:"Nada marcado para hoje: sem compromissos nem tarefas com prazo hoje."});
  return(0,q.jsx)("ul",{className:"today-events av-agenda",children:items.map(it=>(0,q.jsxs)("li",{className:"clickable "+it.cls,onClick:it.onClick,children:[
    (0,q.jsx)("span",{className:"te-time",children:it.time||"Hoje"}),
    (0,q.jsxs)("span",{className:"ag-main",children:[(0,q.jsx)("strong",{children:it.title}),it.sub&&(0,q.jsxs)("small",{className:"muted",children:[" · ",it.sub]})]}),
    (0,q.jsx)("em",{className:"ag-tag",children:it.tag})]},it.k))});
}


/* ===== Aviso de nova versão: quando sai uma atualização, oferece recarregar ===== */
(function(){
  if(typeof document==="undefined")return;
  const mine=()=>{const m=document.querySelector('meta[name="av-build"]');return m?m.content:""};
  let shown=!1;
  const check=async()=>{
    if(shown||document.visibilityState!=="visible")return;
    try{
      const r=await fetch("/?v="+Date.now(),{cache:"no-store",credentials:"same-origin"});
      const h=await r.text();const m=h.match(/<meta name="av-build" content="([0-9a-f]+)"/);
      if(m&&mine()&&m[1]!==mine()){
        shown=!0;
        const b=document.createElement("button");b.className="av-update";
        b.innerHTML="<strong>Nova versão do Zênite disponível</strong><span>Clique para atualizar</span>";
        b.onclick=()=>location.reload();document.body.appendChild(b);
      }
    }catch{}
  };
  setTimeout(check,15000);setInterval(check,90000);
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")check()});
})();
