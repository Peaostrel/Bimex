#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype,
    symbol_short, token, Address, BytesN, Env, String,
};

// ============================================================
//  TIPOS DE DATOS
// ============================================================

/// Estado del ciclo de vida de un proyecto.
///
/// Transiciones válidas:
///   EnRevision → EtapaInicial (admin_aprobar)
///   EnRevision → Rechazado    (admin_rechazar)
///   EtapaInicial → EnProgreso (primer contribuir)
///   EnProgreso → Liberado     (total_aportado >= meta)
///   EtapaInicial | EnProgreso | Liberado → Abandonado (abandonar_proyecto)
///   Abandonado → EtapaInicial | EnProgreso (solicitar_continuar)
#[contracttype]
#[derive(Clone, PartialEq, Debug)]
pub enum EstadoProyecto {
    EnRevision,    // pendiente de aprobación por el admin
    EtapaInicial,  // aprobado, sin backers todavía
    EnProgreso,    // al menos un backer
    Abandonado,    // dueño lo marcó como abandonado
    Liberado,      // meta alcanzada; yield reclamable por el dueño
    Rechazado,     // rechazado por el admin
}

/// Datos completos de un proyecto de crowdfunding.
///
/// El capital se divide 50/50 entre CETES y AMM al momento de cada contribución.
/// `timestamp_inicio` se resetea cada vez que el dueño reclama yield, y también
/// cuando un nuevo dueño toma el proyecto vía `solicitar_continuar`.
/// `timestamp_vencimiento` marca cuándo expira el plazo de recaudación: si el
/// proyecto no alcanza la meta antes de esa fecha, los backers pueden retirar
/// su capital íntegro mediante `retirar_principal`.
#[contracttype]
#[derive(Clone)]
pub struct Proyecto {
    pub dueno: Address,
    pub nombre: String,
    pub meta: i128,
    pub total_aportado: i128,
    pub yield_entregado: i128,
    pub estado: EstadoProyecto,
    pub timestamp_inicio: u64,
    pub timestamp_vencimiento: u64,
    pub tiempo_meses: u32,
    pub capital_en_cetes: i128,
    pub yield_cetes_acumulado: i128,
    pub capital_en_amm: i128,
    pub yield_amm_acumulado: i128,
    pub doc_cid: String,
    pub motivo_rechazo: String,
}

/// Aportación de un backer a un proyecto.
///
/// `timestamp` registra el momento de la primera contribución y NO se resetea
/// en top-ups posteriores, preservando el período de acumulación de yield.
#[contracttype]
#[derive(Clone)]
pub struct Aportacion {
    pub cantidad: i128,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone)]
pub struct YieldDetallado {
    pub cetes: i128,
    pub amm: i128,
    pub total: i128,
}

#[contracttype]
#[derive(Clone)]
pub struct CapitalEstado {
    pub en_cetes: i128,
    pub en_amm: i128,
    pub total: i128,
}

// ============================================================
//  CLAVES DE ALMACENAMIENTO
// ============================================================

#[contracttype]
pub enum Clave {
    Admin,
    TokenMXNe,
    YieldCetesBps,
    YieldAmmBps,
    ContadorProyectos,
    Proyecto(u32),
    Aportacion(u32, Address),
    Pausado,
}

// ============================================================
//  CONSTANTES DE TASAS
// ============================================================

// Tasas reales de producción en puntos base (bps).
// 10 000 bps = 100 % anual. Fórmula: capital × bps × minutos / 10_000 / 525_600
const DEFAULT_CETES_BPS: u32 = 945;  // 9.45 % anual (CETES referencia)
const DEFAULT_AMM_BPS:   u32 = 400;  // 4.00 % anual (liquidez AMM)

// Segundos por mes (30 días)
const SEGUNDOS_POR_MES: u64 = 30 * 24 * 3_600;

// TTL en ledgers (~1 ledger = 5 segundos)
const INSTANCE_LIFETIME_THRESHOLD: u32 = 17_280;    // ~1 día
const INSTANCE_BUMP_AMOUNT: u32 = 518_400;           // ~30 días

