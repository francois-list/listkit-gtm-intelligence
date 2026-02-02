'use client'

import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import CustomerAIPanel from '@/components/CustomerAIPanel'
import type { Customer } from '@/lib/supabase'

interface CustomerAIAnalyzeButtonProps {
  customer: Customer
}

export default function CustomerAIAnalyzeButton({ customer }: CustomerAIAnalyzeButtonProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="btn-primary btn-sm flex items-center gap-2"
      >
        <Sparkles className="w-4 h-4" />
        Analyze with AI
      </button>

      {isOpen && (
        <CustomerAIPanel
          customer={customer}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  )
}
