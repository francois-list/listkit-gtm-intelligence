import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

// Lazy initialization to avoid issues during build
function getAnthropicClient() {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || '',
  })
}

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

// Fetch customer data context for Claude
async function getCustomerContext() {
  const supabase = getSupabaseClient()

  // Get summary statistics
  const { data: customers, error } = await supabase
    .from('unified_customers')
    .select('*')
    .limit(500)

  if (error || !customers) {
    return 'Unable to fetch customer data.'
  }

  // Calculate aggregated stats
  const totalCustomers = customers.length
  const totalMrr = customers.reduce((sum, c) => sum + (c.mrr || 0), 0)
  const avgHealth = customers.reduce((sum, c) => sum + (c.health_score || 0), 0) / totalCustomers

  // Group by health status
  const healthGroups = {
    healthy: customers.filter(c => (c.health_score || 0) >= 70),
    warning: customers.filter(c => (c.health_score || 0) >= 40 && (c.health_score || 0) < 70),
    critical: customers.filter(c => (c.health_score || 0) < 40),
  }

  // Group by segment
  const segmentGroups: Record<string, typeof customers> = {}
  customers.forEach(c => {
    const seg = c.segment || 'Unknown'
    if (!segmentGroups[seg]) segmentGroups[seg] = []
    segmentGroups[seg].push(c)
  })

  // Group by plan
  const planGroups: Record<string, typeof customers> = {}
  customers.forEach(c => {
    const plan = c.plan || 'Unknown'
    if (!planGroups[plan]) planGroups[plan] = []
    planGroups[plan].push(c)
  })

  // Group by AM
  const amGroups: Record<string, typeof customers> = {}
  customers.forEach(c => {
    const am = c.account_manager || 'Unassigned'
    if (!amGroups[am]) amGroups[am] = []
    amGroups[am].push(c)
  })

  // Find at-risk customers (low health, high MRR)
  const atRiskCustomers = customers
    .filter(c => (c.health_score || 0) < 50)
    .sort((a, b) => (b.mrr || 0) - (a.mrr || 0))
    .slice(0, 20)

  // Recent activity (last 30 days)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const recentlyActive = customers.filter(c =>
    c.last_seen && new Date(c.last_seen) > thirtyDaysAgo
  ).length

  // Build context string
  return `
## Customer Database Summary (${new Date().toLocaleDateString()})

### Overview
- Total Customers: ${totalCustomers}
- Total MRR: $${totalMrr.toLocaleString()}
- Average Health Score: ${avgHealth.toFixed(1)}
- Recently Active (30 days): ${recentlyActive} customers

### Health Distribution
- Healthy (70+): ${healthGroups.healthy.length} customers ($${healthGroups.healthy.reduce((s, c) => s + (c.mrr || 0), 0).toLocaleString()} MRR)
- Warning (40-69): ${healthGroups.warning.length} customers ($${healthGroups.warning.reduce((s, c) => s + (c.mrr || 0), 0).toLocaleString()} MRR)
- Critical (<40): ${healthGroups.critical.length} customers ($${healthGroups.critical.reduce((s, c) => s + (c.mrr || 0), 0).toLocaleString()} MRR)

### By Segment
${Object.entries(segmentGroups).map(([seg, custs]) =>
  `- ${seg}: ${custs.length} customers, $${custs.reduce((s, c) => s + (c.mrr || 0), 0).toLocaleString()} MRR, Avg Health: ${(custs.reduce((s, c) => s + (c.health_score || 0), 0) / custs.length).toFixed(0)}`
).join('\n')}

### By Plan
${Object.entries(planGroups).map(([plan, custs]) =>
  `- ${plan}: ${custs.length} customers, $${custs.reduce((s, c) => s + (c.mrr || 0), 0).toLocaleString()} MRR`
).join('\n')}

### By Account Manager
${Object.entries(amGroups).map(([am, custs]) =>
  `- ${am}: ${custs.length} customers, $${custs.reduce((s, c) => s + (c.mrr || 0), 0).toLocaleString()} MRR, Avg Health: ${(custs.reduce((s, c) => s + (c.health_score || 0), 0) / custs.length).toFixed(0)}`
).join('\n')}

### Top At-Risk Customers (Low Health, High Value)
${atRiskCustomers.slice(0, 10).map(c =>
  `- ${c.company_name || c.email}: Health ${c.health_score || 0}, MRR $${(c.mrr || 0).toLocaleString()}, Plan: ${c.plan || 'Unknown'}, AM: ${c.account_manager || 'Unassigned'}`
).join('\n')}

### Full Customer List (for detailed queries)
${customers.slice(0, 100).map(c =>
  `${c.company_name || c.email} | Health: ${c.health_score || 'N/A'} | MRR: $${c.mrr || 0} | Plan: ${c.plan || 'N/A'} | Segment: ${c.segment || 'N/A'} | AM: ${c.account_manager || 'N/A'} | Status: ${c.status || 'N/A'} | Last Seen: ${c.last_seen ? new Date(c.last_seen).toLocaleDateString() : 'Never'}`
).join('\n')}
${customers.length > 100 ? `\n... and ${customers.length - 100} more customers` : ''}
`
}

const SYSTEM_PROMPT = `You are an AI assistant for ListKit's Customer Success team. You have access to real customer data from the company's database and can help analyze customer health, revenue metrics, and provide actionable recommendations.

Your role is to:
1. Answer questions about customer data, health scores, revenue, and trends
2. Identify at-risk customers and suggest intervention strategies
3. Provide insights on account manager performance
4. Help with customer segmentation and analysis
5. Suggest data-driven actions to improve retention and expansion

Guidelines:
- Be specific and use actual numbers from the data
- When discussing customers, mention their company name, health score, MRR, and relevant metrics
- Provide actionable recommendations, not just observations
- Format responses with clear sections using markdown (headers, bullet points, bold text)
- If asked about something not in the data, acknowledge the limitation
- Be concise but thorough - aim for helpful responses, not verbose ones

You represent ListKit's Command Center - a customer intelligence platform that helps GTM teams make data-driven decisions.`

export async function POST(request: NextRequest) {
  try {
    const { messages } = await request.json()

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'Messages array is required' },
        { status: 400 }
      )
    }

    // Check for API key
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY is not configured' },
        { status: 500 }
      )
    }

    // Fetch customer context
    const customerContext = await getCustomerContext()

    // Build the messages array for Claude
    const claudeMessages = messages.map((msg: { role: string; content: string }) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }))

    // Add customer context to the first user message
    if (claudeMessages.length > 0 && claudeMessages[0].role === 'user') {
      claudeMessages[0].content = `${claudeMessages[0].content}\n\n---\n\nHere is the current customer data for context:\n${customerContext}`
    }

    // Call Claude API
    const anthropic = getAnthropicClient()
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: claudeMessages,
    })

    // Extract the text response
    const textContent = response.content.find(block => block.type === 'text')
    const assistantMessage = textContent?.type === 'text' ? textContent.text : 'I apologize, but I was unable to generate a response.'

    return NextResponse.json({
      message: assistantMessage,
      usage: response.usage,
    })
  } catch (error) {
    console.error('Chat API error:', error)

    if (error instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: `Claude API error: ${error.message}` },
        { status: error.status || 500 }
      )
    }

    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
