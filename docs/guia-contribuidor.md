# Guía del Contribuidor — Bimex

> Apoya proyectos de impacto social sin arriesgar tu dinero.

## ¿Qué es Bimex?

Bimex es una plataforma de crowdfunding construida sobre Stellar donde **tu capital siempre es recuperable**. En lugar de donar dinero, lo bloqueas temporalmente en un contrato inteligente. Ese capital genera rendimiento (~13.45% APY), y ese rendimiento es el que financia el proyecto. Cuando el proyecto termina, recibes exactamente lo que pusiste.

```
Tú depositas 1,000 MXNe
        │
        ├─ El rendimiento (~134 MXNe/año) va al proyecto
        │
        └─ Tú recuperas tus 1,000 MXNe al final
```

**No es una donación. Es un préstamo sin intereses donde el rendimiento es el beneficio social.**

---

## Requisitos antes de empezar

1. **Freighter Wallet** — la billetera oficial de Stellar.
   - Descarga: https://www.freighter.app
   - Disponible como extensión para Chrome, Firefox y Brave.
   - Configura la red en **Testnet** para probar, o **Mainnet** para producción.

2. **MXNe** — el stablecoin de peso mexicano en Stellar.
   - 1 MXNe ≈ 1 MXN (peso mexicano).
   - Emitido por Etherfuse: https://etherfuse.com

### ¿Cómo obtener MXNe?

| Opción | Descripción |
|---|---|
| Etherfuse | Compra directa con transferencia bancaria (SPEI) en https://etherfuse.com |
| Stellar DEX | Intercambia XLM u otros activos por MXNe en https://stellarterm.com |
| Faucet (solo Testnet) | Usa el botón "100 MXNe gratis" en la app para pruebas |

> También necesitas una pequeña cantidad de **XLM** en tu cuenta para pagar las comisiones de red (normalmente menos de 0.01 XLM por transacción).

---

## Paso a paso: contribuir a un proyecto

### 1. Conecta tu wallet

- Abre [bimex-frontend.vercel.app](https://bimex-frontend.vercel.app)
- Haz clic en **"Conectar con Freighter"**
- Freighter te pedirá autorización — acéptala
- Verás tu dirección y balance de MXNe en la barra superior

### 2. Explora los proyectos

- Ve a la sección **"Proyectos"**
- Filtra por estado: *Abiertos* (EtapaInicial / EnProgreso) o *Completados* (Liberado)
- Cada proyecto muestra: nombre, meta, progreso actual, yield estimado y tiempo activo

### 3. Contribuye

- Entra al detalle del proyecto que te interesa
- Ingresa la cantidad en MXNe que deseas aportar
- El sistema valida que tengas saldo suficiente
- Haz clic en **"Confirmar"** — Freighter abrirá una ventana para firmar la transacción
- Aprueba la transacción en Freighter
- En segundos verás tu aportación reflejada en el proyecto

### 4. Monitorea tu yield

- Ve a **"Mi Cuenta"** para ver todos tus proyectos activos
- Verás: principal bloqueado, yield generado hasta ahora, y tiempo transcurrido
- El yield se calcula por minuto y crece continuamente

### 5. Retira tu principal

Tu dinero no está bloqueado — puedes retirar tu capital original **en cualquier momento que lo desees**, sin plazos forzosos:

- Entra a la sección **"Mi Inversión"** en el detalle del proyecto
- Haz clic en **"Retirar capital"**
- Confirma el monto exacto a recuperar (si retiras de forma anticipada, te informaremos con total transparencia el rendimiento que el proyecto dejará de recibir)
- Confirma en Freighter
- Los MXNe regresan a tu wallet inmediatamente

---

## Seguridad y preguntas frecuentes

**¿Puedo perder mi dinero?**
No. El contrato inteligente garantiza que tu principal siempre es recuperable al 100%. El código es público y auditable en la blockchain de Stellar.

**¿Qué pasa si necesito mi dinero antes de que el proyecto termine?**
Puedes retirarlo cuando quieras. Bajo nuestra política de liquidez inmediata, no estás atrapado. Retirar antes de tiempo no tiene ninguna penalización sobre tu capital; únicamente detiene la generación de rendimiento para el proyecto social.

**¿Quién controla el contrato?**
El contrato es inmutable una vez desplegado. Nadie puede mover tu principal sin tu autorización. El admin solo puede aprobar o rechazar proyectos nuevos.

**¿Es seguro Freighter?**
Freighter es la wallet oficial de Stellar Foundation. Tu clave privada nunca sale de tu dispositivo.

**¿Cuánto yield genera mi aportación?**
Aproximadamente 13.45% APY (9.45% de CETES + 4% de AMM). Ejemplo: 1,000 MXNe durante 6 meses generan ~67 MXNe de yield para el proyecto.

---

## Recursos

- [Documentación técnica completa](../DOCUMENTACION.txt)
- [FAQ en español](faq-es.md)
- [FAQ in English](faq-en.md)
- [Stellar Community](https://stellar.org/community)
- [Freighter Wallet](https://www.freighter.app)
