use super::*;
use soroban_sdk::{
    testutils::{Address as _, Events as _, Ledger},
    token::StellarAssetClient,
    Env, String,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

fn doc_cid_vacio(env: &Env) -> String {
    String::from_str(env, "")
}

/// 6 meses en segundos — plazo por defecto en la mayoría de los tests
const PLAZO_6_MESES: u64 = 6 * 30 * 24 * 3_600; // 15_552_000 s

fn setup() -> (Env, BimexContratoClient<'static>, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|l| l.timestamp = 0);

    let admin  = Address::generate(&env);
    let dueno  = Address::generate(&env);
    let backer = Address::generate(&env);

    let token_admin = Address::generate(&env);
    let token_id    = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_mxne  = token_id.address();

    let asset = StellarAssetClient::new(&env, &token_mxne);
    asset.mint(&backer, &1_000_000_000i128);

    let contrato_id = env.register(BimexContrato, ());
    let cliente     = BimexContratoClient::new(&env, &contrato_id);
    asset.mint(&contrato_id, &100_000_000_000i128);

    cliente.inicializar(&admin, &token_mxne, &945u32, &400u32);
    (env, cliente, admin, dueno, backer)
}

fn setup_con_token() -> (Env, BimexContratoClient<'static>, Address, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|l| l.timestamp = 0);

    let admin  = Address::generate(&env);
    let dueno  = Address::generate(&env);
    let backer = Address::generate(&env);

    let token_admin = Address::generate(&env);
    let token_id    = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_mxne  = token_id.address();

    let asset = StellarAssetClient::new(&env, &token_mxne);
    asset.mint(&backer, &1_000_000_000i128);

    let contrato_id = env.register(BimexContrato, ());
    let cliente     = BimexContratoClient::new(&env, &contrato_id);
    asset.mint(&contrato_id, &100_000_000_000i128);

    cliente.inicializar(&admin, &token_mxne, &945u32, &400u32);
    (env, cliente, admin, dueno, backer, token_mxne)
}

// ============================================================
//  EXISTING TESTS
// ============================================================

#[test]
fn test_flujo_completo() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|l| l.timestamp = 0);

    let admin  = Address::generate(&env);
    let dueno  = Address::generate(&env);
    let backer = Address::generate(&env);

    let token_admin = Address::generate(&env);
    let token_id    = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_mxne  = token_id.address();

    let asset = StellarAssetClient::new(&env, &token_mxne);
    asset.mint(&backer, &500_000_000i128);

    let contrato_id = env.register(BimexContrato, ());
    let cliente     = BimexContratoClient::new(&env, &contrato_id);
    asset.mint(&contrato_id, &100_000_000_000i128);

    cliente.inicializar(&admin, &token_mxne, &945u32, &400u32);

    let id = cliente.crear_proyecto(
        &dueno,
        &String::from_str(&env, "Huerto comunitario CDMX"),
        &200_000_000i128,
        &String::from_str(&env, ""),
        &6u32,
    );
    assert_eq!(id, 0);
    assert_eq!(cliente.obtener_proyecto(&id).estado, EstadoProyecto::EnRevision);

    cliente.admin_aprobar(&id);
    assert_eq!(cliente.obtener_proyecto(&id).estado, EstadoProyecto::EtapaInicial);

    cliente.contribuir(&backer, &id, &100_000_000i128);
    let p = cliente.obtener_proyecto(&id);
    assert_eq!(p.total_aportado,   100_000_000i128);
    assert_eq!(p.estado,           EstadoProyecto::EnProgreso);
    assert_eq!(p.capital_en_cetes,  50_000_000i128);
    assert_eq!(p.capital_en_amm,    50_000_000i128);

    env.ledger().with_mut(|l| l.timestamp = 30 * 60);

    let detalle = cliente.calcular_yield_detallado(&id);
    assert!(detalle.cetes > 0);
    assert!(detalle.amm   > 0);
    assert_eq!(detalle.total, detalle.cetes + detalle.amm);

    let yield_reclamado = cliente.reclamar_yield(&id);
    assert_eq!(yield_reclamado, detalle.total);

    cliente.contribuir(&backer, &id, &100_000_000i128);
    assert_eq!(cliente.obtener_proyecto(&id).estado, EstadoProyecto::Liberado);

    let principal = cliente.retirar_principal(&backer, &id);
    assert_eq!(principal, 200_000_000i128);
    assert_eq!(cliente.obtener_proyecto(&id).total_aportado, 0);
}

#[test]
fn test_estado_capital() {
    let (env, cliente, _admin, dueno, backer) = setup();

    let id = cliente.crear_proyecto(&dueno, &String::from_str(&env, "Test capital"), &10_000_000i128, &doc_cid_vacio(&env), &6u32);
    cliente.admin_aprobar(&id);
    // Overfunding cap: only 10M accepted even though 200M sent
    cliente.contribuir(&backer, &id, &200_000_000i128);

    let estado = cliente.estado_capital(&id);
    assert_eq!(estado.en_cetes, 5_000_000i128);
    assert_eq!(estado.en_amm,   5_000_000i128);
    assert_eq!(estado.total,   10_000_000i128);
}

#[test]
fn test_abandonar_y_continuar() {
    let (env, cliente, _admin, dueno, backer) = setup();

    let id = cliente.crear_proyecto(&dueno, &String::from_str(&env, "Proyecto prueba"), &10_000_000i128, &doc_cid_vacio(&env), &6u32);
    cliente.admin_aprobar(&id);
    cliente.abandonar_proyecto(&id);

    assert_eq!(cliente.obtener_proyecto(&id).estado, EstadoProyecto::Abandonado);

    cliente.solicitar_continuar(&backer, &id);

    let p = cliente.obtener_proyecto(&id);
    assert_eq!(p.estado, EstadoProyecto::EtapaInicial);
    assert_eq!(p.dueno,  backer);
}

