// Builds the exact user message sent to Claude for each tool.
// Each function returns a string that instructs Claude
// to return only a specific JSON structure — no extra text.

export function buildIntelligencePrompt(values, agent, webResearch = null, historicalMemoryContext = null) {
  return `
AGENT CONTEXT: You are operating as the ${agent} sales agent.
Apply ${agent}-specific positioning, ICP criteria, and product knowledge in your output.

Analyze this prospect for our sales team and return a JSON object.

PROSPECT DETAILS:
- Company: ${values.company || "Unknown"}
- Company Website: ${values.website || "Not provided"}
- Industry: ${values.industry || "Unknown"}
- Employee Size: ${values.size || "Unknown"}
- Point of Contact: ${values.persona || "Unknown"}
- LinkedIn Profile: ${values.linkedin || "Not provided"}
- Pain Points Known: ${values.pain || "Not provided"}
- Location: ${values.location || "Not provided"}

ADDITIONAL TARGET BOUNDARY:
- Official LinkedIn Corporate URL: ${values.linkedinUrl || "Not Provided"}
Use this anchor data to align employee headcount tiers, growth trajectory inferences, and corporate positioning context if visible.

Return ONLY a valid JSON object with this exact structure.
No markdown. No explanation. No text before or after the JSON.
Keep all text concise. Use short bullets and short paragraphs so the JSON never gets cut off.

Include a top-level field named "specialNote" with one concise executive insight focused on performance improvement, daily execution gaps, habit formation, manager effectiveness, or accountability.

STRICT CONSTRAINT: Return ONLY the fields "specialNote" and "sections".
Any additional root-level keys will cause the response to be rejected.

Do not return the JSON inside a code fence or as a quoted string. Return raw JSON.

{
  "specialNote": "One concise executive insight focused on performance improvement, daily execution gaps, habit formation, manager effectiveness, or accountability.",
  "sections": [
    {
      "title": "Likely Pain Points",
      "icon": "💣",
      "items": ["pain point 1", "pain point 2", "pain point 3", "pain point 4", "pain point 5"]
    },
    {
      "title": "Industry Insight",
      "icon": "🏭",
      "text": "2-3 sentence industry-specific insight grounded in their size and sector"
    },
    {
      "title": "Recommended Pitch Angle",
      "icon": "🎯",
      "text": "Specific pitch angle tailored to the contact role"
    },
    {
      "title": "Discovery Questions to Ask",
      "icon": "❓",
      "items": ["question 1", "question 2", "question 3", "question 4", "question 5"]
    },
    {
      "title": "Personalized Outreach Draft",
      "icon": "✉️",
      "text": "Ready-to-send LinkedIn or email message tailored to their industry and role",
      "copyable": true
    },
    {
      "title": "Likely Objections",
      "icon": "🚧",
      "items": ["objection 1 → reframe", "objection 2 → reframe", "objection 3 → reframe"]
    },
    {
      "title": "Recommended Positioning",
      "icon": "⚔️",
      "text": "How to position the product for this specific company and role"
    },
    {
      "title": "Recommended Next Action",
      "icon": "🚀",
      "text": "Specific next step the salesperson should take today"
    }
  ]
}
` + (webResearch ? `\n\nWEB RESEARCH CONTEXT FROM PERPLEXITY:\n${webResearch}\n\nUse the web research only when it is relevant and factual. Do not invent details.` : "")
    + (historicalMemoryContext ? `\n\nHISTORICAL CONTEXT:\n${historicalMemoryContext}\n\nAnalyze the current form values in strict alignment with the historical context, metrics, and strategic directions established in prior pipeline steps to maintain complete deal continuity.` : "");
}

export function buildWebResearchPrompt(agent, tool, values) {
  return `
Do web research for a salesperson before an AI sales analysis.

Research only. Do not pitch. Do not create the final structured output.

Return concise, factual research with source URLs where available. Limit your response to 400 words maximum.

SEARCH TARGET:
- Agent/Product Context: ${agent}
- Sales Tool: ${tool}
- Company: ${values.company || "Unknown"}
- Company Website: ${values.website || "Not provided"}
- Industry: ${values.industry || "Unknown"}
- Employee Size: ${values.size || "Unknown"}
- Point of Contact: ${values.persona || "Unknown"}
- LinkedIn Profile: ${values.linkedin || "Not provided"}
- Pain Points Known: ${values.pain || values.challenge || values.context || "Not provided"}
- Location: ${values.location || "Not provided"}

Find useful context such as:
- What the company does
- Recent news, hiring, funding, leadership changes, expansion, layoffs, reviews, or public signals
- Industry context and likely business/people/performance pressures
- Any useful signals from the company website or LinkedIn profile

Include URLs when possible.
`;
}

