import { mutationRef, executeMutation, validateArgs } from 'firebase/data-connect';

export const connectorConfig = {
  connector: 'default',
  service: 'quiplore',
  location: 'us-central1'
};
export const insertQuoteWithVectorRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'InsertQuoteWithVector', inputVars);
}
insertQuoteWithVectorRef.operationName = 'InsertQuoteWithVector';

export function insertQuoteWithVector(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(insertQuoteWithVectorRef(dcInstance, inputVars));
}

export const insertStoryTrailRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'InsertStoryTrail', inputVars);
}
insertStoryTrailRef.operationName = 'InsertStoryTrail';

export function insertStoryTrail(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(insertStoryTrailRef(dcInstance, inputVars));
}

export const insertStoryBeatRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'InsertStoryBeat', inputVars);
}
insertStoryBeatRef.operationName = 'InsertStoryBeat';

export function insertStoryBeat(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(insertStoryBeatRef(dcInstance, inputVars));
}
