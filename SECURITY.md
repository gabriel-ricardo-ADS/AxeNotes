# Segurança

Encontrou uma vulnerabilidade? Não abra issue pública. Use **Security → Report a vulnerability**
neste repositório (relato privado do GitHub).

## O que este repositório nunca contém
- Segredos: chaves `service_role`, senha do banco, chaves privadas VAPID, tokens. Eles ficam em
  `.env.local` (ignorado pelo git) e nos painéis do Supabase, do Cloudflare e do ambiente de nuvem.
- Dados reais de usuários. Seeds, testes e prints usam dados fictícios.

A chave anon/publishable do Supabase é pública por design; o acesso aos dados é protegido por
Row Level Security em todas as tabelas e no Storage.
