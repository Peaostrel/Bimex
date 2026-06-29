import { StrKey } from "@stellar/stellar-sdk";

/**
 * Validate that a given string is a valid Stellar Ed25519 public key (G-address).
 * @param {string} direccion - Stellar address to validate.
 * @returns {boolean} true if valid, false otherwise.
 */
export function esDireccionValida(direccion) {
  return typeof direccion === "string" && StrKey.isValidEd25519PublicKey(direccion);
}

/**
 * Validate that a given string is a valid Stellar contract ID.
 * @param {string} id - Contract ID to validate.
 * @returns {boolean} true if valid, false otherwise.
 */
export function esContractIdValido(id) {
  return typeof id === "string" && StrKey.isValidContract(id);
}