export function buildOpportunityDiscoveryPrompt(values, agent, webResearch = null, historicalMemoryContext = null) {
  const isThriving = agent?.toLowerCase().includes("thriving");

  const schemaLayout = `,
  "sections": [
    { "title": "Call Brief", "icon": "📄", "text": "2-3 sentence approach mindset brief." },
    { "title": "Top 5 Questions to Ask", "icon": "❓", "items": ["q1", "q2", "q3", "q4", "q5"] },
    { "title": "Objections to Expect", "icon": "🚧", "items": ["obj1 — reframe", "obj2 — reframe", "obj3 — reframe"] },
    { "title": "${isThriving ? 'Thriving Workplace Positioning' : 'Recommended Aspire Programs'}", "icon": "${isThriving ? '🎯' : '🎓'}", "text": "Strategic application anchoring text block." },
    { "title": "${isThriving ? 'Case Studies to Use' : 'Habit Journeys & Business Impact'}", "icon": "${isThriving ? '📚' : '🔄'}", "items": ["Item 1", "Item 2"] },
    { "title": "How to End the Call", "icon": "🏁", "text": "Exact closing line statement framework." }
  ]
}`;

  return `
AGENT CONTEXT: You are operating as the ${agent} sales agent.
Apply ${agent}-specific positioning, ICP criteria, and product knowledge in your output.

Score fit metrics and draft a comprehensive discovery brief returning ONLY a raw JSON schema object.

SCORING RUBRIC:
- aspireScore (0–100): 80+ = employees 100–1000, measurable perf problems, manager layer exists. 
  50–79 = partial fit. Below 50 = disqualify.
- thrivingScore (0–100): 80+ = 150+ employees, leadership involved, attrition/culture signals visible.
- urgency: High = trigger event visible (layoffs, new leadership, funding). Medium = chronic pain, no trigger. Low = exploring only.
- budget: High = explicit budget conversation happened or company funded/profitable at scale. Medium = budget exists but not discussed. Low = startup/cost-sensitive/no budget signal.

PROSPECT PROFILE CONTEXT:
- Company: ${values.company} | Website: ${values.website} | Industry: ${values.industry}
${isThriving ? `- Size: ${values.size}\n- Hiring: ${values.hiringStatus}\n- Issues: ${values.knownIssues}` : `- Target Function: ${values.targetFunction}`}

EXECUTION MANDATE:
${isThriving ? 'Run Workplace Opportunity Scanner rules to isolate culture friction tracks.' : 'Run Performance Leakage Analyzer rules focusing on function execution drop-offs.'}

{
  "fitLevel": "High/Medium/Low Fit", "aspireScore": 0, "thrivingScore": 0, "urgency": "High/Medium/Low", "budget": "High/Medium/Low",
  "recommendation": "Strategic routing line", "reasoning": "Scoring alignment justification text" ${schemaLayout}
}` + (webResearch ? `\n\nWEB CONTEXT:\n${webResearch}` : "")
    + (historicalMemoryContext ? `\n\nHISTORICAL CONTEXT:\n${historicalMemoryContext}\n\nAnalyze the current form values in strict alignment with the historical context, metrics, and strategic directions established in prior pipeline steps to maintain complete deal continuity.` : "");
}

export function buildOutreachPrompt(values, agent, webResearch = null, historicalMemoryContext = null) {
  return `
AGENT CONTEXT: You are operating as the ${agent} sales agent.
Apply ${agent}-specific positioning, ICP criteria, and product knowledge in your output.

Generate outreach messages for this prospect and return a JSON object.

PROSPECT DETAILS:
- Company: ${values.company || "Unknown"}
- Company Website: ${values.website || "Not provided"}
- Industry: ${values.industry || "Unknown"}
- Contact Persona: ${values.persona || "Unknown"}
- Sales Stage: ${values.stage || "Cold Outreach"}
- Known Pain Point: ${values.pain || "Not provided"}

Return ONLY a valid JSON object with this exact structure.
No markdown. No explanation. No text before or after the JSON.

{
  "messages": [
    {
      "channel": "LinkedIn DM",
      "icon": "💼",
      "content": "Short conversational LinkedIn DM — 3 to 5 sentences max. No subject line."
    },
    {
      "channel": "Cold Email",
      "icon": "📧",
      "subject": "Email subject line here",
      "content": "Full cold email body — 4 to 6 sentences. Professional but not corporate."
    },
    {
      "channel": "Follow-up (Day 3)",
      "icon": "🔄",
      "content": "Short follow-up message referencing the first touch — 3 to 4 sentences."
    },
    {
      "channel": "WhatsApp Nudge",
      "icon": "💬",
      "content": "WhatsApp Nudge: max 120 characters, must feel like a real person texting."
    }
  ]
}
` + (webResearch ? `\n\nWEB RESEARCH CONTEXT FROM PERPLEXITY:\n${webResearch}\n\nUse the web research only when it is relevant and factual. Do not invent details.` : "")
    + (historicalMemoryContext ? `\n\nHISTORICAL CONTEXT:\n${historicalMemoryContext}\n\nAnalyze the current form values in strict alignment with the historical context, metrics, and strategic directions established in prior pipeline steps to maintain complete deal continuity.` : "");
}

