```markdown
# 🚀 ShiftLayout v4.3.1

**ShiftLayout** is a high-speed engine that allows you to build Android app screens using the HTML and CSS you already know. It "shifts" your web code into production-ready Android XML (`ConstraintLayout`) instantly.

---

## 💻 Quick Start

### 1. Installation
Run this in your project folder to install the required dependency:
```bash
npm install cheerio

```

### 2. Basic Example

Create a file named `test.js` and paste this code to see it in action:

```javascript
const ShiftLayout = require('./ShiftLayout.js');
const sculptor = new ShiftLayout();

const html = `
<div id="register_card" style="vertical-align: center; background-color: white; padding: 20px; width: 100%;">
    <h1 style="color: black; font-size: 24px;">Register</h1>
    <input type="text" id="username" placeholder="Username" style="margin: 10px; background-color: yellow;">
    <input type="text" id="email" placeholder="Email" style="margin: 10px; background-color: yellow;">
    <button style="background-color: blue; color: white;">Submit</button>
</div>
`;

console.log(sculptor.convert(html));

```

---

## 📘 Beginner Styling Guide (Noob Friendly)

Since Android handles layouts differently than a web browser, use these specific **"Magic Keywords"** in your style tags.

### 📍 Positioning (Where it goes)

| If you want to... | Use this CSS | What it does |
| --- | --- | --- |
| **Center in the middle** | `vertical-align: center;` | Pulls the item to the exact center of the phone screen. |
| **Stick to the bottom** | `position: absolute; bottom: 0;` | Anchors the item to the very bottom (like a footer). |
| **Stick to the top** | `top: 0;` | (Default) Stays at the top of the screen. |
| **Fill the width** | `width: 100%;` | Stretches the box to touch both sides of the screen. |

### 📏 Space & Size

* **`padding: 10px;`**: Adds space **inside** the box (makes buttons or cards look better).
* **`margin: 10px;`**: Adds space **outside** the box (pushes other items away).
* **`font-size: 20px;`**: Changes text size. ShiftLayout automatically converts this to `sp` for Android.

### 🎨 Colors

* **Supported Names**: `white`, `black`, `blue`, `red`, `green`, `yellow`, `gray`.
* **Custom Hex**: Use codes like `#FF5733` for custom branding.

---

## 🏷️ Tag Cheat Sheet

| HTML Tag | Android View | Best Use Case |
| --- | --- | --- |
| `<div>` | `LinearLayout` | Use this to wrap a group of items (Containers). |
| `<h1>` | `TextView` | Use for bold titles. |
| `<p>` | `TextView` | Use for normal text and descriptions. |
| `<input>` | `EditText` | Use for fields where users type. |
| `<button>` | `MaterialButton` | Use for clickable actions. |

---

## ⚠️ Important Tips

1. **The Wrapper Rule**: Always wrap your inputs and buttons inside a `<div>`. This keeps them grouped together on the screen.
2. **Unique IDs**: Using `id="username"` helps you find that specific box later when you are writing your app's logic in Java or Kotlin.
3. **Vertical Stacking**: Everything inside a `div` will stack on top of each other automatically.

---

<details>
<summary>🛠️ <b>Advanced Configuration (Click to expand)</b></summary>

You can customize the project when you start it:

```javascript
const sculptor = new ShiftLayout({
    prefix: 'app',          // Changes default IDs from sl_0 to app_0
    defaultPadding: '20dp'  // Changes the gap around the edges of the screen
});

```

</details>

---
