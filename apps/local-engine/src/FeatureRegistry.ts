export type LocalEngineCapabilities = {
  mediaEditing: boolean;
  localIngest: boolean;
  cloudSync: boolean;
  safeOffload: boolean;
  aiLogging: boolean;
  visionLab: boolean;
  mlTraining: boolean;
  marineBiologyWorkflow: boolean;
};

function envFlag(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw == null || raw.trim() === '') return defaultValue;

  return ['1', 'true', 'yes', 'on', 'enabled'].includes(raw.toLowerCase());
}

export const LOCAL_ENGINE_CAPABILITIES: LocalEngineCapabilities = {
  mediaEditing: true,
  localIngest: true,
  cloudSync: true,
  safeOffload: true,
  aiLogging: envFlag('GEMINI_API_KEY', false),
  visionLab: envFlag('QUIPSLY_ENABLE_VISION_LAB', true),
  mlTraining: envFlag('QUIPSLY_ENABLE_ML_TRAINING', false),
  marineBiologyWorkflow: envFlag('QUIPSLY_ENABLE_MARINE_BIOLOGY', true),
};
