# Bimex Indexer Scripts

Scripts para backup, restauración y re-indexación del indexer de Bimex.

## 📋 Scripts Disponibles

### 🔄 reindex.js - Re-indexación desde Blockchain

Re-construye el estado completo de la base de datos desde las transacciones on-chain en Stellar.

**Uso**:
```bash
# Dry run (simulación sin escribir a DB)
node scripts/reindex.js --dry-run

# Re-indexar desde ledger específico
node scripts/reindex.js --from-ledger 1000000

# Limpiar DB y re-indexar desde cero
node scripts/reindex.js --clear --from-ledger 1000000

# Re-indexar desde START_LEDGER en .env
node scripts/reindex.js
```

**Opciones**:
- `--dry-run`: Muestra qué se indexaría sin escribir a la base de datos
- `--from-ledger N`: Inicia desde el ledger N (sobrescribe START_LEDGER)
- `--clear`: Borra todos los datos antes de re-indexar (⚠️ DESTRUCTIVO)

**Cuándo usar**:
- Pérdida total de datos en Supabase
- Migración a nueva base de datos
- Verificación de integridad de datos
- Datos corruptos sin backup confiable

**Tiempo estimado**: 
- ~1-5 minutos por cada 100,000 ledgers (depende del RPC)
- Testnet completo (~2M ledgers): 20-100 minutos

---

### 💾 backup.sh - Backup de Base de Datos

Exporta todas las tablas (proyectos, aportaciones, eventos) a archivos JSON con timestamp.

**Uso**:
```bash
bash scripts/backup.sh
```

**Salida**:
```
backups/
└── 20250529_143022/
    ├── metadata.json
    ├── proyectos.json
    ├── aportaciones.json
    └── eventos.json
```

**Configuración**:
```bash
# En .env
BACKUP_DIR=./backups  # Directorio de backups (default: ./backups)
```

**Backup automático con cron**:
```bash
# Backup diario a las 2 AM
0 2 * * * cd /path/to/bimex-indexer && bash scripts/backup.sh >> logs/backup.log 2>&1
```

### 📊 reporteMensual.js - Reporte Mensual para Contribuidores

Genera y envía reportes mensuales de impacto a contribuidores activos.
Procesa yield on-chain, genera correos personalizados y respeta preferencias de notificación.

**Uso**:
```bash
# Ejecución normal (procesa el mes anterior)
node jobs/reporteMensual.js

# Vista previa sin enviar
node jobs/reporteMensual.js --dry-run

# Forzar un período específico
node jobs/reporteMensual.js --periodo 2026-05

# Reducir concurrencia (modo conservador)
node jobs/reporteMensual.js --concurrency 1
```

**Reporte automático con cron**:
```bash
# Primer día de cada mes a las 8:00 AM
0 8 1 * * cd /path/to/bimex-indexer && node jobs/reporteMensual.js >> logs/reporte-mensual.log 2>&1

# Con período explícito (si cron corre después del 1ro)
0 9 2 * * cd /path/to/bimex-indexer && node jobs/reporteMensual.js --periodo $(date -d '1 month ago' +\%Y-\%m) >> logs/reporte-mensual.log 2>&1
```

**Dependencias**: `RESEND_API_KEY` en `.env`

**Requisitos**:
- Variables `SUPABASE_URL`, `SUPABASE_KEY`, y `RESEND_API_KEY` en `.env`
- Base de datos migrada con `migration_reporte_mensual.sql`
- Tabla `user_notifications` poblada (desde la UI de MiCuenta)

---

---

### 🔙 restore.js - Restauración desde Backup

Restaura datos desde un backup creado por `backup.sh`.

**Uso**:
```bash
# Dry run (simulación)
node scripts/restore.js 20250529_143022 --dry-run

# Restauración real
node scripts/restore.js 20250529_143022
```

**Cuándo usar**:
- Recuperación rápida (más rápido que re-indexar)
- Rollback a estado anterior conocido
- Corrupción parcial de datos

**⚠️ Advertencia**: Sobrescribe datos existentes con los del backup.

---

### 🧪 test-scripts.js - Validación de Scripts

Valida que todos los scripts tengan la estructura correcta.

**Uso**:
```bash
node scripts/test-scripts.js
```

**Verifica**:
- Estructura de archivos
- Funciones requeridas
- Opciones de línea de comandos
- Parsing de argumentos

---

## 🚀 Flujo de Trabajo Recomendado

### Operación Normal

1. **Configurar backup automático**:
   ```bash
   crontab -e
   # Agregar: 0 2 * * * cd /path/to/bimex-indexer && bash scripts/backup.sh
   ```

2. **Verificar backups periódicamente**:
   ```bash
   ls -lh backups/
   ```

### Recuperación ante Desastre

#### Opción A: Restaurar desde Backup (Rápido)
```bash
# 1. Listar backups disponibles
ls backups/

# 2. Dry run
node scripts/restore.js 20250529_143022 --dry-run

# 3. Restaurar
node scripts/restore.js 20250529_143022
```

#### Opción B: Re-indexar desde Blockchain (Completo)
```bash
# 1. Dry run para verificar
node scripts/reindex.js --dry-run --from-ledger 1000000

# 2. Re-indexar
node scripts/reindex.js --clear --from-ledger 1000000

# 3. Verificar
psql $DATABASE_URL -c "SELECT COUNT(*) FROM proyectos;"
```

---

## 📊 Comparación: Backup vs Re-indexación

| Aspecto | Backup + Restore | Re-indexación |
|---------|------------------|---------------|
| **Velocidad** | ⚡ Rápido (segundos) | 🐢 Lento (minutos/horas) |
| **Fuente de datos** | Backup local | Blockchain (fuente de verdad) |
| **Integridad** | Depende del backup | ✅ 100% preciso |
| **Uso de red** | Mínimo | Alto (RPC calls) |
| **Cuándo usar** | Recuperación rápida | Pérdida total, verificación |

---

## 🔧 Troubleshooting

### Error: "Cannot find package 'dotenv'"
```bash
npm install
```

### Error: "SUPABASE_URL and SUPABASE_KEY must be set"
```bash
# Verificar .env
cat .env

# O copiar desde ejemplo
cp .env.example .env
# Editar .env con tus credenciales
```

### Error: "Backup not found"
```bash
# Verificar que el timestamp existe
ls backups/

# Formato correcto: YYYYMMDD_HHMMSS
node scripts/restore.js 20250529_143022
```

### Re-indexación muy lenta
```bash
# Usar RPC más rápido
STELLAR_RPC_URL=https://mainnet.stellar.validationcloud.io/v1/YOUR_KEY

# O reducir el rango de ledgers
node scripts/reindex.js --from-ledger 2000000  # Solo últimos ledgers
```

### Error: "Rate limit exceeded"
```bash
# Agregar delay entre batches (modificar reindex.js)
await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay
```

---

## 📚 Documentación Adicional

Ver [docs/disaster-recovery.md](../../docs/disaster-recovery.md) para:
- Procedimientos completos de recuperación
- Configuración de backups automáticos
- Checklist de emergencia
- Mejores prácticas de seguridad

---

## 🤝 Contribuir

Para agregar nuevos scripts:

1. Crear el script en `bimex-indexer/scripts/`
2. Agregar tests en `test-scripts.js`
3. Documentar en este README
4. Actualizar `disaster-recovery.md` si aplica

---

**Última actualización**: 2025-05-29  
**Mantenedor**: Equipo Bimex
