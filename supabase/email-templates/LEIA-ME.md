# Autenticação — configuração no painel do Supabase

Estes passos são feitos no painel (o código do site já está pronto). Ordem sugerida:

## 1. URLs (Authentication → URL Configuration)
- **Site URL:** a URL de produção na Vercel (ex.: `https://SEU-PROJETO.vercel.app`).
- **Redirect URLs:** adicione `https://SEU-PROJETO.vercel.app/**` e, para testar localmente, `http://localhost:5173/**`.
  Sem isso, os links dos e-mails (confirmação, recuperação, Google) são recusados.

## 2. Templates de e-mail (Authentication → Emails → Templates)
Cole o conteúdo de cada arquivo em **Source** e ajuste o assunto:

| Template do Supabase | Arquivo | Assunto sugerido |
|---|---|---|
| Confirm signup | `confirmacao.html` | Confirme seu e-mail — FireUtils |
| Reset password | `recuperacao.html` | Redefinir sua senha — FireUtils |

Os arquivos usam `{{ .ConfirmationURL }}`, a variável do Supabase com o link.
Enquanto não houver SMTP próprio, o envio sai pelo remetente padrão do Supabase
(limite baixo de e-mails por hora e maior chance de cair em spam). Quando houver
domínio, configure em Authentication → Emails → SMTP Settings (Resend, SES etc.)
e autentique o domínio (SPF, DKIM, DMARC) — os templates continuam os mesmos.

## 3. Regras de senha (Authentication → Sign In / Providers → Email)
- **Confirm email:** ligado.
- **Minimum password length:** 10.
- **Password requirements:** letras e números (ou mais forte).
- **Prevent use of leaked passwords:** ligado (disponível conforme o plano).
O site valida o mesmo (10+ caracteres, letra e número) antes de enviar.

## 4. Login com Google
1. No Google Cloud Console → APIs e serviços → Credenciais → **Criar ID do cliente OAuth** (tipo *Aplicativo da Web*).
2. Em **URIs de redirecionamento autorizados**, use o endereço mostrado em
   Supabase → Authentication → Sign In / Providers → Google (`https://<ref>.supabase.co/auth/v1/callback`).
3. Copie *Client ID* e *Client Secret* para o provedor Google no Supabase e ative-o.
4. Configure a tela de consentimento OAuth (nome do app, e-mail de suporte, logo).

## 5. Banco
Rode `supabase/migrations/20261103120000_perfil_no_cadastro.sql` no SQL Editor: cria a
linha de `perfis` no cadastro com o conselho e o número do registro (e o nome, no caso do Google).

## 6. Segurança e privacidade — conferir no painel
- **E-mail já cadastrado:** cadastrar de novo um e-mail existente devolve "sucesso" sem enviar nada.
  É proposital (Supabase, com *Confirm email* ligado): impede descobrir quem tem conta. O site mostra
  uma mensagem neutra e orienta a entrar ou usar "Esqueci minha senha". Não existe duplicata: o e-mail
  é único em `auth.users`, e `perfis` tem `user_id` como chave primária.
- **Google com e-mail já cadastrado:** o Supabase vincula a identidade do Google à MESMA conta (mesmo
  usuário, sem duplicar) quando o e-mail do Google é verificado. Entrar sem senha é esperado — quem
  controla o Google daquele e-mail provou ser o dono. A senha continua valendo.
- **Mantenha *Confirm email* LIGADO** (Authentication → Sign In / Providers → Email). Com ele desligado,
  alguém poderia criar uma conta com e-mail alheio sem confirmar. Não ative provedores que não verificam e-mail.
- Authentication → Rate Limits: mantenha os limites padrão; considere CAPTCHA (Turnstile) em Attack Protection.
- Authentication → Sessions: defina tempo de vida máximo e/ou inatividade, se quiser sessões mais curtas.