export function buildExecutionPrompt(values, agent, webResearch = null, historicalMemoryContext = null) {
  const sanitized_objection = values.clientObjection
    ? values.clientObjection.replace(/`/g, '\\`').replace(/\$/g, '\\$')
    : "";

  const objectionDetails = values.clientObjection
    ? `\n- Client Objection (analyze separately): "${sanitized_objection}"`
    : "";

  const objectionInstructions = values.clientObjection
    ? `

Additionally, analyze the Client Objection provided under "Client Objection (analyze separately)" to generate Objection Intelligence. You must include an "objectionIntelligence" object at the root of the JSON response with the following structure:
"objectionIntelligence": {
  "phraseHeard": "The exact client objection analyzed",
  "actualConcern": "The hidden/underlying business objection (e.g., 'Not convinced of ROI' or 'Fear of implementation friction')",
  "matrix": {
    "reframe": "How to dynamically pivot the narrative perspective away from defense",
    "proof": "A hard, specific data baseline metric or logical validation point",
    "story": "A quick 1-2 sentence scenario hook or case study reference matching the objection",
    "question": "The killer calibrated counter-question to put the ownership back on the prospect"
  }
}`
    : "";

  const objectionSchema = values.clientObjection
    ? `,
  "objectionIntelligence": {
    "phraseHeard": "The exact client objection analyzed",
    "actualConcern": "Underlying business objection",
    "matrix": {
      "reframe": "Dynamic reframe response",
      "proof": "Hard verification/validation point",
      "story": "1-2 sentence scenario hook",
      "question": "Calibrated counter-question"
    }
  }`
    : "";

  return `
AGENT CONTEXT: You are operating as the ${agent} sales agent.
Apply ${agent}-specific positioning, ICP criteria, and product knowledge in your output.

Using your ${agent} agent positioning, analyze the following deal details and meeting notes to help the sales rep close the deal.

DEAL DETAILS:
- Company Name: ${values.company || "Unknown"}
- Company Website: ${values.website || "Not provided"}
- Meeting Notes: ${values.meetingNotes || "Not provided"}
- Stakeholders Involved: ${values.stakeholders || "Not provided"}
- Key Challenges/Blockers: ${values.challenges || "Not provided"}${objectionDetails}
${objectionInstructions}
Return ONLY a valid JSON object with this exact structure.
No markdown. No explanation. No text before or after the JSON.
Keep all text concise. Use short bullets and short paragraphs so the JSON never gets cut off.

{
  "sections": [
    {
      "title": "Real Pain",
      "icon": "💥",
      "text": "Analysis of the customer's core underlying business pain."
    },
    {
      "title": "Urgency",
      "icon": "⏳",
      "text": "Assessment of deal urgency and timeline factors."
    },
    {
      "title": "Best Fit Product",
      "icon": "💡",
      "text": "Which of our products (Aspire or Thriving Workplace) is the better fit and why."
    },
    {
      "title": "Case Study to Use",
      "icon": "📚",
      "text": "Specific case study recommendation for this scenario."
    },
    {
      "title": "Proof Point to Use",
      "icon": "📊",
      "text": "Proof point or statistic to share with the customer."
    },
    {
      "title": "Likely Objections",
      "icon": "🚧",
      "items": ["objection 1 + response reframe", "objection 2 + response reframe"]
    },
    {
      "title": "Recommended Next Step",
      "icon": "🚀",
      "text": "Clear, actionable next step to advance the deal."
    }
  ],
  "nextBestAction": {
    "doNotDo": "A specific weak generic behavior to avoid (e.g. 'Send standard proposal' or 'Follow up next week')",
    "insteadDo": "The high-leverage strategic next step to take (e.g. 'Get the business head into next meeting' or 'Share targeted case study')"
  }${objectionSchema}
}
` + (webResearch ? `\n\nWEB RESEARCH CONTEXT FROM PERPLEXITY:\n${webResearch}\n\nUse the web research only when it is relevant and factual. Do not invent details.` : "")
    + (historicalMemoryContext ? `\n\nHISTORICAL CONTEXT:\n${historicalMemoryContext}\n\nAnalyze the current form values in strict alignment with the historical context, metrics, and strategic directions established in prior pipeline steps to maintain complete deal continuity.` : "");
}

export function buildProposalPrompt(values, agent, webResearch = null, historicalMemoryContext = null) {
  return `
AGENT CONTEXT: You are operating as the ${agent} sales agent.
Apply ${agent}-specific positioning, ICP criteria, and product knowledge in your output.

Generate a comprehensive proposal framework based on the following inputs and return a JSON object.

INPUT DETAILS:
- Company Name: ${values.company || "Unknown"}
- Company Website: ${values.website || "Not provided"}
- Industry: ${values.industry || "Unknown"}
- Pain Points: ${values.pain || "Not provided"}
- Team Size: ${values.size || "Unknown"}

Return ONLY a valid JSON object with this exact structure.
No markdown. No explanation. No text before or after the JSON.
Keep all text fields detailed yet structured.

{
  "sections": [
    {
      "title": "Customized Proposal Structure",
      "icon": "📋",
      "text": "Detailed proposed structure/index of the proposal tailored to their industry and team size."
    },
    {
      "title": "Identified Challenges",
      "icon": "🔍",
      "text": "Analysis of the specific challenges/pain points they are facing based on industry norms and inputs."
    },
    {
      "title": "Business Impact Analysis",
      "icon": "📊",
      "text": "Analysis of the business impact of these challenges if left unaddressed (e.g. costs, attrition, productivity)."
    },
    {
      "title": "Recommended Solution",
      "icon": "💡",
      "text": "Our proposed recommendation, detailing how our program/offering resolves their core issues."
    },
    {
      "title": "Targeted Outcomes",
      "icon": "🎯",
      "text": "Quantifiable, expected outcomes or KPIs to track after successful implementation."
    },
    {
      "title": "Relevant Case Studies",
      "icon": "📚",
      "text": "Specific case study references or client stories that validate this proposal framework."
    }
  ]
}
` + (webResearch ? `\n\nWEB RESEARCH CONTEXT FROM PERPLEXITY:\n${webResearch}\n\nUse the web research only when it is relevant and factual. Do not invent details.` : "")
    + (historicalMemoryContext ? `\n\nHISTORICAL CONTEXT:\n${historicalMemoryContext}\n\nAnalyze the current form values in strict alignment with the historical context, metrics, and strategic directions established in prior pipeline steps to maintain complete deal continuity.` : "");
}

export function buildDeepAuditPrompt(companyName, website, userInputData, generatedAiOutput, webResearch = null) {
  const safeInputs = { ...userInputData };
  delete safeInputs.apiKey;
  delete safeInputs.token;
  delete safeInputs.password;

  return `You are an elite corporate auditor reviewing the quality and factual accuracy of sales advice. Your sole task is to independently verify if the generated AI sales insights are 100% accurate, factual, and correctly isolated to the exact target entity: "${companyName}" (${website}). Focus specifically on sales output quality: distinguish clearly between raw factual accuracy of target company data (avoiding hallucinations/entity drift) and the strategic quality of the sales advice. Do not penalize creative sales tactics or positioning framing, but strictly flag and penalize factual hallucinations or misattributing data to a parent conglomerate, sister company, or competitor.

  ORIGINAL USER INPUT PARAMETERS:
  ${JSON.stringify(safeInputs)}

  GENERATED AI OUTPUT TO AUDIT:
  ${JSON.stringify(generatedAiOutput)}

  ${webResearch ? `TRUE COMPANY WEB REALITY CONTEXT (PERPLEXITY RESEARCH):\n${webResearch}\n` : ""}

  CRITICAL AUDIT DIRECTIVES:
  1. Detect entity drift or crossovers (e.g., misattributing data to a parent conglomerate, sister company, or competitor with a similar name).
  2. Flag hallucinations regarding core metrics, sizing, market presence, or strategic pain points by cross-referencing with the TRUE COMPANY WEB REALITY CONTEXT.
  3. Treat ambiguous data aggressively. If you cannot independently confidently verify a major claim based on the provided corporate domain and web reality context, flag it.
  4. Separate your analysis into two scores and a composite score:
     - entityAccuracyScore (0 to 100): Reflects factual accuracy and absence of entity drift or hallucinations. An output that matches the true company realities should score 90-100.
     - salesRelevanceScore (0 to 100): Reflects how relevant and contextually appropriate the sales advice is.
     - confidenceScore (0 to 100): Overall calibrated composite score.

  Return ONLY a raw JSON object string with this exact structure:
  {
    "entityAccuracyScore": 0 to 100,
    "salesRelevanceScore": 0 to 100,
    "confidenceScore": 0 to 100,
    "status": "Verified / Highly Accurate" or "Needs Review / Contains Noise" or "Critical Warning / Flawed Data",
    "findings": ["Direct sentence breaking down verified fact or hallucination 1", "Finding 2"],
    "verdictText": "A crisp, 2-sentence executive assessment summarizing why this data can or cannot be completely trusted in front of a client."
  }`;
}