const PERSISTENT_LIFETIME_THRESHOLD: u32 = 17_280;   // ~1 día
const PERSISTENT_BUMP_AMOUNT: u32 = 2_592_000;       // ~6 meses

// ============================================================
//  HELPERS
// ============================================================

fn extender_ttl_instancia(env: &Env) {
    env.storage().instance().extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
}

fn extender_ttl_proyecto(env: &Env, id: u32) {
    env.storage().persistent().extend_ttl(
        &Clave::Proyecto(id),
        PERSISTENT_LIFETIME_THRESHOLD,
        PERSISTENT_BUMP_AMOUNT,
    );
}

fn extender_ttl_aportacion(env: &Env, id: u32, backer: &Address) {
    env.storage().persistent().extend_ttl(
        &Clave::Aportacion(id, backer.clone()),
        PERSISTENT_LIFETIME_THRESHOLD,
        PERSISTENT_BUMP_AMOUNT,
    );
}

/// Overflow-safe yield calculation.
///
/// Formula: yield = capital * bps / 10_000 * minutos / MINUTOS_ANO
///
/// Division is performed before multiplication to keep intermediate i128 values
/// within bounds for capital up to ~1e18 stroops and bps up to 10_000_000.
/// The remainder term preserves precision lost in the integer division.
fn calcular_yield_seguro(capital: i128, bps: i128, minutos: i128) -> i128 {
    const MINUTOS_ANO: i128 = 525_600;
    (capital / MINUTOS_ANO) * bps / 10_000 * minutos
        + (capital % MINUTOS_ANO) * bps / 10_000 * minutos / MINUTOS_ANO
}

fn verificar_no_pausado(env: &Env) {
    let pausado: bool = env.storage().instance().get(&Clave::Pausado).unwrap_or(false);
    assert!(!pausado, "Contrato pausado por el administrador");
}

// ============================================================
//  CONTRATO
// ============================================================

#[contract]
pub struct BimexContrato;

#[contractimpl]
impl BimexContrato {

    /// Inicializa el contrato. Solo puede llamarse una vez.
    ///
    /// Parámetros de producción:
    ///   yield_cetes_bps = 945  (9.45% APY — CETES / Etherfuse Stablebonds)
    ///   yield_amm_bps   = 400  (4.00% APY — AMM de Stellar)
    pub fn inicializar(
        env: Env,
        admin: Address,
        token_mxne: Address,
        yield_cetes_bps: u32,
        yield_amm_bps: u32,
    ) {
        if env.storage().instance().has(&Clave::Admin) {
            panic!("Ya inicializado");
        }
        assert!(yield_cetes_bps <= 10_000_000, "yield_cetes_bps excede el maximo");
        assert!(yield_amm_bps   <= 10_000_000, "yield_amm_bps excede el maximo");
        env.storage().instance().set(&Clave::Admin, &admin);
        env.storage().instance().set(&Clave::TokenMXNe, &token_mxne);
        env.storage().instance().set(&Clave::YieldCetesBps, &yield_cetes_bps);
        env.storage().instance().set(&Clave::YieldAmmBps, &yield_amm_bps);
        env.storage().instance().set(&Clave::ContadorProyectos, &0u32);
        extender_ttl_instancia(&env);
    }

