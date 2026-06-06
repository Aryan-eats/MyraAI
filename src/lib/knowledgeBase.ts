import mongoose, { Schema } from "mongoose"
import connectDb from "@/lib/db"
import { generateText } from "@/lib/gemini"
import type { KnowledgeFilters, KnowledgeSearchResult, LendingProduct, LoanProductType } from "@/types/agents"

type LendingProductDocument = LendingProduct & {
  _id?: mongoose.Types.ObjectId
}

const lendingProductSchema = new Schema<LendingProductDocument>(
  {
    productType: {
      type: String,
      enum: ["personal_loan", "home_loan", "lap", "business_loan", "vehicle_loan", "education_loan"],
      required: true,
      index: true,
    },
    lenderName: { type: String, required: true, index: true },
    interestRateMin: { type: Number, required: true },
    interestRateMax: { type: Number, required: true },
    processingFeePercent: { type: Number, required: true },
    processingFeeFixed: { type: Number },
    minLoanAmount: { type: Number, required: true },
    maxLoanAmount: { type: Number, required: true },
    minTenureMonths: { type: Number, required: true },
    maxTenureMonths: { type: Number, required: true },
    tatDays: { type: Number, required: true },
    minCibilScore: { type: Number, required: true },
    minMonthlyIncome: { type: Number, required: true },
    documentsRequired: {
      salaried: { type: [String], default: [] },
      selfEmployed: { type: [String], default: [] },
    },
    eligibilityCriteria: { type: String, required: true },
    prepaymentCharges: { type: String, required: true },
    specialFeatures: { type: [String], default: [] },
    lastUpdated: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
    needsVerification: { type: Boolean, default: true },
  },
  { collection: "lending_products" },
)

lendingProductSchema.index({ lenderName: "text", productType: "text", eligibilityCriteria: "text", specialFeatures: "text" })

const LendingProductModel =
  (mongoose.models.LendingProduct as mongoose.Model<LendingProductDocument>) ||
  mongoose.model<LendingProductDocument>("LendingProduct", lendingProductSchema)

const PRODUCT_TYPES: LoanProductType[] = [
  "personal_loan",
  "home_loan",
  "lap",
  "business_loan",
  "vehicle_loan",
  "education_loan",
]

function clampConfidence(value: number) {
  return Math.max(0.1, Math.min(0.98, Number(value.toFixed(2))))
}

function confidenceFromMatch(product: LendingProductDocument, filters?: KnowledgeFilters) {
  let score = 0.55
  if (filters?.productType && filters.productType === product.productType) score += 0.15
  if (filters?.lenderName && product.lenderName.toLowerCase().includes(filters.lenderName.toLowerCase())) score += 0.1
  if (filters?.maxInterestRate && product.interestRateMin <= filters.maxInterestRate) score += 0.08
  if (filters?.maxProcessingFeePercent && product.processingFeePercent <= filters.maxProcessingFeePercent) score += 0.05
  if (filters?.minLoanAmount && product.maxLoanAmount >= filters.minLoanAmount) score += 0.05
  return clampConfidence(score)
}

function sanitizeFilters(raw: Record<string, unknown>): KnowledgeFilters {
  const output: KnowledgeFilters = {}
  if (typeof raw.productType === "string" && PRODUCT_TYPES.includes(raw.productType as LoanProductType)) {
    output.productType = raw.productType as LoanProductType
  }
  if (typeof raw.lenderName === "string" && raw.lenderName.trim()) {
    output.lenderName = raw.lenderName.trim()
  }
  if (typeof raw.maxInterestRate === "number") {
    output.maxInterestRate = raw.maxInterestRate
  }
  if (typeof raw.minLoanAmount === "number") {
    output.minLoanAmount = raw.minLoanAmount
  }
  if (typeof raw.maxProcessingFeePercent === "number") {
    output.maxProcessingFeePercent = raw.maxProcessingFeePercent
  }
  if (typeof raw.salariedOnly === "boolean") {
    output.salariedOnly = raw.salariedOnly
  }
  if (typeof raw.city === "string") {
    output.city = raw.city
  }
  return output
}

async function extractFiltersFromQuery(query: string): Promise<KnowledgeFilters> {
  const prompt = [
    "Extract loan search filters from this user query and return JSON only.",
    "Allowed keys: productType, lenderName, maxInterestRate, minLoanAmount, maxProcessingFeePercent, salariedOnly, city",
    `Query: ${query}`,
  ].join("\n")

  const raw = await generateText({ message: prompt, temperature: 0 })
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return sanitizeFilters(parsed)
  } catch {
    const start = raw.indexOf("{")
    const end = raw.lastIndexOf("}")
    if (start >= 0 && end > start) {
      try {
        return sanitizeFilters(JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>)
      } catch {
        return {}
      }
    }
    return {}
  }
}

function buildMongoFilter(filters?: KnowledgeFilters) {
  const mongoFilter: Record<string, unknown> = { isActive: true }
  if (!filters) return mongoFilter

  if (filters.productType) mongoFilter.productType = filters.productType
  if (filters.lenderName) mongoFilter.lenderName = { $regex: filters.lenderName, $options: "i" }
  if (typeof filters.maxInterestRate === "number") {
    mongoFilter.interestRateMin = { $lte: filters.maxInterestRate }
  }
  if (typeof filters.minLoanAmount === "number") {
    mongoFilter.maxLoanAmount = { $gte: filters.minLoanAmount }
  }
  if (typeof filters.maxProcessingFeePercent === "number") {
    mongoFilter.processingFeePercent = { $lte: filters.maxProcessingFeePercent }
  }

  return mongoFilter
}

export async function searchLendingKnowledge(
  query: string,
  filters?: KnowledgeFilters,
): Promise<KnowledgeSearchResult[]> {
  await connectDb()

  const effectiveFilters = filters ?? (await extractFiltersFromQuery(query))
  const mongoFilter = buildMongoFilter(effectiveFilters)

  let docs = await LendingProductModel.find({
    ...mongoFilter,
    $text: { $search: query },
  })
    .sort({ score: { $meta: "textScore" }, lastUpdated: -1 })
    .limit(5)
    .lean()
    .exec()

  if (!docs.length) {
    docs = await LendingProductModel.find(mongoFilter).sort({ lastUpdated: -1 }).limit(5).lean().exec()
  }

  return docs.slice(0, 5).map((doc) => ({ ...doc, confidence: confidenceFromMatch(doc, effectiveFilters) }))
}

export async function upsertLendingProducts(products: LendingProduct[]): Promise<number> {
  await connectDb()

  let writes = 0
  for (const product of products) {
    await LendingProductModel.updateOne(
      { lenderName: product.lenderName, productType: product.productType },
      { $set: product },
      { upsert: true },
    )
    writes += 1
  }
  return writes
}

export async function getLenderChecklist(lenderName: string, productType: LoanProductType) {
  await connectDb()
  const product = await LendingProductModel.findOne({ lenderName, productType, isActive: true }).lean().exec()
  if (!product) {
    return null
  }

  const required = new Set<string>([
    ...product.documentsRequired.salaried,
    ...product.documentsRequired.selfEmployed,
  ])

  return {
    lenderName,
    productType,
    requiredFields: Array.from(required).map((field) => ({ field, required: true })),
  }
}
