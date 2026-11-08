export const RESEARCH_REPORT_FORMAT = 'neurodrive-neural-racing-report';
export const RESEARCH_REPORT_VERSION = 1;

export function buildResearchReport({ results = [], trainingRuns = [], models = [], replayMetadata = null, failureZones = [] } = {}) {
  const arcadeRecords = results.map((record) => ({
    track: { id: record.trackId, label: record.trackLabel, category: record.trackCategory },
    heat: record.heat,
    protocol: record.protocol,
    measurements: record.result.results,
    provenance: record.provenance,
    observedFailureZones: record.failureAnalysis ?? [],
  }));
  return {
    format: RESEARCH_REPORT_FORMAT,
    version: RESEARCH_REPORT_VERSION,
    scope: 'arcade-experiments-only',
    generatedAt: new Date().toISOString(),
    historicalResults: { included: false, note: 'Phase 4-8 historical results are preserved separately and are not recomputed or merged into arcade measurements.' },
    arcade: {
      records: arcadeRecords,
      models: structuredClone(models),
      trainingRuns: structuredClone(trainingRuns),
      replay: replayMetadata ? structuredClone(replayMetadata) : null,
      failureZones: structuredClone(failureZones),
      metrics: {
        success: 'car finished the configured lap count before the heat ended',
        collision: 'per-driver car-collision counter from RaceWorld',
        offTrack: 'per-driver off-track entry counter and fixed-step accumulated off-track time',
        progress: 'signed projected path progress reported by RaceWorld',
        gameFitness: 'arcade-only score: completedLaps * 1000 + progress * 100 + 1000 / bestLapTime when a best lap exists',
      },
      limitations: [
        'GameVehicleDynamics results are not historical scientific validation results.',
        'Recorded collision/off-track zones identify a nearest projected path segment; they do not establish causality.',
        'A replay records sampled poses, not a bit-exact re-simulation guarantee.',
        'The sample cadence and physics settings are stored with each replay.',
      ],
    },
  };
}

export function validateResearchReport(report) {
  if (report?.format !== RESEARCH_REPORT_FORMAT || report.version !== RESEARCH_REPORT_VERSION) return { valid: false, reason: 'Unsupported report format/version.' };
  if (report.scope !== 'arcade-experiments-only' || report.historicalResults?.included !== false) return { valid: false, reason: 'Historical and arcade result spaces must stay separate.' };
  if (!Array.isArray(report.arcade?.records) || !Array.isArray(report.arcade?.trainingRuns) || !Array.isArray(report.arcade?.limitations)) return { valid: false, reason: 'Report is missing experiment records or limitations.' };
  return { valid: true, records: report.arcade.records.length, trainingRuns: report.arcade.trainingRuns.length };
}

export function researchReportToCsv(report) {
  const validation = validateResearchReport(report);
  if (!validation.valid) throw new TypeError(validation.reason);
  const header = ['recordType', 'space', 'trackId', 'trackCategory', 'heat', 'driver', 'seed', 'generation', 'meanFitness', 'bestFitness', 'success', 'laps', 'bestLapTime', 'collisions', 'offTrackEvents', 'offTrackTime', 'progress', 'architecture', 'provenance', 'protocol', 'limitations'];
  const rows = [header];
  const add = (values) => rows.push(header.map((key) => values[key] ?? ''));
  for (const record of report.arcade.records) for (const measurement of record.measurements) {
    const model = report.arcade.models.find((item) => item.name === measurement.driver);
    add({ recordType: 'race-heat', space: 'game-arcade', trackId: record.track.id, trackCategory: record.track.category, heat: record.heat, driver: measurement.driver, seed: measurement.seed ?? record.protocol.heats?.[0]?.seed, success: measurement.success, laps: measurement.completedLaps, bestLapTime: measurement.bestLapTime, collisions: measurement.collisions, offTrackEvents: measurement.offTrackEvents, offTrackTime: measurement.offTrackTime, progress: measurement.progress, architecture: model?.architecture?.join('-'), provenance: record.provenance.find((item) => item.driver === measurement.driver)?.source, protocol: JSON.stringify(record.protocol), limitations: report.arcade.limitations.join('; ') });
  }
  for (const run of report.arcade.trainingRuns) for (const generation of run.history ?? []) {
    add({ recordType: 'training-generation', space: 'game-arcade', trackId: run.config?.trackId, seed: run.config?.seed, generation: generation.generation, meanFitness: generation.meanFitness, bestFitness: generation.bestFitness ?? generation.globalBestFitness, architecture: run.config?.networkConfig ? [run.config.networkConfig.sensorAngles.length + 1, ...run.config.networkConfig.hiddenLayers, 2].join('-') : '', provenance: 'Neural Racing Lab experimental training', protocol: JSON.stringify(run.config), limitations: report.arcade.limitations.join('; ') });
  }
  return rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
}
