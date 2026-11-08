import { parseCircuitJSON, validateCircuitFormat } from './CircuitFormat.js';

export const CIRCUIT_LIBRARY_KEY = 'neurodriveai.user-circuits.v1';
export const CIRCUIT_DRAFTS_KEY = 'neurodriveai.circuit-drafts.v1';

function isDraftDocument(value) {
  return Boolean(value && value.schema === 'neurodriveai.circuit' && value.version === 1
    && typeof value.id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(value.id)
    && typeof value.name === 'string' && value.name.length <= 72
    && Number.isFinite(value.width) && Array.isArray(value.controlPoints) && value.controlPoints.length <= 64
    && value.controlPoints.every((point) => point && Number.isFinite(point.x) && Number.isFinite(point.z))
    && typeof value.closed === 'boolean' && value.startLine && Number.isInteger(value.startLine.controlPointIndex));
}

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

  listDrafts() {
    let records;
    try { records = JSON.parse(this.storage?.getItem(CIRCUIT_DRAFTS_KEY) ?? '[]'); }
    catch (error) { throw new CircuitLibraryError('Le stockage des brouillons est illisible.', error); }
    if (!Array.isArray(records)) throw new CircuitLibraryError('Le format des brouillons est incompatible.');
    return records.filter(isDraftDocument).map((draft) => structuredClone(draft));
  }

  saveDraft(circuit) {
    if (!isDraftDocument(circuit)) throw new CircuitLibraryError('Le brouillon ne respecte pas la structure du format de circuit v1.');
    const records = this.listDrafts();
    const saved = { ...structuredClone(circuit), savedAsDraft: true, modifiedAt: new Date().toISOString() };
    const next = [...records.filter((record) => record.id !== circuit.id), saved];
    try { this.storage.setItem(CIRCUIT_DRAFTS_KEY, JSON.stringify(next)); }
    catch (error) { throw new CircuitLibraryError('Impossible de sauvegarder le brouillon localement.', error); }
    return circuit.id;
  }

  loadDraft(id) {
    const draft = this.listDrafts().find((record) => record.id === id);
    if (!draft) throw new CircuitLibraryError(`Brouillon absent : ${id}.`);
    return draft;
  }

  removeDraft(id) {
    const next = this.listDrafts().filter((record) => record.id !== id);
    try { this.storage.setItem(CIRCUIT_DRAFTS_KEY, JSON.stringify(next)); }
    catch (error) { throw new CircuitLibraryError('Impossible de mettre a jour les brouillons.', error); }
  }

  duplicateDraft(id, options = {}) {
    const source = this.loadDraft(id);
    const duplicate = { ...source, id: options.id ?? `${id}-draft-copy-${Date.now().toString(36)}`, name: options.name ?? `${source.name} copy` };
    delete duplicate.savedAsDraft; delete duplicate.modifiedAt;
    this.saveDraft(duplicate);
    return this.loadDraft(duplicate.id);
  }

  save(circuit) {
    const report = validateCircuitFormat(circuit);
    if (!report.valid) throw new CircuitLibraryError(`Circuit invalide : ${report.errors[0]}`);
    const records = this.list();
    const saved = { ...structuredClone(circuit), modifiedAt: new Date().toISOString() };
    const next = [...records.filter((record) => record.id !== circuit.id), saved];
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

  duplicate(id, { id: duplicateId = `${id}-copy-${Date.now().toString(36)}`, name = null } = {}) {
    const source = this.load(id);
    if (this.list().some((circuit) => circuit.id === duplicateId)) throw new CircuitLibraryError(`L’identifiant « ${duplicateId} » existe déjà.`);
    const duplicate = { ...source, id: duplicateId, name: name ?? `${source.name} · copie`, modifiedAt: new Date().toISOString() };
    this.save(duplicate);
    return structuredClone(duplicate);
  }

  importText(text) {
    const { circuit } = parseCircuitJSON(text);
    this.save(circuit);
    return circuit;
  }

  exportText(id) { return JSON.stringify(this.load(id), null, 2); }
}
