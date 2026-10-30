package com.zhihuminus.richtext

import org.junit.Assert.*
import org.junit.Test

class TextRangeValidationTest {
  @Test fun offsetsRejectCoercionAndSurrogateSplits() {
    val text = "甲😀\ufffc\n乙"
    assertEquals(TextRange(1, 3), richTextRange(1, 3, text))
    for (offset in listOf<Any?>(null, "1", true, 1.5, -1, Double.NaN, Double.POSITIVE_INFINITY, Long.MAX_VALUE)) {
      assertNull(richTextRange(offset, 3, text))
    }
    assertNull(richTextRange(1, 2, text))
    assertNull(richTextRange(2, 3, text))
    assertNull(richTextRange(0, 7, text))
    assertNull(richTextRange(3, 3, text))
    assertEquals(TextRange(1, 3), richTextRange(1.0, 3.0, text))
  }

  @Test fun copyReplacesOnlySelectedObjectReplacementCharacters() {
    val text = "甲😀\ufffc\n乙"
    val slots = listOf(RichTextCopySlot(TextRange(3, 4), "x²"), RichTextCopySlot(TextRange(0, 1), "bad"), RichTextCopySlot(TextRange(99, 100), "bad"))
    assertEquals("甲😀x²\n乙", richTextSelectionText(text, 0, 6, slots))
    assertEquals("😀", richTextSelectionText(text, 1, 3, slots))
    assertEquals("x²", richTextSelectionText(text, 3, 4, slots))
    assertNull(richTextSelectionText(text, 2, 4, slots))
    assertNull(richTextSelectionText(text, -1, 4, slots))
  }

  @Test fun emptyLinesRequireACompleteMarkedAnchorParagraph() {
    val text = "甲\u200b\n\u200b\n\ufffc\n\u200b"
    assertEquals(3, richTextEmptyLineAnchor(3, 5, text, true))
    assertEquals(7, richTextEmptyLineAnchor(7, 8, text, true))
    for (flag in listOf<Any?>(null, false, 1, "true")) {
      assertNull(richTextEmptyLineAnchor(3, 5, text, flag))
    }
    assertNull(richTextEmptyLineAnchor("3", 5, text, true))
    assertNull(richTextEmptyLineAnchor(3, 4.5, text, true))
    assertNull(richTextEmptyLineAnchor(0, 3, text, true))
    assertNull(richTextEmptyLineAnchor(1, 3, text, true))
    assertNull(richTextEmptyLineAnchor(3, 4, text, true))
    assertNull(richTextEmptyLineAnchor(3, 8, text, true))
    assertNull(richTextEmptyLineAnchor(0, 2, "\u200b\u200b", true))
  }

  @Test fun copyRemovesOnlyTrustedEmptyLineAnchorsAndPreservesNewlines() {
    val text = "甲\u200b\n\u200b\n\ufffc\n\u200b"
    val slots = listOf(RichTextCopySlot(TextRange(5, 6), "x²"))
    val emptyLines = listOf(TextRange(3, 5), TextRange(7, 8), TextRange(1, 3))
    assertEquals("甲\u200b\n\nx²\n", richTextSelectionText(text, 0, 8, slots, emptyLines))
    assertEquals("", richTextSelectionText(text, 3, 4, slots, emptyLines))
    assertEquals("\n", richTextSelectionText(text, 3, 5, slots, emptyLines))
    assertEquals("\n", richTextSelectionText(text, 4, 5, slots, emptyLines))
    assertEquals("\u200b", richTextSelectionText(text, 1, 2, slots, emptyLines))
    assertEquals("\u200b", richTextSelectionText(text, 3, 4, slots))
  }
}
