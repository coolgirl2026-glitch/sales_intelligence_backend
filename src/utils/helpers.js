export function summarizePriorAnalysis(analysis, tool) {
  if (!analysis) return "";
  try {
    const data = typeof analysis === "string" ? JSON.parse(analysis) : analysis;
    const bullets = [];

    if (tool === "sales_intelligence") {
      if (data.specialNote) {
        bullets.push(`Executive Insight: ${data.specialNote}`);
      }
      if (Array.isArray(data.sections)) {
        for (const sec of data.sections) {
          if (sec.title === "Likely Pain Points" && Array.isArray(sec.items)) {
            bullets.push(`Likely Pain Points: ${sec.items.slice(0, 3).join(", ")}`);
          } else if (sec.title === "Recommended Pitch Angle" && sec.text) {
            bullets.push(`Recommended Pitch: ${sec.text}`);
          } else if (sec.title === "Recommended Positioning" && sec.text) {
            bullets.push(`Positioning: ${sec.text}`);
          }
        }
      }
    } else if (tool === "opportunity_discovery") {
      bullets.push(`Fit: ${data.fitLevel || "N/A"} (Aspire: ${data.aspireScore || 0}, Thriving: ${data.thrivingScore || 0})`);
      if (data.urgency) bullets.push(`Urgency: ${data.urgency}`);
      if (data.recommendation) bullets.push(`Recommendation: ${data.recommendation}`);
      if (data.reasoning) bullets.push(`Reasoning: ${data.reasoning}`);
    } else if (tool === "outreach_generator") {
      if (Array.isArray(data.messages)) {
        for (const msg of data.messages) {
          if (msg.channel && msg.content) {
            const cleanContent = msg.content.length > 80 ? msg.content.substring(0, 80) + "..." : msg.content;
            bullets.push(`${msg.channel}: ${cleanContent}`);
          }
        }
      }
    } else if (tool === "deal_execution") {
      if (data.nextBestAction) {
        bullets.push(`Next Best Action: Do "${data.nextBestAction.insteadDo}" (Instead of "${data.nextBestAction.doNotDo}")`);
      }
      if (data.objectionIntelligence) {
        bullets.push(`Objection Heard: "${data.objectionIntelligence.phraseHeard}" -> Concern: ${data.objectionIntelligence.actualConcern}`);
      }
      if (Array.isArray(data.sections)) {
        const bestFit = data.sections.find(s => s.title === "Best Fit Product");
        if (bestFit && bestFit.text) {
          bullets.push(`Best Fit Product: ${bestFit.text}`);
        }
      }
    } else if (tool === "proposal_intelligence") {
      if (Array.isArray(data.sections)) {
        const solution = data.sections.find(s => s.title === "Recommended Solution");
        if (solution && solution.text) {
          bullets.push(`Recommended Solution: ${solution.text}`);
        }
        const challenges = data.sections.find(s => s.title === "Identified Challenges");
        if (challenges && challenges.text) {
          bullets.push(`Identified Challenges: ${challenges.text}`);
        }
        const outcomes = data.sections.find(s => s.title === "Targeted Outcomes");
        if (outcomes && outcomes.text) {
          bullets.push(`Targeted Outcomes: ${outcomes.text}`);
        }
      }
    }

    // Fallback if we didn't get enough bullets
    if (bullets.length === 0) {
      if (data.specialNote) bullets.push(data.specialNote);
      if (data.recommendation) bullets.push(data.recommendation);
      if (Array.isArray(data.sections)) {
        for (const sec of data.sections.slice(0, 3)) {
          if (sec.text) {
            bullets.push(`${sec.title}: ${sec.text}`);
          } else if (Array.isArray(sec.items)) {
            bullets.push(`${sec.title}: ${sec.items.slice(0, 2).join(", ")}`);
          }
        }
      }
    }

    const finalBullets = bullets.filter(Boolean).slice(0, 5);
    if (finalBullets.length > 0) {
      return finalBullets.map(b => `- ${b}`).join("\n");
    }
    return "";
  } catch (err) {
    console.error("Error summarizing prior analysis:", err);
    return "";
  }
}
