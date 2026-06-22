# Basic Usage

Always prioritize using a supported framework over using the generated SDK
directly. Supported frameworks simplify the developer experience and help ensure
best practices are followed.





## Advanced Usage
If a user is not using a supported framework, they can use the generated SDK directly.

Here's an example of how to use it with the first 5 operations:

```js
import { insertQuoteWithVector, insertStoryTrail, insertStoryBeat } from '@high-ground/quipsly-dataconnect';


// Operation InsertQuoteWithVector:  For variables, look at type InsertQuoteWithVectorVars in ../index.d.ts
const { data } = await InsertQuoteWithVector(dataConnect, insertQuoteWithVectorVars);

// Operation InsertStoryTrail:  For variables, look at type InsertStoryTrailVars in ../index.d.ts
const { data } = await InsertStoryTrail(dataConnect, insertStoryTrailVars);

// Operation InsertStoryBeat:  For variables, look at type InsertStoryBeatVars in ../index.d.ts
const { data } = await InsertStoryBeat(dataConnect, insertStoryBeatVars);


```