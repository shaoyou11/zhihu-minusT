package com.zhihuminus.richtext

internal data class TextRange(val start: Int, val end: Int) {
  fun intersects(startOffset: Int, endOffset: Int) = start < endOffset && end > startOffset
}

/** JSONObject.optInt coerces strings and truncates fractions; bridge offsets must not. */
internal fun richTextNumber(value: Any?, fallback: Double): Double =
  (value as? Number)?.toDouble()?.takeIf { it.isFinite() } ?: fallback

internal fun richTextOffset(value: Any?): Int? {
  val number = richTextNumber(value, Double.NaN)
  return number.takeIf { it.isFinite() && it >= 0 && it <= Int.MAX_VALUE && it % 1.0 == 0.0 }?.toInt()
}

internal fun validRichTextBoundary(offset: Int, text: String): Boolean =
  offset >= 0 && offset <= text.length &&
    (offset == 0 || offset == text.length || !Character.isHighSurrogate(text[offset - 1]) || !Character.isLowSurrogate(text[offset]))

internal fun richTextRange(start: Any?, end: Any?, text: String): TextRange? {
  val lower = richTextOffset(start) ?: return null
  val upper = richTextOffset(end) ?: return null
  return if (upper > lower && validRichTextBoundary(lower, text) && validRichTextBoundary(upper, text)) TextRange(lower, upper) else null
}

internal data class RichTextCopySlot(val range: TextRange, val text: String)

/** Only compiler-owned, complete empty paragraphs may shrink or hide their anchor on copy. */
internal fun richTextEmptyLineAnchor(start: Any?, end: Any?, text: String, emptyLine: Any?): Int? {
  if (emptyLine !is Boolean || !emptyLine) return null
  val range = richTextRange(start, end, text) ?: return null
  if (range.start > 0 && text[range.start - 1] != '\n') return null
  if (range.end < text.length && text[range.end - 1] != '\n') return null
  val length = range.end - range.start
  return range.start.takeIf {
    text[it] == '\u200b' && (length == 1 || (length == 2 && text[it + 1] == '\n'))
  }
}

internal fun richTextSelectionText(
  text: String,
  start: Int,
  end: Int,
  slots: List<RichTextCopySlot>,
  emptyLines: List<TextRange> = emptyList()
): String? {
  val selection = richTextRange(start, end, text) ?: return null
  val replacements = slots.filter { slot ->
    val range = richTextRange(slot.range.start, slot.range.end, text)
    range != null && range.end - range.start == 1 && text[range.start] == '\ufffc'
  }.toMutableList()
  for (range in emptyLines) {
    val anchor = richTextEmptyLineAnchor(range.start, range.end, text, true) ?: continue
    replacements.add(RichTextCopySlot(TextRange(anchor, anchor + 1), ""))
  }
  val result = StringBuilder()
  var cursor = selection.start
  for (slot in replacements.sortedBy { it.range.start }) {
    val range = slot.range
    if (range.start < cursor || range.end > selection.end) continue
    result.append(text.substring(cursor, range.start)).append(slot.text)
    cursor = range.end
  }
  return result.append(text.substring(cursor, selection.end)).toString()
}