    /// Crea un nuevo proyecto en estado EnRevision.
    ///
    /// `meta` se expresa en stroops (1 MXNe = 10_000_000 stroops).
    /// `doc_cid` es el CID de IPFS o el SHA-256 hex de los documentos del proyecto.
    /// `tiempo_meses` es el plazo máximo de recaudación (1–120 meses).
    /// Retorna el ID asignado al proyecto.
    pub fn crear_proyecto(
        env: Env,
        dueno: Address,
        nombre: String,
        meta: i128,
        doc_cid: String,
        tiempo_meses: u32,
    ) -> u32 {
        verificar_no_pausado(&env);
        dueno.require_auth();
        assert!(meta > 0, "La meta debe ser mayor a 0");
        assert!((1..=120).contains(&tiempo_meses), "El tiempo debe estar entre 1 y 120 meses");

        let id: u32 = env.storage().instance().get(&Clave::ContadorProyectos).unwrap_or(0);

        let ahora = env.ledger().timestamp();
        let timestamp_vencimiento = ahora + (tiempo_meses as u64) * SEGUNDOS_POR_MES;

        let proyecto = Proyecto {
            dueno,
            nombre,
            meta,
            total_aportado: 0,
            yield_entregado: 0,
            estado: EstadoProyecto::EnRevision,
            timestamp_inicio: ahora,
            timestamp_vencimiento,
            tiempo_meses,
            capital_en_cetes: 0,
            yield_cetes_acumulado: 0,
            capital_en_amm: 0,
            yield_amm_acumulado: 0,
            doc_cid,
            motivo_rechazo: String::from_str(&env, ""),
        };

        env.storage().persistent().set(&Clave::Proyecto(id), &proyecto);
        env.storage().instance().set(&Clave::ContadorProyectos, &(id + 1));
        extender_ttl_instancia(&env);
        extender_ttl_proyecto(&env, id);
        id
    }

    /// Bloquea `cantidad` stroops de MXNe del backer en el contrato.
    ///
    /// - Solo acepta proyectos en EtapaInicial o EnProgreso.
    /// - La contribución se limita al capital restante para evitar overfunding.
    /// - El capital se divide 50/50 entre CETES y AMM.
    /// - Si total_aportado >= meta, el proyecto pasa a estado Liberado.
    /// - Top-ups preservan el timestamp original del backer.
    /// - No se aceptan contribuciones si el plazo de recaudación ya venció.
    pub fn contribuir(env: Env, backer: Address, id_proyecto: u32, cantidad: i128) {
        verificar_no_pausado(&env);
        // AUTH FIRST
        backer.require_auth();
        assert!(cantidad > 0, "Cantidad debe ser mayor a 0");

        let mut proyecto: Proyecto = env
            .storage().persistent().get(&Clave::Proyecto(id_proyecto))
            .expect("Proyecto no existe");

        assert!(
            proyecto.estado == EstadoProyecto::EtapaInicial ||
            proyecto.estado == EstadoProyecto::EnProgreso,
            "El proyecto no acepta fondos"
        );

        // No contributions after deadline
        let ahora = env.ledger().timestamp();
        assert!(
            ahora < proyecto.timestamp_vencimiento,
            "El plazo de recaudacion ha vencido"
        );

        // Cap contribution to prevent overfunding
        let restante = proyecto.meta - proyecto.total_aportado;
        assert!(restante > 0, "El proyecto ya alcanzo su meta");
        let cantidad = cantidad.min(restante);

        let aportacion_existente: Option<Aportacion> = env
            .storage().persistent().get(&Clave::Aportacion(id_proyecto, backer.clone()));

        // Preserve original timestamp on top-up to avoid yield clock reset
        let nueva_aportacion = match aportacion_existente {
            Some(a) => Aportacion { cantidad: a.cantidad + cantidad, timestamp: a.timestamp },
            None    => Aportacion { cantidad, timestamp: ahora },
        };

        let token_mxne: Address = env.storage().instance().get(&Clave::TokenMXNe).unwrap();
        let token = token::Client::new(&env, &token_mxne);

        // EFFECTS before interaction
        env.storage().persistent().set(&Clave::Aportacion(id_proyecto, backer.clone()), &nueva_aportacion);
        proyecto.total_aportado += cantidad;

        let mitad = cantidad / 2;
        proyecto.capital_en_cetes += mitad;
        proyecto.capital_en_amm   += cantidad - mitad;

        if proyecto.total_aportado >= proyecto.meta {
            proyecto.estado = EstadoProyecto::Liberado;
        } else {
            proyecto.estado = EstadoProyecto::EnProgreso;
        }

        env.storage().persistent().set(&Clave::Proyecto(id_proyecto), &proyecto);
        extender_ttl_instancia(&env);
        extender_ttl_proyecto(&env, id_proyecto);
        extender_ttl_aportacion(&env, id_proyecto, &backer);

        #[allow(deprecated)]
        env.events().publish(
            (symbol_short!("aportar"), backer.clone()),
            (id_proyecto, cantidad, ahora),
        );

        // INTERACTION last
        token.transfer(&backer, env.current_contract_address(), &cantidad);
    }