#[test]
fn test_meta_alcanzada() {
    let (env, cliente, _admin, dueno, backer) = setup();

    let id = cliente.crear_proyecto(&dueno, &String::from_str(&env, "Meta exacta"), &100_000_000i128, &doc_cid_vacio(&env), &6u32);
    cliente.admin_aprobar(&id);
    cliente.contribuir(&backer, &id, &100_000_000i128);

    assert_eq!(cliente.obtener_proyecto(&id).estado, EstadoProyecto::Liberado);
}

#[test]
fn test_evento_contribucion_emitido() {
    let (env, cliente, _admin, dueno, backer) = setup();

    let id = cliente.crear_proyecto(&dueno, &String::from_str(&env, "Evento contribucion"), &100_000_000i128, &doc_cid_vacio(&env), &6u32);
    cliente.admin_aprobar(&id);
    cliente.contribuir(&backer, &id, &50_000_000i128);

    let events = env.events().all();
    assert_eq!(events.events().len(), 2);
}

#[test]
fn test_evento_yield_emitido() {
    let (env, cliente, _admin, dueno, backer) = setup();

    let id = cliente.crear_proyecto(&dueno, &String::from_str(&env, "Evento yield"), &100_000_000i128, &doc_cid_vacio(&env), &6u32);
    cliente.admin_aprobar(&id);
    cliente.contribuir(&backer, &id, &50_000_000i128);
    env.ledger().with_mut(|l| l.timestamp = 30 * 60);
    cliente.reclamar_yield(&id);

    let events = env.events().all();
    assert!(events.events().len() >= 2);
}

#[test]
fn test_evento_retiro_emitido() {
    let (env, cliente, _admin, dueno, backer) = setup();

    let id = cliente.crear_proyecto(&dueno, &String::from_str(&env, "Evento retiro"), &100_000_000i128, &doc_cid_vacio(&env), &6u32);
    cliente.admin_aprobar(&id);
    cliente.contribuir(&backer, &id, &50_000_000i128);
    env.ledger().with_mut(|l| l.timestamp = PLAZO_6_MESES + 1);
    let _monto = cliente.retirar_principal(&backer, &id);

    let events = env.events().all();
    assert!(events.events().len() >= 2);
}

#[test]
fn test_evento_admin_aprobar_emitido() {
    let (env, cliente, _admin, dueno, _backer) = setup();

    let id = cliente.crear_proyecto(&dueno, &String::from_str(&env, "Evento aprobar"), &100_000_000i128, &doc_cid_vacio(&env), &6u32);
    cliente.admin_aprobar(&id);

    let events = env.events().all();
    assert_eq!(events.events().len(), 1);
}

#[test]
fn test_evento_admin_rechazar_emitido() {
    let (env, cliente, _admin, dueno, _backer) = setup();

    let id = cliente.crear_proyecto(&dueno, &String::from_str(&env, "Evento rechazar"), &100_000_000i128, &doc_cid_vacio(&env), &6u32);
    cliente.admin_rechazar(&id, &String::from_str(&env, "Motivo de prueba"));

    let events = env.events().all();
    assert_eq!(events.events().len(), 1);
}

#[test]
fn test_crear_multiples_proyectos() {
    let (env, cliente, _admin, dueno, _backer) = setup();

    let id0 = cliente.crear_proyecto(&dueno, &String::from_str(&env, "Proyecto A"), &10_000_000i128, &doc_cid_vacio(&env), &6u32);
    let id1 = cliente.crear_proyecto(&dueno, &String::from_str(&env, "Proyecto B"), &20_000_000i128, &doc_cid_vacio(&env), &12u32);

    assert_eq!(id0, 0);
    assert_eq!(id1, 1);
    assert_eq!(cliente.total_proyectos(), 2);
}

// ============================================================
//  TIEMPO Y VENCIMIENTO
// ============================================================

/// El proyecto almacena correctamente tiempo_meses y timestamp_vencimiento
#[test]
fn test_tiempo_meses_almacenado() {
    let (env, cliente, _admin, dueno, _backer) = setup();

    let id = cliente.crear_proyecto(&dueno, &String::from_str(&env, "Plazo 3 meses"), &10_000_000i128, &doc_cid_vacio(&env), &3u32);
    let p = cliente.obtener_proyecto(&id);

    assert_eq!(p.tiempo_meses, 3u32);
    // timestamp_inicio = 0 (ledger starts at 0), vencimiento = 3 * 30 * 24 * 3600
    let esperado: u64 = 3 * 30 * 24 * 3_600;
    assert_eq!(p.timestamp_vencimiento, esperado);
}

/// No se pueden hacer contribuciones después del vencimiento
#[test]
#[should_panic(expected = "El plazo de recaudacion ha vencido")]
fn test_contribuir_despues_de_vencimiento_falla() {
    let (env, cliente, _admin, dueno, backer) = setup();

    let id = cliente.crear_proyecto(&dueno, &String::from_str(&env, "Plazo corto"), &100_000_000i128, &doc_cid_vacio(&env), &1u32);
    cliente.admin_aprobar(&id);

    // Avanzar más allá del vencimiento (1 mes = 2_592_000 s)
    env.ledger().with_mut(|l| l.timestamp = 2_592_001);
    cliente.contribuir(&backer, &id, &10_000_000i128);
}

