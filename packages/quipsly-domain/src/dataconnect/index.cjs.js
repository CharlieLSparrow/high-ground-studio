const { mutationRef, executeMutation, validateArgs } = require('firebase/data-connect');

const connectorConfig = {
  connector: 'default',
  service: 'quiplore',
  location: 'us-central1'
};
exports.connectorConfig = connectorConfig;

const insertQuoteWithVectorRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'InsertQuoteWithVector', inputVars);
}
insertQuoteWithVectorRef.operationName = 'InsertQuoteWithVector';
exports.insertQuoteWithVectorRef = insertQuoteWithVectorRef;

exports.insertQuoteWithVector = function insertQuoteWithVector(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(insertQuoteWithVectorRef(dcInstance, inputVars));
}
;

const insertStoryTrailRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'InsertStoryTrail', inputVars);
}
insertStoryTrailRef.operationName = 'InsertStoryTrail';
exports.insertStoryTrailRef = insertStoryTrailRef;

exports.insertStoryTrail = function insertStoryTrail(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(insertStoryTrailRef(dcInstance, inputVars));
}
;

const insertStoryBeatRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'InsertStoryBeat', inputVars);
}
insertStoryBeatRef.operationName = 'InsertStoryBeat';
exports.insertStoryBeatRef = insertStoryBeatRef;

exports.insertStoryBeat = function insertStoryBeat(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(insertStoryBeatRef(dcInstance, inputVars));
}
;
