import { describe, expect, it } from 'vitest'
import { pairList, pairNotes, pairRowsBrief, verifyPairRows } from '../src/pairrows.js'
import { listItems, commaItems } from '../src/rowwords.js'
import { rowData } from '../src/rowdata.js'

const NOTE = 'Pet Biscuit, Date Tue 15 Dec, Time 10:30, Vet Dr. Okafor, Fee €45'
// round 39 e4 vet booking, as drawn in n127: the tall Summary panel at the right, the note typed inside it
const panel = { x: 1020, y: 145, w: 360, h: 545 }
const acts = [{ kind: 'add', notes: ['Summary', NOTE], region: panel }]
const n = (x: number, y: number, w: number, h: number, text: string) => ({ rect: { x, y, w, h }, text })
const rowsAt = (top: number, pitch: number, stacked = false) => [
  ['Pet', 'Biscuit'], ['Date', 'Tue 15 Dec'], ['Time', '10:30'], ['Vet', 'Dr. Okafor'], ['Fee', '€45'],
].flatMap(([l, v], k) => stacked
  ? [n(1040, top + k * pitch, 30, 14, l!), n(1040, top + k * pitch + 18, 70, 16, v!)]
  : [n(1040, top + k * pitch, 30, 14, l!), n(1290, top + k * pitch, 70, 16, v!)])

describe('n133 a label-value note is a panel of rows', () => {
  it('reads the summary note as five pairs, labels and values apart', () => {
    expect(pairList(NOTE)).toEqual([
      { label: 'Pet', value: 'Biscuit' }, { label: 'Date', value: 'Tue 15 Dec' }, { label: 'Time', value: '10:30' },
      { label: 'Vet', value: 'Dr. Okafor' }, { label: 'Fee', value: '€45' },
    ])
    expect(pairList('Due date Fri 3 Nov, Total $120, Status Paid')?.[0]).toEqual({ label: 'Due date', value: 'Fri 3 Nov' })
  })

  it('leaves other lists alone: a day row, legends, look words, plain copy', () => {
    expect(pairList('Mon 14, Tue 15, Wed 16, Thu 17, Fri 18')).toBeNull()
    expect(commaItems('Mon 14, Tue 15, Wed 16, Thu 17, Fri 18')).not.toBeNull()
    expect(pairList('Rent $1,120; Food $700; Travel $520')).toBeNull()
    expect(listItems('Rent $1,120; Food $700; Travel $520')).not.toBeNull()
    expect(pairList('big bold headline, dark navy, centred')).toBeNull()
    expect(pairList('Home, About, Contact')).toBeNull()
    expect(pairList('Fast shipping, free returns, secure checkout')).toBeNull()
    expect(pairList('12 time slots 09:00-16:30, 4 a row; 10:30 dark green')).toBeNull()
    // and the row-data reader still gives no rows for it (the two never both claim it)
    expect(rowData(NOTE)).toBeNull()
  })

  it('takes the panel it was typed on; a short region is no panel', () => {
    expect(pairNotes(acts)[0]!.panel).toEqual(panel)
    expect(pairNotes([{ notes: [NOTE], region: { x: 0, y: 0, w: 300, h: 40 } }])[0]!.panel).toBeNull()
    expect(pairNotes([], [NOTE])).toHaveLength(1)
  })

  it('tells the build one line per pair from just under the heading', () => {
    const b = pairRowsBrief(acts)
    expect(b).toContain('LABEL-VALUE ROWS')
    expect(b).toContain('row 2 = "Date" left | "Tue 15 Dec" right')
    expect(b).toContain('no lower than y 255')
    expect(b).toMatch(/Never stack the value under its label/)
    expect(pairRowsBrief([{ notes: ['Mon 14, Tue 15, Wed 16'] }])).toBe('')
  })

  it('passes rows on one line near the panel top', () => {
    const v = verifyPairRows(acts, [], { nodes: [n(1040, 160, 90, 20, 'Summary'), ...rowsAt(200, 40)] })
    expect(v.satisfied).toBe(true)
    expect(v.unverifiable).toBeFalsy()
  })

  it('fails a value stacked under its label (n131 try 3)', () => {
    const v = verifyPairRows(acts, [], { nodes: rowsAt(200, 50, true) })
    expect(v.satisfied).toBe(false)
    expect(v.reason).toMatch(/"Biscuit" sits 19px under its label "Pet"/)
  })

  it('fails rows pushed low or spread to fill the panel', () => {
    const low = verifyPairRows(acts, [], { nodes: rowsAt(420, 40) })
    expect(low.satisfied).toBe(false)
    expect(low.reason).toMatch(/first row "Pet" starts at y 420/)
    const spread = verifyPairRows(acts, [], { nodes: rowsAt(200, 95) })
    expect(spread.satisfied).toBe(false)
    expect(spread.reason).toMatch(/spread out \(95px/)
  })

  it('fails a pair run together in one text and a missing pair', () => {
    const nodes = rowsAt(200, 40).filter((x) => x.text !== 'Fee' && x.text !== '€45')
    const joined = verifyPairRows(acts, [], { nodes: [...nodes, n(1040, 360, 200, 16, 'Fee €45')] })
    expect(joined.reason).toMatch(/runs the label and value of "Fee €45" together/)
    const gone = verifyPairRows(acts, [], { nodes })
    expect(gone.reason).toMatch(/"Fee €45" is not on the page/)
  })

  it('cannot judge without such a note or a full snapshot', () => {
    expect(verifyPairRows([{ notes: ['Summary'] }], [], { nodes: rowsAt(200, 40) }).unverifiable).toBe(true)
    expect(verifyPairRows(acts, [], { nodes: [], truncated: true }).unverifiable).toBe(true)
  })
})
