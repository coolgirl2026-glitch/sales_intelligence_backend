import { PromptCompressor } from './textCompressor.js';

const graphify = new PromptCompressor({
  apiKey: process.env.GRAPHIFY_API_KEY
});

export async function compressSalesPayload(rawSystem, rawUser) {
  // Compress corporate structural baseline documents
  const compressedSystem = await graphify.compressContext(rawSystem, {
    mode: 'system-instruction',
    retainStructure: ['OUTPUT RULES', 'CRITICAL', 'SPECIAL NOTE']
  });

  // Compress dynamic input properties 
  const compressedUser = await graphify.compressContext(rawUser, {
    mode: 'entity-flatten',
    targetSchema: ['Company', 'Industry', 'PainPoints', 'Challenges']
  });

  // Metric Calculation (approx 4 chars per token)
  const originalTokens = Math.ceil((rawSystem.length + rawUser.length) / 4);
  const optimizedTokens = Math.ceil((compressedSystem.length + compressedUser.length) / 4);
  const optimizationPercent = ((1 - (optimizedTokens / originalTokens)) * 100).toFixed(1);

  // Live Terminal Analytics Output
  console.log(`\n=== 📉 GRAPHIFY TOKEN OPTIMIZATION METRICS ===`);
  console.log(`• Original Prompt Size:  ~${originalTokens} tokens`);
  console.log(`• Graphify Compress Size: ~${optimizedTokens} tokens`);
  console.log(`• Total Quota Saved:     ~${originalTokens - optimizedTokens} tokens (${optimizationPercent}% reduction)`);
  console.log(`=============================================\n`);

  return {
    compressedSystemPrompt: compressedSystem,
    compressedUserMessage: compressedUser,
    metrics: { originalTokens, optimizedTokens }
  };
}
