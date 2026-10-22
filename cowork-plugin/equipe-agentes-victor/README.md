# equipe-agentes-victor

Equipe de agentes para o Claude Cowork. Ao instalar o plugin, qualquer pedido de trabalho em qualquer projeto passa pelo Coordenador (skill `coordenar-equipe`), que encaminha a tarefa ao especialista:

| Agente | Faz | Pode alterar arquivos? |
|---|---|---|
| arquiteto | requisitos e plano | só o arquivo do plano |
| desenvolvedor | sites, sistemas, código, DAX, consultas | sim, só os atribuídos |
| analista-dados | Excel, CSV, Power BI, indicadores | só arquivos de saída novos |
| automacao | scripts, rotinas, integrações | sim, só os atribuídos |
| testes | executa e verifica, aponta falhas | não |
| revisor | qualidade, segurança, privacidade | não |

Para direcionar um projeto, coloque nas instruções dele, por exemplo: "Neste projeto, o agente principal é o analista-dados; o revisor confere toda entrega".
