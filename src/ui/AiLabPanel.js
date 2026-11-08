import { NeuralNetwork } from '../ai/neural/NeuralNetwork.js';
import { NeuralController } from '../ai/NeuralController.js';
import { SteeringController } from '../ai/SteeringController.js';
import { trainingHistoryToCsv } from '../ai/training/TrainingCsv.js';

export class AiLabPanel {
  constructor(dynamics) {
    this.dynamics = dynamics;
    this.disposed = false;
    this.listeners = new AbortController();
    document.querySelector('.phase8-comparison .training-title').textContent = 'ÉTUDE PHASE 8 · A / B / C';
    this.worker = null;
    this.comparisonWorker = null;
    this.bestNetwork = null;
    this.bestNetworkScore = -Infinity;
    this.history = [];
    this.completedRuns = [];
    this.canvas = document.querySelector('#reward-chart');
    this.context = this.canvas.getContext('2d');
    this.generationText = document.querySelector('#training-generation');
    this.bestText = document.querySelector('#training-best');
    this.meanText = document.querySelector('#training-mean');
    this.lapsText = document.querySelector('#training-laps');
    this.status = document.querySelector('#training-status');
    this.circuitProgress = document.querySelector('#training-circuit-progress');
    this.modeSelect = document.querySelector('#training-mode');
    this.trackOptions = document.querySelector('#training-track-options');
    this.runSummary = document.querySelector('#training-runs');
    this.comparisonResults = document.querySelector('#comparison-results');
    this.startButton = document.querySelector('#training-start');
    this.stopButton = document.querySelector('#training-stop');
    this.testButton = document.querySelector('#test-best');
    this.exportButton = document.querySelector('#export-best');
    this.csvButton = document.querySelector('#export-training-csv');
    this.compareButton = document.querySelector('#comparison-start');
    this.phase8Status = document.querySelector('#phase8-comparison-status');
    this.phase8Chart = document.querySelector('#phase8-config-chart');
    this.phase8Context = this.phase8Chart?.getContext('2d');
    this.phase8CircuitResults = document.querySelector('#phase8-circuit-results');
    this.phase8BudgetResults = document.querySelector('#phase8-budget-results');
    this.phase8Data = null;
    this.importInput = document.querySelector('#import-model');
    this.pilotSelect = document.querySelector('#pilot-select');
    const options = { signal: this.listeners.signal };
    this.startButton.addEventListener('click', () => this.startTraining(), options);
    this.modeSelect.addEventListener('change', () => this.updateTrainingMode(), options);
    document.querySelector('#training-3-seeds').addEventListener('click', () => this.startTraining({ runCount: 3 }), options);
    this.stopButton.addEventListener('click', () => this.stopTraining(), options);
    this.testButton.addEventListener('click', () => this.testBest(), options);
    this.exportButton.addEventListener('click', () => this.exportBest(), options);
    this.csvButton.addEventListener('click', () => this.exportCsv(), options);
    this.compareButton.addEventListener('click', () => this.compareBest(), options);
    document.querySelector('#phase8-test-a').addEventListener('click', () => this.loadPhase8Model('A'), options);
    document.querySelector('#phase8-test-b').addEventListener('click', () => this.loadPhase8Model('B'), options);
    document.querySelector('#phase8-test-c').addEventListener('click', () => this.loadPhase8Model('C'), options);
    document.querySelector('#import-model-button').addEventListener('click', () => this.importInput.click(), options);
    this.importInput.addEventListener('change', (event) => this.importModel(event), options);
    this.pilotSelect.addEventListener('change', () => this.selectPilot(), options);
    this.stopButton.disabled = true;
    this.testButton.disabled = true;
    this.exportButton.disabled = true;
    this.csvButton.disabled = true;
    this.compareButton.disabled = true;
    this.updateTrainingMode();
    this.drawChart();
    this.loadPhase8Comparison();
  }

