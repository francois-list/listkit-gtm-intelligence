'use client'

import { useEffect, useRef, useState } from 'react'

interface SankeyNode {
  id: string
  label: string
  value: number
  stage: 'acquisition' | 'conversion' | 'experience'
  color: string
}

interface SankeyLink {
  source: string
  target: string
  value: number
}

interface FunnelData {
  nodes: SankeyNode[]
  links: SankeyLink[]
}

// Stage colors
const STAGE_COLORS = {
  acquisition: {
    bg: 'rgba(82, 115, 255, 0.15)',
    border: 'rgba(82, 115, 255, 0.3)',
    text: '#5273FF',
    gradient: ['#5273FF', '#3A5AE6'],
  },
  conversion: {
    bg: 'rgba(102, 12, 251, 0.15)',
    border: 'rgba(102, 12, 251, 0.3)',
    text: '#660CFB',
    gradient: ['#660CFB', '#5209C9'],
  },
  experience: {
    bg: 'rgba(43, 183, 108, 0.15)',
    border: 'rgba(43, 183, 108, 0.3)',
    text: '#2BB76C',
    gradient: ['#2BB76C', '#229958'],
  },
}

const NODE_COLORS: Record<string, string> = {
  // Acquisition Channels
  paid_ads: '#6D86FF',
  seo: '#5273FF',
  affiliate: '#4A6AE8',
  social_media: '#3A5AE6',
  content_marketing: '#2E4BD1',
  // Conversion - Product Led
  free_plan: '#B794F6',
  product_led_conversion: '#9B7CFF',
  // Conversion - Sales Led
  sales_demo: '#A78BFA',
  sales_led_conversion: '#7C5CE8',
  // Final Conversion
  paid_customers: '#660CFB',
  // Experience - Positive
  active: '#5DE0A0',
  expanding: '#2BB76C',
  // Experience - Negative
  at_risk: '#F5C15A',
  churned: '#EF4444',
}

interface CustomerFunnelSankeyProps {
  data?: FunnelData
  height?: number
}

