/**
 * Text marks (a squiggle that stands for a line of text) now live in @s2c/ink,
 * so the overlay can use the same reading to show where a note will land.
 */
export {
  measureTextMark, textMarkReason, isTextMark, isLevelLine, fontForPitch, textStacks, LONE_HEADING_INK,
  type TextMarkMeasure, type TextStack,
} from '@s2c/ink'