/// Después del vencimiento el backer puede retirar principal aunque el proyecto
/// no haya alcanzado la meta
#[test]
fn test_retiro_despues_de_vencimiento() {
    let (env, cliente, _admin, dueno, backer) = setup();

    let id = cliente.crear_proyecto(&dueno, &String::from_str(&env, "Vence sin meta"), &500_000_000i128, &doc_cid_vacio(&env), &1u32);
    cliente.admin_aprobar(&id);
    cliente.contribuir(&backer, &id, &100_000_000i128);

    assert_eq!(cliente.obtener_proyecto(&id).estado, EstadoProyecto::EnProgreso);

    // Avanzar más allá del vencimiento
    env.ledger().with_mut(|l| l.timestamp = 2_592_001);

    let monto = cliente.retirar_principal(&backer, &id);
    assert_eq!(monto, 100_000_000i128);
    assert_eq!(cliente.obtener_proyecto(&id).total_aportado, 0);
}

/// `retiro_anticipado` devuelve el 100 % del capital antes del vencimiento
#[test]
fn test_retiro_anticipado_devuelve_capital() {
    let (env, cliente, _admin, dueno, backer) = setup();

    let id = cliente.crear_proyecto(&dueno, &String::from_str(&env, "Retiro anticipado"), &500_000_000i128, &doc_cid_vacio(&env), &6u32);
    cliente.admin_aprobar(&id);
    cliente.contribuir(&backer, &id, &100_000_000i128);

    // Avanzar 30 min (dentro del plazo de 6 meses)
    env.ledger().with_mut(|l| l.timestamp = 30 * 60);

    let monto = cliente.retiro_anticipado(&backer, &id);
    assert_eq!(monto, 100_000_000i128);

    let p = cliente.obtener_proyecto(&id);
    assert_eq!(p.total_aportado, 0);
    assert_eq!(p.estado, EstadoProyecto::EtapaInicial);
}

/// `retiro_anticipado` no es posible después del vencimiento
#[test]
#[should_panic(expected = "El plazo ya vencio, usa retirar_principal")]
fn test_retiro_anticipado_despues_de_vencimiento_falla() {
    let (env, cliente, _admin, dueno, backer) = setup();

    let id = cliente.crear_proyecto(&dueno, &String::from_str(&env, "Plazo corto"), &500_000_000i128, &doc_cid_vacio(&env), &1u32);
    cliente.admin_aprobar(&id);
    cliente.contribuir(&backer, &id, &100_000_000i128);

    env.ledger().with_mut(|l| l.timestamp = 2_592_001);
    cliente.retiro_anticipado(&backer, &id);
}

/// `retiro_anticipado` no aplica a proyectos Liberados
#[test]
#[should_panic(expected = "El retiro anticipado solo aplica a proyectos activos")]
fn test_retiro_anticipado_proyecto_liberado_falla() {
    let (env, cliente, _admin, dueno, backer) = setup();

    let id = cliente.crear_proyecto(&dueno, &String::from_str(&env, "Liberado"), &100_000_000i128, &doc_cid_vacio(&env), &6u32);
    cliente.admin_aprobar(&id);
    cliente.contribuir(&backer, &id, &100_000_000i128);

    assert_eq!(cliente.obtener_proyecto(&id).estado, EstadoProyecto::Liberado);
    cliente.retiro_anticipado(&backer, &id);
}

/// tiempo_meses = 0 es inválido
#[test]
#[should_panic(expected = "El tiempo debe estar entre 1 y 120 meses")]
fn test_tiempo_meses_cero_falla() {
    let (env, cliente, _admin, dueno, _backer) = setup();
    cliente.crear_proyecto(&dueno, &String::from_str(&env, "Sin plazo"), &10_000_000i128, &doc_cid_vacio(&env), &0u32);
}

/// tiempo_meses > 120 es inválido
#[test]
#[should_panic(expected = "El tiempo debe estar entre 1 y 120 meses")]
fn test_tiempo_meses_excesivo_falla() {
    let (env, cliente, _admin, dueno, _backer) = setup();
    cliente.crear_proyecto(&dueno, &String::from_str(&env, "Demasiado largo"), &10_000_000i128, &doc_cid_vacio(&env), &121u32);
}

// ============================================================
//  VULNERABILITY-SPECIFIC TESTS
// ============================================================

/// VUL-01: reclamar_yield must be blocked on non-active states
#[test]
#[should_panic(expected = "El proyecto no esta activo")]
fn test_vul01_yield_bloqueado_en_revision() {
    let (env, cliente, _admin, dueno, _backer) = setup();
    let id = cliente.crear_proyecto(&dueno, &String::from_str(&env, "Test"), &10_000_000i128, &doc_cid_vacio(&env), &6u32);
    env.ledger().with_mut(|l| l.timestamp = 525_600 * 60);
    cliente.reclamar_yield(&id);
}

/// VUL-01b: reclamar_yield must be blocked on Rechazado state
#[test]
#[should_panic(expected = "El proyecto no esta activo")]
fn test_vul01b_yield_bloqueado_rechazado() {
    let (env, cliente, admin, dueno, _backer) = setup();
    let id = cliente.crear_proyecto(&dueno, &String::from_str(&env, "Test"), &10_000_000i128, &doc_cid_vacio(&env), &6u32);
    cliente.admin_rechazar(&id, &String::from_str(&env, "Documentos invalidos"));
    env.ledger().with_mut(|l| l.timestamp = 525_600 * 60);
    let _ = admin;
    cliente.reclamar_yield(&id);
}

