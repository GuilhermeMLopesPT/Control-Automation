# Configuração do Supabase

## 1. Criar arquivo `.env`

Copie o arquivo `env.example` para `.env`:

```bash
# Windows PowerShell
Copy-Item env.example .env

# Linux/Mac
cp env.example .env
```

## 2. Obter credenciais do Supabase

1. Acesse [Supabase Dashboard](https://app.supabase.com)
2. Selecione seu projeto (ou crie um novo)
3. Vá em **Settings** → **API**
4. Copie os seguintes valores:

### Supabase URL
- Encontre em **Project URL**
- Exemplo: `https://abcdefghijklmnop.supabase.co`

### Supabase Anon Key
- Encontre em **Project API keys** → **anon** → **public**
- Esta é a chave pública (pode ser exposta no frontend)

### Supabase Service Role Key (Opcional)
- Encontre em **Project API keys** → **service_role** → **secret**
- ⚠️ **MANTENHA SECRETO** - Use apenas no backend
- Permite operações que ignoram Row Level Security (RLS)

## 3. Editar arquivo `.env`

Abra o arquivo `.env` e substitua os valores:

```env
SUPABASE_URL=https://seu-projeto-id.supabase.co
SUPABASE_KEY=sua-chave-anon-aqui
SUPABASE_SERVICE_KEY=sua-chave-service-role-aqui
```

## 4. Executar SQL no Supabase

1. No Supabase Dashboard, vá em **SQL Editor**
2. Abra o arquivo `supabase_setup.sql`
3. Cole e execute o SQL para criar a tabela `power_readings`

## 5. Instalar dependências Python

```bash
pip install -r requirements.txt
```

Isso instalará:
- `supabase` - Cliente Python para Supabase
- `python-dotenv` - Para carregar variáveis do arquivo `.env`

## 6. Testar conexão

O `api_server.py` agora salvará automaticamente os dados no Supabase quando as variáveis estiverem configuradas.

## Estrutura da Tabela

A tabela `power_readings` tem as seguintes colunas:

- `id` - BIGSERIAL (auto-incremento)
- `timestamp` - TIMESTAMPTZ (data/hora)
- `current` - FLOAT (corrente em Amperes)
- `power` - FLOAT (potência em Watts = current × 230)
- `vibration` - FLOAT (vibração em Volts)