    /// Calcula el yield pendiente de un backer específico en stroops.
    /// No modifica el estado del contrato.
    pub fn calcular_yield(env: Env, id_proyecto: u32, backer: Address) -> i128 {
        let aportacion: Aportacion = env
            .storage().persistent().get(&Clave::Aportacion(id_proyecto, backer.clone()))
            .expect("Este backer no tiene aportacion en este proyecto");

        let cetes_bps = env.storage().instance().get::<_, u32>(&Clave::YieldCetesBps).unwrap_or(DEFAULT_CETES_BPS) as i128;
        let amm_bps   = env.storage().instance().get::<_, u32>(&Clave::YieldAmmBps).unwrap_or(DEFAULT_AMM_BPS) as i128;

        let segundos = env.ledger().timestamp().saturating_sub(aportacion.timestamp);
        let minutos  = (segundos / 60) as i128;

        let mitad       = aportacion.cantidad / 2;
        let yield_cetes = calcular_yield_seguro(mitad, cetes_bps, minutos);
        let yield_amm   = calcular_yield_seguro(aportacion.cantidad - mitad, amm_bps, minutos);

        extender_ttl_instancia(&env);
        extender_ttl_aportacion(&env, id_proyecto, &backer);

        yield_cetes + yield_amm
    }

    /// Retorna el yield total del proyecto desglosado por fuente (CETES y AMM).
    pub fn calcular_yield_detallado(env: Env, id_proyecto: u32) -> YieldDetallado {
        let proyecto: Proyecto = env
            .storage().persistent().get(&Clave::Proyecto(id_proyecto))
            .expect("Proyecto no existe");

        let cetes_bps = env.storage().instance().get::<_, u32>(&Clave::YieldCetesBps).unwrap_or(DEFAULT_CETES_BPS) as i128;
        let amm_bps   = env.storage().instance().get::<_, u32>(&Clave::YieldAmmBps).unwrap_or(DEFAULT_AMM_BPS) as i128;

        let segundos = env.ledger().timestamp().saturating_sub(proyecto.timestamp_inicio);
        let minutos  = (segundos / 60) as i128;

        let yield_cetes = calcular_yield_seguro(proyecto.capital_en_cetes, cetes_bps, minutos);
        let yield_amm   = calcular_yield_seguro(proyecto.capital_en_amm,   amm_bps,   minutos);

        extender_ttl_instancia(&env);
        extender_ttl_proyecto(&env, id_proyecto);

        YieldDetallado { cetes: yield_cetes, amm: yield_amm, total: yield_cetes + yield_amm }
    }

    /// Retorna la distribución actual del capital entre CETES y AMM.
    pub fn estado_capital(env: Env, id_proyecto: u32) -> CapitalEstado {
        let proyecto: Proyecto = env
            .storage().persistent().get(&Clave::Proyecto(id_proyecto))
            .expect("Proyecto no existe");

        extender_ttl_proyecto(&env, id_proyecto);

        CapitalEstado {
            en_cetes: proyecto.capital_en_cetes,
            en_amm:   proyecto.capital_en_amm,
            total:    proyecto.total_aportado,
        }
    }