/// VUL-01c: reclamar_yield must be blocked on Abandonado state
#[test]
#[should_panic(expected = "El proyecto no esta activo")]
fn test_vul01c_yield_bloqueado_abandonado() {
    let (env, cliente, _admin, dueno, _backer) = setup();
    let id = cliente.crear_proyecto(&dueno, &String::from_str(&env, "Test"), &10_000_000i128, &doc_cid_vacio(&env), &6u32);
    cliente.admin_aprobar(&id);
    cliente.abandonar_proyecto(&id);
    env.ledger().with_mut(|l| l.timestamp = 525_600 * 60);
    cliente.reclamar_yield(&id);
}

/// VUL-02: abandonar_proyecto must be blocked on Rechazado/EnRevision states
#[test]
#[should_panic(expected = "El proyecto no puede ser abandonado en su estado actual")]
fn test_vul02_no_abandonar_rechazado() {
    let (env, cliente, _admin, dueno, _backer) = setup();
    let id = cliente.crear_proyecto(&dueno, &String::from_str(&env, "Test"), &10_000_000i128, &doc_cid_vacio(&env), &6u32);
    cliente.admin_rechazar(&id, &String::from_str(&env, "Motivo"));
    cliente.abandonar_proyecto(&id);
}

/// VUL-02b: abandonar_proyecto must be blocked on EnRevision state
#[test]
#[should_panic(expected = "El proyecto no puede ser abandonado en su estado actual")]
fn test_vul02b_no_abandonar_en_revision() {
    let (env, cliente, _admin, dueno, _backer) = setup();
    let id = cliente.crear_proyecto(&dueno, &String::from_str(&env, "Test"), &10_000_000i128, &doc_cid_vacio(&env), &6u32);
    cliente.abandonar_proyecto(&id);
}

/// VUL-03: overfunding cap — contribution must be capped at meta
#[test]
fn test_vul03_overfunding_cap() {
    let (env, cliente, _admin, dueno, backer) = setup();
    let id = cliente.crear_proyecto(&dueno, &String::from_str(&env, "Test"), &50_000_000i128, &doc_cid_vacio(&env), &6u32);
    cliente.admin_aprobar(&id);
    cliente.contribuir(&backer, &id, &150_000_000i128);

    let p = cliente.obtener_proyecto(&id);
    assert_eq!(p.total_aportado, 50_000_000i128);
    assert_eq!(p.estado, EstadoProyecto::Liberado);
}

/// VUL-04: yield clock must not reset on top-up contribution
#[test]
fn test_vul04_timestamp_preservado_en_topup() {
    let (env, cliente, _admin, dueno, backer) = setup();
    let id = cliente.crear_proyecto(&dueno, &String::from_str(&env, "Test"), &200_000_000i128, &doc_cid_vacio(&env), &6u32);
    cliente.admin_aprobar(&id);

    cliente.contribuir(&backer, &id, &50_000_000i128);
    let ts_original = cliente.obtener_aportacion(&id, &backer).timestamp;
    assert_eq!(ts_original, 0);

    env.ledger().with_mut(|l| l.timestamp = 60);
    cliente.contribuir(&backer, &id, &50_000_000i128);
    let ts_despues = cliente.obtener_aportacion(&id, &backer).timestamp;
    assert_eq!(ts_despues, 0);
}

/// VUL-05: yield bps bounds enforced
#[test]
#[should_panic(expected = "yield_cetes_bps excede el maximo")]
fn test_vul05_yield_bps_cetes_excede_maximo() {
    let env = Env::default();
    env.mock_all_auths();

    let admin       = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token_id    = env.register_stellar_asset_contract_v2(token_admin);
    let token_mxne  = token_id.address();

    let contrato_id = env.register(BimexContrato, ());
    let cliente     = BimexContratoClient::new(&env, &contrato_id);

    cliente.inicializar(&admin, &token_mxne, &10_000_001u32, &1000u32);
}

/// VUL-05b: yield amm bps bounds enforced
#[test]
#[should_panic(expected = "yield_amm_bps excede el maximo")]
fn test_vul05b_yield_bps_amm_excede_maximo() {
    let env = Env::default();
    env.mock_all_auths();

    let admin       = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token_id    = env.register_stellar_asset_contract_v2(token_admin);
    let token_mxne  = token_id.address();

    let contrato_id = env.register(BimexContrato, ());
    let cliente     = BimexContratoClient::new(&env, &contrato_id);

    cliente.inicializar(&admin, &token_mxne, &1000u32, &10_000_001u32);
}

/// VUL-06: solicitar_continuar resets yield clock for new owner
#[test]
fn test_vul06_continuar_resetea_timestamp() {
    let (env, cliente, _admin, dueno, backer) = setup();
    let id = cliente.crear_proyecto(&dueno, &String::from_str(&env, "Test"), &10_000_000i128, &doc_cid_vacio(&env), &6u32);
    cliente.admin_aprobar(&id);

    env.ledger().with_mut(|l| l.timestamp = 525_600 * 60);
    cliente.abandonar_proyecto(&id);

    let nuevo_dueno = Address::generate(&env);
    let _ = backer;
    cliente.solicitar_continuar(&nuevo_dueno, &id);

    let p = cliente.obtener_proyecto(&id);
    assert_eq!(p.timestamp_inicio, 525_600 * 60);
}

