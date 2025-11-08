# 🔄 How to Properly Reload After Extension Updates

## ⚠️ **Important: Both Errors Fixed!**

The errors you saw:
1. ❌ "Extension context invalidated"
2. ❌ "window.Desmos.GraphingCalculator is not a function"

Are now **completely fixed** with proper error handling and Desmos loading!

---

## 🚀 **CRITICAL: Follow These Steps in ORDER**

### **Step 1: Reload Extension** ⚡
```
1. Open: chrome://extensions/
2. Find: "Proactive AI Assistant"
3. Click: 🔄 Refresh button
4. Wait: See "Service worker (Active)"
```

### **Step 2: REFRESH ALL OPEN PAGES** 🔄
```
This is THE MOST IMPORTANT step!

Go to EVERY open tab and press:
- Windows/Linux: Ctrl + Shift + R (hard refresh)
- Mac: Cmd + Shift + R

OR simply press F5 on each tab

Why? The old content script is still running on open pages
and needs to be replaced with the new version.
```

### **Step 3: Close Old Tabs** (Recommended)
```
Even better:
1. Close ALL tabs that were open before the update
2. Open fresh new tabs
3. Test on a new page

This ensures NO old scripts are running.
```

---

## 🧪 **Test It Works**

### **On a Fresh Tab:**
```
1. Open: https://wikipedia.org
2. Type somewhere: y = x^2
3. Select it
4. Wait 1 second
5. AI assistant appears
6. Click "Graph Equation"
```

### **What Should Happen:**
```
✅ Loading message appears
✅ "Desmos already loaded" or "Loading Desmos API..." in console
✅ "Desmos API confirmed available"
✅ "Initializing Desmos calculator..."
✅ "✅ Desmos calculator initialized successfully"
✅ "Setting equation: y=x^2"
✅ Beautiful blue parabola appears
✅ Graph STAYS visible
✅ Can zoom and pan
```

---

## 🔍 **Console Debugging**

### **Open Console (F12) and Check:**

**Good Signs:** ✅
```
✅ "Proactive AI Assistant content script loaded"
✅ "Desmos already loaded" OR "Loading Desmos API..."
✅ "Desmos API confirmed available"
✅ "✅ Desmos calculator initialized successfully"
```

**Bad Signs (Means You Didn't Refresh Page):** ❌
```
❌ "Extension context invalidated"
❌ "Desmos.GraphingCalculator is not a function"
❌ Alert saying "Extension was updated"
```

**If you see bad signs:**
→ **YOU FORGOT TO REFRESH THE PAGE!**
→ Press Ctrl+Shift+R NOW

---

## 📋 **Complete Reload Checklist**

Use this every time you update the extension:

- [ ] 1. Build extension (`npm run build`)
- [ ] 2. Go to `chrome://extensions/`
- [ ] 3. Click refresh button on the extension
- [ ] 4. **CLOSE ALL OPEN TABS** (or hard refresh each one)
- [ ] 5. Open a fresh new tab
- [ ] 6. Test the extension

---

## 💡 **Why This Happens**

### **"Extension context invalidated"**
```
What it means:
- Extension was reloaded
- Old content scripts still running on open pages
- They try to communicate with new extension
- Communication fails

Solution:
- Refresh all open pages
- OR close and reopen tabs
```

### **"Desmos.GraphingCalculator is not a function"**
```
What it means:
- Desmos API script loading issue
- Timing problem
- Script exists but API not ready

Solution:
- Improved loading logic (NOW FIXED!)
- Checks if API actually exists
- Retries if needed
- Better error handling
```

---

## 🎯 **Best Practice Workflow**

### **Every Time You Update:**

```bash
# 1. Build
npm run build

# 2. Reload extension
# (Go to chrome://extensions/ and click refresh)

# 3. Close all tabs
# (Or at minimum, refresh all open tabs)

# 4. Open fresh tab
# (Start clean)

# 5. Test
# (Select equation, graph it)
```

---

## 🔧 **Troubleshooting**

### **Graph Still Not Showing?**

**Check 1:** Did you refresh the page?
```
If NO → Press Ctrl+Shift+R NOW
If YES → Continue to Check 2
```

**Check 2:** Is Desmos loaded?
```
Open console (F12)
Type: window.Desmos
Should see: Object with GraphingCalculator function
If undefined → Reload page and wait
```

**Check 3:** Any errors in console?
```
F12 → Console tab
Look for red errors
If "context invalidated" → Refresh page!
If "not a function" → Reload extension + refresh page
```

---

## ✅ **Success Indicators**

You know everything is working when:

1. ✅ **No "context invalidated" errors**
2. ✅ **Console shows "Desmos API confirmed available"**
3. ✅ **Graph appears within 2-3 seconds**
4. ✅ **Graph STAYS visible**
5. ✅ **Can zoom with mouse wheel**
6. ✅ **Can pan by dragging**
7. ✅ **No errors in console**

---

## 🎉 **Final Test**

To confirm everything works:

### **Test 1: Simple Graph**
```
1. Fresh tab → wikipedia.org
2. Type: y = x^2
3. Select it
4. Click "Graph Equation"
5. See parabola
6. Zoom in/out
7. SUCCESS! ✅
```

### **Test 2: Complex Graph**
```
1. Select: x^2 + y^2 = 25
2. Click "Graph Equation"  
3. See circle
4. Pan around
5. SUCCESS! ✅
```

### **Test 3: Multiple Equations**
```
1. Select: y=x^2; y=2x+1
2. Click "Graph Equation"
3. See both curves
4. Different colors
5. SUCCESS! ✅
```

---

## 🆘 **Still Having Issues?**

If you followed ALL steps and still see errors:

1. **Complete Clean Restart:**
   ```
   - Close Chrome completely
   - Reopen Chrome
   - Go to chrome://extensions/
   - Reload extension
   - Open ONE new tab
   - Test there
   ```

2. **Check Build:**
   ```
   - Delete dist/ folder
   - Run: npm run build
   - Check for errors
   - Reload extension
   - Refresh pages
   ```

3. **Verify Files:**
   ```
   - Check dist/ui.js exists
   - Check dist/content.js exists
   - Check dist/background.js exists
   - All should be recent timestamps
   ```

---

## 📝 **Quick Reference**

**When you see this error:**
```
"Extension context invalidated"
```

**Do this:**
```
1. Go to the tab showing the error
2. Press Ctrl+Shift+R (hard refresh)
3. Try again
```

**When you see this error:**
```
"Desmos.GraphingCalculator is not a function"
```

**Do this:**
```
1. Reload extension (chrome://extensions/)
2. Refresh ALL open pages
3. Try on a fresh new tab
```

---

## 🎊 **Summary**

**The Fix:**
- ✅ Better Desmos API loading
- ✅ Proper script existence checking
- ✅ Retry logic for API availability
- ✅ User-friendly error messages
- ✅ Alert when page needs refresh

**What You Need to Do:**
1. Reload extension
2. **REFRESH ALL OPEN PAGES** (most important!)
3. Test on fresh tab

**Result:**
- No more "context invalidated" errors
- No more "not a function" errors
- Stable, working graphs! 🎉

---

**Happy Graphing!** 📊✨

*Remember: Always refresh pages after reloading the extension!*

