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
  x.useEffect(()=>{let ok=!0;if(!__avDirCache||Date.now()-(window.__avDirAt||0)>20000)__avJson("/directory").then(d=>{__avDirCache=d;window.__avDirAt=Date.now();ok&&setL(d)}).catch(()=>{});return()=>{ok=!1}},[]);
  return l;
}

/* ---- tarefas da equipe: leitura com ETag e atualização a cada poucos segundos ---- */
/* uma única consulta compartilhada por todas as telas (antes cada quadro consultava sozinho a cada 4 s) */
const __avTS={st:{tasks:null,me:null,error:null},tag:"",subs:new Set(),timer:null,busy:null};
async function __avTSLoad(force){
  if(__avTS.busy&&!force)return __avTS.busy;
  const run=(async()=>{
    try{
      const res=await __avFetch("/shared-tasks",{headers:__avTS.tag&&!force?{"if-none-match":__avTS.tag}:{}});
      if(res.status===304)return;
      const j=await res.json();
      if(!res.ok)throw new AvErr(j?.message||"Não foi possível carregar as tarefas da equipe.",res.status);
      __avTS.tag=j.tag;__avTS.st={tasks:j.tasks,me:j.me,error:null};
    }catch(e){__avTS.st={...__avTS.st,error:e}}
    __avTS.subs.forEach(f=>f(__avTS.st));
  })();
  __avTS.busy=run;run.finally(()=>{if(__avTS.busy===run)__avTS.busy=null});
  return run;
}
function useAvTasks(){
  const[st,setSt]=x.useState(__avTS.st);
  x.useEffect(()=>{
    __avTS.subs.add(setSt);setSt(__avTS.st);
    __avTSLoad(!__avTS.st.tasks); /* ao abrir uma tela, confere na hora (resposta 304 é instantânea) */
    if(!__avTS.timer){
      __avTS.timer=setInterval(()=>{if(document.visibilityState==="visible")__avTSLoad(!1)},6000);
      __avTS.vis=()=>document.visibilityState==="visible"&&__avTSLoad(!1);
      document.addEventListener("visibilitychange",__avTS.vis);
    }
    return()=>{__avTS.subs.delete(setSt);if(!__avTS.subs.size){clearInterval(__avTS.timer);__avTS.timer=null;document.removeEventListener("visibilitychange",__avTS.vis)}};
  },[]);
  return{...st,reload:()=>__avTSLoad(!0)};
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
    const el=e.target&&e.target.closest&&(document.documentElement.classList.contains("av-side-compact")||innerWidth<=820)?e.target.closest(".rail-item[data-tip]"):null;
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
  const I=d=>(0,q.jsx)("svg",{viewBox:"0 0 24 24",width:18,height:18,fill:"none",stroke:"currentColor",strokeWidth:2.2,strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":!0,children:(0,q.jsx)("path",{d})});
  const cats=[
    {k:"done",label:"Concluídas",sub:"finalizadas hoje",n:L.done.length,c:"var(--accent)",ico:"M5 12.5l4.2 4.2L19 7",tips:L.done},
    {k:"todo",label:"A fazer hoje",sub:"pendentes para hoje",n:L.todo.length,c:"#f59e0b",ico:"M12 7v5l3 2M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18z",tips:L.todo},
    {k:"late",label:"Atrasadas",sub:"passaram do prazo",n:L.late.length,c:"#ef4444",ico:"M12 7.5v5.5M12 16.5h.01M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18z",tips:L.late},
    {k:"wait",label:"Aguardando terceiros",sub:"dependem de outra pessoa",n:waiting||0,c:"#64748b",ico:"M10 9v6M14 9v6M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18z",tips:[]}
  ];
  const sum=cats.reduce((a,c)=>a+c.n,0);
  const totalDay=L.done.length+L.todo.length+L.late.length;
  const pct=totalDay?Math.round(100*L.done.length/totalDay):0;
  const[hv,setHv]=x.useState(null),[go,setGo]=x.useState(!1);
  const nav=ir();
  x.useEffect(()=>{const t=setTimeout(()=>setGo(!0),60);return()=>clearTimeout(t)},[]);
  /* cada bloco leva para a área de origem */
  const dest={done:"/pendencias?status=concluida&include_closed=1",late:"/pendencias?due=atrasadas",wait:"/terceiros"};
  const open=k=>{if(dest[k])return nav(dest[k]);const el=document.querySelector(".day-list-card");if(el){el.scrollIntoView({behavior:"smooth",block:"start"});el.classList.remove("avd4-flash");void el.offsetWidth;el.classList.add("avd4-flash")}};
  const hint={done:"Ver tarefas concluídas",todo:"Ir para Meu dia",late:"Ver tarefas atrasadas",wait:"Ir para Aguardando Terceiros"};
  return (0,q.jsxs)("section",{className:"avd4","aria-label":"Seu dia em números",children:[
    (0,q.jsxs)("header",{className:"avd4-hd",children:[(0,q.jsxs)("div",{children:[(0,q.jsx)("h2",{children:"Seu dia em números"}),(0,q.jsx)("p",{children:"Resumo das suas atividades de hoje"})]}),(0,q.jsx)("span",{className:"avd4-chip",children:"Hoje"})]}),
    (0,q.jsxs)("div",{className:"avd4-big",children:[(0,q.jsx)("b",{children:__avCount(L.done.length)}),(0,q.jsx)("span",{children:"/ "+totalDay}),(0,q.jsx)("em",{children:"concluídas · "+pct+"% do dia"})]}),
    (0,q.jsx)("div",{className:"avd4-stack",role:"img","aria-label":cats.map(c=>c.n+" "+c.label.toLowerCase()).join(", "),onMouseLeave:()=>setHv(null),children:sum?cats.filter(c=>c.n>0).map(c=>(0,q.jsx)("i",{className:"avd4-seg"+(hv&&hv!==c.k?" dim":""),style:{flexGrow:go?c.n:0,background:c.c},title:c.label+": "+c.n,onMouseEnter:()=>setHv(c.k)},c.k)):(0,q.jsx)("i",{className:"avd4-empty"})}),
    (0,q.jsx)("ul",{className:"avd4-grid",children:cats.map(c=>(0,q.jsxs)("li",{className:"avd4-card k-"+c.k+(hv===c.k?" on":""),style:{"--c":c.c},role:"button",tabIndex:0,"aria-label":c.label+": "+c.n+" — "+hint[c.k],onClick:()=>open(c.k),onKeyDown:e=>{(e.key==="Enter"||e.key===" ")&&(e.preventDefault(),open(c.k))},onMouseEnter:()=>setHv(c.k),onMouseLeave:()=>setHv(null),title:hint[c.k]+(c.tips.length?"\n\n"+c.label+":\n• "+c.tips.slice(0,8).join("\n• "):""),children:[
      (0,q.jsx)("span",{className:"avd4-ic",children:I(c.ico)}),
      (0,q.jsxs)("span",{className:"avd4-tx",children:[(0,q.jsx)("strong",{children:c.label}),(0,q.jsx)("small",{children:c.sub})]}),
      (0,q.jsx)("b",{className:"avd4-n",children:c.n}),(0,q.jsx)("svg",{className:"avd4-go",viewBox:"0 0 24 24",width:16,height:16,"aria-hidden":!0,fill:"none",stroke:"currentColor",strokeWidth:2.2,strokeLinecap:"round",strokeLinejoin:"round",children:(0,q.jsx)("path",{d:"M9 6l6 6-6 6"})})]},c.k))})]});
}

/* ---- Quem está online: faixa vertical centralizada; clicar abre a conversa ---- */
function AvOnline(){
  const{people}=usePresence();
  const{peers}=useChatSummary();
  const[,re]=x.useState(0);
  x.useEffect(()=>{const f=()=>re(n=>n+1);addEventListener("resize",f);document.documentElement.classList.add("av-has-strip");return()=>{removeEventListener("resize",f);document.documentElement.classList.remove("av-has-strip")}},[]);
  if(!people)return null;
  const me=window.__avUid;
  const list=[...people].sort((a,b)=>(b.online?1:0)-(a.online?1:0)||(a.id===me?-1:b.id===me?1:0)||a.name.localeCompare(b.name,"pt-BR"));
  const on=list.filter(p=>p.online).length;
  const open=id=>window.dispatchEvent(new CustomEvent("prumo:chat",{detail:{peer:id}}));
  const wide=innerWidth>820;
  const el=(0,q.jsxs)("aside",{className:"avo-strip avo-v2","aria-label":"Equipe online",children:[
    (0,q.jsxs)("div",{className:"avo-count",title:on+" de "+list.length+" online",children:[(0,q.jsx)("i",{}),(0,q.jsx)("b",{children:on}),(0,q.jsxs)("small",{children:["/",list.length]})]}),
    (0,q.jsx)("div",{className:"avo-list",children:list.map(p=>{const u=peers[p.id]&&peers[p.id].unread,mine=p.id===me;return(0,q.jsxs)("button",{className:"avo-face"+(p.online?" is-on":" off"),disabled:mine,onClick:()=>open(p.id),title:p.name+(mine?" (você)":" · clique para conversar")+(p.online?(p.working?" · trabalhando agora":" · online"):" · offline"),children:[(0,q.jsxs)("span",{className:"avo-ring"+(p.online?" on":""),children:[(0,q.jsx)(AvPhoto,{id:p.id,name:p.name,size:38}),(0,q.jsx)("i",{className:"avo-dot"+(p.online?" on":"")}),u>0&&(0,q.jsx)("b",{className:"avc-badge avo-unread",children:u})]}),(0,q.jsx)("small",{className:"avo-nm",children:mine?"Você":p.name.split(" ")[0]})]},p.id)})})]});
  return wide?Vi.createPortal(el,document.body):el;
}

/* ---- Anotações do dia recolhidas (menos poluição na tela inicial) ---- */
function AvNotes({children}){
  return(0,q.jsxs)("details",{className:"av-more2",children:[(0,q.jsx)("summary",{children:"Anotações do dia"}),children]});
}

/* ---- Foto de perfil: escolher, reduzir e enviar ---- */
function AvAvatarModal(){
  const[open,setOpen]=x.useState(!1),[busy,setBusy]=x.useState(!1),[err,setErr]=x.useState(""),[msg,setMsg]=x.useState("");
  const[name,setName]=x.useState(""),[prev,setPrev]=x.useState(null);
  const{people,reload}=usePresence();
  const me=window.__avUid,p=people&&people.find(z=>z.id===me);
  const curName=(p&&p.name)||Wi.userName||"";
  x.useEffect(()=>{const f=()=>{setErr("");setMsg("");setPrev(null);setName(curName);setOpen(!0)};window.addEventListener("prumo:avatar",f);return()=>window.removeEventListener("prumo:avatar",f)},[curName]);
  const pick=async file=>{
    setErr("");setMsg("");if(!file)return;
    if(!/^image\/(jpeg|png|webp)$/.test(file.type)){setErr("Use uma foto JPG, PNG ou WEBP.");return}
    try{
      const bmp=await createImageBitmap(file);
      const S=192,cv=document.createElement("canvas");cv.width=cv.height=S;
      const side=Math.min(bmp.width,bmp.height),sx=(bmp.width-side)/2,sy=(bmp.height-side)/2;
      cv.getContext("2d").drawImage(bmp,sx,sy,side,side,0,0,S,S);
      const blob=await new Promise(r=>cv.toBlob(r,"image/jpeg",.85));
      setPrev({blob,url:URL.createObjectURL(blob)});
    }catch{setErr("Não foi possível ler essa imagem.")}
  };
  const savePhoto=async()=>{if(!prev)return;setBusy(!0);setErr("");try{await __avJson("/avatar",{method:"PUT",body:new Uint8Array(await prev.blob.arrayBuffer())});await reload();setPrev(null);setMsg("Foto salva.")}catch(e){setErr(e?.message||"Não foi possível enviar a foto.")}finally{setBusy(!1)}};
  const remove=async()=>{setBusy(!0);try{await __avJson("/avatar",{method:"DELETE"});await reload();setMsg("Foto removida.")}catch(e){setErr(e?.message||"Erro ao remover.")}finally{setBusy(!1)}};
  const saveName=async()=>{setBusy(!0);setErr("");try{const r=await __avJson("/auth/name",{method:"POST",body:{name}});setMsg("Nome alterado para "+r.user.name+". A página vai recarregar.");setTimeout(()=>location.reload(),1200)}catch(e){setErr(e?.message||"Não foi possível trocar o nome.")}finally{setBusy(!1)}};
  return(0,q.jsx)(dl,{open,title:"Meu perfil",onClose:()=>setOpen(!1),footer:(0,q.jsx)("button",{className:"btn",onClick:()=>setOpen(!1),children:"Fechar"}),
    children:(0,q.jsxs)("div",{className:"avpf",children:[
      (0,q.jsxs)("section",{className:"avpf-photo",children:[
        (0,q.jsx)("div",{className:"av-big",children:prev?(0,q.jsx)("img",{className:"av-img",src:prev.url,alt:"Prévia da nova foto",style:{width:160,height:160}}):(0,q.jsx)(AvPhoto,{id:me,name:curName||"?",size:160})}),
        prev?(0,q.jsxs)(q.Fragment,{children:[(0,q.jsx)("p",{className:"small muted",children:"Assim vai aparecer para a equipe. Ficou bom?"}),
          (0,q.jsxs)("div",{className:"btn-row",children:[(0,q.jsx)("button",{className:"btn primary",disabled:busy,onClick:savePhoto,children:busy?"Salvando…":"Salvar esta foto"}),
            (0,q.jsxs)("label",{className:"btn",style:{cursor:"pointer"},children:["Escolher outra",(0,q.jsx)("input",{type:"file",accept:"image/jpeg,image/png,image/webp",hidden:!0,onChange:e=>{pick(e.target.files&&e.target.files[0]);e.target.value=""}})]}),
            (0,q.jsx)("button",{className:"btn ghost",onClick:()=>setPrev(null),children:"Cancelar"})]})]}):
        (0,q.jsxs)("div",{className:"btn-row",children:[
          (0,q.jsxs)("label",{className:"btn primary",style:{cursor:"pointer"},children:["Trocar foto",(0,q.jsx)("input",{type:"file",accept:"image/jpeg,image/png,image/webp",hidden:!0,onChange:e=>{pick(e.target.files&&e.target.files[0]);e.target.value=""}})]}),
          p&&p.av>0&&(0,q.jsx)("button",{className:"btn",onClick:()=>window.dispatchEvent(new CustomEvent("prumo:lightbox",{detail:{src:"/api/avatar/"+me+"?v="+p.av,name:"Minha foto"}})),children:"Ver em tamanho grande"}),
          p&&p.av>0&&(0,q.jsx)("button",{className:"btn ghost",disabled:busy,onClick:remove,children:"Remover foto"})]})]}),
      (0,q.jsxs)("section",{className:"avpf-name",children:[(0,q.jsxs)("label",{className:"field",children:[(0,q.jsx)("span",{children:"Nome (é também o nome para entrar no sistema)"}),(0,q.jsx)("input",{className:"input",value:name,maxLength:60,onChange:e=>setName(e.target.value),"aria-label":"Seu nome"})]}),
        (0,q.jsx)("button",{className:"btn",disabled:busy||name.trim().length<3||name.trim()===curName,onClick:saveName,children:"Salvar nome"})]}),
      msg&&(0,q.jsx)("p",{className:"avpf-ok",role:"status",children:msg}),
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
  x:["M18 6L6 18","M6 6l12 12"],
  spark:["M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z","M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"]
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
  if(/^image\/(png|jpeg|gif|webp)$/.test(f.type))return(0,q.jsx)("button",{type:"button",className:"avc-imgbtn",title:"Ver foto completa",onClick:e=>{e.preventDefault();window.dispatchEvent(new CustomEvent("prumo:lightbox",{detail:{src:url,name:f.name}}))},children:(0,q.jsx)("img",{className:"avc-img",src:url,alt:f.name})});
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
      rec?(0,q.jsx)(AvRecBar,{rec,onCancel:()=>stopRec(!1),onSend:()=>stopRec(!0)}):(0,q.jsx)("textarea",{ref:taRef,value:text,rows:1,placeholder:"Escreva uma mensagem (Ctrl+V cola fotos)",onPaste:e=>{const fl=[...(e.clipboardData&&e.clipboardData.files||[])];if(fl.length){e.preventDefault();sendFiles(fl.map((f,i)=>f.name&&f.name!=="image.png"?f:new File([f],"Imagem colada "+new Date().toLocaleTimeString("pt-BR").replace(/:/g,"-")+(i?"-"+i:"")+"."+((f.type.split("/")[1]||"png").replace("jpeg","jpg")),{type:f.type})))}},maxLength:4000,"aria-label":"Mensagem",onChange:e=>setText(e.target.value),onKeyDown:e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendText()}}}),
      !rec&&(text.trim()?(0,q.jsx)("button",{type:"submit",className:"avc-send","aria-label":"Enviar",children:(0,q.jsx)(AvIcon,{n:"send",s:17})}):(0,q.jsx)("button",{type:"button",className:"avc-send avc-mic",title:"Gravar mensagem de voz","aria-label":"Gravar mensagem de voz",onClick:startRec,children:(0,q.jsx)(AvIcon,{n:"mic",s:18})}))]})]});
}

