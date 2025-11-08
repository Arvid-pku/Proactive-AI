# 🔧 Graph Display Troubleshooting

## 🐛 **Issue: Graph Appears Then Disappears**

### ✅ **FIXED in Latest Build!**

**Problem:** The Desmos calculator was being destroyed and recreated on every render, causing the graph to flash and disappear.

**Solution:** Separated initialization from equation updates - now the calculator stays stable!

---

## 🚀 **How to Get the Fix**

### **Step 1: Reload Extension**
```
1. Open: chrome://extensions/
2. Find: Proactive AI Assistant
3. Click: Refresh icon 🔄
4. Status should show: "Service worker (Active)"
```

### **Step 2: Reload Web Pages**
```
1. Go to any open tabs
2. Press: Ctrl+Shift+R (hard refresh)
3. Or: F5 (normal refresh)
```

### **Step 3: Test Graph**
```
1. Select: y = x^2
2. Click: "Graph Equation"
3. Graph should appear and STAY visible!
```

---

## 🔍 **If Graph Still Disappears**

### **Check Console Logs:**

**1. Open DevTools:**
- Press `F12`
- Go to Console tab

**2. Look for these messages:**
```
✅ "Desmos API loaded"
✅ "Initializing Desmos calculator"
✅ "Desmos calculator initialized successfully"
✅ "Setting equation: y=x^2"
✅ "Equation set successfully"
```

**3. If you see errors:**
- Screenshot the error
- Check which step failed

---

## 🛠️ **Common Issues & Fixes**

### **Issue 1: "Loading graphing calculator..." Forever**

**Cause:** Desmos API not loading

**Fix:**
1. Check internet connection
2. Disable ad blockers temporarily
3. Reload extension
4. Try on different website

---

### **Issue 2: Blank White Rectangle**

**Cause:** Calculator initialized but equation not set

**Fix:**
1. Check console for "Setting equation" log
2. Try simpler equation: `y=x`
3. Make sure equation has = sign
4. Reload and try again

---

### **Issue 3: Graph Flickers**

**Cause:** Multiple re-renders (should be fixed now)

**Fix:**
1. Make sure you have latest build
2. Check `npm run build` completed
3. Reload extension fresh
4. Clear browser cache if needed

---

### **Issue 4: "Graph Equation" Tool Not Appearing**

**Cause:** Content not detected as math

**Fix:**
1. Select clear equation: `y=x^2`
2. Include = sign
3. Wait 1 second after selection
4. Try on math-heavy website (Khan Academy)

---

### **Issue 5: Wrong Graph Displayed**

**Cause:** Equation parsing issue

**Fix:**
1. Check console for "Parsed equation"
2. See what AI converted it to
3. Try simpler notation
4. Use standard math notation (x^2 not x²)

---

## 📊 **Testing Checklist**

Use these to verify everything works:

### **✅ Test 1: Simple Linear**
```
Select: y = 2x + 3
Expected: Straight line, slope 2, y-intercept 3
Should: Stay visible, zoom/pan works
```

### **✅ Test 2: Quadratic**
```
Select: y = x^2 - 4x + 3
Expected: Parabola, vertex at (2, -1)
Should: Can zoom to see vertex
```

### **✅ Test 3: Trig Function**
```
Select: y = sin(x)
Expected: Sine wave
Should: Pan to see multiple cycles
```

### **✅ Test 4: Circle**
```
Select: x^2 + y^2 = 25
Expected: Circle, radius 5
Should: Looks round when zoomed
```

### **✅ Test 5: Multiple Equations**
```
Select: y=x^2; y=2x+1
Expected: Parabola + line, different colors
Should: Both visible simultaneously
```

---

## 🔬 **Advanced Debugging**

### **Check Service Worker:**

1. Go to `chrome://extensions/`
2. Click "Service Worker" under extension
3. Console opens
4. Look for errors
5. Check OpenAI API calls

### **Check Page Console:**

1. On webpage, press `F12`
2. Go to Console tab
3. Look for Proactive AI logs
4. Check for JavaScript errors

### **Check Network:**

1. F12 → Network tab
2. Filter: desmos.com
3. Should see: calculator.js loaded
4. Check: Status 200 (success)

---

## 💡 **What Should Happen (Step by Step)**

### **Normal Flow:**

1. **You select equation** → Content script detects
2. **AI analyzes** → Suggests "Graph Equation"
3. **You click tool** → Background worker parses
4. **OpenAI converts** → To Desmos format
5. **Result sent** → UI receives type: 'graph'
6. **Desmos loads** → (first time only, ~1 sec)
7. **Calculator init** → White rectangle appears
8. **Equation set** → Graph renders
9. **Graph stays** → Can zoom/pan forever!

### **Console Should Show:**

```
1. "Proactive AI Assistant content script loaded"
2. "Getting tool suggestions..."
3. "Executing tool: graph_equation"
4. "Parsing equation for Desmos"
5. "Calling OpenAI API..."
6. "Desmos equation: y=x^2"
7. "Desmos API loaded"
8. "Initializing Desmos calculator"
9. "Desmos calculator initialized successfully"
10. "Setting equation: y=x^2"
11. "Equation set successfully"
```

---

## 🆘 **Still Having Issues?**

### **Quick Fixes to Try:**

1. **Full Reload:**
   ```
   1. Remove extension
   2. Close Chrome
   3. Reopen Chrome
   4. Load extension fresh
   ```

2. **Clear Everything:**
   ```
   1. Delete dist/ folder
   2. Run: npm run build
   3. Reload extension
   4. Test again
   ```

3. **Check Basics:**
   ```
   ✓ Internet connected?
   ✓ Chrome up to date?
   ✓ Extension enabled?
   ✓ API key configured?
   ```

---

## 📝 **Report Issues**

If nothing works, provide:

1. **Chrome version:** `chrome://version/`
2. **Extension version:** Check manifest.json
3. **Console logs:** Copy/paste errors
4. **Test equation:** What did you select?
5. **Steps taken:** What did you try?
6. **Expected:** What should happen?
7. **Actual:** What actually happened?

---

## ✅ **Success Indicators**

You know it's working when:

- ✅ Graph appears in <2 seconds
- ✅ Graph STAYS visible
- ✅ Can zoom with mouse wheel
- ✅ Can pan by dragging
- ✅ Equation shows above graph
- ✅ Back button works
- ✅ Multiple equations show different colors
- ✅ No console errors

---

## 🎉 **It's Working!**

Once you see a stable graph that you can zoom/pan:

**Try these cool things:**

1. **Zoom to interesting points:**
   - Find vertex of parabola
   - See where curves intersect
   - Explore behavior at infinity

2. **Multiple equations:**
   - Compare functions
   - Find intersections visually
   - Study transformations

3. **Different equation types:**
   - Polynomials
   - Trig functions
   - Circles and ellipses
   - Exponentials

---

**Happy Graphing!** 📊✨

*If graph still disappears after following this guide, there may be a deeper issue. Please share console logs!*

