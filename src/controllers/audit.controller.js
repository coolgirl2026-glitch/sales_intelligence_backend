import { generateAudit } from "../services/analysis/audit.service.js";

export async function auditGeneration(req, res, next) {
  try {
    const { company, website, inputs, outputData } = req.body;
    const result = await generateAudit({ company, website, inputs, outputData });
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
