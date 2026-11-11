# AGIRMENTE

Seu jeito de pensar. Sua maneira de transformar.

MVP web responsivo para capturar pensamentos, organizar atividades e escolher um próximo passo sem pressão.

## O que já funciona

- Seis áreas de navegação: Início, Foco agora, Minha fila, Saúde, Assistente e Perfil.
- Captura rápida por texto; captura por voz nos navegadores que disponibilizam reconhecimento de fala.
- Persistência local no navegador quando o Supabase ainda não está configurado.
- Fila com busca, filtros por estado/categoria/etiqueta e ordenação por data, prioridade ou duração; visualização em lista, agenda e quadro Kanban.
- Backlog separado para capturas que ainda precisam de contexto e seletor de Foco agora sem sair da aba.
- Etiquetas coloridas por atividade; cobranças podem ser registradas, adiadas para uma data de retorno ou concluídas e arquivadas.
- Foco do dia escolhido manualmente, com até três atividades.
- Atividades com checklist de várias etapas, estimativa opcional, recorrência flexível, lembretes, notas e histórico.
- Preferências para tema claro, escuro verde ou automático, contraste reforçado e redução de animações; exclusões podem ser desfeitas por oito segundos.
- Área Saúde para configurar meta e capacidade da garrafa, registrar hidratação, acompanhar um medidor visual e ativar lembretes enquanto o app estiver aberto.
- Categorias pessoais e perfil editável.
- Assistente sem API paga: sugere categoria, prioridade, prazo relativo, duração e etiquetas durante a captura; recomenda prioridades e responde a comandos locais de conclusão, pausa, detalhes e foco.
- Histórico do assistente limitado aos últimos sete dias.
- Login por e-mail e senha quando as variáveis Supabase são informadas.

## Rodar localmente

1. Instale uma versão atual do Node.js e pnpm.
2. Execute `pnpm install` e `pnpm dev`.
3. Abra o endereço local mostrado pelo Vite.

Sem configuração Supabase, o aplicativo abre em modo local e informa que os dados ficam apenas neste navegador. Esse modo facilita experimentar os fluxos, mas não sincroniza dados entre dispositivos nem oferece autenticação.

## Supabase configurado

O repositório está ligado ao projeto Supabase `organizador-pessoal`. A extensão [`supabase/schema.sql`](supabase/schema.sql) acrescenta categoria, detalhes de cobrança, etapas, foco do dia, estimativa, lembretes, recorrência e cores de etiqueta à tabela `tasks`; também cria `water_logs` com RLS e acesso limitado à própria conta.

O endereço e a chave **publishable** ficam em `.env.local`, que é ignorado pelo Git. Nunca coloque uma chave `service_role` ou `secret` no cliente. O login é feito pelo Supabase Auth com e-mail e senha. Nome, categorias e preferências visuais são salvos no metadado editável do próprio usuário e não são usados em regras de autorização. O histórico do assistente fica neste navegador por até sete dias; atividades e perfil sincronizam pela conta.

Os lembretes usam notificações do navegador e são disparados enquanto o AGIRMENTE está aberto. Sem um serviço de push configurado, eles não podem avisar quando o navegador estiver fechado. A permissão de notificações é opcional; se não for concedida, o lembrete aparece dentro do app.

## Tecnologias

React, Vite, Supabase Auth e Postgres. A aplicação não chama serviços de IA pagos. O assistente usa comandos simples locais e pode receber um backend de IA depois, sem amarrar o MVP a um provedor.

## Publicação no GitHub Pages

O workflow em `.github/workflows/deploy.yml` compila e publica o site quando há push para `main`. A configuração do Supabase usa uma chave publishable, feita para uso no navegador; as políticas RLS controlam o acesso aos dados. Depois de criar o repositório `IgorMalaspina/agirmente`, habilite Pages com origem **GitHub Actions** e adicione `https://igormalaspina.github.io/agirmente/` à lista de redirecionamentos do Supabase Auth.