  updateTrainingMode() {
    const multi = this.modeSelect.value === 'multi';
    this.trackOptions.classList.toggle('hidden', !multi);
    document.querySelector('#chart-mean-label').textContent = multi ? 'Fitness moyenne' : 'Moyenne population';
    document.querySelector('#chart-worst-label').textContent = multi ? 'Pire circuit' : 'Meilleure generation';
    this.circuitProgress.textContent = multi ? 'Progression par circuit apparaitra a la premiere generation.' : '';
    this.drawChart();
  }

  startTraining({ runCount = 1 } = {}) {
    if (this.worker) return;
    const generations = Number(document.querySelector('#training-generations').value);
    const populationSize = Number(document.querySelector('#training-population').value);
    const seed = Number(document.querySelector('#training-seed').value);
    const mode = this.modeSelect.value;
    const trackIds = [...this.trackOptions.querySelectorAll('input:checked')].map((input) => input.value);
    if (!Number.isInteger(generations) || generations < 1 || generations > 2500
      || !Number.isInteger(populationSize) || populationSize < 2 || populationSize > 128 || !Number.isInteger(seed)) {
      this.status.textContent = 'Invalid parameters (population >= 2; seed must be integer).';
      return;
    }
    if (mode === 'multi' && trackIds.length < 2) {
      this.status.textContent = 'Multi-Track exige au moins deux circuits selectionnes.';
      return;
    }
    this.history = [];
    this.completedRuns = [];
    this.runCount = runCount;
    this.bestNetworkScore = -Infinity;
    this.generationText.textContent = `0 / ${generations}${runCount > 1 ? ' · 3 seeds' : ''}`;
    this.bestText.textContent = '—';
    this.meanText.textContent = '—';
    this.lapsText.textContent = '0';
    this.runSummary.textContent = '';
    this.status.textContent = 'Preparing physical evaluation worker…';
    this.startButton.disabled = true;
    document.querySelector('#training-3-seeds').disabled = true;
    this.modeSelect.disabled = true;
    this.trackOptions.querySelectorAll('input').forEach((input) => { input.disabled = true; });
    this.stopButton.disabled = false;
    this.worker = new Worker(new URL('../ai/training/trainingWorker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = ({ data }) => {
      if (this.disposed) {
        if (data.type === 'complete' || data.type === 'error') this.finishWorker();
        return;
      }
      this.onWorkerMessage(data, generations);
    };
    this.worker.onerror = (event) => {
      if (this.disposed) { this.finishWorker(); return; }
      this.status.textContent = `Worker error: ${event.message}`;
      this.finishWorker();
    };
    const seeds = Array.from({ length: runCount }, (_, index) => seed + index);
    this.worker.postMessage({ type: 'start', config: { generations, populationSize, seed, seeds, mode, trackIds } });
  }

  stopTraining() {
    if (!this.worker) return;
    this.worker.postMessage({ type: 'stop' });
    this.status.textContent = 'Stop requested; current episode will finish first…';
    this.stopButton.disabled = true;
  }

  onWorkerMessage(data, totalGenerations) {
    if (data.type === 'generation') {
      const result = { ...data.generation, seed: data.seed };
      this.history.push(result);
      this.generationText.textContent = `${data.runIndex + 1}/${this.runCount} · ${result.generation}/${totalGenerations}`;
      this.bestText.textContent = result.bestReward.toFixed(2);
      this.meanText.textContent = result.meanReward.toFixed(2);
      this.lapsText.textContent = String(result.successfulLaps);
      this.status.textContent = `${this.modeSelect.value === 'multi' ? 'Multi-Track' : 'Single Track'} seed ${data.seed}: ${result.evaluations} candidats, ${result.physicalEpisodeEvaluations ?? result.evaluations} episodes physiques.`;
      if (result.meanCircuitMetrics) {
        this.circuitProgress.textContent = result.meanCircuitMetrics.map((circuit) =>
          `${circuit.trackId}: ${Math.round(circuit.meanSuccessRate * 100)}% tours, performance ${circuit.meanPerformance.toFixed(1)}, progression ${circuit.meanProgressRatio.toFixed(2)} circuit, sorties ${circuit.meanOffTrackEventsPerCircuit.toFixed(2)}`,
        ).join('\n');
      }
      if (result.globalBestReward >= this.bestNetworkScore) {
        this.bestNetworkScore = result.globalBestReward;
        this.bestNetwork = NeuralNetwork.fromJSON(result.bestNetwork);
      }
      this.testButton.disabled = false;
      this.exportButton.disabled = false;
      this.csvButton.disabled = false;
      this.compareButton.disabled = false;
      this.drawChart();
    } else if (data.type === 'run-complete') {
      this.completedRuns.push(data.run);
      if (data.run.bestNetwork && data.run.bestReward > this.bestNetworkScore) {
        this.bestNetworkScore = data.run.bestReward;
        this.bestNetwork = NeuralNetwork.fromJSON(data.run.bestNetwork);
      }
      this.drawRunVariability();
    } else if (data.type === 'complete') {
      const runs = this.completedRuns;
      const evaluations = runs.reduce((sum, run) => sum + (run.physicalEpisodeEvaluations ?? run.evaluations), 0);
      this.status.textContent = runs.some((run) => run.stopped)
        ? `Stopped: ${evaluations} physical evaluations completed.`
        : `Finished: ${evaluations} physical evaluations completed.`;
      this.finishWorker();
    } else if (data.type === 'error') {
      this.status.textContent = `Training error: ${data.message}`;
      this.finishWorker();
    }
  }

  finishWorker() {
    this.worker?.terminate();
    this.worker = null;
    if (this.disposed) return;
    this.startButton.disabled = false;
    document.querySelector('#training-3-seeds').disabled = false;
    this.modeSelect.disabled = false;
    this.trackOptions.querySelectorAll('input').forEach((input) => { input.disabled = false; });
    this.stopButton.disabled = true;
  }

  async loadPhase8Comparison() {
    try {
      const response = await fetch('/phase8-comparison.json', { signal: this.listeners.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const phase8Data = await response.json();
      if (this.disposed) return;
      this.phase8Data = phase8Data;
      this.phase8Status.textContent = `Validation indépendante · seed ${this.phase8Data.validationSeed} · ${this.phase8Data.scenariosPerSeedPerCircuit} scénarios par réseau/circuit.`;
      this.phase8CircuitResults.replaceChildren(...this.phase8Data.validationCircuits.map((circuit) => {
        const row = document.createElement('div');
        const a = `${(circuit.A.completionRate * 100).toFixed(1)}% (${circuit.A.completed}/${circuit.A.total})`;
        const b = `${(circuit.B.completionRate * 100).toFixed(1)}% (${circuit.B.completed}/${circuit.B.total})`;
        const c = `${(circuit.C.completionRate * 100).toFixed(1)}% (${circuit.C.completed}/${circuit.C.total})`;
        row.textContent = `${circuit.circuit}: A ${a} · B ${b} · C ${c} · Steering ${(circuit.steeringCompletion * 100).toFixed(0)}%`;
        return row;
      }));
      const budget = ['A', 'B', 'C'].map((configuration) => {
        const data = this.phase8Data.configurations[configuration];
        const time = Number.isFinite(data.trainingSeconds) ? ` · ${(data.trainingSeconds / 60).toFixed(1)} min` : '';
        return `${configuration}: ${data.generations} gen · ${data.populationSize} ind. · ${data.physicalEpisodes} ép. ${time} · seed ${data.bestSeed} (${data.bestFitness.toFixed(2)})`;
      });
      this.phase8BudgetResults.textContent = budget.join(' | ');
      document.querySelector('#phase8-test-a').disabled = false;
      document.querySelector('#phase8-test-b').disabled = false;
      document.querySelector('#phase8-test-c').disabled = false;
      this.drawPhase8Chart();
    } catch {
      if (this.disposed) return;
      this.phase8Status.textContent = 'Comparaison enregistrée indisponible. Exécuter npm run export:phase8-ai-lab.';
    }
  }

  drawPhase8Chart() {
    if (!this.phase8Data || !this.phase8Context) return;
    const ctx = this.phase8Context;
    const { width, height } = this.phase8Chart;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#101b21';
    ctx.fillRect(0, 0, width, height);
    const colors = { A: ['#5597aa', '#52a9bd'], B: ['#419b80', '#67e8c1'], C: ['#bb8e50', '#e6bd75'] };
    const series = ['A', 'B', 'C'].flatMap((configuration) => [
      { configuration, key: 'meanPopulationFitness', color: colors[configuration][0], dashed: true },
      { configuration, key: 'meanBestSoFarFitness', color: colors[configuration][1], dashed: false },
    ]);
    const values = series.flatMap(({ configuration, key }) => this.phase8Data.configurations[configuration].fitnessCurve.map((point) => point[key]));
    let min = Math.min(...values), max = Math.max(...values);
    if (max - min < 1e-6) { min -= 1; max += 1; }
    for (const { configuration, key, color, dashed } of series) {
      const curve = this.phase8Data.configurations[configuration].fitnessCurve;
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = dashed ? 1 : 1.5;
      ctx.setLineDash(dashed ? [3, 2] : []);
      curve.forEach((entry, index) => {
        const x = 4 + index / Math.max(1, curve.length - 1) * (width - 8);
        const y = height - 4 - (entry[key] - min) / (max - min) * (height - 8);
        index ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  async loadPhase8Model(configuration) {
    try {
      const response = await fetch(`/phase8-model-${configuration.toLowerCase()}.json`, { signal: this.listeners.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const model = await response.json();
      this.bestNetwork = NeuralNetwork.fromJSON(model.network);
      this.bestNetworkScore = model.fitness;
      this.testButton.disabled = false;
      this.exportButton.disabled = false;
      this.compareButton.disabled = false;
      this.pilotSelect.value = 'neural';
      this.selectPilot();
      this.status.textContent = `Configuration ${model.configuration}, seed ${model.seed}, fitness ${model.fitness.toFixed(2)} chargée et testée.`;
    } catch (error) {
      if (this.disposed) return;
      this.phase8Status.textContent = `Chargement du meilleur modèle ${configuration} impossible: ${error.message}`;
    }
  }

  drawRunVariability() {
    if (this.completedRuns.length < 2) return;
    const values = this.completedRuns.map((run) => run.bestReward);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const sd = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
    this.runSummary.textContent = `Seeds ${this.completedRuns.map((run) => run.seed).join(', ')} · best reward mean ${mean.toFixed(2)} ± ${sd.toFixed(2)} SD (n=${values.length})`;
  }

  exportCsv() {
    if (!this.history.length) return;
    const seeds = [...new Set(this.history.map((entry) => entry.seed))];
    const runs = seeds.map((seed) => ({ seed, history: this.history.filter((entry) => entry.seed === seed) }));
    const blob = new Blob([trainingHistoryToCsv(runs)], { type: 'text/csv;charset=utf-8' });
    this.download(blob, 'neurodriveai-generation-statistics.csv');
  }

  exportBest() {
    if (!this.bestNetwork) return;
    const blob = new Blob([this.bestNetwork.exportJSON()], { type: 'application/json' });
    this.download(blob, 'neurodriveai-best-network.json');
  }

  download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  compareBest() {
    if (!this.bestNetwork || this.comparisonWorker) return;
    this.compareButton.disabled = true;
    this.comparisonResults.textContent = 'Running paired episodes on three matched seeds…';
    this.comparisonWorker = new Worker(new URL('../ai/training/trainingWorker.js', import.meta.url), { type: 'module' });
    const seed = Number(document.querySelector('#training-seed').value);
    this.comparisonWorker.onmessage = ({ data }) => {
      if (this.disposed) return;
      if (data.type === 'comparison-complete') this.renderComparison(data.results);
      else if (data.type === 'error') this.comparisonResults.textContent = `Comparison error: ${data.message}`;
      this.comparisonWorker.terminate();
      this.comparisonWorker = null;
      this.compareButton.disabled = false;
    };
    this.comparisonWorker.onerror = (event) => {
      if (this.disposed) { this.comparisonWorker?.terminate(); this.comparisonWorker = null; return; }
      this.comparisonResults.textContent = `Comparison worker error: ${event.message}`;
      this.comparisonWorker?.terminate();
      this.comparisonWorker = null;
      this.compareButton.disabled = false;
    };
    this.comparisonWorker.postMessage({ type: 'compare', network: this.bestNetwork.toJSON(), seeds: [seed, seed + 1, seed + 2] });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.listeners.abort();
    if (this.worker) this.worker.postMessage({ type: 'stop' });
    this.comparisonWorker?.terminate();
    this.comparisonWorker = null;
  }

  renderComparison(rows) {
    const summaries = ['steering', 'neural'].map((key) => {
      const mean = (read) => rows.reduce((sum, row) => sum + read(row[key]), 0) / rows.length;
      const reward = mean((entry) => entry.reward);
      const progress = mean((entry) => entry.telemetry.signedProgress);
      const laps = rows.reduce((sum, row) => sum + row[key].telemetry.completedLaps, 0);
      const offTrack = mean((entry) => entry.telemetry.offTrackDuration);
      return `${key}: reward ${reward.toFixed(2)}, signed progress ${progress.toFixed(1)} m, laps ${laps}/${rows.length}, off-track ${offTrack.toFixed(1)} s/episode`;
    });
    this.comparisonResults.textContent = `Matched initial states: ${rows.every((row) => row.conditionsMatched) ? 'yes' : 'NO'}\nSeeds: ${rows.map((row) => row.seed).join(', ')}\n${summaries.join('\n')}`;
  }

  selectPilot() {
    if (this.pilotSelect.value === 'neural') {
      if (!this.bestNetwork) {
        this.status.textContent = 'Train or import a network before selecting Neural.';
        this.pilotSelect.value = 'steering';
        return;
      }
      this.dynamics.controller = new NeuralController({ network: this.bestNetwork.copy() });
    } else this.dynamics.controller = new SteeringController();
    this.dynamics.reset();
  }

  testBest() {
    if (!this.bestNetwork) return;
    this.pilotSelect.value = 'neural';
    this.selectPilot();
    this.status.textContent = 'Best evaluated neural pilot loaded in the live simulation.';
  }

  async importModel(event) {
    const [file] = event.target.files ?? [];
    if (!file) return;
    try {
      this.bestNetwork = NeuralNetwork.fromJSON(await file.text());
      this.bestNetworkScore = -Infinity;
      this.testButton.disabled = false;
      this.exportButton.disabled = false;
      this.compareButton.disabled = false;
      this.status.textContent = 'Imported model architecture and values validated.';
    } catch (error) {
      this.status.textContent = `Import rejected: ${error.message}`;
    } finally { event.target.value = ''; }
  }

  drawChart() {
    const { width, height } = this.canvas;
    const ctx = this.context;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#101b21';
    ctx.fillRect(0, 0, width, height);
    if (!this.history.length) return;
    const grouped = new Map();
    for (const entry of this.history) {
      if (!grouped.has(entry.generation)) grouped.set(entry.generation, []);
      grouped.get(entry.generation).push(entry);
    }
    const multi = this.modeSelect.value === 'multi';
    const meanKey = multi ? 'meanCircuitPerformance' : 'meanReward';
    const worstKey = multi ? 'meanWorstCircuitPerformance' : 'bestReward';
    const chartHistory = [...grouped.entries()].sort((a, b) => a[0] - b[0]).map(([generation, entries]) => ({
      generation,
      mean: entries.reduce((sum, entry) => sum + (entry[meanKey] ?? 0), 0) / entries.length,
      worst: entries.reduce((sum, entry) => sum + (entry[worstKey] ?? 0), 0) / entries.length,
    }));
    const values = chartHistory.flatMap((entry) => [entry.mean, entry.worst]);
    let min = Math.min(...values), max = Math.max(...values);
    if (max - min < 1e-6) { max += 1; min -= 1; }
    const point = (value, index) => ({ x: 4 + index / Math.max(1, chartHistory.length - 1) * (width - 8), y: height - 5 - (value - min) / (max - min) * (height - 10) });
    for (const [key, color] of [['mean', '#52a9bd'], ['worst', '#67e8c1']]) {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = key === 'bestReward' ? 2 : 1;
      chartHistory.forEach((entry, index) => { const p = point(entry[key], index); index ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
      ctx.stroke();
    }
  }
}