    /// Transfiere el yield acumulado al dueño del proyecto.
    ///
    /// Solo el dueño puede llamar esta función (require_auth).
    /// Solo válido en estado EnProgreso o Liberado.
    /// Resetea `timestamp_inicio` al momento actual para el próximo período.
    /// Retorna el monto de yield transferido en stroops.
    pub fn reclamar_yield(env: Env, id_proyecto: u32) -> i128 {
        verificar_no_pausado(&env);
        let mut proyecto: Proyecto = env
            .storage().persistent().get(&Clave::Proyecto(id_proyecto))
            .expect("Proyecto no existe");

        // AUTH FIRST — before any other logic
        proyecto.dueno.require_auth();

        assert!(
            proyecto.estado == EstadoProyecto::EnProgreso ||
            proyecto.estado == EstadoProyecto::Liberado,
            "El proyecto no esta activo"
        );
        assert!(proyecto.total_aportado > 0, "No hay fondos en el proyecto");

        let cetes_bps = env.storage().instance().get::<_, u32>(&Clave::YieldCetesBps).unwrap_or(DEFAULT_CETES_BPS) as i128;
        let amm_bps   = env.storage().instance().get::<_, u32>(&Clave::YieldAmmBps).unwrap_or(DEFAULT_AMM_BPS) as i128;

        let ahora    = env.ledger().timestamp();
        let segundos = ahora.saturating_sub(proyecto.timestamp_inicio);
        let minutos  = (segundos / 60) as i128;

        let yield_cetes = calcular_yield_seguro(proyecto.capital_en_cetes, cetes_bps, minutos);
        let yield_amm   = calcular_yield_seguro(proyecto.capital_en_amm,   amm_bps,   minutos);
        let yield_monto = yield_cetes + yield_amm;

        assert!(yield_monto > 0, "Aun no hay yield suficiente acumulado");

        // EFFECTS first
        proyecto.yield_entregado       += yield_monto;
        proyecto.yield_cetes_acumulado += yield_cetes;
        proyecto.yield_amm_acumulado   += yield_amm;
        proyecto.timestamp_inicio       = ahora;
        env.storage().persistent().set(&Clave::Proyecto(id_proyecto), &proyecto);
        extender_ttl_instancia(&env);
        extender_ttl_proyecto(&env, id_proyecto);

        #[allow(deprecated)]
        env.events().publish(
            (symbol_short!("yield"), proyecto.dueno.clone()),
            (id_proyecto, yield_monto, ahora),
        );

        // INTERACTION last
        let token_mxne: Address = env.storage().instance().get(&Clave::TokenMXNe).unwrap();
        let token = token::Client::new(&env, &token_mxne);
        token.transfer(&env.current_contract_address(), &proyecto.dueno, &yield_monto);

        yield_monto
    }

    /// Devuelve el principal íntegro al backer.
    ///
    /// Válido cuando:
    ///   - El proyecto está en estado Liberado o Abandonado, O
    ///   - El plazo de recaudación ha vencido (timestamp >= timestamp_vencimiento)
    ///     aunque el proyecto no haya alcanzado la meta.
    ///
    /// En el caso de vencimiento sin meta, el yield acumulado hasta ese momento
    /// ya fue o puede ser reclamado por el dueño vía `reclamar_yield`.
    /// Retorna el monto retirado en stroops.
    pub fn retirar_principal(env: Env, backer: Address, id_proyecto: u32) -> i128 {
        verificar_no_pausado(&env);
        // AUTH FIRST
        backer.require_auth();

        let mut proyecto: Proyecto = env
            .storage().persistent().get(&Clave::Proyecto(id_proyecto))
            .expect("Proyecto no existe");

        let ahora = env.ledger().timestamp();
        let plazo_vencido = ahora >= proyecto.timestamp_vencimiento &&
            (proyecto.estado == EstadoProyecto::EtapaInicial ||
             proyecto.estado == EstadoProyecto::EnProgreso);

        assert!(
            proyecto.estado == EstadoProyecto::EtapaInicial ||
            proyecto.estado == EstadoProyecto::EnProgreso   ||
            proyecto.estado == EstadoProyecto::Liberado     ||
            proyecto.estado == EstadoProyecto::Abandonado   ||
            plazo_vencido,
            "Solo puedes retirar cuando el proyecto este activo, liberado, abandonado o haya vencido el plazo"
        );

        let aportacion: Aportacion = env
            .storage().persistent().get(&Clave::Aportacion(id_proyecto, backer.clone()))
            .expect("No tienes aportacion en este proyecto");

        assert!(aportacion.cantidad > 0, "Principal ya retirado");

        let monto = aportacion.cantidad;

        // EFFECTS first
        extender_ttl_instancia(&env);
        extender_ttl_proyecto(&env, id_proyecto);
        extender_ttl_aportacion(&env, id_proyecto, &backer);
        env.storage().persistent().remove(&Clave::Aportacion(id_proyecto, backer.clone()));
        proyecto.total_aportado -= monto;

        let mitad = monto / 2;
        proyecto.capital_en_cetes = proyecto.capital_en_cetes.saturating_sub(mitad);
        proyecto.capital_en_amm   = proyecto.capital_en_amm.saturating_sub(monto - mitad);

        if proyecto.total_aportado == 0 &&
           (proyecto.estado == EstadoProyecto::EnProgreso || proyecto.estado == EstadoProyecto::Liberado) {
            proyecto.estado = EstadoProyecto::EtapaInicial;
        }

        env.storage().persistent().set(&Clave::Proyecto(id_proyecto), &proyecto);

        #[allow(deprecated)]
        env.events().publish(
            (symbol_short!("retiro"), backer.clone()),
            (id_proyecto, monto, ahora),
        );

        // INTERACTION last
        let token_mxne: Address = env.storage().instance().get(&Clave::TokenMXNe).unwrap();
        let token = token::Client::new(&env, &token_mxne);
        token.transfer(&env.current_contract_address(), &backer, &monto);

        monto
    }