/// VUL-07: double withdrawal prevented
#[test]
#[should_panic(expected = "No tienes aportacion en este proyecto")]
fn test_vul07_no_doble_retiro() {
    let (env, cliente, _admin, dueno, backer) = setup();
    let id = cliente.crear_proyecto(&dueno, &String::from_str(&env, "Test"), &100_000_000i128, &doc_cid_vacio(&env), &6u32);
    cliente.admin_aprobar(&id);
    cliente.contribuir(&backer, &id, &100_000_000i128);

    assert_eq!(cliente.obtener_proyecto(&id).estado, EstadoProyecto::Liberado);

    cliente.retirar_principal(&backer, &id);
    // Estado vuelve a EtapaInicial, plazo no vencido → debe panicar
    cliente.retirar_principal(&backer, &id);
}

/// VUL-08: contribuir rejected on non-active states (EnRevision)
#[test]
#[should_panic(expected = "El proyecto no acepta fondos")]
fn test_vul08_no_contribuir_en_revision() {
    let (env, cliente, _admin, dueno, backer) = setup();
    let id = cliente.crear_proyecto(&dueno, &String::from_str(&env, "Test"), &100_000_000i128, &doc_cid_vacio(&env), &6u32);
    cliente.contribuir(&backer, &id, &10_000_000i128);
}

/// VUL-09: retirar_principal allowed on EnProgreso state under immediate liquidity policy
#[test]
fn test_vul09_retiro_en_progreso_permitido() {
    let (env, cliente, _admin, dueno, backer) = setup();
    let id = cliente.crear_proyecto(&dueno, &String::from_str(&env, "Test"), &200_000_000i128, &doc_cid_vacio(&env), &6u32);
    cliente.admin_aprobar(&id);
    cliente.contribuir(&backer, &id, &50_000_000i128);

    assert_eq!(cliente.obtener_proyecto(&id).estado, EstadoProyecto::EnProgreso);
    let monto = cliente.retirar_principal(&backer, &id);
    assert_eq!(monto, 50_000_000i128);
}

// ============================================================
//  TASAS REALES DE PRODUCCIÓN
// ============================================================

#[test]
fn test_yield_tasas_reales_produccion() {
    let (env, cliente, _admin, dueno, backer) = setup();

    let meta: i128 = 1_000_000_000;
    let id = cliente.crear_proyecto(
        &dueno,
        &String::from_str(&env, "Produccion tasas reales"),
        &meta,
        &doc_cid_vacio(&env),
        &12u32,
    );
    cliente.admin_aprobar(&id);
    cliente.contribuir(&backer, &id, &meta);

    assert_eq!(cliente.obtener_proyecto(&id).estado, EstadoProyecto::Liberado);

    const SEGUNDOS_ANO: u64 = 525_600 * 60;
    env.ledger().with_mut(|l| l.timestamp = SEGUNDOS_ANO);

    let detalle = cliente.calcular_yield_detallado(&id);

    assert!(
        detalle.cetes >= 45_000_000 && detalle.cetes <= 49_000_000,
        "CETES yield anual fuera de rango (~47.25 MXNe): {} stroops", detalle.cetes
    );
    assert!(
        detalle.amm >= 18_000_000 && detalle.amm <= 22_000_000,
        "AMM yield anual fuera de rango (~20.00 MXNe): {} stroops", detalle.amm
    );
    assert_eq!(detalle.total, detalle.cetes + detalle.amm);
}

// ============================================================
//  EDGE CASE COVERAGE
// ============================================================

#[test]
fn test_multiple_contributors_same_project() {
    let (env, cliente, _admin, dueno, backer1, token_mxne) = setup_con_token();
    let backer2 = Address::generate(&env);
    let asset = StellarAssetClient::new(&env, &token_mxne);
    asset.mint(&backer2, &500_000_000i128);

    let id = cliente.crear_proyecto(&dueno, &String::from_str(&env, "Multi backer"), &300_000_000i128, &doc_cid_vacio(&env), &6u32);
    cliente.admin_aprobar(&id);
    cliente.contribuir(&backer1, &id, &100_000_000i128);
    cliente.contribuir(&backer2, &id, &200_000_000i128);

    let p = cliente.obtener_proyecto(&id);
    assert_eq!(p.total_aportado, 300_000_000i128);
    assert_eq!(p.estado, EstadoProyecto::Liberado);

    let a1 = cliente.obtener_aportacion(&id, &backer1);
    let a2 = cliente.obtener_aportacion(&id, &backer2);
    assert_eq!(a1.cantidad, 100_000_000i128);
    assert_eq!(a2.cantidad, 200_000_000i128);
}

#[test]
fn test_multiple_contributions_same_backer_accumulate() {
    let (env, cliente, _admin, dueno, backer) = setup();

    let id = cliente.crear_proyecto(&dueno, &String::from_str(&env, "Acumulado"), &500_000_000i128, &doc_cid_vacio(&env), &6u32);
    cliente.admin_aprobar(&id);
    cliente.contribuir(&backer, &id, &100_000_000i128);
    cliente.contribuir(&backer, &id, &150_000_000i128);

    let a = cliente.obtener_aportacion(&id, &backer);
    assert_eq!(a.cantidad, 250_000_000i128);
    assert_eq!(cliente.obtener_proyecto(&id).total_aportado, 250_000_000i128);
}

#[test]
fn test_admin_rechazar_con_motivo() {
    let (env, cliente, _admin, dueno, _backer) = setup();

    let id = cliente.crear_proyecto(&dueno, &String::from_str(&env, "Proyecto malo"), &10_000_000i128, &doc_cid_vacio(&env), &6u32);
    cliente.admin_rechazar(&id, &String::from_str(&env, "Documentacion incompleta"));

    let p = cliente.obtener_proyecto(&id);
    assert_eq!(p.estado, EstadoProyecto::Rechazado);
    assert_eq!(p.motivo_rechazo, String::from_str(&env, "Documentacion incompleta"));
}

