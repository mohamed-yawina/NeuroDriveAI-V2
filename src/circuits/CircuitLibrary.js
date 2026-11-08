import { parseCircuitJSON, validateCircuitFormat } from './CircuitFormat.js';

export const CIRCUIT_LIBRARY_KEY = 'neurodriveai.user-circuits.v1';

export class CircuitLibraryError extends Error {
  constructor(message, cause) { super(message, { cause }); this.name = 'CircuitLibraryError'; }
}

export class CircuitLibrary {
  constructor(storage = globalThis.localStorage, key = CIRCUIT_LIBRARY_KEY) { this.storage = storage; this.key = key; }

  list() {
    let records;
    try { records = JSON.parse(this.storage?.getItem(this.key) ?? '[]'); }
    catch (error) { throw new CircuitLibraryError('La bibliothèque locale est illisible.', error); }
    if (!Array.isArray(records)) throw new CircuitLibraryError('Le format de la bibliothèque locale est incompatible.');
    return records.filter((circuit) => validateCircuitFormat(circuit).valid);
  }

  save(circuit) {
    const report = validateCircuitFormat(circuit);
    if (!report.valid) throw new CircuitLibraryError(`Circuit invalide : ${report.errors[0]}`);
    const records = this.list();
    const next = [...records.filter((record) => record.id !== circuit.id), structuredClone(circuit)];
    try { this.storage.setItem(this.key, JSON.stringify(next)); }
    catch (error) { throw new CircuitLibraryError('Impossible d’enregistrer le circuit dans le stockage local.', error); }
    return circuit.id;
  }

  load(id) {
    const circuit = this.list().find((record) => record.id === id);
    if (!circuit) throw new CircuitLibraryError(`Circuit « ${id} » absent de la bibliothèque.`);
    return structuredClone(circuit);
  }

  remove(id) {
    const next = this.list().filter((record) => record.id !== id);
    try { this.storage.setItem(this.key, JSON.stringify(next)); }
    catch (error) { throw new CircuitLibraryError('Impossible de modifier la bibliothèque locale.', error); }
  }

  importText(text) {
    const { circuit } = parseCircuitJSON(text);
    this.save(circuit);
    return circuit;
  }

  exportText(id) { return JSON.stringify(this.load(id), null, 2); }
}