    /// Retiro anticipado — el backer sale antes del vencimiento y antes de que
    /// el proyecto sea Liberado.
    ///
    /// Devuelve el 100 % del capital aportado. El yield que el backer habría
    /// generado durante el tiempo restante se queda en el proyecto para que
    /// el dueño lo reclame vía `reclamar_yield`.
    ///
    /// No es posible llamar esta función si el plazo ya venció (usa
    /// `retirar_principal` en ese caso) ni si el proyecto ya está Liberado
    /// o Abandonado.
    pub fn retiro_anticipado(env: Env, backer: Address, id_proyecto: u32) -> i128 {
        verificar_no_pausado(&env);
        // AUTH FIRST
        backer.require_auth();

        let mut proyecto: Proyecto = env
            .storage().persistent().get(&Clave::Proyecto(id_proyecto))
            .expect("Proyecto no existe");

        assert!(
            proyecto.estado == EstadoProyecto::EtapaInicial ||
            proyecto.estado == EstadoProyecto::EnProgreso,
            "El retiro anticipado solo aplica a proyectos activos"
        );

        let ahora = env.ledger().timestamp();
        assert!(
            ahora < proyecto.timestamp_vencimiento,
            "El plazo ya vencio, usa retirar_principal"
        );

        let aportacion: Aportacion = env
            .storage().persistent().get(&Clave::Aportacion(id_proyecto, backer.clone()))
            .expect("No tienes aportacion en este proyecto");

        assert!(aportacion.cantidad > 0, "Principal ya retirado");

        let monto = aportacion.cantidad;

        // EFFECTS first — yield acumulado se queda en el proyecto
        extender_ttl_instancia(&env);
        extender_ttl_proyecto(&env, id_proyecto);
        extender_ttl_aportacion(&env, id_proyecto, &backer);
        env.storage().persistent().remove(&Clave::Aportacion(id_proyecto, backer.clone()));
        proyecto.total_aportado -= monto;

        let mitad = monto / 2;
        proyecto.capital_en_cetes = proyecto.capital_en_cetes.saturating_sub(mitad);
        proyecto.capital_en_amm   = proyecto.capital_en_amm.saturating_sub(monto - mitad);

        if proyecto.total_aportado == 0 {
            proyecto.estado = EstadoProyecto::EtapaInicial;
        }

        env.storage().persistent().set(&Clave::Proyecto(id_proyecto), &proyecto);

        #[allow(deprecated)]
        env.events().publish(
            (symbol_short!("retiro"), backer.clone()),
            (id_proyecto, monto, ahora),
        );

        // INTERACTION last — devolver solo capital
        let token_mxne: Address = env.storage().instance().get(&Clave::TokenMXNe).unwrap();
        let token = token::Client::new(&env, &token_mxne);
        token.transfer(&env.current_contract_address(), &backer, &monto);

        monto
    }