#[test]
fn test_solicitar_continuar_con_fondos_existentes() {
    let (env, cliente, _admin, dueno, backer) = setup();
    let nuevo_dueno = Address::generate(&env);

    let id = cliente.crear_proyecto(&dueno, &String::from_str(&env, "Con fondos"), &500_000_000i128, &doc_cid_vacio(&env), &6u32);
    cliente.admin_aprobar(&id);
    cliente.contribuir(&backer, &id, &100_000_000i128);
    cliente.abandonar_proyecto(&id);
    cliente.solicitar_continuar(&nuevo_dueno, &id);

    let p = cliente.obtener_proyecto(&id);
    assert_eq!(p.estado, EstadoProyecto::EnProgreso);
    assert_eq!(p.dueno, nuevo_dueno);
}

#[test]
fn test_retirar_principal_proyecto_abandonado() {
    let (env, cliente, _admin, dueno, backer) = setup();

    let id = cliente.crear_proyecto(&dueno, &String::from_str(&env, "Abandonado"), &500_000_000i128, &doc_cid_vacio(&env), &6u32);
    cliente.admin_aprobar(&id);
    cliente.contribuir(&backer, &id, &100_000_000i128);
    cliente.abandonar_proyecto(&id);

    let monto = cliente.retirar_principal(&backer, &id);
    assert_eq!(monto, 100_000_000i128);
}

#[test]
fn test_yield_cero_sin_tiempo_transcurrido() {
    let (env, cliente, _admin, dueno, backer) = setup();

    let id = cliente.crear_proyecto(&dueno, &String::from_str(&env, "Sin tiempo"), &500_000_000i128, &doc_cid_vacio(&env), &6u32);
    cliente.admin_aprobar(&id);
    cliente.contribuir(&backer, &id, &100_000_000i128);

    let yield_backer = cliente.calcular_yield(&id, &backer);
    assert_eq!(yield_backer, 0i128);

    let detalle = cliente.calcular_yield_detallado(&id);
    assert_eq!(detalle.total, 0i128);
}

#[test]
fn test_capital_distribucion_impar() {
    let (env, cliente, _admin, dueno, backer) = setup();

    let id = cliente.crear_proyecto(&dueno, &String::from_str(&env, "Impar"), &500_000_000i128, &doc_cid_vacio(&env), &6u32);
    cliente.admin_aprobar(&id);
    cliente.contribuir(&backer, &id, &101i128);

    let p = cliente.obtener_proyecto(&id);
    assert_eq!(p.capital_en_cetes, 50i128);
    assert_eq!(p.capital_en_amm,   51i128);
}

#[test]
fn test_retirar_todos_los_fondos_vuelve_a_etapa_inicial() {
    let (env, cliente, _admin, dueno, backer) = setup();

    let id = cliente.crear_proyecto(&dueno, &String::from_str(&env, "Reset"), &500_000_000i128, &doc_cid_vacio(&env), &6u32);
    cliente.admin_aprobar(&id);
    cliente.contribuir(&backer, &id, &100_000_000i128);
    assert_eq!(cliente.obtener_proyecto(&id).estado, EstadoProyecto::EnProgreso);

    cliente.abandonar_proyecto(&id);
    cliente.retirar_principal(&backer, &id);

    let p = cliente.obtener_proyecto(&id);
    assert_eq!(p.total_aportado,   0i128);
    assert_eq!(p.capital_en_cetes, 0i128);
    assert_eq!(p.capital_en_amm,   0i128);
}

#[test]
#[should_panic(expected = "El proyecto no acepta fondos")]
fn test_contribuir_proyecto_en_revision_falla() {
    let (env, cliente, _admin, dueno, backer) = setup();
    let id = cliente.crear_proyecto(&dueno, &String::from_str(&env, "En revision"), &100_000_000i128, &doc_cid_vacio(&env), &6u32);
    cliente.contribuir(&backer, &id, &10_000_000i128);
}

#[test]
#[should_panic(expected = "El proyecto no acepta fondos")]
fn test_contribuir_proyecto_rechazado_falla() {
    let (env, cliente, _admin, dueno, backer) = setup();
    let id = cliente.crear_proyecto(&dueno, &String::from_str(&env, "Rechazado"), &100_000_000i128, &doc_cid_vacio(&env), &6u32);
    cliente.admin_rechazar(&id, &String::from_str(&env, "Fraude"));
    cliente.contribuir(&backer, &id, &10_000_000i128);
}

#[test]
#[should_panic(expected = "El proyecto no acepta fondos")]
fn test_contribuir_proyecto_liberado_falla() {
    let (env, cliente, _admin, dueno, backer) = setup();
    let id = cliente.crear_proyecto(&dueno, &String::from_str(&env, "Liberado"), &100_000_000i128, &doc_cid_vacio(&env), &6u32);
    cliente.admin_aprobar(&id);
    cliente.contribuir(&backer, &id, &100_000_000i128);
    cliente.contribuir(&backer, &id, &10_000_000i128);
}

#[test]
fn test_retirar_principal_en_progreso_exito() {
    let (env, cliente, _admin, dueno, backer) = setup();
    let id = cliente.crear_proyecto(&dueno, &String::from_str(&env, "En progreso"), &500_000_000i128, &doc_cid_vacio(&env), &6u32);
    cliente.admin_aprobar(&id);
    cliente.contribuir(&backer, &id, &100_000_000i128);
    let monto = cliente.retirar_principal(&backer, &id);
    assert_eq!(monto, 100_000_000i128);
}

