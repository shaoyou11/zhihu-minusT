package com.zhihuminus.selectionprobe;

import android.app.Activity;
import android.os.Bundle;
import android.os.SystemClock;
import android.text.Selection;
import android.text.Spannable;
import android.util.Log;
import android.util.TypedValue;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.TextView;
import com.zhihuminus.richtext.FlowTextView;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/** Runs the production FlowTextView against real Android Editor behavior. */
public final class AndroidTextSelectionActivity extends Activity {
  private int assertions;
  private int failures;
  private boolean baselineSelectable;

  private TextView prepare(TextView text) {
    text.setLayoutParams(new ViewGroup.LayoutParams(600, ViewGroup.LayoutParams.WRAP_CONTENT));
    text.setPadding(0, 0, 0, 0);
    text.setTextSize(TypedValue.COMPLEX_UNIT_PX, 24);
    text.setTextIsSelectable(true);
    text.setText("Synthetic selection preserves a cached layout and its text spans.");
    text.measure(View.MeasureSpec.makeMeasureSpec(600, View.MeasureSpec.EXACTLY),
        View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED));
    text.layout(0, 0, 600, text.getMeasuredHeight());
    return text;
  }

  private final class Host extends ViewGroup {
    final TextView text;
    Host(TextView text) {
      super(AndroidTextSelectionActivity.this);
      this.text = text;
      addView(text);
    }
    @Override protected void onMeasure(int width, int height) {
      // Keep the pre-window TextView Layout, as RichTextView's measured flows do.
      setMeasuredDimension(View.MeasureSpec.getSize(width), 160);
    }
    @Override protected void onLayout(boolean changed, int l, int t, int r, int b) {
      text.layout(0, 0, 600, text.getMeasuredHeight());
    }
  }

  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    LinearLayout column = new LinearLayout(this);
    column.setPadding(20, 160, 20, 0);
    column.setOrientation(LinearLayout.VERTICAL);
    TextView original = prepare(new TextView(this));
    TextView repaired = prepare(new FlowTextView(this));
    TextView preserved = prepare(new FlowTextView(this));
    FlowTextView longPress = new FlowTextView(this);
    prepare(longPress);
    longPress.setSuppressDoubleTapSelection(true);
    TextView disabled = prepare(new FlowTextView(this));
    disabled.setTextIsSelectable(false);
    preserved.setCursorVisible(false);
    Selection.setSelection((Spannable) preserved.getText(), 0, 9);
    Host preservedHost = new Host(preserved);
    column.addView(new Host(original));
    column.addView(new Host(repaired));
    column.addView(preservedHost);
    column.addView(new Host(longPress));
    column.addView(new Host(disabled));
    setContentView(column);
    column.postDelayed(() -> {
      baselineSelectable = probe(original);
      check(probe(repaired), "premeasured production flow supports selection");
      check(preserved.getSelectionStart() == 0 && preserved.getSelectionEnd() == 9,
          "initial attachment retains an existing selection");
      CharSequence source = preserved.getText();
      column.removeView(preservedHost);
      column.addView(preservedHost);
      check(preserved.getSelectionStart() == 0 && preserved.getSelectionEnd() == 9,
          "reattachment retains the selection");
      check(preserved.getText() == source, "reattachment retains text and spans");
      check(!preserved.isCursorVisible(), "reattachment preserves the hidden cursor preference");
      check(!disabled.isTextSelectable(), "attachment does not enable a disabled selection");
      long downTime = SystemClock.uptimeMillis();
      touch(longPress, downTime, MotionEvent.ACTION_DOWN);
      column.postDelayed(() -> {
        check(longPress.hasSelection(), "double-tap suppression still allows a native long press");
        touch(longPress, downTime, MotionEvent.ACTION_UP);
        check(longPress.hasSelection(), "long-press release retains the selection");
        finishResults();
      }, 800);
    }, 800);
  }

  private boolean probe(TextView text) {
    long downTime = SystemClock.uptimeMillis();
    touch(text, downTime, MotionEvent.ACTION_DOWN);
    boolean selected = text.performLongClick() && text.hasSelection();
    touch(text, downTime, MotionEvent.ACTION_UP);
    return selected;
  }

  private void touch(TextView text, long downTime, int action) {
    MotionEvent.PointerProperties pointer = new MotionEvent.PointerProperties();
    pointer.id = 0;
    pointer.toolType = MotionEvent.TOOL_TYPE_FINGER;
    MotionEvent.PointerCoords coordinates = new MotionEvent.PointerCoords();
    coordinates.x = 40;
    coordinates.y = 16;
    coordinates.pressure = 1;
    coordinates.size = 1;
    MotionEvent event = MotionEvent.obtain(downTime, SystemClock.uptimeMillis(), action, 1,
        new MotionEvent.PointerProperties[] {pointer}, new MotionEvent.PointerCoords[] {coordinates},
        0, 0, 1, 1, 0, 0, InputDevice.SOURCE_TOUCHSCREEN, 0);
    text.onTouchEvent(event);
    event.recycle();
  }

  private void check(boolean success, String name) {
    assertions++;
    if (!success) failures++;
    Log.i("ZhihuSelectionProbe", (success ? "PASS: " : "FAIL: ") + name);
  }

  private void finishResults() {
    try {
      JSONObject result = new JSONObject();
      result.put("assertions", assertions);
      result.put("failures", failures);
      result.put("baselineSelectable", baselineSelectable);
      try (FileOutputStream output = new FileOutputStream(new File(getFilesDir(), "result.json"))) {
        output.write(result.toString().getBytes(StandardCharsets.UTF_8));
      }
      Log.i("ZhihuSelectionProbe", result.toString());
    } catch (Exception error) {
      throw new IllegalStateException("Unable to write synthetic test results", error);
    }
  }
}