    /// Marca el proyecto como Abandonado. Solo el dueño puede llamarlo.
    /// Válido en EtapaInicial, EnProgreso o Liberado.
    /// Tras esto, los backers pueden retirar su principal.
    pub fn abandonar_proyecto(env: Env, id_proyecto: u32) {
        let mut proyecto: Proyecto = env
            .storage().persistent().get(&Clave::Proyecto(id_proyecto))
            .expect("Proyecto no existe");

        // AUTH FIRST
        proyecto.dueno.require_auth();

        assert!(
            proyecto.estado == EstadoProyecto::EtapaInicial ||
            proyecto.estado == EstadoProyecto::EnProgreso   ||
            proyecto.estado == EstadoProyecto::Liberado,
            "El proyecto no puede ser abandonado en su estado actual"
        );

        proyecto.estado = EstadoProyecto::Abandonado;
        env.storage().persistent().set(&Clave::Proyecto(id_proyecto), &proyecto);
        extender_ttl_instancia(&env);
        extender_ttl_proyecto(&env, id_proyecto);
    }

    /// Permite a un nuevo dueño retomar un proyecto Abandonado.
    ///
    /// Transfiere la propiedad a `nuevo_dueno` y reactiva el proyecto.
    /// Resetea `timestamp_inicio` para que el nuevo dueño no herede
    /// yield acumulado del período anterior.
    pub fn solicitar_continuar(env: Env, nuevo_dueno: Address, id_proyecto: u32) {
        verificar_no_pausado(&env);
        // AUTH FIRST
        nuevo_dueno.require_auth();

        let mut proyecto: Proyecto = env
            .storage().persistent().get(&Clave::Proyecto(id_proyecto))
            .expect("Proyecto no existe");

        assert!(
            proyecto.estado == EstadoProyecto::Abandonado,
            "Solo puedes continuar proyectos abandonados"
        );

        proyecto.dueno = nuevo_dueno;
        // Reset yield clock so new owner doesn't inherit stale yield period
        proyecto.timestamp_inicio = env.ledger().timestamp();
        proyecto.estado = if proyecto.total_aportado > 0 {
            EstadoProyecto::EnProgreso
        } else {
            EstadoProyecto::EtapaInicial
        };

        env.storage().persistent().set(&Clave::Proyecto(id_proyecto), &proyecto);
        extender_ttl_instancia(&env);
        extender_ttl_proyecto(&env, id_proyecto);
    }

    /// Aprueba un proyecto en revisión. Solo el admin puede llamarlo.
    /// Mueve el estado EnRevision → EtapaInicial.
    pub fn admin_aprobar(env: Env, id_proyecto: u32) {
        // AUTH FIRST
        let admin: Address = env.storage().instance().get(&Clave::Admin).expect("No inicializado");
        admin.require_auth();

        let mut proyecto: Proyecto = env
            .storage().persistent().get(&Clave::Proyecto(id_proyecto))
            .expect("Proyecto no existe");

        assert!(
            proyecto.estado == EstadoProyecto::EnRevision,
            "Solo se pueden aprobar proyectos en revision"
        );

        proyecto.estado = EstadoProyecto::EtapaInicial;
        env.storage().persistent().set(&Clave::Proyecto(id_proyecto), &proyecto);
        extender_ttl_instancia(&env);
        extender_ttl_proyecto(&env, id_proyecto);

        #[allow(deprecated)]
        env.events().publish(
            (symbol_short!("aprobar"), admin.clone()),
            (id_proyecto, env.ledger().timestamp()),
        );
    }

    /// Rechaza un proyecto en revisión. Solo el admin puede llamarlo.
    /// Mueve el estado EnRevision → Rechazado y guarda el motivo.
    pub fn admin_rechazar(env: Env, id_proyecto: u32, motivo: String) {
        // AUTH FIRST
        let admin: Address = env.storage().instance().get(&Clave::Admin).expect("No inicializado");
        admin.require_auth();

        let mut proyecto: Proyecto = env
            .storage().persistent().get(&Clave::Proyecto(id_proyecto))
            .expect("Proyecto no existe");

        assert!(
            proyecto.estado == EstadoProyecto::EnRevision,
            "Solo se pueden rechazar proyectos en revision"
        );

        let motivo_event = motivo.clone();
        proyecto.estado = EstadoProyecto::Rechazado;
        proyecto.motivo_rechazo = motivo;
        env.storage().persistent().set(&Clave::Proyecto(id_proyecto), &proyecto);
        extender_ttl_instancia(&env);
        extender_ttl_proyecto(&env, id_proyecto);

        #[allow(deprecated)]
        env.events().publish(
            (symbol_short!("rechazar"), admin.clone()),
            (id_proyecto, motivo_event, env.ledger().timestamp()),
        );
    }

