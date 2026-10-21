import { z } from 'zod'

// O zod 4 testa se pode compilar validadores com `new Function` e, sob a CSP do app (script-src
// 'self', sem 'unsafe-eval'), esse teste vira uma violação de CSP no Console, mesmo com o erro
// engolido. `jitless` pula o teste e usa o validador interpretado. Importado PRIMEIRO no main.tsx,
// antes de qualquer schema rodar (o src/lib/supabase.ts valida o ambiente ao carregar).
z.config({ jitless: true })
