# Decisión de Política de Retiro Anticipado y Liquidez

## Contexto y Motivación
El miedo a quedar "atrapado" o con el capital bloqueado es uno de los principales disuasores para los contribuidores en plataformas de inversión o crowdfunding. Si los contribuidores saben con absoluta certeza que pueden retirar su capital cuando lo deseen, el riesgo percibido disminuye drásticamente, aumentando la confianza y la participación.

## Política Definida: Retiro Libre e Inmediato
Se ha auditado y extendido la función `retirar_principal` en el contrato inteligente (`bimex/contracts/bimex/src/lib.rs`) para unificar la garantía de liquidez:
- **Sin periodos de bloqueo forzoso:** Un contribuidor puede retirar el 100% de su capital aportado en cualquier momento, tanto en etapas activas (`EtapaInicial`, `EnProgreso`) como en etapas de cierre (`Liberado`, `Abandonado`, o tras el vencimiento).
- **Cero penalización sobre el principal:** El capital aportado (en MXNe) se devuelve íntegro en stroops sin comisiones de salida.
- **Transparencia sobre el rendimiento:** Si el retiro se ejecuta de forma anticipada mientras el proyecto está activo (`EnProgreso`), el rendimiento futuro que generaba dicho capital deja de fluir hacia el proyecto. Esta implicación se comunica transparentemente en la interfaz gráfica antes de confirmar la transacción, fortaleciendo la confianza en lugar de socavarla.
- **Consistencia en eventos e indexación:** Tanto los retiros al finalizar como los retiros anticipados emiten el evento on-chain `retiro`, garantizando que el indexador off-chain refleje el balance exacto en tiempo real.
