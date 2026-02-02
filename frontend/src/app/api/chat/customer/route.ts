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

// Fetch specific customer data for context
async function getCustomerContext(customerId: string) {
  const supabase = getSupabaseClient()

  const { data: customer, error } = await supabase
    .from('unified_customers')
    .select('*')
    .eq('customer_id', customerId)
    .single()

  if (error || !customer) {
    return null
  }

  // Build comprehensive context object
  const context = {
    identity: {
      name: customer.name || 'Unknown',
      email: customer.email,
      company: customer.company_name || 'Unknown',
      location: [customer.location_city, customer.location_country].filter(Boolean).join(', ') || 'Unknown',
      industry: customer.industry || 'Unknown',
      company_size: customer.company_size || 'Unknown',
      assigned_am: customer.assigned_am || 'Unassigned',
    },
    revenue: {
      mrr: customer.mrr || 0,
      arr: customer.arr || 0,
      ltv: customer.ltv || 0,
      plan: customer.plan_name || 'Unknown',
      subscription_status: customer.subscription_status || 'Unknown',
    },
    health: {
      score: customer.health_score,
      status: customer.health_status || 'Unknown',
      churn_risk: customer.churn_risk,
    },
    activity: {
      days_since_seen: customer.days_since_seen,
      last_seen_at: customer.last_seen_at,
      signup_date: customer.signup_date,
      tenure_days: customer.signup_date
        ? Math.floor((Date.now() - new Date(customer.signup_date).getTime()) / (1000 * 60 * 60 * 24))
        : null,
    },
    support: {
      total_conversations: customer.intercom_convos_total || 0,
      conversations_last_30_days: customer.intercom_convos_30d || 0,
      open_tickets: customer.open_tickets || 0,
      mentioned_cancel: customer.mentioned_cancel || false,
    },
    risk_signals: {
      mentioned_cancel: customer.mentioned_cancel || false,
      is_delinquent: customer.is_delinquent || false,
      inactive_over_30_days: (customer.days_since_seen || 0) > 30,
      low_health_score: (customer.health_score || 100) < 50,
    },
    segmentation: {
      segment: customer.customer_segment || 'Unknown',
      icp_match: customer.icp_match || 'Unknown',
      mrr_tier: customer.mrr_tier || 'Unknown',
      tenure_segment: customer.tenure_segment || 'Unknown',
      traffic_source: customer.traffic_source || 'Unknown',
    },
    business_context: {
      client_offer: customer.client_offer || 'Not specified',
      client_icp: customer.client_icp || 'Not specified',
      client_ltv: customer.client_ltv,
    },
    engagement_history: customer.custom_attributes || {},
  }

  return context
}

const SYSTEM_PROMPT = `You are a Customer Success AI Analyst for ListKit, a B2B lead generation platform. You are analyzing a specific customer account and providing actionable insights to help the Customer Success team.

## Your Capabilities:
1. **Root Cause Analysis** - Identify why a customer's health score is low or declining
2. **Growth Opportunities** - Find ways to expand the account (upsells, feature adoption)
3. **Churn Prevention** - Recommend specific actions to retain at-risk customers
4. **Engagement Strategies** - Suggest personalized outreach based on customer behavior
5. **Account Health Assessment** - Provide an overall view of the account's status

## Analysis Framework:
When analyzing this customer, consider:
- **Revenue Impact**: Their MRR/ARR relative to their segment and plan
- **Health Indicators**: Score trends, activity levels, support interactions
- **Risk Signals**: Cancel mentions, payment issues, inactivity periods
- **Engagement Patterns**: Call attendance, support ticket frequency, feature usage
- **Business Context**: Their offer, ICP, and goals (if available from onboarding)

## Response Guidelines:
- Be specific and cite actual data from the customer record
- Prioritize actionable recommendations over general observations
- Consider the customer's segment and plan tier when making suggestions
- Format responses with clear sections using markdown (headers, bullets, bold)
- Be concise but thorough - aim for helpful insights, not verbose explanations
- If asked about something not in the data, acknowledge the limitation
- When recommending actions, be specific about what to do and why

## Example Analysis Areas:
- "Why is their health score at X?" → Analyze contributing factors
- "What expansion opportunities exist?" → Look at usage, plan tier, business context
- "How do we prevent churn?" → Identify risk signals and mitigation strategies
- "What should the AM focus on?" → Prioritized action items based on data`

export async function POST(request: NextRequest) {
  try {
    const { customerId, messages } = await request.json()

    if (!customerId) {
      return NextResponse.json(
        { error: 'Customer ID is required' },
        { status: 400 }
      )
    }

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
    const customerContext = await getCustomerContext(customerId)

    if (!customerContext) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      )
    }

    // Build the full system prompt with customer context
    const fullSystemPrompt = `${SYSTEM_PROMPT}

---

## Customer Data Context:

${JSON.stringify(customerContext, null, 2)}`

    // Build the messages array for Claude
    const claudeMessages = messages.map((msg: { role: string; content: string }) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }))

    // Call Claude API
    const anthropic = getAnthropicClient()
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: fullSystemPrompt,
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
    console.error('Customer Chat API error:', error)

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