#[test]
#[should_panic(expected = "Solo se pueden aprobar proyectos en revision")]
fn test_admin_aprobar_proyecto_ya_aprobado_falla() {
    let (env, cliente, _admin, dueno, _backer) = setup();
    let id = cliente.crear_proyecto(&dueno, &String::from_str(&env, "Doble aprobacion"), &100_000_000i128, &doc_cid_vacio(&env), &6u32);
    cliente.admin_aprobar(&id);
    cliente.admin_aprobar(&id);
}

#[test]
#[should_panic(expected = "Solo se pueden rechazar proyectos en revision")]
fn test_admin_rechazar_proyecto_aprobado_falla() {
    let (env, cliente, _admin, dueno, _backer) = setup();
    let id = cliente.crear_proyecto(&dueno, &String::from_str(&env, "Rechazar aprobado"), &100_000_000i128, &doc_cid_vacio(&env), &6u32);
    cliente.admin_aprobar(&id);
    cliente.admin_rechazar(&id, &String::from_str(&env, "Tarde"));
}

#[test]
#[should_panic(expected = "Solo puedes continuar proyectos abandonados")]
fn test_solicitar_continuar_proyecto_activo_falla() {
    let (env, cliente, _admin, dueno, backer) = setup();
    let id = cliente.crear_proyecto(&dueno, &String::from_str(&env, "Activo"), &100_000_000i128, &doc_cid_vacio(&env), &6u32);
    cliente.admin_aprobar(&id);
    cliente.solicitar_continuar(&backer, &id);
}

#[test]
#[should_panic(expected = "Ya inicializado")]
fn test_inicializar_dos_veces_falla() {
    let (env, cliente, admin, _dueno, _backer, token_mxne) = setup_con_token();
    cliente.inicializar(&admin, &token_mxne, &100u32, &100u32);
}

#[test]
#[should_panic(expected = "La meta debe ser mayor a 0")]
fn test_crear_proyecto_meta_cero_falla() {
    let (env, cliente, _admin, dueno, _backer) = setup();
    cliente.crear_proyecto(&dueno, &String::from_str(&env, "Meta cero"), &0i128, &doc_cid_vacio(&env), &6u32);
}

#[test]
#[should_panic(expected = "Cantidad debe ser mayor a 0")]
fn test_contribuir_cantidad_cero_falla() {
    let (env, cliente, _admin, dueno, backer) = setup();
    let id = cliente.crear_proyecto(&dueno, &String::from_str(&env, "Cero"), &100_000_000i128, &doc_cid_vacio(&env), &6u32);
    cliente.admin_aprobar(&id);
    cliente.contribuir(&backer, &id, &0i128);
}

#[test]
#[should_panic(expected = "Aun no hay yield suficiente acumulado")]
fn test_reclamar_yield_cero_falla() {
    let (env, cliente, _admin, dueno, backer) = setup();
    let id = cliente.crear_proyecto(&dueno, &String::from_str(&env, "Sin yield"), &500_000_000i128, &doc_cid_vacio(&env), &6u32);
    cliente.admin_aprobar(&id);
    cliente.contribuir(&backer, &id, &100_000_000i128);
    cliente.reclamar_yield(&id);
}

#[test]
fn test_yield_no_es_demo_exagerado() {
    let (env, cliente, _admin, dueno, backer) = setup();

    let meta: i128 = 1_000_000_000;
    let id = cliente.crear_proyecto(
        &dueno,
        &String::from_str(&env, "Anti-demo check"),
        &meta,
        &doc_cid_vacio(&env),
        &12u32,
    );
    cliente.admin_aprobar(&id);
    cliente.contribuir(&backer, &id, &meta);

    const SEGUNDOS_ANO: u64 = 525_600 * 60;
    env.ledger().with_mut(|l| l.timestamp = SEGUNDOS_ANO);

    let detalle = cliente.calcular_yield_detallado(&id);

    assert!(detalle.cetes < 100_000_000, "CETES parece tasa demo: {} stroops", detalle.cetes);
    assert!(detalle.amm   < 100_000_000, "AMM parece tasa demo: {} stroops",   detalle.amm);
}

// ============================================================
//  CIRCUIT BREAKER TESTS
// ============================================================

#[test]
#[should_panic(expected = "Contrato pausado por el administrador")]
fn test_pausa_bloquea_contribuciones() {
    let (env, cliente, admin, dueno, backer) = setup();
    let id = cliente.crear_proyecto(&dueno, &String::from_str(&env, "Test"), &100_000_000i128, &doc_cid_vacio(&env), &6u32);
    cliente.admin_aprobar(&id);

    // Contribuir antes de pausar
    cliente.contribuir(&backer, &id, &10_000_000i128);

    // Pausar contrato
    cliente.admin_pausar(&admin);

    // Las funciones de lectura deben seguir funcionando
    let p_read = cliente.obtener_proyecto(&id);
    assert_eq!(p_read.estado, EstadoProyecto::EnProgreso);
    let yield_read = cliente.calcular_yield(&id, &backer);
    assert_eq!(yield_read, 0);
    let yield_det = cliente.calcular_yield_detallado(&id);
    assert_eq!(yield_det.total, 0);
    let capital = cliente.estado_capital(&id);
    assert_eq!(capital.total, 10_000_000i128);

    // Intentar contribuir - debe fallar
    cliente.contribuir(&backer, &id, &10_000_000i128);
}

