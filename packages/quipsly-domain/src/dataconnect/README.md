# Generated TypeScript README
This README will guide you through the process of using the generated JavaScript SDK package for the connector `default`. It will also provide examples on how to use your generated SDK to call your Data Connect queries and mutations.

***NOTE:** This README is generated alongside the generated SDK. If you make changes to this file, they will be overwritten when the SDK is regenerated.*

# Table of Contents
- [**Overview**](#generated-javascript-readme)
- [**Accessing the connector**](#accessing-the-connector)
  - [*Connecting to the local Emulator*](#connecting-to-the-local-emulator)
- [**Queries**](#queries)
- [**Mutations**](#mutations)
  - [*InsertQuoteWithVector*](#insertquotewithvector)
  - [*InsertStoryTrail*](#insertstorytrail)
  - [*InsertStoryBeat*](#insertstorybeat)

# Accessing the connector
A connector is a collection of Queries and Mutations. One SDK is generated for each connector - this SDK is generated for the connector `default`. You can find more information about connectors in the [Data Connect documentation](https://firebase.google.com/docs/data-connect#how-does).

You can use this generated SDK by importing from the package `@high-ground/quipsly-dataconnect` as shown below. Both CommonJS and ESM imports are supported.

You can also follow the instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#set-client).

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@high-ground/quipsly-dataconnect';

const dataConnect = getDataConnect(connectorConfig);
```

## Connecting to the local Emulator
By default, the connector will connect to the production service.

To connect to the emulator, you can use the following code.
You can also follow the emulator instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#instrument-clients).

```typescript
import { connectDataConnectEmulator, getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@high-ground/quipsly-dataconnect';

const dataConnect = getDataConnect(connectorConfig);
connectDataConnectEmulator(dataConnect, 'localhost', 9399);
```

After it's initialized, you can call your Data Connect [queries](#queries) and [mutations](#mutations) from your generated SDK.

# Queries

No queries were generated for the `default` connector.

If you want to learn more about how to use queries in Data Connect, you can follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-queries).

# Mutations

There are two ways to execute a Data Connect Mutation using the generated Web SDK:
- Using a Mutation Reference function, which returns a `MutationRef`
  - The `MutationRef` can be used as an argument to `executeMutation()`, which will execute the Mutation and return a `MutationPromise`
- Using an action shortcut function, which returns a `MutationPromise`
  - Calling the action shortcut function will execute the Mutation and return a `MutationPromise`

The following is true for both the action shortcut function and the `MutationRef` function:
- The `MutationPromise` returned will resolve to the result of the Mutation once it has finished executing
- If the Mutation accepts arguments, both the action shortcut function and the `MutationRef` function accept a single argument: an object that contains all the required variables (and the optional variables) for the Mutation
- Both functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.

Below are examples of how to use the `default` connector's generated functions to execute each mutation. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-mutations).

## InsertQuoteWithVector
You can execute the `InsertQuoteWithVector` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect/index.d.ts](./index.d.ts):
```typescript
insertQuoteWithVector(vars: InsertQuoteWithVectorVariables): MutationPromise<InsertQuoteWithVectorData, InsertQuoteWithVectorVariables>;

interface InsertQuoteWithVectorRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: InsertQuoteWithVectorVariables): MutationRef<InsertQuoteWithVectorData, InsertQuoteWithVectorVariables>;
}
export const insertQuoteWithVectorRef: InsertQuoteWithVectorRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
insertQuoteWithVector(dc: DataConnect, vars: InsertQuoteWithVectorVariables): MutationPromise<InsertQuoteWithVectorData, InsertQuoteWithVectorVariables>;

interface InsertQuoteWithVectorRef {
  ...
  (dc: DataConnect, vars: InsertQuoteWithVectorVariables): MutationRef<InsertQuoteWithVectorData, InsertQuoteWithVectorVariables>;
}
export const insertQuoteWithVectorRef: InsertQuoteWithVectorRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the insertQuoteWithVectorRef:
```typescript
const name = insertQuoteWithVectorRef.operationName;
console.log(name);
```

### Variables
The `InsertQuoteWithVector` mutation requires an argument of type `InsertQuoteWithVectorVariables`, which is defined in [dataconnect/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface InsertQuoteWithVectorVariables {
  slug: string;
  text: string;
  personId: string;
  sourceWorkId: string;
  verificationStatus: string;
  confidence: number;
  contextNote: string;
}
```
### Return Type
Recall that executing the `InsertQuoteWithVector` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `InsertQuoteWithVectorData`, which is defined in [dataconnect/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface InsertQuoteWithVectorData {
  quote_insert: Quote_Key;
}
```
### Using `InsertQuoteWithVector`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, insertQuoteWithVector, InsertQuoteWithVectorVariables } from '@high-ground/quipsly-dataconnect';

// The `InsertQuoteWithVector` mutation requires an argument of type `InsertQuoteWithVectorVariables`:
const insertQuoteWithVectorVars: InsertQuoteWithVectorVariables = {
  slug: ...,
  text: ...,
  personId: ...,
  sourceWorkId: ...,
  verificationStatus: ...,
  confidence: ...,
  contextNote: ...,
};

// Call the `insertQuoteWithVector()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await insertQuoteWithVector(insertQuoteWithVectorVars);
// Variables can be defined inline as well.
const { data } = await insertQuoteWithVector({ slug: ..., text: ..., personId: ..., sourceWorkId: ..., verificationStatus: ..., confidence: ..., contextNote: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await insertQuoteWithVector(dataConnect, insertQuoteWithVectorVars);

console.log(data.quote_insert);

// Or, you can use the `Promise` API.
insertQuoteWithVector(insertQuoteWithVectorVars).then((response) => {
  const data = response.data;
  console.log(data.quote_insert);
});
```

### Using `InsertQuoteWithVector`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, insertQuoteWithVectorRef, InsertQuoteWithVectorVariables } from '@high-ground/quipsly-dataconnect';

// The `InsertQuoteWithVector` mutation requires an argument of type `InsertQuoteWithVectorVariables`:
const insertQuoteWithVectorVars: InsertQuoteWithVectorVariables = {
  slug: ...,
  text: ...,
  personId: ...,
  sourceWorkId: ...,
  verificationStatus: ...,
  confidence: ...,
  contextNote: ...,
};

// Call the `insertQuoteWithVectorRef()` function to get a reference to the mutation.
const ref = insertQuoteWithVectorRef(insertQuoteWithVectorVars);
// Variables can be defined inline as well.
const ref = insertQuoteWithVectorRef({ slug: ..., text: ..., personId: ..., sourceWorkId: ..., verificationStatus: ..., confidence: ..., contextNote: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = insertQuoteWithVectorRef(dataConnect, insertQuoteWithVectorVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.quote_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.quote_insert);
});
```

## InsertStoryTrail
You can execute the `InsertStoryTrail` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect/index.d.ts](./index.d.ts):
```typescript
insertStoryTrail(vars: InsertStoryTrailVariables): MutationPromise<InsertStoryTrailData, InsertStoryTrailVariables>;

interface InsertStoryTrailRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: InsertStoryTrailVariables): MutationRef<InsertStoryTrailData, InsertStoryTrailVariables>;
}
export const insertStoryTrailRef: InsertStoryTrailRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
insertStoryTrail(dc: DataConnect, vars: InsertStoryTrailVariables): MutationPromise<InsertStoryTrailData, InsertStoryTrailVariables>;

interface InsertStoryTrailRef {
  ...
  (dc: DataConnect, vars: InsertStoryTrailVariables): MutationRef<InsertStoryTrailData, InsertStoryTrailVariables>;
}
export const insertStoryTrailRef: InsertStoryTrailRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the insertStoryTrailRef:
```typescript
const name = insertStoryTrailRef.operationName;
console.log(name);
```

### Variables
The `InsertStoryTrail` mutation requires an argument of type `InsertStoryTrailVariables`, which is defined in [dataconnect/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface InsertStoryTrailVariables {
  quoteId: string;
  slug: string;
  title: string;
  deck: string;
}
```
### Return Type
Recall that executing the `InsertStoryTrail` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `InsertStoryTrailData`, which is defined in [dataconnect/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface InsertStoryTrailData {
  storyTrail_insert: StoryTrail_Key;
}
```
### Using `InsertStoryTrail`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, insertStoryTrail, InsertStoryTrailVariables } from '@high-ground/quipsly-dataconnect';

// The `InsertStoryTrail` mutation requires an argument of type `InsertStoryTrailVariables`:
const insertStoryTrailVars: InsertStoryTrailVariables = {
  quoteId: ...,
  slug: ...,
  title: ...,
  deck: ...,
};

// Call the `insertStoryTrail()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await insertStoryTrail(insertStoryTrailVars);
// Variables can be defined inline as well.
const { data } = await insertStoryTrail({ quoteId: ..., slug: ..., title: ..., deck: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await insertStoryTrail(dataConnect, insertStoryTrailVars);

console.log(data.storyTrail_insert);

// Or, you can use the `Promise` API.
insertStoryTrail(insertStoryTrailVars).then((response) => {
  const data = response.data;
  console.log(data.storyTrail_insert);
});
```

### Using `InsertStoryTrail`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, insertStoryTrailRef, InsertStoryTrailVariables } from '@high-ground/quipsly-dataconnect';

// The `InsertStoryTrail` mutation requires an argument of type `InsertStoryTrailVariables`:
const insertStoryTrailVars: InsertStoryTrailVariables = {
  quoteId: ...,
  slug: ...,
  title: ...,
  deck: ...,
};

// Call the `insertStoryTrailRef()` function to get a reference to the mutation.
const ref = insertStoryTrailRef(insertStoryTrailVars);
// Variables can be defined inline as well.
const ref = insertStoryTrailRef({ quoteId: ..., slug: ..., title: ..., deck: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = insertStoryTrailRef(dataConnect, insertStoryTrailVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.storyTrail_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.storyTrail_insert);
});
```

## InsertStoryBeat
You can execute the `InsertStoryBeat` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect/index.d.ts](./index.d.ts):
```typescript
insertStoryBeat(vars: InsertStoryBeatVariables): MutationPromise<InsertStoryBeatData, InsertStoryBeatVariables>;

interface InsertStoryBeatRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: InsertStoryBeatVariables): MutationRef<InsertStoryBeatData, InsertStoryBeatVariables>;
}
export const insertStoryBeatRef: InsertStoryBeatRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
insertStoryBeat(dc: DataConnect, vars: InsertStoryBeatVariables): MutationPromise<InsertStoryBeatData, InsertStoryBeatVariables>;

interface InsertStoryBeatRef {
  ...
  (dc: DataConnect, vars: InsertStoryBeatVariables): MutationRef<InsertStoryBeatData, InsertStoryBeatVariables>;
}
export const insertStoryBeatRef: InsertStoryBeatRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the insertStoryBeatRef:
```typescript
const name = insertStoryBeatRef.operationName;
console.log(name);
```

### Variables
The `InsertStoryBeat` mutation requires an argument of type `InsertStoryBeatVariables`, which is defined in [dataconnect/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface InsertStoryBeatVariables {
  storyTrailId: string;
  orderIndex: number;
  title: string;
  body: string;
}
```
### Return Type
Recall that executing the `InsertStoryBeat` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `InsertStoryBeatData`, which is defined in [dataconnect/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface InsertStoryBeatData {
  storyBeat_insert: StoryBeat_Key;
}
```
### Using `InsertStoryBeat`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, insertStoryBeat, InsertStoryBeatVariables } from '@high-ground/quipsly-dataconnect';

// The `InsertStoryBeat` mutation requires an argument of type `InsertStoryBeatVariables`:
const insertStoryBeatVars: InsertStoryBeatVariables = {
  storyTrailId: ...,
  orderIndex: ...,
  title: ...,
  body: ...,
};

// Call the `insertStoryBeat()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await insertStoryBeat(insertStoryBeatVars);
// Variables can be defined inline as well.
const { data } = await insertStoryBeat({ storyTrailId: ..., orderIndex: ..., title: ..., body: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await insertStoryBeat(dataConnect, insertStoryBeatVars);

console.log(data.storyBeat_insert);

// Or, you can use the `Promise` API.
insertStoryBeat(insertStoryBeatVars).then((response) => {
  const data = response.data;
  console.log(data.storyBeat_insert);
});
```

### Using `InsertStoryBeat`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, insertStoryBeatRef, InsertStoryBeatVariables } from '@high-ground/quipsly-dataconnect';

// The `InsertStoryBeat` mutation requires an argument of type `InsertStoryBeatVariables`:
const insertStoryBeatVars: InsertStoryBeatVariables = {
  storyTrailId: ...,
  orderIndex: ...,
  title: ...,
  body: ...,
};

// Call the `insertStoryBeatRef()` function to get a reference to the mutation.
const ref = insertStoryBeatRef(insertStoryBeatVars);
// Variables can be defined inline as well.
const ref = insertStoryBeatRef({ storyTrailId: ..., orderIndex: ..., title: ..., body: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = insertStoryBeatRef(dataConnect, insertStoryBeatVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.storyBeat_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.storyBeat_insert);
});
```