    /// Transfiere el rol de administrador a una nueva dirección.
    /// Solo el admin actual puede llamar esta función.
    pub fn admin_cambiar_admin(env: Env, admin_actual: Address, nuevo_admin: Address) {
        admin_actual.require_auth();
        let guardado: Address = env.storage().instance().get(&Clave::Admin).expect("No inicializado");
        assert!(admin_actual == guardado, "Solo el admin actual puede transferir el rol");
        assert!(nuevo_admin != admin_actual, "El nuevo admin debe ser diferente");

        env.storage().instance().set(&Clave::Admin, &nuevo_admin);

        #[allow(deprecated)]
        env.events().publish(
            (soroban_sdk::symbol_short!("adm_chg"), admin_actual, nuevo_admin.clone()),
            nuevo_admin
        );

        extender_ttl_instancia(&env);
    }

    pub fn obtener_proyecto(env: Env, id: u32) -> Proyecto {
        let proyecto: Proyecto = env.storage().persistent().get(&Clave::Proyecto(id)).expect("Proyecto no existe");
        extender_ttl_proyecto(&env, id);
        proyecto
    }

    pub fn obtener_aportacion(env: Env, id_proyecto: u32, backer: Address) -> Aportacion {
        let aportacion: Aportacion = env.storage().persistent().get(&Clave::Aportacion(id_proyecto, backer.clone())).expect("Sin aportacion");
        extender_ttl_aportacion(&env, id_proyecto, &backer);
        aportacion
    }

    pub fn total_proyectos(env: Env) -> u32 {
        let total = env.storage().instance().get(&Clave::ContadorProyectos).unwrap_or(0);
        extender_ttl_instancia(&env);
        total
    }

    pub fn admin_pausar(env: Env, admin: Address) {
        admin.require_auth();
        let admin_guardado: Address = env.storage().instance().get(&Clave::Admin).expect("No inicializado");
        assert!(admin == admin_guardado, "Solo el admin puede pausar");
        env.storage().instance().set(&Clave::Pausado, &true);

        #[allow(deprecated)]
        env.events().publish(
            (symbol_short!("pausar"), admin.clone()),
            env.ledger().timestamp(),
        );
    }

    pub fn admin_reanudar(env: Env, admin: Address) {
        admin.require_auth();
        let admin_guardado: Address = env.storage().instance().get(&Clave::Admin).expect("No inicializado");
        assert!(admin == admin_guardado, "Solo el admin puede reanudar");
        env.storage().instance().set(&Clave::Pausado, &false);

        #[allow(deprecated)]
        env.events().publish(
            (symbol_short!("reanudar"), admin.clone()),
            env.ledger().timestamp(),
        );
    }

    /// Actualiza el WASM del contrato. Solo el admin puede ejecutar esta función.
    /// El estado (proyectos, aportaciones) se preserva automáticamente en el ledger.
    pub fn admin_upgrade(env: Env, admin: Address, new_wasm_hash: BytesN<32>) {
        admin.require_auth();
        let admin_guardado: Address = env.storage().instance().get(&Clave::Admin).expect("No inicializado");
        assert!(admin == admin_guardado, "Solo el admin puede actualizar el contrato");

        #[allow(deprecated)]
        env.events().publish(
            (symbol_short!("upgrade"), admin.clone()),
            (new_wasm_hash.clone(), env.ledger().timestamp()),
        );

        // In tests, update_current_contract_wasm cannot be called because no real
        // WASM is stored in the test ledger (contracts are registered as Rust structs).
        // The auth check above is still fully verified.
        #[cfg(not(test))]
        env.deployer().update_current_contract_wasm(new_wasm_hash);
        #[cfg(test)]
        let _ = new_wasm_hash;
    }
}

#[cfg(test)]
mod test;
