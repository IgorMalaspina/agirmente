# AGIRMENTE

Seu jeito de pensar. Sua maneira de transformar.

MVP web responsivo para capturar pensamentos, organizar atividades e escolher um próximo passo sem pressão.

## O que já funciona

- Cinco áreas de navegação: Início, Foco agora, Minha fila, Assistente e Perfil.
- Captura rápida por texto; captura por voz nos navegadores que disponibilizam reconhecimento de fala.
- Persistência local no navegador quando o Supabase ainda não está configurado.
- Fila com busca e filtros, foco com até três atividades, priorização, pausa, retomada, conclusão e remoção.
- Categorias pessoais e perfil editável.
- Assistente sem API paga: captura atividades e responde a comandos básicos de conclusão, pausa e escolha de foco.
- Histórico do assistente limitado aos últimos sete dias.
- Login por e-mail e senha quando as variáveis Supabase são informadas.

## Rodar localmente

1. Instale uma versão atual do Node.js e pnpm.
2. Execute `pnpm install` e `pnpm dev`.
3. Abra o endereço local mostrado pelo Vite.

Sem configuração Supabase, o aplicativo abre em modo local e informa que os dados ficam apenas neste navegador. Esse modo facilita experimentar os fluxos, mas não sincroniza dados entre dispositivos nem oferece autenticação.

## Supabase configurado

O repositório está ligado ao projeto Supabase `organizador-pessoal`. A extensão [`supabase/schema.sql`](supabase/schema.sql) acrescenta a categoria à tabela `tasks` existente; a migração mantém as políticas RLS por `auth.uid()` que já protegem as tarefas.

O endereço e a chave **publishable** ficam em `.env.local`, que é ignorado pelo Git. Nunca coloque uma chave `service_role` ou `secret` no cliente. O login é feito pelo Supabase Auth com e-mail e senha. Nome e categorias são salvos no metadado editável do próprio usuário e não são usados em regras de autorização. O histórico do assistente fica neste navegador por até sete dias; atividades e perfil sincronizam pela conta.

## Tecnologias

React, Vite, Supabase Auth e Postgres. A aplicação não chama serviços de IA pagos. O assistente usa comandos simples locais e pode receber um backend de IA depois, sem amarrar o MVP a um provedor.

## Publicação no GitHub Pages

O workflow em `.github/workflows/deploy.yml` compila e publica o site quando há push para `main`. A configuração do Supabase usa uma chave publishable, feita para uso no navegador; as políticas RLS controlam o acesso aos dados. Depois de criar o repositório `IgorMalaspina/agirmente`, habilite Pages com origem **GitHub Actions** e adicione `https://igormalaspina.github.io/agirmente/` à lista de redirecionamentos do Supabase Auth.