#[test]
fn test_reanudacion_permite_contribuciones() {
    let (env, cliente, admin, dueno, backer) = setup();
    let id = cliente.crear_proyecto(&dueno, &String::from_str(&env, "Test"), &100_000_000i128, &doc_cid_vacio(&env), &6u32);
    cliente.admin_aprobar(&id);

    // Pausar
    cliente.admin_pausar(&admin);

    // Reanudar
    cliente.admin_reanudar(&admin);

    // Contribuir debe funcionar ahora
    cliente.contribuir(&backer, &id, &10_000_000i128);
    
    let p = cliente.obtener_proyecto(&id);
    assert_eq!(p.total_aportado, 10_000_000i128);
}

#[test]
#[should_panic(expected = "Solo el admin puede pausar")]
fn test_solo_admin_puede_pausar() {
    let (env, cliente, _admin, _dueno, backer) = setup();
    cliente.admin_pausar(&backer);
}

#[test]
#[should_panic(expected = "Solo el admin puede reanudar")]
fn test_solo_admin_puede_reanudar() {
    let (env, cliente, _admin, _dueno, backer) = setup();
    cliente.admin_reanudar(&backer);
}

#[test]
fn test_admin_aprobacion_funciona_pausado() {
    let (env, cliente, admin, dueno, _backer) = setup();
    
    let id_aprobar = cliente.crear_proyecto(&dueno, &String::from_str(&env, "Test 1"), &100_000_000i128, &doc_cid_vacio(&env), &6u32);
    let id_rechazar = cliente.crear_proyecto(&dueno, &String::from_str(&env, "Test 2"), &100_000_000i128, &doc_cid_vacio(&env), &6u32);
    
    // Pausar
    cliente.admin_pausar(&admin);
    
    // Aprobar/Rechazar - debe funcionar
    cliente.admin_aprobar(&id_aprobar);
    cliente.admin_rechazar(&id_rechazar, &String::from_str(&env, "Motivo"));
    
    assert_eq!(cliente.obtener_proyecto(&id_aprobar).estado, EstadoProyecto::EtapaInicial);
    assert_eq!(cliente.obtener_proyecto(&id_rechazar).estado, EstadoProyecto::Rechazado);
}


// ============================================================
//  TTL TESTS
// ============================================================

#[test]
fn test_extend_ttl() {
    let (env, cliente, _admin, dueno, backer) = setup();

    let id = cliente.crear_proyecto(
        &dueno,
        &String::from_str(&env, "Proyecto TTL"),
        &100_000_000i128,
        &doc_cid_vacio(&env),
        &6u32,
    );

    cliente.admin_aprobar(&id);
    cliente.contribuir(&backer, &id, &10_000_000i128);

    env.ledger().with_mut(|l| l.sequence_number = 17_281);

    assert_eq!(cliente.total_proyectos(), 1);

    let proyecto = cliente.obtener_proyecto(&id);
    assert_eq!(proyecto.nombre, String::from_str(&env, "Proyecto TTL"));

    let aportacion = cliente.obtener_aportacion(&id, &backer);
    assert_eq!(aportacion.cantidad, 10_000_000i128);
}

// ============================================================
//  ADMIN ROTATION TESTS
// ============================================================

#[test]
fn test_admin_cambiar_admin_exito() {
    let (env, cliente, admin, dueno, _backer) = setup();
    let nuevo_admin = Address::generate(&env);

    cliente.admin_cambiar_admin(&admin, &nuevo_admin);

    let id = cliente.crear_proyecto(&dueno, &String::from_str(&env, "Proyecto A"), &10_000_000i128, &doc_cid_vacio(&env), &6u32);
    cliente.admin_aprobar(&id);

    let p = cliente.obtener_proyecto(&id);
    assert_eq!(p.estado, EstadoProyecto::EtapaInicial);
}

#[test]
#[should_panic(expected = "Solo el admin actual puede transferir el rol")]
fn test_admin_cambiar_admin_no_autorizado() {
    let (env, cliente, _admin, dueno, _backer) = setup();
    let nuevo_admin = Address::generate(&env);

    cliente.admin_cambiar_admin(&dueno, &nuevo_admin);
}

#[test]
fn test_admin_cambiar_admin_emite_evento() {
    let (env, cliente, admin, _dueno, _backer) = setup();
    let nuevo_admin = Address::generate(&env);

    cliente.admin_cambiar_admin(&admin, &nuevo_admin);

    let eventos = env.events().all();
    assert_eq!(eventos.events().len(), 1);
}

#[test]
#[should_panic(expected = "El nuevo admin debe ser diferente")]
fn test_admin_cambiar_admin_mismo_admin_falla() {
    let (_env, cliente, admin, _dueno, _backer) = setup();
    cliente.admin_cambiar_admin(&admin, &admin);
}

// ============================================================
//  UPGRADE PATTERN TESTS
// ============================================================

#[test]
fn test_solo_admin_puede_upgrade() {
    let (env, cliente, admin, _dueno, _backer) = setup();
    let mut hash = [0u8; 32];
    hash[0] = 1;
    let new_wasm_hash = soroban_sdk::BytesN::from_array(&env, &hash);
    // Auth check passes; actual WASM update is skipped in test mode
    // (update_current_contract_wasm requires real WASM in the ledger).
    cliente.admin_upgrade(&admin, &new_wasm_hash);
}

#[test]
#[should_panic(expected = "Solo el admin puede actualizar el contrato")]
fn test_no_admin_no_puede_upgrade() {
    let (env, cliente, _admin, dueno, _backer) = setup();
    let mut hash = [0u8; 32];
    hash[0] = 1;
    let new_wasm_hash = soroban_sdk::BytesN::from_array(&env, &hash);
    cliente.admin_upgrade(&dueno, &new_wasm_hash);
}
