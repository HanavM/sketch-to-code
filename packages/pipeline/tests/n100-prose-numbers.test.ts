import { describe, expect, it } from 'vitest'
import { proseNumber, statOf } from '../src/statcard.js'

describe('n100: a number among words is copy, never a stat card', () => {
  it('round 37 calendar events and chat bubbles are not stats', () => {
    expect(statOf(['Standup 9:00 – 9:45'])).toBeNull()
    expect(statOf(['Design review 10:00 – 11:45'])).toBeNull()
    expect(statOf(['Lunch with Sam 12:00 – 1:00'])).toBeNull()
    expect(statOf(['Mia · 2:14 pm above; Copy is final. Can someone check the pricing page on mobile?'])).toBeNull()
    expect(statOf(['Great. Shipping at 5 then.'])).toBeNull()
    expect(statOf(['Ravi · 2:20 pm above; Android is good too. One typo in the footer, fixed.'])).toBeNull()
    expect(statOf(['#launch / Mia: shipping at 5'])).toBeNull()
  })
  it('prose numbers: times, ranges, sentences, number mid-phrase', () => {
    expect(proseNumber('Priya Shah, to me · 9:14 AM')).toBe(true)
    expect(proseNumber('June 12–14 · Riverside Park')).toBe(true)
    expect(proseNumber('Spend in 40 currencies with no fees, and split the bill.')).toBe(true)
    expect(proseNumber('Step 2 of 3 · you can change this later, grey')).toBe(true)
    expect(proseNumber('no number here')).toBe(false)
  })
  it('real stats stay stats', () => {
    expect(statOf(['Income 3,800'])).toEqual({ value: '3,800', label: 'Income' })
    expect(statOf(['6 big, on loan grey'])).toEqual({ value: '6', label: 'on loan' })
    expect(statOf(['Total lifted, grey', '12480 kg, huge bold white'])).toEqual({ value: '12480 kg', label: 'Total lifted', labelAbove: true })
    expect(statOf(['Budget left 18%'])).toEqual({ value: '18%', label: 'Budget left' })
    expect(statOf(['Biggest day Oct 3'])).toEqual({ value: 'Oct 3', label: 'Biggest day' })
    expect(statOf(['Revenue $22.8k +9%'])).not.toBeNull()
    expect(statOf(['Storage, 62 of 100 GB'])).not.toBeNull()
    expect(statOf(['Avg response, big number 2:14'])).not.toBeNull()
  })
})