export default function CustomerFunnelSankey({ data, height = 500 }: CustomerFunnelSankeyProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height })
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [hoveredLink, setHoveredLink] = useState<string | null>(null)

  // Default demo data if none provided
  const defaultData: FunnelData = {
    nodes: [
      // Acquisition Stage - Traffic Sources
      { id: 'paid_ads', label: 'Paid Ads', value: 3500, stage: 'acquisition', color: NODE_COLORS.paid_ads },
      { id: 'seo', label: 'SEO', value: 4200, stage: 'acquisition', color: NODE_COLORS.seo },
      { id: 'affiliate', label: 'Affiliate', value: 1800, stage: 'acquisition', color: NODE_COLORS.affiliate },
      { id: 'social_media', label: 'Social Media', value: 2100, stage: 'acquisition', color: NODE_COLORS.social_media },
      { id: 'content_marketing', label: 'Content Marketing', value: 1400, stage: 'acquisition', color: NODE_COLORS.content_marketing },
      // Conversion Stage - Two Paths
      { id: 'free_plan', label: 'Free Plan', value: 2800, stage: 'conversion', color: NODE_COLORS.free_plan },
      { id: 'sales_demo', label: 'Sales Demo', value: 650, stage: 'conversion', color: NODE_COLORS.sales_demo },
      { id: 'paid_customers', label: 'Paid Customers', value: 420, stage: 'conversion', color: NODE_COLORS.paid_customers },
      // Customer Experience Stage - ordered to minimize link crossings
      { id: 'expanding', label: 'Expanding', value: 95, stage: 'experience', color: NODE_COLORS.expanding },
      { id: 'active', label: 'Active', value: 280, stage: 'experience', color: NODE_COLORS.active },
      { id: 'churned', label: 'Churned', value: 30, stage: 'experience', color: NODE_COLORS.churned },
      { id: 'at_risk', label: 'At Risk', value: 45, stage: 'experience', color: NODE_COLORS.at_risk },
    ],
    links: [
      // Acquisition → Conversion (Product-Led path via Free Plan)
      { source: 'paid_ads', target: 'free_plan', value: 750 },
      { source: 'seo', target: 'free_plan', value: 1100 },
      { source: 'affiliate', target: 'free_plan', value: 400 },
      { source: 'social_media', target: 'free_plan', value: 350 },
      { source: 'content_marketing', target: 'free_plan', value: 200 },
      // Acquisition → Conversion (Sales-Led path via Demo)
      { source: 'paid_ads', target: 'sales_demo', value: 180 },
      { source: 'seo', target: 'sales_demo', value: 220 },
      { source: 'affiliate', target: 'sales_demo', value: 100 },
      { source: 'social_media', target: 'sales_demo', value: 90 },
      { source: 'content_marketing', target: 'sales_demo', value: 60 },
      // Product-Led Conversion: Free Plan → Paid
      { source: 'free_plan', target: 'paid_customers', value: 280 },
      { source: 'free_plan', target: 'churned', value: 2520 },
      // Sales-Led Conversion: Demo → Paid
      { source: 'sales_demo', target: 'paid_customers', value: 140 },
      { source: 'sales_demo', target: 'churned', value: 510 },
      // Experience flow
      { source: 'paid_customers', target: 'active', value: 280 },
      { source: 'paid_customers', target: 'at_risk', value: 45 },
      { source: 'paid_customers', target: 'churned', value: 30 },
      { source: 'paid_customers', target: 'expanding', value: 65 },
      { source: 'active', target: 'expanding', value: 30 },
      { source: 'at_risk', target: 'churned', value: 20 },
      { source: 'at_risk', target: 'active', value: 25 },
    ],
  }

  const funnelData = data || defaultData

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { width } = containerRef.current.getBoundingClientRect()
        setDimensions({ width: width - 32, height })
      }
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [height])

  // Calculate node positions
  const calculateLayout = () => {
    const { width, height: h } = dimensions
    const padding = { top: 40, right: 20, bottom: 40, left: 20 }
    const nodeWidth = 24
    const nodeGap = 20

    // Group nodes by stage
    const stages: Record<string, SankeyNode[]> = {
      acquisition: [],
      conversion: [],
      experience: [],
    }

    funnelData.nodes.forEach(node => {
      stages[node.stage].push(node)
    })

    // Calculate x positions for each stage
    const stageWidth = (width - padding.left - padding.right) / 3
    const stageX: Record<string, number> = {
      acquisition: padding.left + stageWidth * 0.5 - nodeWidth / 2,
      conversion: padding.left + stageWidth * 1.5 - nodeWidth / 2,
      experience: padding.left + stageWidth * 2.5 - nodeWidth / 2,
    }

    // Calculate y positions and heights for nodes
    const availableHeight = h - padding.top - padding.bottom
    const minNodeHeight = 24

    const nodePositions: Record<string, { x: number; y: number; height: number }> = {}

    Object.entries(stages).forEach(([stage, nodes]) => {
      if (nodes.length === 0) return

      const totalValue = nodes.reduce((sum, n) => sum + n.value, 0)
      const totalGap = (nodes.length - 1) * nodeGap
      const availableNodeHeight = availableHeight - totalGap

      // Calculate initial heights based on value proportion
      const nodeHeights = nodes.map(node => {
        const proportionalHeight = (node.value / totalValue) * availableNodeHeight
        return Math.max(minNodeHeight, proportionalHeight)
      })

      // Check if total height exceeds available space and scale down if needed
      const totalNodeHeight = nodeHeights.reduce((sum, h) => sum + h, 0)
      const totalRequiredHeight = totalNodeHeight + totalGap

      let scaleFactor = 1
      if (totalRequiredHeight > availableHeight) {
        // Scale down to fit
        scaleFactor = (availableHeight - totalGap) / totalNodeHeight
      }

      // Apply scale factor and calculate final heights
      const finalHeights = nodeHeights.map(h => Math.max(minNodeHeight * 0.8, h * scaleFactor))
      const finalTotalHeight = finalHeights.reduce((sum, h) => sum + h, 0) + totalGap

      // Center the nodes vertically within available space
      let currentY = padding.top + Math.max(0, (availableHeight - finalTotalHeight) / 2)

      nodes.forEach((node, i) => {
        nodePositions[node.id] = {
          x: stageX[stage],
          y: currentY,
          height: finalHeights[i],
        }
        currentY += finalHeights[i] + nodeGap
      })
    })

    return { nodePositions, nodeWidth, stageX, padding }
  }

  const { nodePositions, nodeWidth, stageX, padding } = calculateLayout()

  // Generate link paths
  const generateLinkPath = (link: SankeyLink): { path: string; thickness: number } => {
    const sourcePos = nodePositions[link.source]
    const targetPos = nodePositions[link.target]

    if (!sourcePos || !targetPos) return { path: '', thickness: 0 }

    const sourceNode = funnelData.nodes.find(n => n.id === link.source)
    const targetNode = funnelData.nodes.find(n => n.id === link.target)

    if (!sourceNode || !targetNode) return { path: '', thickness: 0 }

    // Calculate link thickness based on value
    const maxLinkValue = Math.max(...funnelData.links.map(l => l.value))
    const linkThickness = Math.max(4, (link.value / maxLinkValue) * 40)

    // Source anchor
    const x1 = sourcePos.x + nodeWidth
    const y1 = sourcePos.y + sourcePos.height / 2

    // Target anchor
    const x2 = targetPos.x
    const y2 = targetPos.y + targetPos.height / 2

    // Control points for bezier curve
    const midX = (x1 + x2) / 2

    return {
      path: `M ${x1} ${y1 - linkThickness / 2}
             C ${midX} ${y1 - linkThickness / 2}, ${midX} ${y2 - linkThickness / 2}, ${x2} ${y2 - linkThickness / 2}
             L ${x2} ${y2 + linkThickness / 2}
             C ${midX} ${y2 + linkThickness / 2}, ${midX} ${y1 + linkThickness / 2}, ${x1} ${y1 + linkThickness / 2}
             Z`,
      thickness: linkThickness,
    }
  }

  // Format number with K/M suffix
  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
    return num.toString()
  }

  // Calculate conversion rate between two nodes
  const getConversionRate = (sourceId: string, targetId: string) => {
    const sourceNode = funnelData.nodes.find(n => n.id === sourceId)
    const targetNode = funnelData.nodes.find(n => n.id === targetId)
    if (!sourceNode || !targetNode || sourceNode.value === 0) return 0
    return (targetNode.value / sourceNode.value) * 100
  }

  return (
    <div className="card !p-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
        <div>
          <h3 className="text-body-strong text-[var(--text)]">Customer Journey Funnel</h3>
          <p className="text-caption text-[var(--text-muted)] mt-0.5">
            Track customers from acquisition through conversion to experience
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Stage Legend */}
          <div className="flex items-center gap-4 text-caption">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ background: 'linear-gradient(135deg, #5273FF, #3A5AE6)' }} />
              <span className="text-[var(--text-muted)]">Acquisition</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ background: 'linear-gradient(135deg, #660CFB, #5209C9)' }} />
              <span className="text-[var(--text-muted)]">Conversion</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ background: 'linear-gradient(135deg, #2BB76C, #229958)' }} />
              <span className="text-[var(--text-muted)]">Experience</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stage Headers */}
      <div className="flex border-b border-[var(--border)]">
        <div className="flex-1 text-center py-3" style={{ background: STAGE_COLORS.acquisition.bg }}>
          <span className="text-body-strong" style={{ color: STAGE_COLORS.acquisition.text }}>
            Acquisition
          </span>
        </div>
        <div className="flex-1 text-center py-3" style={{ background: STAGE_COLORS.conversion.bg }}>
          <span className="text-body-strong" style={{ color: STAGE_COLORS.conversion.text }}>
            Conversion
          </span>
        </div>
        <div className="flex-1 text-center py-3" style={{ background: STAGE_COLORS.experience.bg }}>
          <span className="text-body-strong" style={{ color: STAGE_COLORS.experience.text }}>
            Customer Experience
          </span>
        </div>
      </div>

      {/* Sankey Chart */}
      <div ref={containerRef} className="p-4" style={{ background: 'var(--surface)' }}>
        <svg width={dimensions.width} height={dimensions.height} className="overflow-visible">
          <defs>
            {/* Gradients for links */}
            {funnelData.links.map(link => {
              const sourceNode = funnelData.nodes.find(n => n.id === link.source)
              const targetNode = funnelData.nodes.find(n => n.id === link.target)
              return (
                <linearGradient
                  key={`gradient-${link.source}-${link.target}`}
                  id={`link-gradient-${link.source}-${link.target}`}
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="0%"
                >
                  <stop offset="0%" stopColor={sourceNode?.color || '#999'} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={targetNode?.color || '#999'} stopOpacity={0.5} />
                </linearGradient>
              )
            })}

            {/* Drop shadow filter */}
            <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.15" />
            </filter>

            {/* Glow filter for hover */}
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Stage dividers */}
          <line
            x1={(stageX.acquisition + stageX.conversion) / 2 + nodeWidth / 2}
            y1={padding.top - 10}
            x2={(stageX.acquisition + stageX.conversion) / 2 + nodeWidth / 2}
            y2={dimensions.height - padding.bottom + 10}
            stroke="var(--border)"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
          <line
            x1={(stageX.conversion + stageX.experience) / 2 + nodeWidth / 2}
            y1={padding.top - 10}
            x2={(stageX.conversion + stageX.experience) / 2 + nodeWidth / 2}
            y2={dimensions.height - padding.bottom + 10}
            stroke="var(--border)"
            strokeWidth="1"
            strokeDasharray="4 4"
          />

          {/* Links */}
          <g className="links">
            {funnelData.links.map(link => {
              const { path } = generateLinkPath(link)
              const linkId = `${link.source}-${link.target}`
              const isHovered = hoveredLink === linkId
              const isRelated = hoveredNode === link.source || hoveredNode === link.target

              return (
                <g key={linkId}>
                  <path
                    d={path}
                    fill={`url(#link-gradient-${link.source}-${link.target})`}
                    opacity={isHovered ? 0.9 : isRelated ? 0.7 : hoveredNode ? 0.2 : 0.5}
                    className="transition-opacity duration-200 cursor-pointer"
                    onMouseEnter={() => setHoveredLink(linkId)}
                    onMouseLeave={() => setHoveredLink(null)}
                    filter={isHovered ? 'url(#glow)' : undefined}
                  />
                </g>
              )
            })}
          </g>

          {/* Nodes */}
          <g className="nodes">
            {funnelData.nodes.map(node => {
              const pos = nodePositions[node.id]
              if (!pos) return null

              const isHovered = hoveredNode === node.id
              const hasConnections =
                funnelData.links.some(l => l.source === hoveredNode && l.target === node.id) ||
                funnelData.links.some(l => l.target === hoveredNode && l.source === node.id)
              const shouldDim = hoveredNode && !isHovered && !hasConnections

              return (
                <g
                  key={node.id}
                  className="cursor-pointer transition-transform duration-200"
                  onMouseEnter={() => setHoveredNode(node.id)}
                  onMouseLeave={() => setHoveredNode(null)}
                  style={{ transform: isHovered ? 'scale(1.02)' : 'scale(1)', transformOrigin: `${pos.x + nodeWidth / 2}px ${pos.y + pos.height / 2}px` }}
                >
                  {/* Node rectangle */}
                  <rect
                    x={pos.x}
                    y={pos.y}
                    width={nodeWidth}
                    height={pos.height}
                    rx={6}
                    fill={node.color}
                    opacity={shouldDim ? 0.3 : 1}
                    filter={isHovered ? 'url(#shadow)' : undefined}
                    className="transition-all duration-200"
                  />

                  {/* Node label */}
                  <text
                    x={pos.x + nodeWidth + 12}
                    y={pos.y + pos.height / 2}
                    dy="0.35em"
                    className="text-caption font-medium transition-opacity duration-200"
                    fill={shouldDim ? 'var(--text-subtle)' : 'var(--text)'}
                  >
                    {node.label}
                  </text>

                  {/* Value label */}
                  <text
                    x={pos.x + nodeWidth + 12}
                    y={pos.y + pos.height / 2 + 16}
                    dy="0.35em"
                    className="text-caption transition-opacity duration-200"
                    fill={shouldDim ? 'var(--text-subtle)' : 'var(--text-muted)'}
                  >
                    {formatNumber(node.value)}
                  </text>
                </g>
              )
            })}
          </g>
        </svg>
      </div>

      {/* Key Metrics Footer */}
      <div className="grid grid-cols-4 gap-4 p-4 border-t border-[var(--border)] bg-[var(--surface-muted)]">
        <div className="text-center">
          <p className="text-caption text-[var(--text-muted)]">Free → Paid</p>
          <p className="text-body-strong text-[var(--primary)]">
            {getConversionRate('free_plan', 'paid_customers').toFixed(1)}%
          </p>
          <p className="text-caption text-[var(--text-subtle)]">Product-Led</p>
        </div>
        <div className="text-center">
          <p className="text-caption text-[var(--text-muted)]">Demo → Paid</p>
          <p className="text-body-strong text-[var(--secondary)]">
            {getConversionRate('sales_demo', 'paid_customers').toFixed(1)}%
          </p>
          <p className="text-caption text-[var(--text-subtle)]">Sales-Led</p>
        </div>
        <div className="text-center">
          <p className="text-caption text-[var(--text-muted)]">Retention Rate</p>
          <p className="text-body-strong text-[var(--success-text)]">
            {((funnelData.nodes.find(n => n.id === 'active')?.value || 0) /
              (funnelData.nodes.find(n => n.id === 'paid_customers')?.value || 1) * 100).toFixed(1)}%
          </p>
        </div>
        <div className="text-center">
          <p className="text-caption text-[var(--text-muted)]">Expansion Rate</p>
          <p className="text-body-strong text-[var(--success-text)]">
            {((funnelData.nodes.find(n => n.id === 'expanding')?.value || 0) /
              (funnelData.nodes.find(n => n.id === 'active')?.value || 1) * 100).toFixed(1)}%
          </p>
        </div>
      </div>
    </div>
  )
}
