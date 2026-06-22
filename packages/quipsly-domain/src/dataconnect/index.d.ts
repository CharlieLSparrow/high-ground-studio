import { ConnectorConfig, DataConnect, MutationRef, MutationPromise } from 'firebase/data-connect';

export const connectorConfig: ConnectorConfig;

export type TimestampString = string;
export type UUIDString = string;
export type Int64String = string;
export type DateString = string;




export interface InsertQuoteWithVectorData {
  quote_insert: Quote_Key;
}

export interface InsertQuoteWithVectorVariables {
  slug: string;
  text: string;
  personId: string;
  sourceWorkId: string;
  verificationStatus: string;
  confidence: number;
  contextNote: string;
}

export interface InsertStoryBeatData {
  storyBeat_insert: StoryBeat_Key;
}

export interface InsertStoryBeatVariables {
  storyTrailId: string;
  orderIndex: number;
  title: string;
  body: string;
}

export interface InsertStoryTrailData {
  storyTrail_insert: StoryTrail_Key;
}

export interface InsertStoryTrailVariables {
  quoteId: string;
  slug: string;
  title: string;
  deck: string;
}

export interface QuoteVariant_Key {
  id: string;
  __typename?: 'QuoteVariant_Key';
}

export interface Quote_Key {
  id: string;
  __typename?: 'Quote_Key';
}

export interface StoryBeat_Key {
  id: string;
  __typename?: 'StoryBeat_Key';
}

export interface StoryTrail_Key {
  id: string;
  __typename?: 'StoryTrail_Key';
}

interface InsertQuoteWithVectorRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: InsertQuoteWithVectorVariables): MutationRef<InsertQuoteWithVectorData, InsertQuoteWithVectorVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: InsertQuoteWithVectorVariables): MutationRef<InsertQuoteWithVectorData, InsertQuoteWithVectorVariables>;
  operationName: string;
}
export const insertQuoteWithVectorRef: InsertQuoteWithVectorRef;

export function insertQuoteWithVector(vars: InsertQuoteWithVectorVariables): MutationPromise<InsertQuoteWithVectorData, InsertQuoteWithVectorVariables>;
export function insertQuoteWithVector(dc: DataConnect, vars: InsertQuoteWithVectorVariables): MutationPromise<InsertQuoteWithVectorData, InsertQuoteWithVectorVariables>;

interface InsertStoryTrailRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: InsertStoryTrailVariables): MutationRef<InsertStoryTrailData, InsertStoryTrailVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: InsertStoryTrailVariables): MutationRef<InsertStoryTrailData, InsertStoryTrailVariables>;
  operationName: string;
}
export const insertStoryTrailRef: InsertStoryTrailRef;

export function insertStoryTrail(vars: InsertStoryTrailVariables): MutationPromise<InsertStoryTrailData, InsertStoryTrailVariables>;
export function insertStoryTrail(dc: DataConnect, vars: InsertStoryTrailVariables): MutationPromise<InsertStoryTrailData, InsertStoryTrailVariables>;

interface InsertStoryBeatRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: InsertStoryBeatVariables): MutationRef<InsertStoryBeatData, InsertStoryBeatVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: InsertStoryBeatVariables): MutationRef<InsertStoryBeatData, InsertStoryBeatVariables>;
  operationName: string;
}
export const insertStoryBeatRef: InsertStoryBeatRef;

export function insertStoryBeat(vars: InsertStoryBeatVariables): MutationPromise<InsertStoryBeatData, InsertStoryBeatVariables>;
export function insertStoryBeat(dc: DataConnect, vars: InsertStoryBeatVariables): MutationPromise<InsertStoryBeatData, InsertStoryBeatVariables>;