function AvChat(){
  const[open,setOpen]=x.useState(!1),[peer,setPeer]=x.useState(null);
  const{people}=usePresence();
  const{peers}=useChatSummary();
  const[qs,setQs]=x.useState("");
  const panel=x.useRef(null);
  x.useEffect(()=>{const f=e=>{setPeer((e.detail&&e.detail.peer)||null);setOpen(!0)};window.addEventListener("prumo:chat",f);return()=>window.removeEventListener("prumo:chat",f)},[]);
  /* fecha sozinho ao clicar fora da conversa (ou apertar Esc) */
  x.useEffect(()=>{if(!open)return;
    const f=e=>{const el=e.target;if(!panel.current||panel.current.contains(el))return;if(el.closest&&el.closest(".avo-strip,.av-lightbox,.avn-toast,[role=menu],.modal"))return;setOpen(!1)};
    const k=e=>{if(e.key==="Escape"&&!document.querySelector(".av-lightbox"))setOpen(!1)};
    const id=setTimeout(()=>document.addEventListener("mousedown",f),0);document.addEventListener("keydown",k);
    return()=>{clearTimeout(id);document.removeEventListener("mousedown",f);document.removeEventListener("keydown",k)}},[open]);
  if(!open)return null;
  const me=window.__avUid;
  const list=(people||[]).filter(p=>p.id!==me&&p.name.toLowerCase().includes(qs.toLowerCase())).sort((a,b)=>{
    const la=peers[a.id]?peers[a.id].last.at:0,lb=peers[b.id]?peers[b.id].last.at:0;
    return lb-la||(b.online-a.online)||a.name.localeCompare(b.name,"pt-BR")});
  return(0,q.jsxs)("section",{className:"avc-panel",ref:panel,role:"dialog","aria-label":"Conversas",children:[
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
  {key:"grafite",name:"Grafite",a:"#475569",b:"#3b82f6",tip:"Cinza com azul, discreto"},
  {key:"opulent",name:"Índigo profundo",a:"#4f46e5",b:"#818cf8",side:"#15164a",tip:"Menu azul-marinho, destaque índigo"},
  {key:"workmate",name:"Preto e azul",a:"#2563eb",b:"#22c55e",side:"#ffffff",tip:"Menu branco, ativo preto"},
  {key:"taskmaster",name:"Verde e laranja",a:"#0f9d7a",b:"#f97316",side:"#ffffff",tip:"Verde com toques laranja"},
  {key:"coral",name:"Coral",a:"#f05a28",b:"#ffb38a",side:"#ffffff",tip:"Laranja vibrante e branco"},
  {key:"mono",name:"Monocromático",a:"#18181b",b:"#a1a1aa",side:"#ffffff",tip:"Preto, cinza e branco"},
  {key:"flodour",name:"Floresta dourada",a:"#518e45",b:"#f1ca30",tip:"Verde com amarelo"},
  {key:"urbana",name:"Noite urbana",a:"#1f9c80",b:"#ebae29",tip:"Verde-água com âmbar"},
  {key:"neon",name:"Neon rosa",a:"#da0090",b:"#f2cb30",tip:"Pink com amarelo"},
  {key:"eletrico",name:"Elétrico",a:"#ff2801",b:"#c8e600",tip:"Vermelho com lima"},
  {key:"rubi",name:"Rubi e ouro",a:"#ac0f2c",b:"#f5dc06",tip:"Vinho com dourado"},
  {key:"ceu",name:"Céu aberto",a:"#02a3fe",b:"#fdd80c",tip:"Azul-céu com amarelo"},
  {key:"ouro",name:"Ouro",a:"#c98a12",b:"#f6df75",tip:"Tons dourados"}
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
  else{bg=__avMix(A,"#eef1f6",.035);card="#ffffff";h1=__avMix(A,"#000000",.92);h2=__avMix(__avMix(A,B,.45),"#000000",.92)}
  const ar=((l.areas||{})[dark?"dark":"light"])||{};
  if(__avHex(ar.bg))bg=ar.bg;if(__avHex(ar.card))card=ar.card;
  if(__avHex(ar.hero)){h1=ar.hero;h2=__avMix(ar.hero,"#000000",.78)}
  const sty=__avThemes.find(z=>z.key===l.palette);
  const rail=__avHex(ar.rail)?ar.rail:(dark?__avMix(card,"#000000",.72):(sty&&sty.side?sty.side:__avMix(A,"#0c1029",.16)));
  /* densidade, cantos e foco */
  st.setProperty("--avradius",(Number(l.radius)>=4&&Number(l.radius)<=32?Number(l.radius):20)+"px");
  root.classList.toggle("av-dense",l.density==="compacto");root.classList.toggle("av-comfy",l.density==="confortavel");
  root.classList.toggle("av-focus",!!l.boldFocus);
  const strip1=__avHex(ar.strip)?ar.strip:h1,strip2=__avHex(ar.strip)?__avMix(ar.strip,"#000000",.85):h2;
  if(__avHex(ar.accent))st.setProperty("--accent",ar.accent);
  const DARK=["#14161b","#454a55","#6b717d"],LIGHT=["#f4f5f8","#c9ccd4","#9a9fa9"];
  const inkOn=(c,k)=>{const f=k&&ar[k+"Ink"];return f==="black"?DARK:f==="white"?LIGHT:(__avLum(c)>.4?DARK:LIGHT)};
  const ri=inkOn(rail,"rail"),bi=inkOn(bg,"bg");
  const sf=ar.stripInk,si=sf==="black"?["#14161b","#2f333b"]:sf==="white"?["#ffffff","#ffffffcc"]:(Math.max(__avLum(strip1),__avLum(strip2))>.42?["#14161b","#2f333b"]:["#ffffff","#ffffffcc"]);
  /* barra de colegas (borda direita): preto por padrão, cor do tema ou cor livre */
  const fr=__avHex(ar.strip)?ar.strip:__avHex(l.friends)?l.friends:l.friends==="tema"?__avMix(A,"#000000",.5):"#101114";
  st.setProperty("--avfriends",fr);st.setProperty("--avfriendsink",__avLum(fr)>.4?"#1b1d22":"#e4e6eb");st.setProperty("--avfriendsedge",__avLum(fr)>.4?"#00000022":"#ffffff14");
  [["--avrail",rail],["--avrailink",ri[0]],["--avrailink2",ri[1]],["--avstrip1",strip1],["--avstrip2",strip2],["--avstripink",si[0]],["--avstripink2",si[1]]].forEach(([k,v])=>st.setProperty(k,v));
  const hf=ar.heroInk,heroLight=hf==="black"?!0:hf==="white"?!1:Math.max(__avLum(h1),__avLum(h2))>.42;
  const ci=inkOn(card,"card");
  const hi=heroLight?["#14161b","#2f333b"]:["#ffffff","#ffffffcc"];
  [["--avbg",bg],["--avcard",card],["--avhero",h1],["--avhero1",h1],["--avhero2",h2],["--avink",ci[0]],["--avink2",ci[1]],["--avink3",ci[2]],["--avbgink",bi[0]],["--avbgink2",bi[1]],["--avheroink",hi[0]],["--avheroink2",hi[1]]].forEach(([k,v])=>st.setProperty(k,v));
  root.classList.add("av-themed");
  root.classList.toggle("av-cardlight",__avLum(card)>.4);
  root.classList.toggle("av-herolight",heroLight);
  __avDS(l,dark);
}
function AvPalettes({n,r}){
  const pick=p=>r({palette:p.key,accent:p.a,accent2:p.b});
  const A=__avHex(n.accent)?n.accent:"#2563eb",B=__avHex(n.accent2)?n.accent2:"#f5b301";
  return(0,q.jsxs)("section",{className:"pz-sec",children:[(0,q.jsx)("h3",{children:"Estilos prontos"}),
    (0,q.jsx)("p",{className:"small muted",style:{margin:"-4px 0 10px"},children:"Gradientes de duas cores que combinam. Funcionam no modo claro e no escuro."}),
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
  /* tarefas da equipe (usa a mesma consulta compartilhada) */
  const{tasks:sharedTasks}=useAvTasks();
  const seenRef=x.useRef(null);
  x.useEffect(()=>{
    const me=window.__avUid;if(!me||!sharedTasks)return;
    const key="av:seenTasks:"+me;
    if(!seenRef.current){let s=null;try{s=JSON.parse(localStorage.getItem(key)||"null")}catch{}
      if(!s){seenRef.current=new Set(sharedTasks.map(t=>t.id));try{localStorage.setItem(key,JSON.stringify([...seenRef.current]))}catch{}return}
      seenRef.current=new Set(s)}
    const seen=seenRef.current;
    const fresh=sharedTasks.filter(t=>!seen.has(t.id));
    if(!fresh.length)return;
    fresh.forEach(t=>seen.add(t.id));try{localStorage.setItem(key,JSON.stringify([...seen].slice(-3000)))}catch{}
    for(const t of fresh.filter(t=>t.owner!==me).slice(0,5)){
      const mine=t.assignee===me;
      __avNotify(mine?(t.owner_name||"Alguém")+" atribuiu uma tarefa a você":"Nova tarefa da equipe",t.title+(t.due_date?" · prazo "+t.due_date.split("-").reverse().join("/"):""),()=>nav("/tarefas-equipe"),"task-"+t.id);
    }
  },[sharedTasks]);
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

/* =====================================================================
   ASSISTENTE ZÊNITE (gratuito, sem IA paga): entende frases simples e
   monta tarefas da equipe com responsável, prioridade, prazo e horário.
   ===================================================================== */
const __avNo=s=>(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase();
function __avIso(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
function __avParseOrders(text,people,base){
  const now=base?new Date(base+"T12:00:00"):new Date();
  const dows=["domingo","segunda","terca","quarta","quinta","sexta","sabado"];
  const months={janeiro:1,fevereiro:2,marco:3,abril:4,maio:5,junho:6,julho:7,agosto:8,setembro:9,outubro:10,novembro:11,dezembro:12};
  const findDate=s=>{
    const n=__avNo(s);let m,d=null,frag=null;
    const add=k=>{const x=new Date(now);x.setDate(x.getDate()+k);return x};
    if((m=n.match(/\b(?:ate |para |pra |no |na |dia )?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))){let y=m[3]?+m[3]:now.getFullYear();if(y<100)y+=2000;d=new Date(y,+m[2]-1,+m[1]);if(!m[3]&&d<add(-1))d.setFullYear(y+1);frag=m[0]}
    else if((m=n.match(/\b(?:ate |para |pra |no |dia )?(\d{1,2}) de (janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/))){d=new Date(now.getFullYear(),months[m[2]]-1,+m[1]);if(d<add(-1))d.setFullYear(d.getFullYear()+1);frag=m[0]}
    else if((m=n.match(/\b(?:ate |para |pra )?depois de amanha\b/))){d=add(2);frag=m[0]}
    else if((m=n.match(/\b(?:ate |para |pra )?amanha\b/))){d=add(1);frag=m[0]}
    else if((m=n.match(/\b(?:ate |para |pra )?hoje\b/))){d=add(0);frag=m[0]}
    else if((m=n.match(/\b(?:em|daqui a) (\d{1,2}) dias?\b/))){d=add(+m[1]);frag=m[0]}
    else if((m=n.match(/\b(?:ate |para |pra |na |no )?(?:a |o )?(?:proxima |proximo )?(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:-feira| feira)?\b/))){const w=dows.indexOf(m[1]);let k=(w-now.getDay()+7)%7;if(k===0)k=7;d=add(k);frag=m[0]}
    else if((m=n.match(/\b(?:ate o |ate |no )?(?:dia )(\d{1,2})\b/))){d=new Date(now.getFullYear(),now.getMonth(),+m[1]);if(d<add(-1))d.setMonth(d.getMonth()+1);frag=m[0]}
    return d?{iso:__avIso(d),frag}:null;
  };
  const findTime=s=>{const n=__avNo(s);const m=n.match(/\b(?:as |a partir das |ate as )?(\d{1,2})(?::(\d{2})|h(\d{2})?)\b/);if(!m)return null;const h=+m[1],mi=+(m[2]||m[3]||0);if(h>23||mi>59)return null;return{t:String(h).padStart(2,"0")+":"+String(mi).padStart(2,"0"),frag:m[0]}};
  const findImpact=s=>{const n=__avNo(s);if(/\b(urgente|prioridade alta|alta prioridade|importante|critic[oa])\b/.test(n))return"alto";if(/\b(prioridade media|media prioridade)\b/.test(n))return"medio";if(/\b(prioridade baixa|baixa prioridade|sem pressa)\b/.test(n))return"baixo";return null};
  const findPeople=s=>{const n=" "+__avNo(s)+" ";const out=[];
    if(/\b(equipe toda|toda a equipe|todo mundo|todos)\b/.test(n))return{all:!0,list:[]};
    for(const p of people){const parts=__avNo(p.name).split(/\s+/).filter(w=>w.length>2);const full=__avNo(p.name);
      if(n.includes(" "+full+" ")||n.includes(" "+full+",")||parts.some((w,i)=>i===0&&new RegExp("\\b"+w+"\\b").test(n)))out.push(p)}
    return{all:!1,list:out}};
  const kindOf=s=>/\b(validar|valide|aprovar|aprove|revisar e aprovar)\b/.test(__avNo(s))?"validar":"fazer";
  const lines=String(text||"").split(/\n|;|•/).map(z=>z.replace(/^\s*[-*\d.)]+\s*/,"").trim()).filter(z=>z.length>2);
  /* linhas sem tarefa (ex.: "Zênite, para o Bernardo, prioridade alta, até sexta:") valem para as demais */
  const global={date:null,time:null,impact:null,people:{all:!1,list:[]}};
  const res=[];
  const pass=(line,apply)=>{
    const date=findDate(line)||global.date,time=findTime(line)||global.time,impact=findImpact(line)||global.impact;
    let pp=findPeople(line);if(!pp.all&&!pp.list.length)pp=global.people;
    let title=line;
    const strip=re=>{title=title.replace(re," ")};
    [date&&date.frag,time&&time.frag].filter(Boolean).forEach(f=>{const i=__avNo(title).indexOf(f);if(i>=0)title=title.slice(0,i)+" "+title.slice(i+f.length)});
    strip(/\b(z[eê]nite)\b[,:]?/gi);strip(/^\s*ritmo\b[,:]?/i);
    strip(/^\s*(por favor|favor)\b/i);
    strip(/^\s*(coloque|coloca|crie|cria|criar|adicione|adiciona|passe|passa|mande|manda|registre|registra|agende|agenda)\b( essas?| estas?| as| a| uma| um)?( tarefas?| atividades?)?/i);
    strip(/\b(com |de )?(prioridade|impacto) (alta|media|média|baixa)\b/gi);strip(/\b(urgente|sem pressa)\b/gi);
    strip(/\b(no|dentro do|ao) (painel|calend[aá]rio)( da equipe| de equipe)?( e (no|dentro do) (painel|calend[aá]rio)( da equipe)?)?\b/gi);
    strip(/\b(e )?(tem que|precisa|deve) ser entregue\b/gi);strip(/\b(com )?obriga[cç][aã]o d[aeo]s?\b/gi);
    for(const p of pp.list){const parts=[p.name,...p.name.split(/\s+/).filter(w=>w.length>2)];for(const w of parts){title=title.replace(new RegExp("\\b(para|pra|pro|com|d[aoe]|e|a|o)?\\s*"+w.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"\\b","gi")," ")}}
    strip(/\b(para|pra|pro) (a |o )?(equipe toda|toda a equipe|todo mundo|todos)\b/gi);
    for(let k=0;k<3;k++)title=title.replace(/\s+/g," ").replace(/^[\s,.:;-]+|[\s,.:;-]+$/g,"").replace(/^(e|para|pra|pro|com|de|do|da|a|o)(\s+|$)/i,"").replace(/(^|\s+)(e|para|pra|pro|com|de|do|da|ate|até|a|o)$/i,"").trim();
    if(title.length<2||/^(as |os )?(seguintes |essas |estas )?(tarefas?|atividades?)$/i.test(title)){if(!apply){global.date=findDate(line)||global.date;global.time=findTime(line)||global.time;global.impact=findImpact(line)||global.impact;const g=findPeople(line);if(g.all||g.list.length)global.people=g}return}
    if(!apply)return;
    title=title.charAt(0).toUpperCase()+title.slice(1);
    const targets=pp.all||!pp.list.length?[null]:pp.list;
    for(const p of targets)res.push({key:Math.random().toString(36).slice(2),title,assignee:p?p.id:"",due_date:date?date.iso:"",due_time:time?time.t:"",impact:impact||"",kind:kindOf(line)});
  };
  if(lines.length>1)lines.forEach(l=>pass(l,!1));
  lines.forEach(l=>pass(l,!0));
  return res;
}

function AvAssistant(){
  const[open,setOpen]=x.useState(!1);
  x.useEffect(()=>{const f=()=>setOpen(!0);window.addEventListener("prumo:assist",f);return()=>window.removeEventListener("prumo:assist",f)},[]);
  return(0,q.jsxs)(q.Fragment,{children:[
    (0,q.jsx)("button",{className:"ava-fab"+(open?" on":""),onClick:()=>setOpen(o=>!o),title:"Assistente Ritmo: escreva um pedido e ele monta as atividades da equipe","aria-label":"Abrir assistente Ritmo",children:(0,q.jsx)(AvOrb,{size:58})}),
    open&&(0,q.jsx)(AvAssistantPanel,{onClose:()=>setOpen(!1)})]});
}
function AvAssistantPanel({onClose}){
  const open=!0,setOpen=v=>{v||onClose()};
  const[txt,setTxt]=x.useState(""),[items,setItems]=x.useState(null),[busy,setBusy]=x.useState(!1),[done,setDone]=x.useState(null);
  const dir=useAvDir();const{fail}=Ea();const nav=ir();
  const box=x.useRef(null);
  x.useEffect(()=>{if(!open)return;const f=e=>{if(box.current&&!box.current.contains(e.target)&&!e.target.closest(".ava-fab"))setOpen(!1)};const k=e=>{e.key==="Escape"&&setOpen(!1)};setTimeout(()=>document.addEventListener("mousedown",f),0);document.addEventListener("keydown",k);return()=>{document.removeEventListener("mousedown",f);document.removeEventListener("keydown",k)}},[open]);
  if(!open)return null;
  const people=(dir||[]).filter(p=>p&&p.id&&p.name);
  const understand=()=>{const r=__avParseOrders(txt,people);setItems(r);setDone(null)};
  const upd=(k,patch)=>setItems(a=>a.map(z=>z.key===k?{...z,...patch}:z));
  const[cal,setCal]=x.useState(!1);
  const create=async()=>{
    setBusy(!0);let ok=0;
    const me=window.__avUid;const label={baixo:"baixa",medio:"média",alto:"alta"};
    try{
      for(const it of items){
        const who=it.assignee||me;
        const notes=[it.impact&&"Prioridade "+label[it.impact],it.due_time&&"Horário: "+it.due_time,!it.assignee&&"Para a equipe toda",it.kind==="validar"&&"Tipo: validar"].filter(Boolean).join(" · ")||null;
        await __avJson("/team/"+who+"/cards",{method:"POST",body:{cards:[{id:"as"+Date.now().toString(36)+Math.random().toString(36).slice(2,8),title:it.title,status:"a_fazer",due:it.due_date||null,priority:it.impact||null,notes}]}});
        if(cal)await __avJson("/shared-tasks",{method:"POST",body:{title:it.title,assignee:it.assignee||null,visibility:"equipe",kind:it.kind||"fazer",impact:it.impact||null,due_date:it.due_date||null,due_time:it.due_time||null,origin:"tarefa"}});
        ok++;
      }
      try{(window.__AVP&&window.__AVP.teamCbs||[]).forEach(f=>f())}catch{}
      setDone(ok);setItems(null);setTxt("");}
    catch(e){fail(e)}finally{setBusy(!1)}
  };
  const imp={"":"Não informado",baixo:"Baixo",medio:"Médio",alto:"Alto"};
  return(0,q.jsxs)("section",{className:"avc-panel ava-panel",ref:box,role:"dialog","aria-label":"Assistente Zênite",children:[
    (0,q.jsxs)("header",{className:"avc-head",children:[(0,q.jsx)("span",{className:"ava-ico",children:(0,q.jsx)(AvOrb,{size:28})}),(0,q.jsxs)("span",{className:"avc-who",children:[(0,q.jsx)("strong",{children:"Assistente Zênite"}),(0,q.jsx)("small",{children:"Escreva o pedido e ele monta as atividades da equipe"})]})]}),
    (0,q.jsx)("button",{className:"avc-close",onClick:()=>setOpen(!1),"aria-label":"Fechar assistente",children:"×"}),
    (0,q.jsxs)("div",{className:"ava-body",children:[
      done!==null&&(0,q.jsxs)("div",{className:"ava-done",children:[(0,q.jsx)("strong",{children:done+(done===1?" tarefa criada.":" tarefas criadas.")}),(0,q.jsx)("span",{children:"Já aparecem em Atividades da equipe, na coluna “A fazer” de cada responsável."}),(0,q.jsx)("button",{className:"btn sm",onClick:()=>{nav("/equipe");setOpen(!1)},children:"Ver em Atividades da equipe"})]}),
      !items&&(0,q.jsxs)(q.Fragment,{children:[
        (0,q.jsx)("textarea",{className:"input ava-in",rows:5,value:txt,"aria-label":"Pedido para o assistente",placeholder:"Ex.: Revisar as planilhas da revista pra Aysla e o Bernardo, prioridade alta, até sexta às 15h\nUma tarefa por linha também funciona.",onChange:e=>setTxt(e.target.value),onKeyDown:e=>{if(e.key==="Enter"&&(e.ctrlKey||e.metaKey))understand()}}),
        (0,q.jsx)("p",{className:"ava-tip",children:"Entende: nomes da equipe, “equipe toda”, prioridade alta/média/baixa ou urgente, hoje, amanhã, dia da semana, 05/11, “dia 5”, horário (15h, 14:30) e “validar”."}),
        (0,q.jsx)("button",{className:"btn primary",disabled:txt.trim().length<3,onClick:understand,children:"Montar tarefas"})]}),
      items&&(items.length===0?(0,q.jsxs)("div",{className:"ava-empty",children:["Não consegui identificar tarefas nesse texto. Tente algo como “Enviar o relatório pra Ana até amanhã”.",(0,q.jsx)("button",{className:"btn sm",onClick:()=>setItems(null),children:"Voltar"})]}):
        (0,q.jsxs)(q.Fragment,{children:[(0,q.jsx)("p",{className:"ava-tip",children:"Confira e ajuste antes de criar:"}),
          (0,q.jsx)("ul",{className:"ava-list",children:items.map(it=>(0,q.jsxs)("li",{children:[
            (0,q.jsx)("input",{className:"input",value:it.title,"aria-label":"Título",onChange:e=>upd(it.key,{title:e.target.value})}),
            (0,q.jsxs)("div",{className:"ava-row",children:[
              (0,q.jsxs)("select",{className:"select","aria-label":"Responsável",value:it.assignee,onChange:e=>upd(it.key,{assignee:e.target.value}),children:[(0,q.jsx)("option",{value:"",children:"Equipe toda"}),people.map(p=>(0,q.jsx)("option",{value:p.id,children:p.name},p.id))]}),
              (0,q.jsx)("select",{className:"select","aria-label":"Prioridade",value:it.impact,onChange:e=>upd(it.key,{impact:e.target.value}),children:Object.entries(imp).map(([v,l])=>(0,q.jsx)("option",{value:v,children:"Prioridade: "+l},v))}),
              (0,q.jsx)("input",{className:"input",type:"date","aria-label":"Prazo",value:it.due_date,onChange:e=>upd(it.key,{due_date:e.target.value})}),
              (0,q.jsx)("input",{className:"input",type:"time","aria-label":"Horário",value:it.due_time,onChange:e=>upd(it.key,{due_time:e.target.value})}),
              (0,q.jsx)("button",{className:"btn sm ghost",onClick:()=>setItems(a=>a.filter(z=>z.key!==it.key)),"aria-label":"Remover",children:"Remover"})]})]},it.key))}),
          (0,q.jsxs)("label",{className:"pz-check ava-cal",children:[(0,q.jsx)("input",{type:"checkbox",checked:cal,onChange:e=>setCal(e.target.checked)}),"Também colocar no calendário da equipe"]}),
          (0,q.jsxs)("div",{className:"ava-actions",children:[(0,q.jsx)("button",{className:"btn",onClick:()=>setItems(null),children:"Voltar e editar"}),(0,q.jsx)("button",{className:"btn primary",disabled:busy||items.some(z=>z.title.trim().length<2),onClick:create,children:busy?"Criando…":"Criar "+items.length+(items.length===1?" tarefa":" tarefas")})]})]}))]})]});
}


/* ===== Foto em tela cheia (chat e onde mais for usada) ===== */
function AvLightbox(){
  const[img,setImg]=x.useState(null);
  x.useEffect(()=>{const f=e=>setImg(e.detail);window.addEventListener("prumo:lightbox",f);return()=>window.removeEventListener("prumo:lightbox",f)},[]);
  x.useEffect(()=>{if(!img)return;const k=e=>{e.key==="Escape"&&setImg(null)};document.addEventListener("keydown",k);return()=>document.removeEventListener("keydown",k)},[img]);
  if(!img)return null;
  return Vi.createPortal((0,q.jsxs)("div",{className:"av-lightbox",role:"dialog","aria-label":"Foto",onClick:e=>{if(e.target===e.currentTarget)setImg(null)},children:[
    (0,q.jsx)("img",{src:img.src,alt:img.name||"Foto"}),
    (0,q.jsxs)("div",{className:"av-lb-bar",children:[(0,q.jsx)("span",{children:img.name||""}),(0,q.jsx)("a",{className:"btn sm",href:img.src+(img.src.includes("?")?"&":"?")+"download=1",download:img.name||"foto",children:"Baixar"}),(0,q.jsx)("button",{className:"btn sm",onClick:()=>setImg(null),children:"Fechar"})]})]}),document.body);
}


/* ===== PERSONALIZAR reorganizado: Tema · Cores · Fundo · Texto ===== */
const __avAreas=[
  ["bg","Fundo","Atrás de tudo"],
  ["rail","Menu lateral e barra do topo","Ícones da esquerda e busca"],
  ["card","Cartões","Meu dia, anotações, listas, janelas"],
  ["hero","Faixa do topo e painel do dia","Saudação e números do dia"],
  ["strip","Faixa de colegas e chat","Lateral direita e conversas"],
  ["accent","Botões e destaques","Botão principal, itens ativos"]
];
function AvPersonalize({open,onClose}){
  const{prefs:n,setPrefs:r}=Ea();
  const[mode,setMode]=x.useState(()=>document.documentElement.getAttribute("data-avant-theme")==="dark"?"dark":"light");
  x.useEffect(()=>{if(open)setMode(document.documentElement.getAttribute("data-avant-theme")==="dark"?"dark":"light")},[open]);
  const[adv,setAdv]=x.useState(!1);
  const areas=n.areasV===2?(n.areas||{}):{};const cur=areas[mode]||{};
  const setArea=(k,v)=>{const base=n.areasV===2?areas:{},m={...(base[mode]||{})};if(v)m[k]=v;else delete m[k];r({areas:{...base,[mode]:m},areasV:2})};
  const cssv=k=>{try{return getComputedStyle(document.documentElement).getPropertyValue(k).trim()}catch{return""}};
  const now=k=>__avHex(cur[k])?cur[k]:({bg:cssv("--avbg"),rail:cssv("--avrail"),card:cssv("--avcard"),hero:cssv("--avhero1"),strip:cssv("--avstrip1"),accent:cssv("--accent")}[k]||"#888888");
  const A=__avHex(n.accent)?n.accent:"#2563eb",B=__avHex(n.accent2)?n.accent2:"#f5b301";
  const sizes=ya,si=Math.max(0,sizes.findIndex(e=>e.value===n.scale));
  const dens=["compacto","normal","confortavel"],di=Math.max(0,dens.indexOf(n.density||"normal"));
  const rad=Number(n.radius)||20;
  const Row=(label,hint,ctl)=>(0,q.jsxs)("div",{className:"pzy-row",children:[(0,q.jsxs)("div",{className:"pzy-l",children:[(0,q.jsx)("strong",{children:label}),hint&&(0,q.jsx)("small",{children:hint})]}),(0,q.jsx)("div",{className:"pzy-c",children:ctl})]});
  const Toggle=(on,set,label,hint)=>(0,q.jsxs)("label",{className:"pzy-tg",children:[(0,q.jsx)("input",{type:"checkbox",checked:!!on,onChange:e=>set(e.target.checked)}),(0,q.jsx)("i",{"aria-hidden":!0}),(0,q.jsxs)("span",{children:[(0,q.jsx)("strong",{children:label}),hint&&(0,q.jsx)("small",{children:hint})]})]});
  return(0,q.jsxs)(dl,{open,title:"Temas",label:"Personalizar a aparência",onClose,className:"modal-personalize pzy",
    footer:(0,q.jsxs)(q.Fragment,{children:[(0,q.jsxs)("button",{className:"btn ghost",onClick:()=>r({...ba,theme:"sistema",areas:{},density:"normal",radius:20,boldFocus:!1}),style:{marginRight:"auto"},children:[(0,q.jsx)(Zs,{size:15}),"  Restaurar padrão"]}),(0,q.jsx)("button",{className:"btn primary",onClick:onClose,children:"Pronto"})]}),
    children:[
      (0,q.jsx)("p",{className:"pzy-sub",children:"Personalize o visual do seu espaço de trabalho. Vale só para você."}),
      (0,q.jsx)("div",{className:"pzy-mode seg",role:"group","aria-label":"Tema",children:[["sistema","Auto"],["claro","Claro"],["escuro","Escuro"]].map(([v,l])=>(0,q.jsx)("button",{className:n.theme===v?"on":"","aria-pressed":n.theme===v,onClick:()=>r({theme:v}),children:l},v))}),
      Row("Cor de destaque","Gradientes prontos; o último é o seu",(0,q.jsxs)("div",{className:"pzy-dots",children:[__avThemes.map(p=>(0,q.jsx)("button",{className:"pzy-dot"+(n.palette===p.key?" on":""),title:p.name+" · "+p.tip,"aria-label":p.name,"aria-pressed":n.palette===p.key,onClick:()=>r({palette:p.key,accent:p.a,accent2:p.b}),style:{background:"linear-gradient(135deg,"+p.a+","+p.b+")"}},p.key)),
        (0,q.jsxs)("label",{className:"pzy-dot pzy-own"+(n.palette==="custom"?" on":""),title:"Monte o seu: cor 1 e cor 2",style:{background:"linear-gradient(135deg,"+A+","+B+")"},children:[(0,q.jsx)("input",{type:"color","aria-label":"Cor 1",value:A,onChange:e=>r({accent:e.target.value,palette:"custom"})})]}),
        n.palette==="custom"&&(0,q.jsxs)("label",{className:"pzy-c2",children:["Cor 2 ",(0,q.jsx)("input",{type:"color","aria-label":"Cor 2",value:B,onChange:e=>r({accent2:e.target.value,palette:"custom"})})]})]})),
      (0,q.jsx)("p",{className:"pzy-name",children:(__avThemes.find(z=>z.key===n.palette)||{name:"Personalizado"}).name}),
      Row("Densidade","Espaço entre os elementos",(0,q.jsxs)("div",{className:"pzy-range",children:[(0,q.jsx)("input",{type:"range",min:0,max:2,step:1,value:di,"aria-label":"Densidade",onChange:e=>r({density:dens[+e.target.value]})}),(0,q.jsxs)("div",{className:"pzy-ticks",children:[(0,q.jsx)("span",{children:"Compacto"}),(0,q.jsx)("span",{children:"Normal"}),(0,q.jsx)("span",{children:"Confortável"})]})]})),
      Row("Fonte",null,(0,q.jsx)("select",{className:"select","aria-label":"Fonte",value:n.font,onChange:e=>r({font:e.target.value}),children:va.map(e=>(0,q.jsx)("option",{value:e.key,children:e.label},e.key))})),
      Row("Tamanho do texto",null,(0,q.jsxs)("div",{className:"pzy-range",children:[(0,q.jsx)("input",{type:"range",min:0,max:sizes.length-1,step:1,value:si,"aria-label":"Tamanho do texto",onChange:e=>r({scale:sizes[+e.target.value].value})}),(0,q.jsx)("div",{className:"pzy-ticks",children:sizes.map(e=>(0,q.jsx)("span",{children:e.label},e.value))})]})),
      Row("Barra de colegas","Cor da aba de amigos na lateral",(0,q.jsxs)("div",{className:"pzy-dots",children:[[["","Padrão (cor dos cartões)"],["#101114","Preto"],["tema","Cor do tema"],["#14306f","Azul-marinho"],["#2b2f38","Grafite"],["#ffffff","Branca"]].map(([v,nm])=>(0,q.jsx)("button",{className:"pzy-dot pzy-fr"+(((n.friends||"")===v)?" on":""),"aria-label":"Barra de colegas: "+nm,title:nm,"aria-pressed":(n.friends||"")===v,onClick:()=>r({friends:v||null}),style:{background:v==="tema"?"linear-gradient(135deg,"+A+","+__avMix(A,"#000000",.5)+")":v||"linear-gradient(135deg,var(--surface) 50%,var(--surface-2) 50%)"}},v||"padrao")),
        (0,q.jsx)("label",{className:"pzy-dot pzy-own"+(__avHex(n.friends)&&!["#101114","#14306f","#2b2f38","#ffffff"].includes(n.friends)?" on":""),title:"Escolher outra cor",style:{background:__avHex(n.friends)?n.friends:"conic-gradient(#f43f5e,#f59e0b,#22c55e,#06b6d4,#6366f1,#f43f5e)"},children:(0,q.jsx)("input",{type:"color","aria-label":"Cor da barra de colegas",value:__avHex(n.friends)?n.friends:"#101114",onChange:e=>r({friends:e.target.value})})})]})),
      Row("Arredondamento","Cantos dos cartões e botões",(0,q.jsxs)("div",{className:"pzy-range",children:[(0,q.jsx)("input",{type:"range",min:4,max:28,step:4,value:rad,"aria-label":"Arredondamento",onChange:e=>r({radius:+e.target.value})}),(0,q.jsxs)("div",{className:"pzy-ticks",children:[(0,q.jsx)("span",{children:"Reto"}),(0,q.jsx)("span",{children:rad+" px"}),(0,q.jsx)("span",{children:"Redondo"})]})]})),
      (0,q.jsxs)("div",{className:"pzy-toggles",children:[
        Toggle(!n.reduceMotion,v=>r({reduceMotion:!v}),"Animações suaves","Transições e movimentos da interface"),
        Toggle(!!n.boldFocus,v=>r({boldFocus:v}),"Contorno de foco forte","Facilita navegar pelo teclado")]}),
      (0,q.jsx)("h4",{className:"pzy-h4 pzw-h",children:"Papel de parede"}),
      (0,q.jsx)(AvWallPicker,{prefs:n,set:r,accent:A,dark:document.documentElement.getAttribute("data-avant-theme")==="dark"}),
      (0,q.jsxs)("details",{className:"pzy-adv",open:adv,onToggle:e=>setAdv(e.target.open),children:[(0,q.jsx)("summary",{children:"Cores por área (avançado)"}),
        (0,q.jsx)("div",{className:"seg compact pzx-mode",children:[["light","Modo claro"],["dark","Modo escuro"]].map(([k,l])=>(0,q.jsx)("button",{className:mode===k?"on":"","aria-pressed":mode===k,onClick:()=>setMode(k),children:l},k))}),
        (0,q.jsx)("ul",{className:"pzx-areas",children:__avAreas.map(([k,l,h])=>(0,q.jsxs)("li",{children:[
          (0,q.jsx)("input",{type:"color","aria-label":l+" ("+(mode==="dark"?"modo escuro":"modo claro")+")",value:now(k),onChange:e=>setArea(k,e.target.value)}),
          (0,q.jsxs)("span",{className:"pzx-al",children:[(0,q.jsx)("strong",{children:l}),(0,q.jsx)("small",{children:__avHex(cur[k])?"Personalizado · "+h:"Padrão do estilo · "+h})]}),
          __avHex(cur[k])&&(0,q.jsx)("button",{className:"btn sm ghost",onClick:()=>setArea(k,null),children:"Padrão"})]},k))})]})
    ]});
}


/* =====================================================================
   CONTRASTE AUTOMÁTICO EM TODA A TELA
   Olha o fundo REAL atrás de cada texto (inclusive gradientes e cartões
   personalizados) e, se a letra estiver pouco visível, troca para escura
   ou clara. Roda só quando a tela muda, em pedaços, sem travar.
   ===================================================================== */
(function(){
  if(typeof document==="undefined")return;
  const DARK="#14161b",LIGHT="#f4f5f8";
  const parse=s=>{if(!s)return null;let m=s.match(/rgba?\(([^)]+)\)/);if(m){const v=m[1].split(/[\s,\/]+/).filter(Boolean).map(Number);return{r:v[0],g:v[1],b:v[2],a:v.length>3?v[3]:1}}
    m=s.match(/color\(srgb ([^)]+)\)/);if(m){const v=m[1].split(/[\s\/]+/).filter(Boolean).map(Number);return{r:v[0]*255,g:v[1]*255,b:v[2]*255,a:v.length>3?v[3]:1}}return null};
  const lum=c=>{const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};return .2126*f(c.r)+.7152*f(c.g)+.0722*f(c.b)};
  const ratio=(a,b)=>{const x1=lum(a)+.05,x2=lum(b)+.05;return x1>x2?x1/x2:x2/x1};
  const blend=(top,bot)=>({r:top.r*top.a+bot.r*(1-top.a),g:top.g*top.a+bot.g*(1-top.a),b:top.b*top.a+bot.b*(1-top.a),a:1});
  let pageBg={r:245,g:246,b:249,a:1};
  const cache=new Map();
  function bgOf(el){
    const stack=[];let e=el;
    while(e&&e.nodeType===1&&e!==document.documentElement){
      if(cache.has(e)){const c=cache.get(e);return stack.reduceRight((acc,x)=>blend(x,acc),c)}
      const cs=getComputedStyle(e);
      const img=cs.backgroundImage;
      if(img&&img!=="none"&&!/url\(/.test(img)){const cols=[...img.matchAll(/rgba?\([^)]+\)|color\(srgb [^)]+\)/g)].map(m=>parse(m[0])).filter(c=>c&&c.a>.35);
        if(cols.length){const avg=cols.reduce((s,c)=>({r:s.r+c.r/cols.length,g:s.g+c.g/cols.length,b:s.b+c.b/cols.length,a:1}),{r:0,g:0,b:0,a:1});cache.set(e,avg);return stack.reduceRight((acc,x)=>blend(x,acc),avg)}}
      const c=parse(cs.backgroundColor);
      if(c&&c.a>=.85){cache.set(e,c);return stack.reduceRight((acc,x)=>blend(x,acc),c)}
      if(c&&c.a>.05)stack.push(c);
      e=e.parentElement;
    }
    return stack.reduceRight((acc,x)=>blend(x,acc),pageBg);
  }
  const SKIP="canvas,svg *,script,style,.av-lightbox,.pzx-preview,.avth-grad,.avth-modes,.avp-dots";
  function textual(el){
    if(el.closest(SKIP))return!1;
    const tag=el.tagName;
    if(tag==="INPUT"||tag==="TEXTAREA"||tag==="SELECT")return!0;
    for(const n of el.childNodes)if(n.nodeType===3&&n.nodeValue.trim())return!0;
    if(el.firstElementChild&&el.firstElementChild.tagName==="svg"&&el.childElementCount===1)return!0;
    return!1;
  }
  function fix(el){
    if(el.dataset.avfix){el.style.removeProperty("color");delete el.dataset.avfix}
    const cs=getComputedStyle(el);
    if(cs.visibility==="hidden"||cs.display==="none")return;
    const fg=parse(cs.color);if(!fg)return;
    const bg=bgOf(el),eff=fg.a<1?blend(fg,bg):fg;
    if(ratio(eff,bg)>=3)return;
    const want=lum(bg)>.4?DARK:LIGHT;
    el.style.setProperty("color",want,"important");el.dataset.avfix="1";
  }
  let queue=[],scheduled=!1;
  const idle=window.requestIdleCallback||(cb=>setTimeout(()=>cb({timeRemaining:()=>8}),60));
  function pump(dl){
    const t0=performance.now();
    while(queue.length&&(dl.timeRemaining()>2||performance.now()-t0<6)){const el=queue.pop();if(el.isConnected&&textual(el))fix(el)}
    if(queue.length)idle(pump);else{scheduled=!1;cache.clear()}
  }
  function scan(root){
    if(!root||root.nodeType!==1)return;
    queue.push(root);
    const all=root.getElementsByTagName("*");for(let i=0;i<all.length&&queue.length<6000;i++)queue.push(all[i]);
    if(!scheduled){scheduled=!0;idle(pump)}
  }
  let full=null;
  function rescanAll(){clearTimeout(full);full=setTimeout(()=>{cache.clear();
    const b=parse(getComputedStyle(document.body).backgroundColor);pageBg=b&&b.a>.5?b:(document.documentElement.getAttribute("data-avant-theme")==="dark"?{r:12,g:13,b:16,a:1}:{r:245,g:246,b:249,a:1});
    queue=[];const r=document.getElementById("root");if(r)scan(r);document.querySelectorAll("body > :not(#root)").forEach(scan)},160)}
  let pend=new Set(),tm=null;
  const flush=()=>{tm=null;const list=[...pend];pend.clear();for(const n of list)if(n.isConnected)scan(n)};
  function start(){
    const mo=new MutationObserver(ms=>{
      for(const m of ms){
        if(m.target===document.documentElement){rescanAll();return}
        if(m.type==="childList")m.addedNodes.forEach(n=>{if(n.nodeType===1)pend.add(n);else if(n.nodeType===3&&n.parentElement)pend.add(n.parentElement)});
        else if(m.type==="attributes"&&m.target.nodeType===1&&m.attributeName==="class")pend.add(m.target);
        else if(m.type==="characterData"&&m.target.parentElement)pend.add(m.target.parentElement);
      }
      if(pend.size&&!tm)tm=setTimeout(flush,320);
    });
    mo.observe(document.body,{childList:!0,subtree:!0,attributes:!0,attributeFilter:["class"],characterData:!0});
    new MutationObserver(rescanAll).observe(document.documentElement,{attributes:!0,attributeFilter:["data-avant-theme","class","style"]});
    rescanAll();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);else start();
  window.__avContrastRescan=rescanAll;
})();

/* rolagem mais lisa: o papel de parede animado espera a rolagem terminar */
(function(){if(typeof window==="undefined")return;let tm=null;
  const on=()=>{window.__avScrolling=!0;clearTimeout(tm);tm=setTimeout(()=>{window.__avScrolling=!1},180)};
  window.addEventListener("scroll",on,{passive:!0,capture:!0});window.addEventListener("wheel",on,{passive:!0});window.addEventListener("touchmove",on,{passive:!0});})();

function __avAccentFor(l,dark){const ar=(l.areasV===2&&(l.areas||{})[dark?"dark":"light"])||{};const h=/^#[0-9a-f]{6}$/i;return h.test(ar.accent||"")?ar.accent:h.test(l.accent||"")?l.accent:"#2563eb"}


/* ===== Menu lateral v5: rótulos, aba ativa na cor da página, recolher e tema no rodapé ===== */
/* menu lateral só com ícones (nomes aparecem ao passar o mouse) */
(function(){try{localStorage.removeItem("av:sideCompact")}catch{}document.documentElement.classList.add("av-side-compact")})();
function AvSideTools(){
  const{prefs:n,setPrefs:r}=Ea();
  const[compact,setCompact]=x.useState(()=>document.documentElement.classList.contains("av-side-compact"));
  const toggle=()=>{const v=!compact;setCompact(v);document.documentElement.classList.toggle("av-side-compact",v);try{localStorage.setItem("av:sideCompact",v?"1":"0")}catch{}};
  const opts=[["sistema","Auto"],["claro","Claro"],["escuro","Escuro"]];
  return(0,q.jsxs)("div",{className:"av-side-tools",children:[
    (0,q.jsx)("div",{className:"av-side-theme",role:"group","aria-label":"Tema",children:opts.map(([v,l])=>(0,q.jsx)("button",{type:"button",className:n.theme===v?"on":"","aria-pressed":n.theme===v,onClick:()=>r({theme:v}),title:"Tema "+l.toLowerCase(),children:l},v))}),
    (0,q.jsx)("button",{type:"button",className:"av-side-collapse",onClick:toggle,"aria-label":compact?"Expandir menu":"Recolher menu",title:compact?"Expandir menu":"Recolher menu",children:compact?"»":"«"})]});
}

/* Seção recolhível (ex.: "Feito hoje") — começa recolhida e lembra a escolha */
function AvFold({title,count,k,children}){
  const key='av-fold-'+k;
  const [open,setOpen]=x.useState(()=>{try{return localStorage.getItem(key)==='1'}catch{return false}});
  const flip=()=>setOpen(v=>{const n=!v;try{localStorage.setItem(key,n?'1':'0')}catch{}return n});
  return (0,q.jsxs)(q.Fragment,{children:[
    (0,q.jsxs)(`button`,{type:`button`,className:`day-sec done avfold`+(open?` is-open`:``),'aria-expanded':open,onClick:flip,children:[
      (0,q.jsx)(`svg`,{className:`avfold-ar`,viewBox:`0 0 24 24`,width:14,height:14,'aria-hidden':!0,children:(0,q.jsx)(`path`,{d:`M9 6l6 6-6 6`,fill:`none`,stroke:`currentColor`,strokeWidth:2.4,strokeLinecap:`round`,strokeLinejoin:`round`})}),
      (0,q.jsx)(`span`,{children:title}),
      (0,q.jsx)(`span`,{className:`avfold-n`,children:count})]}),
    open?children:null]});
}

/* Cartão do quadro: quem criou (em cima) e quem está atendendo */
function AvCardWho({it,m}){
  const by=it.assigned_by||it.created_by||m.name;
  return (0,q.jsxs)(`div`,{className:`tcreator`,children:[
    (0,q.jsx)(`span`,{className:`tcreator-dot`,style:{background:zc(it.created_by_id||m.id)}}),
    (0,q.jsx)(`span`,{className:`tcreator-n`,children:by}),
    by!==m.name?(0,q.jsxs)(`span`,{className:`tcreator-to`,children:[`para `,m.name.split(` `)[0]]}):null]});
}
function AvCardAttend({it,m,me,own,busy,go}){
  const stop=e=>e.stopPropagation();
  const tk=it.taken_by, mine=tk&&tk.id===me?.id, done=it.status===`concluida`;
  const tag=tk&&tk.id!==m.id?(0,q.jsx)(`div`,{className:`tattend-tag`+(done?` done`:``),children:done?`✓ Concluída por ${it.done_by||tk.name}`:mine?`Você está atendendo`:`Em atendimento por ${tk.name}`}):null;
  if(!me?.canWrite||done||(own&&!mine))return tag;
  const btn=(label,st,cls)=>(0,q.jsx)(`button`,{type:`button`,className:`btn sm `+cls,disabled:busy,onClick:e=>{stop(e);go(m,it,st)},onKeyDown:stop,children:label});
  let actions=null;
  if(!tk)actions=[btn(`Atender`,`em_andamento`,`primary`)];
  else if(mine)actions=[btn(`Concluir`,`concluida`,`primary`),btn(`Devolver`,`a_fazer`,`ghost`)];
  return (0,q.jsxs)(q.Fragment,{children:[tag,actions?(0,q.jsx)(`div`,{className:`tattend`,children:actions}):null]});
}

/* =====================================================================
   PAPÉIS DE PAREDE NOVOS (mesmo formato dos originais: {resize, draw(ctx,t,dt)})
   e.palette = cores do tema em [r,g,b]; e.alpha = intensidade; e.dark = modo escuro
   ===================================================================== */
const __wpTau=Math.PI*2;
function __wpGradiente(e){let W=0,H=0;const P=e.palette,bl=[0,1,2,3,0,2].map((c,i)=>({c:P[c%P.length],ph:i*1.3,sp:.05+i*.012,r:.32+((i*37)%10)/40}));
  return{resize:(w,h)=>{W=w;H=h},draw(x,t){x.clearRect(0,0,W,H);const g=x.createLinearGradient(0,0,W,H);g.addColorStop(0,ql(P[0],.28*e.alpha));g.addColorStop(1,ql(P[3]||P[1],.22*e.alpha));x.fillStyle=g;x.fillRect(0,0,W,H);
    x.globalCompositeOperation=e.dark?"lighter":"source-over";
    for(const b of bl){const cx=W*(.5+.45*Math.sin(t*b.sp+b.ph)),cy=H*(.5+.42*Math.cos(t*b.sp*1.2+b.ph*1.7)),r=Math.max(W,H)*b.r,gr=x.createRadialGradient(cx,cy,0,cx,cy,r);gr.addColorStop(0,ql(b.c,.55*e.alpha));gr.addColorStop(.6,ql(b.c,.12*e.alpha));gr.addColorStop(1,ql(b.c,0));x.fillStyle=gr;x.fillRect(0,0,W,H)}
    x.globalCompositeOperation="source-over"}}}
function __wpVagalumes(e){let W=0,H=0,f=[];const warm=[255,214,102];
  return{resize(w,h){W=w;H=h;const n=Math.min(70,Math.round(w*h/22e3));f=Array.from({length:n},(_,i)=>({x:Yl(0,w),y:Yl(0,h),a:Yl(0,__wpTau),s:Yl(.15,.5),ph:Yl(0,__wpTau),r:Yl(2,4.5),c:i%3===0?warm:e.palette[i%e.palette.length]}))},
    draw(x,t,dt){x.clearRect(0,0,W,H);x.globalCompositeOperation=e.dark?"lighter":"source-over";
      for(const p of f){p.a+=Yl(-.4,.4)*dt;p.x+=Math.cos(p.a)*p.s*dt*60;p.y+=Math.sin(p.a)*p.s*dt*60;if(p.x<-30)p.x=W+30;if(p.x>W+30)p.x=-30;if(p.y<-30)p.y=H+30;if(p.y>H+30)p.y=-30;
        const pulse=.45+.55*Math.max(0,Math.sin(t*1.6+p.ph)),R=p.r*7,g=x.createRadialGradient(p.x,p.y,0,p.x,p.y,R);g.addColorStop(0,ql(p.c,.9*e.alpha*pulse));g.addColorStop(.25,ql(p.c,.35*e.alpha*pulse));g.addColorStop(1,ql(p.c,0));x.fillStyle=g;x.beginPath();x.arc(p.x,p.y,R,0,__wpTau);x.fill()}
      x.globalCompositeOperation="source-over"}}}
function __wpGalaxia(e){let W=0,H=0,s=[];
  return{resize(w,h){W=w;H=h;const n=Math.min(700,Math.round(w*h/2600));s=Array.from({length:n},(_,i)=>{const arm=i%3,d=Math.pow(Math.random(),.6);return{d,ang:arm*__wpTau/3+d*5.2+Yl(-.35,.35),z:Yl(.6,1.6),c:e.palette[(arm+(d>.6?1:0))%e.palette.length],tw:Yl(0,__wpTau)}})},
    draw(x,t){x.clearRect(0,0,W,H);const cx=W*.62,cy=H*.48,R=Math.max(W,H)*.55,rot=t*.03;
      const core=x.createRadialGradient(cx,cy,0,cx,cy,R*.35);core.addColorStop(0,ql(e.palette[0],.45*e.alpha));core.addColorStop(1,ql(e.palette[0],0));x.fillStyle=core;x.fillRect(0,0,W,H);
      for(const p of s){const a=p.ang+rot*(1.4-p.d),r=p.d*R,px=cx+Math.cos(a)*r,py=cy+Math.sin(a)*r*.55;x.fillStyle=ql(p.c,e.alpha*(.35+.5*Math.abs(Math.sin(t*1.3+p.tw))));x.fillRect(px,py,p.z*1.6,p.z*1.6)}}}}
function __wpGrade(e){let W=0,H=0;
  return{resize:(w,h)=>{W=w;H=h},draw(x,t){x.clearRect(0,0,W,H);const hz=H*.58,c0=e.palette[0],c1=e.palette[3]||e.palette[1];
      const sky=x.createLinearGradient(0,0,0,hz);sky.addColorStop(0,ql(c1,0));sky.addColorStop(1,ql(c1,.28*e.alpha));x.fillStyle=sky;x.fillRect(0,0,W,hz);
      const sr=Math.min(W,H)*.2,sx=W*.5,sy=hz-sr*.15,sun=x.createLinearGradient(0,sy-sr,0,sy+sr);sun.addColorStop(0,ql([255,200,90],.75*e.alpha));sun.addColorStop(1,ql(c1,.6*e.alpha));
      x.save();x.beginPath();x.arc(sx,sy,sr,Math.PI,0);x.clip();x.fillStyle=sun;x.fillRect(sx-sr,sy-sr,sr*2,sr);x.restore();
      x.strokeStyle=ql(c0,.6*e.alpha);x.lineWidth=1.2;
      for(let i=-24;i<=24;i++){x.beginPath();x.moveTo(sx+i*20,hz);x.lineTo(sx+i*W*.18,H);x.stroke()}
      const off=(t*.35)%1;for(let k=0;k<14;k++){const z=(k+off)/14,y=hz+(H-hz)*z*z;x.globalAlpha=Math.min(1,z*1.6);x.beginPath();x.moveTo(0,y);x.lineTo(W,y);x.stroke()}x.globalAlpha=1}}}
function __wpFavo(e){let W=0,H=0;const S=34;
  return{resize:(w,h)=>{W=w;H=h},draw(x,t){x.clearRect(0,0,W,H);const hw=S*Math.sqrt(3),mx=W*(.5+.4*Math.sin(t*.13)),my=H*(.5+.4*Math.cos(t*.11));x.lineWidth=1.2;
      for(let row=-1;row*S*1.5<H+S;row++)for(let col=-1;col*hw<W+hw;col++){const cx=col*hw+(row%2?hw/2:0),cy=row*S*1.5,d=Math.hypot(cx-mx,cy-my),w=.5+.5*Math.sin(d/60-t*1.4),near=Math.max(0,1-d/(Math.max(W,H)*.6)),a=e.alpha*(.08+.55*w*near),c=e.palette[(row+col+99)%e.palette.length];
        x.beginPath();for(let k=0;k<6;k++){const an=__wpTau/6*k+Math.PI/6,px=cx+Math.cos(an)*S*.92,py=cy+Math.sin(an)*S*.92;k?x.lineTo(px,py):x.moveTo(px,py)}x.closePath();x.strokeStyle=ql(c,a);x.stroke();if(w*near>.75){x.fillStyle=ql(c,a*.25);x.fill()}}}}}
function __wpFeixes(e){let W=0,H=0,b=[];const mk=(w,h,i)=>({x:Yl(-w*.5,w),y:Yl(-h*.3,h),len:Yl(160,420),sp:Yl(1.2,3.2),th:Yl(1.2,3.2),c:e.palette[i%e.palette.length]});
  return{resize(w,h){W=w;H=h;b=Array.from({length:22},(_,i)=>mk(w,h,i))},draw(x,t,dt){x.clearRect(0,0,W,H);x.globalCompositeOperation=e.dark?"lighter":"source-over";const ang=-.5,ca=Math.cos(ang),sa=Math.sin(ang);
      b.forEach((p,i)=>{p.x+=ca*p.sp*dt*60;p.y+=sa*p.sp*dt*60;if(p.x>W+p.len||p.y<-p.len){Object.assign(p,mk(W,H,i));p.x=Yl(-W*.4,W*.6);p.y=H+Yl(20,200)}
        const x2=p.x-ca*p.len,y2=p.y-sa*p.len,g=x.createLinearGradient(p.x,p.y,x2,y2);g.addColorStop(0,ql(p.c,.85*e.alpha));g.addColorStop(1,ql(p.c,0));x.strokeStyle=g;x.lineWidth=p.th;x.lineCap="round";x.beginPath();x.moveTo(p.x,p.y);x.lineTo(x2,y2);x.stroke()});
      x.globalCompositeOperation="source-over"}}}
function __wpNevoa(e){let W=0,H=0,c=[];
  return{resize(w,h){W=w;H=h;c=Array.from({length:9},(_,i)=>({x:Yl(0,w),y:Yl(0,h),rx:Yl(.25,.5)*w,ry:Yl(.12,.25)*h,sp:Yl(.08,.25)*(i%2?1:-1),c:e.palette[i%e.palette.length]}))},
    draw(x,t,dt){x.clearRect(0,0,W,H);for(const p of c){p.x+=p.sp*dt*60;if(p.x-p.rx>W)p.x=-p.rx;if(p.x+p.rx<0)p.x=W+p.rx;x.save();x.translate(p.x,p.y+Math.sin(t*.2+p.rx)*20);x.scale(1,p.ry/p.rx);const g=x.createRadialGradient(0,0,0,0,0,p.rx);g.addColorStop(0,ql(p.c,.4*e.alpha));g.addColorStop(1,ql(p.c,0));x.fillStyle=g;x.beginPath();x.arc(0,0,p.rx,0,__wpTau);x.fill();x.restore()}}}}
function __wpConfete(e){let W=0,H=0,f=[];const cols=()=>e.palette.concat([[255,200,61],[255,99,146]]);const mk=(w,i,top)=>({x:Yl(0,w),y:top?Yl(-H,0):Yl(0,H),vy:Yl(.4,1.1),sw:Yl(0,__wpTau),r:Yl(0,__wpTau),vr:Yl(-2,2),w:Yl(6,11),h:Yl(3,6),c:cols()[i%cols().length],k:i%3});
  return{resize(w,h){W=w;H=h;const n=Math.min(90,Math.round(w*h/16e3));f=Array.from({length:n},(_,i)=>mk(w,i,!1))},draw(x,t,dt){x.clearRect(0,0,W,H);
      f.forEach((p,i)=>{p.y+=p.vy*dt*60;p.sw+=dt;p.r+=p.vr*dt;if(p.y>H+20)Object.assign(p,mk(W,i,!0));const px=p.x+Math.sin(p.sw)*18;x.save();x.translate(px,p.y);x.rotate(p.r);x.scale(1,Math.abs(Math.cos(p.sw*2))+.2);x.fillStyle=ql(p.c,.8*e.alpha);
        if(p.k===0)x.fillRect(-p.w/2,-p.h/2,p.w,p.h);else if(p.k===1){x.beginPath();x.arc(0,0,p.h*.8,0,__wpTau);x.fill()}else{x.beginPath();x.moveTo(0,-p.w/2);x.lineTo(p.w/2,p.w/2);x.lineTo(-p.w/2,p.w/2);x.fill()}x.restore()})}}}
function __wpPrisma(e){let W=0,H=0;
  return{resize:(w,h)=>{W=w;H=h},draw(x,t){x.clearRect(0,0,W,H);const n=7;for(let i=0;i<n;i++){const c=e.palette[i%e.palette.length],y0=H*(i/n)+Math.sin(t*.3+i)*40;x.beginPath();x.moveTo(0,y0);
      for(let px=0;px<=W;px+=24)x.lineTo(px,y0+Math.sin(px/180+t*.5+i*.9)*50+Math.sin(px/70-t*.8+i)*14);x.lineTo(W,H);x.lineTo(0,H);x.closePath();
      const g=x.createLinearGradient(0,y0-60,0,y0+H/n+60);g.addColorStop(0,ql(c,.22*e.alpha));g.addColorStop(1,ql(c,.02*e.alpha));x.fillStyle=g;x.fill();x.strokeStyle=ql(c,.5*e.alpha);x.lineWidth=1.5;x.stroke()}}}}
function __avWallNew(){return[
  {key:"gradiente",label:"Gradiente vivo",hint:"Cores do tema se misturando",fn:__wpGradiente},
  {key:"vagalumes",label:"Vaga-lumes",hint:"Luzes que piscam e passeiam",fn:__wpVagalumes},
  {key:"galaxia",label:"Galáxia",hint:"Espiral de estrelas girando",fn:__wpGalaxia},
  {key:"grade",label:"Retrô neon",hint:"Sol e grade estilo anos 80",fn:__wpGrade},
  {key:"favo",label:"Colmeia",hint:"Hexágonos acendendo em ondas",fn:__wpFavo},
  {key:"feixes",label:"Feixes de luz",hint:"Riscos de luz cruzando a tela",fn:__wpFeixes},
  {key:"nevoa",label:"Névoa",hint:"Nuvens coloridas e suaves",fn:__wpNevoa},
  {key:"prisma",label:"Camadas",hint:"Faixas de cor ondulando",fn:__wpPrisma},
  {key:"confete",label:"Confete",hint:"Comemoração discreta",fn:__wpConfete}]}

/* miniatura viva do papel de parede (desenha alguns quadros parados) */
function AvWallThumb({k,accent,dark}){
  const ref=x.useRef(null);
  x.useEffect(()=>{const cv=ref.current;if(!cv||k==="nenhum"||!nu[k])return;const c=cv.getContext("2d");cv.width=360;cv.height=220;c.setTransform(.5,0,0,.5,0,0);const w=720,h=440;const base=Kl(__avHex(accent)?accent:"#2563eb");
    const g=nu[k]({palette:__avWallPal(base),dark,alpha:dark?.95:1.05,mouse:{x:0,y:0,active:!1}});g.resize(w,h);for(let i=1;i<=10;i++)g.draw(c,i*1.7,.4)},[k,accent,dark]);
  return k==="nenhum"?(0,q.jsx)("span",{className:"pzw-none",children:"Liso"}):(0,q.jsx)("canvas",{ref,className:"pzw-cv","aria-hidden":!0});
}
function AvWallPicker({prefs:n,set:r,accent,dark}){
  const cur=n.wallpaper||"nenhum";
  return (0,q.jsxs)("div",{className:"pzw",children:[
    (0,q.jsx)("div",{className:"pzw-grid",children:Gl.map(e=>(0,q.jsxs)("button",{type:"button",className:"pzw-it"+(cur===e.key?" on":""),"aria-pressed":cur===e.key,"aria-label":"Papel de parede: "+e.label,title:e.hint,onClick:()=>r({wallpaper:e.key}),children:[
      (0,q.jsx)("span",{className:"pzw-th",style:{background:dark?"#0d0f14":"#eef1f6"},children:(0,q.jsx)(AvWallThumb,{k:e.key,accent,dark})}),(0,q.jsx)("strong",{children:e.label})]},e.key))}),
    cur!=="nenhum"&&(0,q.jsxs)("div",{className:"pzw-int",children:[(0,q.jsx)("span",{children:"Intensidade"}),(0,q.jsx)("div",{className:"seg compact",children:au.map(e=>(0,q.jsx)("button",{type:"button",className:Math.abs((n.wallpaperIntensity??.7)-e.value)<.01?"on":"","aria-pressed":Math.abs((n.wallpaperIntensity??.7)-e.value)<.01,onClick:()=>r({wallpaperIntensity:e.value}),children:e.label},e.value))})]})]});
}

/* =====================================================================
   ZÊNITE DS — sistema de cores único (tokens). Tudo deriva de: modo + cor de destaque (+ cor 2).
   Regras: fundo e cartões neutros levemente tingidos; a cor forte aparece só em destaque
   (faixa de boas-vindas, botões, aba ativa, indicadores). Moldura (menu + barra de colegas) escura
   nos dois modos. Texto sempre calculado pelo contraste da superfície onde está.
   ===================================================================== */
function __avShade(c,toward,minC,against){let x=c;for(let i=0;i<24&&__avContrast(x,against)<minC;i++)x=__avMix(x,toward,.88);return x}
function __avDS(l,dark){
  const root=document.documentElement,st=root.style;
  const ar=(l.areasV===2&&(l.areas||{})[dark?"dark":"light"])||{};
  const A=__avHex(ar.accent)?ar.accent:__avHex(l.accent)?l.accent:"#2563eb",B=__avHex(l.accent2)?l.accent2:A;
  const T={};
  if(dark){
    T.bg=__avMix(A,"#0b0c10",.05);T.surface=__avMix(A,"#15171c",.055);T.surface2=__avMix(A,"#101216",.05);
    T.frame=__avMix(A,"#07080b",.07);
  }else{
    T.bg=__avMix(A,"#f1f3f7",.045);T.surface="#ffffff";T.surface2=__avMix(A,"#f6f7fa",.035);
    T.frame=__avMix(A,"#12141b",.13);
  }
  const okMode=c=>__avHex(c)&&(dark?__avLum(c)<.18:__avLum(c)>.55);
  if(okMode(ar.bg))T.bg=ar.bg;
  if(__avHex(ar.card)&&okMode(ar.card)){T.surface=ar.card;T.surface2=__avMix(ar.card,__avLum(ar.card)>.4?"#000000":"#ffffff",.96)}
  if(__avHex(ar.rail)&&okMode(ar.rail))T.frame=ar.rail;
  const lightS=__avLum(T.surface)>.4;
  T.text=lightS?"#151821":"#eceef3";T.text2=lightS?"#4a5161":"#a9aebb";T.text3=lightS?"#7b8292":"#7f8593";T.heading=lightS?"#0d1016":"#ffffff";
  T.line=lightS?__avMix(A,"#e2e5eb",.07):__avMix("#ffffff",T.surface,.085);
  T.lineStrong=lightS?__avMix(A,"#cbd0d9",.09):__avMix("#ffffff",T.surface,.15);
  /* destaque legível sobre a superfície */
  T.accent=lightS?__avShade(A,"#000000",3.2,T.surface):__avShade(A,"#ffffff",3.6,T.surface);
  T.accentSoft=__avMix(A,T.surface,lightS?.1:.16);
  T.accentInk=__avContrast(T.accent,"#ffffff")>=3?"#ffffff":"#111318";
  /* faixa de boas-vindas: tons da própria cor, escurecidos até o texto branco ficar confortável */
  let h1=__avHex(ar.hero)?ar.hero:A;h1=__avShade(h1,"#05060a",dark?6:5,"#ffffff");
  let h2=__avShade(__avMix(h1,B,.8),"#05060a",dark?6:5,"#ffffff");
  T.hero1=h1;T.hero2=h2;
  /* moldura: menu e barra de colegas iguais (a barra pode ter cor própria) */
  const fr=__avHex(ar.strip)?ar.strip:__avHex(l.friends)?l.friends:l.friends==="tema"?h1:T.frame;
  const fInk=c=>__avLum(c)>.4?["#151821","#4a5161"]:["#f1f2f5","#a7acb8"];
  const ri=fInk(T.frame),fi=fInk(fr);
  const set={
    /* tokens do app original */
    "--bg":T.bg,"--surface":T.surface,"--surface-2":T.surface2,"--line":T.line,"--line-strong":T.lineStrong,
    "--text":T.text,"--text-2":T.text2,"--text-3":T.text3,"--heading":T.heading,"--accent-fg":T.accent,
    "--navy-600":T.accent,"--navy-700":T.accent,"--navy-800":T.accent,"--blue-500":T.accent,"--blue-400":T.accent,
    "--blue-100":T.accentSoft,"--blue-50":__avMix(A,T.surface,lightS?.06:.1),"--hover-ghost":lightS?"#1518210d":"#ffffff0d",
    "--header-bg":T.bg,"--glass":T.surface,"--glass-border":T.line,"--table-head":T.surface2,"--chart-bar":T.accent,
    "--shadow-1":lightS?"0 1px 2px #1518210d,0 1px 3px #1518210a":"0 1px 2px #00000066",
    "--shadow-2":lightS?"0 10px 30px #15182114,0 2px 6px #1518210d":"0 12px 32px #00000099",
    /* tokens Zênite */
    "--accent":T.accent,"--accent2":B,"--accent-strong":__avMix(T.accent,"#000000",.78),"--avaccentsoft":T.accentSoft,"--avaccentink":T.accentInk,
    "--avbg":T.bg,"--avcard":T.surface,"--avcard2":T.surface2,"--avink":T.text,"--avink2":T.text2,"--avink3":T.text3,
    "--avbgink":__avLum(T.bg)>.4?"#151821":"#eceef3","--avbgink2":__avLum(T.bg)>.4?"#4a5161":"#a9aebb",
    "--avhero":h1,"--avhero1":h1,"--avhero2":h2,"--avheroink":"#ffffff","--avheroink2":"#ffffffcc",
    "--avrail":T.frame,"--avrailink":ri[0],"--avrailink2":ri[1],"--avframe":T.frame,
    "--avstrip1":fr,"--avstrip2":fr,"--avstripink":fi[0],"--avstripink2":fi[1],
    /* gráfico do dia: tons firmes, sem neon */
    "--avdonut-todo":lightS?__avShade(__avMix(B,"#000000",.86),"#000000",2.4,T.surface):__avShade(__avMix(B,"#000000",.8),"#000000",1,T.surface),
    "--avdonut-late":lightS?"#d14552":"#d9545f","--avdonut-wait":lightS?"#a7afbd":"#4f5766",
    "--avfriends":fr,"--avfriendsink":fi[0],"--avfriendsedge":__avLum(fr)>.4?"#00000022":"#ffffff12",
  };
  for(const k in set)st.setProperty(k,set[k]);
  root.classList.toggle("av-cardlight",lightS);root.classList.toggle("av-herolight",!1);
  root.classList.add("av-ds");
  root.classList.toggle("av-fr-custom",!!(__avHex(ar.strip)||__avHex(l.friends)||l.friends==="tema"));
  /* papel de parede: classe por estilo (desfoque suave nos de luz, leve nos de partículas) */
  [...root.classList].filter(c=>c.startsWith("avwp-")).forEach(c=>root.classList.remove(c));
  if(l.wallpaper&&l.wallpaper!=="nenhum")root.classList.add("avwp-"+l.wallpaper);
  return T;
}

/* paleta do papel de parede: só tons vizinhos da cor do tema + a cor 2 (nada de cores estranhas) */
function __avWallPal(c){
  let b=null;try{const v=getComputedStyle(document.documentElement).getPropertyValue("--accent2").trim();if(/^#[0-9a-f]{6}$/i.test(v))b=Kl(v)}catch{}
  const mix=(x,y,w)=>x.map((v,i)=>Math.round(v*w+y[i]*(1-w)));
  return [c,Jl(c,14),b?mix(b,c,.7):Jl(c,-14),mix(c,[255,255,255],.72)];
}

/* Quadro da equipe: "Concluída" separada por dia, igual à caixa de e-mail (Hoje, Ontem, Terça-feira…) */
function __avDayKey(iso){
  const d=new Date(iso||0);if(isNaN(d))return{key:"z",label:"Sem data",ord:-1};
  const day=new Date(d.getFullYear(),d.getMonth(),d.getDate()),now=new Date(),today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const diff=Math.round((today-day)/864e5);
  if(diff<=0)return{key:"d0",label:"Hoje",ord:1e9};
  if(diff===1)return{key:"d1",label:"Ontem",ord:1e9-1};
  if(diff<7){const w=day.toLocaleDateString("pt-BR",{weekday:"long"});return{key:"d"+diff,label:w.charAt(0).toUpperCase()+w.slice(1),ord:1e9-diff}}
  if(diff<14)return{key:"w1",label:"Semana passada",ord:1e9-10};
  if(diff<31)return{key:"w2",label:"Há mais de duas semanas",ord:1e9-20};
  const m=day.toLocaleDateString("pt-BR",{month:"long",year:day.getFullYear()===today.getFullYear()?void 0:"numeric"});
  return{key:"m"+day.getFullYear()+"-"+day.getMonth(),label:m.charAt(0).toUpperCase()+m.slice(1),ord:day.getFullYear()*12+day.getMonth()};
}
function AvDayGroup({gk,label,count,defOpen,children}){
  const key="av-dg-"+gk;
  const[open,setOpen]=x.useState(()=>{try{const v=localStorage.getItem(key);return v===null?defOpen:v==="1"}catch{return defOpen}});
  const flip=()=>setOpen(v=>{const n=!v;try{localStorage.setItem(key,n?"1":"0")}catch{}return n});
  return (0,q.jsxs)("div",{className:"avdg"+(open?" is-open":""),children:[
    (0,q.jsxs)("button",{type:"button",className:"avdg-h","aria-expanded":open,onClick:flip,children:[
      (0,q.jsx)("svg",{className:"avfold-ar",viewBox:"0 0 24 24",width:13,height:13,"aria-hidden":!0,children:(0,q.jsx)("path",{d:"M9 6l6 6-6 6",fill:"none",stroke:"currentColor",strokeWidth:2.6,strokeLinecap:"round",strokeLinejoin:"round"})}),
      (0,q.jsx)("span",{children:label}),(0,q.jsx)("span",{className:"avdg-n",children:count})]}),
    open?(0,q.jsx)("div",{className:"avdg-items",children}):null]});
}
/* colunas longas: mostra os 6 primeiros e um botão "Ver mais" (lembra a escolha por coluna) */
function AvMore({col,rest,render}){
  const key="av-more-"+col;
  const[open,setOpen]=x.useState(()=>{try{return localStorage.getItem(key)==="1"}catch{return!1}});
  const flip=()=>setOpen(v=>{const n=!v;try{localStorage.setItem(key,n?"1":"0")}catch{}return n});
  return (0,q.jsxs)(q.Fragment,{children:[open?rest.map(render):null,
    (0,q.jsx)("button",{type:"button",className:"avmore",onClick:flip,"aria-expanded":open,children:open?"Mostrar menos":"Ver mais "+rest.length+(rest.length===1?" cartão":" cartões")})]});
}
function __avDayGroups(col,list,render){
  if(col!=="concluida")return list.length>6?[...list.slice(0,6).map(render),(0,q.jsx)(AvMore,{col,rest:list.slice(6),render},"av-more")]:list.map(render);
  if(list.length<2)return list.map(render);
  const groups=new Map();
  [...list].sort((a,b)=>String(b.it.completed_at||b.it.updated_at||"").localeCompare(String(a.it.completed_at||a.it.updated_at||""))).forEach(o=>{
    const k=__avDayKey(o.it.completed_at||o.it.updated_at);if(!groups.has(k.key))groups.set(k.key,{...k,items:[]});groups.get(k.key).items.push(o)});
  return [...groups.values()].sort((a,b)=>b.ord-a.ord).map(g=>(0,q.jsx)(AvDayGroup,{gk:g.key,label:g.label,count:g.items.length,defOpen:g.key==="d0"||g.key==="d1",children:g.items.map(render)},g.key));
}

/* Equipe online — cartão pequeno na coluna da direita (no lugar da faixa preta na borda) */
function AvFriends(){
  const{people}=usePresence();
  const{peers}=useChatSummary();
  const[all,setAll]=x.useState(!1);
  if(!people)return null;
  const me=window.__avUid;
  const list=[...people].sort((a,b)=>(b.online?1:0)-(a.online?1:0)||(a.id===me?-1:b.id===me?1:0)||a.name.localeCompare(b.name,"pt-BR"));
  const on=list.filter(p=>p.online).length;
  const shown=all?list:list.slice(0,5);
  const open=id=>window.dispatchEvent(new CustomEvent("prumo:chat",{detail:{peer:id}}));
  return (0,q.jsxs)("section",{className:"panel avf","aria-label":"Equipe online",children:[
    (0,q.jsxs)("header",{className:"avf-h",children:[(0,q.jsx)("h2",{children:"Equipe online"}),(0,q.jsxs)("span",{className:"avf-c",children:[on,(0,q.jsxs)("small",{children:["/",list.length]})]}),
      list.length>5&&(0,q.jsx)("button",{type:"button",className:"avf-all",onClick:()=>setAll(v=>!v),children:all?"menos":"todos"})]}),
    (0,q.jsx)("ul",{className:"avf-list",children:shown.map(p=>{const u=peers[p.id]&&peers[p.id].unread,mine=p.id===me;
      return (0,q.jsx)("li",{children:(0,q.jsxs)("button",{type:"button",className:"avf-row"+(p.online?" on":""),disabled:mine,onClick:()=>open(p.id),title:mine?"Você":"Conversar com "+p.name,children:[
        (0,q.jsxs)("span",{className:"avf-ph",children:[(0,q.jsx)(AvPhoto,{id:p.id,name:p.name,size:34}),(0,q.jsx)("i",{className:"avf-dot"})]}),
        (0,q.jsxs)("span",{className:"avf-t",children:[(0,q.jsx)("strong",{children:mine?p.name+" (você)":p.name}),(0,q.jsx)("small",{children:p.online?(p.working?"Trabalhando agora":"Online"):"Offline"})]}),
        u>0?(0,q.jsx)("b",{className:"avf-u",children:u}):!mine&&(0,q.jsx)("svg",{className:"avf-go",viewBox:"0 0 24 24",width:16,height:16,"aria-hidden":!0,children:(0,q.jsx)("path",{d:"M4 5h16v11H8l-4 4z",fill:"none",stroke:"currentColor",strokeWidth:1.8,strokeLinejoin:"round"})})]})},p.id)})})]});
}

/* Importar do sistema antigo — como "importar favoritos" de outro navegador */
function AvImportOld(){
  const[open,setOpen]=x.useState(!1);
  const[f,setF]=x.useState({name:"",password:"",team:!0,shared:!0,mine:!0,replaceMine:!1});
  const[busy,setBusy]=x.useState(!1),[res,setRes]=x.useState(null),[err,setErr]=x.useState("");
  const isAdmin=(()=>{try{return Wi.auth?.me?.role==="admin"}catch{return!1}})();
  x.useEffect(()=>{const o=()=>{setOpen(!0);setRes(null);setErr("");setF(v=>({...v,password:"",name:v.name||Wi.auth?.me?.name||""}))};addEventListener("av:import",o);return()=>removeEventListener("av:import",o)},[]);
  const go=async()=>{setBusy(!0);setErr("");try{const j=await __avJson("/import/old",{method:"POST",body:f});setRes(j);setF(v=>({...v,password:""}));try{localStorage.setItem("av-import-done","1")}catch{}window.dispatchEvent(new Event("av:imported"))}catch(e){setErr(e.message||"Não foi possível importar.")}finally{setBusy(!1)}};
  const chk=(k,label,hint)=>(0,q.jsxs)("label",{className:"avi-opt",children:[(0,q.jsx)("input",{type:"checkbox",checked:!!f[k],onChange:e=>setF({...f,[k]:e.target.checked})}),(0,q.jsxs)("span",{children:[(0,q.jsx)("strong",{children:label}),(0,q.jsx)("small",{children:hint})]})]});
  const line=(ok,txt)=>(0,q.jsxs)("li",{className:ok?"ok":"",children:[(0,q.jsx)("i",{children:ok?"✓":"–"}),txt]});
  return (0,q.jsx)(dl,{open,title:"Importar do sistema antigo",label:"Importar do sistema antigo",onClose:()=>setOpen(!1),className:"avi-modal",footer:res?(0,q.jsx)("button",{className:"btn primary",onClick:()=>location.reload(),children:"Concluir e atualizar"}):(0,q.jsxs)(q.Fragment,{children:[(0,q.jsx)("button",{className:"btn",onClick:()=>setOpen(!1),children:"Cancelar"}),(0,q.jsx)("button",{className:"btn primary",disabled:busy||!f.name.trim()||!f.password||!(f.team||f.shared||f.mine),onClick:go,children:busy?"Importando…":"Importar"})]}),children:res?(0,q.jsxs)("div",{className:"avi-res",children:[
      (0,q.jsx)("p",{children:"Pronto! Veja o que veio:"}),
      (0,q.jsxs)("ul",{children:[
        res.team&&line(res.team.cards>0,`Atividades da equipe: ${res.team.cards} cartão(ões) novo(s)`+(res.team.pending&&res.team.pending.length?` · guardados para quem ainda vai criar conta: ${res.team.pending.join(", ")}`:"")),
        res.shared&&line(res.shared.added>0,`Tarefas do calendário: ${res.shared.added} nova(s)`),
        res.mine&&line(res.mine.status==="importado",res.mine.status==="importado"?"Minhas tarefas, projetos e esperas: importados":res.mine.status==="ja_tem_dados"?"Minhas tarefas: você já tem dados aqui — marque “Substituir” para trazer os do sistema antigo":"Minhas tarefas: nada para trazer")]}),
      (0,q.jsx)("small",{className:"muted",children:"Pode importar de novo quando quiser: o que já foi trazido não se repete."})]}):(0,q.jsxs)("div",{className:"avi",children:[
      (0,q.jsx)("p",{className:"avi-lead",children:"Traga suas tarefas do sistema antigo (avant-central-trabalho) para cá, como quem importa os favoritos de outro navegador. Use o nome e a senha que você usava lá — a senha não fica guardada."}),
      (0,q.jsxs)("div",{className:"avi-grid",children:[
        (0,q.jsxs)("label",{className:"field",children:[(0,q.jsx)("span",{children:"Nome no sistema antigo"}),(0,q.jsx)("input",{className:"input",value:f.name,onChange:e=>setF({...f,name:e.target.value}),autoComplete:"off"})]}),
        (0,q.jsxs)("label",{className:"field",children:[(0,q.jsx)("span",{children:"Senha do sistema antigo"}),(0,q.jsx)("input",{className:"input",type:"password",value:f.password,onChange:e=>setF({...f,password:e.target.value}),autoComplete:"off",onKeyDown:e=>e.key==="Enter"&&go()})]})]}),
      (0,q.jsx)("h4",{className:"avi-h",children:"O que importar"}),
      chk("team","Atividades da equipe",isAdmin?"O quadro de toda a equipe (você é administrador)":"Os seus cartões do quadro da equipe"),
      chk("shared","Tarefas do calendário da equipe","Tarefas compartilhadas que você enxergava"),
      chk("mine","Minhas tarefas, projetos e esperas","Seus dados pessoais do sistema antigo"),
      f.mine&&(0,q.jsx)("div",{className:"avi-sub",children:chk("replaceMine","Substituir o que já tenho aqui","Só se você já criou tarefas pessoais no sistema novo e prefere as do antigo")}),
      err&&(0,q.jsx)("div",{className:"error-box",children:err})]})});
}

/* Orbe da I.A.: esfera de vidro com cores do tema girando por dentro, brilho especular e borda de luz */
function AvOrb({size=56}){
  const id=x.useRef("o"+Math.random().toString(36).slice(2,8)).current;
  const S=(c)=>({stopColor:c});
  return (0,q.jsxs)("svg",{className:"av-orb",viewBox:"0 0 100 100",width:size,height:size,"aria-hidden":!0,children:[
    (0,q.jsxs)("defs",{children:[
      (0,q.jsx)("clipPath",{id:id+"c",children:(0,q.jsx)("circle",{cx:"50",cy:"50",r:"46"})}),
      (0,q.jsxs)("radialGradient",{id:id+"b",cx:"50%",cy:"45%",r:"60%",children:[(0,q.jsx)("stop",{offset:"0",style:S("color-mix(in srgb,var(--accent) 55%,#fff)")}),(0,q.jsx)("stop",{offset:".55",style:S("var(--accent)")}),(0,q.jsx)("stop",{offset:"1",style:S("color-mix(in srgb,var(--accent) 35%,#05060c)")})]}),
      (0,q.jsx)("filter",{id:id+"f",x:"-50%",y:"-50%",width:"200%",height:"200%",children:(0,q.jsx)("feGaussianBlur",{stdDeviation:"7"})}),
      (0,q.jsx)("filter",{id:id+"g",x:"-50%",y:"-50%",width:"200%",height:"200%",children:(0,q.jsx)("feGaussianBlur",{stdDeviation:"2.2"})}),
      (0,q.jsxs)("radialGradient",{id:id+"v",cx:"50%",cy:"50%",r:"50%",children:[(0,q.jsx)("stop",{offset:".62",stopColor:"#000",stopOpacity:"0"}),(0,q.jsx)("stop",{offset:"1",stopColor:"#000",stopOpacity:".55"})]}),
      (0,q.jsxs)("linearGradient",{id:id+"r",x1:"0",y1:"0",x2:"1",y2:"1",children:[(0,q.jsx)("stop",{offset:".55",stopColor:"#fff",stopOpacity:"0"}),(0,q.jsx)("stop",{offset:"1",stopColor:"#fff",stopOpacity:".75"})]})]}),
    (0,q.jsxs)("g",{clipPath:"url(#"+id+"c)",children:[
      (0,q.jsx)("rect",{width:"100",height:"100",fill:"url(#"+id+"b)"}),
      (0,q.jsxs)("g",{className:"av-orb-swirl-static",filter:"url(#"+id+"f)",children:[
        (0,q.jsx)("ellipse",{cx:"36",cy:"62",rx:"30",ry:"14",transform:"rotate(-35 36 62)",style:{fill:"var(--accent2)"},opacity:".95"}),
        (0,q.jsx)("ellipse",{cx:"66",cy:"40",rx:"26",ry:"12",transform:"rotate(30 66 40)",style:{fill:"color-mix(in srgb,var(--accent) 45%,#ff3fd0)"},opacity:".9"}),
        (0,q.jsx)("ellipse",{cx:"52",cy:"30",rx:"16",ry:"9",style:{fill:"color-mix(in srgb,var(--accent) 50%,#06070f)"},opacity:".85"}),
        (0,q.jsx)("ellipse",{cx:"58",cy:"74",rx:"18",ry:"8",transform:"rotate(-10 58 74)",style:{fill:"color-mix(in srgb,var(--accent) 60%,#7c4dff)"},opacity:".9"})]}),
      (0,q.jsx)("rect",{width:"100",height:"100",fill:"url(#"+id+"v)"}),
      (0,q.jsx)("path",{d:"M12 58a40 40 0 0 0 64 26a44 44 0 0 1-64-26z",fill:"url(#"+id+"r)",opacity:".55",filter:"url(#"+id+"g)"}),
      (0,q.jsx)("ellipse",{cx:"34",cy:"26",rx:"17",ry:"10",transform:"rotate(-28 34 26)",fill:"#fff",opacity:".55",filter:"url(#"+id+"g)"}),
      (0,q.jsx)("ellipse",{cx:"30",cy:"23",rx:"6",ry:"3.2",transform:"rotate(-28 30 23)",fill:"#fff",opacity:".9"})]}),
    (0,q.jsx)("circle",{cx:"50",cy:"50",r:"45.5",fill:"none",stroke:"#fff",strokeOpacity:".28",strokeWidth:"1"})]});
}

/* resolução do papel de parede: luzes/gradientes em 1/4 (fica naturalmente desfocado e leve); partículas em 1/2 */
function __avWallRes(k){return ["constelacao","estrelas","vagalumes","galaxia","confete","bolhas","formas","feixes","favo","grade"].includes(k)?.5:.25}

/* Aviso na Home: trazer tudo do sistema antigo (some depois de importar ou ao dispensar) */
function AvImportBanner(){
  const[hide,setHide]=x.useState(()=>{try{return localStorage.getItem("av-import-done")==="1"}catch{return!1}});
  x.useEffect(()=>{const f=()=>setHide(!0);addEventListener("av:imported",f);return()=>removeEventListener("av:imported",f)},[]);
  if(hide)return null;
  const close=()=>{try{localStorage.setItem("av-import-done","1")}catch{}setHide(!0)};
  return (0,q.jsxs)("div",{className:"avib",role:"note",children:[
    (0,q.jsxs)("div",{className:"avib-t",children:[(0,q.jsx)("strong",{children:"Traga tudo do sistema antigo"}),(0,q.jsx)("span",{children:"Suas tarefas, projetos, esperas e o quadro da equipe — em um clique, com o login que você usava lá."})]}),
    (0,q.jsx)("button",{className:"btn primary",onClick:()=>window.dispatchEvent(new Event("av:import")),children:"Importar agora"}),
    (0,q.jsx)("button",{className:"btn ghost",onClick:close,children:"Agora não"})]});
}

/* marca quando a Home está aberta (o grupo de configurações do topo só aparece nela) */
function AvHomeFlag(){x.useEffect(()=>{const r=document.documentElement;r.classList.add("av-on-home");return()=>r.classList.remove("av-on-home")},[]);return null}

/* Relatórios → PDF: gera um arquivo PDF de verdade (jsPDF) com indicadores, semanas, prioridades,
   status e projetos. Se a biblioteca não carregar, abre a versão para imprimir/salvar como PDF. */
function __avLoadScript(src){return new Promise((ok,no)=>{if(document.querySelector('script[src="'+src+'"]'))return ok();const s=document.createElement("script");s.src=src;s.onload=ok;s.onerror=no;document.head.appendChild(s)})}
async function __avReportPdf(e){
  const hoje=new Date(),dt=hoje.toLocaleDateString("pt-BR"),hr=hoje.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
  const who=(()=>{try{return Wi.auth?.me?.name||""}catch{return""}})();
  const ent=(o,lab)=>Object.entries(o||{}).sort((a,b)=>b[1]-a[1]).map(([k,v])=>[lab?.[k]??k,String(v)]);
  const kpis=[["Tarefas registradas",e.totals.tasks,e.totals.open+" abertas"],["Concluídas",e.totals.completed,e.totals.cancelled+" cancelada(s)"],["Atrasadas",e.overdue,"entre as abertas"],["Sem prazo",e.without_due,"abertas sem data"],["Tempo médio até concluir",e.avg_lead_time_days??"—",e.avg_lead_time_days==null?"ainda sem conclusões":"dias corridos"]];
  const weeks=(e.weeks||[]).map(w=>[new Date(w.week+"T12:00:00").toLocaleDateString("pt-BR"),String(w.created),String(w.completed),String(w.captures)]);
  const projs=(e.projects||[]).map(p=>[p.name,`${p.progress.done}/${p.progress.total} (${p.progress.percent??0}%)`,String(p.open),String(p.overdue)]);
  const nome=`relatorio-ritmo-${hoje.toISOString().slice(0,10)}.pdf`;
  try{
    await __avLoadScript("/vendor/jspdf.umd.min.js");
    await __avLoadScript("/vendor/jspdf.plugin.autotable.min.js");
    const{jsPDF}=window.jspdf;const d=new jsPDF({unit:"pt",format:"a4"});const W=d.internal.pageSize.getWidth();
    const ac=getComputedStyle(document.documentElement).getPropertyValue("--accent").trim()||"#2563eb";
    const rgb=h=>{h=h.replace("#","");return[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]};const A=/^#[0-9a-f]{6}$/i.test(ac)?rgb(ac):[37,99,235];
    d.setFillColor(...A);d.rect(0,0,W,78,"F");
    d.setTextColor(255,255,255);d.setFont("helvetica","bold");d.setFontSize(20);d.text("Relatório de acompanhamento",40,40);
    d.setFont("helvetica","normal");d.setFontSize(10);d.text(`Ritmo · Rotina da equipe  —  gerado em ${dt} às ${hr}${who?"  por "+who:""}`,40,60);
    let y=104;d.setTextColor(30,33,40);
    const bw=(W-80-16)/5;kpis.forEach((k,i)=>{const x=40+i*(bw+4);d.setDrawColor(225,229,236);d.setFillColor(247,248,251);d.roundedRect(x,y,bw,64,6,6,"FD");
      d.setFontSize(7.5);d.setTextColor(110,116,130);d.text(String(k[0]).toUpperCase(),x+8,y+15,{maxWidth:bw-12});
      d.setFontSize(18);d.setTextColor(20,22,28);d.setFont("helvetica","bold");d.text(String(k[1]),x+8,y+40);d.setFont("helvetica","normal");
      d.setFontSize(7.5);d.setTextColor(120,126,140);d.text(String(k[2]),x+8,y+55,{maxWidth:bw-12})});
    y+=88;
    const sec=(t)=>{d.setFont("helvetica","bold");d.setFontSize(12);d.setTextColor(20,22,28);d.text(t,40,y);d.setFont("helvetica","normal");y+=8};
    const tbl=(head,body,opts={})=>{d.autoTable({startY:y,head:[head],body:body.length?body:[[{content:"Sem dados",colSpan:head.length}]],margin:{left:40,right:40},theme:"grid",
      headStyles:{fillColor:A,textColor:255,fontStyle:"bold",fontSize:9},bodyStyles:{fontSize:9,textColor:[35,38,46]},alternateRowStyles:{fillColor:[247,248,251]},styles:{lineColor:[225,229,236],lineWidth:.5,cellPadding:5},...opts});y=d.lastAutoTable.finalY+22};
    sec("Ritmo das últimas 8 semanas");tbl(["Semana de","Criadas","Concluídas","Capturas"],weeks);
    sec("Abertas por prioridade");tbl(["Prioridade","Quantidade"],ent(e.by_priority,typeof Yc!=="undefined"?Yc:null));
    sec("Todas por status");tbl(["Status","Quantidade"],ent(e.by_status,typeof Jc!=="undefined"?Jc:null));
    sec("Projetos");tbl(["Projeto","Progresso real","Abertas","Atrasadas"],projs);
    if(e.by_responsible){sec("Abertas por responsável");tbl(["Responsável","Quantidade"],ent(e.by_responsible))}
    if(e.by_category){sec("Abertas por categoria");tbl(["Categoria","Quantidade"],ent(e.by_category))}
    const n=d.getNumberOfPages();for(let i=1;i<=n;i++){d.setPage(i);d.setFontSize(8);d.setTextColor(140,146,160);d.text(`Página ${i} de ${n}`,W-40,d.internal.pageSize.getHeight()-20,{align:"right"});d.text("Números calculados dos registros atuais do sistema",40,d.internal.pageSize.getHeight()-20)}
    d.save(nome);return!0;
  }catch(err){
    const esc=t=>String(t).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"})[c]);
    const t=(h,b)=>`<table><thead><tr>${h.map(x=>`<th>${esc(x)}</th>`).join("")}</tr></thead><tbody>${(b.length?b:[["Sem dados"]]).map(r=>`<tr>${r.map(x=>`<td>${esc(x)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    const w=window.open("","_blank");if(!w)return!1;
    w.document.write(`<!doctype html><meta charset="utf-8"><title>${nome}</title><style>body{font:13px system-ui;margin:32px;color:#1d2028}h1{margin:0 0 4px}small{color:#667}table{width:100%;border-collapse:collapse;margin:8px 0 22px}th,td{border:1px solid #e1e5ec;padding:6px 8px;text-align:left}th{background:#2563eb;color:#fff}.k{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:18px 0}.k div{border:1px solid #e1e5ec;border-radius:8px;padding:10px}.k b{font-size:20px;display:block}<\/style><h1>Relatório de acompanhamento</h1><small>Ritmo · gerado em ${dt} às ${hr}</small><div class="k">${kpis.map(k=>`<div><small>${esc(k[0])}</small><b>${esc(k[1])}</b><small>${esc(k[2])}</small></div>`).join("")}</div><h3>Ritmo das últimas 8 semanas</h3>${t(["Semana de","Criadas","Concluídas","Capturas"],weeks)}<h3>Abertas por prioridade</h3>${t(["Prioridade","Quantidade"],ent(e.by_priority))}<h3>Todas por status</h3>${t(["Status","Quantidade"],ent(e.by_status))}<h3>Projetos</h3>${t(["Projeto","Progresso","Abertas","Atrasadas"],projs)}<script>setTimeout(()=>print(),300)<\/script>`);
    w.document.close();return!0;
  }
}
function AvReportPdfBtn({data}){
  const[b,setB]=x.useState(!1);
  return (0,q.jsxs)("button",{type:"button",className:"btn primary",disabled:b||!data,onClick:async()=>{setB(!0);try{await __avReportPdf(data)}finally{setB(!1)}},children:[(0,q.jsx)("svg",{viewBox:"0 0 24 24",width:16,height:16,fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":!0,children:(0,q.jsx)("path",{d:"M12 4v11M7 10l5 5l5-5M5 20h14"})})," ",b?"Gerando PDF…":"Baixar relatório (PDF)"]});
}
